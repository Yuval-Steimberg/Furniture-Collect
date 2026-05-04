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
  ChevronDown,
  FileSpreadsheet,
  FileText,
  FileBarChart,
  File,
  Loader2,
  Layers
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { exportToCSV, exportToExcel, exportToPDF } from '@/lib/exportUtils';
import { PageHeader } from '@/components/PageHeader';

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

  // Mobile: collapse advanced filters by default
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  const advancedFiltersCount = [
    selectedBuilding !== 'all',
    selectedCategory !== 'all',
    selectedCollector !== 'all',
    dateFrom !== '',
    dateTo !== '',
  ].filter(Boolean).length;

  return (
    <div className="min-h-screen bg-muted w-full overflow-x-hidden" dir="rtl">

      <PageHeader
        title="חוקר נתונים"
        actions={
          <div className="flex items-center gap-1.5">
            {activeFiltersCount > 0 && (
              <Badge variant="secondary" className="flex-shrink-0">{activeFiltersCount}</Badge>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1.5 text-sidebar-foreground hover:bg-sidebar-accent">
                  <Download className="h-4 w-4" />
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52" dir="rtl">
                <DropdownMenuLabel>בחר פורמט</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleExportCSV} className="gap-2">
                  <File className="h-4 w-4" /> CSV — נתונים גולמיים
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportExcel} className="gap-2">
                  <FileSpreadsheet className="h-4 w-4" /> Excel — גיליונות
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportPDF} className="gap-2">
                  <FileText className="h-4 w-4" /> PDF — סיכום
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      <main className="px-3 sm:px-4 py-3 sm:py-4 space-y-3">

        {/* ── Filters ─────────────────────────────────────────────── */}
        <Card>
          <CardContent className="p-3 space-y-3">
            {/* Primary row: Project + Status (always visible) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">פרויקט</Label>
                <Select value={selectedProject} onValueChange={v => { setSelectedProject(v); setPage(1); }}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="הכל" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">הכל</SelectItem>
                    {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">סטטוס</Label>
                <Select value={selectedStatus} onValueChange={v => { setSelectedStatus(v); setPage(1); }}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="הכל" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">הכל</SelectItem>
                    <SelectItem value="collected">נאסף</SelectItem>
                    <SelectItem value="not_collected">לא נאסף</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute top-1/2 -translate-y-1/2 right-3 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                className="h-9 pr-9"
                placeholder="חפש פריט לפי שם..."
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
                dir="rtl"
              />
            </div>

            {/* Advanced filters toggle */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowAdvancedFilters(v => !v)}
                className="text-sm text-primary flex items-center gap-1 hover:underline"
              >
                <Filter className="h-3.5 w-3.5" />
                {showAdvancedFilters ? 'הסתר סינון מתקדם' : 'סינון מתקדם'}
                {advancedFiltersCount > 0 && (
                  <Badge variant="secondary" className="h-4 min-w-4 text-[10px] px-1">{advancedFiltersCount}</Badge>
                )}
              </button>
              {activeFiltersCount > 0 && (
                <button type="button" onClick={clearFilters} className="text-xs text-muted-foreground hover:text-foreground">
                  נקה הכל
                </button>
              )}
            </div>

            {/* Advanced filters — collapsible */}
            {showAdvancedFilters && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t">
                <div className="space-y-1">
                  <Label className="text-xs">בניין</Label>
                  <Select value={selectedBuilding} onValueChange={v => { setSelectedBuilding(v); setPage(1); }} disabled={selectedProject === 'all'}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="הכל" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">הכל</SelectItem>
                      {buildings.map(b => <SelectItem key={b} value={b}>בניין {b}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">קטגוריה</Label>
                  <Select value={selectedCategory} onValueChange={v => { setSelectedCategory(v); setPage(1); }}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="הכל" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">הכל</SelectItem>
                      {Object.entries(CATEGORY_TRANSLATIONS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">אוסף</Label>
                  <Select value={selectedCollector} onValueChange={v => { setSelectedCollector(v); setPage(1); }}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="הכל" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">הכל</SelectItem>
                      {collectors.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 col-span-1">
                  <Label className="text-xs">מתאריך</Label>
                  <Input type="date" className="h-9" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} />
                </div>
                <div className="space-y-1 col-span-1">
                  <Label className="text-xs">עד תאריך</Label>
                  <Input type="date" className="h-9" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Grouping & Chart ─────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2 pt-3 px-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Layers className="h-4 w-4" />
              קיבוץ וגרפים
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <div className="grid grid-cols-3 gap-1.5">
              <div className="space-y-1">
                <Label className="text-xs">קבץ לפי</Label>
                <Select value={groupBy} onValueChange={v => setGroupBy(v as GroupByOption)}>
                  <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">ללא</SelectItem>
                    <SelectItem value="category">קטגוריה</SelectItem>
                    <SelectItem value="collector">אוסף</SelectItem>
                    <SelectItem value="building">בניין</SelectItem>
                    <SelectItem value="project">פרויקט</SelectItem>
                    <SelectItem value="status">סטטוס</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">מדד</Label>
                <Select value={metric} onValueChange={v => setMetric(v as MetricOption)}>
                  <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="count">כמות</SelectItem>
                    <SelectItem value="weight">משקל</SelectItem>
                    <SelectItem value="value">ערך</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">גרף</Label>
                <Select value={chartType} onValueChange={v => setChartType(v as ChartType)}>
                  <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">ללא</SelectItem>
                    <SelectItem value="bar">עמודות</SelectItem>
                    <SelectItem value="pie">עוגה</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {groupBy !== 'none' && chartType !== 'none' && groupedData.length > 0 && (
              <div className="mt-3">
                {chartType === 'bar' ? (
                  <div style={{ height: Math.max(200, Math.min(10, groupedData.length) * 36 + 30) }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={groupedData.slice(0, 10)} layout="vertical" margin={{ top: 4, right: 50, left: 8, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.4} />
                        <XAxis type="number" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis dataKey="name" type="category" width={90} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ textAlign: 'right', direction: 'rtl', fontSize: 12 }} />
                        <Bar dataKey={metric} radius={[0, 5, 5, 0]} barSize={20}>
                          {groupedData.slice(0, 10).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={groupedData.slice(0, 8)} dataKey={metric} nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={40} paddingAngle={2} strokeWidth={0}>
                          {groupedData.slice(0, 8).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip contentStyle={{ textAlign: 'right', direction: 'rtl', fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex flex-wrap justify-center gap-x-3 gap-y-1.5 mt-2">
                      {(() => {
                        const total = groupedData.slice(0, 8).reduce((s, d) => s + (d[metric] || 0), 0);
                        return groupedData.slice(0, 8).map((d, i) => (
                          <div key={d.name} className="flex items-center gap-1">
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                            <span className="text-xs">{d.name} ({total > 0 ? ((d[metric] / total) * 100).toFixed(0) : 0}%)</span>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Results summary ──────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5 text-sm">
          <span className="font-medium text-foreground">{filteredItems.length} פריטים</span>
          <span className="text-xs text-muted-foreground">
            {filteredItems.reduce((s, i) => s + i.quantity, 0)} יח' ·{' '}
            {filteredItems.reduce((s, i) => s + (i.estimated_weight_kg || 0) * i.quantity, 0).toFixed(1)} ק"ג ·{' '}
            ₪{filteredItems.reduce((s, i) => s + (i.estimated_resale_ils || 0) * i.quantity, 0).toLocaleString()}
          </span>
        </div>

        {/* ── Item cards (mobile) ──────────────────────────────────── */}
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">טוען...</div>
        ) : paginatedItems.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">לא נמצאו פריטים</div>
        ) : (
          <>
            {/* Mobile card view */}
            <div className="sm:hidden space-y-2">
              {paginatedItems.map(item => (
                <Card key={item.id}>
                  <CardContent className="p-3">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm leading-snug">{item.description}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {item.projects?.name}{item.apartments && ` · בניין ${item.apartments.building_number}/${item.apartments.apartment_number}`}
                        </p>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          <Badge variant="outline" className="text-[10px] h-4 px-1">
                            {CATEGORY_TRANSLATIONS[item.material_category] || item.material_category}
                          </Badge>
                          <Badge variant={item.collected ? 'default' : 'secondary'} className="text-[10px] h-4 px-1">
                            {item.collected ? 'נאסף' : 'ממתין'}
                          </Badge>
                          {(item as any).collected_by && (
                            <span className="text-[10px] text-muted-foreground">
                              ע"י {(item as any).collected_by}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-center">
                        <p className="text-lg font-bold leading-none">{item.quantity}</p>
                        <p className="text-[10px] text-muted-foreground">יח'</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Desktop table view */}
            <Card className="hidden sm:block">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table className="min-w-[640px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="cursor-pointer" onClick={() => handleSort('description')}>
                          <div className="flex items-center gap-1">תיאור <ArrowUpDown className="h-3 w-3" /></div>
                        </TableHead>
                        <TableHead>קטגוריה</TableHead>
                        <TableHead className="cursor-pointer" onClick={() => handleSort('quantity')}>
                          <div className="flex items-center gap-1">כמות <ArrowUpDown className="h-3 w-3" /></div>
                        </TableHead>
                        <TableHead>סטטוס</TableHead>
                        <TableHead>אוסף</TableHead>
                        <TableHead>פרויקט</TableHead>
                        <TableHead>דירה</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedItems.map(item => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.description}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{CATEGORY_TRANSLATIONS[item.material_category] || item.material_category}</Badge>
                          </TableCell>
                          <TableCell>{item.quantity}</TableCell>
                          <TableCell>
                            <Badge variant={item.collected ? 'default' : 'secondary'}>
                              {item.collected ? 'נאסף' : 'ממתין'}
                            </Badge>
                          </TableCell>
                          <TableCell>{(item as any).collected_by || '-'}</TableCell>
                          <TableCell>{item.projects?.name}</TableCell>
                          <TableCell>{item.apartments?.building_number}/{item.apartments?.apartment_number}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-1 py-1">
                <span className="text-sm text-muted-foreground">עמוד {page} / {totalPages}</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
