import type { Ref } from 'react';
import { Link } from 'react-router-dom';
import { ChartScatter, CircleAlert, Plus } from 'lucide-react';

/** Topics offered on a first run. Written as search terms rather than questions,
 *  because the query is exactly what every source gets searched for. */
const EXAMPLE_TOPICS = ['Pixel battery life', 'Four-day work week', 'EV charging reliability'];

export interface RunSummary {
  id: string;
  query: string;
  status: string;
}

/** Shown until the user has started any research run. */
export const FirstRunPanel = ({ onStart }: { onStart: (query?: string) => void }) => (
  <section className="card p-6 md:p-10" aria-labelledby="first-run-title">
    <div className="max-w-xl">
      <span className="grid place-items-center w-10 h-10 rounded-lg border border-border bg-surface-2 text-muted" aria-hidden="true">
        <ChartScatter className="w-5 h-5" />
      </span>
      <h2 id="first-run-title" className="font-serif text-2xl leading-8 text-fg mt-5">Start your first research</h2>
      <p className="text-muted text-sm leading-6 mt-2">
        Type a product or topic. OpinionMap's agents gather public opinion from up to seven sources,
        analyse sentiment and themes, and write a report. When the run finishes, its results show up here.
      </p>
      <button type="button" className="btn btn-primary mt-6" onClick={() => onStart()}>
        <Plus className="w-4 h-4" aria-hidden="true" />
        New Research
      </button>

      <h3 id="first-run-examples" className="text-sm font-medium text-fg mt-8">Or start from an example</h3>
      <ul aria-labelledby="first-run-examples" className="flex flex-wrap gap-2 mt-3">
        {EXAMPLE_TOPICS.map((topic) => (
          <li key={topic}>
            <button type="button" className="btn btn-secondary" onClick={() => onStart(topic)}>
              {topic}
            </button>
          </li>
        ))}
      </ul>
      <p className="text-xs text-subtle mt-3">
        An example fills in the topic. You still choose the sources before launching.
      </p>
    </div>
  </section>
);

/**
 * Shown when runs exist but none has finished: either some are still going,
 * or every one of them failed.
 */
export const RunStatusPanel = ({ runs, inProgress, onStart, headingRef }: {
  runs: RunSummary[];
  inProgress: RunSummary[];
  onStart: () => void;
  headingRef: Ref<HTMLHeadingElement>;
}) => {
  const running = inProgress.length > 0;

  return (
    <section className="card p-6 md:p-10" aria-labelledby="run-status-title">
      <div className="max-w-xl">
        <span className="grid place-items-center w-10 h-10 rounded-lg border border-border bg-surface-2 text-muted" aria-hidden="true">
          {running
            ? <span className="w-2 h-2 rounded-full bg-fg animate-pulse" />
            : <CircleAlert className="w-5 h-5" />}
        </span>
        <h2
          id="run-status-title"
          ref={headingRef}
          tabIndex={-1}
          className="font-serif text-2xl leading-8 text-fg mt-5 focus:outline-none"
        >
          {running ? 'Your research is running' : 'No research run has finished yet'}
        </h2>
        <p className="text-muted text-sm leading-6 mt-2">
          {running ? (
            <>
              {inProgress.length === 1
                ? <>Agents are working on <span className="text-fg font-medium">“{inProgress[0].query}”</span>. Its results show up here when it finishes.</>
                : <>{inProgress.length} research runs are in progress. Results show up here when the first one finishes.</>}
              {' '}This page checks every 15 seconds.
            </>
          ) : (
            <>
              {runs.length === 1 ? 'Your research run did not complete.' : 'None of your research runs completed.'}
              {' '}Start a new one to see results here.
            </>
          )}
        </p>
        <div className="flex flex-wrap gap-2 mt-6">
          {!running && (
            <button type="button" className="btn btn-primary" onClick={onStart}>
              <Plus className="w-4 h-4" aria-hidden="true" />
              New Research
            </button>
          )}
          <Link to="/workflows" className="btn btn-secondary">View workflows</Link>
        </div>
      </div>
    </section>
  );
};
