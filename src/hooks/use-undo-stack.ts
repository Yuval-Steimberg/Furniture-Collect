import { useCallback, useEffect, useRef, useState } from 'react';

// A single "batch" of recently auto-inserted items. While this batch is
// active, new inserts append to it and push the timer forward — so a
// worker who fires four voice recordings in a row gets one undo window
// that reverts all of them, not four overlapping flyouts.
export interface UndoBatch {
  ids: string[];
  createdAt: number;
  expiresAt: number;
}

interface UseUndoStackOptions {
  /** Window before auto-dismiss, in ms. Default 5000. */
  windowMs?: number;
  /** Called when the batch ages out without being undone. */
  onExpire?: (batch: UndoBatch) => void;
}

export function useUndoStack(opts: UseUndoStackOptions = {}) {
  const { windowMs = 5000, onExpire } = opts;
  const [batch, setBatch] = useState<UndoBatch | null>(null);
  const timerRef = useRef<number | null>(null);
  // Keep a stable ref to onExpire so the effect below doesn't re-fire
  // every time the caller re-renders with a new function identity.
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    if (!batch) return;
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    const remaining = Math.max(0, batch.expiresAt - Date.now());
    timerRef.current = window.setTimeout(() => {
      onExpireRef.current?.(batch);
      setBatch(null);
    }, remaining);
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, [batch]);

  /** Start a new batch or extend the current one. */
  const push = useCallback((newIds: string[]) => {
    if (newIds.length === 0) return;
    setBatch(prev => {
      const now = Date.now();
      if (prev && prev.expiresAt > now) {
        return {
          ids: [...prev.ids, ...newIds],
          createdAt: prev.createdAt,
          expiresAt: now + windowMs,
        };
      }
      return { ids: newIds, createdAt: now, expiresAt: now + windowMs };
    });
  }, [windowMs]);

  /** Dismiss the window without undoing. Returns the batch that was shown. */
  const dismiss = useCallback((): UndoBatch | null => {
    let snapshot: UndoBatch | null = null;
    setBatch(prev => { snapshot = prev; return null; });
    return snapshot;
  }, []);

  return { batch, push, dismiss };
}
