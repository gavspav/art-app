/**
 * Default values for the art application
 * These values are used when initializing the application state
 */

export const DEFAULTS = {
  speed: 0.002,
  isFrozen: false,
  variation: 0.2,
  numLayers: 1,
  colors: [
    "#1E3296", "#502CB4", "#6450C8", "#3C64B4",
    "#6478DC", "#4A0080", "#6600AA", "#8200D4"
  ],
  selectedColor: "#1E3296",
  guideWidth: 250,
  guideHeight: 250,
  curviness: 0.5,
  noiseAmount: 0.5,
  numSides: 6,
  globalOpacity: 0.8,
  blendMode: "source-over",
  backgroundColor: "#000000",
  layerParams: [],
  isFullscreen: false,
  globalSeed: 1,
  globalSpeedMultiplier: 1,
  selectedLayerIndex: 0,
  seed: () => Math.floor(Math.random() * 10000)
};

export const DEFAULT_LAYER = {
  visible: true,
  opacity: 0.8,
  blendMode: "multiply",
  colors: ["#1E3296", "#502CB4"],
  numSides: 6,
  curviness: 0.5,
  width: 250,
  height: 250,
  noiseAmount: 0.5,
  noiseSeed: 1,
  position: {
    x: 0.5,
    y: 0.5,
    scale: 1
  }
};

// Legacy export for backward compatibility
export const defaults = DEFAULTS;