// Fallback screen shown when VITE_SUPABASE_* env vars are missing.
// Goal: give the operator a clear, actionable setup walkthrough instead of
// a white page or a cryptic stack trace.
export function SetupScreen() {
  return (
    <div dir="rtl" className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <div className="max-w-2xl w-full bg-card border border-border rounded-xl shadow p-8 sm:p-10">
        <div className="eyebrow mb-2">Setup required · דרושה הגדרה</div>
        <h1 className="text-3xl sm:text-4xl font-extrabold mb-3">
          Supabase לא מוגדר
        </h1>
        <p className="text-muted-foreground mb-6 leading-relaxed">
          האפליקציה רצה, אבל חסרים משתני סביבה של Supabase. צור קובץ{' '}
          <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-sm">.env</code>{' '}
          בתיקיית הפרויקט עם שלושת הערכים הבאים ואז הפעל מחדש את השרת{' '}
          <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-sm">npm run dev</code>.
        </p>

        <div dir="ltr" className="bg-foreground text-background rounded-lg p-4 mb-6 font-mono text-xs sm:text-sm overflow-x-auto">
          <pre className="whitespace-pre">{`VITE_SUPABASE_URL=https://<your-id>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<your-anon-key>
VITE_SUPABASE_PROJECT_ID=<your-id>`}</pre>
        </div>

        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="flex-shrink-0 h-7 w-7 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-sm font-bold">1</div>
            <div>
              <p className="font-semibold">מצא את הערכים</p>
              <p className="text-sm text-muted-foreground">
                Supabase Dashboard ← Project Settings ← API. <br />
                <span className="font-mono">Project URL</span> = VITE_SUPABASE_URL ·{' '}
                <span className="font-mono">anon public</span> = VITE_SUPABASE_PUBLISHABLE_KEY.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-shrink-0 h-7 w-7 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-sm font-bold">2</div>
            <div>
              <p className="font-semibold">צור את הקובץ</p>
              <p className="text-sm text-muted-foreground">
                העתק את{' '}
                <code className="bg-muted px-1 py-0.5 rounded font-mono text-xs">.env.example</code>{' '}
                ל-<code className="bg-muted px-1 py-0.5 rounded font-mono text-xs">.env</code>{' '}
                ומלא את הערכים.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-shrink-0 h-7 w-7 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-sm font-bold">3</div>
            <div>
              <p className="font-semibold">הפעל מחדש</p>
              <p className="text-sm text-muted-foreground">
                עצור את השרת (Ctrl+C) והפעל אותו מחדש — Vite טוען את קובץ .env רק פעם אחת באתחול.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-border text-xs text-muted-foreground">
          Just A Second · ג׳אסט א סקונד · furniture-collect
        </div>
      </div>
    </div>
  );
}
