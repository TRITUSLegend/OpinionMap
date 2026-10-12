import { useState, useEffect, useRef } from 'react';
import { Bell, Search, Menu, X, CheckCircle, AlertCircle, Clock, FileText, Zap } from 'lucide-react';
import { fetchRecentActivity } from '../../api/client';
import { ThemeToggle } from '../ui/ThemeToggle';
import { useScrollSelector } from '../../hooks/useWindowScroll';

interface HeaderProps {
  toggleSidebar: () => void;
}

interface ActivityItem {
  type: string;
  id: string;
  status: string;
  query: string;
  date: string;
  // Additional optional fields the transform defensively reads
  action?: string;
  title?: string;
  description?: string;
  details?: string;
  created_at?: string;
  timestamp?: string;
}

interface Notification {
  id: string;
  type: 'success' | 'info' | 'warning' | 'workflow' | 'report';
  title: string;
  message: string;
  time: string;
  read: boolean;
}

export const Header = ({ toggleSidebar }: HeaderProps) => {
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  // The header is sticky against the window; its edge only appears once content scrolls under it.
  const scrolled = useScrollSelector((s) => s.y > 0);

  // Close panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };
    if (showNotifications) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showNotifications]);

  // Fetch recent activity on open
  useEffect(() => {
    if (!showNotifications) return;
    let cancelled = false;

    fetchRecentActivity()
      .then((data: { activities?: ActivityItem[] } | ActivityItem[]) => {
        if (cancelled) return;
        // Transform API activity into notifications
        const items: Notification[] = (Array.isArray(data) ? data : data.activities || [])
          .slice(0, 12)
          .map((a: ActivityItem, i: number) => {
            const isWorkflow = a.type === 'workflow' || a.action?.includes('workflow');
            const isReport = a.type === 'report' || a.action?.includes('report');
            return {
              id: a.id || `n-${i}`,
              type: isReport ? 'report' : isWorkflow ? 'workflow' : a.status === 'completed' ? 'success' : 'info',
              title: a.title || a.action || (isReport ? 'Report Generated' : 'Workflow Update'),
              message: a.description || a.details || a.query || 'Activity recorded by OpinionMap',
              time: formatTime(a.created_at || a.timestamp),
              read: false,
            };
          });
        setNotifications(items.length > 0 ? items : getDefaultNotifications());
      })
      .catch(() => {
        if (!cancelled) setNotifications(getDefaultNotifications());
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [showNotifications]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const clearAll = () => {
    setNotifications([]);
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'success': return <CheckCircle className="w-4 h-4 text-success" />;
      case 'warning': return <AlertCircle className="w-4 h-4 text-warning" />;
      case 'workflow': return <Zap className="w-4 h-4 text-fg" />;
      case 'report': return <FileText className="w-4 h-4 text-fg" />;
      default: return <Clock className="w-4 h-4 text-subtle" />;
    }
  };

  return (
    <header
      className={`h-16 bg-canvas border-b flex items-center justify-between gap-3 px-4 md:px-8 sticky top-0 z-30 transition-[border-color,box-shadow] duration-[180ms] ${
        scrolled ? 'border-border shadow-[0_6px_16px_-12px_rgb(0_0_0/0.25)]' : 'border-transparent'
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={toggleSidebar}
          className="icon-btn md:hidden"
          aria-label="Open navigation"
        >
          <Menu className="w-5 h-5" />
        </button>
        <label className="hidden md:flex items-center gap-2.5 bg-surface border border-border hover:border-border-strong focus-within:border-border-strong transition-colors duration-[120ms] px-3 h-9 rounded-md w-80 lg:w-96">
          <Search className="w-4 h-4 text-subtle shrink-0" aria-hidden="true" />
          <span className="sr-only">Search</span>
          <input
            type="search"
            placeholder="Search workflows, reports..."
            className="bg-transparent border-none text-sm w-full text-fg focus-visible:outline-none"
          />
        </label>
      </div>

      <div className="flex items-center gap-1">
        <button className="icon-btn md:hidden" aria-label="Search">
          <Search className="w-5 h-5" />
        </button>

        <ThemeToggle />

        {/* Notification Bell */}
        <div className="relative" ref={panelRef}>
          <button
            onClick={() => {
              const next = !showNotifications;
              setShowNotifications(next);
              // Show the loading state immediately on open; the fetch effect clears it.
              if (next) setLoading(true);
            }}
            className="icon-btn relative"
            id="notification-bell"
            aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
            aria-expanded={showNotifications}
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-0.5 right-0.5 min-w-4 h-4 px-1 bg-accent rounded-full ring-2 ring-canvas text-[10px] leading-4 text-accent-fg font-semibold tabular-nums text-center" aria-hidden="true">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* Notification Dropdown Panel */}
          {showNotifications && (
            <div
              className="absolute right-0 top-11 w-[min(380px,calc(100vw-2rem))] max-h-[480px] rounded-lg border border-border shadow-[0_12px_32px_-16px_rgb(0_0_0/0.3)] overflow-hidden z-50 bg-surface animate-pop-in origin-top-right"
              role="region"
              aria-label="Notifications"
            >
              {/* Panel Header */}
              <div className="flex items-center justify-between pl-4 pr-2 py-2 border-b border-border">
                <h3 className="caption">Notifications</h3>
                <div className="flex items-center gap-1">
                  {notifications.length > 0 && (
                    <button
                      onClick={markAllRead}
                      className="btn btn-ghost min-h-8 px-2 text-xs"
                    >
                      Mark all read
                    </button>
                  )}
                  <button
                    onClick={() => setShowNotifications(false)}
                    className="icon-btn w-8 h-8"
                    aria-label="Close notifications"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Panel Body */}
              <div className="overflow-y-auto max-h-[360px]">
                {loading ? (
                  <div className="p-4 space-y-4" role="status" aria-label="Loading notifications">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="flex gap-3">
                        <div className="skeleton w-4 h-4 rounded-full shrink-0" />
                        <div className="flex-1 space-y-2">
                          <div className="skeleton h-3 w-2/3" />
                          <div className="skeleton h-3 w-full" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted">
                    <Bell className="w-8 h-8 mb-3 text-subtle" aria-hidden="true" />
                    <p className="text-sm">No notifications yet</p>
                    <p className="text-xs mt-1 text-subtle">Run a workflow to get started</p>
                  </div>
                ) : (
                  notifications.map((n) => (
                    <button
                      type="button"
                      key={n.id}
                      className={`w-full text-left flex items-start gap-3 px-4 py-3 border-b border-border last:border-b-0 transition-colors duration-[120ms] hover:bg-surface-2 focus-visible:-outline-offset-2 ${
                        !n.read ? 'bg-surface-2/60' : ''
                      }`}
                      onClick={() =>
                        setNotifications((prev) =>
                          prev.map((x) => (x.id === n.id ? { ...x, read: true } : x))
                        )
                      }
                    >
                      <div className="mt-0.5 flex-shrink-0" aria-hidden="true">{getIcon(n.type)}</div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm leading-tight ${!n.read ? 'text-fg font-medium' : 'text-muted'}`}>
                          {n.title}
                        </p>
                        <p className="text-xs text-muted mt-1 line-clamp-2">{n.message}</p>
                        <p className="text-[11px] text-subtle mt-1.5">{n.time}</p>
                      </div>
                      {!n.read && (
                        <span className="w-1.5 h-1.5 rounded-full bg-accent mt-2 flex-shrink-0" aria-hidden="true" />
                      )}
                      {!n.read && <span className="sr-only">(unread)</span>}
                    </button>
                  ))
                )}
              </div>

              {/* Panel Footer */}
              {notifications.length > 0 && (
                <div className="px-2 py-1.5 border-t border-border flex justify-center">
                  <button
                    onClick={clearAll}
                    className="btn btn-ghost min-h-8 text-xs"
                  >
                    Clear all notifications
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};


/* ── helpers ─────────────────────────────────────── */
function formatTime(iso: string | undefined): string {
  if (!iso) return 'Just now';
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  } catch {
    return 'Recently';
  }
}

function getDefaultNotifications(): Notification[] {
  return [
    {
      id: 'default-1',
      type: 'info',
      title: 'Welcome to OpinionMap',
      message: 'Start by creating a new workflow to generate your first market intelligence report.',
      time: 'Just now',
      read: false,
    },
    {
      id: 'default-2',
      type: 'workflow',
      title: 'Multi-Agent Pipeline Ready',
      message: 'Your AI agents are ready to research, analyze, and generate reports autonomously.',
      time: 'Just now',
      read: false,
    },
  ];
}
