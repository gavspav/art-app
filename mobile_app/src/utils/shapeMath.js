/**
 * Collection of geometry helpers shared across the art rendering pipeline.
 * Functions in this module never touch React; they focus purely on math so
 * components can ask for shapes, smoothing, and noise with minimal boilerplate.
 */
import { createSeededRandom } from './random.js';

const TWO_PI = Math.PI * 2;

// Reduce floating-point noise so SVG path strings stay compact and stable.
const round = (value) => Number.parseFloat(Number(value).toFixed(3));

// Clamp a numeric value to the provided inclusive range.
export const clampValue = (value, min, max) => {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
};

// Constrain a point to a circle, keeping deformation bounded around the origin.
export const clampPoint = (point, radius = 1) => {
  if (!point) return { x: 0, y: 0 };
  const x = Number.isFinite(point.x) ? point.x : 0;
  const y = Number.isFinite(point.y) ? point.y : 0;
  const dist = Math.hypot(x, y);
  if (dist <= radius || dist === 0) {
    return { x, y };
  }
  const scale = radius / dist;
  return { x: x * scale, y: y * scale };
};

export const createRegularPolygon = (sides = 5, radius = 1) => {
  const count = Math.max(3, Math.round(sides));
  const r = clampValue(radius, 0.2, 1.2);
  return Array.from({ length: count }).map((_, index) => {
    const angle = (TWO_PI * index) / count - Math.PI / 2;
    return {
      id: `node-${index}`,
      x: Math.cos(angle) * r,
      y: Math.sin(angle) * r,
    };
  });
};

// Apply random jitter to each polygon node for organic variation.
export const jitterPolygon = (nodes, jitterAmount = 0.1) => {
  const amount = clampValue(jitterAmount, 0, 0.5);
  return nodes.map((node, index) => {
    const angle = Math.atan2(node.y, node.x);
    const magnitude = Math.hypot(node.x, node.y);
    const radialJitter = (Math.random() * 2 - 1) * amount;
    const angularJitter = (Math.random() * 2 - 1) * amount * 0.6;
    const nextMagnitude = Math.max(0.2, magnitude + radialJitter);
    const nextAngle = angle + angularJitter;
    return {
      id: node.id || `node-${index}`,
      x: Math.cos(nextAngle) * nextMagnitude,
      y: Math.sin(nextAngle) * nextMagnitude,
    };
  });
};

// Build a closed SVG path string from a sequence of points using cubic curves.
export const buildSmoothPath = (points, curviness = 0) => {
  if (!Array.isArray(points) || points.length === 0) return '';
  if (points.length === 1) {
    const { x, y } = points[0];
    return `M ${round(x)} ${round(y)} Z`;
  }

  const smoothing = clampValue(curviness, 0, 1);
  const formatted = points.map((p) => ({ x: round(p.x), y: round(p.y) }));
  const [first] = formatted;

  if (formatted.length === 2 || smoothing < 0.02) {
    const [, second] = formatted;
    return `M ${first.x} ${first.y} L ${second.x} ${second.y} Z`;
  }

  const n = formatted.length;
  const tension = 0.55 + smoothing * 0.35;
  let path = `M ${first.x} ${first.y}`;

  for (let i = 0; i < n; i += 1) {
    const p0 = formatted[(i - 1 + n) % n];
    const p1 = formatted[i];
    const p2 = formatted[(i + 1) % n];
    const p3 = formatted[(i + 2) % n];

    const cp1x = p1.x + ((p2.x - p0.x) * tension) / 6;
    const cp1y = p1.y + ((p2.y - p0.y) * tension) / 6;
    const cp2x = p2.x - ((p3.x - p1.x) * tension) / 6;
    const cp2y = p2.y - ((p3.y - p1.y) * tension) / 6;

    path += ` C ${round(cp1x)} ${round(cp1y)} ${round(cp2x)} ${round(cp2y)} ${round(p2.x)} ${round(p2.y)}`;
  }

  path += ' Z';
  return path;
};

export const deriveLayerPoints = (nodes, {
  size,
  variationShape = 0,
  variationPosition = 0,
  layerIndex = 0,
  noiseAmount = 0,
  noiseSeed = 1,
  noiseFreq1 = 2,
  noiseFreq2 = 3,
  noiseFreq3 = 4,
} = {}) => {
  // Convert normalized node coordinates into layer-specific canvas coordinates
  // by applying scaling, positional offsets, and optional noise distortion.
  if (!Array.isArray(nodes)) return [];
  const baseFactor = Math.max(0.2, size) * 100;
  const shapeInfluence = clampValue(variationShape, 0, 1) * layerIndex;
  const scaleFactor = Math.max(0.05, 1 + shapeInfluence * 0.7);
  const wobble = shapeInfluence > 0 ? shapeInfluence * 0.45 : 0;
  const factor = baseFactor * scaleFactor;

  const angle = layerIndex * 2.2;
  const shiftMagnitude = variationPosition * layerIndex * 32;
  const tx = Math.cos(angle) * shiftMagnitude;
  const ty = Math.sin(angle) * shiftMagnitude;

  const noiseIntensity = clampValue(noiseAmount, 0, 1);
  const symmetryFactor = clampValue(variationShape, 0, 1);
  const seededRandom = noiseIntensity > 0
    ? createSeededRandom((Number.isFinite(noiseSeed) ? noiseSeed : 1) + layerIndex * 9973)
    : null;
  const baseFreq1 = Number.isFinite(noiseFreq1) ? noiseFreq1 : 2;
  const baseFreq2 = Number.isFinite(noiseFreq2) ? noiseFreq2 : 3;
  const baseFreq3 = Number.isFinite(noiseFreq3) ? noiseFreq3 : 4;
  const freqOffsets = seededRandom
    ? {
        f1: baseFreq1 + (seededRandom() - 0.5) * 3,
        f2: baseFreq2 + (seededRandom() - 0.5) * 3,
        f3: baseFreq3 + (seededRandom() - 0.5) * 30,
      }
    : { f1: baseFreq1, f2: baseFreq2, f3: baseFreq3 };

  return nodes.map((node, index) => {
    const nodeAngle = Math.atan2(node.y, node.x) + wobble * Math.sin(index + layerIndex * 0.8);
    const magnitude = Math.hypot(node.x, node.y);
    const stretchedMag = magnitude * (1 + wobble * Math.cos(index * 1.2 + layerIndex));
    const baseX = Math.cos(nodeAngle) * stretchedMag * factor;
    const baseY = Math.sin(nodeAngle) * stretchedMag * factor;

    let noisyX = baseX;
    let noisyY = baseY;

    if (seededRandom) {
      // Combine several sinusoidal noise sources to create smooth, repeatable
      // offsets. Frequencies receive slight random offsets per layer so each
      // layer deforms differently while staying deterministic for a given seed.
      const totalNodes = Math.max(1, nodes.length);
      const angleRatio = (index / totalNodes) * TWO_PI;
      const phase = (1 - symmetryFactor) * (index % 2) * Math.PI;
      const n1 = Math.sin(angleRatio * freqOffsets.f1 + phase);
      const n2 = Math.cos(angleRatio * freqOffsets.f2 - phase * 0.5);
      const n3 = Math.sin(angleRatio * freqOffsets.f3 + phase * 0.25);
      const combined = n1 * 1 + n2 * 0.75 + n3 * 0.5;
      const baseRadius = Math.max(Math.abs(baseX), Math.abs(baseY), 1);
      const offsetMagnitude = combined * baseRadius * 0.36 * noiseIntensity;
      const dist = Math.hypot(baseX, baseY) || 1;
      noisyX += (baseX / dist) * offsetMagnitude;
      noisyY += (baseY / dist) * offsetMagnitude;
    }

    const x = noisyX + tx;
    const y = noisyY + ty;
    return {
      id: node.id || `node-${index}`,
      x,
      y,
    };
  });
};
