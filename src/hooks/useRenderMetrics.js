import { useEffect, useRef } from 'react';

/**
 * Lightweight render profiler for development builds.
 * Logs render duration and render count to the console.
 */
export function useRenderMetrics(label) {
  const renderCountRef = useRef(0);
  const hasPerformance = typeof performance !== 'undefined' && typeof performance.now === 'function';
  const renderStartRef = useRef(null);

  useEffect(() => {
    if (!import.meta.env.DEV || !hasPerformance) return;
    renderStartRef.current = performance.now();
    return () => {
      renderStartRef.current = null;
    };
  }, [hasPerformance]);

  useEffect(() => {
    if (!import.meta.env.DEV || !hasPerformance || renderStartRef.current == null) return;
    renderCountRef.current += 1;
    const duration = performance.now() - renderStartRef.current;
    console.debug(`[perf] ${label} render #${renderCountRef.current}: ${duration.toFixed(2)}ms`);
  });
}
