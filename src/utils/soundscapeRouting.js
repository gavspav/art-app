import {
  DEFAULT_SOUNDSCAPE_ROUTES,
  SOUNDSCAPE_DESTINATIONS,
  SOUNDSCAPE_SOURCES,
} from '../constants/soundscapeParams.js';
import { clamp01 } from './soundscapeUtils.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const applyCurve = (value, curve) => {
  if (curve === 'exp') return value * value;
  if (curve === 'log') return Math.sqrt(value);
  return value;
};

export const normalizeSoundscapeRoute = (route, index = 0) => {
  const source = SOUNDSCAPE_SOURCES[route?.source] ? route.source : 'speed';
  const dest = SOUNDSCAPE_DESTINATIONS[route?.dest] ? route.dest : 'bpm';
  const destination = SOUNDSCAPE_DESTINATIONS[dest];
  return {
    id: String(route?.id || `${source}-${dest}-${index}`),
    source,
    dest,
    inMin: clamp01(route?.inMin, 0),
    inMax: clamp01(route?.inMax, 1),
    outMin: Number.isFinite(Number(route?.outMin)) ? Number(route.outMin) : destination.min,
    outMax: Number.isFinite(Number(route?.outMax)) ? Number(route.outMax) : destination.max,
    curve: ['linear', 'exp', 'log'].includes(route?.curve) ? route.curve : 'linear',
    invert: !!route?.invert,
    depth: clamp01(route?.depth, 1),
    smoothing: clamp(Number(route?.smoothing) || SOUNDSCAPE_SOURCES[source].defaultSmoothing, 0.05, 2),
    enabled: route?.enabled !== false,
  };
};

export const normalizeSoundscapeRoutes = routes => (
  Array.isArray(routes) && routes.length
    ? routes.map(normalizeSoundscapeRoute)
    : DEFAULT_SOUNDSCAPE_ROUTES.map(normalizeSoundscapeRoute)
);

export const resolveSoundscapeRoutes = (sources = {}, routes = DEFAULT_SOUNDSCAPE_ROUTES) => {
  const resolved = {};
  const smoothing = {};
  normalizeSoundscapeRoutes(routes).forEach(route => {
    if (!route.enabled) return;
    const destination = SOUNDSCAPE_DESTINATIONS[route.dest];
    const sourceValue = clamp01(sources[route.source]);
    const span = Math.max(0.0001, route.inMax - route.inMin);
    let normalized = clamp01((sourceValue - route.inMin) / span);
    if (route.invert) normalized = 1 - normalized;
    normalized = applyCurve(normalized, route.curve);
    const mapped = route.outMin + (route.outMax - route.outMin) * normalized;
    const neutral = destination.combine === 'multiply' ? 1 : route.outMin;
    const contribution = neutral + (mapped - neutral) * route.depth;
    if (destination.combine === 'replace') resolved[route.dest] = contribution;
    else if (destination.combine === 'multiply') resolved[route.dest] = (resolved[route.dest] ?? 1) * contribution;
    else resolved[route.dest] = (resolved[route.dest] ?? 0) + contribution;
    smoothing[route.dest] = Math.max(smoothing[route.dest] || 0, route.smoothing);
  });
  Object.entries(resolved).forEach(([key, value]) => {
    const destination = SOUNDSCAPE_DESTINATIONS[key];
    resolved[key] = clamp(value, destination.min, destination.max);
  });
  return { destinations: resolved, smoothing };
};

export const migrateLegacySoundscapeRoutes = config => {
  if (Array.isArray(config?.routes) && config.routes.length) return normalizeSoundscapeRoutes(config.routes);
  const strengths = config?.mappings || {};
  const ranges = config?.mappingRanges || {};
  return DEFAULT_SOUNDSCAPE_ROUTES.map((route, index) => {
    const sourceStrength = Number.isFinite(Number(strengths[route.source])) ? Number(strengths[route.source]) : 1;
    const legacyRange = ranges[route.source] || {};
    return normalizeSoundscapeRoute({
      ...route,
      id: route.id,
      inMin: legacyRange.min ?? route.inMin,
      inMax: legacyRange.max ?? route.inMax,
      invert: legacyRange.invert ?? route.invert,
      depth: sourceStrength,
    }, index);
  });
};
