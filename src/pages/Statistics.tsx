import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Download, ChevronLeft } from 'lucide-react';
import { toast } from 'sonner';

const CATEGORY_LABELS: Record<string, string> = {
  glass: 'זכוכית',
  aluminum: 'אלומיניום',
  wood: 'עץ',
  plastic: 'פלסטיק',
  metal: 'מתכת',
  textile: 'טקסטיל',
  electrical: 'חשמלי',
  other: 'אחר',
};

export default function Statistics() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [stats, setStats] = useState<any>(null);
  const [aiStats, setAiStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadingAI, setLoadingAI] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categoryItems, setCategoryItems] = useState<any[]>([]);

  useEffect(() => {
    loadStats();
  }, [projectId]);

  const loadStats = async () => {
    try {
      const { data: items, error } = await supabase
        .from('items')
        .select('*, apartments(building_number, apartment_number)')
        .eq('project_id', projectId);

      if (error) throw error;

      const totalItems = items.length;
      const intendedForCollection = items.filter(i => i.intended_for_collection).length;
      const collected = items.filter(i => i.collected).length;
      const pending = intendedForCollection - collected;
      const notForCollection = items.filter(i => !i.intended_for_collection).length;

      const collectedItems = items.filter(i => i.collected);
      const notCollectedItems = items.filter(i => !i.collected);

      const materialGroups = items.reduce((acc: any, item) => {
        const cat = item.material_category;
        if (!acc[cat]) acc[cat] = { count: 0, weight: 0 };
        acc[cat].count += item.quantity;
        acc[cat].weight += (item.estimated_weight_kg || 0) * item.quantity;
        return acc;
      }, {});

      setStats({
        totalItems,
        intendedForCollection,
        collected,
        pending,
        notForCollection,
        materialGroups,
        items,
        collectedItems,
        notCollectedItems,
      });

      // Calculate AI statistics
      if (items.length > 0) {
        loadAIStats(items);
      }
    } catch (error: any) {
      toast.error('שגיאה בטעינת סטטיסטיקות');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const loadAIStats = async (items: any[]) => {
    try {
      setLoadingAI(true);
      const collectedItems = items.filter(i => i.collected);
      const notCollectedItems = items.filter(i => !i.collected);

      const [collectedStats, notCollectedStats] = await Promise.all([
        collectedItems.length > 0 
          ? supabase.functions.invoke('calculate-statistics', { body: { items: collectedItems } })
          : { data: { total_weight_kg: 0, co2_saved_kg: 0 } },
        notCollectedItems.length > 0
          ? supabase.functions.invoke('calculate-statistics', { body: { items: notCollectedItems } })
          : { data: { total_weight_kg: 0, co2_saved_kg: 0 } }
      ]);

      setAiStats({
        collected: collectedStats.data || { total_weight_kg: 0, co2_saved_kg: 0 },
        notCollected: notCollectedStats.data || { total_weight_kg: 0, co2_saved_kg: 0 },
      });
    } catch (error) {
      console.error('Error loading AI stats:', error);
      toast.error('שגיאה בחישוב סטטיסטיקות AI');
    } finally {
      setLoadingAI(false);
    }
  };

  const handleCategoryClick = (category: string) => {
    const items = stats?.items.filter((item: any) => item.material_category === category) || [];
    setCategoryItems(items);
    setSelectedCategory(category);
  };

  const exportToExcel = () => {
    if (!stats?.items) return;
    
    const csv = [
      ['תיאור', 'כמות', 'מיקום', 'לאיסוף', 'נאסף', 'סוג', 'קטגוריה', 'משקל משוער (ק"ג)', 'בניין', 'דירה'].join(','),
      ...stats.items.map((item: any) => [
        item.description,
        item.quantity,
        item.location || '',
        item.intended_for_collection ? 'כן' : 'לא',
        item.collected ? 'כן' : 'לא',
        item.item_type,
        item.material_category,
        item.estimated_weight_kg || '',
        item.apartments?.building_number || '',
        item.apartments?.apartment_number || ''
      ].join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `project-${projectId}-export.csv`;
    link.click();
    toast.success('הקובץ יוצא בהצלחה');
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center">טוען...</div>;

  return (
    <div className="min-h-screen bg-muted" dir="rtl">
      <header className="bg-sidebar text-sidebar-foreground shadow-md">
        <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4">
          <div className="flex items-center gap-2 sm:gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(`/projects/${projectId}`)} className="text-sidebar-foreground hover:bg-sidebar-accent h-9 w-9 sm:h-10 sm:w-10">
              <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
            <h1 className="text-lg sm:text-xl font-bold flex-1 truncate">סטטיסטיקות</h1>
            <Button variant="secondary" size="sm" onClick={exportToExcel} className="gap-2 h-9 flex-shrink-0">
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">ייצוא</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-6">
        <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4 mb-4 sm:mb-6">
          <Card>
            <CardHeader className="p-3 sm:pb-2 sm:px-6 sm:pt-6">
              <CardTitle className="text-xs sm:text-sm font-medium">סה"כ פריטים</CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:px-6 sm:pb-6">
              <div className="text-2xl sm:text-3xl font-bold">{stats?.totalItems || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="p-3 sm:pb-2 sm:px-6 sm:pt-6">
              <CardTitle className="text-xs sm:text-sm font-medium">לאיסוף</CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:px-6 sm:pb-6">
              <div className="text-2xl sm:text-3xl font-bold">{stats?.intendedForCollection || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="p-3 sm:pb-2 sm:px-6 sm:pt-6">
              <CardTitle className="text-xs sm:text-sm font-medium">נאספו</CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:px-6 sm:pb-6">
              <div className="text-2xl sm:text-3xl font-bold text-success">{stats?.collected || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="p-3 sm:pb-2 sm:px-6 sm:pt-6">
              <CardTitle className="text-xs sm:text-sm font-medium">ממתינים</CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:px-6 sm:pb-6">
              <div className="text-2xl sm:text-3xl font-bold text-warning">{stats?.pending || 0}</div>
            </CardContent>
          </Card>
        </div>

        {aiStats && (
          <div className="grid gap-3 sm:gap-4 md:grid-cols-2 mb-4 sm:mb-6">
            <Card>
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-success"></span>
                  פריטים שנאספו
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 space-y-3">
                {loadingAI ? (
                  <div className="text-center py-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">משקל משוער:</span>
                      <span className="text-xl font-bold">{aiStats.collected?.total_weight_kg?.toFixed(1) || 0} ק"ג</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">CO₂ נחסך:</span>
                      <span className="text-xl font-bold text-success">{aiStats.collected?.co2_saved_kg?.toFixed(1) || 0} ק"ג</span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-muted"></span>
                  פריטים שלא נאספו
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 space-y-3">
                {loadingAI ? (
                  <div className="text-center py-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">משקל משוער:</span>
                      <span className="text-xl font-bold">{aiStats.notCollected?.total_weight_kg?.toFixed(1) || 0} ק"ג</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">CO₂ פוטנציאלי:</span>
                      <span className="text-xl font-bold text-muted-foreground">{aiStats.notCollected?.co2_saved_kg?.toFixed(1) || 0} ק"ג</span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        <Card>
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-base sm:text-lg">חלוקה לפי קטגוריית חומר</CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            <div className="space-y-2 sm:space-y-3">
              {stats?.materialGroups && Object.entries(stats.materialGroups)
                .sort(([, a]: [string, any], [, b]: [string, any]) => b.count - a.count)
                .map(([category, data]: [string, any]) => (
                <Card 
                  key={category}
                  className="cursor-pointer hover:shadow-md hover:border-primary/50 transition-all"
                  onClick={() => handleCategoryClick(category)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg mb-1">
                          {CATEGORY_LABELS[category] || category}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          פריטים: {data.count}
                        </p>
                      </div>
                      <ChevronLeft className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Category Items Dialog */}
        <Dialog open={selectedCategory !== null} onOpenChange={() => setSelectedCategory(null)}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto" dir="rtl">
            <DialogHeader>
              <DialogTitle className="text-xl">
                {selectedCategory && CATEGORY_LABELS[selectedCategory]} - כל הפריטים
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 mt-4">
              {categoryItems.map((item: any) => (
                <Card key={item.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="font-semibold text-base break-words">{item.description}</h4>
                          {item.collected ? (
                            <Badge className="bg-success text-success-foreground flex-shrink-0">נאסף</Badge>
                          ) : item.intended_for_collection ? (
                            <Badge variant="secondary" className="flex-shrink-0">ממתין לאיסוף</Badge>
                          ) : (
                            <Badge variant="outline" className="flex-shrink-0">תיעוד</Badge>
                          )}
                        </div>
                        <div className="space-y-1 text-sm text-muted-foreground">
                          <p>כמות: {item.quantity}</p>
                          {item.location && <p>מיקום: {item.location}</p>}
                          {item.apartments && (
                            <p>
                              בניין {item.apartments.building_number} · דירה {item.apartments.apartment_number}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {categoryItems.length === 0 && (
                <p className="text-center text-muted-foreground py-8">אין פריטים בקטגוריה זו</p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}