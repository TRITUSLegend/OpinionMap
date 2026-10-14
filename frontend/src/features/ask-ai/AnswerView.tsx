import { Fragment, useId, useState } from 'react';
import { ExternalLink, Info, SearchX } from 'lucide-react';
import type { AskAnswer, AskCitation } from '../../api/client';
import { sentimentTone, sourceName } from './conversation';

const MARKER = /\[(\d+)\]/g;

/**
 * The answer as plain text with its [n] markers turned into numbers, renumbered
 * 1..m in citation order. Markers the server didn't return a citation for stay
 * as text. Nothing is ever parsed as HTML: comments are untrusted input.
 */
const splitAnswer = (text: string, order: Map<number, number>) => {
  const parts: (string | number)[] = [];
  let last = 0;
  for (const match of text.matchAll(MARKER)) {
    const n = order.get(Number(match[1]));
    if (n === undefined) continue;
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push(n);
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
};

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const SAFE_URL = /^https?:\/\//i;

const SourceCard = ({ citation, n, id, active, onFocus }: {
  citation: AskCitation;
  n: number;
  id: string;
  active: boolean;
  onFocus: () => void;
}) => {
  const tone = sentimentTone(citation.sentiment_label);
  const url = citation.url && SAFE_URL.test(citation.url) ? citation.url : null;
  return (
    <li id={id} className="aa-source" data-active={active || undefined} tabIndex={0} onFocus={onFocus}>
      <div className="aa-source-head">
        <span className="aa-source-n" aria-label={`Source ${n}`}>{n}</span>
        <span className="aa-source-name">{sourceName(citation.source)}</span>
        {tone && (
          <span className="aa-sent" data-tone={tone}>
            <i aria-hidden="true" />
            <span className="capitalize">{tone}</span>
          </span>
        )}
        {citation.simulated && <span className="aa-sim" title="Generated demo data, not a real comment">Simulated</span>}
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer" className="aa-source-link">
            Open
            <ExternalLink aria-hidden="true" />
            <span className="sr-only">source {n} (opens in a new tab)</span>
          </a>
        )}
      </div>
      <p className="aa-source-text">{citation.text}</p>
    </li>
  );
};

export const AnswerView = ({ answer }: { answer: AskAnswer }) => {
  const baseId = useId();
  const [active, setActive] = useState<number | null>(null);

  if (answer.answer_status === 'not_covered') {
    return (
      <div className="aa-uncovered">
        <SearchX aria-hidden="true" />
        <div>
          <p className="aa-uncovered-title">The collected data doesn’t cover this</p>
          <p>{answer.answer}</p>
          {!answer.answer.includes('Try rephrasing') && (
            <p className="aa-fine">Try rephrasing, or run a new workflow that includes more sources.</p>
          )}
        </div>
      </div>
    );
  }

  const order = new Map(answer.citations.map((c, i) => [c.id, i + 1]));
  const cardId = (n: number) => `${baseId}-source-${n}`;
  const simulated = answer.citations.filter((c) => c.simulated).length;
  const total = answer.citations.length;

  const reveal = (n: number) => {
    setActive(n);
    document.getElementById(cardId(n))?.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
  };

  return (
    <div className="aa-answer">
      {answer.answer_status === 'partial' && (
        <p className="aa-note"><Info aria-hidden="true" />Only partly covered by the data</p>
      )}
      <p className="aa-answer-text">
        {splitAnswer(answer.answer, order).map((part, i) =>
          typeof part === 'string' ? (
            <Fragment key={i}>{part}</Fragment>
          ) : (
            <button
              key={i}
              type="button"
              className="aa-chip"
              data-active={active === part || undefined}
              aria-label={`Source ${part}, ${sourceName(answer.citations[part - 1].source)}`}
              onClick={() => reveal(part)}
              onFocus={() => setActive(part)}
            >
              {part}
            </button>
          )
        )}
      </p>
      {simulated > 0 && (
        <p className="aa-note">
          <Info aria-hidden="true" />
          {simulated === total ? 'Every source' : `${simulated} of the ${total} sources`} behind this answer
          {simulated === total ? ' is' : ' are'} simulated demo data, not real opinion.
        </p>
      )}
      {total > 0 && (
        <ol className="aa-sources" aria-label="Sources for this answer">
          {answer.citations.map((citation, i) => (
            <SourceCard
              key={citation.id}
              citation={citation}
              n={i + 1}
              id={cardId(i + 1)}
              active={active === i + 1}
              onFocus={() => setActive(i + 1)}
            />
          ))}
        </ol>
      )}
    </div>
  );
};
