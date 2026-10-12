import { Link } from 'react-router-dom';
import { useAuth } from '../context/auth-context';
import { Logo } from '../components/ui/Logo';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import './landing.css';

/** Public landing page at /. Lazy-loaded; makes no API calls. */
const Landing = () => {
  // Synchronous (restored from storage before first render), so the label
  // never blocks or swaps after paint.
  const { isAuthenticated } = useAuth();

  return (
    <div className="landing">
      <header className="lp-nav">
        <Logo />
        <div className="lp-nav-actions">
          <ThemeToggle />
          {isAuthenticated ? (
            <Link to="/dashboard" className="lp-btn lp-btn-primary">Open dashboard</Link>
          ) : (
            <>
              <Link to="/login" className="lp-btn lp-btn-ghost">Sign in</Link>
              <Link to="/signup" className="lp-btn lp-btn-primary">Create account</Link>
            </>
          )}
        </div>
      </header>
      <main>
        <h1 className="lp-title">What the internet <em>thinks</em>, mapped.</h1>
      </main>
    </div>
  );
};

export default Landing;
