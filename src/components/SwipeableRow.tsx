// Swipeable row — iOS-style horizontal swipe reveals action buttons.
// - Drag-in-either-direction supported (RTL-aware by default via the
//   `direction` prop).
// - Two action slots: `leading` (revealed by swipe toward start / right
//   in LTR / left in RTL) and `trailing` (the opposite direction).
// - Pass `collected` so the COLLECT action button can be hidden when
//   the item is already done.
// - Tap anywhere on the card content while the row is closed still
//   fires the row's onClick if provided.
import { AnimatePresence, motion, useMotionValue, useTransform, type PanInfo } from 'framer-motion';
import { Check, Trash2, Undo2 } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  onDelete?: () => void;
  onToggleCollected?: () => void;
  collected?: boolean;
  disabled?: boolean;
  /** Content direction — RTL means "swipe right" = trailing actions. */
  direction?: 'rtl' | 'ltr';
}

const THRESHOLD = 70;        // px to commit a reveal
const TRAVEL    = 150;       // max exposure on each side
const COMMIT    = 250;       // if dragged past this we treat as "delete now"

export function SwipeableRow({
  children,
  onDelete,
  onToggleCollected,
  collected = false,
  disabled = false,
  direction = 'rtl',
}: Props) {
  const x = useMotionValue(0);
  const [offset, setOffset] = useState(0);
  const ignoreNextTapRef = useRef(false);

  // In RTL: positive x = drag to the right = reveal actions on the LEFT side.
  // In LTR: positive x = drag to the right = reveal actions on the RIGHT side.
  // For the trailing/leading labels, we use LTR semantics internally and flip
  // at render time.
  const onDragEnd = (_: unknown, info: PanInfo) => {
    const dx = info.offset.x;
    if (Math.abs(dx) > COMMIT) {
      // Hard commit — fire the delete action (strongest destructive swipe)
      if (onDelete && Math.sign(dx) !== 0) {
        ignoreNextTapRef.current = true;
        onDelete();
        return;
      }
    }
    if (dx > THRESHOLD) {
      setOffset(TRAVEL);
    } else if (dx < -THRESHOLD) {
      setOffset(-TRAVEL);
    } else {
      setOffset(0);
    }
  };

  // Background opacity ramps up as the row is dragged
  const leftOpacity  = useTransform(x, [0, THRESHOLD, TRAVEL], [0, 0.7, 1]);
  const rightOpacity = useTransform(x, [-TRAVEL, -THRESHOLD, 0], [1, 0.7, 0]);

  // Reset offset if user taps outside the actions
  const handleCardTap = () => {
    if (offset !== 0) {
      setOffset(0);
      ignoreNextTapRef.current = true;
    }
  };

  const deleteLabel = 'מחק';
  const collectLabel = collected ? 'בטל איסוף' : 'נאסף';

  if (disabled) {
    return <div className="relative">{children}</div>;
  }

  const revealLeft  = direction === 'rtl'
    // In RTL, "leading" (swipe right, positive x) reveals the DELETE action
    // visually on the LEFT side of the card.
    ? { style: { opacity: leftOpacity  }, icon: <Trash2 className="h-5 w-5" />, label: deleteLabel, bg: 'bg-destructive', textColor: 'text-destructive-foreground', action: onDelete }
    : { style: { opacity: leftOpacity  }, icon: collected ? <Undo2 className="h-5 w-5" /> : <Check className="h-5 w-5" />, label: collectLabel, bg: collected ? 'bg-muted' : 'bg-accent-foreground', textColor: collected ? 'text-foreground' : 'text-background', action: onToggleCollected };
  const revealRight = direction === 'rtl'
    ? { style: { opacity: rightOpacity }, icon: collected ? <Undo2 className="h-5 w-5" /> : <Check className="h-5 w-5" />, label: collectLabel, bg: collected ? 'bg-muted' : 'bg-accent-foreground', textColor: collected ? 'text-foreground' : 'text-background', action: onToggleCollected }
    : { style: { opacity: rightOpacity }, icon: <Trash2 className="h-5 w-5" />, label: deleteLabel, bg: 'bg-destructive', textColor: 'text-destructive-foreground', action: onDelete };

  return (
    <div className="relative overflow-hidden rounded-lg">
      {/* Action rails behind the card */}
      <motion.button
        type="button"
        onClick={() => { setOffset(0); revealLeft.action?.(); }}
        style={revealLeft.style}
        className={`absolute inset-y-0 right-0 ${revealLeft.bg} ${revealLeft.textColor} flex items-center justify-center gap-2 px-5 font-semibold z-0`}
      >
        {revealLeft.icon}
        <span className="text-sm">{revealLeft.label}</span>
      </motion.button>
      <motion.button
        type="button"
        onClick={() => { setOffset(0); revealRight.action?.(); }}
        style={revealRight.style}
        className={`absolute inset-y-0 left-0 ${revealRight.bg} ${revealRight.textColor} flex items-center justify-center gap-2 px-5 font-semibold z-0`}
      >
        {revealRight.icon}
        <span className="text-sm">{revealRight.label}</span>
      </motion.button>

      {/* The card itself — drag-able */}
      <motion.div
        drag="x"
        dragConstraints={{ left: -TRAVEL, right: TRAVEL }}
        dragElastic={0.15}
        style={{ x, touchAction: 'pan-y' }}
        animate={{ x: offset }}
        transition={{ type: 'spring', stiffness: 500, damping: 40 }}
        onDragEnd={onDragEnd}
        onClickCapture={e => {
          if (ignoreNextTapRef.current) {
            e.preventDefault();
            e.stopPropagation();
            ignoreNextTapRef.current = false;
          } else if (offset !== 0) {
            handleCardTap();
          }
        }}
        className="relative z-10 bg-card"
      >
        {children}
      </motion.div>
    </div>
  );
}
