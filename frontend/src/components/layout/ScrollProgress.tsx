import { useEffect, useRef } from 'react';
import { getScrollState, subscribeToScroll, useScrollSelector } from '../../hooks/useWindowScroll';

/** Thin reading-progress bar along the top edge; hidden when the page doesn't scroll. */
export const ScrollProgress = () => {
  const barRef = useRef<HTMLDivElement>(null);
  const scrollable = useScrollSelector((s) => s.max > 1);

  // Writes the transform directly instead of through React state, so scrolling
  // never re-renders anything.
  useEffect(() => {
    const update = () => {
      const { y, max } = getScrollState();
      if (barRef.current) barRef.current.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
    };
    update();
    return subscribeToScroll(update);
  }, []);

  return (
    <div
      aria-hidden="true"
      className={`fixed inset-x-0 top-0 h-0.5 z-[55] pointer-events-none transition-opacity duration-[180ms] ${scrollable ? 'opacity-100' : 'opacity-0'}`}
    >
      <div ref={barRef} className="h-full bg-accent origin-left will-change-transform" style={{ transform: 'scaleX(0)' }} />
    </div>
  );
};
