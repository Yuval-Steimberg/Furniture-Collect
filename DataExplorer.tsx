/**
 * DataExplorer - Advanced data exploration with filters, grouping, and chart builder
 */

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  Search, 
  Filter, 
  Download, 
  BarChart3, 
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  Layers
} from 'lucide-react';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { exportToCSV, exportToExcel, exportToPDF } from '@/lib/exportUtils';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#F97316', '#EC4899'];

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

const STATUS_TRANSLATIONS: Record<string, string> = {
  pending: 'ממתין',
  collected: 'נאסף',
  not_collected: 'לא נאסף',
  discarded: 'נזרק',
};

interface Item {
  id: string;
  description: string;
  quantity: number;
  material_category: string;
  collected: boolean;
  collected_by?: string;
  collected_at?: string;
  estimated_weight_kg?: number;
  estimated_resale_ils?: number;
  project_id: string;
  apartment_id: string;
  created_at: string;
  projects?: { name: string };
  apartments?: { building_number: string; apartment_number: string };
}

type GroupByOption = 'none' | 'category' | 'collector' | 'building' | 'project' | 'status';
type MetricOption = 'count' | 'weight' | 'value';
type ChartType = 'bar' | 'pie' | 'none';

export default function DataExplorer() {
  const [items, setItems] = useState<Item[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [selectedProject, setSelectedProject] = useState<string>('all');
  const [selectedBuilding, setSelectedBuilding] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedCollector, setSelectedCollector] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  
  // Grouping & Metrics
  const [groupBy, setGroupBy] = useState<GroupByOption>('none');
  const [metric, setMetric] = useState<MetricOption>('count');
  const [chartType, setChartType] = useState<ChartType>('none');
  
  // Pagination & Sorting
  const [page, setPage] = useState(1);
  const [sortField, setSortField] = useState<string>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const pageSize = 20;

  // Unique values for filters
  const [buildings, setBuildings] = useState<string[]>([]);
  const [collectors, setCollectors] = useState<string[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    // Extract unique buildings when project changes
    if (selectedProject !== 'all') {
      const projectItems = items.filter(i => i.project_id === selectedProject);
      const uniqueBuildings = [...new Set(projectItems.map(i => i.apartments?.building_number).filter(Boolean))];
      setBuildings(uniqueBuildings as string[]);
    } else {
      setBuildings([]);
    }
  }, [selectedProject, items]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      const [projectsRes, itemsRes] = await Promise.all([
        supabase.from('projects').select('id, name'),
        supabase.from('items').select(`
          *,
          projects(name),
          apartments(building_number, apartment_number)
        `).order('created_at', { ascending: false })
      ]);

      if (projectsRes.error) throw projectsRes.error;
      if (itemsRes.error) throw itemsRes.error;

      setProjects(projectsRes.data || []);
      setItems(itemsRes.data || []);
      
      // Extract unique collectors
      const uniqueCollectors = [...new Set(
        (itemsRes.data || [])
          .map(i => (i as any).collected_by)
          .filter(Boolean)
      )];
      setCollectors(uniqueCollectors);
      
    } catch (err) {
      console.error('Failed to load data:', err);
      toast.error('שגיאה בטעינת נתונים');
    } finally {
      setLoading(false);
    }
  };

  // Filtered items
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      if (selectedProject !== 'all' && item.project_id !== selectedProject) return false;
      if (selectedBuilding !== 'all' && item.apartments?.building_number !== selectedBuilding) return false;
      if (selectedCategory !== 'all' && item.material_category !== selectedCategory) return false;
      if (selectedStatus !== 'all') {
        if (selectedStatus === 'collected' && !item.collected) return false;
        if (selectedStatus === 'not_collected' && item.collected) return false;
      }
      if (selectedCollector !== 'all' && (item as any).collected_by !== selectedCollector) return false;
      if (searchQuery && !item.description.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (dateFrom && new Date(item.created_at) < new Date(dateFrom)) return false;
      if (dateTo && new Date(item.created_at) > new Date(dateTo + 'T23:59:59')) return false;
      return true;
    });
  }, [items, selectedProject, selectedBuilding, selectedCategory, selectedStatus, selectedCollector, searchQuery, dateFrom, dateTo]);

  // Sorted items
  const sortedItems = useMemo(() => {
    return [...filteredItems].sort((a, b) => {
      let aVal = (a as any)[sortField];
      let bVal = (b as any)[sortField];
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredItems, sortField, sortDir]);

  // Paginated items
  const paginatedItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedItems.slice(start, start + pageSize);
  }, [sortedItems, page]);

  const totalPages = Math.ceil(sortedItems.length / pageSize);

  // Grouped data for charts
  const groupedData = useMemo(() => {
    if (groupBy === 'none') return [];
    
    const groups: Record<string, { count: number; weight: number; value: number }> = {};
    
    filteredItems.forEach(item => {
      let key = '';
      switch (groupBy) {
        case 'category':
          key = CATEGORY_TRANSLATIONS[item.material_category] || item.material_category;
          break;
        case 'collector':
          key = (item as any).collected_by || 'לא צוין';
          break;
        case 'building':
          key = item.apartments?.building_number || 'לא צוין';
          break;
        case 'project':
          key = item.projects?.name || 'לא צוין';
          break;
        case 'status':
          key = item.collected ? 'נאסף' : 'לא נאסף';
          break;
      }
      
      if (!groups[key]) {
        groups[key] = { count: 0, weight: 0, value: 0 };
      }
      groups[key].count += item.quantity;
      groups[key].weight += (item.estimated_weight_kg || 0) * item.quantity;
      groups[key].value += (item.estimated_resale_ils || 0) * item.quantity;
    });
    
    return Object.entries(groups)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b[metric] - a[metric]);
  }, [filteredItems, groupBy, metric]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const handleExportCSV = () => {
    exportToCSV(filteredItems, projects);
    toast.success('קובץ CSV הורד בהצלחה');
  };

  const handleExportExcel = async () => {
    await exportToExcel(filteredItems, projects);
    toast.success('קובץ Excel הורד בהצלחה');
  };

  const handleExportPDF = async () => {
    const stats = {
      totalItems: filteredItems.reduce((sum, i) => sum + i.quantity, 0),
      collected: filteredItems.filter(i => i.collected).reduce((sum, i) => sum + i.quantity, 0),
      totalWeight: filteredItems.reduce((sum, i) => sum + (i.estimated_weight_kg || 0) * i.quantity, 0),
      totalValue: filteredItems.reduce((sum, i) => sum + (i.estimated_resale_ils || 0) * i.quantity, 0),
    };
    await exportToPDF(filteredItems, stats, projects);
    toast.success('קובץ PDF הורד בהצלחה');
  };

  const clearFilters = () => {
    setSelectedProject('all');
    setSelectedBuilding('all');
    setSelectedCategory('all');
    setSelectedStatus('all');
    setSelectedCollector('all');
    setSearchQuery('');
    setDateFrom('');
    setDateTo('');
  };

  const activeFiltersCount = [
    selectedProject !== 'all',
    selectedBuilding !== 'all',
    selectedCategory !== 'all',
    selectedStatus !== 'all',
    selectedCollector !== 'all',
    searchQuery !== '',
    dateFrom !== '',
    dateTo !== '',
  ].filter(Boolean).length;

  return (
    <div className="min-h-screen bg-muted" dir="rtl">
      <header className="bg-card border-b sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Search className="h-6 w-6 text-primary" />
              <h1 className="text-xl md:text-2xl font-bold">חוקר נתונים</h1>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleExportCSV} className="gap-1.5">
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">CSV</span>
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportExcel} className="gap-1.5">
                <FileSpreadsheet className="h-4 w-4" />
                <span className="hidden sm:inline">Excel</span>
              </Button>
              <Button variant="secondary" size="sm" onClick={handleExportPDF} className="gap-1.5">
                <FileText className="h-4 w-4" />
                <span className="hidden sm:inline">PDF</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-4 space-y-4">
        {/* Filters Card */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Filter className="h-5 w-5" />
                סינון
                {activeFiltersCount > 0 && (
                  <Badge variant="secondary">{activeFiltersCount}</Badge>
                )}
              </CardTitle>
              {activeFiltersCount > 0 && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  נקה הכל
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">פרויקט</Label>
                <Select value={selectedProject} onValueChange={setSelectedProject}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="הכל" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">הכל</SelectItem>
                    {projects.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">בניין</Label>
                <Select value={selectedBuilding} onValueChange={setSelectedBuilding} disabled={selectedProject === 'all'}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="הכל" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">הכל</SelectItem>
                    {buildings.map(b => (
                      <SelectItem key={b} value={b}>בניין {b}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">קטגוריה</Label>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="הכל" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">הכל</SelectItem>
                    {Object.entries(CATEGORY_TRANSLATIONS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">סטטוס</Label>
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="הכל" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">הכל</SelectItem>
                    <SelectItem value="collected">נאסף</SelectItem>
                    <SelectItem value="not_collected">לא נאסף</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">אוסף</Label>
                <Select value={selectedCollector} onValueChange={setSelectedCollector}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="הכל" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">הכל</SelectItem>
                    {collectors.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">חיפוש</Label>
                <Input
                  className="h-9"
                  placeholder="חפש פריט..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">מתאריך</Label>
                <Input
                  type="date"
                  className="h-9"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">עד תאריך</Label>
                <Input
                  type="date"
                  className="h-9"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Grouping & Chart Builder */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Layers className="h-5 w-5" />
              קיבוץ וגרפים
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">קבץ לפי</Label>
                <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupByOption)}>
                  <SelectTrigger className="w-[140px] h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">ללא קיבוץ</SelectItem>
                    <SelectItem value="category">קטגוריה</SelectItem>
                    <SelectItem value="collector">אוסף</SelectItem>
                    <SelectItem value="building">בניין</SelectItem>
                    <SelectItem value="project">פרויקט</SelectItem>
                    <SelectItem value="status">סטטוס</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">מדד</Label>
                <Select value={metric} onValueChange={(v) => setMetric(v as MetricOption)}>
                  <SelectTrigger className="w-[120px] h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="count">כמות</SelectItem>
                    <SelectItem value="weight">משקל (ק"ג)</SelectItem>
                    <SelectItem value="value">ערך (₪)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">סוג גרף</Label>
                <Select value={chartType} onValueChange={(v) => setChartType(v as ChartType)}>
                  <SelectTrigger className="w-[120px] h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">ללא</SelectItem>
                    <SelectItem value="bar">עמודות</SelectItem>
                    <SelectItem value="pie">עוגה</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Chart Display */}
            {groupBy !== 'none' && chartType !== 'none' && groupedData.length > 0 && (
              <div className="mt-4 h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  {chartType === 'bar' ? (
                    <BarChart data={groupedData.slice(0, 10)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Bar dataKey={metric} fill="#3B82F6" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  ) : (
                    <PieChart>
                      <Pie
                        data={groupedData.slice(0, 8)}
                        dataKey={metric}
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        innerRadius={50}
                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                        labelLine={false}
                      >
                        {groupedData.slice(0, 8).map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  )}
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Results Summary */}
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>נמצאו {filteredItems.length} פריטים</span>
          <span>
            סה"כ: {filteredItems.reduce((sum, i) => sum + i.quantity, 0)} יחידות | 
            {filteredItems.reduce((sum, i) => sum + (i.estimated_weight_kg || 0) * i.quantity, 0).toFixed(1)} ק"ג | 
            ₪{filteredItems.reduce((sum, i) => sum + (i.estimated_resale_ils || 0) * i.quantity, 0).toLocaleString()}
          </span>
        </div>

        {/* Data Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="cursor-pointer" onClick={() => handleSort('description')}>
                      <div className="flex items-center gap-1">
                        תיאור
                        <ArrowUpDown className="h-3 w-3" />
                      </div>
                    </TableHead>
                    <TableHead>קטגוריה</TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort('quantity')}>
                      <div className="flex items-center gap-1">
                        כמות
                        <ArrowUpDown className="h-3 w-3" />
                      </div>
                    </TableHead>
                    <TableHead>סטטוס</TableHead>
                    <TableHead>אוסף</TableHead>
                    <TableHead>פרויקט</TableHead>
                    <TableHead>דירה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        טוען...
                      </TableCell>
                    </TableRow>
                  ) : paginatedItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        לא נמצאו פריטים
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.description}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {CATEGORY_TRANSLATIONS[item.material_category] || item.material_category}
                          </Badge>
                        </TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell>
                          <Badge variant={item.collected ? 'default' : 'secondary'}>
                            {item.collected ? 'נאסף' : 'ממתין'}
                          </Badge>
                        </TableCell>
                        <TableCell>{(item as any).collected_by || '-'}</TableCell>
                        <TableCell>{item.projects?.name}</TableCell>
                        <TableCell>
                          {item.apartments?.building_number}/{item.apartments?.apartment_number}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <span className="text-sm text-muted-foreground">
                  עמוד {page} מתוך {totalPages}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
