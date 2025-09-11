// Math utilities used across the app

export function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

// Mix a base value with a random sample between [min, max] using weight w (0..1)
// If integer=true, round the result to nearest integer
export function mixRandom(baseVal, min, max, w, integer = false) {
  const rnd = min + Math.random() * Math.max(0, (max - min));
  let next = baseVal * (1 - w) + rnd * w;
  next = clamp(next, min, max);
  if (integer) next = Math.round(next);
  return next;
}
