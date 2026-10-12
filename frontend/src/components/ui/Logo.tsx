/** OpinionMap mark: three data points of different weight in a frame. */
export const LogoMark = ({ className = 'w-6 h-6' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <rect x="1.75" y="1.75" width="20.5" height="20.5" rx="5" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="8" cy="14.75" r="2.25" fill="currentColor" />
    <circle cx="13" cy="8.75" r="3" fill="currentColor" />
    <circle cx="17.25" cy="15.5" r="1.5" fill="currentColor" />
  </svg>
);

export const Logo = () => (
  <span className="flex items-center gap-2.5 text-fg">
    <LogoMark />
    <span className="text-[17px] font-semibold tracking-tight">OpinionMap</span>
  </span>
);
