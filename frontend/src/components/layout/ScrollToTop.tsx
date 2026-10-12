import { ArrowUp } from 'lucide-react';
import { useScrollSelector } from '../../hooks/useWindowScroll';

export const ScrollToTop = () => {
  const visible = useScrollSelector((s) => s.y > 400);

  const scrollUp = () => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  // `floating-hidden` uses visibility:hidden, which also removes the button from
  // the tab order and the accessibility tree while it is out of view.
  return (
    <button
      type="button"
      onClick={scrollUp}
      aria-label="Scroll to top"
      title="Scroll to top"
      className={`btn btn-secondary fixed bottom-4 right-4 md:bottom-6 md:right-6 z-40 w-10 h-10 p-0 rounded-full shadow-[0_8px_24px_-12px_rgb(0_0_0/0.35)] ${visible ? 'floating-shown' : 'floating-hidden'}`}
    >
      <ArrowUp className="w-4 h-4" aria-hidden="true" />
    </button>
  );
};
