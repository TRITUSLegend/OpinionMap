import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CircleAlert, X } from 'lucide-react';
import { createWorkflow } from '../../api/client';
import { Field } from '../ui/Field';
import { FormMessage } from '../ui/FormMessage';
import { SubmitButton } from '../ui/SubmitButton';
import { useToast } from '../ui/toast-context';
import { useFormFields } from '../../hooks/useFormFields';
import { describeApiError } from '../../lib/api-errors';
import { validateQuery } from '../../lib/validation';

const SOURCE_LABELS: Record<string, string> = {
  twitter: 'Twitter/X',
  youtube: 'YouTube',
  reddit: 'Reddit',
  hackernews: 'Hacker News',
  bluesky: 'Bluesky',
  news: 'News',
  guardian: 'Guardian',
};

const SOURCE_DESCRIPTIONS: Record<string, string> = {
  twitter: 'Simulated',
  youtube: 'Live / Demo',
  reddit: 'Live / Demo',
  hackernews: 'Live (free)',
  bluesky: 'Live (free)',
  news: 'Live / Demo',
  guardian: 'Live / Demo',
};

const EXIT_MS = 140;
const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

export const NewWorkflowModal = ({ onClose, onSuccess, initialQuery = '' }: { onClose: () => void, onSuccess: () => void, initialQuery?: string }) => {
  const [sources, setSources] = useState({
    twitter: true,
    youtube: true,
    reddit: true,
    hackernews: true,
    bluesky: true,
    news: true,
    guardian: true,
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [formError, setFormError] = useState<{ text: string; key: number } | null>(null);
  const [closing, setClosing] = useState(false);
  const submittingRef = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const form = useFormFields({ query: initialQuery }, { query: validateQuery });

  const activeSources = Object.entries(sources)
    .filter(([, isActive]) => isActive)
    .map(([key]) => key);
  const sourcesError = submitAttempted && activeSources.length === 0 ? 'Select at least one data source.' : undefined;

  // Whatever opened the dialog gets focus back on close. Captured during the
  // first render, because autoFocus moves focus into the dialog before effects run.
  const [opener] = useState(() => document.activeElement as HTMLElement | null);

  // Play the exit animation, then let the parent unmount the dialog.
  const closeThen = (after: () => void) => {
    setClosing(true);
    window.setTimeout(() => {
      after();
      opener?.focus();
    }, EXIT_MS);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !submitting && !closing) {
      e.stopPropagation();
      closeThen(onClose);
      return;
    }
    // Keep Tab cycling inside the dialog.
    if (e.key === 'Tab' && dialogRef.current) {
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    setSubmitAttempted(true);
    setFormError(null);

    if (form.validateAll()) {
      document.getElementById('workflow-query')?.focus();
      return;
    }
    if (activeSources.length === 0) {
      dialogRef.current?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.focus();
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);

    try {
      await createWorkflow({ query: form.values.query, sources: activeSources });
      toast('Workflow started');
      closeThen(onSuccess);
    } catch (error) {
      const { message, fieldErrors } = describeApiError(error, 'workflow');
      form.setServerErrors({ query: fieldErrors.query });
      setFormError({ text: message, key: Date.now() });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  // Portalled to <body> so no transformed ancestor can trap the fixed overlay.
  return createPortal(
    <div className={`fixed inset-0 bg-scrim flex items-center justify-center p-4 z-[70] ${closing ? 'animate-fade-out' : 'animate-fade-in'}`}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-workflow-title"
        onKeyDown={handleKeyDown}
        className={`card w-full max-w-lg max-h-[calc(100vh-2rem)] overflow-y-auto p-6 relative shadow-[0_24px_48px_-24px_rgb(0_0_0/0.4)] ${closing ? 'animate-sheet-out' : 'animate-sheet-in'}`}
      >
        <button onClick={() => closeThen(onClose)} disabled={submitting} className="icon-btn absolute top-3 right-3" aria-label="Close">
          <X className="w-5 h-5" />
        </button>

        <h2 id="new-workflow-title" className="page-title mb-6 pr-10">New research workflow</h2>

        {formError && (
          <FormMessage key={formError.key} tone="error" className="mb-5">{formError.text}</FormMessage>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-6">
          <Field id="workflow-query" label="Research query" error={form.errorFor('query')}>
            {(control) => (
              <input
                {...control}
                {...form.bind('query')}
                type="text"
                autoFocus
                autoComplete="off"
                placeholder="e.g., iPhone 17 battery life user sentiment"
                className="input"
              />
            )}
          </Field>

          <fieldset aria-describedby={sourcesError ? 'workflow-sources-error' : undefined}>
            <legend className="block text-sm font-medium text-fg mb-2">
              Data sources
            </legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5">
              {Object.keys(sources).map((source) => (
                <label key={source} className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={sources[source as keyof typeof sources]}
                    onChange={(e) => setSources({ ...sources, [source]: e.target.checked })}
                    className="w-4 h-4 accent-accent"
                  />
                  <span className="text-sm">
                    <span className="font-medium text-fg">{SOURCE_LABELS[source]}</span>
                    <span className="text-xs text-subtle ml-1.5">{SOURCE_DESCRIPTIONS[source]}</span>
                  </span>
                </label>
              ))}
            </div>
            {sourcesError && (
              <p id="workflow-sources-error" className="mt-2 flex items-start gap-1.5 text-xs text-danger">
                <CircleAlert className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden="true" />
                {sourcesError}
              </p>
            )}
          </fieldset>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => closeThen(onClose)}
              disabled={submitting}
              className="btn btn-ghost"
            >
              Cancel
            </button>
            <SubmitButton loading={submitting}>
              Launch Agents
            </SubmitButton>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};
