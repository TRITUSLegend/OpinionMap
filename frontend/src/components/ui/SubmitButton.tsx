import type { ButtonHTMLAttributes } from 'react';
import { LoaderCircle } from 'lucide-react';

interface SubmitButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading: boolean;
  /** Shown beside the spinner; omit it on narrow buttons to keep their width. */
  loadingLabel?: string;
}

/**
 * Primary submit button with a loading state. The label stays in the layout
 * (invisible) while loading, so the button keeps its width.
 */
export const SubmitButton = ({ loading, loadingLabel, children, className = '', disabled, ...props }: SubmitButtonProps) => (
  <button
    type="submit"
    {...props}
    disabled={disabled || loading}
    aria-busy={loading || undefined}
    className={`btn btn-primary ${className}`}
  >
    <span className={`inline-flex items-center gap-2 ${loading ? 'invisible' : ''}`}>{children}</span>
    {loading && (
      <span className="absolute inset-0 flex items-center justify-center gap-2">
        <LoaderCircle className="w-4 h-4 animate-spin" aria-hidden="true" />
        {loadingLabel ? <span>{loadingLabel}</span> : <span className="sr-only">Working…</span>}
      </span>
    )}
  </button>
);
