// =========================================================================
// parse-room-image — one photo of a whole room, many structured items.
//
// Shape is nearly identical to parse-image-item but the model returns a
// JSON ARRAY: { items: [ {description, quantity, ...}, ... ] }.
// Typical use: worker walks into a room, takes one wide shot, Claude
// returns 6-12 items at once, worker confirms in a batch modal.
// =========================================================================
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Terse multi-item prompt. Quantity-collapse rule kept explicit since it's
// the most common failure mode.
const ROOM_PROMPT = `חדר שלם. זהה רהיטים, מכשירים, טקסטיל, פריטים קטנים משמעותיים. דלג על זוטות (כוסות, עטים).
החזר {"items":[...]}  — לא markdown. כל פריט:
description(עברית), quantity(int; 4 כיסאות זהים = פריט אחד qty:4), location(סלון/מטבח/חדר שינה/מרפסת/שירותים or ""), intended_for_collection(bool), item_type(furniture|appliance|textile|small_item|other), material_category(glass|aluminum|wood|plastic|metal|textile|electrical|other), estimated_weight_kg(int), condition(as_new|good|needs_repair|scrap_only), ai_confidence(0..1), detected_labels([3-5 English]).`;

const ITEM_TYPES = new Set(["furniture", "appliance", "textile", "small_item", "other"]);
const MATERIALS  = new Set(["glass", "aluminum", "wood", "plastic", "metal", "textile", "electrical", "other"]);
const CONDITIONS = new Set(["as_new", "good", "needs_repair", "scrap_only"]);

function normalise(raw: Record<string, unknown>): Record<string, unknown> {
  const qty = Number(raw.quantity);
  const w   = Number(raw.estimated_weight_kg);
  const c   = Number(raw.ai_confidence);
  return {
    description: String(raw.description ?? "פריט").slice(0, 200),
    quantity: Number.isFinite(qty) && qty > 0 ? Math.round(qty) : 1,
    location: String(raw.location ?? "").slice(0, 60),
    intended_for_collection: raw.intended_for_collection !== false,
    item_type: ITEM_TYPES.has(raw.item_type as string) ? raw.item_type : "other",
    material_category: MATERIALS.has(raw.material_category as string) ? raw.material_category : "other",
    estimated_weight_kg: Number.isFinite(w) && w > 0 ? Math.round(w) : 5,
    condition: CONDITIONS.has(raw.condition as string) ? raw.condition : "good",
    ai_confidence: Number.isFinite(c) ? Math.max(0, Math.min(1, c)) : 0.5,
    detected_labels: Array.isArray(raw.detected_labels)
      ? raw.detected_labels.slice(0, 10).map(String) : [],
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const start = Date.now();

  try {
    const { image_base64, apartment_id, hint } = await req.json();
    if (!image_base64) return err(400, "image_base64 required");
    if (!apartment_id) return err(400, "apartment_id required");
    if (image_base64.length > 14 * 1024 * 1024) return err(413, "image too large");

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) return err(500, "ANTHROPIC_API_KEY not configured");

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // Room detection needs Sonnet's stronger multi-item grounding,
        // but output fits comfortably in 1500 tokens for a typical room.
        model: "claude-sonnet-4-5",
        max_tokens: 1500,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image_base64 } },
            { type: "text", text: ROOM_PROMPT + (hint ? `\n\nרמז: ${hint}` : "") },
          ],
        }],
      }),
    });
    if (!r.ok) return err(502, `Anthropic ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    const raw = j?.content?.find((c: { type: string }) => c.type === "text")?.text ?? "";

    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    let parsed: { items?: unknown[] };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Some responses may come as a bare array; wrap it.
      const asArray = cleaned.match(/\[[\s\S]*\]/);
      if (asArray) parsed = { items: JSON.parse(asArray[0]) as unknown[] };
      else return err(502, "could not parse AI response");
    }

    const items = (parsed.items ?? []).map((it) => normalise(it as Record<string, unknown>));
    return new Response(
      JSON.stringify({ items, processing_time_ms: Date.now() - start }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("parse-room-image crashed:", e);
    return err(500, e instanceof Error ? e.message : "unknown error");
  }

  function err(status: number, message: string): Response {
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
