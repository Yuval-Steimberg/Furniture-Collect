import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Home, FolderOpen, BarChart3, Users, LayoutDashboard, Search } from 'lucide-react';

export function MobileBottomNav() {
  const navigate  = useNavigate();
  const location  = useLocation();
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

  const items = isAdmin
    ? [
        { label: 'בית',        url: '/',                   icon: Home },
        { label: 'פרויקטים',  url: '/projects',            icon: FolderOpen },
        { label: 'נתונים',     url: '/global-statistics',  icon: BarChart3 },
        { label: 'בקרה',       url: '/manager-dashboard',  icon: LayoutDashboard },
        { label: 'משתמשים',   url: '/user-management',    icon: Users },
      ]
    : isManager
    ? [
        { label: 'בית',        url: '/',                   icon: Home },
        { label: 'פרויקטים',  url: '/projects',            icon: FolderOpen },
        { label: 'נתונים',     url: '/global-statistics',  icon: BarChart3 },
        { label: 'חיפוש',      url: '/data-explorer',      icon: Search },
        { label: 'בקרה',       url: '/manager-dashboard',  icon: LayoutDashboard },
      ]
    : [
        { label: 'בית',       url: '/',                   icon: Home },
        { label: 'פרויקטים', url: '/projects',            icon: FolderOpen },
        { label: 'נתונים',    url: '/global-statistics',  icon: BarChart3 },
        { label: 'חיפוש',     url: '/data-explorer',      icon: Search },
      ];

  return (
    <nav
      dir="rtl"
      className="fixed bottom-0 inset-x-0 z-40 md:hidden bg-sidebar border-t border-sidebar-border safe-area-bottom"
    >
      <div className="flex items-stretch justify-around h-16">
        {items.map((item) => {
          const active =
            item.url === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.url);
          return (
            <button
              key={item.url}
              onClick={() => navigate(item.url)}
              className={`flex flex-col items-center justify-center gap-0.5 flex-1 px-1 transition-colors
                ${active
                  ? 'text-primary'
                  : 'text-sidebar-foreground/55 hover:text-sidebar-foreground active:text-sidebar-foreground'
                }`}
            >
              <item.icon
                className="h-5 w-5 flex-shrink-0"
                strokeWidth={active ? 2.5 : 1.75}
              />
              <span className="text-[10px] font-semibold tracking-tight leading-none">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
