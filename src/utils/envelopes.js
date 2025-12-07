/**
 * Envelope/Curve Evaluation Utilities
 * 
 * Extracted from BPMEnvelopeEditor for reuse in Timeline and other systems.
 * Provides curve interpolation with various easing types and tension control.
 */

// Available curve types
export const CURVE_TYPES = {
  linear: { name: 'Linear', icon: '/' },
  easeIn: { name: 'Ease In', icon: '⌒' },
  easeOut: { name: 'Ease Out', icon: '⌓' },
  easeInOut: { name: 'Ease In-Out', icon: '∿' },
  step: { name: 'Step (Mid)', icon: '⌐' },
  stepStart: { name: 'Step (Start)', icon: '⌐' },
  stepEnd: { name: 'Step (End)', icon: '⌐' },
};

/**
 * Cubic bezier evaluation - matches SVG C command exactly
 * Given control points P0=(0,0), P1=(cp1x,cp1y), P2=(cp2x,cp2y), P3=(1,1)
 * Returns y value for a given t parameter (0-1)
 */
const evaluateCubicBezier = (t, cp1x, cp1y, cp2x, cp2y) => {
  const y = 3 * (1-t) * (1-t) * t * cp1y + 3 * (1-t) * t * t * cp2y + t * t * t;
  return y;
};

/**
 * Find t parameter for a given x using Newton-Raphson iteration
 */
const findTForX = (targetX, cp1x, cp2x, iterations = 8) => {
  let t = targetX; // Initial guess
  for (let i = 0; i < iterations; i++) {
    const x = 3 * (1-t) * (1-t) * t * cp1x + 3 * (1-t) * t * t * cp2x + t * t * t;
    const dx = 3 * (1-t) * (1-t) * cp1x + 6 * (1-t) * t * (cp2x - cp1x) + 3 * t * t * (1 - cp2x);
    if (Math.abs(dx) < 1e-6) break;
    t = t - (x - targetX) / dx;
    t = Math.max(0, Math.min(1, t));
  }
  return t;
};

/**
 * Evaluate cubic bezier y for a given x (0-1)
 */
const cubicBezierY = (x, cp1x, cp1y, cp2x, cp2y) => {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const t = findTForX(x, cp1x, cp2x);
  return evaluateCubicBezier(t, cp1x, cp1y, cp2x, cp2y);
};

/**
 * Get bezier control points for curve type and tension
 * These MUST match the SVG path generation exactly
 */
export const getBezierControlPoints = (curveType, tension = 0.5) => {
  const cpOffset = 0.1 + tension * 0.8; // 0.1 to 0.9
  
  switch (curveType) {
    case 'easeIn':
      return { cp1x: cpOffset, cp1y: 0, cp2x: 1, cp2y: 1 };
    case 'easeOut':
      return { cp1x: 0, cp1y: 0, cp2x: 1 - cpOffset, cp2y: 1 };
    case 'easeInOut':
      return { cp1x: cpOffset, cp1y: 0, cp2x: 1 - cpOffset, cp2y: 1 };
    default:
      return { cp1x: 0, cp1y: 0, cp2x: 1, cp2y: 1 }; // Linear
  }
};

/**
 * Easing functions for curve interpolation
 * tension: 0 = very gentle, 0.5 = default, 1 = very steep
 */
export const easingFunctions = {
  linear: (t, tension = 0.5) => t,
  easeIn: (t, tension = 0.5) => {
    const { cp1x, cp1y, cp2x, cp2y } = getBezierControlPoints('easeIn', tension);
    return cubicBezierY(t, cp1x, cp1y, cp2x, cp2y);
  },
  easeOut: (t, tension = 0.5) => {
    const { cp1x, cp1y, cp2x, cp2y } = getBezierControlPoints('easeOut', tension);
    return cubicBezierY(t, cp1x, cp1y, cp2x, cp2y);
  },
  easeInOut: (t, tension = 0.5) => {
    const { cp1x, cp1y, cp2x, cp2y } = getBezierControlPoints('easeInOut', tension);
    return cubicBezierY(t, cp1x, cp1y, cp2x, cp2y);
  },
  step: (t, tension = 0.5) => t < tension ? 0 : 1, // tension controls step position
  stepStart: (t) => t <= 0 ? 0 : 1,
  stepEnd: (t) => t >= 1 ? 1 : 0,
};

/**
 * Evaluate a value between two keyframes using the specified curve type
 * @param {number} t - Normalized position between keyframes (0-1)
 * @param {number} startValue - Value at start keyframe
 * @param {number} endValue - Value at end keyframe
 * @param {string} curveType - Type of curve ('linear', 'easeIn', etc.)
 * @param {number} tension - Curve tension (0-1)
 * @returns {number} Interpolated value
 */
export const interpolateValue = (t, startValue, endValue, curveType = 'linear', tension = 0.5) => {
  const easingFn = easingFunctions[curveType] || easingFunctions.linear;
  const easedT = easingFn(t, tension);
  return startValue + easedT * (endValue - startValue);
};

/**
 * Evaluate an envelope/curve at a given x position (0-1)
 * Supports per-segment curve types for different interpolation styles
 * @param {Object} envelope - Envelope object with nodes array
 * @param {number} x - Position to evaluate (0-1)
 * @returns {number} Evaluated y value (0-1)
 */
export const evaluateEnvelope = (envelope, x) => {
  if (!envelope?.nodes || envelope.nodes.length === 0) return x;
  
  const nodes = envelope.nodes;
  if (nodes.length === 1) return nodes[0].y;
  
  // Clamp x to 0-1
  x = Math.max(0, Math.min(1, x));
  
  // Find the two nodes to interpolate between
  let left = nodes[0];
  let right = nodes[nodes.length - 1];
  
  for (let i = 0; i < nodes.length - 1; i++) {
    if (x >= nodes[i].x && x <= nodes[i + 1].x) {
      left = nodes[i];
      right = nodes[i + 1];
      break;
    }
  }
  
  // Handle edge cases
  if (x <= left.x) return left.y;
  if (x >= right.x) return right.y;
  
  // Get curve type and tension for this segment (stored on left node)
  const curveType = left.curve || 'linear';
  const tension = left.tension !== undefined ? left.tension : 0.5;
  
  // Calculate normalized position within segment (0-1)
  const t = (x - left.x) / (right.x - left.x);
  
  // Apply easing function with tension and interpolate
  return interpolateValue(t, left.y, right.y, curveType, tension);
};

/**
 * Evaluate a timeline track at a given time in seconds
 * @param {Object} track - Timeline track with keyframes array
 * @param {number} timeSeconds - Time position in seconds
 * @returns {number|null} Evaluated value (mapped to output range) or null if no keyframes
 */
export const evaluateTrackAtTime = (track, timeSeconds) => {
  if (!track?.keyframes || track.keyframes.length === 0) return null;
  
  const keyframes = track.keyframes;
  
  // Single keyframe: return its value
  if (keyframes.length === 1) {
    const value01 = keyframes[0].value01;
    const { outputMin = 0, outputMax = 1 } = track.range || {};
    return outputMin + value01 * (outputMax - outputMin);
  }
  
  // Find surrounding keyframes
  let left = keyframes[0];
  let right = keyframes[keyframes.length - 1];
  
  // Before first keyframe
  if (timeSeconds <= left.timeSeconds) {
    const { outputMin = 0, outputMax = 1 } = track.range || {};
    return outputMin + left.value01 * (outputMax - outputMin);
  }
  
  // After last keyframe
  if (timeSeconds >= right.timeSeconds) {
    const { outputMin = 0, outputMax = 1 } = track.range || {};
    return outputMin + right.value01 * (outputMax - outputMin);
  }
  
  // Find the segment containing timeSeconds
  for (let i = 0; i < keyframes.length - 1; i++) {
    if (timeSeconds >= keyframes[i].timeSeconds && timeSeconds <= keyframes[i + 1].timeSeconds) {
      left = keyframes[i];
      right = keyframes[i + 1];
      break;
    }
  }
  
  // Calculate normalized position within segment (0-1)
  const segmentDuration = right.timeSeconds - left.timeSeconds;
  const t = segmentDuration > 0 ? (timeSeconds - left.timeSeconds) / segmentDuration : 0;
  
  // Get curve type and tension from left keyframe
  const curveType = left.curve || 'linear';
  const tension = left.tension !== undefined ? left.tension : 0.5;
  
  // Interpolate value01
  const value01 = interpolateValue(t, left.value01, right.value01, curveType, tension);
  
  // Map to output range
  const { outputMin = 0, outputMax = 1 } = track.range || {};
  return outputMin + value01 * (outputMax - outputMin);
};

/**
 * Evaluate a shape track at a given time
 * Returns { nodes, subpaths } or null if no keyframes
 * 
 * Shape tracks store geometry snapshots at keyframes and interpolate between them
 * using lerpNodes/lerpSubpaths (imported separately to avoid circular deps)
 */
export const evaluateShapeTrackAtTime = (track, timeSeconds, lerpNodes, lerpSubpaths) => {
  if (!track || track.type !== 'shape') return null;
  
  const keyframes = track.keyframes || [];
  if (keyframes.length === 0) return null;
  
  // Sort by time (should already be sorted, but ensure)
  const sorted = [...keyframes].sort((a, b) => a.timeSeconds - b.timeSeconds);
  
  // Before first keyframe: use first keyframe's shape
  if (timeSeconds <= sorted[0].timeSeconds) {
    return { nodes: sorted[0].nodes, subpaths: sorted[0].subpaths };
  }
  
  // After last keyframe: use last keyframe's shape
  if (timeSeconds >= sorted[sorted.length - 1].timeSeconds) {
    const last = sorted[sorted.length - 1];
    return { nodes: last.nodes, subpaths: last.subpaths };
  }
  
  // Find bracketing keyframes
  let left = sorted[0];
  let right = sorted[sorted.length - 1];
  
  for (let i = 0; i < sorted.length - 1; i++) {
    if (timeSeconds >= sorted[i].timeSeconds && timeSeconds <= sorted[i + 1].timeSeconds) {
      left = sorted[i];
      right = sorted[i + 1];
      break;
    }
  }
  
  // Same keyframe or very close
  if (left === right || Math.abs(right.timeSeconds - left.timeSeconds) < 0.001) {
    return { nodes: left.nodes, subpaths: left.subpaths };
  }
  
  // Calculate local t (0-1) between the two keyframes
  const localT = (timeSeconds - left.timeSeconds) / (right.timeSeconds - left.timeSeconds);
  const clampedT = Math.max(0, Math.min(1, localT));
  
  // Try to interpolate subpaths first
  if (left.subpaths && right.subpaths && lerpSubpaths) {
    const interpolated = lerpSubpaths(left.subpaths, right.subpaths, clampedT);
    if (interpolated) {
      return { subpaths: interpolated, nodes: null };
    }
  }
  
  // Try to interpolate nodes
  if (left.nodes && right.nodes && lerpNodes) {
    const interpolated = lerpNodes(left.nodes, right.nodes, clampedT);
    if (interpolated) {
      return { nodes: interpolated, subpaths: null };
    }
  }
  
  // Topology mismatch: hold previous keyframe's shape
  return { nodes: left.nodes, subpaths: left.subpaths };
};

/**
 * Find which segment index contains the given x position
 */
export const findSegmentAtX = (nodes, x) => {
  if (!nodes || nodes.length < 2) return -1;
  x = Math.max(0, Math.min(1, x));
  
  for (let i = 0; i < nodes.length - 1; i++) {
    if (x >= nodes[i].x && x <= nodes[i + 1].x) {
      return i;
    }
  }
  return nodes.length - 2; // Last segment
};

// Default envelope (linear ramp)
export const DEFAULT_ENVELOPE = {
  nodes: [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ],
  preset: 'linear',
};

// Preset envelope curves (same as BPMEnvelopeEditor)
export const ENVELOPE_PRESETS = {
  linear: {
    name: 'Linear',
    nodes: [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ],
  },
  easyEase: {
    name: 'Easy Ease',
    nodes: [
      { x: 0, y: 0, curve: 'easeInOut' },
      { x: 1, y: 1 },
    ],
  },
  adsr: {
    name: 'ADSR',
    nodes: [
      { x: 0, y: 0, curve: 'easeOut' },
      { x: 0.1, y: 1, curve: 'easeIn' },
      { x: 0.3, y: 0.7, curve: 'linear' },
      { x: 0.8, y: 0.7, curve: 'easeIn' },
      { x: 1, y: 0 },
    ],
  },
  triangle: {
    name: 'Triangle',
    nodes: [
      { x: 0, y: 0 },
      { x: 0.5, y: 1 },
      { x: 1, y: 0 },
    ],
  },
  saw: {
    name: 'Saw',
    nodes: [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ],
  },
  sawReverse: {
    name: 'Saw (Rev)',
    nodes: [
      { x: 0, y: 1 },
      { x: 1, y: 0 },
    ],
  },
};
