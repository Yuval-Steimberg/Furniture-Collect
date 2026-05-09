import { ReactNode, createContext, useContext, useEffect, useState } from 'react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { AIAssistant } from '@/components/AIAssistant';
import { CommandPalette } from '@/components/CommandPalette';
import { OfflineBadge } from '@/components/OfflineBadge';

// Context so PageHeader can detect it's inside AppLayout and show the menu button
export const InAppLayoutContext = createContext(false);
export const useInAppLayout = () => useContext(InAppLayoutContext);

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen(v => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <InAppLayoutContext.Provider value={true}>
      <SidebarProvider defaultOpen={false}>
        <div className="flex min-h-screen w-full">
          {/* main comes first so sidebar (side="right") stays on the physical right */}
          <main className="flex-1 relative min-w-0">
            {/* Offline badge — top-left corner (RTL = physical left = start) */}
            <div className="absolute top-3 left-3 z-30 pointer-events-auto">
              <OfflineBadge />
            </div>
            {children}
            <AIAssistant />
          </main>
          <AppSidebar />
        </div>
      </SidebarProvider>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </InAppLayoutContext.Provider>
  );
}
