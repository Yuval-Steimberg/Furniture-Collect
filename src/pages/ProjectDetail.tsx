import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ArrowLeft, Plus, Building2, BarChart3, ChevronDown, ChevronUp, Users, Check, FileText } from 'lucide-react';
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
    if (filterMode === 'all') return buildings;
    return buildings
      .map(b => ({
        ...b,
        apartments: b.apartments.filter(apt => {
          const done = isApartmentDone(apt);
          return filterMode === 'pending' ? !done : done;
        }),
      }))
      .filter(b => b.apartments.length > 0);
  }, [buildings, filterMode]);

  const totalPending = buildings.reduce((s, b) => s + b.pendingForCollection, 0);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">טוען...</div>;
  }

  if (!project) {
    return <div className="min-h-screen flex items-center justify-center">פרויקט לא נמצא</div>;
  }

  return (
    <div className="min-h-screen bg-muted" dir="rtl">
      <header className="bg-sidebar text-sidebar-foreground shadow-md">
        <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4">
          <div className="flex items-center gap-2 sm:gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/projects')} className="text-sidebar-foreground hover:bg-sidebar-accent h-9 w-9 sm:h-10 sm:w-10 hidden sm:flex">
              <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg sm:text-xl font-bold truncate">{project.name}</h1>
              <p className="text-xs sm:text-sm text-primary-foreground/80 truncate">{project.city} • {project.developer_name}</p>
            </div>
            <div className="flex gap-1 sm:gap-2 flex-shrink-0">
              <Button variant="secondary" size="icon" onClick={() => navigate(`/projects/${projectId}/users`)} className="h-9 w-9 sm:h-10 sm:w-10">
                <Users className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
              <Button variant="secondary" size="icon" onClick={() => navigate(`/projects/${projectId}/statistics`)} className="h-9 w-9 sm:h-10 sm:w-10">
                <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0 mb-4">
          <h2 className="text-lg sm:text-xl font-bold">בניינים ודירות</h2>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button
              onClick={() => navigate(`/projects/${projectId}/report`)}
              size="sm"
              variant="outline"
              className="gap-2 flex-1 sm:flex-none h-10 sm:h-9"
              title="הפק דוח קיימות"
            >
              <FileText className="h-4 w-4" />
              <span>דוח קיימות</span>
            </Button>
            <Button onClick={() => navigate(`/projects/${projectId}/apartments/new`)} size="sm" className="gap-2 flex-1 sm:flex-none h-10 sm:h-9">
              <Plus className="h-4 w-4" />
              הוסף בניין
            </Button>
          </div>
        </div>

        {/* Filter buttons */}
        {buildings.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <Button
              size="sm"
              variant={filterMode === 'all' ? 'default' : 'outline'}
              onClick={() => setFilterMode('all')}
              className="h-9"
            >
              הכל
            </Button>
            <Button
              size="sm"
              variant={filterMode === 'pending' ? 'default' : 'outline'}
              onClick={() => setFilterMode('pending')}
              className="h-9 gap-1.5"
            >
              לאיסוף
              {totalPending > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5">{totalPending}</Badge>
              )}
            </Button>
            <Button
              size="sm"
              variant={filterMode === 'done' ? 'default' : 'outline'}
              onClick={() => setFilterMode('done')}
              className="h-9"
            >
              הושלמו
            </Button>
          </div>
        )}

        {filteredBuildings.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                {buildings.length === 0 ? 'אין דירות בפרויקט' : 'אין דירות התואמות לסינון'}
              </p>
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
                            <Card
                              key={apartment.id}
                              className={cn(
                                "cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 animate-scale-in",
                                done && "bg-muted/60 opacity-80"
                              )}
                              style={{ animationDelay: `${aIdx * 30}ms` }}
                              onClick={() => navigate(`/projects/${projectId}/apartments/${apartment.id}`)}
                            >
                              <CardContent className="p-3">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    {done && (
                                      <div className="flex-shrink-0 h-6 w-6 rounded-full bg-success/20 flex items-center justify-center">
                                        <Check className="h-3.5 w-3.5 text-success" />
                                      </div>
                                    )}
                                    <span className="font-semibold">דירה {apartment.apartment_number}</span>
                                    {apartment.pendingForCollection > 0 && (
                                      <Badge variant="outline" className="text-xs">
                                        {apartment.pendingForCollection} לאיסוף
                                      </Badge>
                                    )}
                                  </div>
                                  {getStatusBadge(apartment.status)}
                                </div>
                              </CardContent>
                            </Card>
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
