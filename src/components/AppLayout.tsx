import { ReactNode } from 'react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { AIAssistant } from '@/components/AIAssistant';
import { MobileBottomNav } from '@/components/MobileBottomNav';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        {/* Sidebar — visible on desktop, sheet/overlay on mobile (triggered by bottom nav) */}
        <AppSidebar />
        <main className="flex-1 relative pb-16 md:pb-0">
          {children}
          <AIAssistant />
        </main>
      </div>
      {/* Bottom tab bar — mobile only, replaces the old floating trigger */}
      <MobileBottomNav />
    </SidebarProvider>
  );
}
