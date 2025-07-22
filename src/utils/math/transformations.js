/**
 * Parameter value transformation utilities
 * Handles conversion between different value ranges and scales
 */

/**
 * Linear transformation between two ranges
 * @param {number} value - Input value
 * @param {number} fromMin - Input range minimum
 * @param {number} fromMax - Input range maximum
 * @param {number} toMin - Output range minimum
 * @param {number} toMax - Output range maximum
 * @returns {number} Transformed value
 */
export const linearTransform = (value, fromMin, fromMax, toMin, toMax) => {
  const normalized = (value - fromMin) / (fromMax - fromMin);
  return toMin + normalized * (toMax - toMin);
};

/**
 * Clamps a value between minimum and maximum bounds
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum bound
 * @param {number} max - Maximum bound
 * @returns {number} Clamped value
 */
export const clamp = (value, min, max) => {
  return Math.min(Math.max(value, min), max);
};

/**
 * Exponential transformation (power scaling)
 * @param {number} value - Input value (0-1)
 * @param {number} power - Exponent for transformation
 * @param {number} scale - Scale factor for output
 * @returns {number} Transformed value
 */
export const exponentialTransform = (value, power, scale = 1) => {
  return Math.pow(value, power) * scale;
};

/**
 * Inverse exponential transformation
 * @param {number} value - Input value
 * @param {number} power - Exponent used in original transformation
 * @param {number} scale - Scale factor used in original transformation
 * @returns {number} Inverse transformed value (0-1)
 */
export const inverseExponentialTransform = (value, power, scale = 1) => {
  return Math.pow(value / scale, 1 / power);
};

/**
 * Speed parameter transformation (quartic scaling like original)
 * Converts between slider value (0-1) and actual speed value
 */
export const speedTransform = {
  /**
   * Convert speed value to slider position
   * @param {number} speed - Speed value
   * @returns {number} Slider position (0-1)
   */
  toSlider: (speed) => Math.pow(speed / 0.1, 1/4),
  
  /**
   * Convert slider position to speed value
   * @param {number} sliderValue - Slider position (0-1)
   * @returns {number} Speed value
   */
  fromSlider: (sliderValue) => Math.pow(sliderValue, 4) * 0.1
};

/**
 * Logarithmic transformation
 * @param {number} value - Input value
 * @param {number} base - Logarithm base (default: Math.E)
 * @returns {number} Logarithmic value
 */
export const logarithmicTransform = (value, base = Math.E) => {
  return Math.log(value) / Math.log(base);
};

/**
 * Inverse logarithmic transformation
 * @param {number} value - Input value
 * @param {number} base - Logarithm base (default: Math.E)
 * @returns {number} Exponential value
 */
export const inverseLogarithmicTransform = (value, base = Math.E) => {
  return Math.pow(base, value);
};

/**
 * Smooth step interpolation (S-curve)
 * @param {number} value - Input value (0-1)
 * @returns {number} Smooth stepped value (0-1)
 */
export const smoothStep = (value) => {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * Smoother step interpolation (more gradual S-curve)
 * @param {number} value - Input value (0-1)
 * @returns {number} Smoother stepped value (0-1)
 */
export const smootherStep = (value) => {
  const t = clamp(value, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
};

/**
 * Normalize a value to 0-1 range
 * @param {number} value - Input value
 * @param {number} min - Minimum of input range
 * @param {number} max - Maximum of input range
 * @returns {number} Normalized value (0-1)
 */
export const normalize = (value, min, max) => {
  return (value - min) / (max - min);
};

/**
 * Denormalize a 0-1 value to a specific range
 * @param {number} normalizedValue - Normalized value (0-1)
 * @param {number} min - Target range minimum
 * @param {number} max - Target range maximum
 * @returns {number} Denormalized value
 */
export const denormalize = (normalizedValue, min, max) => {
  return min + normalizedValue * (max - min);
};