import { useRef, type CSSProperties } from 'react';
import { CONTOUR_VIEWBOX, CONTOURS_FAR, CONTOURS_NEAR, PEAKS } from './contourPaths';
import { usePointerParallax } from './useAmbientMotion';

// Sentiment tint of the signal pin on each hill top, in PEAKS order.
const PIN_TONES = ['positive', 'negative', 'neutral', 'positive'] as const;

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
        <polyline points="0,22 18,20 36,23 54,18 72,24 90,27 108,15 126,10 144,12 162,7 180,9 200,5" />
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
 */
export const AuthScene = () => {
  const sceneRef = useRef<HTMLDivElement>(null);
  usePointerParallax(sceneRef);

  return (
    <div ref={sceneRef} className="auth-scene" aria-hidden="true">
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

      {/* HTML rather than SVG, so their pulse stays on the compositor. CSS maps
          the viewBox coordinates onto the same cover fit as the SVG layers. */}
      <div className="auth-scene-layer auth-scene-pins">
        {PEAKS.map(([x, y], i) => (
          <span
            key={i}
            className={`auth-pin auth-pin-${PIN_TONES[i]} auth-ambient`}
            style={{ '--x': x, '--y': y } as CSSProperties}
          />
        ))}
      </div>

      <QuestionCards />

      <p className="auth-tagline">What the internet thinks, mapped.</p>
    </div>
  );
};
