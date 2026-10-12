import { useState } from 'react';

const STORAGE_KEY = 'storage-notice-dismissed';

const readDismissed = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
};

/**
 * The app only uses essential storage (the session token, the theme choice and
 * this notice's own dismissal), so this is a plain notice, not a consent prompt.
 * Dismissal is read synchronously on mount, so a dismissed notice never flashes.
 */
export const StorageNotice = ({ className = '' }: { className?: string }) => {
  const [dismissed, setDismissed] = useState(readDismissed);
  if (dismissed) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // Storage unavailable: hide it for this page view only.
    }
    setDismissed(true);
  };

  return (
    <div
      role="region"
      aria-label="Storage notice"
      // Bottom-left and clear of the scroll-to-top button on the right.
      className={`fixed bottom-4 left-4 right-[4.5rem] sm:right-auto sm:max-w-sm z-40 card shadow-[0_12px_32px_-16px_rgb(0_0_0/0.35)] p-3.5 flex flex-col gap-3 sm:flex-row sm:items-center animate-slide-in-up ${className}`}
    >
      <p className="text-sm text-muted">
        We use essential browser storage to keep you signed in and remember your theme.
      </p>
      <button type="button" onClick={dismiss} className="btn btn-secondary shrink-0 self-start sm:self-auto">
        Got it
      </button>
    </div>
  );
};
