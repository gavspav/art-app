/**
 * Variation-based keyframe generation utilities
 * 
 * Generates varied shape keyframes using the existing layer variation system.
 * Supports single keyframe generation, batch generation, and reroll functionality.
 */

import { buildVariedLayerFrom } from './layerVariation.js';

/**
 * Generate a varied layer snapshot from a base layer.
 * 
 * @param {object} baseLayer - The base layer to vary from
 * @param {object} options - Variation options
 * @param {number} options.seed - Random seed for reproducibility
 * @param {object} options.variationWeights - Override variation weights { shape, anim, color, position, scale }
 * @param {boolean} options.jitterNodes - Whether to jitter node positions (default: true if shape variation > 0)
 * @param {string[]} options.affectCategories - Which categories to vary: ['shape', 'anim', 'color', 'position', 'scale']
 * @returns {object} Varied layer with variation metadata
 */
export function generateVariedLayer(baseLayer, options = {}) {
  const {
    seed = Date.now(),
    variationWeights,
    affectCategories = ['shape', 'anim', 'color', 'position'],
    isParamRandomizable,
    constrainColorsToPalette = false,
    paletteColors = null,
  } = options;

  // Build variation weights from layer defaults or overrides
  const weights = variationWeights || {
    shape: baseLayer.variationShape ?? baseLayer.variation ?? 0.2,
    anim: baseLayer.variationAnim ?? baseLayer.variation ?? 0.2,
    color: baseLayer.variationColor ?? baseLayer.variation ?? 0.2,
    position: baseLayer.variationPosition ?? baseLayer.variation ?? 0.2,
    scale: baseLayer.variationScale ?? 0,
  };

  // Generate varied layer
  const variedLayer = buildVariedLayerFrom(
    baseLayer,
    1, // nameIndex (not used for naming here)
    weights,
    {
      randomSeed: seed,
      affectCategories,
      preserveSeeds: false,
      isParamRandomizable,
      constrainColorsToPalette: !!constrainColorsToPalette,
      paletteColors,
    }
  );

  // Attach variation metadata for reroll support
  variedLayer._variationMeta = {
    baseSeed: seed,
    weights: { ...weights },
    affectCategories: [...affectCategories],
    timestamp: Date.now(),
  };

  return variedLayer;
}

/**
 * Extract shape keyframe data from a varied layer.
 * Returns the data structure expected by addShapeKeyframe.
 * 
 * @param {object} layer - The layer to extract keyframe data from
 * @param {object} categories - Which categories to include { shape: true, animation: false, color: false }
 * @returns {object} { nodes, subpaths, extras }
 */
export function extractKeyframeData(layer, categories = { shape: true, animation: false, color: false }) {
  // Deep clone nodes and subpaths
  const nodes = Array.isArray(layer.nodes) ? JSON.parse(JSON.stringify(layer.nodes)) : null;
  const subpaths = Array.isArray(layer.subpaths) ? JSON.parse(JSON.stringify(layer.subpaths)) : null;

  // Build extras based on categories
  const extras = {};

  // Position data (always included for shape tracks)
  extras.position = {
    x: layer.position?.x ?? 0.5,
    y: layer.position?.y ?? 0.5,
    scale: layer.position?.scale ?? 1,
    xOffset: layer.xOffset ?? 0,
    yOffset: layer.yOffset ?? 0,
  };

  // Shape params (always included)
  extras.shapeParams = {
    numSides: layer.numSides ?? 6,
    curviness: layer.curviness ?? 1.0,
    radiusFactor: layer.radiusFactor ?? 0.125,
    radiusFactorX: layer.radiusFactorX ?? layer.radiusFactor ?? 0.125,
    radiusFactorY: layer.radiusFactorY ?? layer.radiusFactor ?? 0.125,
    rotation: layer.rotation ?? 0,
  };

  // Animation params (if enabled)
  if (categories.animation) {
    extras.animation = {
      movementStyle: layer.movementStyle ?? 'bounce',
      movementSpeed: layer.movementSpeed ?? 1,
      movementAngle: layer.movementAngle ?? 45,
      scaleSpeed: layer.scaleSpeed ?? 0.05,
      scaleMin: layer.scaleMin ?? 0,
      scaleMax: layer.scaleMax ?? 1.5,
    };
  }

  // Always capture colors so keyframes can later tween correctly when the track's
  // "Color" category is enabled (the toggle controls playback, not what is stored).
  if (Array.isArray(layer.colors)) {
    extras.colors = [...layer.colors];
  } else {
    extras.colors = ['#0000FF'];
  }

  // Variation metadata for reroll
  if (layer._variationMeta) {
    extras.variation = { ...layer._variationMeta };
  }

  return { nodes, subpaths, extras };
}

/**
 * Generate evenly spaced times between two keyframe times.
 * 
 * @param {number} startTime - Start time in seconds
 * @param {number} endTime - End time in seconds
 * @param {number} count - Number of keyframes to generate
 * @returns {number[]} Array of times
 */
export function generateEvenlySpacedTimes(startTime, endTime, count) {
  if (count <= 0) return [];
  if (startTime >= endTime) return [];
  
  const times = [];
  for (let i = 0; i < count; i++) {
    // Place keyframes evenly between start and end (not at start/end)
    const t = startTime + ((i + 1) / (count + 1)) * (endTime - startTime);
    times.push(t);
  }
  return times;
}

/**
 * Generate random times within a range.
 * 
 * @param {number} startTime - Start time in seconds
 * @param {number} endTime - End time in seconds
 * @param {number} count - Number of times to generate
 * @param {number} seed - Random seed
 * @returns {number[]} Array of times, sorted
 */
export function generateRandomTimes(startTime, endTime, count, seed = Date.now()) {
  if (count <= 0) return [];
  if (startTime >= endTime) return [];
  
  // Simple seeded random
  let s = seed;
  const random = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  
  const times = [];
  const duration = endTime - startTime;
  
  for (let i = 0; i < count; i++) {
    times.push(startTime + random() * duration);
  }
  
  return times.sort((a, b) => a - b);
}

/**
 * Select top N transient times from a list.
 * 
 * @param {Array<{time: number, strength: number}>} transients - Transient markers
 * @param {number} count - Number of times to select
 * @param {number} startTime - Optional start time filter
 * @param {number} endTime - Optional end time filter
 * @returns {number[]} Array of times, sorted
 */
export function selectTopTransientTimes(transients, count, startTime = 0, endTime = Infinity) {
  if (!Array.isArray(transients) || transients.length === 0 || count <= 0) {
    return [];
  }
  
  // Filter to time range
  const filtered = transients.filter(t => t.time >= startTime && t.time <= endTime);
  
  // Sort by strength (descending) and take top N
  const sorted = [...filtered].sort((a, b) => b.strength - a.strength);
  const topN = sorted.slice(0, count);
  
  // Return times sorted chronologically
  return topN.map(t => t.time).sort((a, b) => a - b);
}

/**
 * Generate a new seed for rerolling a variation.
 * 
 * @param {number} previousSeed - The previous seed
 * @returns {number} A new seed
 */
export function generateRerollSeed(previousSeed = 0) {
  // Use current time + previous seed to ensure uniqueness
  return (Date.now() + previousSeed * 16807) % 2147483647;
}
