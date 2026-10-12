import { useEffect, type RefObject } from 'react';

let warmedUp = false;

/**
 * All of the landing page's runtime behaviour, set up once:
 * - one IntersectionObserver reveals [data-reveal] elements once, then lets go
 * - one marks [data-section]s data-inview (ambient loops only run in view) and
 *   uses the top sentinel to toggle the nav's scrolled state
 * - one tracks which anchored section is in the middle of the viewport
 * - a single rAF-throttled, passive scroll listener drives the progress bar,
 *   the only per-frame style write on the page
 * - data-paused while the tab is hidden pauses every loop
 * - one fire-and-forget request wakes a sleeping backend while people read
 */
export const useLandingMotion = (
  rootRef: RefObject<HTMLElement | null>,
  progressRef: RefObject<HTMLElement | null>,
) => {
  useEffect(() => {
    const root = rootRef.current;
    const bar = progressRef.current;
    if (!root || !bar) return;

    const reveal = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-revealed');
          reveal.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
    );
    root.querySelectorAll('[data-reveal]').forEach((el) => reveal.observe(el));

    const inview = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.target.hasAttribute('data-sentinel')) {
          root.toggleAttribute('data-scrolled', !entry.isIntersecting);
        } else {
          entry.target.toggleAttribute('data-inview', entry.isIntersecting);
        }
      }
    });
    root.querySelectorAll('[data-section], [data-sentinel]').forEach((el) => inview.observe(el));

    // The current link belongs to the last linked section whose top has passed
    // the middle of the screen; none while the hero fills it. Worked out only
    // when some section crosses a band at the middle, so jumps can't leave it stale.
    const tracked = [...root.querySelectorAll<HTMLAnchorElement>('a[data-nav]')]
      .map((link) => ({ link, section: root.querySelector(link.hash) }))
      .filter((t): t is { link: HTMLAnchorElement; section: Element } => t.section !== null);
    const markCurrent = () => {
      const middle = window.innerHeight / 2;
      const current = tracked.filter((t) => t.section.getBoundingClientRect().top <= middle).pop();
      for (const { link } of tracked) {
        if (link === current?.link) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      }
    };
    const active = new IntersectionObserver(markCurrent, { rootMargin: '-45% 0px -50% 0px' });
    root.querySelectorAll('[data-section]').forEach((el) => active.observe(el));

    let frame = 0;
    const paint = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.transform = `scaleX(${max > 0 ? Math.min(1, window.scrollY / max) : 0})`;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    paint();

    const onVisibility = () => root.toggleAttribute('data-paused', document.hidden);
    document.addEventListener('visibilitychange', onVisibility);

    // The free backend tier sleeps when idle; start waking it now so a
    // sign-in a minute later is fast. No UI depends on it.
    const api = import.meta.env.VITE_API_URL as string | undefined;
    if (api && !warmedUp) {
      warmedUp = true;
      fetch(`${api.replace(/\/$/, '')}/monitoring/health`).catch(() => undefined);
    }

    return () => {
      reveal.disconnect();
      inview.disconnect();
      active.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [rootRef, progressRef]);
};
