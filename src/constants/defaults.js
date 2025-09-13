export const DEFAULT_LAYER = {
  // Static Shape & Style Properties
  name: 'Layer 1',
  layerType: 'shape', // 'shape' or 'image'
  imageSrc: null, // Data URL for imported images
  shapeType: 'polygon',
  numSides: 6,
  wobble: 0.5,
  curviness: 1.0, // Default to full smoothing, within [0,1]
  width: 250, // Changed to match old version (Guide Width)
  height: 250, // Changed to match old version (Guide Height)
  // New: relative size (fraction of min(canvas.width, canvas.height))
  // Legacy match: 250px * 0.4 = 100px on minWH≈800 -> ~0.125
  radiusFactor: 0.125,
  noiseAmount: 0.5, // Changed to match old version default
  noiseSpeed: 0.005,
  opacity: 0.8, // Changed to match old version default
  blendMode: 'source-over', // Changed to match old version
  colors: ["#0000FF"],
  selectedColor: 0,

  // Animation Control Properties (kept top-level for easy access in Controls.jsx)
  movementStyle: 'bounce', // 'bounce' or 'drift'
  movementSpeed: 1,
  movementAngle: 45, // degrees
  scaleSpeed: 0.05,
  scaleMin: 0.0,
  scaleMax: 1.5,

  // Variation controls (legacy + split)
  variation: 0.2, // legacy single control (kept for backward-compat)
  variationShape: 0.2,
  variationAnim: 0.2,
  variationColor: 0.2,

  // Seeding
  seed: 1,
  noiseSeed: 1,
  useGlobalSeed: false,

  // Superior algorithm parameters from old version
  freq1: 2,
  freq2: 3,
  freq3: 4,
  baseRadiusFactor: 0.4,
  radiusBump: 0,
  // Rotation (degrees) applied to shape geometry
  rotation: 0,

  // Orbit movement defaults (used when movementStyle === 'orbit')
  orbitCenterX: 0.5, // normalized [0,1]
  orbitCenterY: 0.5, // normalized [0,1]
  orbitAngle: 0,     // radians phase accumulator
  orbitRadiusX: 0.15, // normalized radii; can be influenced by movement
  orbitRadiusY: 0.15,

  // Node editing
  nodes: null, // when set, array of { x: number, y: number } normalized to canvas size (0..1)
  // If true, while in node edit mode the app will keep nodes length synced to numSides (polygon editing mode).
  // Imported SVGs will set this to false to preserve their sampled node count.
  syncNodesToNumSides: true,
  // If true, Canvas maps normalized nodes using canvas half-size (from SVG viewBox),
  // ignoring width/height caps so imported shapes align with original SVG positions
  viewBoxMapped: false,

  // Image Effects
  imageBlur: 0,
  imageBrightness: 100,
  imageContrast: 100,
  imageHue: 0,
  imageSaturation: 100,
  imageDistortion: 0,

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
  // Per-layer variation flags: controls whether this property varies across layers (modern randomizer/add layer)
  vary: {
    // Shape & appearance
    numSides: true,
    curviness: true,
    wobble: true,
    noiseAmount: true,
    radiusFactor: true,
    radiusFactorX: true,
    radiusFactorY: true,
    width: true,
    height: true,
    opacity: false, // keep per-layer opacity constant; global control exists

    // Movement
    movementStyle: true,
    movementSpeed: true,
    movementAngle: true,
    scaleSpeed: true,
    scaleMin: false,
    scaleMax: false,
    orbitCenterX: false,
    orbitCenterY: false,
    orbitRadiusX: false,
    orbitRadiusY: false,

    // Advanced
    freq1: false,
    freq2: false,
    freq3: false,

    // Image Effects
    imageBlur: true,
    imageBrightness: true,
    imageContrast: true,
    imageHue: true,
    imageSaturation: true,
    imageDistortion: true,

    // Colours
    colors: true,       // allow palette/colour set to vary across layers
    numColors: true,    // allow number of colours to vary across layers

    // Animate colours controls
    colorFadeEnabled: true,
    colorFadeSpeed: true,
  },
};

export const DEFAULTS = {
  globalSpeedMultiplier: 1,
  isFrozen: false,
  backgroundColor: '#111111',
  globalBlendMode: 'source-over',
  guideWidth: 0.5,
  guideHeight: 0.5,
  globalSeed: 1,
  layers: [DEFAULT_LAYER],
  selectedLayerIndex: 0,
};
