// Full-screen swipable photo viewer. Opens when you tap a thumbnail;
// supports keyboard navigation (arrows + Esc) and swipe on mobile.
import { useEffect, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

interface LightboxItem {
  src: string;
  alt?: string;
  caption?: string;
}

interface Props {
  items: LightboxItem[];
  initialIndex: number;
  onClose: () => void;
}

export function Lightbox({ items, initialIndex, onClose }: Props) {
  const [index, setIndex] = useState(initialIndex);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    setIndex(initialIndex);
  }, [initialIndex]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') setIndex(i => (i + 1) % items.length);       // RTL: left = next
      if (e.key === 'ArrowRight') setIndex(i => (i - 1 + items.length) % items.length);
    };
    window.addEventListener('keydown', handler);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = originalOverflow;
    };
  }, [items.length, onClose]);

  if (items.length === 0) return null;
  const curr = items[index];

  const onTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 50) {
      // RTL: swipe-right moves to the previous visual slide, which is +1 in
      // array order. swipe-left moves to the next, which is -1.
      setIndex(i => dx > 0 ? (i + 1) % items.length : (i - 1 + items.length) % items.length);
    }
    touchStartX.current = null;
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      dir="rtl"
      className="fixed inset-0 z-50 bg-foreground/95 flex flex-col"
      onClick={e => e.target === e.currentTarget && onClose()}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between p-3 sm:p-4 text-background">
        <div className="text-sm font-medium tabular-nums">
          {index + 1} / {items.length}
        </div>
        <button
          onClick={onClose}
          className="h-9 w-9 rounded-full flex items-center justify-center hover:bg-background/10 focus:outline-none focus:ring-2 focus:ring-background/40"
          aria-label="סגור"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Image */}
      <div className="flex-1 flex items-center justify-center relative overflow-hidden">
        <img
          key={curr.src}
          src={curr.src}
          alt={curr.alt ?? ''}
          className="max-h-full max-w-full object-contain select-none"
          draggable={false}
        />
        {items.length > 1 && (
          <>
            <button
              onClick={() => setIndex(i => (i + 1) % items.length)}
              className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-background/10 hover:bg-background/20 text-background items-center justify-center focus:outline-none focus:ring-2 focus:ring-background/40"
              aria-label="הבא"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <button
              onClick={() => setIndex(i => (i - 1 + items.length) % items.length)}
              className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 h-11 w-11 rounded-full bg-background/10 hover:bg-background/20 text-background items-center justify-center focus:outline-none focus:ring-2 focus:ring-background/40"
              aria-label="הקודם"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          </>
        )}
      </div>

      {/* Caption */}
      {curr.caption && (
        <div className="p-3 sm:p-4 text-background text-sm text-center bg-foreground/60">
          {curr.caption}
        </div>
      )}
    </div>
  );
}
