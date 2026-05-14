// Swipeable row — iOS-style horizontal swipe reveals action buttons.
// Uses useAnimationControls so the drag gesture and post-drag snap-back
// never fight over the same motion value.
//
// Gestures:
//   - swipe past 60px → snaps open exposing the action on that side
//   - swipe past 180px → commits the destructive action immediately
//   - tap anywhere while open → closes back to zero
//   - vertical scroll still works (touch-action: pan-y)
import {
  motion,
  useAnimationControls,
  useMotionValue,
  useTransform,
  type PanInfo,
} from 'framer-motion';
import { Check, Trash2, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  onDelete?: () => void;
  onToggleCollected?: () => void;
  collected?: boolean;
  disabled?: boolean;
  /** RTL by default → swipe right = delete, swipe left = collect. */
  direction?: 'rtl' | 'ltr';
}

const OPEN = 96;          // px — how far the card stays offset when revealed
const REVEAL = 60;         // drag threshold to commit a reveal
const COMMIT = 180;        // drag threshold for an instant destructive action

export function SwipeableRow({
  children,
  onDelete,
  onToggleCollected,
  collected = false,
  disabled = false,
  direction = 'rtl',
}: Props) {
  const controls = useAnimationControls();
  const x = useMotionValue(0);
  const [revealed, setRevealed] = useState<'none' | 'left' | 'right'>('none');
  const didDragRef = useRef(false);

  // Cancel any stuck open state if the row is un-mounted or disabled mid-action
  useEffect(() => {
    if (disabled) {
      void controls.start({ x: 0 });
      setRevealed('none');
    }
  }, [disabled, controls]);

  // Background opacity ramps up as the card is pulled aside
  const leftOpacity  = useTransform(x, [0, REVEAL, OPEN], [0, 0.6, 1]);
  const rightOpacity = useTransform(x, [-OPEN, -REVEAL, 0], [1, 0.6, 0]);

  const close = () => {
    setRevealed('none');
    void controls.start({ x: 0, transition: { type: 'spring', stiffness: 600, damping: 40 } });
  };

  const onDragEnd = (_: unknown, info: PanInfo) => {
    didDragRef.current = Math.abs(info.offset.x) > 4;
    const dx = info.offset.x;
    const v  = info.velocity.x;

    // Fast/far destructive swipe → commit delete immediately
    if (onDelete) {
      const isDeleteSide = direction === 'rtl' ? dx > 0 : dx < 0;
      if (isDeleteSide && (Math.abs(dx) > COMMIT || Math.abs(v) > 800)) {
        void controls.start({ x: dx > 0 ? 400 : -400, transition: { duration: 0.18 } });
        setTimeout(() => onDelete(), 180);
        return;
      }
    }

    // Collect side — commit immediately on any swipe past REVEAL, no tap needed
    if (onToggleCollected) {
      const isCollectSide = direction === 'rtl' ? dx < 0 : dx > 0;
      if (isCollectSide && (Math.abs(dx) > REVEAL || Math.abs(v) > 400)) {
        close();
        onToggleCollected();
        return;
      }
    }

    if (dx > REVEAL) { setRevealed('left'); void controls.start({ x: OPEN, transition: { type: 'spring', stiffness: 500, damping: 40 } }); return; }
    close();
  };

  // In RTL, positive x (swipe right) exposes the left-edge area, which we
  // label as the DELETE action. Swiping left exposes the right-edge, which is
  // the COLLECT toggle.
  const deleteSide  = direction === 'rtl' ? 'left' : 'right';
  const collectSide = direction === 'rtl' ? 'right' : 'left';

  if (disabled) return <>{children}</>;

  return (
    <div className="relative overflow-hidden rounded-lg bg-muted">
      {/* Left-edge action (delete in RTL) */}
      <motion.button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          close();
          onDelete?.();
        }}
        style={{ opacity: deleteSide === 'left' ? leftOpacity : rightOpacity }}
        className={`absolute inset-y-0 left-0 flex items-center justify-center gap-2 px-5 z-0 pointer-events-auto
          bg-destructive text-destructive-foreground font-semibold`}
        aria-hidden={revealed === 'none'}
        tabIndex={revealed === 'right' ? 0 : -1}
      >
        <Trash2 className="h-5 w-5" />
        <span className="text-sm">מחק</span>
      </motion.button>

      {/* Right-edge action (collect toggle in RTL) */}
      <motion.button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          close();
          onToggleCollected?.();
        }}
        style={{ opacity: collectSide === 'right' ? rightOpacity : leftOpacity }}
        className={`absolute inset-y-0 right-0 flex items-center justify-center gap-2 px-5 z-0 pointer-events-auto
          ${collected ? 'bg-muted text-foreground' : 'bg-accent-foreground text-background'} font-semibold`}
        aria-hidden={revealed === 'none'}
        tabIndex={revealed === 'left' ? 0 : -1}
      >
        {collected ? <Undo2 className="h-5 w-5" /> : <Check className="h-5 w-5" />}
        <span className="text-sm">{collected ? 'בטל איסוף' : 'נאסף'}</span>
      </motion.button>

      {/* Draggable card */}
      <motion.div
        drag="x"
        dragConstraints={{ left: -OPEN, right: OPEN }}
        dragElastic={0.18}
        dragMomentum={false}
        onDragStart={() => { didDragRef.current = true; }}
        onDragEnd={onDragEnd}
        animate={controls}
        style={{ x, touchAction: 'pan-y' }}
        onClickCapture={(e) => {
          // If the card is open, a tap should close it (not propagate to Card onClick)
          if (revealed !== 'none') {
            e.preventDefault();
            e.stopPropagation();
            close();
            return;
          }
          // If a drag just happened, swallow the click so we don't open the edit dialog etc.
          if (didDragRef.current) {
            e.preventDefault();
            e.stopPropagation();
            didDragRef.current = false;
          }
        }}
        className="relative z-10 bg-card rounded-lg"
      >
        {children}
      </motion.div>
    </div>
  );
}
