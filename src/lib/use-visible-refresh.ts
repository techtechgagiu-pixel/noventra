'use client';
import { useEffect, useRef } from 'react';

/** Keep an open view current, without polling hidden/offline tabs or overlapping requests. */
export function useVisibleRefresh(refresh: () => void | Promise<void>, intervalMs = 60_000) {
  const action = useRef(refresh);
  useEffect(() => { action.current = refresh; }, [refresh]);
  useEffect(() => {
    let active = true, running = false, last = Date.now();
    const update = async () => {
      if (!active || running || document.visibilityState !== 'visible' || !navigator.onLine || Date.now() - last < 10_000) return;
      running = true; last = Date.now();
      try { await action.current(); } catch { /* Keep the last snapshot; retry at the next interval. */ }
      finally { running = false; }
    };
    const timer = setInterval(() => void update(), intervalMs);
    const resume = () => { void update(); };
    window.addEventListener('focus', resume);
    window.addEventListener('online', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      active = false; clearInterval(timer);
      window.removeEventListener('focus', resume);
      window.removeEventListener('online', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [intervalMs]);
}
