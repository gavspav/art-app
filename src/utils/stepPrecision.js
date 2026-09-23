/**
 * Step-aware numeric helpers shared by sliders, dials and randomisation.
 */

// How many decimals a step needs (e.g. 0.05 -> 2, 1e-3 -> 3, 1 -> 0).
// Falls back to 2 for missing/invalid steps.
export const decimalsForStep = (step, max = 3) => {
  const n = Number(step);
  if (!Number.isFinite(n) || n <= 0) return 2;
  const str = n.toString().toLowerCase();
  let decimals = 0;
  if (str.includes('e-')) {
    const exp = parseInt(str.split('e-')[1], 10);
    decimals = Number.isFinite(exp) ? exp : 0;
  } else if (str.includes('.')) {
    decimals = str.length - str.indexOf('.') - 1;
  }
  return Math.min(max, Math.max(0, decimals));
};

// Snap a value to multiples of `step` offset from `min`, avoiding float dust.
export const snapToStep = (value, step, min = 0) => {
  const n = Number(value);
  const s = Number(step);
  const lo = Number.isFinite(Number(min)) ? Number(min) : 0;
  if (!Number.isFinite(n) || !Number.isFinite(s) || s <= 0) return n;
  return Number((Math.round((n - lo) / s) * s + lo).toFixed(10));
};
