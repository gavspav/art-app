export const clamp01 = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1, parsed));
};

export const hexToHsl = (hex) => {
  const normalized = typeof hex === 'string' ? hex.replace('#', '') : '';
  const full = normalized.length === 3
    ? normalized.split('').map(char => `${char}${char}`).join('')
    : normalized.padEnd(6, '0').slice(0, 6);
  const numeric = Number.parseInt(full, 16);
  const r = ((numeric >> 16) & 255) / 255;
  const g = ((numeric >> 8) & 255) / 255;
  const b = (numeric & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return { hue: 0, saturation: 0, lightness };
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue;
  if (max === r) hue = 60 * (((g - b) / delta) % 6);
  else if (max === g) hue = 60 * (((b - r) / delta) + 2);
  else hue = 60 * (((r - g) / delta) + 4);
  return { hue: (hue + 360) % 360, saturation, lightness };
};

export const colorToRootMidi = (color) => {
  const { hue, lightness } = hexToHsl(color);
  const pitchClasses = [0, 2, 3, 5, 7, 9, 10];
  const pitchClass = pitchClasses[Math.floor((hue / 360) * pitchClasses.length) % pitchClasses.length];
  return 36 + pitchClass + (lightness > 0.65 ? 12 : 0);
};

export const getPaletteIdentity = (colors = []) => {
  const source = Array.isArray(colors) && colors.length ? colors : ['#808080'];
  return source.map(color => String(color || '').trim().toLowerCase()).filter(Boolean).join('|');
};

export const paletteToSound = (colors = []) => {
  const source = Array.isArray(colors) && colors.length ? colors : ['#808080'];
  const hsl = source.map(hexToHsl);
  const averageHue = hsl.reduce((sum, color) => sum + color.hue, 0) / hsl.length;
  const scaleSets = [
    [0, 3, 5, 7, 10],
    [0, 2, 5, 7, 9],
    [0, 2, 3, 7, 10],
    [0, 4, 5, 7, 11],
  ];
  const scale = scaleSets[Math.floor((averageHue / 360) * scaleSets.length) % scaleSets.length];
  // Keep palette timbres varied but gentle. The colour signature spreads palettes
  // across sine and triangle families instead of sending most saturated palettes
  // to the same bright oscillator.
  const oscillatorFamilies = ['sine', 'sine2', 'triangle', 'sine', 'triangle2', 'sine2', 'sine', 'triangle'];
  const firstHue = hsl[0]?.hue || 0;
  const timbreHue = (averageHue * 0.65 + firstHue * 0.35) % 360;
  const oscillator = oscillatorFamilies[
    Math.floor((timbreHue / 360) * oscillatorFamilies.length) % oscillatorFamilies.length
  ];
  const rootMidi = colorToRootMidi(source[0]);
  return { scale, oscillator, rootMidi, identity: getPaletteIdentity(source) };
};

export const calculateSoundscapeTension = ({ speed = 1, noise = 0, curviness = 1, wobble = 0 } = {}) => {
  const speedTension = clamp01((Number(speed) - 1) / 4);
  const noiseTension = clamp01(noise);
  const angularTension = 1 - clamp01(curviness, 1);
  const wobbleTension = clamp01(wobble);
  return clamp01(speedTension * 0.25 + noiseTension * 0.3 + angularTension * 0.4 + wobbleTension * 0.25);
};

export const summarizeSoundscapeLayers = (layers = []) => {
  const source = Array.isArray(layers) ? layers.filter(layer => layer && layer.visible !== false) : [];
  const average = (key, fallback = 0) => {
    if (!source.length) return fallback;
    return source.reduce((sum, layer) => sum + (Number(layer?.[key]) || 0), 0) / source.length;
  };
  const averageOpacity = source.length
    ? source.reduce((sum, layer) => sum + clamp01(layer?.opacity, 1), 0) / source.length
    : 1;
  return {
    count: source.length,
    size: clamp01(average('radiusFactor', 0.4) / 2, 0.2),
    opacity: averageOpacity,
    noise: clamp01(average('noiseAmount', 0) / 8),
    curviness: clamp01(average('curviness', 1), 1),
    wobble: clamp01(average('wobble', 0)),
    sides: Math.max(3, Math.min(20, Math.round(average('numSides', 6)))),
    voices: source.map((layer, index) => ({
      id: String(layer.id || layer.name || index),
      x: clamp01(layer.position?.x, 0.5),
      y: clamp01(layer.position?.y, 0.5),
      size: clamp01((Number(layer.radiusFactor) || 0.4) / 2, 0.2),
      opacity: clamp01(layer.opacity, 1),
      sides: Math.max(3, Math.min(20, Math.round(Number(layer.numSides) || 6))),
      movementSpeed: Math.max(0, Math.min(5, Number(layer.movementSpeed) || 0)),
    })),
  };
};
