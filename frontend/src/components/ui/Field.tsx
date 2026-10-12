import type { ReactNode } from 'react';
import { CircleAlert } from 'lucide-react';

export interface FieldControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
}

interface FieldProps {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  /** Renders the control, spreading in the id and ARIA wiring. */
  children: (control: FieldControlProps) => ReactNode;
}

/** Label + control + hint + inline error, linked with aria-describedby / aria-invalid. */
export const Field = ({ id, label, error, hint, children }: FieldProps) => {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-fg mb-1.5">{label}</label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {error && (
        <p id={errorId} className="mt-1.5 flex items-start gap-1.5 text-xs text-danger">
          <CircleAlert className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
      {hint && <p id={hintId} className="mt-1.5 text-xs text-subtle">{hint}</p>}
    </div>
  );
};
