import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Mic, Camera, Images, Repeat2, Scan, Sparkles, Plus, Check, ArrowLeft,
  Building2, Package, ClipboardList, Users, BarChart3, Wifi, WifiOff,
  ChevronDown, ChevronRight, Star, Lightbulb,
} from 'lucide-react';
import { useState } from 'react';

interface Section {
  id: string;
  title: string;
  icon: React.ReactNode;
  color: string;
  content: React.ReactNode;
}

function Collapsible({ title, icon, color, children }: { title: string; icon: React.ReactNode; color: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        className="w-full text-right"
        onClick={() => setOpen(v => !v)}
      >
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color}`}>
                {icon}
              </div>
              <span>{title}</span>
            </div>
            {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </CardTitle>
        </CardHeader>
      </button>
      {open && (
        <CardContent className="pt-0 pb-4">
          {children}
        </CardContent>
      )}
    </Card>
  );
}

function ModeRow({ icon, name, tag, tagColor, when, advantage }: {
  icon: React.ReactNode; name: string; tag: string; tagColor: string;
  when: string; advantage: string;
}) {
  return (
    <div className="flex gap-3 p-3 rounded-xl border bg-muted/30">
      <div className="mt-0.5 flex-shrink-0">{icon}</div>
      <div className="flex-1">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="font-bold text-sm">{name}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${tagColor}`}>{tag}</span>
        </div>
        <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">מתי: </span>{when}</p>
        <p className="text-xs text-muted-foreground mt-0.5"><span className="font-medium text-foreground">יתרון: </span>{advantage}</p>
      </div>
    </div>
  );
}

function TipBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-900">
      <Lightbulb className="h-4 w-4 flex-shrink-0 mt-0.5 text-amber-600" />
      <span>{children}</span>
    </div>
  );
}

export default function UserGuide() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-muted" dir="rtl">
      <PageHeader
        title="מדריך למשתמש"
        subtitle="כל מה שצריך לדעת כדי לעבוד בשטח"
        onBack={() => navigate(-1)}
      />

      <main className="container mx-auto px-4 py-6 max-w-2xl space-y-4 pb-12">

        {/* Quick-start banner */}
        <Card className="bg-sidebar text-sidebar-foreground border-0">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start gap-3">
              <Star className="h-6 w-6 text-yellow-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-base mb-1">התחלה מהירה</p>
                <ol className="space-y-1 text-sm text-sidebar-foreground/80 list-none">
                  <li>1. כנסי לדירה ← בחרי פרויקט ← בחרי דירה</li>
                  <li>2. לחצי על <span className="font-bold text-sidebar-foreground">הקלט פריטים</span> ודברי בטבעיות</li>
                  <li>3. המערכת תיצור כרטיסים אוטומטית לכל פריט</li>
                  <li>4. בשלב האיסוף — החליקי שמאלה על פריט כדי לסמן ״נאסף״</li>
                </ol>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 1 — Structure */}
        <Collapsible
          title="מבנה המערכת"
          icon={<Building2 className="h-5 w-5 text-white" />}
          color="bg-sidebar"
        >
          <div className="space-y-3 text-sm">
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <Badge className="flex-shrink-0 mt-0.5">פרויקט</Badge>
                <p className="text-muted-foreground">כל בניין / פרויקט סביבתי הוא פרויקט נפרד. למשל: ״רמת גן — רחוב הרצל 12״.</p>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="secondary" className="flex-shrink-0 mt-0.5">דירה</Badge>
                <p className="text-muted-foreground">בתוך פרויקט יש דירות. לכל דירה מספר בניין + מספר דירה + סטטוס.</p>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="flex-shrink-0 mt-0.5">פריט</Badge>
                <p className="text-muted-foreground">כל רהיט / חפץ שמתועד בדירה. פריט כולל תיאור, כמות, חדר, חומר ותמונה.</p>
              </div>
            </div>
            <TipBox>ניתן לנווט בין דירות בצורה מהירה: בדף הדירה יש חצים ״הקודם / הבא״ לעבור ישירות לדירה הסמוכה.</TipBox>
          </div>
        </Collapsible>

        {/* Section 2 — Recording modes */}
        <Collapsible
          title="מצבי תיעוד הפריטים"
          icon={<Mic className="h-5 w-5 text-white" />}
          color="bg-primary"
        >
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground mb-2">בחרי את המצב שמתאים לצורת העבודה שלך. ניתן לשלב מצבים שונים באותה דירה.</p>
            <ModeRow
              icon={<Mic className="h-5 w-5 text-primary" />}
              name="הקלטה קולית"
              tag="מהיר ביותר"
              tagColor="bg-primary/10 text-primary"
              when="כשהידיים עסוקות, או כשרוצים לתעד הרבה פריטים בלי לעצור"
              advantage='מדברים בטבעיות — "שתי כורסאות עץ בסלון" — והAI מפרק לפריטים אוטומטית'
            />
            <ModeRow
              icon={<Camera className="h-5 w-5 text-sky-600" />}
              name="פריט בודד"
              tag="מדויק"
              tagColor="bg-sky-100 text-sky-700"
              when="כשרוצים לתעד פריט ספציפי עם תמונה ברורה"
              advantage="צילום אחד ← AI מזהה את הפריט ויוצר כרטיס אוטומטי עם תיאור ומשקל"
            />
            <ModeRow
              icon={<Images className="h-5 w-5" />}
              name="מגלריה (מה שצילמת)"
              tag="גמיש"
              tagColor="bg-muted text-muted-foreground"
              when="כשצילמת את הדירה מוקדם יותר ועכשיו מעלים מהגלריה"
              advantage="לא צריך להיות בדירה — אפשר לעמוד בחוץ ולהעלות את כל התמונות בבת אחת"
            />
            <ModeRow
              icon={<Repeat2 className="h-5 w-5 text-emerald-600" />}
              name="כל הדירה — בזרימה"
              tag="מהיר בשטח"
              tagColor="bg-emerald-100 text-emerald-700"
              when="כשעוברים בכל הדירה ומצלמים פריט אחרי פריט ברצף"
              advantage="המצלמה נפתחת מחדש אחרי כל פריט — ממשיכים ללא הפסקה עד שגומרים"
            />
            <ModeRow
              icon={<Scan className="h-5 w-5" />}
              name="חדר שלם — סריקה מלאה"
              tag="יעיל"
              tagColor="bg-amber-100 text-amber-700"
              when="כשנמצאים בחדר ספציפי ורוצים לתעד הכל בצילום אחד"
              advantage="AI מזהה את כל הפריטים בתמונה — מסמנים מה רלוונטי ומוחקים מה שלא"
            />
            <ModeRow
              icon={<Sparkles className="h-5 w-5 text-primary" />}
              name="בשלבים — חדר-חדר"
              tag="מקיף"
              tagColor="bg-primary/10 text-primary"
              when="כשרוצים לוודא שלא פספסו אף חדר בדירה"
              advantage="המערכת מנחה חדר אחרי חדר — פחות פספוסים, מיפוי מסודר עם הנחיה"
            />
            <ModeRow
              icon={<Plus className="h-5 w-5" />}
              name="ידנית — הקלד"
              tag="בקרה מלאה"
              tagColor="bg-muted text-muted-foreground"
              when="כשרוצים להוסיף פריט עם שם מדויק שנבחר ידנית"
              advantage="שליטה מלאה על הפרטים — שם, כמות, חדר, חומר"
            />
            <TipBox>טיפ לשטח: נכנסים לדירה, צולמים הכל מהר עם ״כל הדירה בזרימה״, יוצאים ← מעלים מהגלריה בשקט מבחוץ.</TipBox>
          </div>
        </Collapsible>

        {/* Section 3 — Collection workflow */}
        <Collapsible
          title="שלב האיסוף — סימון פריטים"
          icon={<Check className="h-5 w-5 text-white" />}
          color="bg-green-600"
        >
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">אחרי שהדירה תועדה, מגיע שלב האיסוף בפועל.</p>
            <div className="space-y-2">
              <div className="flex gap-3 p-3 rounded-xl border">
                <span className="text-lg">👈</span>
                <div>
                  <p className="font-bold">החלקה שמאלה</p>
                  <p className="text-muted-foreground">על כרטיס פריט ← מסמן אוטומטית כ"נאסף" בשמך</p>
                </div>
              </div>
              <div className="flex gap-3 p-3 rounded-xl border">
                <span className="text-lg">🔘</span>
                <div>
                  <p className="font-bold">לחיצה על "נאסף"</p>
                  <p className="text-muted-foreground">פותח חלון קטן לאישור שם האוסף — שימושי כשמישהו אחר אוסף</p>
                </div>
              </div>
              <div className="flex gap-3 p-3 rounded-xl border">
                <span className="text-lg">🔍</span>
                <div>
                  <p className="font-bold">פילטר "ממתינים לאיסוף"</p>
                  <p className="text-muted-foreground">מציג רק פריטים שמסומנים לאיסוף ועדיין לא נאספו</p>
                </div>
              </div>
            </div>
            <TipBox>כשכל הפריטים בדירה נאספו, אפשר לסמן את הדירה כ"הושלמה" מתוך תפריט הדירה.</TipBox>
          </div>
        </Collapsible>

        {/* Section 4 — Item cards */}
        <Collapsible
          title="כרטיס פריט — מה כל שדה אומר"
          icon={<Package className="h-5 w-5 text-white" />}
          color="bg-orange-500"
        >
          <div className="space-y-2 text-sm">
            {[
              { field: 'תיאור', desc: 'שם הפריט כפי שזוהה / הוקלד' },
              { field: 'כמות', desc: 'מספר יחידות של אותו פריט' },
              { field: 'חדר', desc: 'המיקום בדירה (סלון, חדר שינה...)' },
              { field: 'חומר', desc: 'Wood / Metal / Textile / Other — משפיע על חישוב משקל' },
              { field: 'קק"ג (משקל)', desc: 'אומדן משקל שחושב אוטומטית לפי סוג וכמות' },
              { field: 'לאיסוף', desc: 'הפריט יוצג בשלב האיסוף ויספר בסטטיסטיקות' },
              { field: 'נאסף', desc: 'הפריט נלקח בפועל — ניתן לרשום שם האוסף' },
              { field: 'תמונה', desc: 'ניתן להוסיף תמונה לאחר מכן, ולהוסיף הערות עליה עם עט' },
              { field: 'AI', desc: 'תג ירוק = הפריט זוהה אוטומטית על ידי בינה מלאכותית' },
            ].map(({ field, desc }) => (
              <div key={field} className="flex gap-2">
                <Badge variant="outline" className="flex-shrink-0 font-bold text-xs">{field}</Badge>
                <span className="text-muted-foreground">{desc}</span>
              </div>
            ))}
          </div>
        </Collapsible>

        {/* Section 5 — Offline */}
        <Collapsible
          title="עבודה ללא אינטרנט"
          icon={<WifiOff className="h-5 w-5 text-white" />}
          color="bg-slate-600"
        >
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">המערכת תומכת בעבודה ללא חיבור לרשת — שימושי בקומות גבוהות או אזורים ללא קליטה.</p>
            <div className="space-y-2">
              <div className="flex gap-3 p-3 rounded-xl border">
                <WifiOff className="h-4 w-4 flex-shrink-0 mt-0.5 text-slate-500" />
                <div>
                  <p className="font-bold">הקלטה ותמונות נשמרות מקומית</p>
                  <p className="text-muted-foreground">כשאין חיבור — הקלטות ותמונות נשמרות במכשיר</p>
                </div>
              </div>
              <div className="flex gap-3 p-3 rounded-xl border">
                <Wifi className="h-4 w-4 flex-shrink-0 mt-0.5 text-green-600" />
                <div>
                  <p className="font-bold">סנכרון אוטומטי בחזרה לרשת</p>
                  <p className="text-muted-foreground">כשהחיבור חוזר — הכל מסתנכרן אוטומטית, ללא צורך בפעולה</p>
                </div>
              </div>
            </div>
            <TipBox>האות הכתום בפינה הימנית מציין שיש פריטים שממתינים לסנכרון.</TipBox>
          </div>
        </Collapsible>

        {/* Section 6 — Reports & stats */}
        <Collapsible
          title="סטטיסטיקות ודוחות"
          icon={<BarChart3 className="h-5 w-5 text-white" />}
          color="bg-violet-600"
        >
          <div className="space-y-2 text-sm">
            {[
              { label: 'סטטיסטיקות פרויקט', desc: 'סיכום כמויות, משקל, אחוז איסוף — לכל פרויקט בנפרד' },
              { label: 'דוח קיימות', desc: 'פירוט לפי סוגי חומר — כמה עץ, ברזל, טקסטיל ניתן לחלץ' },
              { label: 'דוח Live', desc: 'קישור ציבורי לשיתוף עם לקוחות — ללא צורך בהתחברות' },
              { label: 'לוח בקרה', desc: 'מבט-על על כל הפרויקטים: KPI, עובדים מובילים, בעיות פתוחות' },
              { label: 'סטטיסטיקות גלובליות', desc: 'סיכום כלל הפרויקטים בארגון' },
            ].map(({ label, desc }) => (
              <div key={label} className="flex gap-2">
                <Badge variant="outline" className="flex-shrink-0 font-bold text-xs whitespace-nowrap">{label}</Badge>
                <span className="text-muted-foreground">{desc}</span>
              </div>
            ))}
          </div>
        </Collapsible>

        {/* Section 7 — Team */}
        <Collapsible
          title="עבודת צוות והרשאות"
          icon={<Users className="h-5 w-5 text-white" />}
          color="bg-teal-600"
        >
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">ניתן להזמין משתמשים נוספים לפרויקט עם הרשאות שונות.</p>
            <div className="space-y-2">
              {[
                { role: 'PROJECT_MANAGER', desc: 'גישה מלאה — עריכה, מחיקה, הזמנת משתמשים, צפייה בדוחות' },
                { role: 'WORKER', desc: 'הוספה ועריכת פריטים בלבד — ללא מחיקה ושינוי הגדרות' },
              ].map(({ role, desc }) => (
                <div key={role} className="flex gap-2">
                  <Badge variant="secondary" className="flex-shrink-0 font-mono text-xs">{role}</Badge>
                  <span className="text-muted-foreground">{desc}</span>
                </div>
              ))}
            </div>
            <TipBox>הזמנת משתמש: כנס לפרויקט ← לחץ על אייקון האנשים ← שלח הזמנה באימייל.</TipBox>
          </div>
        </Collapsible>

        {/* Section 8 — Tips */}
        <Card className="border-amber-200 bg-amber-50/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-amber-900">
              <Lightbulb className="h-5 w-5 text-amber-600" />
              טיפים מהשטח
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-amber-900">
            <p>✓ מדברים בעברית טבעית — "שלוש כיסאות פלסטיק בגינה" עובד מצוין</p>
            <p>✓ אפשר לערוך כל פריט אחרי הזיהוי — לחצו על עיפרון</p>
            <p>✓ רהיטים שמסומנים "נזרק" לא יצוצו בדוחות האיסוף</p>
            <p>✓ החלקה ימינה על פריט פותחת אפשרות מחיקה</p>
            <p>✓ מספר הבניין והדירה תמיד מופיע בתחתית המסך — לא תלכו לאיבוד</p>
            <p>✓ ניתן לצלם ולהוסיף הערות ציור ישירות על תמונות הפריטים</p>
          </CardContent>
        </Card>

      </main>
    </div>
  );
}
