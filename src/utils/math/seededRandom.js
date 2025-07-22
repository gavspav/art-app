/**
 * Seeded random number generation utilities
 * Provides deterministic random number generation for reproducible results
 */

/**
 * Creates a seeded random number generator
 * Uses Linear Congruential Generator (LCG) algorithm for deterministic results
 * @param {number} seed - Initial seed value
 * @returns {function} Random number generator function that returns values between 0 and 1
 */
export const createSeededRandom = (seed) => {
  let currentSeed = seed;
  return () => {
    currentSeed = (currentSeed * 16807) % 2147483647;
    return (currentSeed - 1) / 2147483646;
  };
};

/**
 * Generates a random number within a specified range using seeded random
 * @param {number} min - Minimum value (inclusive)
 * @param {number} max - Maximum value (exclusive)
 * @param {function} seededRandom - Seeded random function
 * @returns {number} Random number between min and max
 */
export const randomInRange = (min, max, seededRandom) => {
  return min + seededRandom() * (max - min);
};

/**
 * Selects a random element from an array using seeded random
 * @param {Array} array - Array to select from
 * @param {function} seededRandom - Seeded random function
 * @returns {*} Random element from the array
 */
export const randomChoice = (array, seededRandom) => {
  if (!Array.isArray(array) || array.length === 0) {
    return undefined;
  }
  const index = Math.floor(seededRandom() * array.length);
  return array[index];
};

/**
 * Generates a random color hex string using seeded random
 * @param {function} seededRandom - Seeded random function
 * @returns {string} Random color in hex format (#RRGGBB)
 */
export const randomColor = (seededRandom) => {
  const hex = Math.floor(seededRandom() * 16777215).toString(16);
  return "#" + "0".repeat(6 - hex.length) + hex;
};

/**
 * Generates a random integer within a specified range using seeded random
 * @param {number} min - Minimum value (inclusive)
 * @param {number} max - Maximum value (inclusive)
 * @param {function} seededRandom - Seeded random function
 * @returns {number} Random integer between min and max
 */
export const randomInt = (min, max, seededRandom) => {
  return Math.floor(randomInRange(min, max + 1, seededRandom));
};

/**
 * Generates a random boolean value using seeded random
 * @param {function} seededRandom - Seeded random function
 * @param {number} probability - Probability of returning true (0-1, default 0.5)
 * @returns {boolean} Random boolean value
 */
export const randomBoolean = (seededRandom, probability = 0.5) => {
  return seededRandom() < probability;
};