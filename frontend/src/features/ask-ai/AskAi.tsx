import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, Eraser, Info } from 'lucide-react';
import { askWorkflow, fetchAskStatus, type AskAnswer, type AskStatus, type AskTurn } from '../../api/client';
import { FormMessage } from '../../components/ui/FormMessage';
import { AnswerView } from './AnswerView';
import { Composer } from './Composer';
import {
  describeAskError, loadConversation, nextId, saveConversation, suggestionsFor, toHistory, type Message,
} from './conversation';
import './ask-ai.css';

const READY = ['completed', 'auto_approved'];
const SLOW_AFTER_MS = 5_000;
const PREPARE_POLL_MS = 4_000;
const RUN_POLL_MS = 15_000;
// The free embedding tier prepares about 100 passages a minute; give up well after that.
const PREPARE_LIMIT_MS = 6 * 60_000;

type Load =
  | { state: 'loading' }
  | { state: 'error'; notFound: boolean }
  | { state: 'ready'; status: AskStatus };

class PrepareTimeout extends Error {}

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const percent = (share: number) => `${Math.round(share * 100)}%`;

const Thinking = ({ slow, progress }: { slow: boolean; progress: { done: number; total: number } | null }) => (
  <div className="aa-msg aa-thinking">
    <span className="aa-dots" aria-hidden="true"><i /><i /><i /></span>
    <span className="sr-only">Ask AI is working on an answer.</span>
    {progress ? (
      <p className="aa-fine" aria-live="off">
        Preparing this workflow’s data: {progress.done} of {progress.total} passages ready. The first question on a
        workflow can take a minute or two.
      </p>
    ) : slow ? (
      <p className="aa-fine" aria-live="off">Still working: finding the closest comments and writing an answer.</p>
    ) : null}
  </div>
);

export default function AskAi() {
  const { workflowId = '' } = useParams();
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [messages, setMessages] = useState<Message[]>(() => loadConversation(workflowId));
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [slow, setSlow] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchAskStatus(workflowId)
      .then((status) => { if (!cancelled) setLoad({ state: 'ready', status }); })
      .catch((err) => {
        if (!cancelled) setLoad({ state: 'error', notFound: axios.isAxiosError(err) && err.response?.status === 404 });
      });
    return () => { cancelled = true; };
  }, [workflowId, attempt]);

  const status = load.state === 'ready' ? load.status : null;
  const running = !!status && !READY.includes(status.workflow_status) && status.workflow_status !== 'failed';
  const building = !!status && status.indexing && !status.indexed;

  // Quietly follow a run to completion, or a background build to the end,
  // unless a question is already doing its own polling.
  useEffect(() => {
    if ((!running && !building) || pending) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      fetchAskStatus(workflowId)
        .then((next) => { if (mounted.current) setLoad({ state: 'ready', status: next }); })
        .catch(() => undefined);
    }, running ? RUN_POLL_MS : PREPARE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [running, building, pending, workflowId]);

  useEffect(() => {
    saveConversation(workflowId, messages);
  }, [workflowId, messages]);

  // Keep the newest message in view.
  useEffect(() => {
    const log = logRef.current;
    if (!log) return;
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    log.scrollTo({ top: log.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, [messages.length, pending, progress]);

  /** After a 202: follow the build in /ask/status, then ask again once it's ready. */
  const waitForData = useCallback(async (question: string, history: AskTurn[]): Promise<AskAnswer> => {
    const started = Date.now();
    while (Date.now() - started < PREPARE_LIMIT_MS) {
      await sleep(PREPARE_POLL_MS);
      if (!mounted.current) throw new PrepareTimeout();
      const next = await fetchAskStatus(workflowId);
      setLoad({ state: 'ready', status: next });
      setProgress({ done: next.chunk_count, total: next.chunk_total });
      // Ready, or the build stopped short (asking again restarts it or reports why).
      if (next.indexed || !next.indexing) {
        const answer = await askWorkflow(workflowId, question, history);
        if (answer) return answer;
      }
    }
    throw new PrepareTimeout();
  }, [workflowId]);

  const send = async (raw: string) => {
    const question = raw.trim();
    if (!question || busy.current) return;
    busy.current = true;
    setError(null);
    const history = toHistory(messages);
    const asked: Message = { id: nextId(), role: 'user', text: question };
    setMessages((current) => [...current, asked]);
    setDraft('');
    setPending(true);
    inputRef.current?.focus();
    const slowTimer = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS);

    try {
      const first = await askWorkflow(workflowId, question, history);
      if (first === null) setProgress({ done: status?.chunk_count ?? 0, total: status?.chunk_total ?? 0 });
      const answer = first ?? await waitForData(question, history);
      if (mounted.current) setMessages((current) => [...current, { id: nextId(), role: 'assistant', answer }]);
    } catch (err) {
      if (!mounted.current) return;
      // Give the question back so it can be sent again.
      setMessages((current) => current.filter((m) => m.id !== asked.id));
      setDraft(question);
      setError(err instanceof PrepareTimeout
        ? 'Preparing this workflow’s data is taking longer than expected. Please try again in a few minutes.'
        : describeAskError(err));
    } finally {
      window.clearTimeout(slowTimer);
      busy.current = false;
      if (mounted.current) {
        setPending(false);
        setSlow(false);
        setProgress(null);
      }
    }
  };

  const clear = () => {
    setMessages([]);
    setError(null);
    inputRef.current?.focus();
  };

  if (load.state === 'loading') {
    return (
      <div className="aa-page" role="status" aria-label="Loading Ask AI">
        <div className="skeleton aa-skel-title" />
        <div className="skeleton aa-skel-log" />
      </div>
    );
  }

  if (load.state === 'error') {
    return (
      <div className="aa-page">
        <Link to="/workflows" className="aa-back"><ArrowLeft aria-hidden="true" />Workflows</Link>
        <FormMessage tone="error">
          {load.notFound ? (
            'We couldn’t find this workflow. It may have been deleted.'
          ) : (
            <>
              Couldn’t load Ask AI for this workflow.{' '}
              <button type="button" className="link" onClick={() => { setLoad({ state: 'loading' }); setAttempt((a) => a + 1); }}>
                Try again
              </button>
            </>
          )}
        </FormMessage>
      </div>
    );
  }

  const { status: info } = load;
  const ready = READY.includes(info.workflow_status);
  const canAsk = ready && info.item_count > 0;
  const n = info.item_count;

  return (
    <div className="aa-page">
      <header className="aa-head">
        <div className="aa-head-row">
          <Link to="/workflows" className="aa-back"><ArrowLeft aria-hidden="true" />Workflows</Link>
          {messages.length > 0 && (
            <button type="button" className="btn btn-ghost aa-clear" onClick={clear} disabled={pending}>
              <Eraser aria-hidden="true" />
              Clear conversation
            </button>
          )}
        </div>
        <h1 className="page-title">Ask AI</h1>
        <p className="aa-context">Asking about: <em>{info.query}</em></p>
        {canAsk && (
          <p className="aa-fine">
            Answers are built only from the {n} {n === 1 ? 'item' : 'comments and articles'} collected for this workflow.
          </p>
        )}
        {canAsk && info.simulated_share > 0 && (
          <p className="aa-note">
            <Info aria-hidden="true" />
            {info.simulated_share >= 0.5
              ? `Most of this workflow’s data (${percent(info.simulated_share)}) is simulated demo data, not real opinion. Sources that use it are marked.`
              : `${percent(info.simulated_share)} of this workflow’s data is simulated demo data. Sources that use it are marked.`}
          </p>
        )}
      </header>

      <div ref={logRef} className="aa-log" role="log" aria-live="polite" aria-label="Conversation">
        <div className="aa-col">
          {messages.length === 0 && !pending && (
            <div className="aa-empty">
              {!ready ? (
                <>
                  <h2>{running ? 'This workflow is still running' : 'This workflow didn’t finish'}</h2>
                  <p className="aa-muted">
                    {running
                      ? 'Ask AI opens once it completes. This page checks again every 15 seconds.'
                      : 'The run failed, so there is no collected data to ask about.'}
                  </p>
                  {!running && <p><Link to="/workflows" className="link">Back to workflows</Link></p>}
                </>
              ) : !canAsk ? (
                <>
                  <h2>Nothing to ask about</h2>
                  <p className="aa-muted">This workflow didn’t collect any comments or articles.</p>
                </>
              ) : (
                <>
                  <h2>Question the data, not just the summary</h2>
                  <p className="aa-muted">
                    Every answer cites the comments it is built from, and says so when they don’t cover a question.
                  </p>
                  {!info.indexed && (
                    <FormMessage tone="info">
                      {info.indexing
                        ? `Preparing this workflow’s data: ${info.chunk_count} of ${info.chunk_total} passages ready. You can ask now; the answer arrives once it’s done.`
                        : 'This workflow’s data isn’t prepared for questions yet. Your first question prepares it, which can take a minute.'}
                    </FormMessage>
                  )}
                  <div className="aa-suggestions" role="group" aria-label="Suggested questions">
                    {suggestionsFor(info.query).map((s) => (
                      <button key={s} type="button" className="aa-suggestion" onClick={() => send(s)}>
                        {s}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {messages.map((m) =>
            m.role === 'user' ? (
              <div key={m.id} className="aa-msg aa-msg-user">
                <span className="sr-only">You asked: </span>
                {m.text}
              </div>
            ) : (
              <div key={m.id} className="aa-msg">
                <span className="sr-only">Ask AI answered: </span>
                <AnswerView answer={m.answer} />
              </div>
            )
          )}

          {pending && <Thinking slow={slow} progress={progress} />}
        </div>
      </div>

      {error && <FormMessage tone="error" className="aa-error">{error}</FormMessage>}

      <Composer
        value={draft}
        onChange={setDraft}
        onSubmit={() => send(draft)}
        busy={pending}
        disabled={!canAsk}
        inputRef={inputRef}
      />
    </div>
  );
}
