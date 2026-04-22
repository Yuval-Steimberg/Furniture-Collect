// =========================================================================
// estimate-resale-value — Claude prices a second-hand item in ILS.
//
// Input: { description, item_type, material_category, condition, quantity,
//          estimated_weight_kg, image_url?, hint? }
// Output: { estimated_resale_ils, rationale, price_range: [low, high] }
// =========================================================================
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROMPT = (item: Record<string, unknown>) => `אתה מומחה תמחור יד-שנייה בישראל עבור "Just A Second" — ארגון פינוי דירות
ושימוש חוזר ברהיטים. אתה מכיר את השוק הישראלי (יד2, Facebook Marketplace,
חנויות יד-שנייה) ומעריך שוויים ראליסטיים בשקלים חדשים (ILS).

פריט:
${JSON.stringify(item, null, 2)}

החזר אובייקט JSON בלבד:
{
  "estimated_resale_ils": <מספר שלם, הערכת שווי ממוצעת ריאליסטית במכירה ישירה לצרכן בישראל>,
  "price_range": [<לו>, <גבוה>],
  "rationale": "<משפט אחד בעברית המסביר את ההערכה>",
  "confidence": <0.0..1.0>
}

הנחיות:
- פריטים שבורים / scrap_only: 0.
- רהיטים בסיסיים במצב טוב: 150-800 ₪ בדרך כלל.
- מכשירי חשמל גדולים במצב עובד (מקרר, מכונת כביסה): 400-1500 ₪.
- רהיטי עיצוב / מותג / עץ מלא במצב מצוין: 1000-4000 ₪.
- פריט שלא שווה לקחת ליד-שנייה: 0.
- התחשב במצב (as_new / good / needs_repair / scrap_only), משקל, חומר,
  וכמות (יחידה * כמות).

החזר JSON תקין בלבד, ללא markdown.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) return errResp(500, "ANTHROPIC_API_KEY not configured");

    // Strip heavy fields before sending to Claude
    const compact: Record<string, unknown> = {
      description: body.description,
      item_type: body.item_type,
      material_category: body.material_category,
      condition: body.condition,
      quantity: body.quantity ?? 1,
      estimated_weight_kg: body.estimated_weight_kg,
    };

    // If image URL provided, include it in the prompt (Claude supports URL)
    const content: unknown[] = [];
    if (typeof body.image_url === "string" && body.image_url.startsWith("http")) {
      content.push({ type: "image", source: { type: "url", url: body.image_url } });
    }
    content.push({ type: "text", text: PROMPT(compact) });

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 400,
        messages: [{ role: "user", content }],
      }),
    });
    if (!r.ok) return errResp(502, `Anthropic ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    const raw = j?.content?.find((c: { type: string }) => c.type === "text")?.text ?? "";
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

    let out: Record<string, unknown>;
    try { out = JSON.parse(cleaned); } catch { return errResp(502, "invalid JSON from model"); }

    const val = Number(out.estimated_resale_ils);
    const lo  = Array.isArray(out.price_range) ? Number(out.price_range[0]) : null;
    const hi  = Array.isArray(out.price_range) ? Number(out.price_range[1]) : null;
    const conf = Number(out.confidence);

    return new Response(
      JSON.stringify({
        estimated_resale_ils: Number.isFinite(val) && val >= 0 ? Math.round(val) : 0,
        price_range: [
          Number.isFinite(lo as number) ? Math.max(0, Math.round(lo!)) : 0,
          Number.isFinite(hi as number) ? Math.max(0, Math.round(hi!)) : 0,
        ],
        rationale: String(out.rationale ?? "").slice(0, 300),
        confidence: Number.isFinite(conf) ? Math.max(0, Math.min(1, conf)) : 0.5,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("estimate-resale-value crashed:", e);
    return errResp(500, e instanceof Error ? e.message : "unknown");
  }

  function errResp(status: number, message: string): Response {
    return new Response(JSON.stringify({ error: message }), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
