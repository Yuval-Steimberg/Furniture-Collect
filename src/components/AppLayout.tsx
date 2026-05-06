import { ReactNode, createContext, useContext } from 'react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { AIAssistant } from '@/components/AIAssistant';

// Context so PageHeader can detect it's inside AppLayout and show the menu button
export const InAppLayoutContext = createContext(false);
export const useInAppLayout = () => useContext(InAppLayoutContext);

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <InAppLayoutContext.Provider value={true}>
      <SidebarProvider>
        <div className="flex min-h-screen w-full">
          {/* main comes first so sidebar (side="right") stays on the physical right */}
          <main className="flex-1 relative min-w-0">
            {children}
            <AIAssistant />
          </main>
          <AppSidebar />
        </div>
      </SidebarProvider>
    </InAppLayoutContext.Provider>
  );
}
