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
 * data. Ambient motion (drift, pulse, float, parallax) is CSS on composited
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

      <div className="auth-sample auth-ambient">
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
};
