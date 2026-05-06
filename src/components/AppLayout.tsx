import { ReactNode } from 'react';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { AIAssistant } from '@/components/AIAssistant';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <main className="flex-1 relative">
          {children}
          {/* Floating AI assistant, available on every logged-in page */}
          <AIAssistant />
          {/* Mobile sidebar trigger — fixed so it's always reachable regardless of page scroll/header */}
          <div className="fixed top-3 right-3 z-50 md:hidden">
            <SidebarTrigger className="h-9 w-9 rounded-lg bg-sidebar text-sidebar-foreground shadow-md hover:bg-sidebar-accent border border-sidebar-border" />
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
