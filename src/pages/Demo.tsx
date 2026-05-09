import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  Mic,
  Camera,
  WifiOff,
  Share2,
  BarChart3,
  Zap,
  Sparkles,
  ArrowLeft,
  Trash2,
  Play,
} from 'lucide-react';

interface FeatureCard {
  icon: React.ElementType;
  title: string;
  description: string;
}

const FEATURES: FeatureCard[] = [
  {
    icon: Mic,
    title: 'הקלטה חכמה',
    description: 'הקלט בקול חופשי — ה-AI מזהה ומוסיף פריטים אוטומטית',
  },
  {
    icon: Camera,
    title: 'צילום ואיתור',
    description: 'צלם חדר — ה-AI מזהה את כל הפריטים בתמונה',
  },
  {
    icon: WifiOff,
    title: 'עבודה אופליין',
    description: 'עובד גם ללא אינטרנט — מסתנכרן בחזרה לרשת',
  },
  {
    icon: Share2,
    title: 'דוח חי',
    description: 'שתף קישור לדוח חי לבעלי עניין ומנהלים',
  },
  {
    icon: BarChart3,
    title: 'סטטיסטיקות',
    description: 'דוחות קיימות, חיסכון CO₂ וניתוח חומרים',
  },
  {
    icon: Zap,
    title: 'בזמן אמת',
    description: 'עדכונים בזמן אמת לכל חברי הצוות',
  },
];

const DEMO_APTS = [
  { building_number: '1', apartment_number: '101' },
  { building_number: '1', apartment_number: '102' },
  { building_number: '1', apartment_number: '103' },
  { building_number: '2', apartment_number: '201' },
  { building_number: '2', apartment_number: '202' },
  { building_number: '2', apartment_number: '203' },
];

const DEMO_ITEMS = [
  { desc: 'ספה תלת-מושבית עור', loc: 'סלון', mat: 'other', type: 'furniture', qty: 1, kg: 45 },
  { desc: 'שולחן אוכל + 6 כסאות', loc: 'פינת אוכל', mat: 'wood', type: 'furniture', qty: 1, kg: 60 },
  { desc: 'ארון בגדים 3 דלתות', loc: 'חדר שינה ראשי', mat: 'wood', type: 'furniture', qty: 1, kg: 80 },
  { desc: 'מיטה זוגית עם ארגז', loc: 'חדר שינה ראשי', mat: 'wood', type: 'furniture', qty: 1, kg: 50 },
  { desc: 'מקרר 2 דלתות', loc: 'מטבח', mat: 'metal', type: 'appliance', qty: 1, kg: 70 },
  { desc: 'מכונת כביסה', loc: 'מטבח', mat: 'metal', type: 'appliance', qty: 1, kg: 65 },
  { desc: 'מזגן + יחידה חיצונית', loc: 'סלון', mat: 'electrical', type: 'appliance', qty: 1, kg: 25 },
  { desc: 'ספת שינה', loc: 'חדר ילדים', mat: 'wood', type: 'furniture', qty: 1, kg: 40 },
  { desc: 'שולחן ילדים', loc: 'חדר ילדים', mat: 'wood', type: 'furniture', qty: 1, kg: 15 },
  { desc: 'מדף ספרים', loc: 'סלון', mat: 'wood', type: 'furniture', qty: 1, kg: 20 },
];

export default function Demo() {
  const navigate = useNavigate();
  const [seeding, setSeeding] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [demoProjectId, setDemoProjectId] = useState<string | null>(null);

  const seedDemo = async () => {
    setSeeding(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        navigate('/auth');
        return;
      }

      // Create demo project
      const { data: proj } = await supabase
        .from('projects')
        .insert({
          name: 'פרויקט דמו — רחוב הדוגמה 1',
          city: 'תל אביב',
          developer_name: 'חברת דמו בע"מ',
          created_by_user_id: user.id,
        } as any)
        .select('id')
        .single();

      if (!proj) throw new Error('failed to create project');
      const projectId = (proj as { id: string }).id;

      // Add user to project
      await supabase
        .from('user_projects')
        .insert({ user_id: user.id, project_id: projectId, project_role: 'PROJECT_MANAGER' } as any);

      // Create apartments
      const { data: apts } = await supabase
        .from('apartments')
        .insert(
          DEMO_APTS.map(a => ({ ...a, project_id: projectId, status: 'NOT_STARTED' })) as any
        )
        .select('id,building_number,apartment_number');

      // Seed items
      if (apts && apts.length > 0) {
        const itemRows = DEMO_ITEMS.map((di, i) => {
          const apt = (apts as Array<{ id: string; building_number: string; apartment_number: string }>)[i % apts.length];
          return {
            apartment_id: apt.id,
            project_id: projectId,
            created_by_user_id: user.id,
            description: di.desc,
            location: di.loc,
            material_category: di.mat,
            item_type: di.type,
            quantity: di.qty,
            estimated_weight_kg: di.kg,
            intended_for_collection: true,
            collected: i < 4,
            source: 'manual',
          };
        });
        await supabase.from('items').insert(itemRows as any);
      }

      setDemoProjectId(projectId);
      toast.success('נתוני הדמו נטענו בהצלחה!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error('שגיאה בטעינת נתוני דמו: ' + msg);
    } finally {
      setSeeding(false);
    }
  };

  const deleteDemo = async () => {
    if (!demoProjectId) return;
    setDeleting(true);
    try {
      await supabase.from('items').delete().eq('project_id', demoProjectId);
      await supabase.from('apartments').delete().eq('project_id', demoProjectId);
      await supabase.from('user_projects').delete().eq('project_id', demoProjectId);
      await supabase.from('projects').delete().eq('id', demoProjectId);
      setDemoProjectId(null);
      toast.success('נתוני הדמו נמחקו');
    } catch {
      toast.error('שגיאה במחיקת נתוני דמו');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-white">
      {/* Hero / header */}
      <div className="bg-gradient-to-l from-primary to-primary/80 text-primary-foreground">
        <div className="max-w-4xl mx-auto px-4 py-16 sm:py-24 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Sparkles className="h-7 w-7 opacity-80" />
            <span className="text-sm font-semibold tracking-wide opacity-80 uppercase">
              Demo
            </span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-bold leading-tight mb-4">
            FurniCollect — פלטפורמת ניהול פינוי ריהוט
          </h1>
          <p className="text-lg sm:text-xl opacity-90 mb-8 max-w-2xl mx-auto">
            ניהול מלא של תהליך פינוי בינוי — מתיעוד פריטים ועד דוח קיימות
          </p>
          <Button
            size="lg"
            variant="secondary"
            className="gap-2 text-base px-8 py-6 h-auto shadow-lg"
            onClick={() => navigate('/auth')}
          >
            <Play className="h-5 w-5" />
            נסה את המערכת
          </Button>
        </div>
      </div>

      {/* Feature grid */}
      <div className="max-w-4xl mx-auto px-4 py-14">
        <h2 className="text-2xl font-bold text-center mb-10 text-foreground">
          כל מה שצריך — במקום אחד
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map(f => (
            <div
              key={f.title}
              className="rounded-xl border bg-card p-5 flex gap-4 items-start shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <f.icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-card-foreground mb-1">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Demo data section */}
      <div className="max-w-4xl mx-auto px-4 pb-16">
        <div className="rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 p-8">
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold mb-2">סביבת דמו</h2>
            <p className="text-muted-foreground text-sm max-w-md mx-auto">
              לחץ על &#39;טען נתוני דמו&#39; כדי ליצור פרויקט לדוגמה עם בניינים, דירות ופריטים.
            </p>
          </div>

          {!demoProjectId ? (
            <div className="flex justify-center">
              <Button
                size="lg"
                disabled={seeding}
                onClick={() => void seedDemo()}
                className="gap-2 px-8"
              >
                {seeding ? (
                  <>
                    <span className="animate-spin">⟳</span>
                    טוען...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    טען נתוני דמו
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="rounded-xl border bg-card p-6 text-center space-y-4 max-w-sm mx-auto shadow-sm">
              <p className="text-lg font-semibold">פרויקט הדמו נוצר בהצלחה! 🎉</p>
              <p className="text-sm text-muted-foreground">
                6 דירות ו-10 פריטים נוצרו בפרויקט הדמו.
              </p>
              <div className="flex flex-col gap-2">
                <Button
                  className="gap-2 w-full"
                  onClick={() => navigate(`/projects/${demoProjectId}`)}
                >
                  <ArrowLeft className="h-4 w-4" />
                  פתח פרויקט דמו
                </Button>
                <Button
                  variant="outline"
                  className="gap-2 w-full text-destructive border-destructive/30 hover:bg-destructive/5"
                  disabled={deleting}
                  onClick={() => void deleteDemo()}
                >
                  <Trash2 className="h-4 w-4" />
                  {deleting ? 'מוחק...' : 'מחק נתוני דמו'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
