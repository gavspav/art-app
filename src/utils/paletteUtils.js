// Palette utilities centralizing common logic

// Evenly samples colors from a palette to a desired count.
// If count > palette length, repeats edge colors evenly.
export function sampleColorsEven(base = [], count = 0) {
  const n = Math.max(0, Math.floor(count));
  if (!Array.isArray(base) || base.length === 0 || n === 0) return [];
  if (n === 1) return [base[0]];
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = (n === 1) ? 0 : (i / (n - 1));
    const idx = Math.round(t * (base.length - 1));
    out.push(base[idx]);
  }
  return out;
}

// Splits an array of colors across L layers as evenly as possible and returns an array of arrays
export function distributeColorsAcrossLayers(colors = [], layerCount = 0) {
  const src = Array.isArray(colors) ? colors : [];
  const L = Math.max(1, Math.floor(layerCount));
  const base = Math.floor(src.length / L);
  const extra = src.length % L;
  const out = Array.from({ length: L }, () => []);
  let idx = 0;
  for (let i = 0; i < L; i++) {
    const take = base + (i < extra ? 1 : 0);
    for (let j = 0; j < take; j++) out[i].push(src[idx++]);
  }
  // Round-robin remaining colours if any
  for (let i = L; i < src.length; i++) {
    out[i % L].push(src[i]);
  }
  return out;
}

// Returns next layers array with exactly one color per layer (cycling if needed)
export function assignOneColorPerLayer(layers = [], colors = []) {
  const src = Array.isArray(colors) ? colors : [];
  return (layers || []).map((l, i) => {
    const col = src.length ? src[i % src.length] : '#000000';
    return { ...l, colors: [col], numColors: 1, selectedColor: 0 };
  });
}

// Normalize a palette entry (array or { colors }) to a color array
export function getColorsFromPalette(entry) {
  const arr = Array.isArray(entry) ? entry : (entry && Array.isArray(entry.colors) ? entry.colors : []);
  return (arr || []).filter(c => typeof c === 'string' && c.length > 0);
}

// Pick a random palette and return its colors; uses rnd() if provided
export function pickPaletteColors(palettes = [], rnd = Math.random, fallback = ['#ffffff']) {
  const list = Array.isArray(palettes) ? palettes : [];
  if (!list.length) return [...fallback];
  const idx = Math.max(0, Math.min(list.length - 1, Math.floor(rnd() * list.length)));
  const colors = getColorsFromPalette(list[idx]);
  return colors.length ? colors : [...fallback];
}
