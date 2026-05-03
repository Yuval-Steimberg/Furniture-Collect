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
  ArrowLeft,
  RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

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

export default function ManagerDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [topCollectors, setTopCollectors] = useState<CollectorStats[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [recentActivity, setRecentActivity] = useState<ActivityLog[]>([]);
  const [apartmentStats, setApartmentStats] = useState<{ status: string; count: number }[]>([]);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      setLoading(true);

      // Load items stats
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

      // Top collectors - will be populated after migration adds collected_by column
      // For now, show empty state
      setTopCollectors([]);

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

      // Recent activity - will be populated after migration adds audit_log table
      setRecentActivity([]);

    } catch (err) {
      console.error('Failed to load dashboard:', err);
      toast.error('שגיאה בטעינת לוח הבקרה');
    } finally {
      setLoading(false);
    }
  };

  const getActionLabel = (action: string) => {
    switch (action) {
      case 'create': return 'יצירה';
      case 'update': return 'עדכון';
      case 'delete': return 'מחיקה';
      case 'collect': return 'איסוף';
      case 'status_change': return 'שינוי סטטוס';
      default: return action;
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
      <header className="bg-card border-b sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <LayoutDashboard className="h-6 w-6 text-primary" />
              <h1 className="text-xl md:text-2xl font-bold">לוח בקרה</h1>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4 ml-2" />
              חזרה
            </Button>
          </div>
        </div>
      </header>

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
                    <div className="w-2 h-2 rounded-full bg-primary" />
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
