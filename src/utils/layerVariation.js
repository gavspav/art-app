import { palettes as defaultPalettes } from '../constants/palettes';
import { DEFAULT_LAYER as defaultLayer } from '../constants/defaults';
import { pickPaletteColors } from './paletteUtils';
import { createSeededRandom as defaultCreateSeededRandom } from './random';
import { clamp as defaultClamp, mixRandom as defaultMixRandom } from './mathUtils';

// Builds a new layer by varying from a previous layer using split variation weights.
// When shape variation is zero we keep geometry identical while still applying
// animation/colour/position changes. Dependencies are injectable for testing.
export function buildVariedLayerFrom(prev, nameIndex, baseVar, {
  palettes = defaultPalettes,
  DEFAULT_LAYER = defaultLayer,
  clamp = defaultClamp,
  mix = defaultMixRandom,
  createSeededRandom = defaultCreateSeededRandom,
} = {}) {
  const vShapeBase = Number(prev?.variationShape ?? prev?.variation ?? DEFAULT_LAYER.variationShape ?? 0.2);
  const vAnimBase = Number(prev?.variationAnim ?? prev?.variation ?? DEFAULT_LAYER.variationAnim ?? 0.2);
  const vColorBase = Number(prev?.variationColor ?? prev?.variation ?? DEFAULT_LAYER.variationColor ?? 0.2);
  const vPositionBase = Number(prev?.variationPosition ?? prev?.variation ?? DEFAULT_LAYER.variationPosition ?? 0.2);
  const resolveVar = (value, fallback) => (Number.isFinite(value) ? value : fallback);
  const v = (baseVar && typeof baseVar === 'object')
    ? {
      shape: resolveVar(Number(baseVar.shape), vShapeBase),
      anim: resolveVar(Number(baseVar.anim), vAnimBase),
      color: resolveVar(Number(baseVar.color), vColorBase),
      position: resolveVar(Number(baseVar.position), vPositionBase),
    }
    : {
      shape: resolveVar(Number(baseVar), vShapeBase),
      anim: resolveVar(Number(baseVar), vAnimBase),
      color: resolveVar(Number(baseVar), vColorBase),
      position: resolveVar(Number(baseVar), vPositionBase),
    };

  const wShape = clamp((v.shape || 0) / 3, 0, 1);
  const wAnim = clamp((v.anim || 0) / 3, 0, 1);
  const boostAboveOne = (x) => {
    let z = Number(x) || 0;
    if (z > 1) z = 1 + (z - 1) * 1.4;
    if (z < 0) z = 0;
    if (z > 3) z = 3;
    return z;
  };
  const wColor = clamp(boostAboveOne(v.color || 0) / 3, 0, 1);
  const wPosition = clamp((v.position || 0) / 3, 0, 1);

  const varyFlags = (prev?.vary || DEFAULT_LAYER.vary || {});
  const mixPosition = (pv, mn, mx, integer = false) => mix(pv, mn, mx, wPosition, integer);

  const lockShape = wShape === 0; // preserve geometry exactly, but allow other variation paths below
  const varied = lockShape
    ? JSON.parse(JSON.stringify(prev || DEFAULT_LAYER))
    : { ...(prev || DEFAULT_LAYER) };

  varied.name = `Layer ${nameIndex}`;
  if (!lockShape) {
    const rand = createSeededRandom(Math.random());
    const newSeed = rand();
    varied.seed = newSeed;
    varied.noiseSeed = newSeed;
  }
  varied.vary = { ...(prev?.vary || DEFAULT_LAYER.vary || {}) };
  // Preserve legacy and split variations
  varied.variation = Number(prev?.variation ?? DEFAULT_LAYER.variation);
  varied.variationShape = Number(v.shape);
  varied.variationAnim = Number(v.anim);
  varied.variationColor = Number(v.color);
  varied.variationPosition = Number(v.position);

  // Shape and appearance (use wShape)
  const mixShape = (pv, mn, mx, integer = false) => mix(pv, mn, mx, wShape, integer);
  if (!lockShape) {
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
  if (varyFlags.xOffset) {
    const baseXO = Number(prev.xOffset ?? 0);
    varied.xOffset = Number(mixPosition(baseXO, -0.5, 0.5).toFixed(3));
  }
  if (varyFlags.yOffset) {
    const baseYO = Number(prev.yOffset ?? 0);
    varied.yOffset = Number(mixPosition(baseYO, -0.5, 0.5).toFixed(3));
  }

  // Movement (use wAnim)
  const mixAnim = (pv, mn, mx, integer = false) => mix(pv, mn, mx, wAnim, integer);
  if (varyFlags.movementStyle && wAnim > 0.7 && Math.random() < wAnim) {
    const styles = ['bounce', 'drift', 'still'];
    const cur = prev.movementStyle ?? DEFAULT_LAYER.movementStyle;
    const others = styles.filter(s => s !== cur);
    varied.movementStyle = (others[Math.floor(Math.random() * others.length)] || cur);
  }
  if (varyFlags.movementSpeed) varied.movementSpeed = Number(mixAnim(prev.movementSpeed ?? 1, 0, 5).toFixed(3));
  if (varyFlags.movementAngle) {
    const nextA = mixAnim(prev.movementAngle ?? 45, 0, 360, true);
    varied.movementAngle = ((nextA % 360) + 360) % 360;
  }
  if (varyFlags.scaleSpeed) varied.scaleSpeed = Number(mixAnim(prev.scaleSpeed ?? 0.05, 0, 0.2).toFixed(3));
  let nextScaleMin = prev.scaleMin ?? 0.2;
  let nextScaleMax = prev.scaleMax ?? 1.5;
  if (varyFlags.scaleMin) nextScaleMin = mixAnim(prev.scaleMin ?? 0.2, 0.1, 2);
  if (varyFlags.scaleMax) nextScaleMax = mixAnim(prev.scaleMax ?? 1.5, 0.5, 3);
  varied.scaleMin = Math.min(nextScaleMin, nextScaleMax);
  varied.scaleMax = Math.max(nextScaleMin, nextScaleMax);

  // Image effects (treat as animation/appearance; use wAnim)
  if (varyFlags.imageBlur) varied.imageBlur = Number(mixAnim(prev.imageBlur ?? 0, 0, 20).toFixed(2));
  if (varyFlags.imageBrightness) varied.imageBrightness = Math.round(mixAnim(prev.imageBrightness ?? 100, 0, 200, true));
  if (varyFlags.imageContrast) varied.imageContrast = Math.round(mixAnim(prev.imageContrast ?? 100, 0, 200, true));
  if (varyFlags.imageHue) {
    const nextHue = mixAnim(prev.imageHue ?? 0, 0, 360, true);
    varied.imageHue = ((nextHue % 360) + 360) % 360;
  }
  if (varyFlags.imageSaturation) varied.imageSaturation = Math.round(mixAnim(prev.imageSaturation ?? 100, 0, 200, true));
  if (varyFlags.imageDistortion) varied.imageDistortion = Number(mixAnim(prev.imageDistortion ?? 0, 0, 50).toFixed(2));

  // Position jitter (use wAnim)
  const baseX = prev.position?.x ?? 0.5;
  const baseY = prev.position?.y ?? 0.5;
  const jitter = 0.15 * wAnim;
  const jx = (Math.random() * 2 - 1) * jitter;
  const jy = (Math.random() * 2 - 1) * jitter;
  const nx = clamp(baseX + jx, 0.0, 1.0);
  const ny = clamp(baseY + jy, 0.0, 1.0);
  varied.position = {
    ...(prev.position || DEFAULT_LAYER.position),
    x: nx,
    y: ny,
    scale: prev.position?.scale ?? 1.0,
    scaleDirection: prev.position?.scaleDirection ?? 1,
  };

  // Recompute velocity from angle/speed
  {
    const angleRad = (varied.movementAngle ?? prev.movementAngle ?? 0) * (Math.PI / 180);
    const spd = (varied.movementSpeed ?? prev.movementSpeed ?? 0) * 0.001;
    varied.vx = Math.cos(angleRad) * spd;
    varied.vy = Math.sin(angleRad) * spd;
  }

  // Colors (use wColor) — unified thresholds like Randomize All
  if (Array.isArray(prev.colors) && prev.colors.length) {
    if (varyFlags.colors) {
      if (wColor <= 0) {
        varied.colors = [...prev.colors];
        varied.numColors = prev.numColors ?? prev.colors.length;
      } else if (wColor >= 0.6) {
        const nextPalette = pickPaletteColors(palettes, Math.random, prev.colors) || prev.colors;
        varied.colors = Array.isArray(nextPalette) && nextPalette.length ? [...nextPalette] : [...prev.colors];
        varied.numColors = varied.colors.length;
      } else if (wColor >= 0.15) {
        const uniqueCount = (() => {
          try { return new Set(prev.colors.map(c => (c || '').toLowerCase())).size; }
          catch { return prev.colors.length; }
        })();
        if (uniqueCount <= 1) {
          const amt = Math.max(0.02, wColor);
          const hueMax = 1 + 24 * (amt * amt);
          const satMax = 1 + 18 * (amt * amt);
          const lightMax = 1 + 18 * (amt * amt);
          const perturbed = (prev.colors || []).map(hex => {
            const toHsl = (h) => {
              const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(h || '');
              let R = 0, G = 0, B = 0;
              if (m) { R = parseInt(m[1], 16); G = parseInt(m[2], 16); B = parseInt(m[3], 16); }
              const r1 = R / 255, g1 = G / 255, b1 = B / 255;
              const max = Math.max(r1, g1, b1), min = Math.min(r1, g1, b1);
              let hh = 0, ss = 0; const ll = (max + min) / 2;
              if (max !== min) {
                const d = max - min;
                ss = ll > 0.5 ? d / (2 - max - min) : d / (max - min);
                switch (max) {
                  case r1: hh = (g1 - b1) / d + (g1 < b1 ? 6 : 0); break;
                  case g1: hh = (b1 - r1) / d + 2; break;
                  case b1: hh = (r1 - g1) / d + 4; break;
                  default: break;
                }
                hh /= 6;
              }
              return { h: hh * 360, s: ss * 100, l: ll * 100 };
            };
            const fromHsl = (h, s, l) => {
              const s1 = s / 100, l1 = l / 100;
              const c = (1 - Math.abs(2 * l1 - 1)) * s1;
              const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
              const m = l1 - c / 2;
              let r = 0, g = 0, b = 0;
              if (h < 60) { r = c; g = x; b = 0; }
              else if (h < 120) { r = x; g = c; b = 0; }
              else if (h < 180) { r = 0; g = c; b = x; }
              else if (h < 240) { r = 0; g = x; b = c; }
              else if (h < 300) { r = x; g = 0; b = c; }
              else { r = c; g = 0; b = x; }
              const toHex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
              return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
            };
            const { h, s, l } = toHsl(hex);
            const h2 = ((h + (Math.random() * 2 - 1) * hueMax) % 360 + 360) % 360;
            const s2 = Math.max(0, Math.min(100, s + (Math.random() * 2 - 1) * satMax));
            const l2 = Math.max(0, Math.min(100, l + (Math.random() * 2 - 1) * lightMax));
            return fromHsl(h2, s2, l2);
          });
          varied.colors = perturbed;
          varied.numColors = perturbed.length;
        } else {
          const arr = [...prev.colors];
          for (let i = arr.length - 1; i > 0; i--) {
            if (Math.random() < 0.5 * wColor) {
              const j = Math.floor(Math.random() * (i + 1));
              [arr[i], arr[j]] = [arr[j], arr[i]];
            }
          }
          const same = arr.length === prev.colors.length && arr.every((c, i) => c === prev.colors[i]);
          varied.colors = same ? [...arr.slice(1), arr[0]] : [...arr];
          varied.numColors = arr.length;
        }
      } else if (wColor > 0) {
        // Subtle HSL perturbation for perceptual similarity
        const amt = Math.max(0.05, wColor);
        const hueMax = 2 + 8 * amt;
        const satMax = 2 + 6 * amt;
        const lightMax = 2 + 6 * amt;
        const perturbed = (prev.colors || []).map(hex => {
          const toHsl = (h) => {
            const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(h || '');
            let R = 0, G = 0, B = 0;
            if (m) { R = parseInt(m[1], 16); G = parseInt(m[2], 16); B = parseInt(m[3], 16); }
            const r1 = R / 255, g1 = G / 255, b1 = B / 255;
            const max = Math.max(r1, g1, b1), min = Math.min(r1, g1, b1);
            let hh = 0, ss = 0; const ll = (max + min) / 2;
            if (max !== min) {
              const d = max - min;
              ss = ll > 0.5 ? d / (2 - max - min) : d / (max - min);
              switch (max) {
                case r1: hh = (g1 - b1) / d + (g1 < b1 ? 6 : 0); break;
                case g1: hh = (b1 - r1) / d + 2; break;
                case b1: hh = (r1 - g1) / d + 4; break;
                default: break;
              }
              hh /= 6;
            }
            return { h: hh * 360, s: ss * 100, l: ll * 100 };
          };
          const fromHsl = (h, s, l) => {
            const s1 = s / 100, l1 = l / 100;
            const c = (1 - Math.abs(2 * l1 - 1)) * s1;
            const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
            const m = l1 - c / 2;
            let r = 0, g = 0, b = 0;
            if (h < 60) { r = c; g = x; b = 0; }
            else if (h < 120) { r = x; g = c; b = 0; }
            else if (h < 180) { r = 0; g = c; b = x; }
            else if (h < 240) { r = 0; g = x; b = c; }
            else if (h < 300) { r = x; g = 0; b = c; }
            else { r = c; g = 0; b = x; }
            const toHex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
            return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
          };
          const { h, s, l } = toHsl(hex);
          const h2 = ((h + (Math.random() * 2 - 1) * hueMax) % 360 + 360) % 360;
          const s2 = Math.max(0, Math.min(100, s + (Math.random() * 2 - 1) * satMax));
          const l2 = Math.max(0, Math.min(100, l + (Math.random() * 2 - 1) * lightMax));
          return fromHsl(h2, s2, l2);
        });
        varied.colors = perturbed;
        varied.numColors = perturbed.length;
      } else {
        varied.colors = [...prev.colors];
        varied.numColors = prev.numColors ?? prev.colors.length;
      }
    } else {
      varied.colors = [...prev.colors];
      varied.numColors = prev.numColors ?? prev.colors.length;
    }
  }

  if (!lockShape) {
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
              const k = Math.floor(Math.random() * N);
              const next = (k + 1) % N;
              nodes.splice(next, 0, { x: (nodes[k].x + nodes[next].x) / 2, y: (nodes[k].y + nodes[next].y) / 2 });
            }
          }
        }
        const jitterAmt = 0.12 * wShape;
        varied.nodes = nodes.map(n => ({
          x: Math.max(-1, Math.min(1, n.x + (Math.random() * 2 - 1) * jitterAmt)),
          y: Math.max(-1, Math.min(1, n.y + (Math.random() * 2 - 1) * jitterAmt)),
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
