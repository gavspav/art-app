// src/hooks/useSeededRandom.js
import { useRef } from 'react';
import { createSeededRandom } from '../utils/random';

export function useSeededRandom(seed) {
  const seededRandomRef = useRef(createSeededRandom(seed));
  // If the seed changes, update the seeded random function
  if (seededRandomRef.current.seed !== seed) {
    seededRandomRef.current = createSeededRandom(seed);
  }
  return seededRandomRef.current;
}
