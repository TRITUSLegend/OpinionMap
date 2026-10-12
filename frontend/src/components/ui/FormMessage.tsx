import type { ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info } from 'lucide-react';

type Tone = 'error' | 'success' | 'info';

const toneStyles: Record<Tone, string> = {
  error: 'border-danger/40 bg-danger/[0.06]',
  success: 'border-success/40 bg-success/[0.06]',
  info: 'border-border bg-surface-2',
};

export const ToneIcon = ({ tone, className = '' }: { tone: Tone; className?: string }) => {
  const Icon = tone === 'error' ? CircleAlert : tone === 'success' ? CircleCheck : Info;
  const color = tone === 'error' ? 'text-danger' : tone === 'success' ? 'text-success' : 'text-muted';
  return <Icon className={`w-4 h-4 shrink-0 ${color} ${className}`} aria-hidden="true" />;
};

interface FormMessageProps {
  tone: Tone;
  children: ReactNode;
  className?: string;
}

/**
 * Form-level banner. Errors use role="alert" so they are announced as soon as
 * they appear; success and info messages are polite status updates. Text stays
 * in the regular ink colour; the icon and border carry the tone.
 */
export const FormMessage = ({ tone, children, className = '' }: FormMessageProps) => (
  <div
    role={tone === 'error' ? 'alert' : 'status'}
    className={`flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-sm text-fg animate-pop-in ${toneStyles[tone]} ${className}`}
  >
    <ToneIcon tone={tone} className="mt-[3px]" />
    <div>{children}</div>
  </div>
);
