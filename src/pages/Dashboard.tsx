// =========================================================================
// Dashboard — the first thing a logged-in user sees. Replaces the old
// auto-redirect to /projects. Premium first impression: welcome bar,
// hero stats, recent activity, and quick action tiles.
// =========================================================================
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/StatCard';
import { SkeletonStatCard, SkeletonProjectCard } from '@/components/SkeletonCard';
import { EmptyState } from '@/components/EmptyState';
import {
  Package, Leaf, Building2, TrendingUp, Plus, ScanLine, FileText,
  ArrowLeft, Clock, Sparkles, Menu,
} from 'lucide-react';
import { useSidebar } from '@/components/ui/sidebar';
import { summarise, formatKg, formatCO2, type ReportItem } from '@/lib/sustainability';

interface ProjectMini {
  id: string;
  name: string;
  city: string;
  developer_name: string;
  apartmentCount: number;
  itemCount: number;
  collectedCount: number;
  diverted_kg: number;
  co2_saved_kg: number;
}

function DashboardMenuButton() {
  const { toggleSidebar } = useSidebar();
  return (
    <button
      type="button"
      onClick={toggleSidebar}
      aria-label="פתח תפריט"
      className="absolute top-0 left-0 md:hidden flex items-center justify-center h-8 w-8 rounded-lg
                 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent
                 transition-colors"
    >
      <Menu className="h-5 w-5" />
    </button>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [userName, setUserName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<ProjectMini[]>([]);
  const [totals, setTotals] = useState({
    projectCount: 0, apartmentCount: 0, itemCount: 0,
    diverted_kg: 0, co2_saved_kg: 0, collectedCount: 0,
  });
  const [recent, setRecent] = useState<(ReportItem & { project_name?: string })[]>([]);

  useEffect(() => { void load(); }, []);

  const load = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/auth'); return; }

      // User's name
      const { data: profile } = await supabase.from('profiles').select('name').eq('id', user.id).single();
      setUserName(profile?.name ?? '');

      // All projects user has access to (RLS filters)
      const { data: projs } = await supabase.from('projects').select('id,name,city,developer_name');
      const projectIds = (projs ?? []).map(p => p.id);

      // All apartments + items across those projects (one round trip each)
      const [{ data: apts }, { data: items }] = await Promise.all([
        supabase.from('apartments').select('id,project_id'),
        supabase.from('items').select('*'),
      ]);

      // Recent activity — last 10 items across all projects
      const sorted = [...(items ?? [])].sort((a: any, b: any) =>
        new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
      );
      const recentItems = sorted.slice(0, 6).map((it: any) => ({
        ...it,
        project_name: projs?.find(p => p.id === it.project_id)?.name,
      }));
      setRecent(recentItems as any);

      // Per-project rollups
      const byProj: ProjectMini[] = (projs ?? []).map(p => {
        const aptsInP = (apts ?? []).filter((a: any) => a.project_id === p.id);
        const itemsInP = (items ?? []).filter((i: any) => i.project_id === p.id) as ReportItem[];
        const summ = summarise(itemsInP, aptsInP.length);
        return {
          id: p.id,
          name: p.name,
          city: p.city,
          developer_name: p.developer_name,
          apartmentCount: aptsInP.length,
          itemCount: summ.totalItems,
          collectedCount: summ.collectedItems,
          diverted_kg: summ.diverted_kg,
          co2_saved_kg: summ.co2_saved_kg,
        };
      });
      setProjects(byProj);

      // Global totals
      const allItemsTyped = (items ?? []) as ReportItem[];
      const globalSummary = summarise(allItemsTyped, (apts ?? []).length);
      setTotals({
        projectCount: (projs ?? []).length,
        apartmentCount: (apts ?? []).length,
        itemCount: globalSummary.totalItems,
        collectedCount: globalSummary.collectedItems,
        diverted_kg: globalSummary.diverted_kg,
        co2_saved_kg: globalSummary.co2_saved_kg,
      });
    } catch (err) {
      console.error('dashboard load failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const greet = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'בוקר טוב';
    if (h < 18) return 'צהריים טובים';
    return 'ערב טוב';
  })();

  return (
    <div dir="rtl" className="w-full max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-8 space-y-6 sm:space-y-8">
      {/* Welcome banner */}
      <section className="relative overflow-hidden rounded-2xl bg-sidebar text-sidebar-foreground px-5 py-6 sm:px-8 sm:py-8">
        {/* Subtle decorative — radial glow only, no floating circles */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_0%_100%,_rgba(181,201,173,0.18)_0%,_transparent_70%)] pointer-events-none" />
        <div className="absolute -bottom-6 -left-6 h-28 w-28 rounded-full bg-primary/15 blur-2xl pointer-events-none" />

        <div className="relative z-10">
          {/* Menu button — top-left of welcome banner, mobile only */}
          <DashboardMenuButton />

          {/* Greeting row */}
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-sidebar-foreground/50">
              {greet}
            </span>
            {userName && (
              <span className="text-lg font-extrabold tracking-tight text-sidebar-foreground leading-none">
                {userName.split(' ')[0]}
              </span>
            )}
          </div>

          {/* Primary headline */}
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-none mb-3">
            {totals.itemCount > 0 ? (
              <>
                {formatKg(totals.diverted_kg)}{' '}
                <span className="text-primary">הוצלו מהטמנה</span>
              </>
            ) : (
              'מוכנים לתעד את הפרויקט הראשון'
            )}
          </h1>

          {/* CO₂ subtitle */}
          {totals.itemCount > 0 && (
            <p className="text-sm font-semibold text-sidebar-foreground/65">
              {formatCO2(totals.co2_saved_kg)} נחסכו
              <span className="mx-1.5 opacity-40">·</span>
              על פני {totals.projectCount} {totals.projectCount === 1 ? 'פרויקט' : 'פרויקטים'}
            </p>
          )}
        </div>
      </section>

      {/* Quick actions */}
      <section>
        <div className="eyebrow mb-2">פעולות מהירות</div>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <ActionTile
            icon={Plus}
            label="פרויקט חדש"
            onClick={() => navigate('/projects/new')}
            accent="orange"
          />
          <ActionTile
            icon={Building2}
            label="הפרויקטים שלי"
            onClick={() => navigate('/projects')}
            accent="sage"
            badge={totals.projectCount || undefined}
          />
          <ActionTile
            icon={TrendingUp}
            label="סטטיסטיקות"
            onClick={() => navigate('/global-statistics')}
            accent="slate"
          />
        </div>
      </section>

      {/* Hero stats */}
      <section>
        <div className="eyebrow mb-2">סקירה כללית</div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {loading ? (
            <>
              <SkeletonStatCard /><SkeletonStatCard /><SkeletonStatCard /><SkeletonStatCard />
            </>
          ) : (
            <>
              <StatCard
                label="הופנו מהטמנה"
                value={formatKg(totals.diverted_kg)}
                sub={`${totals.collectedCount} פריטים`}
                icon={Leaf}
                accent="sage"
              />
              <StatCard
                label="CO₂ נחסך"
                value={formatCO2(totals.co2_saved_kg)}
                sub="על פני כל הפרויקטים"
                icon={TrendingUp}
                accent="orange"
              />
              <StatCard
                label="דירות תועדו"
                value={totals.apartmentCount}
                sub={`${totals.projectCount} ${totals.projectCount === 1 ? 'פרויקט' : 'פרויקטים'}`}
                icon={Building2}
                accent="slate"
              />
              <StatCard
                label="פריטים"
                value={totals.itemCount}
                sub={`${totals.itemCount - totals.collectedCount} ממתינים`}
                icon={Package}
                accent="slate"
              />
            </>
          )}
        </div>
      </section>

      {/* Active projects — visual grid, not list */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="eyebrow">פרויקטים פעילים</div>
            <h2 className="text-xl font-bold">הפרויקטים שלך</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/projects')} className="gap-1 text-sm">
            הצג הכל
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
          {loading ? (
            <><SkeletonProjectCard /><SkeletonProjectCard /></>
          ) : projects.length === 0 ? (
            <div className="md:col-span-2">
              <EmptyState
                icon={Building2}
                title="אין פרויקטים עדיין"
                description="צור פרויקט ראשון כדי להתחיל לתעד דירות בפינוי."
                actionLabel="צור פרויקט"
                onAction={() => navigate('/projects/new')}
              />
            </div>
          ) : (
            projects.slice(0, 4).map(p => (
              <button
                key={p.id}
                onClick={() => navigate(`/projects/${p.id}`)}
                className="group text-right rounded-xl border border-border bg-card hover:shadow-md transition-all active:scale-[0.99] overflow-hidden"
              >
                <div className="p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-base sm:text-lg truncate group-hover:text-primary transition-colors">{p.name}</h3>
                      <p className="text-xs sm:text-sm text-muted-foreground truncate">
                        {p.city} · {p.developer_name}
                      </p>
                    </div>
                    <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-accent/50 flex items-center justify-center group-hover:bg-accent transition-colors">
                      <Building2 className="h-5 w-5 text-accent-foreground" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border">
                    <MiniStat value={p.apartmentCount} label="דירות" />
                    <MiniStat value={p.itemCount} label="פריטים" />
                    <MiniStat value={formatKg(p.diverted_kg)} label="הוצלו" highlight={p.diverted_kg > 0} />
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </section>

      {/* Recent activity */}
      {!loading && recent.length > 0 && (
        <section>
          <div className="eyebrow mb-2">פעילות אחרונה</div>
          <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
            {recent.map(it => (
              <div key={it.id} className="flex items-center gap-3 p-3 sm:p-4 hover:bg-muted/50 transition-colors">
                {it.image_url ? (
                  <img src={it.image_url} alt="" className="h-10 w-10 rounded-md object-cover flex-shrink-0" loading="lazy" />
                ) : (
                  <div className="h-10 w-10 rounded-md bg-accent/40 flex items-center justify-center flex-shrink-0">
                    <Package className="h-4 w-4 text-accent-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm truncate">{it.description}</p>
                    {it.source === 'image' && (
                      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-accent text-accent-foreground inline-flex items-center gap-1">
                        <Sparkles className="h-2.5 w-2.5" /> AI
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {[it.location, (it as any).project_name, it.collected ? 'נאסף' : null].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ActionTile({ icon: Icon, label, onClick, accent, badge }: {
  icon: typeof Plus;
  label: string;
  onClick: () => void;
  accent: 'orange' | 'sage' | 'slate';
  badge?: number;
}) {
  const cls =
    accent === 'orange' ? 'bg-primary text-primary-foreground border-primary hover:bg-primary/90'
    : accent === 'sage' ? 'bg-card border-accent hover:bg-accent/30'
    : 'bg-card border-border hover:bg-muted/50';
  return (
    <button
      onClick={onClick}
      className={`relative rounded-xl border p-3 sm:p-4 flex flex-col items-center gap-1.5 sm:gap-2 transition-all active:scale-[0.98] ${cls}`}
    >
      {badge != null && (
        <span className="absolute top-2 left-2 bg-foreground text-background text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums">
          {badge}
        </span>
      )}
      <Icon className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={1.75} />
      <span className="text-xs sm:text-sm font-semibold text-center">{label}</span>
    </button>
  );
}

function MiniStat({ value, label, highlight }: { value: string | number; label: string; highlight?: boolean }) {
  return (
    <div className="text-center">
      <div className={`text-sm sm:text-base font-bold tabular-nums ${highlight ? 'text-primary' : 'text-foreground'}`}>
        {value}
      </div>
      <div className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
    </div>
  );
}
