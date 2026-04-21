import { Undo2, X } from 'lucide-react';
import { useEffect, useState } from 'react';

interface UndoFlyoutProps {
  /** Null when no batch is active (flyout hidden). */
  count: number | null;
  /** Ms from now until the batch auto-dismisses. Drives the progress bar. */
  expiresAt: number | null;
  onUndo: () => void;
  onDismiss: () => void;
}

/**
 * Bottom-centered undo bar. Appears when a batch of items was just auto-
 * inserted (voice/text/camera) and disappears after the window closes.
 * Single orange-free element — uses forest background so it doesn't
 * compete with the one primary-orange CTA on screen.
 */
export function UndoFlyout({ count, expiresAt, onUndo, onDismiss }: UndoFlyoutProps) {
  // Drive the horizontal progress indicator via a tick every 80ms so
  // the bar visibly animates even if the parent doesn't re-render.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (expiresAt == null) return;
    const id = window.setInterval(() => setNow(Date.now()), 80);
    return () => window.clearInterval(id);
  }, [expiresAt]);

  if (count == null || count === 0 || expiresAt == null) return null;

  const remainingMs = Math.max(0, expiresAt - now);
  // Assume the batch window is ~5s for the visual — exact is not important.
  const pct = Math.max(0, Math.min(100, (remainingMs / 5000) * 100));

  return (
    <div
      role="status"
      aria-live="polite"
      dir="rtl"
      // Bottom: above the fixed action bar (which is ~72-88px tall).
      className="fixed left-1/2 -translate-x-1/2 bottom-24 sm:bottom-28 z-40 pointer-events-auto
                 w-[min(420px,calc(100vw-24px))]
                 bg-foreground text-background rounded-lg shadow-lg overflow-hidden"
    >
      <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3">
        <span className="text-sm sm:text-base font-medium flex-1 truncate">
          {count === 1 ? 'פריט נוסף' : `${count} פריטים נוספו`}
        </span>
        <button
          type="button"
          onClick={onUndo}
          className="inline-flex items-center gap-1 text-sm font-semibold px-2.5 py-1 rounded
                     hover:bg-background/10 focus:outline-none focus:ring-2 focus:ring-background/40"
          aria-label="בטל הוספה"
        >
          <Undo2 className="h-4 w-4" />
          <span>בטל</span>
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="inline-flex items-center justify-center h-7 w-7 rounded
                     hover:bg-background/10 focus:outline-none focus:ring-2 focus:ring-background/40"
          aria-label="סגור"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="h-0.5 bg-background/10">
        <div
          className="h-full bg-background/60 transition-[width] duration-75 ease-linear"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
