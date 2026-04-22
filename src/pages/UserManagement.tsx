import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Users, Search, Edit, UserPlus, Trash2, MoreVertical, ChevronDown, FolderOpen, ShieldCheck, Briefcase, HardHat, Mail, X } from 'lucide-react';
import { toast } from 'sonner';
import { StatCard } from '@/components/StatCard';
import { EmptyState } from '@/components/EmptyState';
import { SkeletonStatCard, SkeletonProjectCard } from '@/components/SkeletonCard';

interface UserWithProjects {
  id: string;
  name: string;
  email: string;
  org_role: string;
  projects: Array<{
    project_id: string;
    project_name: string;
    project_role: string;
  }>;
}

export default function UserManagement() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserWithProjects[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [isOrgAdmin, setIsOrgAdmin] = useState(false);
  const [editOrgRoleDialog, setEditOrgRoleDialog] = useState(false);
  const [editProjectRoleDialog, setEditProjectRoleDialog] = useState(false);
  const [addToProjectDialog, setAddToProjectDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithProjects | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [newOrgRole, setNewOrgRole] = useState<string>('');
  const [newProjectRole, setNewProjectRole] = useState<string>('');
  const [allProjects, setAllProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [deleteUserDialog, setDeleteUserDialog] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserWithProjects | null>(null);

  useEffect(() => {
    checkPermissions();
  }, []);

  const checkPermissions = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/auth');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('org_role')
        .eq('id', user.id)
        .single();

      if (profile?.org_role !== 'ORG_ADMIN') {
        toast.error('אין לך הרשאה לצפות בעמוד זה');
        navigate('/projects');
        return;
      }

      setIsOrgAdmin(true);
      loadData();
    } catch (error: any) {
      toast.error('שגיאה בטעינת הרשאות');
      console.error(error);
      navigate('/projects');
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);

      // Load all users
      const { data: allUsers, error: usersError } = await supabase
        .from('profiles')
        .select('id, name, email, org_role')
        .order('name');

      if (usersError) throw usersError;

      // Load all user-project relationships
      const { data: userProjects, error: userProjectsError } = await supabase
        .from('user_projects')
        .select(`
          user_id,
          project_role,
          project_id,
          projects(name)
        `);

      if (userProjectsError) throw userProjectsError;

      // Load all projects for adding users
      const { data: projects, error: projectsError } = await supabase
        .from('projects')
        .select('id, name')
        .order('name');

      if (projectsError) throw projectsError;
      setAllProjects(projects || []);

      // Combine data
      const usersWithProjects: UserWithProjects[] = allUsers?.map(user => ({
        ...user,
        projects: userProjects
          ?.filter((up: any) => up.user_id === user.id)
          .map((up: any) => ({
            project_id: up.project_id,
            project_name: up.projects?.name || '',
            project_role: up.project_role,
          })) || []
      })) || [];

      setUsers(usersWithProjects);
    } catch (error: any) {
      toast.error('שגיאה בטעינת נתונים');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const updateOrgRole = async () => {
    if (!selectedUser || !newOrgRole) return;

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ org_role: newOrgRole as any })
        .eq('id', selectedUser.id);

      if (error) throw error;

      toast.success('תפקיד ארגוני עודכן בהצלחה');
      setEditOrgRoleDialog(false);
      loadData();
    } catch (error: any) {
      toast.error('שגיאה בעדכון תפקיד');
      console.error(error);
    }
  };

  const updateProjectRole = async () => {
    if (!selectedUser || !selectedProjectId || !newProjectRole) return;

    try {
      const { error } = await supabase
        .from('user_projects')
        .update({ project_role: newProjectRole as any })
        .eq('user_id', selectedUser.id)
        .eq('project_id', selectedProjectId);

      if (error) throw error;

      toast.success('תפקיד בפרויקט עודכן בהצלחה');
      setEditProjectRoleDialog(false);
      loadData();
    } catch (error: any) {
      toast.error('שגיאה בעדכון תפקיד');
      console.error(error);
    }
  };

  const addUserToProject = async () => {
    if (!selectedUser || !selectedProjectId || !newProjectRole) return;

    try {
      const { error } = await supabase
        .from('user_projects')
        .insert([{
          user_id: selectedUser.id,
          project_id: selectedProjectId,
          project_role: newProjectRole as any,
        }]);

      if (error) throw error;

      toast.success('משתמש נוסף לפרויקט בהצלחה');
      setAddToProjectDialog(false);
      loadData();
    } catch (error: any) {
      toast.error('שגיאה בהוספת משתמש לפרויקט');
      console.error(error);
    }
  };

  const removeUserFromProject = async (userId: string, projectId: string) => {
    try {
      const { error } = await supabase
        .from('user_projects')
        .delete()
        .eq('user_id', userId)
        .eq('project_id', projectId);

      if (error) throw error;

      toast.success('משתמש הוסר מהפרויקט');
      loadData();
    } catch (error: any) {
      toast.error('שגיאה בהסרת משתמש מפרויקט');
      console.error(error);
    }
  };

  const deleteUser = async () => {
    if (!userToDelete) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast.error('נדרשת התחברות');
        return;
      }

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-user`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: userToDelete.id }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'שגיאה במחיקת משתמש');
      }

      toast.success('המשתמש נמחק בהצלחה');
      setDeleteUserDialog(false);
      setUserToDelete(null);
      loadData();
    } catch (error: any) {
      toast.error(error.message || 'שגיאה במחיקת משתמש');
      console.error(error);
    }
  };

  const getRoleBadge = (role: string) => {
    const badges = {
      'ORG_ADMIN': <Badge className="bg-purple-500">מנהל ארגון</Badge>,
      'PROJECT_MANAGER': <Badge className="bg-primary">מנהל פרויקט</Badge>,
      'WORKER': <Badge>עובד</Badge>,
      'VIEWER': <Badge variant="secondary">צופה</Badge>,
    };
    return badges[role as keyof typeof badges] || <Badge>{role}</Badge>;
  };

  // --- Role filter + stats -------------------------------------------------
  const [roleFilter, setRoleFilter] = useState<'all' | 'ORG_ADMIN' | 'PROJECT_MANAGER' | 'WORKER'>('all');

  const filteredUsers = users.filter(user => {
    const matchesSearch =
      searchQuery === '' ||
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === 'all' || user.org_role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const roleCounts = users.reduce((acc, u) => {
    acc[u.org_role] = (acc[u.org_role] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const assignedCount = users.filter(u => u.projects.length > 0 || u.org_role === 'ORG_ADMIN').length;

  // Consistent per-user avatar color — hash the name to one of the JAS tones.
  const avatarColor = (name: string): string => {
    const palette = ['bg-primary/20 text-primary', 'bg-accent text-accent-foreground', 'bg-foreground text-background', 'bg-muted text-foreground', 'bg-secondary text-secondary-foreground'];
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return palette[h % palette.length];
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-muted p-4 sm:p-6" dir="rtl">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="h-10 w-48 bg-muted-foreground/10 rounded animate-pulse" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <SkeletonStatCard /><SkeletonStatCard /><SkeletonStatCard /><SkeletonStatCard />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <SkeletonProjectCard /><SkeletonProjectCard /><SkeletonProjectCard />
          </div>
        </div>
      </div>
    );
  }

  if (!isOrgAdmin) return null;

  return (
    <div className="min-h-screen bg-muted" dir="rtl">
      {/* Forest hero header */}
      <header className="bg-sidebar text-sidebar-foreground shadow-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-5 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0">
            <Users className="h-5 w-5" strokeWidth={1.75} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs uppercase tracking-wider text-sidebar-foreground/70">ניהול ארגון</div>
            <h1 className="text-lg sm:text-xl font-bold">ניהול משתמשים</h1>
          </div>
          <Button onClick={() => toast.info('הזמנה: פתח משתמש ספציפי ובחר "הוסף לפרויקט", או השתמש בטופס Supabase Auth להוספת משתמש חדש')} size="sm" variant="outline" className="bg-transparent border-sidebar-foreground/30 text-sidebar-foreground hover:bg-sidebar-accent gap-2">
            <UserPlus className="h-4 w-4" />
            <span className="hidden sm:inline">הזמן משתמש</span>
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-5">

        {/* Hero stat cards */}
        <section>
          <div className="eyebrow mb-2">סקירה</div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatCard label="סה״כ משתמשים" value={users.length} sub={`${assignedCount} משויכים לפרויקטים`} icon={Users} accent="slate" />
            <StatCard label="מנהלי ארגון" value={roleCounts.ORG_ADMIN ?? 0} sub="גישה מלאה לכל הפרויקטים" icon={ShieldCheck} accent="orange" />
            <StatCard label="מנהלי פרויקט" value={roleCounts.PROJECT_MANAGER ?? 0} sub="ניהול פרויקט + עובדים" icon={Briefcase} accent="sage" />
            <StatCard label="עובדים" value={roleCounts.WORKER ?? 0} sub="תיעוד בשטח" icon={HardHat} accent="slate" />
          </div>
        </section>

        {/* Search + role filter */}
        <section className="space-y-3">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              placeholder="חפש לפי שם או אימייל…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pr-10 h-11"
              dir="rtl"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute left-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full flex items-center justify-center hover:bg-muted"
                aria-label="נקה חיפוש"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {([
              { v: 'all' as const,              label: 'כל המשתמשים', count: users.length },
              { v: 'ORG_ADMIN' as const,         label: 'מנהלי ארגון',  count: roleCounts.ORG_ADMIN ?? 0 },
              { v: 'PROJECT_MANAGER' as const,   label: 'מנהלי פרויקט', count: roleCounts.PROJECT_MANAGER ?? 0 },
              { v: 'WORKER' as const,            label: 'עובדים',       count: roleCounts.WORKER ?? 0 },
            ]).map(t => (
              <button
                key={t.v}
                onClick={() => setRoleFilter(t.v)}
                className={`px-3 h-9 rounded-full text-sm whitespace-nowrap font-semibold transition-colors ${
                  roleFilter === t.v
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card border border-border hover:bg-muted'
                }`}
              >
                {t.label} <span className="opacity-70 tabular-nums">({t.count})</span>
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{filteredUsers.length} {filteredUsers.length === 1 ? 'תוצאה' : 'תוצאות'}</p>
          </div>
        </section>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredUsers.map((user) => (
            <Card key={user.id} className="overflow-hidden hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                {/* User Header */}
                <div className="flex items-start gap-3">
                  <div className={`h-11 w-11 shrink-0 rounded-full flex items-center justify-center ${avatarColor(user.name)}`}>
                    <span className="font-bold text-base">
                      {user.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold truncate text-sm sm:text-base">{user.name}</p>
                        <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                          <Mail className="h-3 w-3 flex-shrink-0" strokeWidth={1.75} />
                          <span className="truncate">{user.email}</span>
                        </p>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => {
                            setSelectedUser(user);
                            setNewOrgRole(user.org_role);
                            setEditOrgRoleDialog(true);
                          }}>
                            <Edit className="h-4 w-4 ml-2" />
                            ערוך תפקיד ארגוני
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => {
                            setSelectedUser(user);
                            setSelectedProjectId('');
                            setNewProjectRole('WORKER');
                            setAddToProjectDialog(true);
                          }}>
                            <UserPlus className="h-4 w-4 ml-2" />
                            הוסף לפרויקט
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            className="text-destructive focus:text-destructive"
                            onClick={() => {
                              setUserToDelete(user);
                              setDeleteUserDialog(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4 ml-2" />
                            מחק משתמש
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="mt-2">
                      {getRoleBadge(user.org_role)}
                    </div>
                  </div>
                </div>

                {/* Projects Section */}
                {user.projects.length > 0 && (
                  <Collapsible className="mt-3">
                    <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground w-full">
                      <FolderOpen className="h-4 w-4" />
                      <span>{user.projects.length} פרויקטים</span>
                      <ChevronDown className="h-4 w-4 mr-auto transition-transform duration-200 [&[data-state=open]]:rotate-180" />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-2 space-y-1.5">
                      {user.projects.map((project) => (
                        <div 
                          key={project.project_id} 
                          className="flex items-center justify-between p-2 bg-muted rounded text-sm"
                        >
                          <span className="truncate flex-1 min-w-0">{project.project_name}</span>
                          <div className="flex items-center gap-1 shrink-0 mr-2">
                            {getRoleBadge(project.project_role)}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6">
                                  <MoreVertical className="h-3 w-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => {
                                  setSelectedUser(user);
                                  setSelectedProjectId(project.project_id);
                                  setNewProjectRole(project.project_role);
                                  setEditProjectRoleDialog(true);
                                }}>
                                  <Edit className="h-4 w-4 ml-2" />
                                  ערוך תפקיד
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => removeUserFromProject(user.id, project.project_id)}
                                >
                                  <Trash2 className="h-4 w-4 ml-2" />
                                  הסר מפרויקט
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                )}

                {user.projects.length === 0 && user.org_role !== 'ORG_ADMIN' && (
                  <p className="text-xs text-muted-foreground mt-3">לא משויך לפרויקטים</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {filteredUsers.length === 0 && (
          <Card>
            <CardContent className="p-0">
              <EmptyState
                icon={Users}
                title={users.length === 0 ? 'אין משתמשים בארגון' : 'לא נמצאו תוצאות'}
                description={users.length === 0
                  ? 'הזמן את חברי הצוות הראשונים כדי להתחיל לעבוד יחד.'
                  : 'נסה חיפוש אחר או אפס את הסינון לפי תפקיד.'}
                actionLabel={users.length === 0 ? undefined : 'אפס סינון'}
                onAction={users.length === 0 ? undefined : () => { setSearchQuery(''); setRoleFilter('all'); }}
              />
            </CardContent>
          </Card>
        )}
      </main>

      {/* Edit Org Role Dialog */}
      <Dialog open={editOrgRoleDialog} onOpenChange={setEditOrgRoleDialog}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>עריכת תפקיד ארגוני</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">משתמש: {selectedUser?.name}</label>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">תפקיד ארגוני</label>
              <Select value={newOrgRole} onValueChange={setNewOrgRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ORG_ADMIN">מנהל ארגון</SelectItem>
                  <SelectItem value="PROJECT_MANAGER">מנהל פרויקט</SelectItem>
                  <SelectItem value="WORKER">עובד</SelectItem>
                  <SelectItem value="VIEWER">צופה</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setEditOrgRoleDialog(false)}>
                ביטול
              </Button>
              <Button onClick={updateOrgRole}>
                שמור
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Project Role Dialog */}
      <Dialog open={editProjectRoleDialog} onOpenChange={setEditProjectRoleDialog}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>עריכת תפקיד בפרויקט</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">משתמש: {selectedUser?.name}</label>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">תפקיד בפרויקט</label>
              <Select value={newProjectRole} onValueChange={setNewProjectRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PROJECT_MANAGER">מנהל פרויקט</SelectItem>
                  <SelectItem value="WORKER">עובד</SelectItem>
                  <SelectItem value="VIEWER">צופה</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setEditProjectRoleDialog(false)}>
                ביטול
              </Button>
              <Button onClick={updateProjectRole}>
                שמור
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add to Project Dialog */}
      <Dialog open={addToProjectDialog} onOpenChange={setAddToProjectDialog}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>הוספת משתמש לפרויקט</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">משתמש: {selectedUser?.name}</label>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">בחר פרויקט</label>
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="בחר פרויקט" />
                </SelectTrigger>
                <SelectContent>
                  {allProjects
                    .filter(p => !selectedUser?.projects.some(up => up.project_id === p.id))
                    .map(project => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">תפקיד בפרויקט</label>
              <Select value={newProjectRole} onValueChange={setNewProjectRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PROJECT_MANAGER">מנהל פרויקט</SelectItem>
                  <SelectItem value="WORKER">עובד</SelectItem>
                  <SelectItem value="VIEWER">צופה</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setAddToProjectDialog(false)}>
                ביטול
              </Button>
              <Button onClick={addUserToProject}>
                הוסף
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete User Confirmation */}
      <AlertDialog open={deleteUserDialog} onOpenChange={setDeleteUserDialog}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>האם אתה בטוח?</AlertDialogTitle>
            <AlertDialogDescription>
              פעולה זו תמחק לצמיתות את המשתמש <strong>{userToDelete?.name}</strong> מהמערכת.
              כל הנתונים המשויכים למשתמש זה יימחקו ולא ניתן יהיה לשחזר אותם.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={deleteUser} className="bg-destructive hover:bg-destructive/90">
              מחק משתמש
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
