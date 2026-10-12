import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Flags a request as slow once it has been pending for `delayMs`, so the UI can
 * explain a cold start instead of looking frozen. Call start() when the request
 * begins and stop() when it settles.
 */
export const useSlowRequestHint = (delayMs = 5000) => {
  const [slow, setSlow] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const start = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSlow(true), delayMs);
  }, [delayMs]);

  const stop = useCallback(() => {
    window.clearTimeout(timer.current);
    setSlow(false);
  }, []);

  useEffect(() => {
    const pending = timer;
    return () => window.clearTimeout(pending.current);
  }, []);

  return { slow, start, stop };
};
