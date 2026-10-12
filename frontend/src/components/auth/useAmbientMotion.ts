import { useEffect, type RefObject } from 'react';

/**
 * Pause the scene's ambient loops while the tab is hidden. Toggles a data
 * attribute directly instead of through React state, so nothing re-renders.
 */
export const usePauseWhenHidden = (ref: RefObject<HTMLElement | null>) => {
  useEffect(() => {
    const update = () => ref.current?.toggleAttribute('data-paused', document.hidden);
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, [ref]);
};

/**
 * Feed the pointer position (-1..1 on each axis) to the scene as --px / --py,
 * which its layers turn into a few pixels of parallax. rAF-throttled and
 * passive; off for touch input, reduced motion, and when the scene is hidden.
 */
export const usePointerParallax = (ref: RefObject<HTMLElement | null>) => {
  useEffect(() => {
    const el = ref.current;
    const query = '(pointer: fine) and (prefers-reduced-motion: no-preference) and (min-width: 1024px)';
    if (!el || !window.matchMedia(query).matches) return;

    let frame = 0;
    let x = 0;
    let y = 0;
    const apply = () => {
      frame = 0;
      el.style.setProperty('--px', x.toFixed(3));
      el.style.setProperty('--py', y.toFixed(3));
    };
    const onMove = (event: PointerEvent) => {
      x = (event.clientX / window.innerWidth) * 2 - 1;
      y = (event.clientY / window.innerHeight) * 2 - 1;
      if (!frame) frame = requestAnimationFrame(apply);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(frame);
    };
  }, [ref]);
};
