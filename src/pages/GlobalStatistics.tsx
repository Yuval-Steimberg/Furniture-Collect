import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Download, Send, Loader2, List, BarChart3, PieChart as PieChartIcon, FileSpreadsheet, FileText, FileBarChart, Users } from 'lucide-react';
import { toast } from 'sonner';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { exportToCSV, exportToExcel, exportToPDF } from '@/lib/exportUtils';
import { generateExecutiveReport } from '@/lib/executiveReportPDF';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#F97316', '#EC4899'];

const CO2_FACTORS: Record<string, number> = {
  wood: 0.5,
  metal: 2.5,
  plastic: 3.0,
  glass: 0.8,
  aluminum: 8.0,
  textile: 1.5,
  electrical: 2.0,
  other: 1.0,
};

const CATEGORY_TRANSLATIONS: Record<string, string> = {
  wood: 'עץ',
  metal: 'מתכת',
  plastic: 'פלסטיק',
  glass: 'זכוכית',
  aluminum: 'אלומיניום',
  textile: 'טקסטיל',
  electrical: 'חשמל',
  other: 'אחר',
};

export default function GlobalStatistics() {
  const [stats, setStats] = useState<any>(null);
  const [aiStats, setAiStats] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [collectionFilter, setCollectionFilter] = useState<string>('all');
  const [intentFilter, setIntentFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [loadingAI, setLoadingAI] = useState(false);
  
  // AI Question
  const [question, setQuestion] = useState('');
  const [aiAnswer, setAiAnswer] = useState('');
  const [askingAI, setAskingAI] = useState(false);
  
  // View mode for category breakdown
  const [categoryViewMode, setCategoryViewMode] = useState<'list' | 'bar' | 'pie'>('list');

  useEffect(() => {
    loadData();
  }, [selectedProject, selectedCategory, collectionFilter, intentFilter]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load all projects
      const { data: projectsData, error: projectsError } = await supabase
        .from('projects')
        .select('id, name');
      
      if (projectsError) throw projectsError;
      setProjects(projectsData || []);

      // Load items based on filters
      let query = supabase
        .from('items')
        .select('*, apartments(building_number, apartment_number), projects(name)');
      
      if (selectedProject !== 'all') {
        query = query.eq('project_id', selectedProject);
      }
      if (selectedCategory !== 'all' && selectedCategory in CATEGORY_TRANSLATIONS) {
        query = query.eq('material_category', selectedCategory as any);
      }
      if (collectionFilter === 'collected') {
        query = query.eq('collected', true);
      } else if (collectionFilter === 'not_collected') {
        query = query.eq('collected', false);
      }
      if (intentFilter === 'for_collection') {
        query = query.eq('intended_for_collection', true);
      } else if (intentFilter === 'documentation_only') {
        query = query.eq('intended_for_collection', false);
      }

      const { data: items, error } = await query;
      if (error) throw error;

      // Calculate statistics
      const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
      const intendedForCollection = items.filter(i => i.intended_for_collection).reduce((sum, i) => sum + i.quantity, 0);
      const collected = items.filter(i => i.collected).reduce((sum, i) => sum + i.quantity, 0);
      const pending = intendedForCollection - collected;

      const materialGroups = items.reduce((acc: any, item) => {
        const cat = item.material_category;
        if (!acc[cat]) acc[cat] = { count: 0, weight: 0, co2Saved: 0 };
        const weight = (item.estimated_weight_kg || 0) * item.quantity;
        acc[cat].count += item.quantity;
        acc[cat].weight += weight;
        acc[cat].co2Saved += weight * (CO2_FACTORS[cat] || 1);
        return acc;
      }, {});

      const totalWeight = Object.values(materialGroups).reduce((sum: number, g: any) => sum + g.weight, 0);
      const totalCO2 = Object.values(materialGroups).reduce((sum: number, g: any) => sum + g.co2Saved, 0);

      // Prepare chart data with percentages — sorted by count desc
      const materialChartData = Object.entries(materialGroups)
        .map(([name, data]: [string, any]) => ({
          name: CATEGORY_TRANSLATIONS[name] || name,
          rawName: name,
          weight: parseFloat(data.weight.toFixed(1)),
          count: data.count,
          percentage: totalItems > 0 ? parseFloat(((data.count / totalItems) * 100).toFixed(1)) : 0,
          co2: parseFloat(data.co2Saved.toFixed(1)),
        }))
        .sort((a, b) => b.count - a.count);

      // Collector leaderboard from collected_by text field
      const collectorGroups: Record<string, number> = {};
      items.forEach((item: any) => {
        if (item.collected && item.collected_by) {
          collectorGroups[item.collected_by] = (collectorGroups[item.collected_by] || 0) + item.quantity;
        }
      });
      const collectorStats = Object.entries(collectorGroups)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

      setStats({
        totalItems,
        intendedForCollection,
        collected,
        pending,
        totalWeight,
        totalCO2,
        materialGroups,
        materialChartData,
        collectorStats,
        items,
        collectedItems: items.filter((i: any) => i.collected),
        notCollectedItems: items.filter((i: any) => !i.collected),
      });

      // Calculate AI statistics
      if (items.length > 0) {
        loadAIStats(items);
      } else {
        setAiStats(null);
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
        collectedCount: collectedItems.reduce((sum, i) => sum + i.quantity, 0),
        notCollectedCount: notCollectedItems.reduce((sum, i) => sum + i.quantity, 0),
      });
    } catch (error) {
      console.error('Error loading AI stats:', error);
    } finally {
      setLoadingAI(false);
    }
  };

  const askAIQuestion = async () => {
    if (!question.trim() || !stats) return;
    
    try {
      setAskingAI(true);
      setAiAnswer('');
      
      // Prepare summary data for AI
      const itemsSummary = `
סה"כ פריטים: ${stats.totalItems}
פריטים שנאספו: ${stats.collected}
פריטים שלא נאספו: ${stats.totalItems - stats.collected}
משקל כולל משוער: ${stats.totalWeight?.toFixed(1)} ק"ג
CO2 נחסך משוער: ${stats.totalCO2?.toFixed(1)} ק"ג

פירוט לפי קטגוריה:
${stats.materialChartData?.map((c: any) => `- ${c.name}: ${c.count} פריטים (${c.percentage}%), ${c.weight} ק"ג`).join('\n')}
      `;
      
      const projectsSummary = projects.map(p => p.name).join(', ');
      
      const { data, error } = await supabase.functions.invoke('ask-statistics-question', {
        body: { question, itemsSummary, projectsSummary }
      });
      
      if (error) throw error;
      setAiAnswer(data.answer);
    } catch (error: any) {
      toast.error('שגיאה בשליחת השאלה');
      console.error(error);
    } finally {
      setAskingAI(false);
    }
  };

  const [exporting, setExporting] = useState<'csv' | 'excel' | 'pdf' | 'executive' | null>(null);

  const handleExportCSV = () => {
    if (!stats?.items) return;
    const filename = `statistics-${selectedProject}-${new Date().toISOString().split('T')[0]}`;
    exportToCSV(stats, filename);
    toast.success('קובץ CSV יוצא בהצלחה');
  };

  const handleExportExcel = async () => {
    if (!stats?.items) return;
    setExporting('excel');
    try {
      const filename = `statistics-${selectedProject}-${new Date().toISOString().split('T')[0]}`;
      await exportToExcel(stats, projects, filename);
      toast.success('קובץ Excel יוצא בהצלחה');
    } catch (err) {
      console.error('Excel export failed:', err);
      toast.error('שגיאה בייצוא Excel');
    } finally {
      setExporting(null);
    }
  };

  const handleExportPDF = async () => {
    if (!stats?.items) return;
    setExporting('pdf');
    try {
      const filename = `statistics-${selectedProject}-${new Date().toISOString().split('T')[0]}`;
      await exportToPDF(stats, projects, selectedProject, filename);
      toast.success('קובץ PDF יוצא בהצלחה');
    } catch (err) {
      console.error('PDF export failed:', err);
      toast.error('שגיאה בייצוא PDF');
    } finally {
      setExporting(null);
    }
  };

  const handleExportExecutive = async () => {
    if (!stats?.items) return;
    setExporting('executive');
    try {
      const projectName = selectedProject === 'all' 
        ? 'כל הפרויקטים' 
        : projects.find(p => p.id === selectedProject)?.name || 'פרויקט';
      await generateExecutiveReport({
        projectName,
        projectAddress: '',
        items: stats.items,
      });
      toast.success('דוח מנהלים הורד בהצלחה');
    } catch (err) {
      console.error('Executive report failed:', err);
      toast.error('שגיאה ביצירת דוח מנהלים');
    } finally {
      setExporting(null);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center">טוען...</div>;

  const collectedPercentage = stats?.totalItems > 0 ? ((stats.collected / stats.totalItems) * 100).toFixed(1) : 0;
  const pendingPercentage = stats?.totalItems > 0 ? (((stats.totalItems - stats.collected) / stats.totalItems) * 100).toFixed(1) : 0;

  return (
    <div className="min-h-screen bg-muted" dir="rtl">
      <header className="bg-card border-b sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl md:text-2xl font-bold">סטטיסטיקות כלליות</h1>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleExportCSV} 
                disabled={!!exporting}
                className="gap-1.5"
                title="ייצוא CSV"
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">CSV</span>
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleExportExcel} 
                disabled={!!exporting}
                className="gap-1.5"
                title="ייצוא Excel"
              >
                {exporting === 'excel' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileSpreadsheet className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">Excel</span>
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleExportPDF} 
                disabled={!!exporting}
                className="gap-1.5"
                title="ייצוא PDF"
              >
                {exporting === 'pdf' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">PDF</span>
              </Button>
              <Button 
                variant="default" 
                size="sm" 
                onClick={handleExportExecutive} 
                disabled={!!exporting}
                className="gap-1.5 bg-primary"
                title="דוח מנהלים מקצועי"
              >
                {exporting === 'executive' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileBarChart className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">דוח מנהלים</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-4 md:py-6 space-y-4 md:space-y-6">
        {/* Filters */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">סינון</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
              <div>
                <Label className="text-xs mb-1 block">פרויקט</Label>
                <Select value={selectedProject} onValueChange={setSelectedProject}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">הכל</SelectItem>
                    {projects.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs mb-1 block">קטגוריה</Label>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">הכל</SelectItem>
                    {Object.entries(CATEGORY_TRANSLATIONS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs mb-1 block">סטטוס איסוף</Label>
                <Select value={collectionFilter} onValueChange={setCollectionFilter}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">הכל</SelectItem>
                    <SelectItem value="collected">נאספו</SelectItem>
                    <SelectItem value="not_collected">לא נאספו</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs mb-1 block">סוג פריט</Label>
                <Select value={intentFilter} onValueChange={setIntentFilter}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">הכל</SelectItem>
                    <SelectItem value="for_collection">לאיסוף</SelectItem>
                    <SelectItem value="documentation_only">לתיעוד בלבד</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* AI Question */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">שאל שאלה</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="לדוגמא: כמה CO2 נחסך מפרויקט נסיון 1?"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && askAIQuestion()}
                className="flex-1"
              />
              <Button onClick={askAIQuestion} disabled={askingAI || !question.trim()} size="icon">
                {askingAI ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
            {aiAnswer && (
              <div className="p-3 bg-muted rounded-lg text-sm whitespace-pre-wrap">
                {aiAnswer}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bento Grid */}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4 md:grid-rows-2">
          {/* Total items - large card spanning 2 cols */}
          <Card className="col-span-2 row-span-2 bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
            <CardContent className="pt-6 pb-4 flex flex-col justify-between h-full">
              <div className="text-sm text-muted-foreground mb-2">סה"כ פריטים</div>
              <div className="text-5xl md:text-6xl font-bold text-primary">{stats?.totalItems || 0}</div>
              <div className="mt-4 flex gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">לאיסוף: </span>
                  <span className="font-semibold">{stats?.intendedForCollection || 0}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Collected */}
          <Card className="bg-gradient-to-br from-success/15 to-success/5 border-success/20">
            <CardContent className="pt-4 pb-3">
              <div className="text-xs text-muted-foreground mb-1">נאספו</div>
              <div className="text-2xl md:text-3xl font-bold text-success">{stats?.collected || 0}</div>
              <div className="text-xs text-success font-medium">{collectedPercentage}%</div>
            </CardContent>
          </Card>

          {/* Pending */}
          <Card className="bg-gradient-to-br from-warning/15 to-warning/5 border-warning/20">
            <CardContent className="pt-4 pb-3">
              <div className="text-xs text-muted-foreground mb-1">ממתינים</div>
              <div className="text-2xl md:text-3xl font-bold text-warning">{stats?.pending || 0}</div>
              <div className="text-xs text-warning font-medium">{pendingPercentage}%</div>
            </CardContent>
          </Card>

          {/* Weight */}
          <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-300/30 dark:border-blue-700/30">
            <CardContent className="pt-4 pb-3">
              <div className="text-xs text-muted-foreground mb-1">משקל (ק"ג)</div>
              <div className="text-2xl md:text-3xl font-bold text-blue-600 dark:text-blue-400">
                {aiStats?.collected?.total_weight_kg?.toFixed(1) || stats?.totalWeight?.toFixed(1) || 0}
              </div>
            </CardContent>
          </Card>

          {/* CO2 */}
          <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border-emerald-300/30 dark:border-emerald-700/30">
            <CardContent className="pt-4 pb-3">
              <div className="text-xs text-muted-foreground mb-1">CO₂ נחסך (ק"ג)</div>
              <div className="text-2xl md:text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                {aiStats?.collected?.co2_saved_kg?.toFixed(1) || stats?.totalCO2?.toFixed(1) || 0}
              </div>
              {(() => {
                const co2 = parseFloat(aiStats?.collected?.co2_saved_kg ?? stats?.totalCO2 ?? 0);
                const trees = Math.round(co2 / 21);
                return trees > 0 ? (
                  <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">≈ {trees} עצים/שנה</div>
                ) : null;
              })()}
            </CardContent>
          </Card>
        </div>

        {/* Smart Insights */}
        {stats && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
              <CardContent className="pt-4 pb-4">
                <div className="text-xs text-muted-foreground mb-1">קטגוריה נפוצה</div>
                <div className="text-base font-bold truncate">
                  {stats.materialChartData?.[0]?.name || '—'}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {stats.materialChartData?.[0]?.count || 0} פריטים ({stats.materialChartData?.[0]?.percentage || 0}%)
                </div>
              </CardContent>
            </Card>

            <Card className={`bg-gradient-to-br border ${
              Number(collectedPercentage) >= 80
                ? 'from-green-500/10 to-green-500/5 border-green-300/30 dark:border-green-700/30'
                : Number(collectedPercentage) >= 50
                ? 'from-amber-500/10 to-amber-500/5 border-amber-300/30 dark:border-amber-700/30'
                : 'from-red-500/10 to-red-500/5 border-red-300/30 dark:border-red-700/30'
            }`}>
              <CardContent className="pt-4 pb-4">
                <div className="text-xs text-muted-foreground mb-1">שיעור איסוף</div>
                <div className={`text-base font-bold ${
                  Number(collectedPercentage) >= 80 ? 'text-green-600 dark:text-green-400'
                  : Number(collectedPercentage) >= 50 ? 'text-amber-600 dark:text-amber-400'
                  : 'text-red-600 dark:text-red-400'
                }`}>
                  {collectedPercentage}%
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {stats.collected} מתוך {stats.totalItems} פריטים
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-300/30 dark:border-purple-700/30">
              <CardContent className="pt-4 pb-4">
                <div className="text-xs text-muted-foreground mb-1">האוסף המוביל</div>
                {stats.collectorStats?.length > 0 ? (
                  <>
                    <div className="text-base font-bold text-purple-600 dark:text-purple-400 truncate">
                      {stats.collectorStats[0].name}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {stats.collectorStats[0].count} פריטים שנאספו
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground mt-1">אין נתונים עדיין</div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Category Breakdown with View Toggle */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">פירוט לפי קטגוריית חומר</CardTitle>
              <div className="flex gap-1">
                <Button
                  variant={categoryViewMode === 'list' ? 'default' : 'ghost'}
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCategoryViewMode('list')}
                >
                  <List className="h-4 w-4" />
                </Button>
                <Button
                  variant={categoryViewMode === 'bar' ? 'default' : 'ghost'}
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCategoryViewMode('bar')}
                >
                  <BarChart3 className="h-4 w-4" />
                </Button>
                <Button
                  variant={categoryViewMode === 'pie' ? 'default' : 'ghost'}
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCategoryViewMode('pie')}
                >
                  <PieChartIcon className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {categoryViewMode === 'list' && (
              <div className="space-y-2">
                {stats?.materialChartData?.map((item: any, index: number) => (
                  <div 
                    key={item.name} 
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-3 h-3 rounded-full flex-shrink-0" 
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      />
                      <span className="font-medium">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-semibold">{item.count}</span>
                      <span className="text-muted-foreground">פריטים</span>
                      <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                        {item.percentage}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {categoryViewMode === 'bar' && (
              <ResponsiveContainer
                width="100%"
                height={Math.max(260, (stats?.materialChartData?.length || 0) * 44 + 40)}
              >
                <BarChart
                  data={stats?.materialChartData || []}
                  layout="vertical"
                  margin={{ top: 4, right: 90, left: 16, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} vertical={true} opacity={0.4} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: '#6B7280' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    orientation="right"
                    width={82}
                    tick={{ fontSize: 12, fill: '#374151' }}
                    tickMargin={6}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(value: number, _: string, props: any) => [
                      `${value} פריטים (${props.payload.percentage}%)`,
                      '',
                    ]}
                    contentStyle={{ textAlign: 'right', direction: 'rtl', fontSize: 13 }}
                    cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                  />
                  <Bar dataKey="count" radius={[0, 5, 5, 0]} barSize={22} maxBarSize={30}>
                    {stats?.materialChartData?.map((_: any, index: number) => (
                      <Cell key={`bar-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}

            {categoryViewMode === 'pie' && (
              <div className="w-full">
                <ResponsiveContainer width="100%" height={230}>
                  <PieChart>
                    <Pie
                      data={stats?.materialChartData || []}
                      dataKey="count"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={65}
                      outerRadius={100}
                      paddingAngle={3}
                      strokeWidth={0}
                    >
                      {stats?.materialChartData?.map((_: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number, _: string, props: any) => [
                        `${value} פריטים (${props.payload.percentage}%)`,
                        props.payload.name,
                      ]}
                      contentStyle={{ textAlign: 'right', direction: 'rtl', fontSize: 13 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* Legend below chart — no overlap */}
                <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 mt-3 px-2 pb-1">
                  {stats?.materialChartData?.map((item: any, index: number) => (
                    <div key={item.name} className="flex items-center gap-1.5">
                      <div
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      />
                      <span className="text-sm font-medium">{item.name}</span>
                      <span className="text-xs text-muted-foreground">({item.percentage}%)</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {(!stats?.materialChartData || stats.materialChartData.length === 0) && (
              <div className="text-center py-4 text-muted-foreground">
                אין נתונים להצגה
              </div>
            )}
          </CardContent>
        </Card>
        {/* Collector Leaderboard */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-5 w-5" />
              איסוף לפי עובדים
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(!stats?.collectorStats || stats.collectorStats.length === 0) ? (
              <div className="text-center py-6 text-muted-foreground">
                <p className="font-medium">אין נתוני איסוף עדיין</p>
                <p className="text-xs mt-1">נתונים יופיעו כאשר פריטים יסומנו כנאספו עם שם האוסף</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-4 text-sm border-b pb-3">
                  <span className="text-muted-foreground">
                    מוביל: <strong className="text-foreground">{stats.collectorStats[0].name}</strong>
                    {' '}({stats.collectorStats[0].count} פריטים)
                  </span>
                  <span className="text-muted-foreground">
                    ממוצע לעובד:{' '}
                    <strong className="text-foreground">
                      {Math.round(
                        stats.collectorStats.reduce((s: number, c: any) => s + c.count, 0) /
                        stats.collectorStats.length
                      )}
                    </strong>{' '}פריטים
                  </span>
                </div>

                <div className="space-y-2">
                  {stats.collectorStats.slice(0, 8).map((c: any, i: number) => (
                    <div key={c.name} className="flex items-center gap-3">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ${
                        i === 0 ? 'bg-yellow-500' : i === 1 ? 'bg-slate-400' : i === 2 ? 'bg-amber-700' : 'bg-muted-foreground/60'
                      }`}>
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium truncate">{c.name}</span>
                          <span className="text-sm font-semibold ml-2 flex-shrink-0">{c.count}</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-1.5">
                          <div
                            className="h-1.5 rounded-full bg-primary transition-all"
                            style={{ width: `${(c.count / stats.collectorStats[0].count) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {stats.collectorStats.length > 1 && (
                  <ResponsiveContainer
                    width="100%"
                    height={Math.max(160, Math.min(8, stats.collectorStats.length) * 36 + 20)}
                  >
                    <BarChart
                      data={stats.collectorStats.slice(0, 8)}
                      layout="vertical"
                      margin={{ top: 2, right: 50, left: 16, bottom: 2 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.4} />
                      <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis
                        dataKey="name"
                        type="category"
                        orientation="right"
                        width={90}
                        tick={{ fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip contentStyle={{ textAlign: 'right', direction: 'rtl', fontSize: 12 }} />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={20}>
                        {stats.collectorStats.slice(0, 8).map((_: any, index: number) => (
                          <Cell key={`col-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
