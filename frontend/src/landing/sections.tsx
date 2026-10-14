import type { ComponentType, CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ContourArt } from '../components/auth/AuthScene';
import {
  AskViz, ConvergeLines, DashboardViz, FlowLines, HeroRibbons, QualityViz, ReportsViz, ResilienceViz,
  SampleRun, SentimentViz, StageGlyph, ThemesViz,
} from './visuals';

const vars = (v: Record<string, string | number>) => v as CSSProperties;

/** Primary actions. Signed-in visitors get a way back into the app instead. */
export const Ctas = ({ signedIn, className = '' }: { signedIn: boolean; className?: string }) => (
  <div className={`lp-ctas ${className}`}>
    {signedIn ? (
      <Link to="/dashboard" className="lp-btn lp-btn-primary">Open dashboard</Link>
    ) : (
      <>
        <Link to="/signup" className="lp-btn lp-btn-primary">Create account</Link>
        <Link to="/login" className="lp-btn lp-btn-ghost">Sign in</Link>
      </>
    )}
  </div>
);

export const Hero = ({ signedIn }: { signedIn: boolean }) => (
  <section className="lp-hero" data-section aria-labelledby="lp-hero-title">
    <HeroRibbons />
    <div className="lp-wrap lp-hero-grid">
      <div className="lp-hero-copy">
        <p className="lp-chip lp-mono"><i />Multi-agent opinion research</p>
        <h1 id="lp-hero-title" className="lp-display">
          What the internet <em className="lp-sweep">thinks</em>, mapped.
        </h1>
        <p className="lp-lede">
          Type a topic. OpinionMap's agents gather public opinion from up to seven sources, analyse
          sentiment and themes, and write you a report.
        </p>
        <Ctas signedIn={signedIn} />
        {!signedIn && <p className="lp-fine">Free to try. No credit card.</p>}
      </div>
      <SampleRun />
    </div>
  </section>
);

const STAGES = [
  ['research', 'Research', 'Searches every source you picked at the same time.'],
  ['cleaning', 'Cleaning', 'Strips links and noise, and drops duplicates and near-empty posts.'],
  ['nlp', 'NLP analysis', 'Scores the sentiment of each post and extracts keywords, topics and trends.'],
  ['insights', 'Insights', 'Gemini turns the numbers into findings.'],
  ['report', 'Report', 'Gemini writes an executive report with recommendations.'],
  ['review', 'Quality review', 'A rule-based checklist approves the report or sends it back.'],
];

export const HowItWorks = () => (
  <section id="how" className="lp-section" data-section aria-labelledby="lp-how-title">
    <div className="lp-wrap">
      <header className="lp-head" data-reveal>
        <p className="lp-label">How it works</p>
        <h2 id="lp-how-title" className="lp-h2">Six agents, <em>one</em> pipeline.</h2>
        <p className="lp-lede">
          Each research run passes through the same six stages, from raw posts to a reviewed report.
        </p>
      </header>
      <div className="lp-flow" data-reveal>
        <FlowLines />
        {/* Uncovers the wave left to right: a transform-only "draw". */}
        <span className="lp-flow-cover" aria-hidden="true" />
        <ol className="lp-stages">
          {STAGES.map(([glyph, title, caption], i) => (
            <li key={glyph} className="lp-stage" style={vars({ '--i': i })}>
              <span className="lp-stage-node"><StageGlyph name={glyph} /></span>
              <h3>{title}</h3>
              <p>{caption}</p>
            </li>
          ))}
        </ol>
        <p className="lp-loop-note lp-mono">Reports that fail the checklist are rewritten, up to twice.</p>
      </div>
    </div>
  </section>
);

const SOURCES: [string, string?][] = [
  ['Hacker News'], ['Reddit'], ['YouTube'], ['The Guardian'], ['NewsData'], ['Bluesky'], ['X', 'simulated demo data'],
];

export const Sources = () => (
  <section id="sources" className="lp-section" data-section aria-labelledby="lp-sources-title">
    <div className="lp-wrap lp-sources">
      <header className="lp-head" data-reveal>
        <p className="lp-label">Sources</p>
        <h2 id="lp-sources-title" className="lp-h2">Seven sources, <em>one</em> run.</h2>
        <p className="lp-lede">
          The research agent queries every source you select in parallel. If one fails or times out,
          the error is logged and the rest carry on.
        </p>
        <p className="lp-foot">
          X results are simulated demo data. The other sources use their live APIs when keys are
          configured, and sample data otherwise.
        </p>
      </header>
      <div className="lp-converge" data-reveal>
        <ul className="lp-source-list">
          {SOURCES.map(([name, note]) => (
            <li key={name}>
              <span>{name}</span>
              {note && <em className="lp-mono">{note}</em>}
            </li>
          ))}
        </ul>
        <ConvergeLines count={SOURCES.length} />
        <div className="lp-converge-node" aria-hidden="true">
          <span className="lp-label">Research agent</span>
          <b>All sources, in parallel</b>
        </div>
      </div>
    </div>
  </section>
);

const QUESTIONS = [
  'Is the Pixel battery actually better?', 'Rust vs Go for backend services', 'Four-day work week: worth it?',
  'How did people react to the keynote?', "What's the mood about remote work?", 'Are EV chargers getting more reliable?',
  'Do people trust AI search results?',
];

/** Example questions drifting by. The duplicate copy only makes the loop seamless. */
export const AskStrip = () => (
  <section className="lp-ask" data-section aria-label="Example questions">
    <div className="lp-ask-track lp-ambient">
      {[0, 1].map((copy) => (
        <ul key={copy} aria-hidden={copy === 1 || undefined}>
          {QUESTIONS.map((q) => <li key={q}>{q}</li>)}
        </ul>
      ))}
    </div>
  </section>
);

interface Feature {
  key: string;
  label: string;
  title: string;
  body: string;
  Viz: ComponentType;
  sample?: boolean;
  points?: string[];
}

const FEATURES: Feature[] = [
  { key: 'sentiment', label: 'Sentiment', title: 'Sentiment by source', body: 'The positive, neutral and negative share for each source, so you can see where the mood differs.', Viz: SentimentViz, sample: true },
  { key: 'themes', label: 'Themes', title: 'Themes and keywords', body: 'Keywords and recurring topics pulled from the posts, so you know what people actually talk about.', Viz: ThemesViz, sample: true },
  { key: 'dash', label: 'Dashboard', title: 'A dashboard for every run', body: 'Pick a completed workflow to see its data points, sentiment split and trends in one place.', Viz: DashboardViz, sample: true },
  { key: 'reports', label: 'Export', title: 'Reports you can export', body: 'An executive summary, sections and recommendations, downloadable as PDF or DOCX.', Viz: ReportsViz },
  { key: 'quality', label: 'Quality gate', title: 'A checklist on every report', body: 'A rule-based reviewer checks each report before you see it. Fails go back for a rewrite, up to twice.', Viz: QualityViz },
  {
    key: 'ask',
    label: 'Ask AI',
    title: 'Question the data, not just the summary',
    body: 'Every completed workflow is embedded into its own vector collection. Ask follow-up questions and get answers built only from the comments that were collected, each one cited so you can check it.',
    points: [
      'Retrieval-augmented generation over ChromaDB',
      'Answers cite the exact source comments',
      'Says so when the data does not cover a question',
    ],
    Viz: AskViz,
    sample: true,
  },
  { key: 'resilience', label: 'Resilience', title: 'Resilient by design', body: 'A failing source never stops a run. The error is logged and the remaining sources carry on.', Viz: ResilienceViz },
];

export const Features = () => (
  <section id="features" className="lp-section" data-section aria-labelledby="lp-features-title">
    <div className="lp-wrap">
      <header className="lp-head" data-reveal>
        <p className="lp-label">Features</p>
        <h2 id="lp-features-title" className="lp-h2">From raw posts to a <em>reviewed</em> report.</h2>
      </header>
      <div className="lp-bento">
        {FEATURES.map(({ key, label, title, body, Viz, sample, points }, i) => (
          <article key={key} className={`lp-card lp-card-${key}`} data-reveal style={vars({ '--d': i % 3 })}>
            <p className="lp-label">{label}</p>
            <h3>{title}</h3>
            <p className="lp-card-body">{body}</p>
            {points && (
              <ul className="lp-card-points">
                {points.map((point) => <li key={point}>{point}</li>)}
              </ul>
            )}
            <Viz />
            {sample && <p className="lp-foot lp-card-foot">Illustrative preview</p>}
          </article>
        ))}
      </div>
    </div>
  </section>
);

export const FinalCta = ({ signedIn }: { signedIn: boolean }) => (
  <section className="lp-final" data-section aria-labelledby="lp-final-title">
    <div className="lp-final-art" aria-hidden="true"><ContourArt /></div>
    <div className="lp-wrap lp-final-inner" data-reveal>
      <h2 id="lp-final-title" className="lp-display lp-final-title">
        Ask the internet a <em>question</em>.
      </h2>
      <Ctas signedIn={signedIn} className="lp-ctas-center" />
    </div>
  </section>
);
