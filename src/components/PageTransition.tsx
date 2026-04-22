// Page transition wrapper — cross-fade + slight translate when routes change.
// Wrap route elements with <PageTransition>{children}</PageTransition> and
// put the tree inside <AnimatePresence mode="wait"> keyed on location.pathname.
import { motion, type HTMLMotionProps } from 'framer-motion';
import type { ReactNode } from 'react';

interface Props extends Omit<HTMLMotionProps<'div'>, 'children'> {
  children: ReactNode;
}

export function PageTransition({ children, ...rest }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
