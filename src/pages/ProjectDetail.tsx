import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ArrowLeft, Plus, Building2, BarChart3, ChevronDown, ChevronUp, Users, Check, FileText, Home, Package, Search, ChevronsDownUp, ChevronsUpDown, X } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';
import { SkeletonProjectCard } from '@/components/SkeletonCard';
import { PageHeader } from '@/components/PageHeader';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Apartment {
  id: string;
  building_number: string;
  apartment_number: string;
  status: 'NOT_STARTED' | 'DOCUMENTING' | 'COMPLETED';
  notes: string | null;
  pendingForCollection: number; // intended_for_collection=true AND collected=false
  hasAnyForCollection: boolean; // any items intended_for_collection regardless of collected
}

interface Project {
  id: string;
  name: string;
  city: string;
  developer_name: string;
}

interface BuildingGroup {
  building_number: string;
  apartments: Apartment[];
  totalApartments: number;
  completedApartments: number;
  pendingForCollection: number;
}

type FilterMode = 'all' | 'pending' | 'done';

export default function ProjectDetail() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [buildings, setBuildings] = useState<BuildingGroup[]>([]);
  const [openBuildings, setOpenBuildings] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [aptSearch, setAptSearch] = useState('');

  useEffect(() => {
    loadData();
  }, [projectId]);

  const loadData = async () => {
    try {
      const { data: projectData, error: projectError } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single();

      if (projectError) throw projectError;
      setProject(projectData);

      const { data: apartmentsData, error: apartmentsError } = await supabase
        .from('apartments')
        .select('*')
        .eq('project_id', projectId)
        .order('building_number, apartment_number');

      if (apartmentsError) throw apartmentsError;

      // Fetch all items for this project to compute pending counts
      const { data: itemsData, error: itemsError } = await supabase
        .from('items')
        .select('apartment_id, intended_for_collection, collected')
        .eq('project_id', projectId);

      if (itemsError) throw itemsError;

      const itemsByApt = (itemsData || []).reduce((acc: Record<string, { pending: number; anyForCollection: boolean }>, it) => {
        if (!acc[it.apartment_id]) acc[it.apartment_id] = { pending: 0, anyForCollection: false };
        if (it.intended_for_collection) {
          acc[it.apartment_id].anyForCollection = true;
          if (!it.collected) acc[it.apartment_id].pending += 1;
        }
        return acc;
      }, {});

      const enrichedApartments: Apartment[] = apartmentsData.map((apt: any) => ({
        ...apt,
        pendingForCollection: itemsByApt[apt.id]?.pending || 0,
        hasAnyForCollection: itemsByApt[apt.id]?.anyForCollection || false,
      }));

      const buildingGroups = enrichedApartments.reduce((acc: Record<string, Apartment[]>, apt) => {
        if (!acc[apt.building_number]) acc[apt.building_number] = [];
        acc[apt.building_number].push(apt);
        return acc;
      }, {});

      const buildingsArray: BuildingGroup[] = Object.entries(buildingGroups)
        .map(([building_number, apartments]) => ({
          building_number,
          apartments,
          totalApartments: apartments.length,
          completedApartments: apartments.filter(a => a.status === 'COMPLETED').length,
          pendingForCollection: apartments.reduce((sum, a) => sum + a.pendingForCollection, 0),
        }))
        .sort((a, b) => a.building_number.localeCompare(b.building_number, 'he'));

      setBuildings(buildingsArray);

      if (buildingsArray.length > 0) {
        setOpenBuildings({ [buildingsArray[0].building_number]: true });
      }
    } catch (error: any) {
      toast.error('שגיאה בטעינת נתונים');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'NOT_STARTED':
        return <Badge variant="secondary">לא הושלם</Badge>;
      case 'DOCUMENTING':
        return <Badge className="bg-warning text-warning-foreground">בתיעוד</Badge>;
      case 'COMPLETED':
        return <Badge className="bg-success text-success-foreground">הושלם</Badge>;
      default:
        return null;
    }
  };

  const toggleBuilding = (buildingNumber: string) => {
    setOpenBuildings(prev => ({ ...prev, [buildingNumber]: !prev[buildingNumber] }));
  };

  // Apartment is "done" / no need to enter when there are no pending items to collect
  // (either nothing intended for collection, or everything already collected)
  const isApartmentDone = (apt: Apartment) => apt.pendingForCollection === 0;

  const filteredBuildings = useMemo(() => {
    const aq = aptSearch.trim().toLowerCase();
    return buildings
      .map(b => ({
        ...b,
        apartments: b.apartments.filter(apt => {
          const matchFilter =
            filterMode === 'all' ||
            (filterMode === 'pending' && !isApartmentDone(apt)) ||
            (filterMode === 'done' && isApartmentDone(apt));
          const matchSearch = !aq || apt.apartment_number.toLowerCase().includes(aq);
          return matchFilter && matchSearch;
        }),
      }))
      .filter(b => b.apartments.length > 0);
  }, [buildings, filterMode, aptSearch]);

  const totalPending = buildings.reduce((s, b) => s + b.pendingForCollection, 0);
  const totalApts = buildings.reduce((s, b) => s + b.totalApartments, 0);
  const totalCompleted = buildings.reduce((s, b) => s + b.completedApartments, 0);

  const allExpanded = filteredBuildings.every(b => openBuildings[b.building_number]);
  const toggleExpandAll = () => {
    const next: Record<string, boolean> = {};
    filteredBuildings.forEach(b => { next[b.building_number] = !allExpanded; });
    setOpenBuildings(prev => ({ ...prev, ...next }));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-muted" dir="rtl">
        <div className="h-16 bg-sidebar" />
        <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-4">
          <div className="h-10 w-56 bg-muted-foreground/10 rounded animate-pulse" />
          <SkeletonProjectCard />
          <SkeletonProjectCard />
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted p-6" dir="rtl">
        <EmptyState
          icon={Building2}
          title="פרויקט לא נמצא"
          description="יתכן שהפרויקט נמחק או שאין לך הרשאה לצפות בו."
          actionLabel="חזרה לפרויקטים שלי"
          onAction={() => navigate('/projects')}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted" dir="rtl">
      <PageHeader
        title={project.name}
        subtitle={`${project.city} · ${project.developer_name}`}
        onBack={() => navigate('/projects')}
        actions={
          <>
            <Button variant="ghost" size="icon" onClick={() => navigate(`/projects/${projectId}/users`)} className="text-sidebar-foreground hover:bg-sidebar-accent h-8 w-8">
              <Users className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => navigate(`/projects/${projectId}/statistics`)} className="text-sidebar-foreground hover:bg-sidebar-accent h-8 w-8">
              <BarChart3 className="h-4 w-4" />
            </Button>
          </>
        }
      />

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-6">
        {/* Summary stats */}
        {buildings.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="bg-card border border-border rounded-xl px-3 py-2.5 text-center">
              <div className="text-xl font-extrabold tabular-nums">{totalApts}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">דירות</div>
            </div>
            <div className="bg-card border border-border rounded-xl px-3 py-2.5 text-center">
              <div className="text-xl font-extrabold tabular-nums text-green-600 dark:text-green-400">{totalCompleted}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">הושלמו</div>
            </div>
            <div className="bg-card border border-border rounded-xl px-3 py-2.5 text-center">
              <div className={`text-xl font-extrabold tabular-nums ${totalPending > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>{totalPending}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">ממתינים</div>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
          <h2 className="text-lg sm:text-xl font-bold">בניינים ודירות</h2>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button onClick={() => navigate(`/projects/${projectId}/report`)} size="sm" variant="outline" className="gap-2 flex-1 sm:flex-none h-10 sm:h-9">
              <FileText className="h-4 w-4" /><span>דוח קיימות</span>
            </Button>
            <Button onClick={() => navigate(`/projects/${projectId}/apartments/new`)} size="sm" className="gap-2 flex-1 sm:flex-none h-10 sm:h-9">
              <Plus className="h-4 w-4" />הוסף בניין
            </Button>
          </div>
        </div>

        {/* Search + filter + expand-all */}
        {buildings.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute top-1/2 -translate-y-1/2 right-3 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                value={aptSearch}
                onChange={e => setAptSearch(e.target.value)}
                placeholder="חיפוש מספר דירה…"
                className="pr-9 h-9"
                dir="rtl"
              />
              {aptSearch && (
                <button onClick={() => setAptSearch('')} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant={filterMode === 'all' ? 'default' : 'outline'} onClick={() => setFilterMode('all')} className="h-9">הכל</Button>
              <Button size="sm" variant={filterMode === 'pending' ? 'default' : 'outline'} onClick={() => setFilterMode('pending')} className="h-9 gap-1.5">
                לאיסוף{totalPending > 0 && <Badge variant="secondary" className="h-5 px-1.5">{totalPending}</Badge>}
              </Button>
              <Button size="sm" variant={filterMode === 'done' ? 'default' : 'outline'} onClick={() => setFilterMode('done')} className="h-9">הושלמו</Button>
              {filteredBuildings.length > 1 && (
                <Button size="sm" variant="outline" onClick={toggleExpandAll} className="h-9 gap-1.5 hidden sm:flex">
                  {allExpanded ? <ChevronsDownUp className="h-3.5 w-3.5" /> : <ChevronsUpDown className="h-3.5 w-3.5" />}
                  {allExpanded ? 'כווץ' : 'פתח הכל'}
                </Button>
              )}
            </div>
          </div>
        )}

        {filteredBuildings.length === 0 ? (
          <Card>
            <CardContent className="p-0">
              <EmptyState
                icon={aptSearch ? Search : Building2}
                title={buildings.length === 0 ? 'אין דירות בפרויקט' : aptSearch ? `אין דירות עם מספר "${aptSearch}"` : 'אין תוצאות לסינון'}
                description={buildings.length === 0
                  ? 'הוסף את הבניין הראשון כדי להתחיל לתעד דירות בפינוי.'
                  : 'נסה לשנות את החיפוש או הסינון.'}
                actionLabel={buildings.length === 0 ? 'הוסף בניין' : aptSearch ? 'נקה חיפוש' : undefined}
                onAction={buildings.length === 0
                  ? () => navigate(`/projects/${projectId}/apartments/new`)
                  : aptSearch ? () => setAptSearch('') : undefined}
              />
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredBuildings.map((building, idx) => {
              const buildingDone = building.pendingForCollection === 0 && building.totalApartments > 0;
              return (
                <Card
                  key={building.building_number}
                  className="animate-fade-in"
                  style={{ animationDelay: `${idx * 60}ms`, animationFillMode: 'backwards' }}
                >
                  <Collapsible
                    open={openBuildings[building.building_number]}
                    onOpenChange={() => toggleBuilding(building.building_number)}
                  >
                    <div className="flex items-stretch">
                      <CollapsibleTrigger className="flex-1 text-right">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 flex-1">
                              <Building2 className="h-5 w-5 text-primary" />
                              <div className="text-right flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-bold text-lg">בניין {building.building_number}</span>
                                  {buildingDone && (
                                    <Check className="h-5 w-5 text-success" />
                                  )}
                                  {building.pendingForCollection > 0 && (
                                    <Badge className="bg-warning text-warning-foreground">
                                      {building.pendingForCollection} לאיסוף
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {building.totalApartments} דירות
                                </p>
                              </div>
                            </div>
                            {openBuildings[building.building_number] ? (
                              <ChevronUp className="h-5 w-5 flex-shrink-0" />
                            ) : (
                              <ChevronDown className="h-5 w-5 flex-shrink-0" />
                            )}
                          </div>
                        </CardContent>
                      </CollapsibleTrigger>
                      <div className="flex items-center pl-4">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 h-8 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/projects/${projectId}/apartments/new?building=${encodeURIComponent(building.building_number)}`);
                          }}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          הוסף דירה
                        </Button>
                      </div>
                    </div>

                    <CollapsibleContent>
                      <div className="border-t px-4 pb-4 pt-2 space-y-2">
                        {building.apartments.map((apartment, aIdx) => {
                          const done = isApartmentDone(apartment);
                          return (
                            <button
                              key={apartment.id}
                              type="button"
                              className={cn(
                                "w-full text-right rounded-lg border border-border bg-card hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 animate-scale-in group",
                                "focus:outline-none focus:ring-2 focus:ring-primary/40",
                                done && "bg-accent/20 border-accent"
                              )}
                              style={{ animationDelay: `${aIdx * 30}ms` }}
                              onClick={() => navigate(`/projects/${projectId}/apartments/${apartment.id}`)}
                            >
                              <div className="p-3 sm:p-3.5 flex items-center gap-3">
                                <div className={cn(
                                  "flex-shrink-0 h-10 w-10 rounded-lg flex items-center justify-center transition-colors",
                                  done
                                    ? "bg-accent text-accent-foreground"
                                    : "bg-muted text-muted-foreground group-hover:bg-accent/50"
                                )}>
                                  {done
                                    ? <Check className="h-5 w-5" strokeWidth={2.5} />
                                    : <Home className="h-4 w-4" strokeWidth={1.75} />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-0.5">
                                    <span className="font-bold text-sm sm:text-base">דירה {apartment.apartment_number}</span>
                                    {getStatusBadge(apartment.status)}
                                  </div>
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    {apartment.pendingForCollection > 0 ? (
                                      <span className="inline-flex items-center gap-1">
                                        <Package className="h-3 w-3" strokeWidth={1.75} />
                                        {apartment.pendingForCollection} פריטים לאיסוף
                                      </span>
                                    ) : done ? (
                                      <span>הושלם</span>
                                    ) : (
                                      <span>טרם תועד</span>
                                    )}
                                  </div>
                                </div>
                                <ArrowLeft className="h-4 w-4 text-muted-foreground flex-shrink-0 group-hover:text-foreground group-hover:-translate-x-0.5 transition-all" />
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
