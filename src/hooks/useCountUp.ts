import { useEffect, useRef, useState } from 'react';

interface Options {
  duration?: number;
  decimals?: number;
  enabled?: boolean;
}

export function useCountUp(end: number, { duration = 900, decimals = 0, enabled = true }: Options = {}): number {
  const [value, setValue] = useState(enabled ? 0 : end);
  const frame = useRef<number | null>(null);
  const start = useRef<number | null>(null);
  const prevEnd = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) { setValue(end); return; }
    if (prevEnd.current === end) return;
    prevEnd.current = end;
    start.current = null;
    const from = 0;

    const tick = (ts: number) => {
      if (!start.current) start.current = ts;
      const elapsed = ts - start.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(parseFloat((from + (end - from) * eased).toFixed(decimals)));
      if (progress < 1) frame.current = requestAnimationFrame(tick);
    };

    frame.current = requestAnimationFrame(tick);
    return () => { if (frame.current != null) cancelAnimationFrame(frame.current); };
  }, [end, enabled, duration, decimals]);

  return value;
}
