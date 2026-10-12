import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { Logo } from '../components/ui/Logo';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { AskStrip, Features, FinalCta, Hero, HowItWorks, Sources } from './sections';
import { useLandingMotion } from './useLandingMotion';
import './landing.css';

const NAV_LINKS = [
  ['#how', 'How it works'],
  ['#sources', 'Sources'],
  ['#features', 'Features'],
];

const YEAR = new Date().getFullYear();

const Nav = ({ signedIn }: { signedIn: boolean }) => {
  const [open, setOpen] = useState(false);

  return (
    <header className="lp-nav">
      <div className="lp-wrap lp-nav-row">
        <Link to="/" className="lp-brand" aria-label="OpinionMap home">
          <Logo />
        </Link>
        <nav className="lp-nav-links" aria-label="Page sections">
          {NAV_LINKS.map(([href, label]) => (
            <a key={href} href={href} data-nav className="lp-nav-link">{label}</a>
          ))}
        </nav>
        <div className="lp-nav-actions">
          <ThemeToggle className="lp-hide-xs" />
          {signedIn ? (
            <Link to="/dashboard" className="lp-btn lp-btn-primary lp-btn-sm">Open dashboard</Link>
          ) : (
            <>
              <Link to="/login" className="lp-btn lp-btn-ghost lp-btn-sm lp-hide-sm">Sign in</Link>
              <Link to="/signup" className="lp-btn lp-btn-primary lp-btn-sm">Create account</Link>
            </>
          )}
          <button
            type="button"
            className="lp-menu-btn"
            aria-expanded={open}
            aria-controls="lp-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((v) => !v)}
          >
            <span aria-hidden="true" />
          </button>
        </div>
      </div>
      <div id="lp-menu" className="lp-menu" hidden={!open}>
        {NAV_LINKS.map(([href, label]) => (
          <a key={href} href={href} onClick={() => setOpen(false)}>{label}</a>
        ))}
        {!signedIn && <Link to="/login">Sign in</Link>}
        {/* On the narrowest screens the theme switch moves in here. */}
        <div className="lp-menu-theme lp-show-xs">
          <span>Theme</span>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
};

/** Public landing page at /. Lazy-loaded with its own CSS; makes no API calls. */
const Landing = () => {
  const rootRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  // Restored from storage before the first render, so the CTA labels never
  // wait on it or swap after paint.
  const { isAuthenticated } = useAuth();
  useLandingMotion(rootRef, progressRef);

  return (
    <div ref={rootRef} className="landing">
      <a href="#main" className="lp-skip">Skip to content</a>
      <div className="lp-progress" aria-hidden="true"><div ref={progressRef} /></div>
      <span className="lp-sentinel" data-sentinel aria-hidden="true" />
      <Nav signedIn={isAuthenticated} />
      <main id="main" tabIndex={-1}>
        <Hero signedIn={isAuthenticated} />
        <HowItWorks />
        <Sources />
        <AskStrip />
        <Features />
        <FinalCta signedIn={isAuthenticated} />
      </main>
      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-row">
          <Logo />
          <nav className="lp-footer-links" aria-label="Footer">
            {NAV_LINKS.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
            {isAuthenticated ? (
              <Link to="/dashboard">Dashboard</Link>
            ) : (
              <>
                <Link to="/login">Sign in</Link>
                <Link to="/signup">Create account</Link>
              </>
            )}
          </nav>
          <div className="lp-footer-end">
            <span className="lp-mono">© {YEAR} OpinionMap</span>
            <ThemeToggle />
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
