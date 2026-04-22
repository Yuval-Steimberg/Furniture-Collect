// =========================================================================
// smart-search — natural-language filter over a list of items.
//
// The client sends the full (lightweight) items array and the user's
// Hebrew question; Claude returns just the matching item ids + a short
// Hebrew explanation. Much more flexible than hand-built filters.
//
// Input: { query: "ריהוט עץ במצב טוב בבניין 3",
//          items: [{id, description, location, item_type, material_category,
//                   condition, estimated_weight_kg, collected, intended_for_collection,
//                   estimated_resale_ils, ...}] }
// Output: { matching_ids: [...], explanation: "הנה כל הרהיטים..." }
// =========================================================================
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROMPT = (query: string, items: unknown[]) => `אתה עוזר חיפוש חכם על פריטי תיעוד דירה. המשתמש שאל/ביקש:

"${query}"

הנה הפריטים הזמינים (JSON):
${JSON.stringify(items)}

החזר אובייקט JSON בלבד:
{
  "matching_ids": [<רשימת id-ים של פריטים שעונים על הבקשה>],
  "explanation": "<משפט קצר בעברית המסביר את התוצאה>"
}

הנחיות:
- כלול רק id-ים שבאמת מתאימים. עדיף להחזיר פחות ומדויק מאשר הרבה וחלקם לא רלוונטיים.
- אם הבקשה אינה ברורה, החזר matching_ids ריק והסבר מה חסר.
- אם הבקשה היא "כל הפריטים", החזר את כולם.
- החזר JSON תקין בלבד.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { query, items } = await req.json();
    if (!query || typeof query !== "string") return err(400, "query required");
    if (!Array.isArray(items)) return err(400, "items array required");
    if (items.length === 0) {
      return new Response(JSON.stringify({ matching_ids: [], explanation: "אין פריטים להחיפוש." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) return err(500, "ANTHROPIC_API_KEY not configured");

    // Cap item list to avoid unbounded token usage. 200 items covers most
    // single-apartment and small-project cases.
    const capped = items.slice(0, 200);

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1500,
        messages: [{ role: "user", content: PROMPT(query, capped) }],
      }),
    });
    if (!r.ok) return err(502, `Anthropic ${r.status}`);
    const j = await r.json();
    const raw = j?.content?.find((c: { type: string }) => c.type === "text")?.text ?? "";
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

    let out: Record<string, unknown>;
    try { out = JSON.parse(cleaned); } catch { return err(502, "invalid JSON from model"); }

    const ids = Array.isArray(out.matching_ids) ? out.matching_ids.map(String) : [];
    return new Response(JSON.stringify({
      matching_ids: ids,
      explanation: String(out.explanation ?? "").slice(0, 300),
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("smart-search crashed:", e);
    return err(500, e instanceof Error ? e.message : "unknown");
  }

  function err(status: number, message: string): Response {
    return new Response(JSON.stringify({ error: message }), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
