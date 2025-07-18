import { useMemo } from 'react';
import { createSeededRandom } from '../utils/random';

/**
 * A custom React hook that provides a memoized, seeded random number generator.
 * The generator function is stable and will only be recreated if the seed changes,
 * preventing infinite loops in effects that depend on it.
 * @param {number} seed The seed for the random number generator.
 * @returns {function(): number} A function that returns a new pseudo-random number between 0 and 1 each time it's called.
 */
export function useSeededRandom(seed) {
  return useMemo(() => createSeededRandom(seed), [seed]);
}
