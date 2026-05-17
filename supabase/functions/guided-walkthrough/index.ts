// =========================================================================
// guided-walkthrough — stateful conversational apartment-documentation
// assistant. Claude walks the worker room by room, asking what's there,
// collecting structured items, and moving on.
//
// The client maintains the conversation history (messages[]) and sends
// it back each turn along with any accumulated items. Claude returns
// the next Hebrew prompt, any NEW items to add to the pending list,
// the current room, and a state flag.
// =========================================================================
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Msg { role: "user" | "assistant"; content: string }

const SYSTEM_PROMPT = `אתה עוזר קולי לתיעוד פריטי דירה שמתפנה, בשירות של Just A Second.

המטרה שלך: להדריך את העובד בקול חדר-אחרי-חדר, לאסוף פריטים בעברית, ולעבור הלאה כשמסיימים.

תהליך מומלץ:
1. פתיחה: "היי. בוא נתעד את הדירה חדר אחרי חדר. באיזה חדר אתה מתחיל?" (אם זה הראשון)
2. בחדר: "בסדר, מה יש בסלון?" / "ספר לי מה אני רואה בחדר"
3. אחרי שהעובד מתאר פריטים — אשר קצרות ושאל: "עוד משהו בחדר הזה? או לעבור?"
4. מעבר לחדר הבא: "מעולה, מה בחדר הבא? מטבח? חדר שינה?"
5. סיום: כשהעובד אומר שסיים — סכם כמה פריטים נאספו וסיים.

חדרים טיפוסיים בדירה ישראלית: סלון, מטבח, חדר שינה הורים, חדר ילדים, מרפסת, שירותים, חדר ממ"ד, חדר רחצה, חדר עבודה.

חוקים לתשובות שלך:
- תמיד החזר JSON תקין בלבד, ללא markdown, ללא טקסט נלווה
- קצר וקולי — משפטים שנשמעים טבעיים כשמקריאים אותם
- ענה בעברית
- תחלץ פריטים מכל הודעה של המשתמש — גם אם הוא מזכיר דברים תוך כדי
- אל תמציא פריטים שלא הוזכרו
- אם הוא אומר "לא לקחת" על פריט — intended_for_collection: false

פורמט התשובה:
{
  "reply": "<המשפט שתגיד לעובד הבא — קצר, טבעי>",
  "state": "asking_room" | "collecting" | "transitioning" | "done",
  "current_room": "<שם החדר הנוכחי או ריק>",
  "new_items": [
    {
      "description": "<קצר, בעברית>",
      "quantity": <מספר, ברירת מחדל 1>,
      "location": "<החדר, מתוך current_room אם לא צוין אחרת>",
      "intended_for_collection": <true/false>,
      "item_type": "furniture|appliance|textile|small_item|other",
      "material_category": "glass|aluminum|wood|plastic|metal|textile|electrical|other",
      "item_category": "closest from: שידות|מדפים|שולחן אוכל|שולחן קפה|כורסא|ספה|שרפרפים|כיסאות|ארון ויטרינה|דלתות ארון|דלת תריס|ברזים|כיורים|גופי תאורה|ידיות|מגירות|מתלים|חומרי ניקוי|כלים|מראות|תמונות|שונות|אופניים|מזגנים|חלונות אלומיניום",
      "estimated_weight_kg": <מספר>,
      "condition": "as_new|good|needs_repair|scrap_only"
    }
  ],
  "quick_replies": ["<כפתור 1>", "<כפתור 2>"]
}

quick_replies הם 2-4 כפתורי תשובה מהירים שהמשתמש יכול ללחוץ עליהם במקום לענות בקול — לדוגמה אחרי "עוד משהו בחדר?" תציע ["כן, יש עוד", "לא, בוא נמשיך", "מטבח הבא"]. בשלב הפתיחה הצע שמות חדרים.

state="done" רק כשהעובד אומר שסיים לגמרי את כל הדירה.

החזר JSON בלבד.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { messages, context } = body as {
      messages: Msg[];
      context?: { apartment?: any; items_so_far?: any[] };
    };
    if (!Array.isArray(messages)) return err(400, "messages required");

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) return err(500, "ANTHROPIC_API_KEY not configured");

    // Seed with a context turn so Claude grounds its answers
    const contextBlock = `הקשר נוכחי:
- דירה: ${context?.apartment?.building_number ? `בניין ${context.apartment.building_number} דירה ${context.apartment.apartment_number}` : "לא צוין"}
- פריטים שכבר נאספו בשיחה: ${context?.items_so_far?.length ?? 0}
${context?.items_so_far && context.items_so_far.length > 0
  ? `פירוט: ${JSON.stringify(context.items_so_far.map((i: any) => `${i.description} (${i.location ?? 'ללא מיקום'})`))}`
  : ''}`;

    const fullMessages: Msg[] = [
      { role: "user", content: contextBlock },
      { role: "assistant", content: '{"reply":"הבנתי את ההקשר, מחכה להודעה הראשונה."}' },
      ...messages,
    ];

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1200,
        system: SYSTEM_PROMPT,
        messages: fullMessages,
      }),
    });
    if (!r.ok) return err(502, `Anthropic ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    const raw = j?.content?.find((c: { type: string }) => c.type === "text")?.text ?? "";

    // Strip any stray markdown fences Claude occasionally adds
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

    let parsed: any;
    try { parsed = JSON.parse(cleaned); }
    catch { return err(502, `invalid JSON from model: ${cleaned.slice(0, 200)}`); }

    return new Response(
      JSON.stringify({
        reply: String(parsed.reply ?? ""),
        state: parsed.state ?? "collecting",
        current_room: String(parsed.current_room ?? ""),
        new_items: Array.isArray(parsed.new_items) ? parsed.new_items : [],
        quick_replies: Array.isArray(parsed.quick_replies) ? parsed.quick_replies.map(String) : [],
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("guided-walkthrough crashed:", e);
    return err(500, e instanceof Error ? e.message : "unknown");
  }

  function err(status: number, message: string): Response {
    return new Response(JSON.stringify({ error: message }), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
