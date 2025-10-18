import { describe, expect, test } from 'vitest';
import { createSeededRandom, randomFloat, randomInt, pickOne, shuffle } from '../src/randomization.js';

describe('randomization utilities', () => {
  test('createSeededRandom produces deterministic sequences', () => {
    const randA = createSeededRandom('seed');
    const randB = createSeededRandom('seed');
    const seqA = Array.from({ length: 5 }, () => randA());
    const seqB = Array.from({ length: 5 }, () => randB());
    expect(seqA).toEqual(seqB);
  });

  test('randomInt respects inclusive bounds', () => {
    const rand = createSeededRandom(42);
    const values = Array.from({ length: 100 }, () => randomInt(rand, 3, 7));
    expect(values.every((value) => value >= 3 && value <= 7)).toBe(true);
  });

  test('pickOne and shuffle do not mutate original array', () => {
    const rand = createSeededRandom(7);
    const items = ['a', 'b', 'c', 'd'];
    const picked = pickOne(rand, items);
    expect(items).toEqual(['a', 'b', 'c', 'd']);
    expect(items.includes(picked)).toBe(true);

    const shuffled = shuffle(rand, items);
    expect(shuffled).toHaveLength(items.length);
    expect(shuffled.sort()).toEqual([...items].sort());
    expect(items).toEqual(['a', 'b', 'c', 'd']);
  });

  test('randomFloat falls within range', () => {
    const rand = createSeededRandom(100);
    const value = randomFloat(rand, 10, 20);
    expect(value >= 10 && value < 20).toBe(true);
  });
});
