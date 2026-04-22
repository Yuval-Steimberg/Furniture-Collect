// =========================================================================
// ai-assistant — Claude as a Hebrew-speaking JAS assistant with full
// context of the caller's data. Takes a conversation history + a context
// snapshot (current project, apartment, items) and returns the next
// assistant message.
//
// The assistant can answer questions, draft Hebrew WhatsApp / email
// messages to customers, generate Yad2 listings for items, summarize
// an apartment, rank items for pickup, or just chat about the data.
// =========================================================================
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Msg { role: "user" | "assistant"; content: string }

const SYSTEM_PROMPT = `אתה עוזר AI עבור Just A Second (ג'אסט א סקונד), ארגון ישראלי לפינוי דירות ושימוש חוזר ברהיטים. המטרה שלך: להקל על נועה ברנט והצוות שלה לתעד, לנהל ולמכור מחדש רהיטים שנאספים מדירות שמתפנות.

אתה מקבל תמיד הקשר מובנה של הנתונים של המשתמש (פרויקטים, דירות, פריטים) בהתחלה של השיחה. תשתמש בהקשר כדי לתת תשובות ספציפיות וקונקרטיות — לא כלליות.

היכולות שלך:
1. לענות על שאלות על הנתונים ("כמה פריטים במצב טוב יש בפרויקט X?")
2. לחשב ולנתח ("מה שווי המכירה המוערך של כל רהיטי העץ?")
3. לנסח הודעות ללקוחות (WhatsApp, אימייל) על סיום פרויקט, עדכוני סטטוס, תודות
4. לייצר מודעות Yad2 מוכנות למכירה — כולל כותרת, תיאור, מחיר, טיפים לצילום
5. לחבר סיכום של דירה ("בדירה של 3 חדרים נאספו 15 פריטים במשקל כולל 340 ק"ג...")
6. להמליץ על סדר איסוף (אילו פריטים כדאי לקחת קודם בהתחשב בשווי המכירה והמשקל)
7. לזהות פריטים שאולי חסרים (לדוגמה: "תיעדת שולחן אוכל אבל לא 4 כיסאות — בדקת?")
8. להציע שיפורים בתהליך התיעוד

כללים לתשובות:
- ענה תמיד בעברית, קצר וישיר
- השתמש בנתונים שבהקשר — ציין מספרים, שמות פרויקטים, דירות
- אם אין מידע מספיק בהקשר, אמור את זה בבירור
- פורמט Markdown קצר (כותרות, רשימות) כשזה עוזר לקריאות
- אם המשתמש מבקש פעולה שדורשת שינוי נתונים, הסבר לו בדיוק מה לעשות באפליקציה (אתה לא יכול לשנות ישירות)
- למודעות Yad2 — השתמש בטון עברי טבעי, לא תרגום מאנגלית
- להודעות ללקוחות — קליל, מקצועי, מציין את ההישג בצורה מובילה

אתה הכלי שהופך את האפליקציה מ"תיעוד נתונים" ל"יועץ עסקי חכם". קדימה, תעזור.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { messages, context } = body as { messages: Msg[]; context: unknown };
    if (!Array.isArray(messages) || messages.length === 0) return err(400, "messages required");

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) return err(500, "ANTHROPIC_API_KEY not configured");

    // Attach the context snapshot as the first user turn (Claude prefers
    // factual grounding this way). Keeps the conversation flow natural.
    const contextBlock = context
      ? `להלן תמונת מצב של הנתונים שלך כרגע (JSON):\n\`\`\`json\n${JSON.stringify(context, null, 2)}\n\`\`\`\n\nעכשיו התחל לענות לשאלה / בקשה הבאה.`
      : "";

    const fullMessages: Msg[] = contextBlock
      ? [{ role: "user" as const, content: contextBlock }, { role: "assistant" as const, content: "הבנתי את ההקשר. שלח את השאלה." }, ...messages]
      : messages;

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
        system: SYSTEM_PROMPT,
        messages: fullMessages,
      }),
    });
    if (!r.ok) return err(502, `Anthropic ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    const reply = j?.content?.find((c: { type: string }) => c.type === "text")?.text ?? "";

    return new Response(JSON.stringify({
      reply,
      usage: j?.usage ?? null,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("ai-assistant crashed:", e);
    return err(500, e instanceof Error ? e.message : "unknown");
  }

  function err(status: number, message: string): Response {
    return new Response(JSON.stringify({ error: message }), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
