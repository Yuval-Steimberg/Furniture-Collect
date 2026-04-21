import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Plus, Trash2, UserCheck, Edit2 } from 'lucide-react';
import { toast } from 'sonner';

interface ProjectUser {
  user_id: string;
  project_role: string;
  profiles: {
    name: string;
    org_role: string;
  };
}


export default function ProjectUsers() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [availableUsers, setAvailableUsers] = useState<Array<{id: string; name: string; email: string}>>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<{userId: string; role: 'VIEWER' | 'WORKER' | 'PROJECT_MANAGER'} | null>(null);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState<'VIEWER' | 'WORKER' | 'PROJECT_MANAGER'>('WORKER');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [currentUserRole, setCurrentUserRole] = useState<string>('');

  useEffect(() => {
    loadData();
  }, [projectId]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Get project details
      const { data: projectData, error: projectError } = await supabase
        .from('projects')
        .select('name')
        .eq('id', projectId)
        .single();

      if (projectError) throw projectError;
      setProject(projectData);

      // Get current user role
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not found');

      const { data: userProjectData, error: userProjectError } = await supabase
        .from('user_projects')
        .select('project_role')
        .eq('user_id', user.id)
        .eq('project_id', projectId)
        .single();

      if (userProjectError && userProjectError.code !== 'PGRST116') throw userProjectError;
      
      const { data: profileData } = await supabase
        .from('profiles')
        .select('org_role')
        .eq('id', user.id)
        .single();

      const isOrgAdmin = profileData?.org_role === 'ORG_ADMIN';
      const isProjectManager = userProjectData?.project_role === 'PROJECT_MANAGER';
      
      setCurrentUserRole(isOrgAdmin ? 'ORG_ADMIN' : (userProjectData?.project_role || null));

      // Get project users
      const { data: usersData, error: usersError } = await supabase
        .from('user_projects')
        .select(`
          user_id,
          project_role,
          profiles!inner(name, email, org_role)
        `)
        .eq('project_id', projectId);

      if (usersError) throw usersError;
      
      setUsers(usersData || []);

      // Load available users for adding (if user is manager)
      if (isOrgAdmin || isProjectManager) {
        const { data: allUsers, error: allUsersError } = await supabase
          .from('profiles')
          .select('id, name, email')
          .order('name');

        if (allUsersError) throw allUsersError;

        // Filter out users already in project
        const projectUserIds = usersData?.map((up: any) => up.user_id) || [];
        const available = allUsers?.filter((u: any) => !projectUserIds.includes(u.id)) || [];
        setAvailableUsers(available);
      }
      
    } catch (error: any) {
      toast.error('שגיאה בטעינת נתונים');
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const addUserToProject = async () => {
    try {
      if (!selectedUserId) {
        toast.error('נא לבחור משתמש');
        return;
      }

      // Add user to project
      const { error: insertError } = await supabase
        .from('user_projects')
        .insert({
          user_id: selectedUserId,
          project_id: projectId,
          project_role: selectedRole
        });

      if (insertError) {
        if (insertError.code === '23505') {
          toast.error('משתמש זה כבר משויך לפרויקט');
        } else {
          throw insertError;
        }
        return;
      }

      toast.success('המשתמש נוסף לפרויקט בהצלחה');
      setShowAddDialog(false);
      setSelectedUserId('');
      setSelectedRole('WORKER');
      setSearchQuery('');
      loadData();
    } catch (error: any) {
      toast.error('שגיאה בהוספת משתמש');
      console.error(error);
    }
  };

  const removeUser = async (userId: string) => {
    try {
      const { error } = await supabase
        .from('user_projects')
        .delete()
        .eq('project_id', projectId)
        .eq('user_id', userId);

      if (error) throw error;

      toast.success('משתמש הוסר מהפרויקט');
      loadData();
    } catch (error: any) {
      toast.error('שגיאה בהסרת משתמש');
      console.error(error);
    }
  };

  const updateUserRole = async () => {
    try {
      if (!editingUser) return;

      const { error } = await supabase
        .from('user_projects')
        .update({ project_role: editingUser.role })
        .eq('project_id', projectId)
        .eq('user_id', editingUser.userId);

      if (error) throw error;

      toast.success('תפקיד המשתמש עודכן בהצלחה');
      setShowEditDialog(false);
      setEditingUser(null);
      loadData();
    } catch (error: any) {
      toast.error('שגיאה בעדכון תפקיד');
      console.error(error);
    }
  };


  const getRoleBadge = (role: string) => {
    const badges = {
      'VIEWER': <Badge variant="secondary">צופה</Badge>,
      'WORKER': <Badge>עובד</Badge>,
      'PROJECT_MANAGER': <Badge className="bg-primary">מנהל פרויקט</Badge>,
    };
    return badges[role as keyof typeof badges] || <Badge>{role}</Badge>;
  };

  const canManageUsers = currentUserRole === 'PROJECT_MANAGER' || currentUserRole === 'ORG_ADMIN';

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">טוען...</div>;
  }

  return (
    <div className="min-h-screen bg-muted" dir="rtl">
      <header className="bg-sidebar text-sidebar-foreground shadow-md">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(`/projects/${projectId}`)} className="text-sidebar-foreground hover:bg-sidebar-accent">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-bold">ניהול משתמשים</h1>
              <p className="text-sm text-primary-foreground/80">{project?.name}</p>
            </div>
            {canManageUsers && (
              <Button variant="secondary" size="sm" onClick={() => setShowAddDialog(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                הוסף משתמש
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {/* Active Users */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5" />
              משתמשים פעילים ({users.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {users.map((user) => (
                <div key={user.user_id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                      <span className="font-bold text-primary">
                        {user.profiles.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium">{user.profiles.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {user.profiles.org_role === 'ORG_ADMIN' ? 'מנהל ארגון' : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getRoleBadge(user.project_role)}
                    {canManageUsers && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditingUser({ userId: user.user_id, role: user.project_role });
                            setShowEditDialog(true);
                          }}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        {user.project_role !== 'PROJECT_MANAGER' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeUser(user.user_id)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

      </main>

      {/* Add User Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>הוסף משתמש לפרויקט</DialogTitle>
            <DialogDescription>
              בחר משתמש קיים במערכת והוסף אותו לפרויקט
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>חפש משתמש</Label>
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="חפש לפי שם או מייל..."
              />
            </div>
            <div>
              <Label>בחר משתמש</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="בחר משתמש..." />
                </SelectTrigger>
                <SelectContent>
                  {availableUsers
                    .filter(user => 
                      searchQuery === '' ||
                      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      user.email.toLowerCase().includes(searchQuery.toLowerCase())
                    )
                    .map(user => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name} ({user.email})
                      </SelectItem>
                    ))
                  }
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>תפקיד בפרויקט</Label>
              <Select value={selectedRole} onValueChange={(value: any) => setSelectedRole(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="VIEWER">צופה - רק צפייה</SelectItem>
                  <SelectItem value="WORKER">עובד - צפייה ועריכה</SelectItem>
                  <SelectItem value="PROJECT_MANAGER">מנהל פרויקט - ניהול מלא</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={addUserToProject} className="w-full gap-2">
              <Plus className="h-4 w-4" />
              הוסף לפרויקט
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit User Role Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>ערוך תפקיד משתמש</DialogTitle>
            <DialogDescription>
              שנה את התפקיד של המשתמש בפרויקט
            </DialogDescription>
          </DialogHeader>
          {editingUser && (
            <div className="space-y-4">
              <div>
                <Label>תפקיד בפרויקט</Label>
                <Select 
                  value={editingUser.role} 
                  onValueChange={(value: 'VIEWER' | 'WORKER' | 'PROJECT_MANAGER') => setEditingUser({...editingUser, role: value})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="VIEWER">צופה - רק צפייה</SelectItem>
                    <SelectItem value="WORKER">עובד - צפייה ועריכה</SelectItem>
                    <SelectItem value="PROJECT_MANAGER">מנהל פרויקט - ניהול מלא</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={updateUserRole} className="w-full">
                עדכן תפקיד
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
