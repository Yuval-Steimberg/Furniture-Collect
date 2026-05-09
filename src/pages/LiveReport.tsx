import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Building2, BarChart3, CheckCircle2, Clock, Leaf, Package, Share2 } from 'lucide-react';
import { CircularProgress } from '@/components/CircularProgress';
import { formatKg, formatCO2, summarise, type ReportItem } from '@/lib/sustainability';

export default function LiveReport() {
  const { projectId } = useParams<{ projectId: string }>();

  const [project, setProject] = useState<any>(null);
  const [apartments, setApartments] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    void load();
  }, [projectId]);

  const load = async () => {
    try {
      const [{ data: proj }, { data: apts }, { data: its }] = await Promise.all([
        supabase.from('projects').select('id,name,city,developer_name,start_date').eq('id', projectId!).single(),
        supabase.from('apartments').select('id,building_number,apartment_number,status').eq('project_id', projectId!).order('building_number').order('apartment_number'),
        supabase.from('items').select('*').eq('project_id', projectId!),
      ]);
      setProject(proj ?? null);
      setApartments((apts ?? []) as any[]);
      setItems((its ?? []) as any[]);
    } finally {
      setLoading(false);
    }
  };

  // ── Derived values ────────────────────────────────────────────────────────
  const completedApts = useMemo(
    () => apartments.filter(a => a.status === 'COMPLETED').length,
    [apartments],
  );
  const totalApts = apartments.length;
  const pct = useMemo(
    () => (totalApts > 0 ? Math.round((completedApts / totalApts) * 100) : 0),
    [completedApts, totalApts],
  );

  const summary = useMemo(
    () => summarise(items as ReportItem[], totalApts),
    [items, totalApts],
  );

  const forCollection = useMemo(
    () => items.filter(i => i.intended_for_collection),
    [items],
  );
  const collected = useMemo(
    () => forCollection.filter(i => i.collected).length,
    [forCollection],
  );
  const itemPct = useMemo(
    () => (forCollection.length > 0 ? Math.round((collected / forCollection.length) * 100) : 0),
    [collected, forCollection.length],
  );

  // Buildings grouped
  const buildingGroups = useMemo(() => {
    const map = new Map<string, { total: number; completed: number }>();
    for (const apt of apartments) {
      const key = apt.building_number;
      const prev = map.get(key) ?? { total: 0, completed: 0 };
      map.set(key, {
        total: prev.total + 1,
        completed: prev.completed + (apt.status === 'COMPLETED' ? 1 : 0),
      });
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'he'));
  }, [apartments]);

  // Today formatted as dd.mm.yyyy
  const today = useMemo(() => {
    const d = new Date();
    return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
  }, []);

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard access denied — silently ignore
    }
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div dir="rtl" className="min-h-screen bg-white flex flex-col items-center justify-center gap-4">
        <div className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
        <p className="text-muted-foreground text-sm">טוען דוח...</p>
      </div>
    );
  }

  // ── Not found ─────────────────────────────────────────────────────────────
  if (!project) {
    return (
      <div dir="rtl" className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-lg text-muted-foreground">פרויקט לא נמצא</p>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <div dir="rtl" className="min-h-screen bg-gray-50 text-foreground">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="bg-gradient-to-r from-primary to-primary/80 text-white shadow-md">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            {/* Right: project info */}
            <div className="flex items-center gap-3 min-w-0">
              <Building2 className="shrink-0 h-6 w-6 text-white/80" />
              <div className="min-w-0">
                <h1 className="font-bold text-lg leading-tight truncate">{project.name}</h1>
                <p className="text-white/70 text-sm truncate">
                  {project.city} · {project.developer_name}
                </p>
              </div>
            </div>

            {/* Left: share button */}
            <button
              onClick={handleShare}
              className="flex items-center gap-2 shrink-0 rounded-full border border-white/30 bg-white/10 px-4 py-1.5 text-sm font-medium hover:bg-white/20 transition-colors"
            >
              {copied ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                  <span>הועתק!</span>
                </>
              ) : (
                <>
                  <Share2 className="h-4 w-4" />
                  <span>שתף דוח</span>
                </>
              )}
            </button>
          </div>

          {/* Live badge */}
          <div className="mt-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-0.5 text-xs font-medium text-white/90">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              דוח חי · עדכון בזמן אמת
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* ── Hero stats ─────────────────────────────────────────────────── */}
        <section>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: apartments completed */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col items-center gap-3">
              <CircularProgress value={pct} size={64} color="primary" />
              <div className="text-center">
                <p className="font-semibold text-sm text-gray-800">דירות הושלמו</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {completedApts} מתוך {totalApts}
                </p>
              </div>
            </div>

            {/* Card 2: items collected */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col items-center gap-3">
              <CircularProgress value={itemPct} size={64} color="success" />
              <div className="text-center">
                <p className="font-semibold text-sm text-gray-800">פריטים נאספו</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {collected} מתוך {forCollection.length}
                </p>
              </div>
            </div>

            {/* Card 3: kg diverted */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col items-center gap-3">
              <Package className="h-12 w-12 text-primary" strokeWidth={1.5} />
              <div className="text-center">
                <p className="font-bold text-base tabular-nums text-gray-900">
                  {Math.round(summary.diverted_kg).toLocaleString('he-IL')}
                </p>
                <p className="font-semibold text-sm text-gray-800">ק״ג הוסטו מהאתר</p>
              </div>
            </div>

            {/* Card 4: CO₂ saved */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col items-center gap-3">
              <Leaf className="h-12 w-12 text-emerald-500" strokeWidth={1.5} />
              <div className="text-center">
                <p className="font-bold text-base tabular-nums text-gray-900">
                  {Math.round(summary.co2_saved_kg).toLocaleString('he-IL')}
                </p>
                <p className="font-semibold text-sm text-gray-800">ק״ג CO₂ נחסכו</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Building breakdown ─────────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold text-gray-900">פירוט בניינים</h2>
          </div>

          {buildingGroups.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
              <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground text-sm">אין בניינים להצגה עדיין</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {buildingGroups.map(([buildingNumber, { total, completed }]) => {
                const bPct = total > 0 ? Math.round((completed / total) * 100) : 0;
                return (
                  <div
                    key={buildingNumber}
                    className="bg-white rounded-xl shadow-sm border border-gray-100 p-4"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-primary/70" />
                        <span className="font-semibold text-sm text-gray-800">
                          בניין {buildingNumber}
                        </span>
                      </div>
                      <span className="text-xs font-medium text-muted-foreground tabular-nums">
                        {completed}/{total}
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-700"
                        style={{ width: `${bPct}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-xs text-muted-foreground">
                        {total} דירות
                      </span>
                      <span className="text-xs font-semibold text-primary">
                        {bPct}% הושלם
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Sustainability summary strip ───────────────────────────────── */}
        {(summary.diverted_kg > 0 || summary.co2_saved_kg > 0) && (
          <section className="bg-emerald-50 border border-emerald-100 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Leaf className="h-4 w-4 text-emerald-600" />
              <h2 className="font-semibold text-emerald-800 text-sm">השפעה סביבתית</h2>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-emerald-700 mb-0.5">סה״כ הוסט מהטמנה</p>
                <p className="font-bold text-emerald-900">{formatKg(summary.diverted_kg)}</p>
              </div>
              <div>
                <p className="text-xs text-emerald-700 mb-0.5">CO₂ שווה-ערך נחסך</p>
                <p className="font-bold text-emerald-900">{formatCO2(summary.co2_saved_kg)}</p>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="text-center py-6 mt-4 border-t border-gray-100 bg-white">
        <p className="text-xs text-muted-foreground">
          נוצר על ידי FurniCollect · {today}
        </p>
      </footer>
    </div>
  );
}
