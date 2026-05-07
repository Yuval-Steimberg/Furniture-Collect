// =========================================================================
// Sustainability Report — the artifact a developer customer pays for.
//
// Rendered as a full-screen page styled with JAS tokens. Print-to-PDF
// from any browser produces a clean, shareable document with correct
// Hebrew, cream paper, forest headlines, sage accents. No external PDF
// library needed — the browser's print engine handles Hebrew + embedded
// Google Fonts out of the box.
// =========================================================================
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import {
  MATERIAL_CO2_KG_PER_KG, MATERIAL_HE, formatKg, formatCO2, summarise,
  type ReportApartment, type ReportItem, type ReportProject, type MaterialCategory,
} from '@/lib/sustainability';

export default function SustainabilityReport() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<ReportProject | null>(null);
  const [apartments, setApartments] = useState<ReportApartment[]>([]);
  const [items, setItems] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { void load(); }, [projectId]);

  const load = async () => {
    try {
      const [{ data: proj }, { data: apts }, { data: its }] = await Promise.all([
        supabase.from('projects').select('id,name,city,developer_name,start_date').eq('id', projectId).single(),
        supabase.from('apartments').select('id,building_number,apartment_number,status').eq('project_id', projectId).order('building_number').order('apartment_number'),
        supabase.from('items').select('*').eq('project_id', projectId),
      ]);
      setProject(proj as any);
      setApartments((apts ?? []) as any);
      setItems((its ?? []) as any);
    } finally {
      setLoading(false);
    }
  };

  const summary = useMemo(() => summarise(items, apartments.length), [items, apartments]);

  const today = useMemo(() => {
    const d = new Date();
    return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
  }, []);

  // Per-apartment rollup for the detail table.
  const byApartment = useMemo(() => {
    const byId = new Map<string, ReportItem[]>();
    for (const it of items) {
      const aid = (it as any).apartment_id as string;
      if (!byId.has(aid)) byId.set(aid, []);
      byId.get(aid)!.push(it);
    }
    return apartments.map(apt => {
      const aptItems = byId.get(apt.id) ?? [];
      const summ = summarise(aptItems, 1);
      return { apt, items: aptItems, summ };
    });
  }, [apartments, items]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-background">טוען דוח…</div>;
  }
  if (!project) {
    return <div className="min-h-screen flex items-center justify-center bg-background">פרויקט לא נמצא</div>;
  }

  const maxMaterialKg = Math.max(1, ...summary.byMaterial.map(m => m.kg));

  return (
    <div dir="rtl" className="min-h-screen bg-background text-foreground">
      <PageHeader
        className="print:hidden"
        title="דוח קיימות"
        subtitle={project.name}
        onBack={() => navigate(-1)}
        actions={
          <Button onClick={() => window.print()} className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground" size="sm">
            <Printer className="h-4 w-4" />
            <span className="hidden sm:inline">הדפס / PDF</span>
          </Button>
        }
      />

      {/* Printable document */}
      <main className="max-w-5xl mx-auto px-6 sm:px-10 py-10 print:p-0 print:max-w-none">
        {/* Cover */}
        <section className="print:page-break-after-always pb-10 border-b border-border print:border-0">
          <div className="eyebrow mb-3">Sustainability report · דוח קיימות</div>
          <h1 className="text-4xl sm:text-5xl font-extrabold leading-tight mb-2">
            {project.name}
          </h1>
          <p className="text-muted-foreground text-lg mb-8">
            {project.city} · {project.developer_name} · התחלה {project.start_date}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-10">
            <HeroStat
              label="הוצל מהטמנה"
              value={formatKg(summary.diverted_kg)}
              sub={`${summary.collectedItems} פריטים מתוך ${summary.totalItems}`}
              accent="orange"
            />
            <HeroStat
              label="CO₂ שווה-ערך נחסך"
              value={formatCO2(summary.co2_saved_kg)}
              sub="על בסיס מקדמי DEFRA/EPA"
              accent="sage"
            />
            <HeroStat
              label="דירות תועדו"
              value={String(summary.apartmentCount)}
              sub={`הושלמו ${apartments.filter(a => a.status === 'COMPLETED').length}`}
              accent="slate"
            />
            <HeroStat
              label="פריטים סה״כ"
              value={String(summary.totalItems)}
              sub={`${summary.totalItems - summary.collectedItems} בתיעוד בלבד`}
              accent="slate"
            />
          </div>

          <div className="bg-accent/40 border border-accent rounded-lg p-4 text-sm text-foreground leading-relaxed">
            דוח זה מתעד את הפריטים שפונו מהפרויקט על ידי צוות Just A Second
            ונותבו לשימוש חוזר או מחזור חומרים, במקום להגיע להטמנה. החישובים מבוססים
            על מקדמי פליטה סטנדרטיים מ-UK DEFRA ו-EPA WARM.
          </div>
        </section>

        {/* Material breakdown */}
        <section className="pt-10 pb-10 border-b border-border print:border-0 print:page-break-after-always">
          <div className="eyebrow mb-2">פילוח לפי חומר</div>
          <h2 className="text-3xl font-extrabold mb-6">חלוקת הפניה לפי חומר</h2>

          <div className="space-y-3">
            {summary.byMaterial.length === 0 && (
              <p className="text-muted-foreground">עדיין לא נאספו פריטים בפרויקט זה.</p>
            )}
            {summary.byMaterial.map(m => (
              <div key={m.material} className="grid grid-cols-[8rem_1fr_auto] items-center gap-3">
                <div className="font-semibold">{MATERIAL_HE[m.material]}</div>
                <div className="h-3 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-accent" style={{ width: `${(m.kg / maxMaterialKg) * 100}%` }} />
                </div>
                <div className="text-sm text-muted-foreground tabular-nums whitespace-nowrap">
                  {formatKg(m.kg)} · {formatCO2(m.co2_kg)}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-accent/50">
                <tr>
                  <th className="text-right p-2 border-b border-border font-semibold">חומר</th>
                  <th className="text-right p-2 border-b border-border font-semibold">פריטים</th>
                  <th className="text-right p-2 border-b border-border font-semibold">משקל</th>
                  <th className="text-right p-2 border-b border-border font-semibold">מקדם CO₂</th>
                  <th className="text-right p-2 border-b border-border font-semibold">CO₂ נחסך</th>
                </tr>
              </thead>
              <tbody>
                {summary.byMaterial.map(m => (
                  <tr key={m.material} className="border-b border-border/50">
                    <td className="p-2">{MATERIAL_HE[m.material]}</td>
                    <td className="p-2">{m.itemCount}</td>
                    <td className="p-2">{formatKg(m.kg)}</td>
                    <td className="p-2 text-muted-foreground">{MATERIAL_CO2_KG_PER_KG[m.material as MaterialCategory]}</td>
                    <td className="p-2 font-semibold">{formatCO2(m.co2_kg)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-foreground font-bold">
                  <td className="p-2">סה״כ</td>
                  <td className="p-2">{summary.collectedItems}</td>
                  <td className="p-2">{formatKg(summary.diverted_kg)}</td>
                  <td className="p-2"></td>
                  <td className="p-2">{formatCO2(summary.co2_saved_kg)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Per-apartment detail */}
        <section className="pt-10 pb-10 border-b border-border print:border-0">
          <div className="eyebrow mb-2">פירוט לפי דירה</div>
          <h2 className="text-3xl font-extrabold mb-6">סיכום לכל דירה</h2>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-accent/50">
                <tr>
                  <th className="text-right p-2 border-b border-border font-semibold">בניין</th>
                  <th className="text-right p-2 border-b border-border font-semibold">דירה</th>
                  <th className="text-right p-2 border-b border-border font-semibold">סטטוס</th>
                  <th className="text-right p-2 border-b border-border font-semibold">פריטים</th>
                  <th className="text-right p-2 border-b border-border font-semibold">נאספו</th>
                  <th className="text-right p-2 border-b border-border font-semibold">משקל</th>
                  <th className="text-right p-2 border-b border-border font-semibold">CO₂ נחסך</th>
                </tr>
              </thead>
              <tbody>
                {byApartment.map(({ apt, summ }) => (
                  <tr key={apt.id} className="border-b border-border/50">
                    <td className="p-2">{apt.building_number}</td>
                    <td className="p-2">{apt.apartment_number}</td>
                    <td className="p-2 text-muted-foreground">{statusHe(apt.status)}</td>
                    <td className="p-2">{summ.totalItems}</td>
                    <td className="p-2">{summ.collectedItems}</td>
                    <td className="p-2">{summ.diverted_kg > 0 ? formatKg(summ.diverted_kg) : '—'}</td>
                    <td className="p-2">{summ.co2_saved_kg > 0 ? formatCO2(summ.co2_saved_kg) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Photo log — only items that have an image */}
        {items.filter(i => i.image_url).length > 0 && (
          <section className="pt-10 pb-10 border-b border-border print:border-0">
            <div className="eyebrow mb-2">תיעוד חזותי</div>
            <h2 className="text-3xl font-extrabold mb-6">פריטים נבחרים</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {items.filter(i => i.image_url).slice(0, 30).map(it => (
                <figure key={it.id} className="border border-border rounded-lg overflow-hidden bg-card">
                  <img src={it.image_url!} alt={it.description} className="aspect-square object-cover w-full" loading="lazy" />
                  <figcaption className="p-2 text-xs">
                    <p className="font-semibold truncate">{it.description}</p>
                    <p className="text-muted-foreground truncate">
                      {it.location ?? ''}{it.estimated_weight_kg ? ` · ${it.estimated_weight_kg} ק"ג` : ''}
                    </p>
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}

        {/* Certification */}
        <section className="pt-10 pb-20">
          <div className="bg-card border border-border rounded-xl p-6 sm:p-8">
            <div className="eyebrow mb-2">אישור</div>
            <p className="text-base leading-relaxed mb-6">
              אנו מאשרים כי הפריטים לעיל תועדו ופונו בהתאם ליעדי מיחזור ושימוש חוזר
              של <strong>Just A Second</strong>. דוח זה נוצר אוטומטית מתיעוד מערכת
              ההפינוי ב־{today}.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <div className="text-xs text-muted-foreground mb-1">הופק עבור</div>
                <div className="font-semibold">{project.developer_name}</div>
                <div className="text-sm text-muted-foreground">{project.city}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">מטעם</div>
                <div className="font-semibold">Just A Second · ג׳אסט א סקונד</div>
                <div className="text-sm text-muted-foreground">Noa Berant</div>
              </div>
            </div>
          </div>
          <p className="text-center text-xs text-muted-foreground mt-8">
            Just A Second · ג׳אסט א סקונד · {project.name} · {today}
          </p>
        </section>
      </main>

      <PrintStyles />
    </div>
  );
}

function HeroStat({
  label, value, sub, accent,
}: { label: string; value: string; sub?: string; accent: 'orange' | 'sage' | 'slate' }) {
  const accentCls = {
    orange: 'text-primary',
    sage: 'text-accent-foreground',
    slate: 'text-foreground',
  }[accent];
  return (
    <div className="bg-card border border-border rounded-xl p-5 sm:p-6">
      <div className="eyebrow mb-2">{label}</div>
      <div className={`text-3xl sm:text-4xl font-extrabold ${accentCls}`}>{value}</div>
      {sub && <div className="text-sm text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

function statusHe(s: string): string {
  if (s === 'COMPLETED') return 'הושלם';
  if (s === 'DOCUMENTING') return 'בתיעוד';
  if (s === 'NOT_STARTED') return 'לא החל';
  return s;
}

// Injects print-only CSS so the browser's "Save as PDF" produces a clean
// paper-like page: no sidebar, no chrome, forced page breaks in the right
// places, cream background, higher contrast text.
function PrintStyles() {
  return (
    <style>{`
      @media print {
        @page { size: A4; margin: 18mm 14mm; }
        body { background: #FFFCF5 !important; }
        .print\\:hidden { display: none !important; }
        .print\\:page-break-after-always { page-break-after: always; }
        .print\\:border-0 { border: 0 !important; }
        .print\\:p-0 { padding: 0 !important; }
        .print\\:max-w-none { max-width: none !important; }
      }
    `}</style>
  );
}
