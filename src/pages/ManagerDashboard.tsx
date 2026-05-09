/**
 * ManagerDashboard - Control center for project managers
 * Shows KPIs, issues, top collectors, activity timeline
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  LayoutDashboard,
  Package,
  CheckCircle2,
  AlertTriangle,
  Users,
  TrendingUp,
  Clock,
  Building2,
  RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import {
  BarChart, Bar,
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { PageHeader } from '@/components/PageHeader';
import { getRecentAudit } from '@/lib/auditLog';
import type { AuditAction } from '@/lib/auditLog';

interface DashboardStats {
  totalItems: number;
  collectedItems: number;
  pendingItems: number;
  collectionRate: number;
  totalProjects: number;
  activeApartments: number;
  completedApartments: number;
}

interface CollectorStats {
  name: string;
  count: number;
}

interface Issue {
  id: string;
  type: 'missing_collector' | 'not_collected';
  description: string;
  project: string;
  apartment: string;
}

interface ActivityLog {
  id: string;
  action: string;
  entity: string;
  user: string;
  timestamp: string;
}

// ── ISO week helpers ─────────────────────────────────────────────────────────

/** Return the Monday of the ISO week that contains `date` */
function getMondayOf(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun … 6=Sat
  const diff = day === 0 ? -6 : 1 - day; // shift so Monday=0
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Format a Monday date as "DD/MM" for display */
function fmtMonday(monday: Date): string {
  const dd = String(monday.getDate()).padStart(2, '0');
  const mm = String(monday.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

// ────────────────────────────────────────────────────────────────────────────

export default function ManagerDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [topCollectors, setTopCollectors] = useState<CollectorStats[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [recentActivity, setRecentActivity] = useState<ActivityLog[]>([]);
  const [apartmentStats, setApartmentStats] = useState<{ status: string; count: number }[]>([]);

  // New state for additional charts
  const [weeklyData, setWeeklyData] = useState<{ week: string; items: number; collected: number; kg: number }[]>([]);
  const [cumulativeKg, setCumulativeKg] = useState<{ week: string; kg: number }[]>([]);
  const [projectHealth, setProjectHealth] = useState<{ name: string; pct: number; total: number }[]>([]);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      setLoading(true);

      // Load items stats — select only columns that definitely exist in all DB versions
      const { data: items, error: itemsError } = await supabase
        .from('items')
        .select('id, quantity, collected, intended_for_collection, project_id');

      if (itemsError) throw itemsError;

      // Load apartments
      const { data: apartments, error: apartmentsError } = await supabase
        .from('apartments')
        .select('id, status, project_id');

      if (apartmentsError) throw apartmentsError;

      // Load projects
      const { data: projects, error: projectsError } = await supabase
        .from('projects')
        .select('id, name');

      if (projectsError) throw projectsError;

      // Load collector attribution separately — collected_by TEXT may not exist in older DB versions
      let collectorItems: { collected: boolean; quantity: number; collected_by?: string; collector_profile?: { name: string } | null }[] = [];
      try {
        const { data: cData } = await supabase
          .from('items')
          .select('collected, quantity, collected_by, collector_profile:profiles!items_collected_by_user_id_fkey(name)')
          .eq('collected', true);
        collectorItems = cData || [];
      } catch {
        // Column or relation doesn't exist yet — collector stats will stay empty
      }

      // Calculate stats
      const totalItems = items?.reduce((sum, i) => sum + i.quantity, 0) || 0;
      const collectedItems = items?.filter(i => i.collected).reduce((sum, i) => sum + i.quantity, 0) || 0;
      const pendingItems = items?.filter(i => i.intended_for_collection && !i.collected).reduce((sum, i) => sum + i.quantity, 0) || 0;

      setStats({
        totalItems,
        collectedItems,
        pendingItems,
        collectionRate: totalItems > 0 ? (collectedItems / totalItems) * 100 : 0,
        totalProjects: projects?.length || 0,
        activeApartments: apartments?.filter(a => a.status === 'DOCUMENTING').length || 0,
        completedApartments: apartments?.filter(a => a.status === 'COMPLETED').length || 0,
      });

      // Calculate apartment status distribution
      const statusCounts: Record<string, number> = {};
      apartments?.forEach(a => {
        const status = a.status || 'NOT_STARTED';
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      });
      setApartmentStats(Object.entries(statusCounts).map(([status, count]) => ({
        status: status === 'NOT_STARTED' ? 'לא התחיל' : status === 'DOCUMENTING' ? 'בתיעוד' : 'הושלם',
        count
      })));

      // Top collectors — use collected_by text field, fall back to profile name
      const collectorMap: Record<string, number> = {};
      collectorItems.forEach(item => {
        const name = item.collected_by || (item.collector_profile as { name?: string } | null)?.name;
        if (name) {
          collectorMap[name] = (collectorMap[name] || 0) + item.quantity;
        }
      });
      const collectors = Object.entries(collectorMap)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
      setTopCollectors(collectors);

      // Find issues - items that are intended for collection but not collected
      const foundIssues: Issue[] = [];
      items?.forEach(item => {
        if (item.intended_for_collection && !item.collected) {
          foundIssues.push({
            id: item.id,
            type: 'not_collected',
            description: 'פריט ממתין לאיסוף',
            project: projects?.find(p => p.id === item.project_id)?.name || '',
            apartment: '',
          });
        }
      });
      // Limit to 10 issues
      setIssues(foundIssues.slice(0, 10));

      // ── Weekly activity data (last 8 weeks) ─────────────────────────────
      const { data: recentItems } = await supabase
        .from('items')
        .select('created_at, collected, project_id, estimated_weight_kg, quantity')
        .gte('created_at', new Date(Date.now() - 56 * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: true });

      // Build ordered list of the last 8 ISO-week Mondays
      const nowMonday = getMondayOf(new Date());
      const weekKeys: Date[] = [];
      for (let w = 7; w >= 0; w--) {
        const d = new Date(nowMonday);
        d.setDate(d.getDate() - w * 7);
        weekKeys.push(d);
      }

      // Bucket map: weekLabel → { items, collected, kg }
      const weekMap: Record<string, { items: number; collected: number; kg: number }> = {};
      for (const monday of weekKeys) {
        weekMap[fmtMonday(monday)] = { items: 0, collected: 0, kg: 0 };
      }

      (recentItems || []).forEach(item => {
        const monday = getMondayOf(new Date(item.created_at as string));
        const key = fmtMonday(monday);
        if (key in weekMap) {
          const qty = (item.quantity as number) || 1;
          weekMap[key].items += qty;
          if (item.collected) weekMap[key].collected += qty;
          const kgRaw = item.estimated_weight_kg as number | null;
          weekMap[key].kg += (kgRaw || 0) * qty;
        }
      });

      const computedWeeklyData = weekKeys.map(monday => ({
        week: fmtMonday(monday),
        ...weekMap[fmtMonday(monday)],
      }));
      setWeeklyData(computedWeeklyData);

      // Cumulative KG over the 8 weeks
      let runningKg = 0;
      const cumKg = computedWeeklyData.map(w => {
        runningKg += w.kg;
        return { week: w.week, kg: Math.round(runningKg * 10) / 10 };
      });
      setCumulativeKg(cumKg);

      // Project health — % of apartments that are COMPLETED
      const projectHealthData = (projects || []).map(project => {
        const projectApts = (apartments || []).filter(a => a.project_id === project.id);
        const completed = projectApts.filter(a => a.status === 'COMPLETED').length;
        const total = projectApts.length;
        const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
        return { name: project.name, pct, total };
      }).filter(p => p.total > 0)
        .sort((a, b) => b.pct - a.pct)
        .slice(0, 5);
      setProjectHealth(projectHealthData);

      // ── Audit log / Recent activity ──────────────────────────────────────
      const auditEntries = await getRecentAudit(20);
      setRecentActivity(auditEntries.map(e => ({
        id: e.id,
        action: e.action,
        entity: e.entity_label,
        user: e.actor_name,
        timestamp: new Date(e.timestamp).toLocaleString('he-IL', {
          hour: '2-digit',
          minute: '2-digit',
          day: '2-digit',
          month: '2-digit',
        }),
      })));

    } catch (err) {
      console.error('Failed to load dashboard:', err);
      toast.error('שגיאה בטעינת לוח הבקרה');
    } finally {
      setLoading(false);
    }
  };

  const getActionLabel = (action: string): string => {
    switch (action as AuditAction | string) {
      // New audit action strings
      case 'item_created':            return 'הוסיף פריט';
      case 'item_collected':          return 'סימן כנאסף';
      case 'item_uncollected':        return 'ביטל איסוף';
      case 'item_deleted':            return 'מחק פריט';
      case 'apartment_status_changed':return 'שינה סטטוס';
      case 'project_created':         return 'יצר פרויקט';
      // Legacy strings (kept for backwards compat)
      case 'create':       return 'יצירה';
      case 'update':       return 'עדכון';
      case 'delete':       return 'מחיקה';
      case 'collect':      return 'איסוף';
      case 'status_change':return 'שינוי סטטוס';
      default:             return action;
    }
  };

  /** Return a Tailwind bg color class for the dot next to each audit action */
  const getActionDotColor = (action: string): string => {
    switch (action) {
      case 'item_collected':           return 'bg-green-500';
      case 'item_deleted':             return 'bg-red-500';
      case 'item_created':
      case 'project_created':          return 'bg-blue-500';
      case 'apartment_status_changed': return 'bg-amber-500';
      case 'item_uncollected':         return 'bg-orange-400';
      default:                         return 'bg-primary';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-muted flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted" dir="rtl">
      <PageHeader
        title="לוח בקרה"
        subtitle={stats ? `${stats.totalItems.toLocaleString()} פריטים · ${stats.collectionRate.toFixed(0)}% נאספו` : 'מבט על ומעקב ביצועים'}
        onBack={() => navigate(-1)}
      />

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">סה"כ פריטים</p>
                  <p className="text-2xl font-bold">{stats?.totalItems.toLocaleString()}</p>
                </div>
                <Package className="h-8 w-8 text-primary opacity-80" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">נאספו</p>
                  <p className="text-2xl font-bold text-green-600">{stats?.collectedItems.toLocaleString()}</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-green-600 opacity-80" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">ממתינים</p>
                  <p className="text-2xl font-bold text-amber-600">{stats?.pendingItems.toLocaleString()}</p>
                </div>
                <Clock className="h-8 w-8 text-amber-600 opacity-80" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">אחוז איסוף</p>
                  <p className="text-2xl font-bold">{stats?.collectionRate.toFixed(1)}%</p>
                </div>
                <TrendingUp className="h-8 w-8 text-primary opacity-80" />
              </div>
              <Progress value={stats?.collectionRate} className="mt-2 h-2" />
            </CardContent>
          </Card>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Top Collectors */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                איסוף לפי עובדים
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topCollectors.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">אין נתונים עדיין</p>
              ) : (
                <div className="space-y-3">
                  {topCollectors.map((collector, index) => (
                    <div key={collector.name} className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${
                        index === 0 ? 'bg-yellow-500' : index === 1 ? 'bg-gray-400' : index === 2 ? 'bg-amber-700' : 'bg-muted-foreground'
                      }`}>
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{collector.name}</p>
                        <Progress value={(collector.count / topCollectors[0].count) * 100} className="h-2" />
                      </div>
                      <Badge variant="secondary">{collector.count}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Apartment Status */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                סטטוס דירות
              </CardTitle>
            </CardHeader>
            <CardContent>
              {apartmentStats.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">אין נתונים עדיין</p>
              ) : (
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={apartmentStats} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis dataKey="status" type="category" width={80} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#3B82F6" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Weekly Activity — full width */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              פעילות שבועית
            </CardTitle>
          </CardHeader>
          <CardContent>
            {weeklyData.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">אין נתונים עדיין</p>
            ) : (
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={weeklyData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorItems" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorCollected" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22C55E" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#22C55E" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="items"
                      name="פריטים"
                      stroke="#3B82F6"
                      fill="url(#colorItems)"
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="collected"
                      name="נאספו"
                      stroke="#22C55E"
                      fill="url(#colorCollected)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Second 2-column grid: cumulative KG + project health */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Cumulative KG diverted */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5 text-emerald-600" />
                ק"ג הוסטו מצטבר
              </CardTitle>
            </CardHeader>
            <CardContent>
              {cumulativeKg.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">אין נתונים עדיין</p>
              ) : (
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={cumulativeKg} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorKg" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10B981" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(value: number) => [`${value} ק"ג`, 'מצטבר']} />
                      <Area
                        type="monotone"
                        dataKey="kg"
                        name='ק"ג'
                        stroke="#10B981"
                        fill="url(#colorKg)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Project health — top 5 by completion % */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LayoutDashboard className="h-5 w-5" />
                בריאות פרויקטים
              </CardTitle>
            </CardHeader>
            <CardContent>
              {projectHealth.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">אין נתונים עדיין</p>
              ) : (
                <div className="space-y-4">
                  {projectHealth.map(project => (
                    <div key={project.name}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium truncate max-w-[70%]">{project.name}</span>
                        <span className="text-sm text-muted-foreground">{project.pct}%</span>
                      </div>
                      <Progress value={project.pct} className="h-2" />
                      <p className="text-xs text-muted-foreground mt-0.5">{project.total} דירות</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Issues */}
        {issues.length > 0 && (
          <Card className="border-amber-200 bg-amber-50/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-amber-700">
                <AlertTriangle className="h-5 w-5" />
                בעיות לטיפול ({issues.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {issues.map((issue) => (
                  <div key={issue.id} className="flex items-center justify-between p-3 bg-white rounded-lg border">
                    <div>
                      <p className="font-medium">{issue.description}</p>
                      <p className="text-sm text-muted-foreground">{issue.project}</p>
                    </div>
                    <Badge variant={issue.type === 'missing_collector' ? 'destructive' : 'secondary'}>
                      {issue.type === 'missing_collector' ? 'חסר אוסף' : 'לא נאסף'}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              פעילות אחרונה
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentActivity.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">אין פעילות מתועדת עדיין</p>
            ) : (
              <div className="space-y-3">
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${getActionDotColor(activity.action)}`} />
                    <div className="flex-1">
                      <p className="text-sm">
                        <span className="font-medium">{activity.user}</span>
                        {' '}
                        <span className="text-muted-foreground">{getActionLabel(activity.action)}</span>
                        {' '}
                        <span>{activity.entity}</span>
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">{activity.timestamp}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
