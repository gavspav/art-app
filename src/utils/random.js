// src/utils/random.js
export function createSeededRandom(seed) {
    return () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
  }
  
  export function randomColor(seededRandom) {
    const hex = Math.floor(seededRandom() * 16777215).toString(16);
    return "#" + "0".repeat(6 - hex.length) + hex;
  }