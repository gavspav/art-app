/**
 * High-resolution image export utility for print-on-demand
 * Renders artwork at target print resolution (300 DPI)
 */

import { buildSmoothPath, deriveLayerPoints } from './shapeMath.js';
import { getPixelRatio } from './pixelRatio.js';

// Print size presets (width x height in inches)
export const PRINT_SIZES = {
  SMALL: { name: '12x16"', width: 12, height: 16, dpi: 300 },
  MEDIUM: { name: '18x24"', width: 18, height: 24, dpi: 300 },
  LARGE: { name: '24x36"', width: 24, height: 36, dpi: 300 },
  XLARGE: { name: '30x40"', width: 30, height: 40, dpi: 300 },
};

// Calculate pixel dimensions for a print size
export const calculateDimensions = (printSize) => {
  const { width, height, dpi } = printSize;
  return {
    width: Math.round(width * dpi),
    height: Math.round(height * dpi),
  };
};

// Hex to RGB conversion
const hexToRgb = (hex) => {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return { r: 128, g: 128, b: 128 };
  const bigint = Number.parseInt(normalized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return { r, g, b };
};

// RGB to Hex conversion
const rgbToHex = ({ r, g, b }) => {
  const clamp = (value) => Math.max(0, Math.min(255, Math.round(value)));
  return `#${[clamp(r), clamp(g), clamp(b)]
    .map((component) => component.toString(16).padStart(2, '0'))
    .join('')}`;
};

// Sample color from palette
const samplePaletteColor = (palette, position) => {
  if (!Array.isArray(palette) || palette.length === 0) return '#ffffff';
  if (palette.length === 1) return palette[0];

  const normalized = ((position % 1) + 1) % 1;
  const scaledIndex = normalized * (palette.length - 1);
  const leftIndex = Math.floor(scaledIndex);
  const rightIndex = Math.min(palette.length - 1, Math.ceil(scaledIndex));
  const fraction = scaledIndex - leftIndex;

  if (leftIndex === rightIndex || fraction <= 0) {
    return palette[leftIndex];
  }

  const a = hexToRgb(palette[leftIndex]);
  const b = hexToRgb(palette[rightIndex]);
  const mixed = {
    r: a.r + (b.r - a.r) * fraction,
    g: a.g + (b.g - a.g) * fraction,
    b: a.b + (b.b - a.b) * fraction,
  };
  return rgbToHex(mixed);
};

// Tint color for layer variation
const tintColor = (baseHex, variation, layerIndex) => {
  const clamp01 = (value) => Math.max(0, Math.min(1, value));
  const amount = clamp01(variation * layerIndex);
  if (amount <= 0) return baseHex;
  const base = hexToRgb(baseHex);
  const mixed = {
    r: base.r + (255 - base.r) * amount,
    g: base.g + (255 - base.g) * amount,
    b: base.b + (255 - base.b) * amount,
  };
  return rgbToHex(mixed);
};

/**
 * Export artwork as high-resolution image
 * @param {Object} artState - Complete art state from useMobileArtState
 * @param {Object} printSize - Print size preset from PRINT_SIZES
 * @param {Function} onProgress - Progress callback (0-1)
 * @returns {Promise<Blob>} PNG image blob
 */
export const exportHighResImage = async (artState, printSize, optionsOrProgress = null, progressArg = null) => {
  let options = optionsOrProgress;
  let onProgress = progressArg;

  if (typeof optionsOrProgress === 'function' || optionsOrProgress === null) {
    onProgress = optionsOrProgress;
    options = {};
  }

  if (onProgress === null) {
    onProgress = null;
  }

  const { preset } = options || {};

  const {
    nodes,
    curviness,
    size,
    layers,
    layerOverrides,
    variationPosition,
    variationShape,
    variationColor,
    backgroundColor,
    foregroundColor,
    blendMode,
    paletteIndex,
    layerColors,
  } = artState;

  // Calculate target dimensions (base print size)
  const dimensions = calculateDimensions(printSize);
  let { width: baseWidth, height: baseHeight } = dimensions;

  if (preset?.maxEdge) {
    const currentMax = Math.max(baseWidth, baseHeight);
    if (currentMax > 0) {
      const scale = preset.maxEdge / currentMax;
      baseWidth = Math.round(baseWidth * scale);
      baseHeight = Math.round(baseHeight * scale);
    }
  } else if (preset?.scale && Number.isFinite(preset.scale)) {
    const scale = Math.max(0.1, preset.scale);
    baseWidth = Math.round(baseWidth * scale);
    baseHeight = Math.round(baseHeight * scale);
  }

  const targetWidth = Math.max(1, baseWidth);
  const targetHeight = Math.max(1, baseHeight);

  const useDevicePixelRatio = !preset?.maxEdge;
  const devicePixelRatio = useDevicePixelRatio ? getPixelRatio() : 1;
  const pixelRatio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const canvasWidth = Math.max(1, Math.round(targetWidth * pixelRatio));
  const canvasHeight = Math.max(1, Math.round(targetHeight * pixelRatio));

  if (onProgress) onProgress(0.1);

  // Create off-screen canvas
  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) {
    throw new Error('Failed to create canvas context');
  }

  if (pixelRatio !== 1) {
    ctx.scale(pixelRatio, pixelRatio);
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Fill background
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, targetWidth, targetHeight);

  if (onProgress) onProgress(0.2);

  // Match TouchCanvas scaling logic
  const canvasAspect = targetWidth / targetHeight;
  const base = 100;
  const aspectScaleX = canvasAspect >= 1 ? canvasAspect : 1;
  const aspectScaleY = canvasAspect >= 1 ? 1 : 1 / canvasAspect;
  const fillScale = Math.max(aspectScaleX, aspectScaleY);
  const compensateX = fillScale / aspectScaleX;
  const compensateY = fillScale / aspectScaleY;

  const viewHalfWidth = base * (canvasAspect >= 1 ? canvasAspect : 1);
  const viewHalfHeight = base * (canvasAspect >= 1 ? 1 : 1 / canvasAspect);
  const pixelScaleX = targetWidth / (viewHalfWidth * 2);
  const pixelScaleY = targetHeight / (viewHalfHeight * 2);

  // Generate layer node sets (same logic as TouchCanvas)
  const layerNodeSets = [];
  for (let i = 0; i < layers; i++) {
    const override = layerOverrides[i];
    const baseNodes = override || nodes;
    const derived = deriveLayerPoints(baseNodes, {
      size,
      variationShape,
      variationPosition,
      layerIndex: i,
    });
    layerNodeSets.push(derived);
  }

  if (onProgress) onProgress(0.3);

  // Render each layer
  const clamp01 = (value) => Math.max(0, Math.min(1, value));
  
  for (let index = 0; index < layers; index++) {
    const layerNodes = layerNodeSets[index] || [];
    
    // Apply compensation and scaling
    const compensatedPoints = layerNodes.map((point) => ({
      x: point.x * compensateX,
      y: point.y * compensateY,
    }));
    const scaledPoints = compensatedPoints.map((point) => ({
      x: point.x * aspectScaleX,
      y: point.y * aspectScaleY,
    }));

    const pixelPoints = scaledPoints.map((point) => ({
      x: point.x * pixelScaleX + targetWidth / 2,
      y: point.y * pixelScaleY + targetHeight / 2,
    }));

    // Determine color
    let color;
    if (paletteIndex !== null && Array.isArray(layerColors) && layerColors.length > 0) {
      const layersCount = Math.max(1, layers);
      const basePosition = layersCount === 1 ? 0 : Math.min(1, index / (layersCount - 1));
      const normalizedVariation = clamp01(variationColor / 0.9);
      const samplePosition = basePosition + normalizedVariation;
      color = samplePaletteColor(layerColors, samplePosition);
    } else {
      color = tintColor(foregroundColor, variationColor, index);
    }

    // Calculate opacity
    const opacity = clamp01(1 - index / Math.max(1, layers + 1));

    // Build path
    const path = buildSmoothPath(pixelPoints, curviness);

    // Draw shape
    ctx.save();
    ctx.globalCompositeOperation = blendMode || 'normal';
    ctx.globalAlpha = opacity;
    ctx.fillStyle = color;
    ctx.beginPath();

    // Parse and draw path
    const commands = path.split(/(?=[MLQC])/);
    for (const cmd of commands) {
      const type = cmd[0];
      const coords = cmd
        .slice(1)
        .trim()
        .split(/[\s,]+/)
        .map(Number);

      if (type === 'M' && coords.length >= 2) {
        ctx.moveTo(coords[0], coords[1]);
      } else if (type === 'L' && coords.length >= 2) {
        ctx.lineTo(coords[0], coords[1]);
      } else if (type === 'C' && coords.length >= 6) {
        ctx.bezierCurveTo(coords[0], coords[1], coords[2], coords[3], coords[4], coords[5]);
      } else if (type === 'Q' && coords.length >= 4) {
        ctx.quadraticCurveTo(coords[0], coords[1], coords[2], coords[3]);
      }
    }

    ctx.closePath();
    ctx.fill();
    ctx.restore();

    if (onProgress) {
      const progress = 0.3 + (0.6 * (index + 1)) / layers;
      onProgress(progress);
    }
  }

  if (onProgress) onProgress(0.95);

  // Convert to blob
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          if (onProgress) onProgress(1.0);
          resolve(blob);
        } else {
          reject(new Error('Failed to create image blob'));
        }
      },
      'image/png',
      1.0
    );
  });
};

/**
 * Download image directly to user's device
 * @param {Blob} blob - Image blob
 * @param {string} filename - Filename for download
 */
export const downloadImage = (blob, filename = 'artwork.png') => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
