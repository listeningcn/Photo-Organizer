import { useEffect } from 'react';

const ACTIVITY_EVENTS = [
  'mousemove',
  'keydown',
  'mousedown',
  'wheel',
  'touchstart',
] as const;

/** Calls onIdle after `timeoutMs` without user input. Paused while `paused` is true. */
export function useIdleTimeout(timeoutMs: number, onIdle: () => void, paused = false) {
  useEffect(() => {
    if (paused) return;
    let timer = window.setTimeout(onIdle, timeoutMs);
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(onIdle, timeoutMs);
    };
    ACTIVITY_EVENTS.forEach((name) =>
      window.addEventListener(name, reset, { passive: true })
    );
    return () => {
      window.clearTimeout(timer);
      ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, reset));
    };
  }, [timeoutMs, onIdle, paused]);
}
