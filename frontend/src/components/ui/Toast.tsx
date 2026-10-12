import React, { useCallback, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { ToastContext, type ToastTone } from './toast-context';
import { ToneIcon } from './FormMessage';

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

const TOAST_DURATION_MS = 4000;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message: string, tone: ToastTone = 'success') => {
    const id = ++nextId.current;
    setToasts((current) => [...current.slice(-2), { id, message, tone }]);
    window.setTimeout(() => dismiss(id), TOAST_DURATION_MS);
  }, [dismiss]);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Always mounted so screen readers announce toasts as they are added. */}
      <div
        aria-live="polite"
        className="fixed top-[4.5rem] right-4 left-4 sm:left-auto z-[80] flex flex-col items-end gap-2 pointer-events-none"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto w-full sm:w-auto sm:max-w-sm flex items-start gap-2.5 card shadow-[0_12px_32px_-16px_rgb(0_0_0/0.35)] pl-3.5 pr-1.5 py-2 animate-slide-in-right"
          >
            <ToneIcon tone={t.tone} className="mt-[3px]" />
            <p className="text-sm text-fg py-0.5 flex-1">{t.message}</p>
            <button type="button" onClick={() => dismiss(t.id)} className="icon-btn w-7 h-7" aria-label="Dismiss notification">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
