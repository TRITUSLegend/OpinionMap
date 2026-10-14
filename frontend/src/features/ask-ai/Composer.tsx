import { useId, useLayoutEffect, type RefObject } from 'react';
import { LoaderCircle, SendHorizontal } from 'lucide-react';
import { MAX_QUESTION } from './conversation';

interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  busy: boolean;
  disabled: boolean;
  inputRef: RefObject<HTMLTextAreaElement | null>;
}

/**
 * Enter sends, Shift+Enter adds a line. While an answer is on its way the field
 * is read-only rather than disabled, so it keeps focus for the next question.
 */
export const Composer = ({ value, onChange, onSubmit, busy, disabled, inputRef }: ComposerProps) => {
  const id = useId();

  // Grow with the text up to the CSS max-height, then scroll.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value, inputRef]);

  return (
    <form
      className="aa-composer"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="aa-composer-inner">
        <label htmlFor={id} className="sr-only">Your question</label>
        <textarea
          id={id}
          ref={inputRef}
          className="aa-input"
          rows={1}
          maxLength={MAX_QUESTION}
          value={value}
          readOnly={busy}
          disabled={disabled}
          placeholder={disabled ? 'Ask AI isn’t available for this workflow' : 'Ask about the collected comments…'}
          aria-describedby={`${id}-count`}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              onSubmit();
            }
          }}
        />
        <div className="aa-composer-bar">
          <span className="aa-fine aa-hint" aria-hidden="true">Enter to send, Shift+Enter for a new line</span>
          <span id={`${id}-count`} className="aa-count" data-full={value.length >= MAX_QUESTION || undefined}>
            {value.length}/{MAX_QUESTION}
            <span className="sr-only"> characters</span>
          </span>
          <button
            type="submit"
            className="btn btn-primary aa-send"
            disabled={disabled || busy || !value.trim()}
            aria-busy={busy || undefined}
          >
            {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <SendHorizontal aria-hidden="true" />}
            <span className="aa-send-label">{busy ? 'Answering…' : 'Send'}</span>
          </button>
        </div>
      </div>
    </form>
  );
};
