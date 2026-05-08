// =========================================================================
// Dashboard — the first thing a logged-in user sees. Replaces the old
// auto-redirect to /projects. Premium first impression: welcome bar,
// hero stats, recent activity, and quick action tiles.
// =========================================================================
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/StatCard';
import { SkeletonStatCard, SkeletonProjectCard } from '@/components/SkeletonCard';
import { EmptyState } from '@/components/EmptyState';
import {
  Package, Leaf, Building2, TrendingUp, Plus,
  ArrowLeft, Clock, Sparkles, Menu,
} from 'lucide-react';
import { useSidebar } from '@/components/ui/sidebar';
import { summarise, formatKg, formatCO2, type ReportItem } from '@/lib/sustainability';

function DashboardMenuButton() {
  const { toggleSidebar } = useSidebar();
  return (
    <button
      type="button"
      onClick={toggleSidebar}
      aria-label="פתח תפריט"
      className="flex items-center justify-center h-8 w-8 rounded-lg
                 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent
                 transition-colors"
    >
      <Menu className="h-5 w-5" />
    </button>
  );
}

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
      <section className="relative overflow-hidden rounded-2xl bg-sidebar text-sidebar-foreground">
        <div className="absolute -left-8 -bottom-8 h-36 w-36 rounded-full bg-accent/20 blur-sm pointer-events-none" />

        <div dir="rtl" className="relative z-10 px-5 pt-4 pb-6 sm:px-7 sm:pt-5 sm:pb-7">
          {/* Menu button — first child in RTL flex lands on physical right */}
          <div className="flex mb-3 md:hidden">
            <DashboardMenuButton />
          </div>

          {/* Greeting */}
          <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-sidebar-foreground/50 mb-3">
            {greet}{userName ? ` · ${userName.split(' ')[0]}` : ''}
          </p>

          {/* Headline: big number + label on next line */}
          {totals.itemCount > 0 ? (
            <div className="mb-2">
              <div className="text-5xl font-extrabold tracking-tight leading-none text-primary">
                {totals.itemCount}
              </div>
              <div className="text-xl font-bold text-sidebar-foreground mt-1">
                פריטים רשומים
              </div>
              <div className="text-xs text-sidebar-foreground/50 mt-0.5">
                פריטי ריהוט שתועדו על פני {totals.projectCount} {totals.projectCount === 1 ? 'פרויקט' : 'פרויקטים'}
              </div>
            </div>
          ) : (
            <h1 className="text-2xl font-extrabold tracking-tight leading-tight mb-2">
              מוכנים לתעד את הפרויקט הראשון
            </h1>
          )}

          {/* Stats line */}
          <p className="text-sm text-sidebar-foreground/70">
            {totals.itemCount > 0 ? (
              <>
                {totals.collectedCount} נאספו
                <span className="mx-1.5 opacity-40">·</span>
                {totals.itemCount - totals.collectedCount} ממתינים
                {totals.diverted_kg > 0 && (
                  <>
                    <span className="mx-1.5 opacity-40">·</span>
                    {formatKg(totals.diverted_kg)} הוצלו מהטמנה
                  </>
                )}
              </>
            ) : (
              `${totals.projectCount} פרויקטים · התחל בתיעוד פריטים`
            )}
          </p>
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
        <motion.div
          className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
          variants={{ show: { transition: { staggerChildren: 0.06 } } }}
          initial="hidden"
          animate="show"
        >
          {loading ? (
            <>
              <SkeletonStatCard /><SkeletonStatCard /><SkeletonStatCard /><SkeletonStatCard />
            </>
          ) : (
            <>
              {[
                { label: 'הופנו מהטמנה', value: formatKg(totals.diverted_kg), sub: `${totals.collectedCount} נאספו`, icon: Leaf, accent: 'sage' as const },
                { label: 'CO₂ נחסך', value: formatCO2(totals.co2_saved_kg), sub: 'על פני כל הפרויקטים', icon: TrendingUp, accent: 'orange' as const },
                { label: 'דירות תועדו', value: totals.apartmentCount, sub: `${totals.projectCount} ${totals.projectCount === 1 ? 'פרויקט' : 'פרויקטים'}`, icon: Building2, accent: 'slate' as const },
                { label: 'פריטים', value: totals.itemCount, sub: `${totals.itemCount - totals.collectedCount} ממתינים`, icon: Package, accent: 'slate' as const },
              ].map(card => (
                <motion.div
                  key={card.label}
                  variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.2, 0.7, 0.2, 1] } } }}
                >
                  <StatCard {...card} />
                </motion.div>
              ))}
            </>
          )}
        </motion.div>
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
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4"
          variants={{ show: { transition: { staggerChildren: 0.07 } } }}
          initial="hidden"
          animate="show"
        >
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
              <motion.button
                key={p.id}
                onClick={() => navigate(`/projects/${p.id}`)}
                variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.2, 0.7, 0.2, 1] } } }}
                className="group text-right rounded-xl border border-border bg-card hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-220 active:scale-[0.985] active:translate-y-0 active:shadow-xs overflow-hidden"
              >
                <div className="p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-base sm:text-lg truncate group-hover:text-primary transition-colors">{p.name}</h3>
                      <p className="text-xs sm:text-sm text-muted-foreground truncate">
                        {p.city} · {p.developer_name}
                      </p>
                    </div>
                    <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-accent/50 flex items-center justify-center group-hover:bg-accent transition-colors duration-220">
                      <Building2 className="h-5 w-5 text-accent-foreground" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border">
                    <MiniStat value={p.apartmentCount} label="דירות" />
                    <MiniStat value={p.itemCount} label="פריטים" />
                    <MiniStat value={formatKg(p.diverted_kg)} label="הוצלו" highlight={p.diverted_kg > 0} />
                  </div>
                </div>
              </motion.button>
            ))
          )}
        </motion.div>
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
      className={`relative rounded-xl border p-3 sm:p-4 flex flex-col items-center gap-1.5 sm:gap-2 transition-all duration-220 active:scale-[0.94] active:opacity-90 ${cls}`}
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
