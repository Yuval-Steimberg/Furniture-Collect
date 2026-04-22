// =========================================================================
// check-duplicate-item — ask Claude if a new item likely duplicates one
// of the recent items in the same apartment.
//
// Input: { candidate: {description, location, item_type, material_category},
//          recent:    [{id, description, location, item_type, material_category, created_at}] }
// Output: { is_duplicate: boolean, duplicate_of: "<id>"|null, reason: string, confidence: 0..1 }
// =========================================================================
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROMPT = (candidate: unknown, recent: unknown[]) => `אתה עוזר להימנע מכפילויות בתיעוד פריטי דירה.

פריט חדש שהוזן זה עתה:
${JSON.stringify(candidate, null, 2)}

פריטים אחרונים באותה דירה (עד 20):
${JSON.stringify(recent, null, 2)}

קבע האם הפריט החדש הוא כנראה כפילות של אחד מהפריטים הקיימים.
- התעלם מהבדלי ניסוח זניחים ("ספה אפורה" ≈ "ספה בצבע אפור")
- אותו מיקום + אותו סוג + תיאור דומה → כנראה כפילות
- מיקומים שונים בבירור → לא כפילות
- רהיטים זהים באמת יכולים להיות 2 פריטים נפרדים (למשל שני ארונות)

החזר JSON בלבד:
{
  "is_duplicate": <true|false>,
  "duplicate_of": "<id של הפריט הקיים או null>",
  "reason": "<משפט קצר בעברית>",
  "confidence": <0.0..1.0>
}`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { candidate, recent } = await req.json();
    if (!candidate) return err(400, "candidate required");
    if (!Array.isArray(recent)) return err(400, "recent must be array");
    if (recent.length === 0) {
      return new Response(JSON.stringify({ is_duplicate: false, duplicate_of: null, reason: "", confidence: 1 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

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
        model: "claude-sonnet-4-5",
        max_tokens: 300,
        messages: [{ role: "user", content: PROMPT(candidate, recent.slice(0, 20)) }],
      }),
    });
    if (!r.ok) return err(502, `Anthropic ${r.status}`);
    const j = await r.json();
    const raw = j?.content?.find((c: { type: string }) => c.type === "text")?.text ?? "";
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

    let out: Record<string, unknown>;
    try { out = JSON.parse(cleaned); } catch { return err(502, "invalid JSON from model"); }

    return new Response(JSON.stringify({
      is_duplicate: Boolean(out.is_duplicate),
      duplicate_of: typeof out.duplicate_of === "string" ? out.duplicate_of : null,
      reason: String(out.reason ?? "").slice(0, 200),
      confidence: Number(out.confidence) || 0.5,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("check-duplicate-item crashed:", e);
    return err(500, e instanceof Error ? e.message : "unknown");
  }

  function err(status: number, message: string): Response {
    return new Response(JSON.stringify({ error: message }), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
