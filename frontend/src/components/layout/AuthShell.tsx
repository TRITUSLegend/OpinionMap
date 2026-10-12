import type { ReactNode } from 'react';
import { LogoMark } from '../ui/Logo';
import { ThemeToggle } from '../ui/ThemeToggle';

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}

/** Shared frame for the login and signup pages. */
export const AuthShell = ({ title, subtitle, children, footer }: AuthShellProps) => (
  <div className="min-h-screen bg-canvas text-fg flex flex-col">
    <div className="flex justify-end p-3">
      <ThemeToggle />
    </div>
    <main className="flex-1 flex items-start sm:items-center justify-center px-4 pb-16 pt-4 sm:pt-0">
      <div className="w-full max-w-sm animate-enter">
        <div className="flex flex-col items-center text-center mb-8">
          <LogoMark className="w-9 h-9 text-fg mb-5" />
          <h1 className="page-title">{title}</h1>
          <p className="text-muted text-sm mt-1.5">{subtitle}</p>
        </div>
        <div className="card p-6 sm:p-7">{children}</div>
        <p className="text-center text-muted mt-6 text-sm">{footer}</p>
      </div>
    </main>
  </div>
);
