import { useEffect, useState } from 'react';
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
import { HardHat, Plus, LogOut, Building2, MapPin, Calendar, User, MoreVertical, Edit2, Trash2, Archive, ArchiveRestore, LayoutGrid, List } from 'lucide-react';
import { toast } from 'sonner';
import type { Session } from '@supabase/supabase-js';

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

  const activeProjects = projects.filter(p => !p.archived);
  const archivedProjects = projects.filter(p => p.archived);

  const renderProjectCard = (project: Project) => (
    <Card 
      key={project.id} 
      className="cursor-pointer hover:shadow-lg transition-shadow relative"
      onClick={() => navigate(`/projects/${project.id}`)}
      dir="rtl"
    >
      <CardHeader className="pb-2">
        <CardTitle className="flex items-start justify-between gap-2">
          <span className="line-clamp-2 text-right">{project.name}</span>
          <div className="flex items-center gap-1 flex-shrink-0">
            {project.archived && (
              <Badge variant="secondary" className="text-xs">ארכיון</Badge>
            )}
            {(profile?.org_role === 'ORG_ADMIN' || profile?.org_role === 'PROJECT_MANAGER') && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-0 w-auto">
                  <DropdownMenuItem onClick={(e) => openEditDialog(project, e as any)} className="justify-center px-3">
                    <Edit2 className="h-4 w-4" />
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => toggleArchive(project, e as any)} className="justify-center px-3">
                    {project.archived ? (
                      <ArchiveRestore className="h-4 w-4" />
                    ) : (
                      <Archive className="h-4 w-4" />
                    )}
                  </DropdownMenuItem>
                  {profile?.org_role === 'ORG_ADMIN' && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        onClick={(e) => openDeleteDialog(project, e as any)}
                        className="text-destructive focus:text-destructive justify-center px-3"
                      >
                        <Trash2 className="h-4 w-4" />
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin className="h-4 w-4 flex-shrink-0" />
          <span>{project.city}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <User className="h-4 w-4 flex-shrink-0" />
          <span>{project.developer_name}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Calendar className="h-4 w-4 flex-shrink-0" />
          <span>{new Date(project.start_date).toLocaleDateString('he-IL')}</span>
        </div>
        <div className="pt-2 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">דירות</span>
            <Badge variant="outline">
              {project.completed_count} / {project.apartment_count}
            </Badge>
          </div>
          {project.apartment_count > 0 && (
            <div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-success transition-all"
                  style={{ width: `${(project.completed_count! / project.apartment_count) * 100}%` }}
                />
              </div>
            </div>
          )}
          {project.items_to_collect !== undefined && project.items_to_collect > 0 && (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">פריטים לאיסוף</span>
                <Badge variant="secondary">
                  {project.items_collected} / {project.items_to_collect}
                </Badge>
              </div>
              <div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary transition-all"
                    style={{ width: `${(project.items_collected! / project.items_to_collect) * 100}%` }}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );

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
                <DropdownMenuContent align="start" className="min-w-0 w-auto">
                  <DropdownMenuItem onClick={(e) => openEditDialog(project, e as any)} className="justify-center px-3">
                    <Edit2 className="h-4 w-4" />
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => toggleArchive(project, e as any)} className="justify-center px-3">
                    {project.archived ? (
                      <ArchiveRestore className="h-4 w-4" />
                    ) : (
                      <Archive className="h-4 w-4" />
                    )}
                  </DropdownMenuItem>
                  {profile?.org_role === 'ORG_ADMIN' && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        onClick={(e) => openDeleteDialog(project, e as any)}
                        className="text-destructive focus:text-destructive justify-center px-3"
                      >
                        <Trash2 className="h-4 w-4" />
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <HardHat className="h-12 w-12 text-primary animate-pulse mx-auto mb-4" />
          <p className="text-muted-foreground">טוען...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted" dir="rtl">
      <header className="bg-sidebar text-sidebar-foreground shadow-md">
        <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
              <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-primary-foreground/20 flex items-center justify-center flex-shrink-0">
                <HardHat className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-base sm:text-xl font-bold truncate">מערכת תיעוד פינוי</h1>
                <p className="text-xs sm:text-sm text-primary-foreground/80 truncate">{profile?.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
              <Badge variant="secondary" className="hidden sm:flex text-xs">
                {profile?.org_role === 'ORG_ADMIN' ? 'מנהל ארגון' : 
                 profile?.org_role === 'PROJECT_MANAGER' ? 'מנהל פרויקט' : 'עובד'}
              </Badge>
              <Button variant="ghost" size="icon" onClick={handleSignOut} className="text-sidebar-foreground hover:bg-sidebar-accent h-9 w-9 sm:h-10 sm:w-10">
                <LogOut className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0 mb-4 sm:mb-6">
          <h2 className="text-xl sm:text-2xl font-bold">הפרויקטים שלי</h2>
          {profile?.org_role === 'ORG_ADMIN' && (
            <Button onClick={() => navigate('/projects/new')} className="gap-2 w-full sm:w-auto h-11 sm:h-10">
              <Plus className="h-4 w-4" />
              פרויקט חדש
            </Button>
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
                <CardContent className="py-12 text-center">
                  <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">אין פרויקטים פעילים</p>
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
