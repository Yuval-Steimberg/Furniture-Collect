/**
 * PageHeader — Shared header component for all inner pages.
 *
 * Design tokens used:
 *  bg-sidebar / text-sidebar-foreground  →  forest #333D36 / cream #FFFCF5
 *  border-sidebar-border                 →  slightly lighter forest
 *  font-extrabold tracking-tight         →  Heebo 800 — heavy & distinctive
 *  font-display                          →  Bowlby One SC for the "JAS" wordmark
 */

import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';

interface PageHeaderProps {
  /** Main page title (Hebrew or English). */
  title: ReactNode;
  /** Small breadcrumb / context text rendered above the title. */
  subtitle?: string;
  /** Called when the back button is tapped. Omit to hide the button. */
  onBack?: () => void;
  /** Label shown next to the back arrow on sm+ screens. Default "חזרה". */
  backLabel?: string;
  /** Right-side action buttons / badges (rendered at the logical END of the row). */
  actions?: ReactNode;
  /** Optional slot rendered below the main row — used for the progress bar strip. */
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
      <div className="px-3 sm:px-4 h-14 flex items-center gap-2">

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
              <span className="text-xs font-medium hidden sm:inline">{backLabel}</span>
            </button>
            {/* Vertical divider */}
            <div className="h-5 w-px bg-sidebar-foreground/20 flex-shrink-0" />
          </>
        )}

        {/* ── Title block ──────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          {subtitle && (
            <p className="text-[10px] tracking-widest text-sidebar-foreground/50 truncate leading-none mb-0.5">
              {subtitle}
            </p>
          )}
          <h1 className="text-sm sm:text-base font-extrabold tracking-tight truncate leading-snug">
            {title}
          </h1>
        </div>

        {/* ── Action area ──────────────────────────────────────── */}
        {actions && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {actions}
          </div>
        )}

        {/* ── JAS wordmark — subtle brand mark at the logical end ── */}
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
