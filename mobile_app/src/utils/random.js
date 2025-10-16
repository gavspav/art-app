export const createSeededRandom = (seed = 1) => {
  let currentSeed = Math.floor(seed) || 1;
  return () => {
    currentSeed = (currentSeed * 16807) % 2147483647;
    return (currentSeed - 1) / 2147483646;
  };
};
