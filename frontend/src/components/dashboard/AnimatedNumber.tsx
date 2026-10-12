import { useLayoutEffect, useRef } from 'react';
import { gsap } from 'gsap';

interface AnimatedNumberProps {
  value: number;
  /** Must be stable (module-level), or the count restarts on every render. */
  format: (n: number) => string;
}

/**
 * Counts from the value currently on screen to `value`. On first load the
 * headline figures settle in together; when the user switches workflow they
 * move from the old reading to the new one, so the change itself is visible.
 *
 * GSAP writes the text directly, so the count never re-renders React. Screen
 * readers get only the final value, and reduced motion shows it immediately.
 * Only the lazily loaded dashboard imports this, keeping GSAP out of the
 * bundle every other page downloads.
 */
export const AnimatedNumber = ({ value, format }: AnimatedNumberProps) => {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(0);

  // Layout effect: the starting figure is in place before the first paint.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      shown.current = value;
      el.textContent = format(value);
      return;
    }

    const counter = { n: shown.current };
    el.textContent = format(counter.n);
    const tween = gsap.to(counter, {
      n: value,
      duration: 0.8,
      ease: 'power3.out',
      onUpdate: () => {
        shown.current = counter.n;
        el.textContent = format(counter.n);
      },
    });
    // kill(), not revert(): reverting rewinds the tween and fires onUpdate with
    // its start value, so the next count would begin from the wrong number.
    return () => {
      tween.kill();
    };
  }, [value, format]);

  return (
    <>
      <span ref={ref} aria-hidden="true" />
      <span className="sr-only">{format(value)}</span>
    </>
  );
};
