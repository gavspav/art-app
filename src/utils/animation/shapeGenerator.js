/**
 * Shape generation utilities for canvas animation
 * Contains the core oil shape generation algorithm from the original implementation
 */

import { createSeededRandom } from '../math/seededRandom.js';

/**
 * Generate layer parameters for oil shape animation
 * @param {number} numLayers - Number of layers to generate
 * @param {number} variation - Variation amount for randomization
 * @param {number} seed - Seed for deterministic randomization
 * @returns {Array} Array of layer parameter objects
 */
export const generateLayerParams = (numLayers, variation, seed) => {
  const seededRandom = createSeededRandom(seed);
  const clamp = (num, min, max) => Math.max(min, Math.min(max, num));

  return Array.from({ length: numLayers }).map((_, index) => {
    const centerBase = {
      x: clamp(seededRandom() * 0.4 + 0.3, 0.3, 0.7),
      y: clamp(seededRandom() * 0.4 + 0.3, 0.3, 0.7)
    };

    // Make variation effect more pronounced
    const layerVariationFactor = variation * (index + 1) / numLayers;

    return {
      freq1: 2 + (seededRandom() - 0.5) * 5 * variation,
      freq2: 3 + (seededRandom() - 0.5) * 5 * variation,
      freq3: 4 + (seededRandom() - 0.5) * 50 * variation,
      baseRadiusFactor: 0.4 + seededRandom() * 0.3,
      centerBaseX: centerBase.x,
      centerBaseY: centerBase.y,
      centerOffsetX: clamp((seededRandom() - 0.5) * 0.2 * variation, -0.2, 0.2),
      centerOffsetY: clamp((seededRandom() - 0.5) * 0.2 * variation, -0.2, 0.2),
      moveSpeedX: 0.3 + seededRandom() * 0.5 * (1 + layerVariationFactor),
      moveSpeedY: 0.3 + seededRandom() * 0.5 * (1 + layerVariationFactor),
      radiusBump: seededRandom() * 0.3 * (1 + variation)
    };
  });
};

/**
 * Generate points for an oil shape using the original algorithm
 * @param {Object} params - Shape generation parameters
 * @param {number} params.time - Current animation time
 * @param {Object} params.layerParam - Layer-specific parameters
 * @param {Object} params.shapeParams - Shape configuration
 * @param {Object} params.canvasSize - Canvas dimensions
 * @returns {Array} Array of {x, y} points defining the shape
 */
export const generateOilShapePoints = ({ time, layerParam, shapeParams, canvasSize }) => {
  if (!layerParam) return [];

  const {
    freq1, freq2, freq3,
    centerBaseX, centerBaseY,
    centerOffsetX, centerOffsetY,
    moveSpeedX, moveSpeedY,
    radiusBump, baseRadiusFactor
  } = layerParam;

  const {
    numSides,
    curviness,
    noiseAmount,
    guideWidth,
    guideHeight,
    variation
  } = shapeParams;

  const { width, height } = canvasSize;

  // Calculate dynamic center position
  const centerX = (width / 2) * centerBaseX +
    Math.sin(time * moveSpeedX) * 0.1 * width * variation +
    centerOffsetX * width;
  const centerY = (height / 2) * centerBaseY +
    Math.cos(time * moveSpeedY) * 0.1 * height * variation +
    centerOffsetY * height;

  const points = [];

  for (let i = 0; i < numSides; i++) {
    const angle = (i / numSides) * Math.PI * 2;
    const symmetryFactor = curviness;
    const phase = (1 - symmetryFactor) * (i % 2) * Math.PI;

    // Multi-layered noise generation (the core algorithm)
    const n1 = Math.sin(angle * freq1 + time + phase) * Math.sin(time * 0.8 * symmetryFactor);
    const n2 = Math.cos(angle * freq2 - time * 0.5 + phase) * Math.cos(time * 0.3 * symmetryFactor);
    const n3 = Math.sin(angle * freq3 + time * 1.5 + phase) * Math.sin(time * 0.6 * symmetryFactor);

    // Calculate base radius with constraints
    const baseRadiusX = Math.min((guideWidth + radiusBump * 20) * baseRadiusFactor, width * 0.4);
    const baseRadiusY = Math.min((guideHeight + radiusBump * 20) * baseRadiusFactor, height * 0.4);

    // Apply noise to create organic shape
    const offsetX = (n1 * 20 + n2 * 15 + n3 * 10) * noiseAmount * symmetryFactor;
    const offsetY = (n1 * 20 + n2 * 15 + n3 * 10) * noiseAmount * symmetryFactor;

    const rx = baseRadiusX + offsetX;
    const ry = baseRadiusY + offsetY;

    const x = centerX + Math.cos(angle) * rx;
    const y = centerY + Math.sin(angle) * ry;

    points.push({ x, y });
  }

  return points;
};

/**
 * Create a smooth path from points using quadratic curves
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Array} points - Array of {x, y} points
 */
export const createSmoothPath = (ctx, points) => {
  if (points.length < 3) return;

  ctx.beginPath();

  // Start from midpoint between last and first point
  const last = points[points.length - 1];
  const first = points[0];
  ctx.moveTo((last.x + first.x) / 2, (last.y + first.y) / 2);

  // Create smooth curves between points
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    const midX = (current.x + next.x) / 2;
    const midY = (current.y + next.y) / 2;
    ctx.quadraticCurveTo(current.x, current.y, midX, midY);
  }

  ctx.closePath();
};