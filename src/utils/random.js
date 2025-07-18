export const createSeededRandom = (seed) => {
  let currentSeed = seed;
  return () => {
    currentSeed = (currentSeed * 16807) % 2147483647;
    return (currentSeed - 1) / 2147483646;
  };
};
  
  export function randomColor(seededRandom) {
    const hex = Math.floor(seededRandom() * 16777215).toString(16);
    return "#" + "0".repeat(6 - hex.length) + hex;
  }