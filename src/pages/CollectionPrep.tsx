import { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/EmptyState';
import { SkeletonProjectCard } from '@/components/SkeletonCard';
import {
  Building2, Package, CheckCircle2, ChevronDown, ChevronUp, MapPin,
  Lightbulb, Truck, AlertTriangle, Recycle, Star,
  CalendarDays, User, MapPinned, MessageSquarePlus, X, Check, Loader2,
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

const CATEGORY_TIPS: Record<string, { icon: typeof Lightbulb; color: string; tip: string }> = {
  wood:       { icon: AlertTriangle, color: 'text-amber-600',  tip: 'פריטי עץ כבדים — יש להביא ציוד הרמה; חלוקה לצוותות של לפחות 2 אנשים לחתיכות גדולות.' },
  electrical: { icon: AlertTriangle, color: 'text-red-600',    tip: 'פסולת אלקטרונית — חייבת להגיע לאתר מחזור מורשה. יש לבדוק היטל מחזור ואיסוף נפרד.' },
  glass:      { icon: AlertTriangle, color: 'text-sky-600',    tip: 'פריטי זכוכית — חובה עטיפה בבועות/שמיכות ותיוג "שביר". הוצאה לפני ריהוט אחר.' },
  metal:      { icon: Recycle,       color: 'text-slate-600',  tip: 'מתכת — ערך מחזור גבוה. מומלץ לתאם מראש עם חברת פסולת מתכות לאיסוף ישיר מהאתר.' },
  aluminum:   { icon: Recycle,       color: 'text-blue-600',   tip: 'אלומיניום — ערך מחזור גבוה במיוחד. כדאי לאסוף בנפרד ולמכור ישירות לחברת מחזור.' },
  textile:    { icon: Lightbulb,     color: 'text-emerald-600',tip: 'טקסטיל — אם במצב טוב, ניתן לתרום לארגוני צדקה (עמותות ריהוט) לפני זריקה.' },
  plastic:    { icon: Recycle,       color: 'text-purple-600', tip: 'פלסטיק — יש לבדוק קוד מחזור על כל פריט. חלק ניתן למחזור, חלק לפסולת רגילה.' },
};

// ─── types ────────────────────────────────────────────────────────────────────

interface ProjectMeta {
  name: string;
  city: string;
  developer_name: string;
  start_date: string | null;
}

interface Item {
  id: string;
  description: string;
  quantity: number;
  location: string | null;
  material_category: string;
  estimated_weight_kg: number | null;
  collected: boolean;
  notes: string | null;
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
  pendingWeight: number;
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

function truckRecommendation(pendingWeightKg: number): { label: string; detail: string } {
  if (pendingWeightKg === 0) return { label: 'אין פריטים ממתינים', detail: 'כל הפריטים כבר נאספו.' };
  if (pendingWeightKg < 300)  return { label: 'רכב/טנדר',        detail: `${formatKg(pendingWeightKg)} — ניתן לפינוי בטנדר רגיל.` };
  if (pendingWeightKg < 1500) return { label: 'משאית קטנה',      detail: `${formatKg(pendingWeightKg)} — מומלץ משאית עד 3.5 טון.` };
  if (pendingWeightKg < 4000) return { label: 'משאית בינונית',   detail: `${formatKg(pendingWeightKg)} — מומלץ משאית 5-8 טון.` };
  const trips = Math.ceil(pendingWeightKg / 4000);
  return { label: `משאית גדולה · ${trips} הסעות`, detail: `${formatKg(pendingWeightKg)} — משאית כבדה, כנראה ${trips} נסיעות.` };
}

// ─── sub-components ───────────────────────────────────────────────────────────

function CategoryDot({ cat }: { cat: string }) {
  return (
    <span title={CATEGORY_LABELS[cat] ?? cat}
      className={`inline-block h-2.5 w-2.5 rounded-full flex-shrink-0 ${CATEGORY_COLORS[cat] ?? 'bg-muted-foreground'}`}
    />
  );
}

interface ItemRowProps {
  item: Item;
  updating: boolean;
  editingNote: boolean;
  onToggle: () => void;
  onOpenNote: () => void;
  onCloseNote: () => void;
  onSaveNote: (note: string) => void;
}

function ItemRow({ item, updating, editingNote, onToggle, onOpenNote, onCloseNote, onSaveNote }: ItemRowProps) {
  const [draft, setDraft] = useState(item.notes ?? '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editingNote && textareaRef.current) textareaRef.current.focus();
  }, [editingNote]);

  return (
    <div className="py-2 border-b border-border/50 last:border-0">
      <div className="flex items-start gap-2.5">
        <CategoryDot cat={item.material_category} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-snug truncate">{item.description}</p>
          <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
            {item.location && <><MapPin className="h-3 w-3 flex-shrink-0" />{item.location}</>}
            {item.quantity > 1 && <span>× {item.quantity}</span>}
          </p>
          {item.notes && !editingNote && (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 mt-1 leading-snug">
              {item.notes}
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <span className="text-xs text-muted-foreground">{CATEGORY_LABELS[item.material_category] ?? item.material_category}</span>
          {itemWeight(item) > 0 && (
            <span className="text-[11px] text-muted-foreground tabular-nums">{formatKg(itemWeight(item))}</span>
          )}
        </div>

        {/* Status toggle */}
        <button
          onClick={onToggle}
          disabled={updating}
          className="flex-shrink-0 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border transition-colors active:scale-95 disabled:opacity-60"
          style={item.collected
            ? { background: '#d1fae5', color: '#065f46', borderColor: '#a7f3d0' }
            : { background: '#f3f4f6', color: '#374151', borderColor: '#e5e7eb' }}
        >
          {updating
            ? <Loader2 className="h-3 w-3 animate-spin" />
            : item.collected
              ? <><Check className="h-3 w-3" />נאסף</>
              : 'ממתין'}
        </button>

        {/* Note button */}
        <button
          onClick={editingNote ? onCloseNote : onOpenNote}
          className={`flex-shrink-0 h-6 w-6 flex items-center justify-center rounded-full transition-colors ${
            editingNote ? 'bg-muted text-muted-foreground' : item.notes ? 'text-amber-500' : 'text-muted-foreground/40 hover:text-muted-foreground'
          }`}
          title={editingNote ? 'סגור הערה' : 'הוסף הערה'}
        >
          {editingNote ? <X className="h-3.5 w-3.5" /> : <MessageSquarePlus className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Inline note editor */}
      {editingNote && (
        <div className="mt-2 mr-5">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="הוסף הערת איסוף (למשל: פרק לפני שאר הפריטים, מוצא שמאלה...)"
            rows={2}
            className="w-full text-xs border border-border rounded-lg px-3 py-2 bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
            dir="rtl"
          />
          <div className="flex gap-2 mt-1.5 justify-end">
            <button
              onClick={onCloseNote}
              className="text-xs text-muted-foreground px-3 py-1 rounded-lg hover:bg-muted"
            >ביטול</button>
            <button
              onClick={() => { onSaveNote(draft.trim()); onCloseNote(); }}
              className="text-xs font-semibold text-primary-foreground bg-primary px-3 py-1 rounded-lg"
            >שמור</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function CollectionPrep() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [project, setProject]     = useState<ProjectMeta | null>(null);
  const [aptCounts, setAptCounts] = useState({ total: 0, completed: 0 });
  const [items, setItems]         = useState<Item[]>([]);
  const [loading, setLoading]     = useState(true);
  const [openBuildings, setOpenBuildings] = useState<Record<string, boolean>>({});
  const [openApts, setOpenApts]   = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<'recommendations' | 'buildings' | 'materials' | 'items'>('recommendations');
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);

  useEffect(() => { void loadData(); }, [projectId]);

  const loadData = async () => {
    try {
      const [
        { data: proj },
        { data: apts },
        { data: itemsData, error },
      ] = await Promise.all([
        supabase.from('projects')
          .select('name,city,developer_name,start_date')
          .eq('id', projectId!).single(),
        supabase.from('apartments')
          .select('id,status')
          .eq('project_id', projectId!),
        supabase.from('items')
          .select('id,description,quantity,location,material_category,estimated_weight_kg,collected,notes,apartment_id,apartments(building_number,apartment_number)')
          .eq('project_id', projectId!)
          .eq('intended_for_collection', true)
          .order('material_category'),
      ]);
      if (error) throw error;
      setProject(proj);
      setAptCounts({
        total: apts?.length ?? 0,
        completed: apts?.filter((a: any) => a.status === 'COMPLETED').length ?? 0,
      });
      setItems((itemsData as unknown as Item[]) ?? []);
    } catch (err: any) {
      toast.error('שגיאה בטעינת נתונים');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const toggleCollected = async (id: string, current: boolean) => {
    setUpdatingIds(s => new Set(s).add(id));
    setItems(prev => prev.map(i => i.id === id ? { ...i, collected: !current } : i));
    const { error } = await supabase.from('items').update({ collected: !current }).eq('id', id);
    if (error) {
      setItems(prev => prev.map(i => i.id === id ? { ...i, collected: current } : i));
      toast.error('שגיאה בעדכון סטטוס');
    }
    setUpdatingIds(s => { const n = new Set(s); n.delete(id); return n; });
  };

  const saveNote = async (id: string, note: string) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, notes: note || null } : i));
    const { error } = await supabase.from('items').update({ notes: note || null }).eq('id', id);
    if (error) toast.error('שגיאה בשמירת הערה');
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
        pending: [], collected: [], totalWeight: 0, pendingWeight: 0,
      };
      (it.collected ? aptMap[key].collected : aptMap[key].pending).push(it);
      aptMap[key].totalWeight += itemWeight(it);
      if (!it.collected) aptMap[key].pendingWeight += itemWeight(it);
    });

    const bldMap: Record<string, BuildingGroup> = {};
    Object.values(aptMap).forEach(apt => {
      if (!bldMap[apt.building_number]) bldMap[apt.building_number] = {
        building_number: apt.building_number, apartments: [],
        pendingCount: 0, collectedCount: 0, totalWeight: 0,
      };
      bldMap[apt.building_number].apartments.push(apt);
      bldMap[apt.building_number].pendingCount  += apt.pending.length;
      bldMap[apt.building_number].collectedCount += apt.collected.length;
      bldMap[apt.building_number].totalWeight   += apt.totalWeight;
    });

    return Object.values(bldMap)
      .map(b => ({
        ...b,
        apartments: b.apartments.sort((a, z) => a.apartment_number.localeCompare(z.apartment_number, 'he')),
      }))
      .sort((a, b) => b.pendingCount - a.pendingCount);
  }, [items]);

  const materialSummary = useMemo(() => {
    const map: Record<string, { pending: number; pendingWeight: number; collected: number; collectedWeight: number }> = {};
    items.forEach(it => {
      const cat = it.material_category;
      if (!map[cat]) map[cat] = { pending: 0, pendingWeight: 0, collected: 0, collectedWeight: 0 };
      if (it.collected) { map[cat].collected += it.quantity; map[cat].collectedWeight += itemWeight(it); }
      else              { map[cat].pending   += it.quantity; map[cat].pendingWeight   += itemWeight(it); }
    });
    return Object.entries(map).sort((a, b) => (b[1].pending + b[1].collected) - (a[1].pending + a[1].collected));
  }, [items]);

  const priorityApts = useMemo(() => {
    const all: (AptSummary & { score: number })[] = [];
    buildings.forEach(b => b.apartments.forEach(apt => {
      if (apt.pending.length === 0) return;
      const score = apt.pendingWeight > 0 ? apt.pendingWeight : apt.pending.length * 30;
      all.push({ ...apt, score });
    }));
    return all.sort((a, b) => b.score - a.score).slice(0, 5);
  }, [buildings]);

  const totalPending   = items.filter(i => !i.collected).length;
  const totalCollected = items.filter(i =>  i.collected).length;
  const totalWeight    = items.reduce((s, i) => s + itemWeight(i), 0);
  const pendingWeight  = items.filter(i => !i.collected).reduce((s, i) => s + itemWeight(i), 0);
  const collectionProgress = totalPending + totalCollected > 0
    ? Math.round((totalCollected / (totalPending + totalCollected)) * 100)
    : 0;

  const truck = truckRecommendation(pendingWeight);
  const presentCategories = [...new Set(items.map(i => i.material_category))];
  const categoriesWithTips = presentCategories.filter(c => CATEGORY_TIPS[c]);

  const toggleBuilding = (b: string) => setOpenBuildings(p => ({ ...p, [b]: !p[b] }));
  const toggleApt      = (id: string) => setOpenApts(p => ({ ...p, [id]: !p[id] }));

  const itemRowProps = (item: Item): ItemRowProps => ({
    item,
    updating: updatingIds.has(item.id),
    editingNote: editingNoteId === item.id,
    onToggle: () => toggleCollected(item.id, item.collected),
    onOpenNote: () => setEditingNoteId(item.id),
    onCloseNote: () => setEditingNoteId(null),
    onSaveNote: (note) => saveNote(item.id, note),
  });

  // ── loading ────────────────────────────────────────────────────────────────

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
        subtitle={project?.name}
        onBack={() => navigate(`/projects/${projectId}`)}
      />

      <div className="max-w-3xl mx-auto px-3 sm:px-4 pt-4 sm:pt-6 pb-32 sm:pb-6 space-y-4">

        {/* ── Project info card ── */}
        <div className="rounded-2xl bg-sidebar text-sidebar-foreground px-5 pt-5 pb-4">
          <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-sidebar-foreground/50 mb-1">
            סיכום פרויקט
          </p>
          <h2 className="text-xl font-extrabold tracking-tight leading-tight mb-3">{project?.name}</h2>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-sidebar-foreground/70 mb-4">
            {project?.city && (
              <span className="flex items-center gap-1.5">
                <MapPinned className="h-3.5 w-3.5 flex-shrink-0" />{project.city}
              </span>
            )}
            {project?.developer_name && (
              <span className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 flex-shrink-0" />{project.developer_name}
              </span>
            )}
            {project?.start_date && (
              <span className="flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5 flex-shrink-0" />
                {new Date(project.start_date).toLocaleDateString('he-IL')}
              </span>
            )}
          </div>

          <div className="grid grid-cols-4 gap-2 mb-4">
            {[
              { v: aptCounts.total,     l: 'דירות',  c: 'text-sidebar-foreground' },
              { v: aptCounts.completed, l: 'הושלמו', c: 'text-emerald-400' },
              { v: totalPending,        l: 'לאיסוף', c: 'text-primary' },
              { v: totalCollected,      l: 'נאספו',  c: 'text-emerald-400' },
            ].map(({ v, l, c }) => (
              <div key={l} className="text-center rounded-lg bg-sidebar-foreground/5 py-2">
                <p className={`text-xl font-extrabold tabular-nums leading-none ${c}`}>{v}</p>
                <p className="text-[10px] text-sidebar-foreground/50 uppercase tracking-wide mt-0.5">{l}</p>
              </div>
            ))}
          </div>

          {totalPending + totalCollected > 0 && (
            <div>
              <div className="flex justify-between text-[11px] text-sidebar-foreground/60 mb-1">
                <span>התקדמות איסוף</span>
                <span>{collectionProgress}%</span>
              </div>
              <div className="h-2 rounded-full bg-sidebar-foreground/15 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-400 transition-all"
                  style={{ width: `${collectionProgress}%` }}
                />
              </div>
              <p className="text-[11px] text-sidebar-foreground/50 mt-1">
                {totalCollected} מתוך {totalPending + totalCollected} פריטים לאיסוף · {formatKg(totalWeight)} כולל
              </p>
            </div>
          )}
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-1 bg-card border border-border rounded-xl p-1 overflow-x-auto">
          {([
            ['recommendations', 'המלצות'],
            ['buildings',       'לפי בניין'],
            ['materials',       'לפי חומר'],
            ['items',           'כל הפריטים'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex-1 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap px-2 ${
                activeTab === id
                  ? 'bg-sidebar text-sidebar-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ═══ Tab: recommendations ═══ */}
        {activeTab === 'recommendations' && (
          <div className="space-y-3">
            {totalPending === 0 && totalCollected === 0 ? (
              <EmptyState icon={Package} title="אין פריטים לאיסוף" description="לא סומנו פריטים לאיסוף בפרויקט זה." />
            ) : (
              <>
                {/* Truck recommendation */}
                <div className="rounded-xl border border-border bg-card px-4 py-3 flex items-start gap-3">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Truck className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-bold text-sm">ציוד הסעה מומלץ</p>
                    <p className="text-sm text-primary font-semibold">{truck.label}</p>
                    <p className="text-[12px] text-muted-foreground mt-0.5">{truck.detail}</p>
                  </div>
                </div>

                {/* Priority apartments */}
                {priorityApts.length > 0 && (
                  <div className="rounded-xl border border-border bg-card overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-border bg-muted/40 flex items-center gap-2">
                      <Star className="h-4 w-4 text-primary" />
                      <span className="font-bold text-sm">סדר עדיפויות מומלץ לאיסוף</span>
                    </div>
                    <div className="divide-y divide-border/50">
                      {priorityApts.map((apt, idx) => (
                        <div key={apt.id} className="flex items-center gap-3 px-4 py-3">
                          <span className={`h-7 w-7 rounded-full flex items-center justify-center text-sm font-extrabold flex-shrink-0 ${
                            idx === 0 ? 'bg-primary text-primary-foreground' :
                            idx === 1 ? 'bg-primary/20 text-primary' :
                            'bg-muted text-muted-foreground'
                          }`}>{idx + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold">
                              בניין {apt.building_number} · דירה {apt.apartment_number}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {apt.pending.length} פריטים ממתינים
                              {apt.pendingWeight > 0 && ` · ${formatKg(apt.pendingWeight)}`}
                              {topCategories(apt.pending).map(c => ` · ${CATEGORY_LABELS[c] ?? c}`).join('')}
                            </p>
                          </div>
                          {idx === 0 && (
                            <Badge className="text-[10px] bg-primary/10 text-primary border-primary/20 flex-shrink-0">
                              התחל כאן
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Category-specific tips */}
                {categoriesWithTips.length > 0 && (
                  <div className="rounded-xl border border-border bg-card overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-border bg-muted/40 flex items-center gap-2">
                      <Lightbulb className="h-4 w-4 text-amber-500" />
                      <span className="font-bold text-sm">טיפים לפי סוג חומר</span>
                    </div>
                    <div className="divide-y divide-border/50">
                      {categoriesWithTips.map(cat => {
                        const tip = CATEGORY_TIPS[cat];
                        const TipIcon = tip.icon;
                        return (
                          <div key={cat} className="flex items-start gap-3 px-4 py-3">
                            <span className={`h-2.5 w-2.5 rounded-full mt-1.5 flex-shrink-0 ${CATEGORY_COLORS[cat] ?? 'bg-muted'}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold flex items-center gap-1.5">
                                {CATEGORY_LABELS[cat]}
                                <TipIcon className={`h-3.5 w-3.5 ${tip.color}`} />
                              </p>
                              <p className="text-[12px] text-muted-foreground leading-relaxed mt-0.5">{tip.tip}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* General tips */}
                <div className="rounded-xl border border-border bg-card px-4 py-3 space-y-2">
                  <p className="font-bold text-sm flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-amber-500" />
                    טיפים כלליים לתכנון
                  </p>
                  {[
                    'תאם את מועד האיסוף עם הדיירים לפחות 48 שעות מראש.',
                    'התחל מהקומות הגבוהות כלפי מטה — חסוך עבודה של נשיאה במדרגות.',
                    'פנה מסדרונות ומבואות לפני תחילת עבודה כדי לאפשר מעבר חופשי.',
                    'צלם מצב קיים לפני הפירוק לתיעוד ולמניעת טענות.',
                  ].map((t, i) => (
                    <p key={i} className="text-[12px] text-muted-foreground flex items-start gap-2">
                      <span className="text-primary font-bold flex-shrink-0 mt-0.5">{i + 1}.</span>
                      {t}
                    </p>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ═══ Tab: buildings ═══ */}
        {activeTab === 'buildings' && (
          <div className="space-y-3">
            {buildings.length === 0 ? (
              <EmptyState icon={Package} title="אין פריטים לאיסוף" description="לא סומנו פריטים לאיסוף בפרויקט זה." />
            ) : buildings.map(bld => (
              <div key={bld.building_number} className="rounded-xl border border-border bg-card overflow-hidden">
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
                              {apt.totalWeight > 0 && <span className="text-[11px] text-muted-foreground">{formatKg(apt.totalWeight)}</span>}
                              {topCategories([...apt.pending, ...apt.collected]).map(cat => <CategoryDot key={cat} cat={cat} />)}
                            </div>
                          </div>
                          {openApts[apt.id]
                            ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
                        </button>
                        {openApts[apt.id] && (
                          <div className="px-4 pb-2 bg-muted/20">
                            {[...apt.pending, ...apt.collected].map(item => (
                              <ItemRow key={item.id} {...itemRowProps(item)} />
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

        {/* ═══ Tab: materials ═══ */}
        {activeTab === 'materials' && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="grid grid-cols-[auto_1fr_1fr] gap-0 text-[11px] font-bold uppercase tracking-wide text-muted-foreground px-4 py-2 border-b border-border bg-muted/40">
              <span className="w-28">חומר</span>
              <span className="text-center">ממתינים</span>
              <span className="text-center">נאספו</span>
            </div>
            {materialSummary.map(([cat, data]) => (
              <div key={cat} className="grid grid-cols-[auto_1fr_1fr] items-center gap-0 px-4 py-3 border-b border-border/50 last:border-0 hover:bg-muted/30">
                <div className="w-28 flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${CATEGORY_COLORS[cat] ?? 'bg-muted-foreground'}`} />
                  <span className="text-sm font-semibold">{CATEGORY_LABELS[cat] ?? cat}</span>
                </div>
                <div className="text-center">
                  {data.pending > 0 ? (
                    <><p className="text-sm font-bold text-primary tabular-nums">{data.pending}</p>
                    {data.pendingWeight > 0 && <p className="text-[11px] text-muted-foreground">{formatKg(data.pendingWeight)}</p>}</>
                  ) : <span className="text-muted-foreground">—</span>}
                </div>
                <div className="text-center">
                  {data.collected > 0 ? (
                    <><p className="text-sm font-bold text-emerald-600 tabular-nums">{data.collected}</p>
                    {data.collectedWeight > 0 && <p className="text-[11px] text-muted-foreground">{formatKg(data.collectedWeight)}</p>}</>
                  ) : <span className="text-muted-foreground">—</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ═══ Tab: all items ═══ */}
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
                      {all.map(item => (
                        <ItemRow key={item.id} {...itemRowProps(item)} />
                      ))}
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
