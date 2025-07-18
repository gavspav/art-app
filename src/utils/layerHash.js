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
export const calculateVisualHash = (layer) => {
  if (!layer) return '';
  
  // Extract only visual properties that affect rendering
  const visualProps = {
    // Shape properties
    numSides: layer.numSides,
    curviness: layer.curviness,
    width: layer.width,
    height: layer.height,
    noiseAmount: layer.noiseAmount,
    noiseSeed: layer.noiseSeed, // Include noise seed as it affects visual output
    
    // Appearance properties
    opacity: layer.opacity,
    blendMode: layer.blendMode,
    colors: layer.colors,
    
    // Position and scale (from nested position object)
    x: layer.position?.x,
    y: layer.position?.y,
    scale: layer.position?.scale,
    
    // Layer type and visibility
    layerType: layer.layerType,
    visible: layer.visible,
    
    // Image properties (if applicable)
    imageSrc: layer.image?.src || null,
  };
  
  // Create a stable string representation
  return JSON.stringify(visualProps);
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
    'numSides', 'curviness', 'width', 'height', 'noiseAmount',
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
  
  const layerHashes = layers.map(layer => calculateCompactVisualHash(layer));
  return simpleHash(layerHashes.join('|'));
};