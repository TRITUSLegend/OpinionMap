import type { ReactNode } from 'react';
import { Logo } from '../ui/Logo';
import { ThemeToggle } from '../ui/ThemeToggle';
import { StorageNotice } from '../StorageNotice';
import { AuthScene, ContourArt } from './AuthScene';
import './auth.css';

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}

/**
 * Shared frame for the login and signup pages: a framed split card with the
 * form on the left and a decorative topographic scene on the right. The pages
 * pass in only their own fields.
 */
export const AuthShell = ({ title, subtitle, children, footer }: AuthShellProps) => (
  <div className="auth-shell">
    <div className="auth-backdrop" aria-hidden="true">
      <div className="auth-backdrop-art">
        <ContourArt />
      </div>
    </div>

    <div className="auth-topbar">
      <ThemeToggle />
    </div>

    <main className="auth-stage">
      <div className="auth-card">
        <section className="auth-panel" aria-labelledby="auth-title">
          <Logo />
          <div className="auth-body">
            <h1 id="auth-title" className="auth-title">{title}</h1>
            <p className="auth-subtitle">{subtitle}</p>
            <div className="auth-children">{children}</div>
          </div>
          <p className="auth-footer">{footer}</p>
        </section>
        <AuthScene />
      </div>
    </main>

    {/* Bottom-right on desktop, clear of the form's footer link. */}
    <StorageNotice className="lg:left-auto lg:right-6 lg:bottom-6" />
  </div>
);
