/**
 * Envelope/Curve Evaluation Utilities
 * 
 * Extracted from BPMEnvelopeEditor for reuse in Timeline and other systems.
 * Provides curve interpolation with various easing types and tension control.
 */
import { hexToRgb, rgbToHex } from './colorUtils.js';

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
  const y = 3 * (1 - t) * (1 - t) * t * cp1y + 3 * (1 - t) * t * t * cp2y + t * t * t;
  return y;
};

/**
 * Find t parameter for a given x using Newton-Raphson iteration
 */
const findTForX = (targetX, cp1x, cp2x, iterations = 8) => {
  let t = targetX; // Initial guess
  for (let i = 0; i < iterations; i++) {
    const x = 3 * (1 - t) * (1 - t) * t * cp1x + 3 * (1 - t) * t * t * cp2x + t * t * t;
    const dx = 3 * (1 - t) * (1 - t) * cp1x + 6 * (1 - t) * t * (cp2x - cp1x) + 3 * t * t * (1 - cp2x);
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
  linear: (t, _tension = 0.5) => t,
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

  const keyframes = [...track.keyframes]
    .filter(kf => (
      kf &&
      Number.isFinite(Number(kf.timeSeconds)) &&
      Number.isFinite(Number(kf.value01))
    ))
    .sort((a, b) => a.timeSeconds - b.timeSeconds);
  if (keyframes.length === 0) return null;

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
  const aIsArray = Array.isArray(colorsA);
  const bIsArray = Array.isArray(colorsB);
  const aLen = aIsArray ? colorsA.length : 0;
  const bLen = bIsArray ? colorsB.length : 0;
  // If one side is missing (or empty) but the other side has colors, treat it as "hold" rather than tweening to black.
  if ((!aIsArray || aLen === 0) && bIsArray && bLen > 0) colorsA = colorsB;
  if ((!bIsArray || bLen === 0) && aIsArray && aLen > 0) colorsB = colorsA;

  if (!Array.isArray(colorsA) || !Array.isArray(colorsB)) {
    return { a: [], b: [] };
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

  // Get category toggles (default: shape + color)
  // Color is always enabled by default (even for older tracks that may have stored color:false).
  const categories = { ...(track.categories || { shape: true, animation: false, color: true }), color: true };

  // Sort by time (should already be sorted, but ensure)
  const sorted = [...keyframes]
    .filter(kf => kf && Number.isFinite(Number(kf.timeSeconds)))
    .sort((a, b) => a.timeSeconds - b.timeSeconds);
  if (sorted.length === 0) return null;

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

    if (categories.color && Array.isArray(kf.colors)) {
      result.colors = [...kf.colors];
    }

    // Include base (un-varied) data if present for runtime energy blending
    if (kf.base) {
      result.base = {
        nodes: categories.shape ? kf.base.nodes : null,
        subpaths: categories.shape ? kf.base.subpaths : null,
        position: kf.base.position ? { ...kf.base.position } : result.position,
        shapeParams: kf.base.shapeParams ? { ...kf.base.shapeParams } : result.shapeParams,
        animation: (categories.animation && kf.base.animation) ? { ...kf.base.animation } : result.animation,
        colors: (categories.color && Array.isArray(kf.base.colors)) ? [...kf.base.colors] : result.colors,
      };
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
  let leftIndex = 0;
  let rightIndex = sorted.length - 1;
  let left = sorted[leftIndex];
  let right = sorted[rightIndex];

  for (let i = 0; i < sorted.length - 1; i++) {
    if (timeSeconds >= sorted[i].timeSeconds && timeSeconds <= sorted[i + 1].timeSeconds) {
      leftIndex = i;
      rightIndex = i + 1;
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
      result.nodes = left.nodes || right.nodes || null;
      result.subpaths = left.subpaths || right.subpaths || null;
    }
  }

  // Always interpolate position (for shape screen position)
  if (left.position || right.position) {
    const posA = left.position || right.position || { x: 0.5, y: 0.5, scale: 1, xOffset: 0, yOffset: 0 };
    const posB = right.position || left.position || posA;

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
    const spA = left.shapeParams || right.shapeParams || {};
    const spB = right.shapeParams || left.shapeParams || spA;

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

  // Interpolate animation parameters (always if data exists — category toggles control application, not storage)
  if (left.animation || right.animation) {
    const animA = left.animation || right.animation || {};
    const animB = right.animation || left.animation || animA;

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

  // Interpolate colors (always if data exists — category toggles control application, not storage)
  {
    const hasColors = (kf) => Array.isArray(kf?.colors) && kf.colors.length > 0;
    const findPrevWithColors = (start) => {
      for (let i = start; i >= 0; i--) {
        const kf = sorted[i];
        if (isEnabled(kf) && hasColors(kf)) return kf;
      }
      return null;
    };
    const findNextWithColors = (start) => {
      for (let i = start; i < sorted.length; i++) {
        const kf = sorted[i];
        if (isEnabled(kf) && hasColors(kf)) return kf;
      }
      return null;
    };

    const leftColorKf = hasColors(left) ? left : findPrevWithColors(leftIndex);
    const rightColorKf = hasColors(right) ? right : findNextWithColors(rightIndex);

    if (leftColorKf && rightColorKf) {
      if (leftColorKf === rightColorKf || Math.abs(rightColorKf.timeSeconds - leftColorKf.timeSeconds) < 1e-6) {
        result.colors = [...leftColorKf.colors];
      } else {
        const tRaw = (timeSeconds - leftColorKf.timeSeconds) / (rightColorKf.timeSeconds - leftColorKf.timeSeconds);
        const t = Math.max(0, Math.min(1, tRaw));
        const cCurve = leftColorKf.curve || 'linear';
        const cTension = leftColorKf.tension !== undefined ? leftColorKf.tension : 0.5;
        const easedColorT = interpolateValue(t, 0, 1, cCurve, cTension);
        result.colors = lerpColorArrays(leftColorKf.colors, rightColorKf.colors, easedColorT);
      }
    } else if (leftColorKf) {
      result.colors = [...leftColorKf.colors];
    } else if (rightColorKf) {
      result.colors = [...rightColorKf.colors];
    }
  }

  // Interpolate base (un-varied) data if present on both bracket keyframes
  // This enables runtime energy blending: final = lerp(base, varied, energy * influence)
  const leftBase = left.base;
  const rightBase = right.base;
  if (leftBase || rightBase) {
    const baseA = leftBase || rightBase;
    const baseB = rightBase || leftBase || baseA;
    result.base = { nodes: null, subpaths: null };

    // Interpolate base shape
    if (categories.shape) {
      if (baseA.subpaths && baseB.subpaths && lerpSubpaths) {
        const interpolated = lerpSubpaths(baseA.subpaths, baseB.subpaths, clampedT);
        if (interpolated) result.base.subpaths = interpolated;
      }
      if (!result.base.subpaths && baseA.nodes && baseB.nodes && lerpNodes) {
        const interpolated = lerpNodes(baseA.nodes, baseB.nodes, clampedT);
        if (interpolated) result.base.nodes = interpolated;
      }
      if (!result.base.nodes && !result.base.subpaths) {
        result.base.nodes = baseA.nodes || baseB.nodes || null;
        result.base.subpaths = baseA.subpaths || baseB.subpaths || null;
      }
    }

    // Interpolate base position
    if (baseA.position || baseB.position) {
      const bpA = baseA.position || baseB.position || { x: 0.5, y: 0.5, scale: 1, xOffset: 0, yOffset: 0 };
      const bpB = baseB.position || baseA.position || bpA;
      result.base.position = {
        x: lerp(bpA.x ?? 0.5, bpB.x ?? 0.5, easedT),
        y: lerp(bpA.y ?? 0.5, bpB.y ?? 0.5, easedT),
        scale: lerp(bpA.scale ?? 1, bpB.scale ?? 1, easedT),
        xOffset: lerp(bpA.xOffset ?? 0, bpB.xOffset ?? 0, easedT),
        yOffset: lerp(bpA.yOffset ?? 0, bpB.yOffset ?? 0, easedT),
      };
    }

    // Interpolate base shape params
    if (baseA.shapeParams || baseB.shapeParams) {
      const bsA = baseA.shapeParams || baseB.shapeParams || {};
      const bsB = baseB.shapeParams || baseA.shapeParams || bsA;
      result.base.shapeParams = {
        numSides: Math.round(lerp(bsA.numSides ?? 6, bsB.numSides ?? 6, easedT)),
        curviness: lerp(bsA.curviness ?? 1.0, bsB.curviness ?? 1.0, easedT),
        radiusFactor: lerp(bsA.radiusFactor ?? 0.125, bsB.radiusFactor ?? 0.125, easedT),
        radiusFactorX: lerp(bsA.radiusFactorX ?? bsA.radiusFactor ?? 0.125, bsB.radiusFactorX ?? bsB.radiusFactor ?? 0.125, easedT),
        radiusFactorY: lerp(bsA.radiusFactorY ?? bsA.radiusFactor ?? 0.125, bsB.radiusFactorY ?? bsB.radiusFactor ?? 0.125, easedT),
        rotation: lerp(bsA.rotation ?? 0, bsB.rotation ?? 0, easedT),
      };
    }

    // Interpolate base animation
    if (categories.animation && (baseA.animation || baseB.animation)) {
      const baA = baseA.animation || baseB.animation || {};
      const baB = baseB.animation || baseA.animation || baA;
      result.base.animation = {
        movementStyle: baA.movementStyle ?? baB.movementStyle ?? 'bounce',
        movementSpeed: lerp(baA.movementSpeed ?? 1, baB.movementSpeed ?? 1, easedT),
        movementAngle: lerp(baA.movementAngle ?? 45, baB.movementAngle ?? 45, easedT),
        scaleSpeed: lerp(baA.scaleSpeed ?? 0.05, baB.scaleSpeed ?? 0.05, easedT),
        scaleMin: lerp(baA.scaleMin ?? 0, baB.scaleMin ?? 0, easedT),
        scaleMax: lerp(baA.scaleMax ?? 1.5, baB.scaleMax ?? 1.5, easedT),
        rotation: lerp(baA.rotation ?? 0, baB.rotation ?? 0, easedT),
        radiusFactor: lerp(baA.radiusFactor ?? 0.125, baB.radiusFactor ?? 0.125, easedT),
      };
    }

    // Interpolate base colors
    if (categories.color && (Array.isArray(baseA.colors) || Array.isArray(baseB.colors))) {
      result.base.colors = lerpColorArrays(baseA.colors || [], baseB.colors || [], easedT);
    } else if (baseA.colors) {
      result.base.colors = [...baseA.colors];
    }
  }

  return result;
};

// Interpolate between two colors
function lerpColor(color1, color2, t) {
  const c1 = hexToRgb(color1 || '#ffffff');
  const c2 = hexToRgb(color2 || '#ffffff');
  return rgbToHex({
    r: c1.r + (c2.r - c1.r) * t,
    g: c1.g + (c2.g - c1.g) * t,
    b: c1.b + (c2.b - c1.b) * t,
  });
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
  const sorted = [...keyframes]
    .filter(kf => kf && Number.isFinite(Number(kf.timeSeconds)))
    .sort((a, b) => a.timeSeconds - b.timeSeconds);
  if (sorted.length === 0) return null;

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

/**
 * Evaluate a global shape track at a given time
 * Global shape tracks store snapshots of ALL layers at each keyframe
 * Returns { layers: [...interpolatedLayers] } or null if no keyframes
 * 
 * Each keyframe has structure:
 * {
 *   id, timeSeconds, enabled,
 *   layers: [{ nodes, subpaths, position, shapeParams, animation, colors }, ...]
 * }
 */
export const evaluateGlobalShapeTrackAtTime = (track, timeSeconds, lerpNodes, lerpSubpaths) => {
  if (!track || track.type !== 'globalShape') return null;

  const keyframes = track.keyframes || [];
  if (keyframes.length === 0) return null;

  // Get category toggles (default: shape + color)
  // Color is always enabled by default.
  const categories = { ...(track.categories || { shape: true, animation: false, color: true }), color: true };

  // Sort by time; ignore malformed keyframes (e.g. numeric keyframes accidentally added to a globalShape track)
  const sorted = [...keyframes]
    .filter(kf => kf && Array.isArray(kf.layers) && Number.isFinite(Number(kf.timeSeconds)))
    .sort((a, b) => a.timeSeconds - b.timeSeconds);
  if (sorted.length === 0) return null;

  const isEnabled = (kf) => kf && kf.enabled !== false;

  // Helper to build result from a single keyframe
  const buildSingleResult = (kf) => {
    if (!isEnabled(kf)) return null;
    if (!Array.isArray(kf.layers)) return null;

    return {
      layers: kf.layers.map(layerData => {
        const result = {
          nodes: categories.shape ? layerData.nodes : null,
          subpaths: categories.shape ? layerData.subpaths : null,
          position: layerData.position ? { ...layerData.position } : null,
          shapeParams: layerData.shapeParams ? { ...layerData.shapeParams } : null,
          animation: categories.animation && layerData.animation ? { ...layerData.animation } : null,
          colors: categories.color && Array.isArray(layerData.colors) ? [...layerData.colors] : null,
        };
        if (layerData.base) {
          result.base = {
            nodes: categories.shape ? layerData.base.nodes : null,
            subpaths: categories.shape ? layerData.base.subpaths : null,
            position: layerData.base.position ? { ...layerData.base.position } : result.position,
            shapeParams: layerData.base.shapeParams ? { ...layerData.base.shapeParams } : result.shapeParams,
            animation: (categories.animation && layerData.base.animation) ? { ...layerData.base.animation } : result.animation,
            colors: (categories.color && Array.isArray(layerData.base.colors)) ? [...layerData.base.colors] : result.colors,
          };
        }
        return result;
      }),
    };
  };

  // Before first keyframe
  if (timeSeconds <= sorted[0].timeSeconds) {
    return buildSingleResult(sorted[0]);
  }

  // After last keyframe
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

  // If leading keyframe is disabled, return null
  if (!isEnabled(left)) return null;

  // Calculate local t (0-1)
  const localT = (timeSeconds - left.timeSeconds) / (right.timeSeconds - left.timeSeconds);
  const clampedT = Math.max(0, Math.min(1, localT));

  // Apply easing from left keyframe
  const curveType = left.curve || 'linear';
  const tension = left.tension !== undefined ? left.tension : 0.5;
  const easedT = interpolateValue(clampedT, 0, 1, curveType, tension);

  // Interpolate each layer
  const leftLayers = left.layers || [];
  const rightLayers = right.layers || [];
  const maxLayers = Math.max(leftLayers.length, rightLayers.length);

  const interpolatedLayers = [];

  for (let i = 0; i < maxLayers; i++) {
    const layerA = leftLayers[i] || rightLayers[i] || {};
    const layerB = rightLayers[i] || leftLayers[i] || layerA;

    const result = {
      nodes: null,
      subpaths: null,
      position: null,
      shapeParams: null,
      animation: null,
      colors: null,
    };

    // Interpolate shape (nodes/subpaths) if enabled
    if (categories.shape) {
      if (layerA.subpaths && layerB.subpaths && lerpSubpaths) {
        const interpolated = lerpSubpaths(layerA.subpaths, layerB.subpaths, clampedT);
        if (interpolated) result.subpaths = interpolated;
      }

      if (!result.subpaths && layerA.nodes && layerB.nodes && lerpNodes) {
        const interpolated = lerpNodes(layerA.nodes, layerB.nodes, clampedT);
        if (interpolated) result.nodes = interpolated;
      }

      // Topology mismatch: hold previous
      if (!result.nodes && !result.subpaths) {
        result.nodes = layerA.nodes || layerB.nodes || null;
        result.subpaths = layerA.subpaths || layerB.subpaths || null;
      }
    }

    // Interpolate position
    if (layerA.position || layerB.position) {
      const posA = layerA.position || layerB.position || { x: 0.5, y: 0.5, scale: 1, xOffset: 0, yOffset: 0 };
      const posB = layerB.position || layerA.position || posA;

      result.position = {
        x: lerp(posA.x ?? 0.5, posB.x ?? 0.5, easedT),
        y: lerp(posA.y ?? 0.5, posB.y ?? 0.5, easedT),
        scale: lerp(posA.scale ?? 1, posB.scale ?? 1, easedT),
        xOffset: lerp(posA.xOffset ?? 0, posB.xOffset ?? 0, easedT),
        yOffset: lerp(posA.yOffset ?? 0, posB.yOffset ?? 0, easedT),
      };
    }

    // Interpolate shape params
    if (layerA.shapeParams || layerB.shapeParams) {
      const spA = layerA.shapeParams || layerB.shapeParams || {};
      const spB = layerB.shapeParams || layerA.shapeParams || spA;

      result.shapeParams = {
        numSides: Math.round(lerp(spA.numSides ?? 6, spB.numSides ?? 6, easedT)),
        curviness: lerp(spA.curviness ?? 1.0, spB.curviness ?? 1.0, easedT),
        radiusFactor: lerp(spA.radiusFactor ?? 0.125, spB.radiusFactor ?? 0.125, easedT),
        radiusFactorX: lerp(spA.radiusFactorX ?? spA.radiusFactor ?? 0.125, spB.radiusFactorX ?? spB.radiusFactor ?? 0.125, easedT),
        radiusFactorY: lerp(spA.radiusFactorY ?? spA.radiusFactor ?? 0.125, spB.radiusFactorY ?? spB.radiusFactor ?? 0.125, easedT),
        rotation: lerp(spA.rotation ?? 0, spB.rotation ?? 0, easedT),
      };
    }

    // Interpolate animation (always if data exists — category toggles control application, not storage)
    if (layerA.animation || layerB.animation) {
      const animA = layerA.animation || layerB.animation || {};
      const animB = layerB.animation || layerA.animation || animA;

      result.animation = {
        movementStyle: animA.movementStyle ?? animB.movementStyle ?? 'bounce',
        movementSpeed: lerp(animA.movementSpeed ?? 1, animB.movementSpeed ?? 1, easedT),
        movementAngle: lerp(animA.movementAngle ?? 45, animB.movementAngle ?? 45, easedT),
        scaleSpeed: lerp(animA.scaleSpeed ?? 0.05, animB.scaleSpeed ?? 0.05, easedT),
        scaleMin: lerp(animA.scaleMin ?? 0, animB.scaleMin ?? 0, easedT),
        scaleMax: lerp(animA.scaleMax ?? 1.5, animB.scaleMax ?? 1.5, easedT),
      };
    }

    // Interpolate colors (always if data exists)
    if (layerA.colors || layerB.colors) {
      result.colors = lerpColorArrays(layerA.colors, layerB.colors, easedT);
    }

    // Interpolate base properties if present (for runtime variation scaling)
    if (layerA.base || layerB.base) {
      const baseA = layerA.base || layerB.base || null;
      const baseB = layerB.base || layerA.base || baseA;
      if (!baseA || !baseB) {
        interpolatedLayers.push(result);
        continue;
      }

      const baseResult = {
        nodes: null,
        subpaths: null,
        position: null,
        shapeParams: null,
        animation: null,
        colors: null,
      };

      // Interpolate base shape
      if (categories.shape) {
        if (baseA.subpaths && baseB.subpaths && lerpSubpaths) {
          const interpolated = lerpSubpaths(baseA.subpaths, baseB.subpaths, clampedT);
          if (interpolated) baseResult.subpaths = interpolated;
        }
        if (!baseResult.subpaths && baseA.nodes && baseB.nodes && lerpNodes) {
          const interpolated = lerpNodes(baseA.nodes, baseB.nodes, clampedT);
          if (interpolated) baseResult.nodes = interpolated;
        }
        if (!baseResult.nodes && !baseResult.subpaths) {
          baseResult.nodes = baseA.nodes || baseB.nodes || null;
          baseResult.subpaths = baseA.subpaths || baseB.subpaths || null;
        }
      }

      // Interpolate base position
      if (baseA.position || baseB.position) {
        const pA = baseA.position || baseB.position || { x: 0.5, y: 0.5, scale: 1 };
        const pB = baseB.position || baseA.position || pA;
        baseResult.position = {
          x: lerp(pA.x ?? 0.5, pB.x ?? 0.5, easedT),
          y: lerp(pA.y ?? 0.5, pB.y ?? 0.5, easedT),
          scale: lerp(pA.scale ?? 1, pB.scale ?? 1, easedT),
          xOffset: lerp(pA.xOffset ?? 0, pB.xOffset ?? 0, easedT),
          yOffset: lerp(pA.yOffset ?? 0, pB.yOffset ?? 0, easedT),
        };
      }

      // Interpolate base shape params
      if (baseA.shapeParams || baseB.shapeParams) {
        const sA = baseA.shapeParams || baseB.shapeParams || {};
        const sB = baseB.shapeParams || baseA.shapeParams || sA;
        baseResult.shapeParams = {
          numSides: Math.round(lerp(sA.numSides ?? 6, sB.numSides ?? 6, easedT)),
          curviness: lerp(sA.curviness ?? 1.0, sB.curviness ?? 1.0, easedT),
          radiusFactor: lerp(sA.radiusFactor ?? 0.125, sB.radiusFactor ?? 0.125, easedT),
          radiusFactorX: lerp(sA.radiusFactorX ?? sA.radiusFactor ?? 0.125, sB.radiusFactorX ?? sB.radiusFactor ?? 0.125, easedT),
          radiusFactorY: lerp(sA.radiusFactorY ?? sA.radiusFactor ?? 0.125, sB.radiusFactorY ?? sB.radiusFactor ?? 0.125, easedT),
          rotation: lerp(sA.rotation ?? 0, sB.rotation ?? 0, easedT),
        };
      }

      // Interpolate base animation
      if (categories.animation && (baseA.animation || baseB.animation)) {
        const aA = baseA.animation || baseB.animation || {};
        const aB = baseB.animation || baseA.animation || aA;
        baseResult.animation = {
          movementStyle: aA.movementStyle ?? aB.movementStyle ?? 'bounce',
          movementSpeed: lerp(aA.movementSpeed ?? 1, aB.movementSpeed ?? 1, easedT),
          movementAngle: lerp(aA.movementAngle ?? 45, aB.movementAngle ?? 45, easedT),
          scaleSpeed: lerp(aA.scaleSpeed ?? 0.05, aB.scaleSpeed ?? 0.05, easedT),
          scaleMin: lerp(aA.scaleMin ?? 0, aB.scaleMin ?? 0, easedT),
          scaleMax: lerp(aA.scaleMax ?? 1.5, aB.scaleMax ?? 1.5, easedT),
        };
      }

      // Interpolate base colors
      if (categories.color && (baseA.colors || baseB.colors)) {
        // Fix: Check property existence before access to avoid errors
        const cA = baseA.colors || [];
        const cB = baseB.colors || [];
        baseResult.colors = lerpColorArrays(cA, cB, easedT);
      }

      result.base = baseResult;
    }

    interpolatedLayers.push(result);
  }

  return { layers: interpolatedLayers };
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
