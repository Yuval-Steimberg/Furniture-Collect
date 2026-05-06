import { Home, FolderOpen, BarChart3, Users, LogOut, LayoutDashboard, Search, X } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useEffect, useState } from 'react';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarHeader, SidebarFooter, useSidebar,
} from '@/components/ui/sidebar';

function SidebarCloseButton() {
  const { toggleSidebar } = useSidebar();
  return (
    <button
      onClick={toggleSidebar}
      className="flex items-center justify-center h-8 w-8 rounded-lg
                 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent
                 transition-colors md:hidden"
      aria-label="סגור תפריט"
    >
      <X className="h-4 w-4" />
    </button>
  );
}

export function AppSidebar() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { toggleSidebar, isMobile } = useSidebar();
  const [orgRole, setOrgRole] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from('profiles').select('org_role').eq('id', user.id).single()
        .then(({ data }) => setOrgRole(data?.org_role ?? null));
    });
  }, []);

  const isAdmin   = orgRole === 'ORG_ADMIN';
  const isManager = orgRole === 'ORG_ADMIN' || orgRole === 'PROJECT_MANAGER';

  const menuItems = [
    { title: 'דף הבית',           url: '/',                  icon: Home },
    { title: 'הפרויקטים שלי',     url: '/projects',           icon: FolderOpen },
    { title: 'סטטיסטיקות כלליות', url: '/global-statistics',  icon: BarChart3 },
    { title: 'חוקר נתונים',       url: '/data-explorer',      icon: Search },
    ...(isManager ? [{ title: 'לוח בקרה',        url: '/manager-dashboard', icon: LayoutDashboard }] : []),
    ...(isAdmin   ? [{ title: 'ניהול משתמשים',   url: '/user-management',   icon: Users }] : []),
  ];

  const handleNav = (url: string) => {
    navigate(url);
    if (isMobile) toggleSidebar();
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/auth');
  };

  return (
    <Sidebar side="right" collapsible="offcanvas" className="border-l border-sidebar-border bg-sidebar">
      <SidebarHeader className="bg-sidebar px-4 py-4 border-b border-sidebar-border">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-sidebar-foreground/40">תפריט ניווט</p>
            <h2 className="text-base font-extrabold tracking-tight text-sidebar-foreground leading-tight">
              Just A Second
            </h2>
          </div>
          <SidebarCloseButton />
        </div>
      </SidebarHeader>

      <SidebarContent className="bg-sidebar py-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map(item => {
                const active =
                  item.url === '/'
                    ? location.pathname === '/'
                    : location.pathname.startsWith(item.url);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      onClick={() => handleNav(item.url)}
                      isActive={active}
                      className="w-full justify-start gap-3 h-11 px-3 rounded-lg text-sidebar-foreground/70
                                 hover:text-sidebar-foreground hover:bg-sidebar-accent
                                 data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-foreground
                                 data-[active=true]:font-bold"
                    >
                      <item.icon className="h-5 w-5 flex-shrink-0" strokeWidth={active ? 2.5 : 1.75} />
                      <span className="text-sm">{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="bg-sidebar px-3 py-3 border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={handleSignOut}
              className="w-full justify-start gap-3 h-10 px-3 rounded-lg text-destructive
                         hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="h-5 w-5" />
              <span className="text-sm font-semibold">התנתק</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
