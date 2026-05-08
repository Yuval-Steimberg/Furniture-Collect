/**
 * PageHeader — shared header for all inner pages.
 * Forest background / cream text. Sticky top-0 with warm shadow.
 * Auto-shows hamburger (mobile) when inside AppLayout.
 */

import type { ReactNode } from 'react';
import { ArrowLeft, Menu } from 'lucide-react';
import { useInAppLayout } from '@/components/AppLayout';
import { useSidebar } from '@/components/ui/sidebar';

function MenuButtonInner() {
  const { toggleSidebar } = useSidebar();
  return (
    <button
      type="button"
      onClick={toggleSidebar}
      aria-label="פתח תפריט"
      className="flex-shrink-0 flex items-center justify-center h-9 w-9 rounded-lg
                 text-sidebar-foreground/60 hover:text-sidebar-foreground
                 hover:bg-sidebar-accent active:bg-sidebar-accent/80 active:scale-90
                 transition-all duration-[120ms] md:hidden"
    >
      <Menu className="h-5 w-5" />
    </button>
  );
}

function MenuButton() {
  const inLayout = useInAppLayout();
  if (!inLayout) return null;
  return <MenuButtonInner />;
}

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: string;
  onBack?: () => void;
  backLabel?: string;
  actions?: ReactNode;
  bottomSlot?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  onBack,
  backLabel = 'חזרה',
  actions,
  bottomSlot,
  className = '',
}: PageHeaderProps) {
  return (
    <header
      className={`bg-sidebar text-sidebar-foreground sticky top-0 z-20 w-full
                  shadow-[0_1px_0_0_rgba(255,252,245,0.08),0_2px_8px_-2px_rgba(51,61,54,0.35)]
                  ${className}`}
    >
      <div dir="rtl" className={`px-3 sm:px-4 flex items-center gap-2 ${subtitle ? 'h-16' : 'h-14'}`}>

        {/* Mobile menu trigger */}
        <MenuButton />

        {/* Back button */}
        {onBack && (
          <>
            <button
              type="button"
              onClick={onBack}
              className="flex-shrink-0 flex items-center gap-1.5 h-9 px-2.5 rounded-lg
                         text-sidebar-foreground/70 hover:text-sidebar-foreground
                         hover:bg-sidebar-accent active:bg-sidebar-accent/80 active:scale-95
                         transition-all duration-[120ms]"
              aria-label="חזרה"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="text-sm font-semibold hidden sm:inline">{backLabel}</span>
            </button>
            <div className="h-5 w-px bg-sidebar-foreground/20 flex-shrink-0" />
          </>
        )}

        {/* Title block */}
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
          <h1 className="text-base sm:text-lg font-extrabold tracking-tight truncate leading-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-[11px] text-sidebar-foreground/65 truncate leading-none font-medium tracking-wide">
              {subtitle}
            </p>
          )}
        </div>

        {/* Action area */}
        {actions && (
          <div className="flex items-center gap-1 flex-shrink-0">
            {actions}
          </div>
        )}

        {/* JAS wordmark — desktop only */}
        <span
          className="hidden lg:block flex-shrink-0 text-[11px] font-display tracking-[0.18em]
                     text-sidebar-foreground/20 select-none pl-1"
          aria-hidden="true"
        >
          JAS
        </span>
      </div>

      {bottomSlot}
    </header>
  );
}
