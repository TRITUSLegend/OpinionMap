import { useState, useEffect, useRef } from 'react';
import { Bell, Search, Menu, X, CheckCircle, AlertCircle, Clock, FileText, Zap } from 'lucide-react';
import { fetchRecentActivity } from '../../api/client';

interface HeaderProps {
  toggleSidebar: () => void;
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
    setLoading(true);

    fetchRecentActivity()
      .then((data) => {
        if (cancelled) return;
        // Transform API activity into notifications
        const items: Notification[] = (data.activities || data || [])
          .slice(0, 12)
          .map((a: any, i: number) => {
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
      case 'success': return <CheckCircle className="w-4 h-4 text-emerald-400" />;
      case 'warning': return <AlertCircle className="w-4 h-4 text-amber-400" />;
      case 'workflow': return <Zap className="w-4 h-4 text-indigo-400" />;
      case 'report': return <FileText className="w-4 h-4 text-sky-400" />;
      default: return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  return (
    <header className="h-20 bg-black/80 border-b border-white/5 flex items-center justify-between px-4 md:px-8 sticky top-0 z-10 backdrop-blur-md">
      <div className="flex items-center gap-4">
        <button 
          onClick={toggleSidebar}
          className="md:hidden text-gray-400 hover:text-white p-2 transition-colors"
        >
          <Menu className="w-6 h-6" />
        </button>
        <div className="hidden md:flex items-center gap-4 bg-white/5 hover:bg-white/10 transition-colors px-4 py-2 rounded-xl border border-white/5 w-96">
          <Search className="w-5 h-5 text-gray-400" />
          <input 
            type="text" 
            placeholder="Search workflows, reports..." 
            className="bg-transparent border-none outline-none text-sm w-full text-white placeholder-gray-500"
          />
        </div>
      </div>

      <div className="flex items-center gap-4 md:gap-6">
        <button className="md:hidden text-gray-400 hover:text-white transition-colors">
          <Search className="w-6 h-6" />
        </button>

        {/* Notification Bell */}
        <div className="relative" ref={panelRef}>
          <button
            onClick={() => setShowNotifications((v) => !v)}
            className="relative text-gray-400 hover:text-white transition-colors"
            id="notification-bell"
          >
            <Bell className="w-6 h-6" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-accent rounded-full border-2 border-black text-[10px] text-black font-bold flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
            {unreadCount === 0 && (
              <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-accent rounded-full border-2 border-black"></span>
            )}
          </button>

          {/* Notification Dropdown Panel */}
          {showNotifications && (
            <div
              className="absolute right-0 top-12 w-[380px] max-h-[480px] rounded-2xl border border-white/10 shadow-2xl overflow-hidden z-50 bg-[#0a0a0a]"
            >
              {/* Panel Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-[#0f0f0f]">
                <h3 className="text-white font-semibold text-sm tracking-wide">Notifications</h3>
                <div className="flex items-center gap-3">
                  {notifications.length > 0 && (
                    <button
                      onClick={markAllRead}
                      className="text-xs text-accent hover:text-white transition-colors"
                    >
                      Mark all read
                    </button>
                  )}
                  <button
                    onClick={() => setShowNotifications(false)}
                    className="text-gray-500 hover:text-white transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Panel Body */}
              <div className="overflow-y-auto max-h-[360px] custom-scrollbar bg-[#0a0a0a]">
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                    <Bell className="w-10 h-10 mb-3 opacity-30" />
                    <p className="text-sm">No notifications yet</p>
                    <p className="text-xs mt-1 text-gray-600">Run a workflow to get started</p>
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`flex items-start gap-3 px-5 py-3.5 border-b border-white/5 transition-colors cursor-pointer hover:bg-white/5 ${
                        !n.read ? 'bg-accent/5' : ''
                      }`}
                      onClick={() =>
                        setNotifications((prev) =>
                          prev.map((x) => (x.id === n.id ? { ...x, read: true } : x))
                        )
                      }
                    >
                      <div className="mt-0.5 flex-shrink-0">{getIcon(n.type)}</div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm leading-tight ${!n.read ? 'text-white font-medium' : 'text-gray-300'}`}>
                          {n.title}
                        </p>
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">{n.message}</p>
                        <p className="text-[10px] text-gray-600 mt-1.5">{n.time}</p>
                      </div>
                      {!n.read && (
                        <span className="w-2 h-2 rounded-full bg-accent mt-2 flex-shrink-0" />
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Panel Footer */}
              {notifications.length > 0 && (
                <div className="px-5 py-3 border-t border-white/10 flex justify-center bg-[#0f0f0f]">
                  <button
                    onClick={clearAll}
                    className="text-xs text-gray-500 hover:text-red-400 transition-colors"
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
