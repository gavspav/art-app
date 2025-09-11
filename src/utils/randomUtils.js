// Random utilities: seeded RNG and helpers

export { createSeededRandom } from './random.js';

// Pick a random element from an array. If rnd is provided, it should be a function () => number in [0,1).
export function pick(array, rnd = Math.random) {
  const arr = Array.isArray(array) ? array : [];
  if (!arr.length) return undefined;
  const idx = Math.floor(rnd() * arr.length);
  return arr[Math.max(0, Math.min(arr.length - 1, idx))];
}
