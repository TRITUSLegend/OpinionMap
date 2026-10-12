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

    const links = [...root.querySelectorAll<HTMLAnchorElement>('a[data-nav]')];
    const active = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const link = links.find((l) => l.hash === `#${entry.target.id}`);
          if (entry.isIntersecting) {
            links.forEach((l) => l !== link && l.removeAttribute('aria-current'));
            link?.setAttribute('aria-current', 'true');
          } else {
            // Leaving the middle band (e.g. back up to the hero) clears it.
            link?.removeAttribute('aria-current');
          }
        }
      },
      { rootMargin: '-45% 0px -50% 0px' },
    );
    links.forEach((link) => {
      const target = root.querySelector(link.hash);
      if (target) active.observe(target);
    });

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
