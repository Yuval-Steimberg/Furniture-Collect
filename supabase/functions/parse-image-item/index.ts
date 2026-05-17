// =========================================================================
// parse-image-item — vision autofill for the evacuation inventory app
//
// Accepts a JPEG image (base64) of a single household item. Returns a
// structured Hebrew item description ready to insert into the `items`
// table: description, qty, location, type, material, weight, condition,
// confidence, detected labels.
//
// Mirrors the shape of parse-voice-items / parse-text-items so the client
// integration is familiar.
//
// Model: Claude Sonnet 4.5 via the Lovable AI Gateway. Chosen over
// Gemini Flash Lite (used for text parsing) because vision grounding
// matters a lot more here than throughput.
// =========================================================================

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ParsedImageItem {
  description: string;
  quantity: number;
  location: string;
  intended_for_collection: boolean;
  item_type: "furniture" | "appliance" | "textile" | "small_item" | "other";
  material_category: "glass" | "aluminum" | "wood" | "plastic" | "metal" | "textile" | "electrical" | "other";
  item_category: string;
  estimated_weight_kg: number;
  condition: "as_new" | "good" | "needs_repair" | "scrap_only";
  ai_confidence: number;
  detected_labels: string[];
}

// Token-minimal prompt. Field semantics encoded in the enum lists and
// the single weight example line; Claude infers the rest.
const ITEM_CATEGORY_LIST = "שידות|מדפים|שולחן אוכל|שולחן קפה|כורסא|ספה|שרפרפים|כיסאות|ארון ויטרינה|דלתות ארון|דלת תריס|ברזים|כיורים|גופי תאורה|ידיות|מגירות|מתלים|חומרי ניקוי|כלים|מראות|תמונות|שונות|אופניים|מזגנים|חלונות אלומיניום";
const VISION_PROMPT = `פריט ביתי אחד. החזר JSON (Hebrew descriptions, no markdown):
description(<60ch), quantity, location(סלון/מטבח/חדר שינה/מרפסת/שירותים or ""), intended_for_collection(bool; false=broken/unsafe), item_type(furniture|appliance|textile|small_item|other), material_category(glass|aluminum|wood|plastic|metal|textile|electrical|other), item_category(closest match from: ${ITEM_CATEGORY_LIST}), estimated_weight_kg(int; ספה~45 כיסא~6 שידה~30 מדף~15 שולחן אוכל~40 שולחן קפה~15 כורסא~25 שרפרף~5 ארון~60 מזגן~25 אופניים~15 מראה~10 כיור~15 גוף תאורה~3), condition(as_new|good|needs_repair|scrap_only), ai_confidence(0..1), detected_labels([3-5 English tags]).`;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const start = Date.now();

  try {
    const body = await req.json();
    const { image_base64, apartment_id, hint } = body as {
      image_base64?: string;
      apartment_id?: string;
      hint?: string;
    };

    if (!image_base64 || typeof image_base64 !== "string") {
      return jsonError(400, "image_base64 is required");
    }
    if (!apartment_id || typeof apartment_id !== "string") {
      return jsonError(400, "apartment_id is required");
    }

    // Payload cap — 10MB raw JPEG = ~13.4MB base64. Reject before hitting AI.
    if (image_base64.length > 14 * 1024 * 1024) {
      return jsonError(413, "image too large; max 10MB JPEG");
    }

    // Prefer a direct Anthropic key; fall back to the Lovable gateway key for
    // backwards compatibility with older deployments.
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    const LOVABLE_API_KEY   = Deno.env.get("LOVABLE_API_KEY");
    if (!ANTHROPIC_API_KEY && !LOVABLE_API_KEY) {
      return jsonError(500, "ANTHROPIC_API_KEY (or LOVABLE_API_KEY) not configured on the edge function");
    }

    const promptText = VISION_PROMPT + (hint ? `\n\nרמז מהמשתמש: ${hint}` : "");

    // Native Anthropic Messages API is preferred. It handles vision natively
    // and returns a stable { content: [{ type: "text", text }] } shape.
    let rawContent = "";
    if (ANTHROPIC_API_KEY) {
      const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          // Haiku is plenty accurate for furniture recognition on a single
          // photo and costs ~1/4 of Sonnet per call.
          model: "claude-haiku-4-5",
          max_tokens: 350,
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image_base64 } },
              { type: "text", text: promptText },
            ],
          }],
        }),
      });
      if (!aiResponse.ok) {
        const errText = await aiResponse.text();
        console.error("Anthropic error:", aiResponse.status, errText);
        return jsonError(502, `Anthropic API failed: ${aiResponse.status}`);
      }
      const aiJson = await aiResponse.json();
      rawContent = aiJson?.content?.find((c: { type: string }) => c.type === "text")?.text ?? "";
    } else {
      // Fallback: OpenAI-compatible Lovable gateway shape.
      const userPromptParts: Array<Record<string, unknown>> = [
        { type: "text", text: promptText },
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image_base64}` } },
      ];
      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "anthropic/claude-sonnet-4.5",
          messages: [{ role: "user", content: userPromptParts }],
          response_format: { type: "json_object" },
          max_tokens: 600,
        }),
      });
      if (!aiResponse.ok) {
        const errText = await aiResponse.text();
        console.error("AI gateway error:", aiResponse.status, errText);
        return jsonError(502, `AI gateway failed: ${aiResponse.status}`);
      }
      const aiJson = await aiResponse.json();
      rawContent = aiJson?.choices?.[0]?.message?.content ?? "";
    }

    if (!rawContent) {
      return jsonError(502, "empty response from vision model");
    }

    // Tolerate models that occasionally wrap in ```json ... ``` despite the
    // response_format hint.
    const cleaned = rawContent
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();

    let item: ParsedImageItem;
    try {
      item = JSON.parse(cleaned);
    } catch (_e) {
      console.error("JSON parse failed. raw:", rawContent);
      return jsonError(502, "could not parse AI output as JSON");
    }

    // Defensive normalisation — the model occasionally drifts outside the
    // enum. Coerce to safe defaults rather than failing the user's action.
    const safe = normalise(item);

    const elapsed = Date.now() - start;
    console.log(`parse-image-item ok in ${elapsed}ms · conf=${safe.ai_confidence}`);

    return new Response(
      JSON.stringify({ item: safe, processing_time_ms: elapsed }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("parse-image-item crashed:", err);
    return jsonError(500, err instanceof Error ? err.message : "unknown error");
  }
});

// ---------------------------------------------------------------------------

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const ITEM_TYPES = new Set(["furniture", "appliance", "textile", "small_item", "other"]);
const MATERIALS  = new Set(["glass", "aluminum", "wood", "plastic", "metal", "textile", "electrical", "other"]);
const CONDITIONS = new Set(["as_new", "good", "needs_repair", "scrap_only"]);

function normalise(raw: Partial<ParsedImageItem>): ParsedImageItem {
  const quantity = Number.isFinite(raw.quantity) && (raw.quantity as number) > 0
    ? Math.round(raw.quantity as number) : 1;

  return {
    description: (raw.description ?? "פריט").toString().slice(0, 200),
    quantity,
    location: (raw.location ?? "").toString().slice(0, 60),
    intended_for_collection: raw.intended_for_collection !== false, // default true
    item_type: (ITEM_TYPES.has(raw.item_type as string) ? raw.item_type : "other") as ParsedImageItem["item_type"],
    material_category: (MATERIALS.has(raw.material_category as string) ? raw.material_category : "other") as ParsedImageItem["material_category"],
    estimated_weight_kg: Number.isFinite(raw.estimated_weight_kg) && (raw.estimated_weight_kg as number) > 0
      ? Math.round(raw.estimated_weight_kg as number) : 5,
    condition: (CONDITIONS.has(raw.condition as string) ? raw.condition : "good") as ParsedImageItem["condition"],
    ai_confidence: clamp01(Number(raw.ai_confidence ?? 0.5)),
    detected_labels: Array.isArray(raw.detected_labels)
      ? raw.detected_labels.slice(0, 10).map(String)
      : [],
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}
