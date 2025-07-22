/**
 * Canvas rendering utilities for animation
 * Handles all canvas drawing operations and rendering logic
 */

import { generateOilShapePoints, createSmoothPath } from './shapeGenerator.js';

/**
 * Setup canvas with proper pixel ratio and dimensions
 * @param {HTMLCanvasElement} canvas - Canvas element
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} pixelRatio - Device pixel ratio
 */
export const setupCanvas = (canvas, ctx, pixelRatio = 1) => {
  const rect = canvas.getBoundingClientRect();
  const width = rect.width * pixelRatio;
  const height = rect.height * pixelRatio;

  canvas.width = width;
  canvas.height = height;
  
  ctx.scale(pixelRatio, pixelRatio);
  
  return { width: rect.width, height: rect.height };
};

/**
 * Clear canvas with background color
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 * @param {string} backgroundColor - Background color
 */
export const clearCanvas = (ctx, width, height, backgroundColor) => {
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);
};

/**
 * Create radial gradient for shape filling
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} centerX - Gradient center X
 * @param {number} centerY - Gradient center Y
 * @param {number} radius - Gradient radius
 * @param {string} color - Base color
 * @param {number} opacity - Opacity value (0-1)
 * @param {number} layerIndex - Layer index for radius variation
 * @returns {CanvasGradient} Radial gradient
 */
export const createRadialGradient = (ctx, centerX, centerY, radius, color, opacity, layerIndex = 0) => {
  const gradient = ctx.createRadialGradient(
    centerX,
    centerY,
    0,
    centerX,
    centerY,
    radius + layerIndex * 50
  );

  // Convert opacity to hex alpha
  const alphaHex = Math.floor(opacity * 255).toString(16).padStart(2, "0");
  const alphaHex2 = Math.floor(opacity * 180).toString(16).padStart(2, "0");

  gradient.addColorStop(0, color + alphaHex);
  gradient.addColorStop(1, color + alphaHex2);

  return gradient;
};

/**
 * Render a single oil shape layer
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} params - Rendering parameters
 */
export const renderOilShape = (ctx, {
  time,
  layerParam,
  shapeParams,
  canvasSize,
  color,
  opacity,
  blendMode,
  layerIndex = 0
}) => {
  // Generate shape points
  const points = generateOilShapePoints({
    time,
    layerParam,
    shapeParams,
    canvasSize
  });

  if (points.length === 0) return;

  // Set blend mode
  ctx.globalCompositeOperation = layerIndex === 0 ? "source-over" : blendMode;

  // Create and draw the shape
  createSmoothPath(ctx, points);

  // Create gradient fill
  const gradient = createRadialGradient(
    ctx,
    canvasSize.width / 2,
    canvasSize.height / 2,
    200,
    color,
    opacity,
    layerIndex
  );

  ctx.fillStyle = gradient;
  ctx.fill();
};

// Performance optimization: Cache for reusable objects
const renderCache = {
  lastCanvasSize: { width: 0, height: 0 },
  gradientCache: new Map(),
  pathCache: new Map()
};

/**
 * Clear gradient cache when canvas size changes
 * @param {Object} canvasSize - Current canvas size
 */
const clearCacheIfNeeded = (canvasSize) => {
  if (renderCache.lastCanvasSize.width !== canvasSize.width || 
      renderCache.lastCanvasSize.height !== canvasSize.height) {
    renderCache.gradientCache.clear();
    renderCache.pathCache.clear();
    renderCache.lastCanvasSize = { ...canvasSize };
  }
};

/**
 * Render complete frame with all layers (optimized)
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} frameParams - Frame rendering parameters
 */
export const renderFrame = (ctx, {
  time,
  layerParams,
  shapeParams,
  canvasSize,
  colors,
  globalOpacity,
  blendMode,
  backgroundColor
}) => {
  // Performance optimization: Clear cache if canvas size changed
  clearCacheIfNeeded(canvasSize);

  // Clear canvas
  clearCanvas(ctx, canvasSize.width, canvasSize.height, backgroundColor);

  // Performance optimization: Save context state once
  ctx.save();

  // Set initial rendering state
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "blur(1px)";

  // Render each layer with optimizations
  for (let i = 0; i < layerParams.length; i++) {
    const color = colors[i % colors.length];
    
    renderOilShape(ctx, {
      time,
      layerParam: layerParams[i],
      shapeParams,
      canvasSize,
      color,
      opacity: globalOpacity,
      blendMode,
      layerIndex: i
    });
  }

  // Performance optimization: Restore context state once
  ctx.restore();
};