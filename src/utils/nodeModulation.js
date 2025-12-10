/**
 * Node modulation utilities for shape track keyframes.
 * 
 * Applies time-varying offsets to node positions for effects like
 * radial breathing, jitter, etc.
 */

import { createSeededRandom } from './random.js';

/**
 * Apply radial sine modulation to nodes.
 * Nodes move in/out radially based on a sine wave.
 * 
 * @param {Array<{x: number, y: number}>} nodes - The nodes to modulate
 * @param {object} config - Modulation configuration
 * @param {number} config.amount - Modulation amplitude (0-1, fraction of radius)
 * @param {number} config.phase - Phase offset in radians (0 to 2π)
 * @param {string} config.mask - Which nodes to affect: 'all', 'odd', 'even', 'randomHalf'
 * @param {number} config.seed - Random seed for stable per-node phases
 * @param {number} config.phaseSpread - How much phase varies between nodes (0-1)
 * @returns {Array<{x: number, y: number}>} Modulated nodes
 */
export function applyRadialSineModulation(nodes, config = {}) {
  if (!Array.isArray(nodes) || nodes.length === 0) return nodes;

  const {
    amount = 0.2,
    phase = 0,
    mask = 'all',
    seed = 12345,
    phaseSpread = 0.5,
  } = config;

  if (amount <= 0) return nodes;

  const rng = createSeededRandom(seed);
  
  // Pre-compute per-node random phases for consistency
  const nodePhases = nodes.map((_, i) => {
    const basePhase = (i / nodes.length) * Math.PI * 2 * phaseSpread;
    const randomOffset = rng() * Math.PI * 2 * 0.3; // Small random offset
    return basePhase + randomOffset;
  });

  // Determine which nodes are affected based on mask
  const affectedNodes = new Set();
  if (mask === 'all') {
    nodes.forEach((_, i) => affectedNodes.add(i));
  } else if (mask === 'odd') {
    nodes.forEach((_, i) => { if (i % 2 === 1) affectedNodes.add(i); });
  } else if (mask === 'even') {
    nodes.forEach((_, i) => { if (i % 2 === 0) affectedNodes.add(i); });
  } else if (mask === 'randomHalf') {
    // Use seed to deterministically select half the nodes
    const halfRng = createSeededRandom(seed + 999);
    const indices = nodes.map((_, i) => i);
    // Shuffle and take half
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(halfRng() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    const halfCount = Math.ceil(nodes.length / 2);
    indices.slice(0, halfCount).forEach(i => affectedNodes.add(i));
  }

  return nodes.map((node, i) => {
    if (!affectedNodes.has(i)) {
      return { ...node };
    }

    const x = Number(node.x) || 0;
    const y = Number(node.y) || 0;
    
    // Convert to polar
    const r = Math.hypot(x, y);
    const theta = Math.atan2(y, x);
    
    // Apply sine modulation to radius
    const nodePhase = nodePhases[i];
    const wave = Math.sin(phase + nodePhase);
    const modulatedR = r * (1 + amount * wave);
    
    // Convert back to cartesian
    const newX = modulatedR * Math.cos(theta);
    const newY = modulatedR * Math.sin(theta);

    const result = {
      ...node,
      x: newX,
      y: newY,
    };

    // Also modulate control points if they exist (for curved nodes)
    if (node.cp1x !== undefined) {
      const cp1r = Math.hypot(node.cp1x, node.cp1y || 0);
      const cp1theta = Math.atan2(node.cp1y || 0, node.cp1x);
      const cp1ModR = cp1r * (1 + amount * wave);
      result.cp1x = cp1ModR * Math.cos(cp1theta);
      result.cp1y = cp1ModR * Math.sin(cp1theta);
    }
    if (node.cp2x !== undefined) {
      const cp2r = Math.hypot(node.cp2x, node.cp2y || 0);
      const cp2theta = Math.atan2(node.cp2y || 0, node.cp2x);
      const cp2ModR = cp2r * (1 + amount * wave);
      result.cp2x = cp2ModR * Math.cos(cp2theta);
      result.cp2y = cp2ModR * Math.sin(cp2theta);
    }

    return result;
  });
}

/**
 * Apply node modulation to a set of nodes based on config.
 * This is the main entry point for node modulation.
 * 
 * @param {Array<{x: number, y: number}>} nodes - The nodes to modulate
 * @param {object} config - Modulation configuration
 * @param {string} config.mode - Modulation mode: 'sineRadial', 'jitter', 'none'
 * @param {number} config.amount - Modulation amplitude (0-1)
 * @param {number} config.phase - Phase for time-based modulation (radians)
 * @param {string} config.mask - Which nodes to affect
 * @param {number} config.seed - Random seed
 * @param {number} config.phaseSpread - Phase spread between nodes
 * @returns {Array<{x: number, y: number}>} Modulated nodes
 */
export function applyNodeModulation(nodes, config = {}) {
  if (!Array.isArray(nodes) || nodes.length === 0) return nodes;
  
  const { mode = 'sineRadial' } = config;
  
  switch (mode) {
    case 'sineRadial':
      return applyRadialSineModulation(nodes, config);
    case 'jitter':
      return applyJitterModulation(nodes, config);
    case 'none':
    default:
      return nodes;
  }
}

/**
 * Apply random jitter modulation to nodes.
 * Each node gets a small random offset based on seed and phase.
 * 
 * @param {Array<{x: number, y: number}>} nodes - The nodes to modulate
 * @param {object} config - Modulation configuration
 * @param {number} config.amount - Jitter amplitude (0-1)
 * @param {number} config.phase - Phase for time-varying jitter
 * @param {string} config.mask - Which nodes to affect
 * @param {number} config.seed - Random seed
 * @returns {Array<{x: number, y: number}>} Modulated nodes
 */
export function applyJitterModulation(nodes, config = {}) {
  if (!Array.isArray(nodes) || nodes.length === 0) return nodes;

  const {
    amount = 0.1,
    phase = 0,
    mask = 'all',
    seed = 12345,
  } = config;

  if (amount <= 0) return nodes;

  // Create RNG based on seed + phase for time-varying but stable jitter
  const phaseSeed = Math.floor(phase * 1000) % 2147483647;
  const rng = createSeededRandom((seed + phaseSeed) % 2147483647 || 1);

  // Determine affected nodes
  const affectedNodes = new Set();
  if (mask === 'all') {
    nodes.forEach((_, i) => affectedNodes.add(i));
  } else if (mask === 'odd') {
    nodes.forEach((_, i) => { if (i % 2 === 1) affectedNodes.add(i); });
  } else if (mask === 'even') {
    nodes.forEach((_, i) => { if (i % 2 === 0) affectedNodes.add(i); });
  } else if (mask === 'randomHalf') {
    const halfRng = createSeededRandom(seed + 999);
    const indices = nodes.map((_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(halfRng() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    const halfCount = Math.ceil(nodes.length / 2);
    indices.slice(0, halfCount).forEach(i => affectedNodes.add(i));
  }

  return nodes.map((node, i) => {
    if (!affectedNodes.has(i)) {
      return { ...node };
    }

    const x = Number(node.x) || 0;
    const y = Number(node.y) || 0;
    
    // Apply random offset
    const jitterX = (rng() * 2 - 1) * amount;
    const jitterY = (rng() * 2 - 1) * amount;
    
    return {
      ...node,
      x: Math.max(-1.5, Math.min(1.5, x + jitterX)),
      y: Math.max(-1.5, Math.min(1.5, y + jitterY)),
    };
  });
}

/**
 * Apply node modulation to subpaths (array of node arrays).
 * 
 * @param {Array<Array<{x: number, y: number}>>} subpaths - The subpaths to modulate
 * @param {object} config - Modulation configuration
 * @returns {Array<Array<{x: number, y: number}>>} Modulated subpaths
 */
export function applyNodeModulationToSubpaths(subpaths, config = {}) {
  if (!Array.isArray(subpaths)) return subpaths;
  
  return subpaths.map((subpath, subpathIndex) => {
    // Use a different seed offset for each subpath for variety
    const subpathConfig = {
      ...config,
      seed: (config.seed || 12345) + subpathIndex * 7919,
    };
    return applyNodeModulation(subpath, subpathConfig);
  });
}

/**
 * Generate a phase value for a keyframe based on its index in a sequence.
 * This creates a smooth progression of phases across multiple keyframes.
 * 
 * @param {number} index - Keyframe index (0-based)
 * @param {number} total - Total number of keyframes being generated
 * @param {number} cycles - Number of full sine cycles across all keyframes
 * @returns {number} Phase in radians
 */
export function generateKeyframePhase(index, total, cycles = 1) {
  if (total <= 1) return 0;
  return (index / (total - 1)) * Math.PI * 2 * cycles;
}

/**
 * Default node modulation config for keyframe generation.
 */
export const DEFAULT_NODE_MOD_CONFIG = {
  enabled: false,
  mode: 'sineRadial',
  amount: 0.15,
  mask: 'all',
  phaseSpread: 0.5,
  cycles: 1, // Number of full sine cycles across generated keyframes
};
