// Page transition — cross-fade + subtle translate on route changes.
// Respects prefers-reduced-motion: skips translate when set.
import { motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion';
import type { ReactNode } from 'react';

interface Props extends Omit<HTMLMotionProps<'div'>, 'children'> {
  children: ReactNode;
}

const EASE = [0.2, 0.7, 0.2, 1] as const;

export function PageTransition({ children, ...rest }: Props) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      initial={{ opacity: 0, y: reduced ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: reduced ? 0 : -4, transition: { duration: 0.15, ease: 'easeIn' } }}
      transition={{ duration: 0.24, ease: EASE }}
      style={{ willChange: 'opacity, transform' }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
