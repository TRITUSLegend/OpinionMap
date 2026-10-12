import { CONTOUR_VIEWBOX, CONTOURS_FAR, CONTOURS_NEAR, PEAKS } from './contourPaths';

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
 * stands in for sentiment intensity, with signal pins on the hill tops and a
 * sample insight card. Hidden from assistive technology; nothing here is real
 * data.
 */
export const AuthScene = () => (
  <div className="auth-scene" aria-hidden="true">
    <div className="auth-scene-layer auth-scene-far">
      <svg viewBox={CONTOUR_VIEWBOX} preserveAspectRatio="xMidYMax slice" className="auth-contours">
        <Contours paths={FAR} />
      </svg>
    </div>

    <div className="auth-scene-layer auth-scene-near">
      <svg viewBox={CONTOUR_VIEWBOX} preserveAspectRatio="xMidYMax slice" className="auth-contours">
        <Contours paths={NEAR} />
      </svg>
    </div>

    {/* Pins get their own unmasked layer so the bottom fade never dims them. */}
    <div className="auth-scene-layer auth-scene-pins">
      <svg viewBox={CONTOUR_VIEWBOX} preserveAspectRatio="xMidYMax slice">
        {PEAKS.map(([x, y], i) => (
          <g key={i} className={`auth-pin auth-pin-${PIN_TONES[i]}`}>
            <circle className="auth-pin-ring" cx={x} cy={y} r={7} />
            <circle className="auth-pin-dot" cx={x} cy={y} r={3} />
          </g>
        ))}
      </svg>
    </div>

    <div className="auth-sample">
      <p className="auth-sample-caption">Sample preview</p>
      <p className="auth-sample-topic">Four-day work week</p>
      <div className="auth-sample-bar">
        <span className="bg-positive" style={{ width: '52%' }} />
        <span className="bg-neutral" style={{ width: '31%' }} />
        <span className="bg-negative" style={{ width: '17%' }} />
      </div>
      <div className="auth-sample-legend">
        <span><i className="bg-positive" />52% positive</span>
        <span><i className="bg-neutral" />31%</span>
        <span><i className="bg-negative" />17%</span>
      </div>
    </div>

    <p className="auth-tagline">What the internet thinks, mapped.</p>
  </div>
);
