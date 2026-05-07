import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/EmptyState';
import { SkeletonProjectCard } from '@/components/SkeletonCard';
import {
  Building2, Package, CheckCircle2, ChevronDown, ChevronUp, MapPin,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatKg } from '@/lib/sustainability';

// ─── constants ────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  glass: 'זכוכית', aluminum: 'אלומיניום', wood: 'עץ', plastic: 'פלסטיק',
  metal: 'מתכת', textile: 'טקסטיל', electrical: 'חשמלי', other: 'אחר',
};

const CATEGORY_COLORS: Record<string, string> = {
  wood: 'bg-amber-500', textile: 'bg-emerald-500', metal: 'bg-slate-500',
  electrical: 'bg-red-500', glass: 'bg-sky-400', aluminum: 'bg-blue-400',
  plastic: 'bg-purple-400', other: 'bg-orange-400',
};

// ─── types ────────────────────────────────────────────────────────────────────

interface Item {
  id: string;
  description: string;
  quantity: number;
  location: string | null;
  material_category: string;
  estimated_weight_kg: number | null;
  collected: boolean;
  apartment_id: string;
  apartments: { building_number: string; apartment_number: string } | null;
}

interface AptSummary {
  id: string;
  building_number: string;
  apartment_number: string;
  pending: Item[];
  collected: Item[];
  totalWeight: number;
}

interface BuildingGroup {
  building_number: string;
  apartments: AptSummary[];
  pendingCount: number;
  collectedCount: number;
  totalWeight: number;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function itemWeight(item: Item) {
  return (item.estimated_weight_kg ?? 0) * item.quantity;
}

function topCategories(items: Item[]): string[] {
  const counts: Record<string, number> = {};
  items.forEach(it => { counts[it.material_category] = (counts[it.material_category] ?? 0) + it.quantity; });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
}

// ─── sub-components ───────────────────────────────────────────────────────────

function StatBadge({ value, label, accent = 'default' }: {
  value: number | string; label: string; accent?: 'orange' | 'green' | 'default';
}) {
  const val = accent === 'orange' ? 'text-primary' : accent === 'green' ? 'text-emerald-600' : 'text-foreground';
  return (
    <div className="flex flex-col items-center gap-0.5 px-3">
      <span className={`text-2xl font-extrabold tabular-nums leading-none ${val}`}>{value}</span>
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
    </div>
  );
}

function CategoryDot({ cat }: { cat: string }) {
  return (
    <span
      title={CATEGORY_LABELS[cat] ?? cat}
      className={`inline-block h-2.5 w-2.5 rounded-full flex-shrink-0 ${CATEGORY_COLORS[cat] ?? 'bg-muted-foreground'}`}
    />
  );
}

function ItemRow({ item }: { item: Item }) {
  return (
    <div className="flex items-start gap-2.5 py-2 border-b border-border/50 last:border-0">
      <CategoryDot cat={item.material_category} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-snug truncate">{item.description}</p>
        <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
          {item.location && <><MapPin className="h-3 w-3 flex-shrink-0" />{item.location}</>}
          {item.quantity > 1 && <span className="text-muted-foreground">× {item.quantity}</span>}
        </p>
      </div>
      <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
        <span className="text-xs text-muted-foreground">{CATEGORY_LABELS[item.material_category] ?? item.material_category}</span>
        {itemWeight(item) > 0 && (
          <span className="text-[11px] text-muted-foreground tabular-nums">{formatKg(itemWeight(item))}</span>
        )}
      </div>
      {item.collected ? (
        <Badge className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 border-emerald-200 flex-shrink-0">נאסף</Badge>
      ) : (
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 flex-shrink-0">ממתין</Badge>
      )}
    </div>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function CollectionPrep() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [projectName, setProjectName] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [openBuildings, setOpenBuildings] = useState<Record<string, boolean>>({});
  const [openApts, setOpenApts] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<'buildings' | 'materials' | 'items'>('buildings');

  useEffect(() => { void loadData(); }, [projectId]);

  const loadData = async () => {
    try {
      const [{ data: project }, { data: itemsData, error }] = await Promise.all([
        supabase.from('projects').select('name').eq('id', projectId!).single(),
        supabase
          .from('items')
          .select('id,description,quantity,location,material_category,estimated_weight_kg,collected,apartment_id,apartments(building_number,apartment_number)')
          .eq('project_id', projectId!)
          .eq('intended_for_collection', true)
          .order('material_category'),
      ]);
      if (error) throw error;
      setProjectName(project?.name ?? '');
      setItems((itemsData as unknown as Item[]) ?? []);
    } catch (err: any) {
      toast.error('שגיאה בטעינת נתונים');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // ── derived data ──────────────────────────────────────────────────────────

  const buildings = useMemo<BuildingGroup[]>(() => {
    const aptMap: Record<string, AptSummary> = {};
    items.forEach(it => {
      const apt = it.apartments;
      if (!apt) return;
      const key = `${apt.building_number}__${apt.apartment_number}__${it.apartment_id}`;
      if (!aptMap[key]) aptMap[key] = {
        id: it.apartment_id,
        building_number: apt.building_number,
        apartment_number: apt.apartment_number,
        pending: [], collected: [], totalWeight: 0,
      };
      (it.collected ? aptMap[key].collected : aptMap[key].pending).push(it);
      aptMap[key].totalWeight += itemWeight(it);
    });

    const bldMap: Record<string, BuildingGroup> = {};
    Object.values(aptMap).forEach(apt => {
      if (!bldMap[apt.building_number]) bldMap[apt.building_number] = {
        building_number: apt.building_number, apartments: [],
        pendingCount: 0, collectedCount: 0, totalWeight: 0,
      };
      bldMap[apt.building_number].apartments.push(apt);
      bldMap[apt.building_number].pendingCount += apt.pending.length;
      bldMap[apt.building_number].collectedCount += apt.collected.length;
      bldMap[apt.building_number].totalWeight += apt.totalWeight;
    });

    return Object.values(bldMap)
      .map(b => ({
        ...b,
        apartments: b.apartments.sort((a, z) =>
          a.apartment_number.localeCompare(z.apartment_number, 'he')),
      }))
      .sort((a, b) => b.pendingCount - a.pendingCount);
  }, [items]);

  const materialSummary = useMemo(() => {
    const map: Record<string, { pending: number; pendingWeight: number; collected: number; collectedWeight: number }> = {};
    items.forEach(it => {
      const cat = it.material_category;
      if (!map[cat]) map[cat] = { pending: 0, pendingWeight: 0, collected: 0, collectedWeight: 0 };
      if (it.collected) {
        map[cat].collected += it.quantity;
        map[cat].collectedWeight += itemWeight(it);
      } else {
        map[cat].pending += it.quantity;
        map[cat].pendingWeight += itemWeight(it);
      }
    });
    return Object.entries(map).sort((a, b) => (b[1].pending + b[1].collected) - (a[1].pending + a[1].collected));
  }, [items]);

  const totalPending = items.filter(i => !i.collected).length;
  const totalCollected = items.filter(i => i.collected).length;
  const totalWeight = items.reduce((s, i) => s + itemWeight(i), 0);

  const toggleBuilding = (b: string) =>
    setOpenBuildings(p => ({ ...p, [b]: !p[b] }));
  const toggleApt = (id: string) =>
    setOpenApts(p => ({ ...p, [id]: !p[id] }));

  // ── loading / empty ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-muted" dir="rtl">
        <div className="h-16 bg-sidebar" />
        <div className="max-w-3xl mx-auto p-4 space-y-3">
          <SkeletonProjectCard /><SkeletonProjectCard />
        </div>
      </div>
    );
  }

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-muted" dir="rtl">
      <PageHeader
        title="תכנון איסוף"
        subtitle={projectName}
        onBack={() => navigate(`/projects/${projectId}`)}
      />

      <div className="max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4">

        {/* ── Summary banner ── */}
        <div className="rounded-2xl bg-sidebar text-sidebar-foreground px-4 py-5">
          <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-sidebar-foreground/50 mb-3">
            סיכום לאתר · {projectName}
          </p>
          <div className="flex items-center justify-around divide-x divide-sidebar-foreground/15 rtl:divide-x-reverse">
            <StatBadge value={totalPending}  label="ממתינים לאיסוף" accent="orange" />
            <StatBadge value={totalCollected} label="נאספו כבר"      accent="green"  />
            <StatBadge value={totalPending + totalCollected} label="סה״כ לאיסוף" />
            <StatBadge value={formatKg(totalWeight)} label="משקל כולל" />
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-1 bg-card border border-border rounded-xl p-1">
          {([
            ['buildings', 'פירוט לפי בניין'],
            ['materials', 'לפי חומר'],
            ['items',     'כל הפריטים'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex-1 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                activeTab === id
                  ? 'bg-sidebar text-sidebar-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Tab: buildings ── */}
        {activeTab === 'buildings' && (
          <div className="space-y-3">
            {buildings.length === 0 ? (
              <EmptyState icon={Package} title="אין פריטים לאיסוף" description="לא סומנו פריטים לאיסוף בפרויקט זה." />
            ) : buildings.map(bld => (
              <div key={bld.building_number} className="rounded-xl border border-border bg-card overflow-hidden">
                {/* Building header */}
                <button
                  onClick={() => toggleBuilding(bld.building_number)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-right hover:bg-muted/50 transition-colors"
                >
                  <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm">בניין {bld.building_number}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {bld.apartments.length} דירות ·{' '}
                      <span className="text-primary font-semibold">{bld.pendingCount} ממתינים</span>
                      {bld.collectedCount > 0 && <> · <span className="text-emerald-600">{bld.collectedCount} נאספו</span></>}
                      {bld.totalWeight > 0 && <> · {formatKg(bld.totalWeight)}</>}
                    </p>
                  </div>
                  {openBuildings[bld.building_number]
                    ? <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    : <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
                </button>

                {/* Apartment rows */}
                {openBuildings[bld.building_number] && (
                  <div className="border-t border-border divide-y divide-border/50">
                    {bld.apartments.map(apt => (
                      <div key={apt.id}>
                        <button
                          onClick={() => toggleApt(apt.id)}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-right hover:bg-muted/30 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold">דירה {apt.apartment_number}</p>
                            <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                              {apt.pending.length > 0 && (
                                <span className="flex items-center gap-1 text-[11px] text-primary font-medium">
                                  <Package className="h-3 w-3" />{apt.pending.length} ממתינים
                                </span>
                              )}
                              {apt.collected.length > 0 && (
                                <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                                  <CheckCircle2 className="h-3 w-3" />{apt.collected.length} נאספו
                                </span>
                              )}
                              {apt.totalWeight > 0 && (
                                <span className="text-[11px] text-muted-foreground">{formatKg(apt.totalWeight)}</span>
                              )}
                              {topCategories([...apt.pending, ...apt.collected]).map(cat => (
                                <CategoryDot key={cat} cat={cat} />
                              ))}
                            </div>
                          </div>
                          {openApts[apt.id]
                            ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
                        </button>

                        {openApts[apt.id] && (
                          <div className="px-4 pb-2 bg-muted/20">
                            {[...apt.pending, ...apt.collected].map(item => (
                              <ItemRow key={item.id} item={item} />
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Tab: materials ── */}
        {activeTab === 'materials' && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="grid grid-cols-[auto_1fr_1fr] gap-0 text-[11px] font-bold uppercase tracking-wide text-muted-foreground px-4 py-2 border-b border-border bg-muted/40">
              <span className="w-28">חומר</span>
              <span className="text-center">ממתינים</span>
              <span className="text-center">נאספו</span>
            </div>
            {materialSummary.map(([cat, data]) => (
              <div key={cat} className="grid grid-cols-[auto_1fr_1fr] items-center gap-0 px-4 py-3 border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                <div className="w-28 flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${CATEGORY_COLORS[cat] ?? 'bg-muted-foreground'}`} />
                  <span className="text-sm font-semibold">{CATEGORY_LABELS[cat] ?? cat}</span>
                </div>
                <div className="text-center">
                  {data.pending > 0 ? (
                    <>
                      <p className="text-sm font-bold text-primary tabular-nums">{data.pending}</p>
                      {data.pendingWeight > 0 && <p className="text-[11px] text-muted-foreground">{formatKg(data.pendingWeight)}</p>}
                    </>
                  ) : <span className="text-muted-foreground">—</span>}
                </div>
                <div className="text-center">
                  {data.collected > 0 ? (
                    <>
                      <p className="text-sm font-bold text-emerald-600 tabular-nums">{data.collected}</p>
                      {data.collectedWeight > 0 && <p className="text-[11px] text-muted-foreground">{formatKg(data.collectedWeight)}</p>}
                    </>
                  ) : <span className="text-muted-foreground">—</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Tab: all items ── */}
        {activeTab === 'items' && (
          <div className="space-y-3">
            {buildings.map(bld =>
              bld.apartments.map(apt => {
                const all = [...apt.pending, ...apt.collected];
                if (all.length === 0) return null;
                return (
                  <div key={apt.id} className="rounded-xl border border-border bg-card overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-border bg-muted/40 flex items-center gap-2">
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                        בניין {bld.building_number} · דירה {apt.apartment_number}
                      </span>
                      <span className="mr-auto text-[11px] text-muted-foreground">{all.length} פריטים</span>
                    </div>
                    <div className="px-4 py-1">
                      {all.map(item => <ItemRow key={item.id} item={item} />)}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

      </div>
    </div>
  );
}
