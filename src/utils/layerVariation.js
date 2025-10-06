import { palettes as defaultPalettes } from '../constants/palettes';
import { DEFAULT_LAYER as defaultLayer } from '../constants/defaults';
import { pickPaletteColors } from './paletteUtils';
import { createSeededRandom as defaultCreateSeededRandom } from './random';
import { clamp as defaultClamp, mixRandom as defaultMixRandom } from './mathUtils';
import { hexToHsl, hslToHex, hexToRgb, rgbToHex } from './colorUtils';

// Builds a new layer by varying from a previous layer using split variation weights.
// When shape variation is zero we keep geometry identical while still applying
// animation/colour/position changes. Dependencies are injectable for testing.
export function buildVariedLayerFrom(prev, nameIndex, baseVar, {
  palettes = defaultPalettes,
  DEFAULT_LAYER = defaultLayer,
  clamp = defaultClamp,
  mix = defaultMixRandom,
  createSeededRandom = defaultCreateSeededRandom,
  randomSeed,
  affectCategories,
  preserveSeeds = false,
} = {}) {
  const normalizeSeed = (seedVal) => {
    const n = Math.abs(Number.isFinite(seedVal) ? Math.floor(seedVal) : 0);
    const mod = n % 2147483646;
    return mod === 0 ? 1 : mod;
  };

  const affectSet = Array.isArray(affectCategories) ? new Set(affectCategories) : null;
  const includeShape = !affectSet || affectSet.has('shape');
  const includeAnim = !affectSet || affectSet.has('anim');
  const includeColor = !affectSet || affectSet.has('color');
  const includePosition = !affectSet || affectSet.has('position');
  const includeScale = !affectSet || affectSet.has('scale');

  const vShapeBase = Number(prev?.variationShape ?? prev?.variation ?? DEFAULT_LAYER.variationShape ?? 0.2);
  const vAnimBase = Number(prev?.variationAnim ?? prev?.variation ?? DEFAULT_LAYER.variationAnim ?? 0.2);
  const vColorBase = Number(prev?.variationColor ?? prev?.variation ?? DEFAULT_LAYER.variationColor ?? 0.2);
  const vPositionBase = Number(prev?.variationPosition ?? prev?.variation ?? DEFAULT_LAYER.variationPosition ?? 0.2);
  const vScaleBase = Number(prev?.variationScale ?? DEFAULT_LAYER.variationScale ?? 0);
  const resolveVar = (value, fallback) => (Number.isFinite(value) ? value : fallback);
  const v = (baseVar && typeof baseVar === 'object')
    ? {
      shape: resolveVar(Number(baseVar.shape), vShapeBase),
      anim: resolveVar(Number(baseVar.anim), vAnimBase),
      color: resolveVar(Number(baseVar.color), vColorBase),
      position: resolveVar(Number(baseVar.position), vPositionBase),
      scale: resolveVar(Number(baseVar.scale), vScaleBase),
    }
    : {
      shape: resolveVar(Number(baseVar), vShapeBase),
      anim: resolveVar(Number(baseVar), vAnimBase),
      color: resolveVar(Number(baseVar), vColorBase),
      position: resolveVar(Number(baseVar), vPositionBase),
      scale: resolveVar(Number(baseVar), vScaleBase),
    };

  const sourceSeed = normalizeSeed(
    typeof randomSeed !== 'undefined'
      ? randomSeed
      : (Number.isFinite(prev?.seed) ? prev.seed : DEFAULT_LAYER.seed || 1),
  );
  const rngSeed = preserveSeeds
    ? sourceSeed
    : normalizeSeed(sourceSeed + (nameIndex * 1013904223));
  const rng = createSeededRandom(rngSeed);
  const random01 = () => {
    const val = rng();
    return Number.isFinite(val) ? Math.min(0.999999999, Math.max(0, val)) : Math.random();
  };
  const randomInRange = (min, max) => {
    const span = Math.max(0, max - min);
    return min + random01() * span;
  };
  const randomIntInclusive = (min, max) => {
    const lo = Math.ceil(min);
    const hi = Math.floor(max);
    if (hi <= lo) return lo;
    return lo + Math.floor(random01() * (hi - lo + 1));
  };
  const chooseRandom = (list) => {
    if (!Array.isArray(list) || !list.length) return undefined;
    return list[Math.floor(random01() * list.length)];
  };

  const mixValue = (baseVal, min, max, weight, integer = false) => {
    if (weight <= 0) return baseVal;
    if (mix && mix !== defaultMixRandom) {
      return mix(baseVal, min, max, weight, integer);
    }
    const rnd = randomInRange(min, max);
    let next = baseVal * (1 - weight) + rnd * weight;
    next = clamp(next, min, max);
    if (integer) next = Math.round(next);
    return next;
  };

  const wShape = clamp((v.shape || 0) / 3, 0, 1);
  const wAnim = clamp((v.anim || 0) / 3, 0, 1);
  const wScale = clamp((v.scale || 0) / 3, 0, 1);
  const boostAboveOne = (x) => {
    let z = Number(x) || 0;
    if (z > 1) z = 1 + (z - 1) * 1.4;
    if (z < 0) z = 0;
    if (z > 3) z = 3;
    return z;
  };
  const colorIntensityRaw = Number(v.color || 0);
  const boostedColor = boostAboveOne(colorIntensityRaw);
  const wColor = clamp(boostedColor / 3, 0, 1);
  const extendedColor = clamp(colorIntensityRaw <= 1 ? colorIntensityRaw : 1 + (colorIntensityRaw - 1) * 0.75, 0, 2.5);
  const wPosition = clamp((v.position || 0) / 3, 0, 1);

  const varyFlags = (prev?.vary || DEFAULT_LAYER.vary || {});
  const mixPosition = (pv, mn, mx, integer = false) => mixValue(pv, mn, mx, wPosition, integer);

  const lockShape = wShape === 0; // preserve geometry exactly, but allow other variation paths below
  const varied = lockShape
    ? JSON.parse(JSON.stringify(prev || DEFAULT_LAYER))
    : { ...(prev || DEFAULT_LAYER) };

  varied.name = `Layer ${nameIndex}`;
  if (!lockShape) {
    if (preserveSeeds) {
      if (typeof prev?.seed !== 'undefined') varied.seed = prev.seed;
      if (typeof prev?.noiseSeed !== 'undefined') varied.noiseSeed = prev.noiseSeed;
    } else {
      const newSeed = normalizeSeed(rngSeed);
      const noiseSeed = normalizeSeed(rngSeed * 16807);
      varied.seed = newSeed;
      varied.noiseSeed = noiseSeed;
    }
  }
  varied.vary = { ...(prev?.vary || DEFAULT_LAYER.vary || {}) };
  // Preserve legacy and split variations
  varied.variation = Number(prev?.variation ?? DEFAULT_LAYER.variation);
  varied.variationShape = Number(v.shape);
  varied.variationAnim = Number(v.anim);
  varied.variationColor = Number(v.color);
  varied.variationPosition = Number(v.position);

  // Shape and appearance (use wShape)
  const mixShape = (pv, mn, mx, integer = false) => mixValue(pv, mn, mx, wShape, integer);
  if (!lockShape && includeShape) {
    if (varyFlags.numSides) varied.numSides = Math.max(3, Math.round(mixShape(prev.numSides ?? 6, 3, 20, true)));
    if (varyFlags.curviness) varied.curviness = Number(mixShape(prev.curviness ?? 1.0, 0.0, 1.0).toFixed(3));
    if (varyFlags.wobble) varied.wobble = Number(mixShape(prev.wobble ?? 0.5, 0.0, 1.0).toFixed(3));
    if (varyFlags.noiseAmount) varied.noiseAmount = Number(mixShape(prev.noiseAmount ?? 0.5, 0, 8).toFixed(2));
    if (varyFlags.width) varied.width = Math.max(10, Math.round(mixShape(prev.width ?? 250, 10, 900, true)));
    if (varyFlags.height) varied.height = Math.max(10, Math.round(mixShape(prev.height ?? 250, 10, 900, true)));
    if (varyFlags.radiusFactor) {
      const baseRF = Number(prev.radiusFactor ?? DEFAULT_LAYER.radiusFactor ?? 0.125);
      varied.radiusFactor = Number(mixShape(baseRF, 0.02, 0.9).toFixed(3));
    }
    if (varyFlags.radiusFactorX) {
      const baseRFX = Number(prev.radiusFactorX ?? prev.radiusFactor ?? DEFAULT_LAYER.radiusFactor ?? 0.125);
      varied.radiusFactorX = Number(mixShape(baseRFX, 0.02, 0.9).toFixed(3));
    }
    if (varyFlags.radiusFactorY) {
      const baseRFY = Number(prev.radiusFactorY ?? prev.radiusFactor ?? DEFAULT_LAYER.radiusFactor ?? 0.125);
      varied.radiusFactorY = Number(mixShape(baseRFY, 0.02, 0.9).toFixed(3));
    }
  }
  // New: X/Y Offset variation (range -0.5..0.5)
  if (includePosition && varyFlags.xOffset) {
    const baseXO = Number(prev.xOffset ?? 0);
    varied.xOffset = Number(mixPosition(baseXO, -0.5, 0.5).toFixed(3));
  }
  if (includePosition && varyFlags.yOffset) {
    const baseYO = Number(prev.yOffset ?? 0);
    varied.yOffset = Number(mixPosition(baseYO, -0.5, 0.5).toFixed(3));
  }

  // Movement (use wAnim)
  const mixAnim = (pv, mn, mx, integer = false) => mixValue(pv, mn, mx, wAnim, integer);
  if (includeAnim && varyFlags.movementStyle && wAnim > 0.7 && random01() < wAnim) {
    const styles = ['bounce', 'drift', 'still', 'orbit', 'spin'];
    const cur = prev.movementStyle ?? DEFAULT_LAYER.movementStyle;
    const others = styles.filter(s => s !== cur);
    varied.movementStyle = chooseRandom(others.length ? others : styles) || cur;
  }
  if (includeAnim && varyFlags.movementSpeed) varied.movementSpeed = Number(mixAnim(prev.movementSpeed ?? 1, 0, 5).toFixed(3));
  if (includeAnim && varyFlags.movementAngle) {
    const nextA = mixAnim(prev.movementAngle ?? 45, 0, 360, true);
    varied.movementAngle = ((nextA % 360) + 360) % 360;
  }
  if (includeAnim && varyFlags.scaleSpeed) varied.scaleSpeed = Number(mixAnim(prev.scaleSpeed ?? 0.05, 0, 0.2).toFixed(3));
  let nextScaleMin = prev.scaleMin ?? 0.2;
  let nextScaleMax = prev.scaleMax ?? 1.5;
  if (includeAnim && varyFlags.scaleMin) nextScaleMin = mixAnim(prev.scaleMin ?? 0.2, 0.1, 2);
  if (includeAnim && varyFlags.scaleMax) nextScaleMax = mixAnim(prev.scaleMax ?? 1.5, 0.5, 3);
  varied.scaleMin = Math.min(nextScaleMin, nextScaleMax);
  varied.scaleMax = Math.max(nextScaleMin, nextScaleMax);

  // Image effects (treat as animation/appearance; use wAnim)
  if (includeAnim && varyFlags.imageBlur) varied.imageBlur = Number(mixAnim(prev.imageBlur ?? 0, 0, 20).toFixed(2));
  if (includeAnim && varyFlags.imageBrightness) varied.imageBrightness = Math.round(mixAnim(prev.imageBrightness ?? 100, 0, 200, true));
  if (includeAnim && varyFlags.imageContrast) varied.imageContrast = Math.round(mixAnim(prev.imageContrast ?? 100, 0, 200, true));
  if (includeAnim && varyFlags.imageHue) {
    const nextHue = mixAnim(prev.imageHue ?? 0, 0, 360, true);
    varied.imageHue = ((nextHue % 360) + 360) % 360;
  }
  if (includeAnim && varyFlags.imageSaturation) varied.imageSaturation = Math.round(mixAnim(prev.imageSaturation ?? 100, 0, 200, true));
  if (includeAnim && varyFlags.imageDistortion) varied.imageDistortion = Number(mixAnim(prev.imageDistortion ?? 0, 0, 50).toFixed(2));

  // Position jitter (use wAnim)
  if (includeAnim) {
    const baseX = prev.position?.x ?? 0.5;
    const baseY = prev.position?.y ?? 0.5;
    const jitter = 0.15 * wAnim;
    const jx = (random01() * 2 - 1) * jitter;
    const jy = (random01() * 2 - 1) * jitter;
    const nx = clamp(baseX + jx, 0.0, 1.0);
    const ny = clamp(baseY + jy, 0.0, 1.0);
    varied.position = {
      ...(prev.position || DEFAULT_LAYER.position),
      x: nx,
      y: ny,
      scale: prev.position?.scale ?? 1.0,
      scaleDirection: prev.position?.scaleDirection ?? 1,
    };
  }

  // Scale variation (independent of animation variation)
  // Supports both positive (larger scales) and negative (smaller scales) variation
  if (includeScale) {
    const baseScale = (() => {
      const raw = prev.position?.scale;
      if (Number.isFinite(raw) && raw > 0) return raw;
      const variedRaw = varied.position?.scale;
      if (Number.isFinite(variedRaw) && variedRaw > 0) return variedRaw;
      return 1.0;
    })();
    const rawScaleVar = Number(v.scale || 0);

    if (rawScaleVar !== 0) {
      const absWeight = clamp(Math.abs(rawScaleVar) / 3, 0, 1);
      const minScale = 0.05;
      const maxScale = 5;
      if (rawScaleVar < 0) {
        // Negative variation shrinks relative to each layer's base scale.
        const shrinkIntensity = 0.95 * absWeight;
        const ratio = Math.max(0.05, 1 - random01() * shrinkIntensity);
        const newScale = clamp(baseScale * ratio, minScale, maxScale);
        varied.position = {
          ...(varied.position || prev.position || DEFAULT_LAYER.position),
          scale: newScale,
        };
      } else {
        // Positive variation grows relative to each layer's base scale.
        const growthIntensity = 1.2 * absWeight;
        const ratio = 1 + random01() * growthIntensity;
        const newScale = clamp(baseScale * ratio, minScale, maxScale);
        varied.position = {
          ...(varied.position || prev.position || DEFAULT_LAYER.position),
          scale: newScale,
        };
      }
    }
  }

  // Recompute velocity from angle/speed
  if (includeAnim) {
    if (varied.movementStyle === 'spin') {
      varied.vx = 0;
      varied.vy = 0;
    } else {
      const angleRad = (varied.movementAngle ?? prev.movementAngle ?? 0) * (Math.PI / 180);
      const spd = (varied.movementSpeed ?? prev.movementSpeed ?? 0) * 0.001;
      varied.vx = Math.cos(angleRad) * spd;
      varied.vy = Math.sin(angleRad) * spd;
    }
  }

  // Colors (use wColor) — unified thresholds like Randomize All
  if (includeColor && Array.isArray(prev.colors) && prev.colors.length) {
    if (varyFlags.colors) {
      if (wColor <= 0) {
        varied.colors = [...prev.colors];
        varied.numColors = prev.numColors ?? prev.colors.length;
      } else if (wColor >= 0.6) {
        const nextPalette = pickPaletteColors(palettes, random01, prev.colors) || prev.colors;
        varied.colors = Array.isArray(nextPalette) && nextPalette.length ? [...nextPalette] : [...prev.colors];
        varied.numColors = varied.colors.length;
      } else {
        const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
        const perturbHueRange = 6 + 180 * Math.pow(Math.min(1, extendedColor), 1.25);
        const perturbSatRange = 4 + 70 * Math.pow(Math.min(1, extendedColor), 1.1);
        const perturbLightRange = 4 + 60 * Math.pow(Math.min(1, extendedColor), 1.05);
        const perturbColor = (hex) => {
          const { h, s, l } = hexToHsl(hex);
          const nextH = (h + (random01() * 2 - 1) * perturbHueRange + 360) % 360;
          const nextS = clamp(s + (random01() * 2 - 1) * perturbSatRange, 0, 100);
          const nextL = clamp(l + (random01() * 2 - 1) * perturbLightRange, 0, 100);
          return hslToHex(nextH, nextS, nextL);
        };
        const blendTowards = (fromHex, toHex, weight) => {
          const a = hexToRgb(fromHex);
          const b = hexToRgb(toHex);
          return rgbToHex({
            r: a.r + (b.r - a.r) * weight,
            g: a.g + (b.g - a.g) * weight,
            b: a.b + (b.b - a.b) * weight,
          });
        };
        const ensurePaletteDifference = () => {
          if (!Array.isArray(prev.colors) || !prev.colors.length) return [...prev.colors];
          let candidate = pickPaletteColors(palettes, random01, prev.colors) || prev.colors;
          const asLower = (arr) => (arr || []).map(c => (c || '').toLowerCase());
          const baseLower = asLower(prev.colors);
          let attempts = 0;
          while (attempts < 3 && candidate && candidate.length && asLower(candidate).every((c, i) => c === baseLower[i % baseLower.length])) {
            candidate = pickPaletteColors(palettes, random01, prev.colors) || prev.colors;
            attempts += 1;
          }
          return Array.isArray(candidate) && candidate.length ? [...candidate] : [...prev.colors];
        };
        const baseColors = [...prev.colors];
        const replacementPalette = ensurePaletteDifference();
        const replacementChance = wColor <= 0.22 ? 0 : easeOutCubic(clamp((wColor - 0.22) / (0.6 - 0.22), 0, 1));
        const shuffleChance = clamp(wColor * 0.45, 0, 0.6);
        const blendBias = 0.35 + 0.65 * clamp(wColor, 0, 1);

        const mutated = baseColors.map((hex, idx) => {
          const safeHex = (typeof hex === 'string' && /^#?[0-9a-fA-F]{6}$/.test(hex.replace('#', ''))) ? (hex.startsWith('#') ? hex : `#${hex}`) : '#000000';
          const replacement = replacementPalette[idx % replacementPalette.length] || safeHex;
          if (random01() < replacementChance) {
            return blendTowards(safeHex, replacement, blendBias);
          }
          return perturbColor(safeHex);
        });

        if (mutated.length > 1 && shuffleChance > 0) {
          const swaps = Math.max(1, Math.round(mutated.length * shuffleChance));
          for (let n = 0; n < swaps; n++) {
            const i = randomIntInclusive(0, mutated.length - 1);
            const j = randomIntInclusive(0, mutated.length - 1);
            if (i !== j) [mutated[i], mutated[j]] = [mutated[j], mutated[i]];
          }
        }

        varied.colors = mutated;
        varied.numColors = mutated.length;
      }
    } else {
      varied.colors = [...prev.colors];
      varied.numColors = prev.numColors ?? prev.colors.length;
    }
  }

  if (!lockShape && includeShape) {
    // If previous layer has edited nodes, vary shape from those nodes
    try {
      const prevNodes = Array.isArray(prev.nodes) ? prev.nodes : null;
      const desired = Math.max(3, Number(varied.numSides ?? prev.numSides ?? 6));
      if (prevNodes && prevNodes.length >= 3) {
        let nodes = prevNodes.map(n => ({ x: Number(n?.x) || 0, y: Number(n?.y) || 0 }));
        // Resize
        if (nodes.length !== desired) {
          if (nodes.length > desired) {
            nodes = nodes.slice(0, desired);
          } else {
            while (nodes.length < desired) {
              const N = nodes.length;
              const k = randomIntInclusive(0, N - 1);
              const next = (k + 1) % N;
              nodes.splice(next, 0, { x: (nodes[k].x + nodes[next].x) / 2, y: (nodes[k].y + nodes[next].y) / 2 });
            }
          }
        }
        const jitterAmt = 0.12 * wShape;
        varied.nodes = nodes.map(n => ({
          x: Math.max(-1, Math.min(1, n.x + (random01() * 2 - 1) * jitterAmt)),
          y: Math.max(-1, Math.min(1, n.y + (random01() * 2 - 1) * jitterAmt)),
        }));
        varied.syncNodesToNumSides = prev.syncNodesToNumSides;
      } else {
        varied.nodes = null;
      }
    } catch {
      varied.nodes = null;
    }
  }

  return varied;
}
