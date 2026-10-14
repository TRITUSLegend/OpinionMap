import type { CSSProperties } from 'react';

// Decorative, hand-built visuals. Everything here is aria-hidden; the text
// around each visual carries the meaning. Data shown is illustrative only.

type Tone = 'positive' | 'neutral' | 'negative';
const TONES: Tone[] = ['positive', 'neutral', 'negative'];
const vars = (v: Record<string, string | number>) => v as CSSProperties;

// A bundle of near-parallel cubic curves: one flowing "contour ribbon".
const ribbon = (count: number, [fx, fy]: number[], [ax, ay]: number[], [bx, by]: number[], [tx, ty]: number[], spread: number, twist: number) =>
  Array.from({ length: count }, (_, k) => {
    const t = k - (count - 1) / 2;
    const o = t * spread;
    return {
      d: `M${fx} ${fy + o}C${ax + t * twist} ${ay + o} ${bx - t * twist} ${by + o} ${tx} ${ty + o}`,
      opacity: +(0.9 - (Math.abs(t) / count) * 1.4).toFixed(2),
    };
  });

const RIBBONS = [
  ribbon(9, [-140, 830], [380, 760], [780, 150], [1580, 70], 7, 16),
  ribbon(7, [-100, 990], [540, 900], [1000, 380], [1580, 310], 9, -12),
  ribbon(6, [180, 1020], [620, 620], [920, 720], [1600, 520], 12, 8),
  ribbon(5, [-220, 540], [320, 400], [900, 640], [1600, 190], 10, -6),
];

export const HeroRibbons = () => (
  <div className="lp-ribbons" aria-hidden="true">
    <div className="lp-glow lp-glow-a" />
    <div className="lp-glow lp-glow-b" />
    {RIBBONS.map((paths, i) => (
      <div key={i} className={`lp-ribbon lp-ribbon-${i + 1} lp-ambient`}>
        <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
          {paths.map((p, k) => <path key={k} d={p.d} strokeOpacity={p.opacity} />)}
          {i < 2 && <path className="lp-pulse lp-ambient" d={paths[(paths.length - 1) / 2].d} pathLength={1000} />}
        </svg>
      </div>
    ))}
  </div>
);

const RUN_STEPS = ['Research', 'Clean', 'Analyse', 'Insights', 'Report', 'Review'];
const RUN_BARS: [Tone, number][] = [['positive', 54], ['neutral', 29], ['negative', 17]];

/** A sample run that loops on CSS keyframes alone: type, run the pipeline, show sentiment. */
export const SampleRun = () => (
  <figure className="lp-run" aria-hidden="true">
    <div className="lp-run-top">
      <span className="lp-label">New research</span>
      <span className="lp-run-live lp-mono"><i className="lp-ambient" />Running</span>
    </div>
    <div className="lp-run-query lp-mono">
      <span className="lp-run-text">
        Is remote work here to stay?
        <span className="lp-run-cover lp-ambient" />
      </span>
    </div>
    <div className="lp-run-pipe">
      <svg className="lp-run-line" viewBox="0 0 300 4" preserveAspectRatio="none">
        <line className="lp-ambient" x1="0" y1="2" x2="300" y2="2" />
      </svg>
      <ol>
        {RUN_STEPS.map((step, i) => (
          <li key={step} className={`lp-run-step lp-run-s${i + 1}`}>
            <i className="lp-ambient" />
            <span className="lp-mono">{step}</span>
          </li>
        ))}
      </ol>
    </div>
    <div className="lp-run-bars">
      {RUN_BARS.map(([tone, value], i) => (
        <div key={tone} className="lp-run-bar">
          <span className="lp-mono">{tone}</span>
          <span className="lp-run-track">
            <span className={`lp-run-fill lp-run-b${i + 1} lp-ambient`} data-tone={tone} style={{ width: `${value}%` }} />
          </span>
          <span className="lp-num">{value}%</span>
        </div>
      ))}
    </div>
    <figcaption className="lp-foot">Illustrative preview</figcaption>
  </figure>
);

const GLYPHS: Record<string, string> = {
  research: 'M8.5 3.5a5 5 0 1 1 0 10a5 5 0 0 1 0-10zM12.2 12.2L16.5 16.5',
  cleaning: 'M3 4.5h14l-5.5 6.5v5l-3 1.5v-6.5z',
  nlp: 'M5 16V10M10 16V4M15 16v-5',
  insights: 'M10 2.5v3.5M10 14v3.5M2.5 10h3.5M14 10h3.5M10 7.5a2.5 2.5 0 1 1 0 5a2.5 2.5 0 0 1 0-5z',
  report: 'M5.5 2.5h6.5l3 3v12h-9.5zM12 2.5v3h3M8 10h5M8 13h5',
  review: 'M10 2.5a7.5 7.5 0 1 1 0 15a7.5 7.5 0 0 1 0-15zM6.8 10.2l2.2 2.2l4.2-4.4',
};

export const StageGlyph = ({ name }: { name: string }) => (
  <svg className="lp-glyph" viewBox="0 0 20 20" aria-hidden="true">
    <path d={GLYPHS[name]} />
  </svg>
);

/**
 * The wave that joins the six stage nodes (desktop), drawn as you scroll, and
 * the dashed loop from Quality review back to Report. The loop ends in a dot
 * rather than an arrowhead, so the stretched viewBox never distorts it.
 */
export const FlowLines = () => (
  <svg className="lp-flow-svg" viewBox="0 0 600 140" preserveAspectRatio="none" aria-hidden="true">
    <path className="lp-flow-path" d="M50 28C100 28 100 108 150 108S200 28 250 28S300 108 350 108S400 28 450 28S500 108 550 108" />
    <path className="lp-flow-loop" d="M572 96C618 74 612 -22 474 -2" />
    <path className="lp-flow-dot" d="M474 -2h0" />
  </svg>
);

/** Source lines converging on the research agent. */
export const ConvergeLines = ({ count }: { count: number }) => (
  // Rows are 40px chips with 6px gaps, so each line starts at a chip's centre.
  <svg className="lp-converge-lines" viewBox={`0 0 160 ${count * 46 - 6}`} preserveAspectRatio="none" aria-hidden="true">
    {Array.from({ length: count }, (_, i) => {
      const y = 20 + i * 46;
      const mid = (count * 46 - 6) / 2;
      return <path key={i} className="lp-ambient" d={`M0 ${y}C80 ${y} 80 ${mid} 160 ${mid}`} />;
    })}
  </svg>
);

// ── Feature card visuals ─────────────────────────────────────────────

const Legend = () => (
  <div className="lp-legend">
    {TONES.map((tone) => (
      <span key={tone} data-tone={tone}>
        <i />
        {tone}
      </span>
    ))}
  </div>
);

const BY_SOURCE: [string, number[]][] = [['Reddit', [46, 31, 23]], ['Hacker News', [39, 38, 23]], ['YouTube', [58, 25, 17]]];

export const SentimentViz = () => (
  <div className="lp-viz lp-viz-sentiment" aria-hidden="true">
    {BY_SOURCE.map(([name, split], row) => (
      <div key={name} className="lp-vs-row">
        <span className="lp-mono">{name}</span>
        <span className="lp-vs-track" style={vars({ '--i': row })}>
          {TONES.map((tone, i) => <span key={tone} data-tone={tone} style={{ flexGrow: split[i] }} />)}
        </span>
      </div>
    ))}
    <Legend />
  </div>
);

const THEMES: [string, Tone][] = [
  ['battery life', 'positive'], ['price', 'negative'], ['charging speed', 'positive'], ['camera', 'neutral'],
  ['heat', 'negative'], ['software updates', 'neutral'], ['durability', 'positive'],
];

export const ThemesViz = () => (
  <div className="lp-viz lp-viz-themes" aria-hidden="true">
    {THEMES.map(([word, tone], i) => (
      <span key={word} className="lp-theme" data-tone={tone} style={vars({ '--i': i })}>
        <i />
        {word}
      </span>
    ))}
  </div>
);

export const DashboardViz = () => (
  <div className="lp-viz lp-viz-dash" aria-hidden="true">
    <svg viewBox="0 0 240 96">
      <path className="lp-dash-grid" d="M0 24H240M0 48H240M0 72H240" />
      <path className="lp-dash-area" data-tone="positive" d="M0 70C30 64 45 52 70 56S110 30 140 34S190 18 240 14V96H0Z" />
      <path className="lp-dash-line" data-tone="positive" pathLength={1} d="M0 70C30 64 45 52 70 56S110 30 140 34S190 18 240 14" />
      <path className="lp-dash-line" data-tone="negative" pathLength={1} d="M0 84C30 80 50 74 80 78S120 70 150 74S200 66 240 70" />
    </svg>
  </div>
);

export const ReportsViz = () => (
  <div className="lp-viz lp-viz-reports" aria-hidden="true">
    <div className="lp-paper lp-paper-3" />
    <div className="lp-paper lp-paper-2" />
    <div className="lp-paper lp-paper-1">
      <b />
      <i />
      <i />
      <i />
      <span className="lp-tags">
        <span className="lp-tag">PDF</span>
        <span className="lp-tag">DOCX</span>
      </span>
    </div>
  </div>
);

const ASK_SOURCES: [string, Tone, string][] = [
  ['YouTube', 'positive', '“Easily lasts me a full day, sometimes more.”'],
  ['Reddit', 'negative', '“Drains fast as soon as 5G kicks in.”'],
];

/** A made-up exchange; the card's footnote marks it as illustrative. */
export const AskViz = () => (
  <div className="lp-viz lp-viz-ask" aria-hidden="true">
    <p className="lp-ask-q">How long does the battery last?</p>
    <p className="lp-ask-a">
      Most say it lasts a full day <span className="lp-cite">1</span>, though some see fast drain on
      5G <span className="lp-cite">2</span>.
    </p>
    <ul className="lp-ask-src">
      {ASK_SOURCES.map(([name, tone, quote], i) => (
        <li key={name} data-tone={tone} style={vars({ '--i': i })}>
          <span className="lp-cite">{i + 1}</span>
          <b>{name}</b>
          <i />
          <span className="lp-ask-quote">{quote}</span>
        </li>
      ))}
    </ul>
    <p className="lp-ask-gap">
      <span>“What’s the weather in Paris?”</span>
      <span className="lp-mono">Not covered by the data</span>
    </p>
  </div>
);

const CHECKS = ['Has a title', 'Summary of 100+ characters', 'Recommendations', 'Three or more sections', 'No placeholder text'];

export const QualityViz = () => (
  <ul className="lp-viz lp-viz-checks" aria-hidden="true">
    {CHECKS.map((item, i) => (
      <li key={item} style={vars({ '--i': i })}>
        <svg viewBox="0 0 16 16"><path pathLength={1} d="M3.5 8.5l3 3l6-7" /></svg>
        {item}
      </li>
    ))}
  </ul>
);

export const ResilienceViz = () => (
  <div className="lp-viz lp-viz-resilience" aria-hidden="true">
    {['HN', 'Reddit', 'YouTube', 'Guardian', 'News', 'Bluesky', 'X'].map((name, i) => (
      <span key={name} className={i === 2 ? 'is-down' : undefined}>
        <i />
        {name}
      </span>
    ))}
    <b className="lp-mono">Run continues</b>
  </div>
);
