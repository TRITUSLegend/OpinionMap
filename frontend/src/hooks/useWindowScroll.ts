import { useSyncExternalStore } from 'react';

// The window is the app's scroll container (Layout's <main> has no bounded
// height), so one shared, rAF-throttled passive listener feeds every consumer:
// the sticky header, the progress bar and the scroll-to-top button.

export interface ScrollState {
  /** Pixels scrolled from the top. */
  y: number;
  /** Maximum scrollable distance; 0 when the page fits the viewport. */
  max: number;
}

let state: ScrollState = { y: 0, max: 0 };
const listeners = new Set<() => void>();
let frame = 0;
let resizeObserver: ResizeObserver | null = null;

const measure = () => {
  frame = 0;
  const y = window.scrollY;
  const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  if (y !== state.y || max !== state.max) {
    state = { y, max };
    listeners.forEach((listener) => listener());
  }
};

const schedule = () => {
  if (!frame) frame = requestAnimationFrame(measure);
};

export const subscribeToScroll = (listener: () => void) => {
  listeners.add(listener);
  if (listeners.size === 1) {
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    // Content loading in changes the scrollable height without a scroll event.
    resizeObserver = new ResizeObserver(schedule);
    resizeObserver.observe(document.body);
    schedule();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      resizeObserver?.disconnect();
      resizeObserver = null;
      cancelAnimationFrame(frame);
      frame = 0;
    }
  };
};

export const getScrollState = () => state;

/** Select a value from the scroll state; the component re-renders only when it changes. */
export const useScrollSelector = <T,>(select: (s: ScrollState) => T): T =>
  useSyncExternalStore(subscribeToScroll, () => select(state), () => select(state));
