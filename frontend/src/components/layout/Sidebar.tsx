import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Workflow, FileText, Settings, LogOut, X, Users } from 'lucide-react';
import { useAuth } from '../../context/auth-context';
import { Logo } from '../ui/Logo';

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

export const Sidebar = ({ isOpen, setIsOpen }: SidebarProps) => {
  const { user, logout } = useAuth();
  const links = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/workflows', icon: Workflow, label: 'Workflows' },
    { to: '/reports', icon: FileText, label: 'Reports' },
    { to: '/users', icon: Users, label: 'Users', adminOnly: true },
    { to: '/settings', icon: Settings, label: 'Settings' },
  ].filter((link) => !link.adminOnly || user?.role === 'admin');

  return (
    <>
      {/* Mobile backdrop overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-scrim z-40 md:hidden animate-fade-in"
          onClick={() => setIsOpen(false)}
        ></div>
      )}

      {/* Sidebar drawer */}
      <aside className={`w-64 h-screen bg-surface border-r border-border flex flex-col fixed left-0 top-0 z-50 transform transition-transform duration-[240ms] ease-[var(--ease)] ${isOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
        <div className="h-16 px-5 flex items-center justify-between border-b border-border shrink-0">
          <Logo />
          <button onClick={() => setIsOpen(false)} className="icon-btn md:hidden" aria-label="Close navigation">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto" aria-label="Main">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              onClick={() => setIsOpen(false)}
              className={({ isActive }) =>
                `relative flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors duration-[120ms] ${
                  isActive
                    ? 'bg-surface-2 text-fg font-medium before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-0.5 before:rounded-full before:bg-accent'
                    : 'text-muted hover:text-fg hover:bg-surface-2'
                }`
              }
            >
              <link.icon className="w-[18px] h-[18px]" aria-hidden="true" />
              <span>{link.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-border space-y-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-surface-2 border border-border flex items-center justify-center text-fg text-xs font-semibold shrink-0">
              {user?.full_name?.substring(0, 2).toUpperCase() || 'U'}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-fg truncate">{user?.full_name || 'User'}</p>
              <p className="text-xs text-muted truncate">{user?.email || ''}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="btn btn-ghost w-full"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
            Log out
          </button>
        </div>
      </aside>
    </>
  );
};
