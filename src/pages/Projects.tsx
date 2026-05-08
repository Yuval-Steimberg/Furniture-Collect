import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HardHat, Plus, LogOut, Building2, MapPin, Calendar, User, MoreVertical, Edit2, Trash2, Archive, ArchiveRestore, LayoutGrid, List, Search, TrendingUp, Package, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Session } from '@supabase/supabase-js';
import { EmptyState } from '@/components/EmptyState';
import { SkeletonProjectCard } from '@/components/SkeletonCard';
import { PageHeader } from '@/components/PageHeader';

interface Profile {
  id: string;
  name: string;
  org_role: 'ORG_ADMIN' | 'PROJECT_MANAGER' | 'WORKER';
}

interface Project {
  id: string;
  name: string;
  city: string;
  developer_name: string;
  start_date: string;
  archived: boolean;
  apartment_count?: number;
  completed_count?: number;
  items_to_collect?: number;
  items_collected?: number;
}

export default function Projects() {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editForm, setEditForm] = useState({ name: '', city: '', developer_name: '', start_date: '' });
  
  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate('/auth');
        return;
      }
      setSession(session);
      loadUserData(session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        loadUserData(session.user.id);
      } else {
        navigate('/auth');
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  // Cmd/Ctrl+K → focus search; Cmd/Ctrl+N → new project (admin only)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'n' && profile?.org_role === 'ORG_ADMIN') {
        e.preventDefault();
        navigate('/projects/new');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [profile, navigate]);

  const loadUserData = async (userId: string) => {
    try {
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError) throw profileError;
      setProfile(profileData);

      const { data: projectsData, error: projectsError } = await supabase
        .from('projects')
        .select(`
          *,
          apartments(id, status),
          items(id, intended_for_collection, collected)
        `);

      if (projectsError) throw projectsError;

      const projectsWithCounts = projectsData.map(p => {
        const itemsToCollect = p.items?.filter((i: any) => i.intended_for_collection).length || 0;
        const itemsCollected = p.items?.filter((i: any) => i.intended_for_collection && i.collected).length || 0;
        
        return {
          id: p.id,
          name: p.name,
          city: p.city,
          developer_name: p.developer_name,
          start_date: p.start_date,
          archived: p.archived || false,
          apartment_count: p.apartments?.length || 0,
          completed_count: p.apartments?.filter((a: any) => a.status === 'COMPLETED').length || 0,
          items_to_collect: itemsToCollect,
          items_collected: itemsCollected,
        };
      });

      setProjects(projectsWithCounts);
    } catch (error: any) {
      toast.error('שגיאה בטעינת נתונים');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/auth');
  };

  const openEditDialog = (project: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingProject(project);
    setEditForm({
      name: project.name,
      city: project.city,
      developer_name: project.developer_name,
      start_date: project.start_date,
    });
    setEditDialogOpen(true);
  };

  const handleEditProject = async () => {
    if (!editingProject) return;
    
    try {
      const { error } = await supabase
        .from('projects')
        .update({
          name: editForm.name,
          city: editForm.city,
          developer_name: editForm.developer_name,
          start_date: editForm.start_date,
        })
        .eq('id', editingProject.id);
      
      if (error) throw error;
      
      toast.success('הפרויקט עודכן בהצלחה');
      setEditDialogOpen(false);
      if (session) loadUserData(session.user.id);
    } catch (error: any) {
      toast.error('שגיאה בעדכון הפרויקט');
      console.error(error);
    }
  };

  const openDeleteDialog = (project: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    setProjectToDelete(project);
    setDeleteDialogOpen(true);
  };

  const handleDeleteProject = async () => {
    if (!projectToDelete) return;
    
    try {
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', projectToDelete.id);
      
      if (error) throw error;
      
      toast.success('הפרויקט נמחק בהצלחה');
      setDeleteDialogOpen(false);
      if (session) loadUserData(session.user.id);
    } catch (error: any) {
      toast.error('שגיאה במחיקת הפרויקט');
      console.error(error);
    }
  };

  const toggleArchive = async (project: Project, e: React.MouseEvent) => {
    e.stopPropagation();
    
    try {
      const { error } = await supabase
        .from('projects')
        .update({ archived: !project.archived })
        .eq('id', project.id);
      
      if (error) throw error;
      
      toast.success(project.archived ? 'הפרויקט הוצא מהארכיון' : 'הפרויקט הועבר לארכיון');
      if (session) loadUserData(session.user.id);
    } catch (error: any) {
      toast.error('שגיאה בעדכון הפרויקט');
      console.error(error);
    }
  };

  const q = searchQuery.trim().toLowerCase();
  const matchProject = (p: Project) =>
    !q ||
    p.name.toLowerCase().includes(q) ||
    p.city.toLowerCase().includes(q) ||
    p.developer_name.toLowerCase().includes(q);

  const activeProjects = projects.filter(p => !p.archived && matchProject(p));
  const archivedProjects = projects.filter(p => p.archived && matchProject(p));

  // Global stats strip
  const totalPendingItems = projects.reduce((s, p) => s + ((p.items_to_collect ?? 0) - (p.items_collected ?? 0)), 0);
  const totalCollectedItems = projects.reduce((s, p) => s + (p.items_collected ?? 0), 0);
  const totalApartments = projects.reduce((s, p) => s + (p.apartment_count ?? 0), 0);
  const totalCompleted = projects.reduce((s, p) => s + (p.completed_count ?? 0), 0);

  const renderProjectCard = (project: Project) => {
    const aptProgress = project.apartment_count > 0
      ? (project.completed_count! / project.apartment_count) * 100
      : 0;
    const itemsTotal = project.items_to_collect ?? 0;
    const itemsDone  = project.items_collected ?? 0;
    const itemProgress = itemsTotal > 0 ? (itemsDone / itemsTotal) * 100 : 0;
    const status = project.archived
      ? { label: 'ארכיון', cls: 'bg-muted text-muted-foreground' }
      : aptProgress === 100 && project.apartment_count > 0
        ? { label: 'הושלם', cls: 'bg-accent text-accent-foreground' }
        : project.apartment_count > 0
          ? { label: 'פעיל', cls: 'bg-primary/10 text-primary' }
          : { label: 'חדש', cls: 'bg-secondary text-secondary-foreground' };

    return (
      <div
        key={project.id}
        onClick={() => navigate(`/projects/${project.id}`)}
        className="group cursor-pointer rounded-xl border border-border bg-card hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-220 overflow-hidden active:scale-[0.985] active:translate-y-0 active:shadow-xs"
        dir="rtl"
        role="button"
        tabIndex={0}
      >
        {/* Decorative cream-to-sage gradient strip at the top */}
        <div className="h-1.5 w-full bg-gradient-to-r from-accent via-secondary to-muted" />

        <div className="p-4 sm:p-5">
          {/* Title + status + kebab */}
          <div className="flex items-start gap-2 mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-full ${status.cls}`}>
                  {status.label}
                </span>
              </div>
              <h3 className="text-lg sm:text-xl font-bold leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                {project.name}
              </h3>
            </div>
            {(profile?.org_role === 'ORG_ADMIN' || profile?.org_role === 'PROJECT_MANAGER') && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0 -mt-1">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" dir="rtl">
                  <DropdownMenuItem onClick={(e) => openEditDialog(project, e as any)} className="gap-2">
                    <Edit2 className="h-4 w-4" /> עריכה
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => toggleArchive(project, e as any)} className="gap-2">
                    {project.archived ? <><ArchiveRestore className="h-4 w-4" /> הוצא מארכיון</> : <><Archive className="h-4 w-4" /> העבר לארכיון</>}
                  </DropdownMenuItem>
                  {profile?.org_role === 'ORG_ADMIN' && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={(e) => openDeleteDialog(project, e as any)}
                        className="text-destructive focus:text-destructive gap-2"
                      >
                        <Trash2 className="h-4 w-4" /> מחק פרויקט
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {/* Meta — city, developer, date in a tight row */}
          <div className="text-xs sm:text-sm text-muted-foreground space-y-1 mb-4">
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={1.75} />
              <span className="truncate">{project.city}</span>
              <span>·</span>
              <User className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={1.75} />
              <span className="truncate">{project.developer_name}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={1.75} />
              <span>{new Date(project.start_date).toLocaleDateString('he-IL')}</span>
            </div>
          </div>

          {/* Progress bars — apartments + items */}
          <div className="space-y-2.5 mb-4">
            <div>
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-xs text-muted-foreground">דירות</span>
                <span className="text-xs font-bold tabular-nums">{project.completed_count}/{project.apartment_count}</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${aptProgress === 100 ? 'bg-green-500' : 'bg-primary'}`} style={{ width: `${aptProgress}%` }} />
              </div>
            </div>
            {itemsTotal > 0 && (
              <div>
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-xs text-muted-foreground">פריטים לאיסוף</span>
                  <span className="text-xs font-bold tabular-nums">{itemsDone}/{itemsTotal}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${itemProgress === 100 ? 'bg-green-500' : 'bg-emerald-500'}`} style={{ width: `${itemProgress}%` }} />
                </div>
              </div>
            )}
          </div>

          {/* Hero stat row */}
          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border">
            <div className="text-center">
              <div className="text-base sm:text-lg font-extrabold text-foreground tabular-nums">{project.apartment_count}</div>
              <div className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider">דירות</div>
            </div>
            <div className="text-center">
              <div className="text-base sm:text-lg font-extrabold text-foreground tabular-nums">{itemsTotal}</div>
              <div className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider">פריטים</div>
            </div>
            <div className="text-center">
              <div className="text-base sm:text-lg font-extrabold text-primary tabular-nums">{itemsDone}</div>
              <div className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider">נאספו</div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderProjectRow = (project: Project) => (
    <Card 
      key={project.id} 
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => navigate(`/projects/${project.id}`)}
      dir="rtl"
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <h3 className="font-semibold truncate">{project.name}</h3>
              {project.archived && (
                <Badge variant="secondary" className="text-xs shrink-0">ארכיון</Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {project.city}
              </span>
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                {project.developer_name}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {new Date(project.start_date).toLocaleDateString('he-IL')}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-left">
              <Badge variant="outline" className="mb-1">
                {project.completed_count} / {project.apartment_count} דירות
              </Badge>
              {project.items_to_collect !== undefined && project.items_to_collect > 0 && (
                <Badge variant="secondary" className="block">
                  {project.items_collected} / {project.items_to_collect} פריטים
                </Badge>
              )}
            </div>
            {(profile?.org_role === 'ORG_ADMIN' || profile?.org_role === 'PROJECT_MANAGER') && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" dir="rtl">
                  <DropdownMenuItem onClick={(e) => openEditDialog(project, e as any)} className="gap-2">
                    <Edit2 className="h-4 w-4" /> עריכה
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => toggleArchive(project, e as any)} className="gap-2">
                    {project.archived ? <><ArchiveRestore className="h-4 w-4" /> הוצא מארכיון</> : <><Archive className="h-4 w-4" /> העבר לארכיון</>}
                  </DropdownMenuItem>
                  {profile?.org_role === 'ORG_ADMIN' && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={(e) => openDeleteDialog(project, e as any)}
                        className="text-destructive focus:text-destructive gap-2"
                      >
                        <Trash2 className="h-4 w-4" /> מחק פרויקט
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-muted" dir="rtl">
        <PageHeader title="הפרויקטים שלי" />
        <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            <SkeletonProjectCard />
            <SkeletonProjectCard />
            <SkeletonProjectCard />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted" dir="rtl">
      <PageHeader
        title="הפרויקטים שלי"
        actions={
          profile?.org_role === 'ORG_ADMIN' ? (
            <Button onClick={() => navigate('/projects/new')} size="sm"
              className="gap-1.5 h-8 px-3 text-sm font-semibold">
              <Plus className="h-4 w-4" />
              פרויקט חדש
            </Button>
          ) : undefined
        }
      />

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-8">

        {/* User greeting */}
        {profile?.name && (
          <div dir="rtl" className="mb-4">
            <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-muted-foreground/60 leading-none mb-0.5">
              {profile.org_role === 'ORG_ADMIN' ? 'מנהל ארגון' : profile.org_role === 'PROJECT_MANAGER' ? 'מנהל פרויקט' : 'עובד'}
            </p>
            <h2 className="text-2xl font-extrabold tracking-tight text-foreground leading-tight">
              {profile.name}
            </h2>
          </div>
        )}

        {/* Stats strip */}
        {projects.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4 sm:mb-5">
            {[
              { icon: Building2, label: 'פרויקטים פעילים', value: projects.filter(p => !p.archived).length, color: 'text-primary' },
              { icon: TrendingUp, label: 'דירות שהושלמו', value: `${totalCompleted}/${totalApartments}`, color: 'text-green-600 dark:text-green-400' },
              { icon: Package, label: 'ממתין לאיסוף', value: totalPendingItems, color: 'text-amber-600 dark:text-amber-400' },
              { icon: CheckCircle2, label: 'פריטים נאספו', value: totalCollectedItems, color: 'text-emerald-600 dark:text-emerald-400' },
            ].map(({ icon: Icon, label, value, color }) => (
              <div key={label} className="bg-card border border-border rounded-xl px-3 py-2.5 flex items-center gap-2.5">
                <Icon className={`h-4 w-4 flex-shrink-0 ${color}`} strokeWidth={1.75} />
                <div className="min-w-0">
                  <div className={`text-lg font-extrabold tabular-nums leading-tight ${color}`}>{value}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{label}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Search bar */}
        <div className="relative mb-4">
          <Search className="absolute top-1/2 -translate-y-1/2 right-3 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            ref={searchRef}
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="חיפוש לפי שם, עיר, יזם…"
            dir="rtl"
            className="w-full h-10 pr-9 pl-10 rounded-lg border border-input bg-card text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <kbd className="absolute left-3 top-1/2 -translate-y-1/2 hidden sm:flex items-center gap-0.5 text-[10px] text-muted-foreground border border-border rounded px-1 py-0.5">⌘K</kbd>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute left-8 sm:left-16 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'active' | 'archived')} className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="active" className="gap-2">
                <Building2 className="h-4 w-4" />
                פעילים ({activeProjects.length})
              </TabsTrigger>
              <TabsTrigger value="archived" className="gap-2">
                <Archive className="h-4 w-4" />
                ארכיון ({archivedProjects.length})
              </TabsTrigger>
            </TabsList>
            <div className="flex gap-1">
              <Button
                variant={viewMode === 'grid' ? 'default' : 'outline'}
                size="icon"
                className="h-9 w-9"
                onClick={() => setViewMode('grid')}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'outline'}
                size="icon"
                className="h-9 w-9"
                onClick={() => setViewMode('list')}
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <TabsContent value="active">
            {activeProjects.length === 0 ? (
              <Card>
                <CardContent className="p-0">
                  <EmptyState
                    icon={searchQuery ? Search : Building2}
                    title={searchQuery ? `אין תוצאות עבור "${searchQuery}"` : 'אין פרויקטים פעילים'}
                    description={searchQuery ? 'נסה לחפש בצורה אחרת.' : 'צור פרויקט ראשון כדי להתחיל לתעד דירות בפינוי.'}
                    actionLabel={searchQuery ? 'נקה חיפוש' : 'צור פרויקט'}
                    onAction={searchQuery ? () => setSearchQuery('') : () => navigate('/projects/new')}
                  />
                </CardContent>
              </Card>
            ) : viewMode === 'grid' ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {activeProjects.map(renderProjectCard)}
              </div>
            ) : (
              <div className="space-y-3">
                {activeProjects.map(renderProjectRow)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="archived">
            {archivedProjects.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Archive className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">אין פרויקטים בארכיון</p>
                </CardContent>
              </Card>
            ) : viewMode === 'grid' ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {archivedProjects.map(renderProjectCard)}
              </div>
            ) : (
              <div className="space-y-3">
                {archivedProjects.map(renderProjectRow)}
              </div>
            )}
          </TabsContent>
        </Tabs>

      </main>

      {/* Edit Project Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>עריכת פרויקט</DialogTitle>
            <DialogDescription>ערוך את פרטי הפרויקט</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">שם הפרויקט</Label>
              <Input
                id="edit-name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-city">עיר</Label>
              <Input
                id="edit-city"
                value={editForm.city}
                onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-developer">שם היזם</Label>
              <Input
                id="edit-developer"
                value={editForm.developer_name}
                onChange={(e) => setEditForm({ ...editForm, developer_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-date">תאריך התחלה</Label>
              <Input
                id="edit-date"
                type="date"
                value={editForm.start_date}
                onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>ביטול</Button>
            <Button onClick={handleEditProject}>שמירה</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Project Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת פרויקט</AlertDialogTitle>
            <AlertDialogDescription>
              האם אתה בטוח שברצונך למחוק את הפרויקט "{projectToDelete?.name}"?
              <br />
              פעולה זו לא ניתנת לביטול ותמחק את כל הדירות והפריטים בפרויקט.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteProject} className="bg-destructive hover:bg-destructive/90">
              מחק
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
