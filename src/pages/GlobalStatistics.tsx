import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Download, Send, Loader2, List, BarChart3, PieChart as PieChartIcon } from 'lucide-react';
import { toast } from 'sonner';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

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

      // Prepare chart data with percentages
      const materialChartData = Object.entries(materialGroups).map(([name, data]: [string, any]) => ({
        name: CATEGORY_TRANSLATIONS[name] || name,
        rawName: name,
        weight: parseFloat(data.weight.toFixed(1)),
        count: data.count,
        percentage: totalItems > 0 ? parseFloat(((data.count / totalItems) * 100).toFixed(1)) : 0,
        co2: parseFloat(data.co2Saved.toFixed(1)),
      }));

      setStats({
        totalItems,
        intendedForCollection,
        collected,
        pending,
        totalWeight,
        totalCO2,
        materialGroups,
        materialChartData,
        items,
        collectedItems: items.filter(i => i.collected),
        notCollectedItems: items.filter(i => !i.collected),
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

  const exportToExcel = () => {
    if (!stats?.items) return;
    
    const csv = [
      ['פרויקט', 'בניין', 'דירה', 'תיאור', 'כמות', 'מיקום', 'לאיסוף', 'נאסף', 'סוג', 'קטגוריה', 'משקל (ק"ג)'].join(','),
      ...stats.items.map((item: any) => [
        item.projects?.name || '',
        item.apartments?.building_number || '',
        item.apartments?.apartment_number || '',
        `"${item.description}"`,
        item.quantity,
        item.location || '',
        item.intended_for_collection ? 'כן' : 'לא',
        item.collected ? 'כן' : 'לא',
        item.item_type,
        CATEGORY_TRANSLATIONS[item.material_category] || item.material_category,
        item.estimated_weight_kg || ''
      ].join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `statistics-${selectedProject}-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    toast.success('הקובץ יוצא בהצלחה');
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
            <Button variant="secondary" size="sm" onClick={exportToExcel} className="gap-2">
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">ייצוא</span>
            </Button>
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
            </CardContent>
          </Card>
        </div>

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
              <ResponsiveContainer width="100%" height={280}>
                <BarChart 
                  data={stats?.materialChartData || []} 
                  layout="vertical"
                  margin={{ top: 5, right: 80, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    orientation="right"
                    width={70}
                    tick={{ fontSize: 13 }}
                    tickMargin={8}
                  />
                  <Tooltip 
                    formatter={(value: number) => [`${value} פריטים`, '']}
                    contentStyle={{ textAlign: 'right', direction: 'rtl' }}
                  />
                  <Bar dataKey="count" radius={[4, 0, 0, 4]} barSize={24}>
                    {stats?.materialChartData?.map((_: any, index: number) => (
                      <Cell key={`bar-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
            
            {categoryViewMode === 'pie' && (
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Pie
                    data={stats?.materialChartData || []}
                    dataKey="count"
                    nameKey="name"
                    cx="40%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {stats?.materialChartData?.map((_: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number, name: string, props: any) => [
                      `${value} פריטים (${props.payload.percentage}%)`, 
                      ''
                    ]}
                    contentStyle={{ textAlign: 'right', direction: 'rtl' }}
                  />
                  <Legend 
                    layout="vertical" 
                    align="left" 
                    verticalAlign="middle"
                    wrapperStyle={{ paddingLeft: 20 }}
                    formatter={(value, entry: any) => (
                      <span style={{ color: entry.color, fontSize: 13 }}>
                        {value} ({entry.payload.percentage}%)
                      </span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
            
            {(!stats?.materialChartData || stats.materialChartData.length === 0) && (
              <div className="text-center py-4 text-muted-foreground">
                אין נתונים להצגה
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
