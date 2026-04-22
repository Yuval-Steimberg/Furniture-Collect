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
          <div className="sticky top-0 z-10 bg-background border-b p-2">
            <SidebarTrigger />
          </div>
          {children}
          {/* Floating AI assistant, available on every logged-in page */}
          <AIAssistant />
        </main>
      </div>
    </SidebarProvider>
  );
}
