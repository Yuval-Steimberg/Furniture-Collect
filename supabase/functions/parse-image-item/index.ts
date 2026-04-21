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
  estimated_weight_kg: number;
  condition: "as_new" | "good" | "needs_repair" | "scrap_only";
  ai_confidence: number;
  detected_labels: string[];
}

const VISION_PROMPT = `אתה מומחה תיעוד פריטים עבור "Just A Second" — ארגון
ישראלי לפינוי דירות ושימוש חוזר ברהיטים.

בהינתן תמונה של פריט ביתי יחיד, החזר אובייקט JSON לפי הסכמה. כללים:

1. description: תיאור קצר בעברית (פחות מ-60 תווים). כולל חומר וצבע עיקריים אם
   נראים בבירור. דוגמה: "ספה תלת-מושבית, בד אפור".
2. quantity: 1, אלא אם התמונה מראה בבירור כמה פריטים זהים.
3. location: הסק מהרקע (סלון / מטבח / חדר שינה / מרפסת / שירותים). מחרוזת ריקה
   אם לא ברור.
4. intended_for_collection: true אם הפריט במצב שמאפשר שימוש חוזר. false אם
   שבור חמור / לא בטוח.
5. item_type: furniture / appliance / textile / small_item / other.
6. material_category: glass / aluminum / wood / plastic / metal / textile /
   electrical / other — החומר הדומיננטי.
7. estimated_weight_kg: מספר שלם. השתמש בממוצעים סבירים: ספה ~45, כיסא אוכל ~6,
   מזרן ~25, מקרר ~70, מנורת שולחן ~2, שולחן אוכל ~35, ארון בגדים ~50.
8. condition: as_new / good / needs_repair / scrap_only — לפי בלאי, נזק,
   כתמים, בעיות מבניות שנראים בתמונה.
9. ai_confidence: בין 0.0 ל-1.0 — עד כמה אתה בטוח בתיאור הכולל.
10. detected_labels: רשימה באנגלית של 3–5 תוויות עצם/חומר שזוהו.

החזר JSON בלבד, ללא טקסט נלווה, ללא markdown.`;

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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return jsonError(500, "LOVABLE_API_KEY not configured on the edge function");
    }

    const userPromptParts: Array<Record<string, unknown>> = [
      { type: "text", text: VISION_PROMPT + (hint ? `\n\nרמז מהמשתמש: ${hint}` : "") },
      {
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${image_base64}` },
      },
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
        // Gateway supports JSON-mode / structured output — ask for JSON only.
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
    const rawContent: string = aiJson?.choices?.[0]?.message?.content ?? "";
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
