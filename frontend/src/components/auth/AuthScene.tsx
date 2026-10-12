import { useRef, useState, type CSSProperties } from 'react';
import { CONTOUR_VIEWBOX, CONTOURS_FAR, CONTOURS_NEAR, PEAKS } from './contourPaths';
import { usePointerParallax } from './useAmbientMotion';


// Smooth curve through the stored points: each point is a quadratic control
// point, with the midpoints between neighbours as the on-curve anchors.
const toPath = (points: string) => {
  const n = points.split(' ').map(Number);
  let d = `M${n[0]} ${n[1]}`;
  for (let i = 2; i < n.length - 2; i += 2) {
    d += `Q${n[i]} ${n[i + 1]} ${(n[i] + n[i + 2]) / 2} ${(n[i + 1] + n[i + 3]) / 2}`;
  }
  return `${d}L${n[n.length - 2]} ${n[n.length - 1]}`;
};

const FAR = CONTOURS_FAR.map(([points, opacity]): [string, number] => [toPath(points), opacity]);
const NEAR = CONTOURS_NEAR.map(([points, opacity]): [string, number] => [toPath(points), opacity]);

type Tone = 'positive' | 'neutral' | 'negative';
const TONES: Tone[] = ['positive', 'neutral', 'negative'];
type Split = [number, number, number];

// Signal pins as [x, y, tone] in the art's coordinates: the four hill tops
// first, then five more spread over the terrain, clear of the cards.
const PEAK_TONES: Tone[] = ['positive', 'negative', 'neutral', 'positive'];
const PINS: [number, number, Tone][] = [
  ...PEAKS.map(([x, y], i): [number, number, Tone] => [x, y, PEAK_TONES[i]]),
  [95, 470, 'positive'],
  [330, 490, 'neutral'],
  [560, 430, 'negative'],
  [520, 560, 'neutral'],
  [430, 585, 'negative'],
];

// Each pin joined to its one or two nearest neighbours: a constellation, not
// a web. Links between same-sentiment pins take that sentiment's colour.
const LINKS: [number, number][] = [[0, 5], [0, 4], [1, 5], [1, 3], [2, 4], [2, 5], [3, 6], [6, 7], [7, 8], [8, 1]];
const LINK_PATHS = LINKS.map(([a, b], i) => {
  const [ax, ay, at] = PINS[a];
  const [bx, by, bt] = PINS[b];
  // Gentle quadratic bow, alternating sides.
  const bend = i % 2 ? 0.16 : -0.16;
  const cx = (ax + bx) / 2 - (by - ay) * bend;
  const cy = (ay + by) / 2 + (bx - ax) * bend;
  return { d: `M${ax} ${ay}Q${cx} ${cy} ${bx} ${by}`, tone: at === bt ? at : 'mixed' };
});
// Links that carry a slow travelling dash.
const SIGNAL_LINKS = [1, 9, 6, 0];

const SPARK_POINTS = '0,22 18,20 36,23 54,18 72,24 90,27 108,15 126,10 144,12 162,7 180,9 200,5';

const toneAt = (target: EventTarget | null): Tone | null => {
  const tone = target instanceof Element ? target.closest('[data-tone]')?.getAttribute('data-tone') : null;
  return tone === 'positive' || tone === 'neutral' || tone === 'negative' ? tone : null;
};

// Each segment and legend item carries data-tone, so styling (and the hover
// linking between cards and map) can key off the sentiment alone.
const SentimentBar = ({ split, label }: { split: Split; label?: string }) => (
  <div className="scene-bar">
    {label && <span className="scene-bar-label">{label}</span>}
    <span className="scene-bar-track">
      {TONES.map((tone, i) => (
        <span key={tone} className="scene-seg" data-tone={tone} style={{ flexGrow: split[i] }}>
          <i />
        </span>
      ))}
    </span>
  </div>
);

const Legend = ({ split }: { split: Split }) => (
  <div className="scene-legend">
    {TONES.map((tone, i) => (
      <span key={tone} className="scene-legend-item" data-tone={tone}>
        <i />
        {split[i]}% {tone}
      </span>
    ))}
  </div>
);

/**
 * Illustrative question cards: the kinds of things people research, each with
 * its own small visual. Generic numbers, never real data.
 */
const QuestionCards = () => (
  <div className="auth-scene-cards">
    <div className="scene-card scene-card-product auth-ambient">
      <p className="scene-tag">Product</p>
      <p className="scene-question">Is the Pixel 11 battery actually better?</p>
      <SentimentBar split={[58, 27, 15]} />
      <Legend split={[58, 27, 15]} />
    </div>
    <div className="scene-card scene-card-compare auth-ambient">
      <p className="scene-tag">Comparison</p>
      <p className="scene-question">Rust vs Go for backend services</p>
      <SentimentBar label="Rust" split={[64, 24, 12]} />
      <SentimentBar label="Go" split={[51, 33, 16]} />
    </div>
    <div className="scene-card scene-card-policy scene-card-extra auth-ambient">
      <p className="scene-tag">Policy</p>
      <p className="scene-question">Four-day work week: worth it?</p>
      <SentimentBar split={[52, 31, 17]} />
      <div className="scene-chips">
        <span>productivity</span>
        <span>burnout</span>
        <span>commute</span>
      </div>
    </div>
    <div className="scene-card scene-card-mood auth-ambient">
      <p className="scene-tag">Source mix</p>
      <p className="scene-question">What's the mood about remote work?</p>
      <div className="scene-chips">
        <span>Reddit <b>412</b></span>
        <span>HN <b>186</b></span>
        <span>YouTube <b>240</b></span>
        <span>News <b>97</b></span>
      </div>
      <SentimentBar split={[46, 34, 20]} />
    </div>
    <div className="scene-card scene-card-event scene-card-extra auth-ambient">
      <p className="scene-tag">Launch</p>
      <p className="scene-question">How did people react to the keynote?</p>
      <svg className="scene-spark" data-tone="positive" viewBox="0 0 200 32" preserveAspectRatio="none">
        <polyline className="scene-spark-halo" points={SPARK_POINTS} />
        <polyline points={SPARK_POINTS} />
      </svg>
      <div className="scene-spark-axis">
        <span>Before</span>
        <span>After</span>
      </div>
    </div>
  </div>
);

const Contours = ({ paths }: { paths: [string, number][] }) => (
  <>
    {paths.map(([d, opacity], i) => (
      <path key={i} d={d} strokeOpacity={opacity} />
    ))}
  </>
);

/** All contour lines in one SVG; the page background when the scene panel is hidden. */
export const ContourArt = () => (
  <svg viewBox={CONTOUR_VIEWBOX} preserveAspectRatio="xMidYMax slice" className="auth-contours">
    <Contours paths={FAR} />
    <Contours paths={NEAR} />
  </svg>
);

/**
 * Decorative right-hand panel: a topographic "opinion map" where elevation
 * stands in for sentiment intensity, with signal pins on the hill tops and
 * floating question cards. Hidden from assistive technology; nothing here is
 * real data. Ambient motion (drift, pulse, float, parallax) is CSS on composited
 * layers, driven by --px / --py from usePointerParallax.
 *
 * Hovering any sentiment segment, legend item or pin sets one shared
 * activeSentiment, exposed as data-active; the highlighting is pure CSS.
 */
export const AuthScene = () => {
  const sceneRef = useRef<HTMLDivElement>(null);
  const [activeSentiment, setActiveSentiment] = useState<Tone | null>(null);
  usePointerParallax(sceneRef);

  return (
    <div
      ref={sceneRef}
      className="auth-scene"
      aria-hidden="true"
      data-active={activeSentiment ?? undefined}
      // Mouse and pen only; touch has no hover.
      onPointerOver={(e) => e.pointerType !== 'touch' && setActiveSentiment(toneAt(e.target))}
      onPointerOut={(e) => e.pointerType !== 'touch' && setActiveSentiment(toneAt(e.relatedTarget))}
    >
      <div className="auth-scene-layer auth-scene-far auth-ambient">
        <svg viewBox={CONTOUR_VIEWBOX} preserveAspectRatio="xMidYMax slice" className="auth-contours">
          <Contours paths={FAR} />
        </svg>
      </div>

      <div className="auth-scene-layer auth-scene-near auth-ambient">
        <svg viewBox={CONTOUR_VIEWBOX} preserveAspectRatio="xMidYMax slice" className="auth-contours">
          <Contours paths={NEAR} />
        </svg>
      </div>

      {/* Links (SVG) under the pins (HTML, so their pulse stays on the
          compositor). CSS maps the pins onto the same cover fit as the SVG. */}
      <div className="auth-scene-layer auth-scene-pins">
        <svg className="scene-links" viewBox={CONTOUR_VIEWBOX} preserveAspectRatio="xMidYMax slice">
          {LINK_PATHS.map(({ d, tone }, i) => (
            <path key={i} className="scene-link" data-tone={tone} d={d} />
          ))}
          {SIGNAL_LINKS.map((link, n) => (
            <path
              key={`signal-${link}`}
              className="scene-signal auth-ambient"
              data-tone={LINK_PATHS[link].tone}
              d={LINK_PATHS[link].d}
              pathLength={100}
              style={{ animationDelay: `${n * -2.2}s` }}
            />
          ))}
        </svg>
        {PINS.map(([x, y, tone], i) => (
          <span
            key={i}
            className="auth-pin auth-ambient"
            data-tone={tone}
            style={{ '--x': x, '--y': y, '--pulse-delay': `${(i * 0.45).toFixed(2)}s` } as CSSProperties}
          >
            <i />
          </span>
        ))}
      </div>

      <QuestionCards />

      <p className="auth-tagline">What the internet thinks, mapped.</p>
    </div>
  );
};
