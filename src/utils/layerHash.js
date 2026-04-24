/**
 * Utility functions for calculating visual hashes of layers
 * Used to detect when layers have actually changed visually and need re-rendering
 */

/**
 * Creates a hash string from layer visual properties only
 * Excludes animation metadata and internal state that don't affect rendering
 * @param {Object} layer - The layer object
 * @returns {string} - Hash representing visual state
 */
const serializeVisualValue = (value) => {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
};

export const calculateVisualHash = (layer) => {
  if (!layer || typeof layer !== 'object') return '';

  const position = layer.position || {};
  const image = layer.image || {};

  // Build a stable, compact serialization without allocating a large intermediate object.
  return [
    `numSides:${serializeVisualValue(layer.numSides)}`,
    `curviness:${serializeVisualValue(layer.curviness)}`,
    `radiusFactor:${serializeVisualValue(layer.radiusFactor)}`,
    `width:${serializeVisualValue(layer.width)}`,
    `height:${serializeVisualValue(layer.height)}`,
    `noiseAmount:${serializeVisualValue(layer.noiseAmount)}`,
    `noiseSeed:${serializeVisualValue(layer.noiseSeed)}`,
    `opacity:${serializeVisualValue(layer.opacity)}`,
    `blendMode:${serializeVisualValue(layer.blendMode)}`,
    `colors:${serializeVisualValue(layer.colors)}`,
    `nodes:${serializeVisualValue(layer.nodes)}`,
    `pathMode:${serializeVisualValue(layer.pathMode)}`,
    `pathClosed:${serializeVisualValue(layer.pathClosed)}`,
    `strokeWidthPx:${serializeVisualValue(layer.strokeWidthPx)}`,
    `strokeCap:${serializeVisualValue(layer.strokeCap)}`,
    `strokeJoin:${serializeVisualValue(layer.strokeJoin)}`,
    `rotation:${serializeVisualValue(layer.rotation)}`,
    `x:${serializeVisualValue(position.x)}`,
    `y:${serializeVisualValue(position.y)}`,
    `scale:${serializeVisualValue(position.scale)}`,
    `layerType:${serializeVisualValue(layer.layerType)}`,
    `visible:${serializeVisualValue(layer.visible)}`,
    `imageSrc:${serializeVisualValue(image.src)}`,
    `imageBlur:${serializeVisualValue(layer.imageBlur)}`,
    `imageBrightness:${serializeVisualValue(layer.imageBrightness)}`,
    `imageContrast:${serializeVisualValue(layer.imageContrast)}`,
    `imageHue:${serializeVisualValue(layer.imageHue)}`,
    `imageSaturation:${serializeVisualValue(layer.imageSaturation)}`,
    `imageDistortion:${serializeVisualValue(layer.imageDistortion)}`,
  ].join('|');
};

/**
 * Simple hash function to convert string to shorter hash
 * @param {string} str - String to hash
 * @returns {string} - Short hash string
 */
const simpleHash = (str) => {
  let hash = 0;
  if (str.length === 0) return hash.toString();
  
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return Math.abs(hash).toString(36);
};

/**
 * Creates a compact hash from layer visual properties
 * @param {Object} layer - The layer object
 * @returns {string} - Compact hash string
 */
export const calculateCompactVisualHash = (layer) => {
  const visualString = calculateVisualHash(layer);
  return simpleHash(visualString);
};

/**
 * Compares two layers to determine if they have visually changed
 * @param {Object} currentLayer - Current layer state
 * @param {string} previousHash - Previous visual hash
 * @returns {boolean} - True if layer has visually changed
 */
export const hasVisuallyChanged = (currentLayer, previousHash) => {
  const currentHash = calculateCompactVisualHash(currentLayer);
  return currentHash !== previousHash;
};

/**
 * Gets a list of changed visual properties between two layers
 * Useful for debugging and selective updates
 * @param {Object} currentLayer - Current layer state
 * @param {Object} previousLayer - Previous layer state
 * @returns {string[]} - Array of changed property names
 */
export const getChangedVisualProperties = (currentLayer, previousLayer) => {
  if (!currentLayer || !previousLayer) return [];
  
  const changedProps = [];
  
  // Define visual properties to check
  const propsToCheck = [
    'numSides', 'curviness', 'radiusFactor', 'width', 'height', 'noiseAmount', 'rotation',
    'pathMode', 'pathClosed', 'strokeWidthPx', 'strokeCap', 'strokeJoin',
    'opacity', 'blendMode', 'colors', 'layerType', 'visible'
  ];
  
  // Check top-level properties
  propsToCheck.forEach(prop => {
    if (JSON.stringify(currentLayer[prop]) !== JSON.stringify(previousLayer[prop])) {
      changedProps.push(prop);
    }
  });
  
  // Check position properties
  const currentPos = currentLayer.position || {};
  const previousPos = previousLayer.position || {};
  
  ['x', 'y', 'scale'].forEach(prop => {
    if (currentPos[prop] !== previousPos[prop]) {
      changedProps.push(`position.${prop}`);
    }
  });
  
  // Check image source
  const currentImgSrc = currentLayer.image?.src || null;
  const previousImgSrc = previousLayer.image?.src || null;
  if (currentImgSrc !== previousImgSrc) {
    changedProps.push('image.src');
  }
  
  return changedProps;
};

/**
 * Creates a visual hash for multiple layers
 * @param {Object[]} layers - Array of layer objects
 * @returns {string} - Combined hash for all layers
 */
export const calculateLayersHash = (layers) => {
  if (!Array.isArray(layers)) return '';
  if (layers.length === 0) return '';

  const layerHashes = layers.map(layer => calculateCompactVisualHash(layer));
  return simpleHash(layerHashes.join('|'));
};
