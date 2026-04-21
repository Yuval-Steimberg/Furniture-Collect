import { Home, FolderOpen, BarChart3, Users, LogOut } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useEffect, useState } from 'react';
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter } from '@/components/ui/sidebar';
export function AppSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isOrgAdmin, setIsOrgAdmin] = useState(false);
  useEffect(() => {
    checkUserRole();
  }, []);
  const checkUserRole = async () => {
    try {
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();
      if (!user) return;
      const {
        data: profile
      } = await supabase.from('profiles').select('org_role').eq('id', user.id).single();
      setIsOrgAdmin(profile?.org_role === 'ORG_ADMIN');
    } catch (error) {
      console.error('Error checking user role:', error);
    }
  };
  const menuItems = [{
    title: 'דף הבית',
    url: '/',
    icon: Home
  }, {
    title: 'הפרויקטים שלי',
    url: '/projects',
    icon: FolderOpen
  }, {
    title: 'סטטיסטיקות כלליות',
    url: '/global-statistics',
    icon: BarChart3
  }, ...(isOrgAdmin ? [{
    title: 'ניהול משתמשים',
    url: '/user-management',
    icon: Users
  }] : [])];
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/auth');
  };
  return <Sidebar side="right" className="border-l">
      <SidebarHeader className="p-4 border-b">
        <h2 className="font-bold text-lg">תפריט</h2>
      </SidebarHeader>
      
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>ניווט ראשי</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map(item => <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton onClick={() => navigate(item.url)} isActive={location.pathname === item.url} className="w-full justify-start gap-3">
                    <item.icon className="h-5 w-5" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleSignOut} className="w-full justify-start gap-3 text-destructive">
              <LogOut className="h-5 w-5" />
              <span>התנתק</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>;
}