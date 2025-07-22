/**
 * Canvas pixel ratio utilities
 * Handles high-DPI display scaling for crisp canvas rendering
 */

/**
 * Gets the pixel ratio for a canvas context
 * Accounts for device pixel ratio and backing store ratio for optimal rendering
 * @param {CanvasRenderingContext2D} context - Canvas 2D rendering context
 * @returns {number} Pixel ratio for scaling canvas operations
 */
export const getPixelRatio = (context) => {
  const devicePixelRatio = window.devicePixelRatio || 1;
  const backingStoreRatio = 
    context.webkitBackingStorePixelRatio ||
    context.mozBackingStorePixelRatio ||
    context.msBackingStorePixelRatio ||
    context.oBackingStorePixelRatio ||
    context.backingStorePixelRatio || 1;
  
  return devicePixelRatio / backingStoreRatio;
};

/**
 * Sets up canvas for high-DPI rendering
 * @param {HTMLCanvasElement} canvas - Canvas element
 * @param {CanvasRenderingContext2D} context - Canvas 2D rendering context
 * @param {number} width - Logical width
 * @param {number} height - Logical height
 * @returns {number} Applied pixel ratio
 */
export const setupHighDPICanvas = (canvas, context, width, height) => {
  const ratio = getPixelRatio(context);
  
  // Set actual canvas size in memory (scaled up for high-DPI)
  canvas.width = Math.floor(width * ratio);
  canvas.height = Math.floor(height * ratio);
  
  // Set display size (CSS pixels)
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  
  // Scale the drawing context so everything draws at the correct size
  context.scale(ratio, ratio);
  
  return ratio;
};