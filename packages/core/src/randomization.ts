export type SeededRandom = () => number;

/**
 * Mulberry32 implementation for deterministic pseudo-random numbers.
 */
const mulberry32 = (seed: number): SeededRandom => {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

const normalizeSeed = (seed: number | string | undefined): number => {
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    return seed;
  }

  if (typeof seed === 'string') {
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
      hash = (hash << 5) - hash + seed.charCodeAt(i);
      hash |= 0; // Convert to 32bit integer
    }
    return hash >>> 0;
  }

  return Math.floor(Math.random() * 0xffffffff);
};

export const createSeededRandom = (seed?: number | string): SeededRandom => mulberry32(normalizeSeed(seed));

export const randomFloat = (rand: SeededRandom, min = 0, max = 1): number => rand() * (max - min) + min;

export const randomInt = (rand: SeededRandom, min: number, max: number): number => {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  return Math.floor(rand() * (hi - lo + 1)) + lo;
};

export const pickOne = <T>(rand: SeededRandom, list: readonly T[]): T => {
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error('Cannot pick from empty list');
  }
  const index = randomInt(rand, 0, list.length - 1);
  return list[index];
};

export const shuffle = <T>(rand: SeededRandom, items: readonly T[]): T[] => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = randomInt(rand, 0, i);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};
