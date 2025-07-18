export const DEFAULT_LAYER = {
  // Static Shape & Style Properties
  name: 'Layer 1',
  layerType: 'shape', // 'shape' or 'image'
  imageSrc: null, // Data URL for imported images
  shapeType: 'polygon',
  numSides: 6,
  curviness: -0.64,
  width: 0.5,
  height: 0.5,
  noiseAmount: 0.8,
  noiseSpeed: 0.005,
  opacity: 1.0,
  blendMode: 'normal',
  colors: ["#FFC300", "#FF5733", "#C70039"],
  selectedColor: 0,

  // Animation Control Properties (kept top-level for easy access in Controls.jsx)
  movementStyle: 'bounce', // 'bounce' or 'drift'
  movementSpeed: 0.001,
  movementAngle: 45, // degrees
  scaleSpeed: 0.05,
  scaleMin: 0.2,
  scaleMax: 1.5,

  // Seeding
  seed: 1,
  noiseSeed: 1,
  useGlobalSeed: false,

  // Dynamic state (nested as expected by Canvas.jsx and useAnimation.js)
  position: {
    centerX: 0.5,
    centerY: 0.5,
    x: 0.5, // position (0-1)
    y: 0.5,
    vx: 0, // velocity
    vy: 0,
    scale: 1.0,
    scaleDirection: 1,
  },
  visible: true,
};

export const DEFAULTS = {
  globalSpeedMultiplier: 1,
  isFrozen: false,
  variation: 1.5,
  backgroundColor: '#111111',
  guideWidth: 0.5,
  guideHeight: 0.5,
  globalSeed: 1,
  layers: [DEFAULT_LAYER],
  selectedLayerIndex: 0,
};