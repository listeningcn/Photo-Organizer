import { type RefObject, useEffect, useState } from 'react';

const HIDE_DELAY_MS = 900;
/** How far below the scroller's top an element may start and still count as "current". */
const TOP_SLACK_PX = 60;

/**
 * Tracks the `data-label` of the last element (inside `rootRef`) that has scrolled to the
 * top of the surrounding `.content` scroller, and whether the user is scrolling right now.
 * Used for the floating date indicator in the Timeline and Trips views.
 */
export function useScrollLabel(rootRef: RefObject<HTMLElement | null>, deps: unknown[]) {
  const [label, setLabel] = useState<string | null>(null);
  const [scrolling, setScrolling] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    const scroller = root?.closest<HTMLElement>('.content');
    if (!root || !scroller) return;

    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    let frame = 0;
    const update = () => {
      frame = 0;
      const top = scroller.getBoundingClientRect().top;
      let current: string | null = null;
      for (const element of root.querySelectorAll<HTMLElement>('[data-label]')) {
        if (element.getBoundingClientRect().top - top > TOP_SLACK_PX) break;
        current = element.dataset.label ?? null;
      }
      setLabel(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
      setScrolling(true);
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => setScrolling(false), HIDE_DELAY_MS);
    };

    update();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      clearTimeout(hideTimer);
      cancelAnimationFrame(frame);
    };
    // Callers pass what changes the labelled elements.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { label, scrolling };
}

/** The floating pill that shows the current date while scrolling. */
export function ScrollDate({
  label,
  scrolling,
}: {
  label: string | null;
  scrolling: boolean;
}) {
  if (!label) return null;
  return (
    <div className={`scroll-date${scrolling ? ' visible' : ''}`} aria-hidden>
      <span>{label}</span>
    </div>
  );
}
