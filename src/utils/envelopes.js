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
 * Normalize color arrays to the same length by duplicating colors
 * Makes the shorter array match the longer one by repeating colors
 */
const normalizeColorArrays = (colorsA, colorsB) => {
  if (!Array.isArray(colorsA) || !Array.isArray(colorsB)) {
    return { a: colorsA || [], b: colorsB || [] };
  }
  
  const maxLen = Math.max(colorsA.length, colorsB.length);
  if (maxLen === 0) return { a: [], b: [] };
  
  const expandArray = (arr, targetLen) => {
    if (arr.length === 0) return Array(targetLen).fill('#000000');
    if (arr.length >= targetLen) return arr.slice(0, targetLen);
    
    // Duplicate colors to reach target length
    const result = [];
    for (let i = 0; i < targetLen; i++) {
      result.push(arr[i % arr.length]);
    }
    return result;
  };
  
  return {
    a: expandArray(colorsA, maxLen),
    b: expandArray(colorsB, maxLen),
  };
};

/**
 * Interpolate between two color arrays
 */
const lerpColorArrays = (colorsA, colorsB, t) => {
  const { a, b } = normalizeColorArrays(colorsA, colorsB);
  if (a.length === 0) return b.length > 0 ? b : [];
  
  return a.map((colorA, i) => {
    const colorB = b[i] || colorA;
    return lerpColor(colorA, colorB, t);
  });
};

/**
 * Linear interpolation helper
 */
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Evaluate a shape track at a given time
 * Returns { nodes, subpaths, position, animation, colors } or null if no keyframes
 * 
 * Shape tracks store geometry snapshots at keyframes and interpolate between them
 * using lerpNodes/lerpSubpaths (imported separately to avoid circular deps)
 * 
 * Extended to also interpolate position, animation params, and colors based on
 * track.categories toggles
 */
export const evaluateShapeTrackAtTime = (track, timeSeconds, lerpNodes, lerpSubpaths) => {
  if (!track || track.type !== 'shape') return null;
  
  const keyframes = track.keyframes || [];
  if (keyframes.length === 0) return null;
  
  // Get category toggles (default: shape only)
  const categories = track.categories || { shape: true, animation: false, color: false };
  
  // Sort by time (should already be sorted, but ensure)
  const sorted = [...keyframes].sort((a, b) => a.timeSeconds - b.timeSeconds);
  
  const isEnabled = (kf) => kf && kf.enabled !== false;
  
  // Helper to build result from a single keyframe
  const buildSingleResult = (kf) => {
    if (!isEnabled(kf)) return null;
    const result = {
      nodes: categories.shape ? kf.nodes : null,
      subpaths: categories.shape ? kf.subpaths : null,
    };
    
    // Always include position for shape interpolation
    if (kf.position) {
      result.position = { ...kf.position };
    }
    
    // Always include shape params (Layer Shape Tab: Sides, Curviness, Size, etc.)
    if (kf.shapeParams) {
      result.shapeParams = { ...kf.shapeParams };
    }
    
    if (categories.animation && kf.animation) {
      result.animation = { ...kf.animation };
    }
    
    if (categories.color && kf.colors) {
      result.colors = [...kf.colors];
    }
    
    return result;
  };
  
  // Before first keyframe: use first keyframe's data if enabled
  if (timeSeconds <= sorted[0].timeSeconds) {
    return buildSingleResult(sorted[0]);
  }
  
  // After last keyframe: use last keyframe's data if enabled
  if (timeSeconds >= sorted[sorted.length - 1].timeSeconds) {
    return buildSingleResult(sorted[sorted.length - 1]);
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
    return buildSingleResult(left);
  }
  
  // Calculate local t (0-1) between the two keyframes
  const localT = (timeSeconds - left.timeSeconds) / (right.timeSeconds - left.timeSeconds);
  const clampedT = Math.max(0, Math.min(1, localT));
  
  // If the leading keyframe for this segment is disabled, treat the shape track as off
  if (!isEnabled(left)) {
    return null;
  }
  
  // Build interpolated result
  const result = {
    nodes: null,
    subpaths: null,
  };

  // Use curve/tension from the left keyframe to ease scalar interpolations
  // Geometry (nodes/subpaths) continues to use linear clampedT
  const curveType = left.curve || 'linear';
  const tension = left.tension !== undefined ? left.tension : 0.5;
  const easedT = interpolateValue(clampedT, 0, 1, curveType, tension);
  
  // Interpolate shape (nodes/subpaths) if enabled
  if (categories.shape) {
    // Try to interpolate subpaths first
    if (left.subpaths && right.subpaths && lerpSubpaths) {
      const interpolated = lerpSubpaths(left.subpaths, right.subpaths, clampedT);
      if (interpolated) {
        result.subpaths = interpolated;
      }
    }
    
    // Try to interpolate nodes if subpaths didn't work
    if (!result.subpaths && left.nodes && right.nodes && lerpNodes) {
      const interpolated = lerpNodes(left.nodes, right.nodes, clampedT);
      if (interpolated) {
        result.nodes = interpolated;
      }
    }
    
    // Topology mismatch: hold previous keyframe's shape
    if (!result.nodes && !result.subpaths) {
      result.nodes = left.nodes;
      result.subpaths = left.subpaths;
    }
  }
  
  // Always interpolate position (for shape screen position)
  if (left.position || right.position) {
    const posA = left.position || { x: 0.5, y: 0.5, scale: 1, xOffset: 0, yOffset: 0 };
    const posB = right.position || posA;
    
    result.position = {
      x: lerp(posA.x ?? 0.5, posB.x ?? 0.5, easedT),
      y: lerp(posA.y ?? 0.5, posB.y ?? 0.5, easedT),
      scale: lerp(posA.scale ?? 1, posB.scale ?? 1, easedT),
      xOffset: lerp(posA.xOffset ?? 0, posB.xOffset ?? 0, easedT),
      yOffset: lerp(posA.yOffset ?? 0, posB.yOffset ?? 0, easedT),
    };
  }
  
  // Always interpolate shape params (Layer Shape Tab: Sides, Curviness, Size, Size X, Size Y, Rotate)
  if (left.shapeParams || right.shapeParams) {
    const spA = left.shapeParams || {};
    const spB = right.shapeParams || spA;
    
    result.shapeParams = {
      // numSides: interpolate but round to integer for rendering
      numSides: Math.round(lerp(spA.numSides ?? 6, spB.numSides ?? 6, easedT)),
      curviness: lerp(spA.curviness ?? 1.0, spB.curviness ?? 1.0, easedT),
      radiusFactor: lerp(spA.radiusFactor ?? 0.125, spB.radiusFactor ?? 0.125, easedT),
      radiusFactorX: lerp(spA.radiusFactorX ?? spA.radiusFactor ?? 0.125, spB.radiusFactorX ?? spB.radiusFactor ?? 0.125, easedT),
      radiusFactorY: lerp(spA.radiusFactorY ?? spA.radiusFactor ?? 0.125, spB.radiusFactorY ?? spB.radiusFactor ?? 0.125, easedT),
      rotation: lerp(spA.rotation ?? 0, spB.rotation ?? 0, easedT),
    };
  }
  
  // Interpolate animation parameters if enabled
  if (categories.animation && (left.animation || right.animation)) {
    const animA = left.animation || {};
    const animB = right.animation || animA;
    
    result.animation = {
      // movementStyle: use left's style (discrete, no interpolation)
      movementStyle: animA.movementStyle ?? animB.movementStyle ?? 'bounce',
      movementSpeed: lerp(animA.movementSpeed ?? 1, animB.movementSpeed ?? 1, easedT),
      movementAngle: lerp(animA.movementAngle ?? 45, animB.movementAngle ?? 45, easedT),
      scaleSpeed: lerp(animA.scaleSpeed ?? 0.05, animB.scaleSpeed ?? 0.05, easedT),
      scaleMin: lerp(animA.scaleMin ?? 0, animB.scaleMin ?? 0, easedT),
      scaleMax: lerp(animA.scaleMax ?? 1.5, animB.scaleMax ?? 1.5, easedT),
      rotation: lerp(animA.rotation ?? 0, animB.rotation ?? 0, easedT),
      radiusFactor: lerp(animA.radiusFactor ?? 0.125, animB.radiusFactor ?? 0.125, easedT),
    };
  }
  
  // Interpolate colors if enabled
  if (categories.color && (left.colors || right.colors)) {
    result.colors = lerpColorArrays(left.colors || [], right.colors || [], easedT);
  }
  
  return result;
};

// Helper to convert hex color to RGB components
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  } : { r: 255, g: 255, b: 255 };
}

// Helper to convert RGB to hex
function rgbToHex(r, g, b) {
  const toHex = (v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Interpolate between two colors
function lerpColor(color1, color2, t) {
  const c1 = hexToRgb(color1);
  const c2 = hexToRgb(color2);
  return rgbToHex(
    c1.r + (c2.r - c1.r) * t,
    c1.g + (c2.g - c1.g) * t,
    c1.b + (c2.b - c1.b) * t
  );
}

/**
 * Evaluate a color track at a given time
 * Returns a hex color string or null if no keyframes
 */
export const evaluateColorTrackAtTime = (track, timeSeconds) => {
  if (!track || track.type !== 'color') return null;
  
  const keyframes = track.keyframes || [];
  if (keyframes.length === 0) return null;
  
  // Sort by time
  const sorted = [...keyframes].sort((a, b) => a.timeSeconds - b.timeSeconds);
  
  // Before first keyframe: use first keyframe's color
  if (timeSeconds <= sorted[0].timeSeconds) {
    return sorted[0].color || '#ffffff';
  }
  
  // After last keyframe: use last keyframe's color
  if (timeSeconds >= sorted[sorted.length - 1].timeSeconds) {
    return sorted[sorted.length - 1].color || '#ffffff';
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
    return left.color || '#ffffff';
  }
  
  // Calculate local t (0-1) between the two keyframes
  const localT = (timeSeconds - left.timeSeconds) / (right.timeSeconds - left.timeSeconds);
  const clampedT = Math.max(0, Math.min(1, localT));
  
  // Interpolate colors
  return lerpColor(left.color || '#ffffff', right.color || '#ffffff', clampedT);
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
