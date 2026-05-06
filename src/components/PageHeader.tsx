/**
 * PageHeader — Shared header component for all inner pages.
 *
 * When rendered inside AppLayout, it auto-shows a hamburger menu button
 * (mobile only) that opens the sidebar panel.
 *
 * Design tokens:
 *  bg-sidebar / text-sidebar-foreground  →  forest #333D36 / cream #FFFCF5
 *  font-extrabold tracking-tight         →  Heebo 800
 *  font-display                          →  Bowlby One SC ("JAS" wordmark)
 */

import type { ReactNode } from 'react';
import { ArrowLeft, Menu } from 'lucide-react';
import { useInAppLayout } from '@/components/AppLayout';
import { useSidebar } from '@/components/ui/sidebar';

/** Inner — useSidebar is always called, but only rendered when inside SidebarProvider. */
function MenuButtonInner() {
  const { toggleSidebar } = useSidebar();
  return (
    <button
      type="button"
      onClick={toggleSidebar}
      aria-label="פתח תפריט"
      className="flex-shrink-0 flex items-center justify-center h-8 w-8 rounded-lg
                 text-sidebar-foreground/70 hover:text-sidebar-foreground
                 hover:bg-sidebar-accent transition-colors md:hidden"
    >
      <Menu className="h-5 w-5" />
    </button>
  );
}

/** Safe wrapper — only mounts the inner component when inside AppLayout/SidebarProvider. */
function MenuButton() {
  const inLayout = useInAppLayout();
  if (!inLayout) return null;
  return <MenuButtonInner />;
}

interface PageHeaderProps {
  /** Main page title (Hebrew or English). */
  title: ReactNode;
  /** Small context line rendered below the title. */
  subtitle?: string;
  /** Called when the back button is tapped. Omit to hide the button. */
  onBack?: () => void;
  /** Label shown next to the back arrow on sm+ screens. Default "חזרה". */
  backLabel?: string;
  /** Action buttons rendered at the logical end of the row. */
  actions?: ReactNode;
  /** Slot rendered below the main row — used for the progress bar strip. */
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
      className={`bg-sidebar text-sidebar-foreground border-b border-sidebar-border sticky top-0 z-20 w-full ${className}`}
    >
      <div dir="rtl" className={`px-3 sm:px-4 flex items-center gap-2 ${subtitle ? 'h-16' : 'h-14'}`}>

        {/* ── Mobile menu trigger — first in RTL flex = physical RIGHT ── */}
        <MenuButton />

        {/* ── Back button ──────────────────────────────────────── */}
        {onBack && (
          <>
            <button
              type="button"
              onClick={onBack}
              className="flex-shrink-0 flex items-center gap-1.5 h-8 px-2.5 rounded-lg
                         text-sidebar-foreground/70 hover:text-sidebar-foreground
                         hover:bg-sidebar-accent transition-colors"
              aria-label="חזרה"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="text-sm font-semibold hidden sm:inline">{backLabel}</span>
            </button>
            <div className="h-5 w-px bg-sidebar-foreground/20 flex-shrink-0" />
          </>
        )}

        {/* ── Title block ──────────────────────────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
          <h1 className="text-base sm:text-lg font-extrabold tracking-tight truncate leading-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs text-sidebar-foreground/55 truncate leading-none font-medium">
              {subtitle}
            </p>
          )}
        </div>

        {/* ── Action area ──────────────────────────────────────── */}
        {actions && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {actions}
          </div>
        )}

        {/* ── JAS wordmark ─────────────────────────────────────── */}
        <span
          className="hidden lg:block flex-shrink-0 text-[11px] font-display tracking-[0.18em]
                     text-sidebar-foreground/20 select-none pl-1"
          aria-hidden="true"
        >
          JAS
        </span>
      </div>

      {/* ── Bottom slot (e.g. progress bar) ──────────────────── */}
      {bottomSlot}
    </header>
  );
}
