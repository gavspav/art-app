import { useMemo } from 'react';
import { hslToHex, hexToHsl } from '../utils/colorUtils.js';
import { clamp } from '../utils/mathUtils.js';
import { createSeededRandom } from '../utils/random.js';
import { getColorsFromPalette, pickPaletteColors } from '../utils/paletteUtils.js';
// Randomization hook: provides modern/classic/randomize-layer/scene functions
export function useRandomization({
  // inputs and helpers
  parameters,
  DEFAULT_LAYER,
  palettes,
  blendModes,
  layers,
  selectedLayerIndex: _selectedLayerIndex,
  randomizePalette,
  randomizeNumColors,
  colorCountMin = 1,
  colorCountMax = 8,
  classicMode,
  seed,
  // helpers
  sampleColorsEven,
  assignOneColorPerLayer: _assignOneColorPerLayer,
  rotationVaryAcrossLayers = true,
  getIsRnd,
  // setters
  setLayers,
  setSelectedLayerIndex,
  setBackgroundColor,
  setGlobalBlendMode,
  setGlobalSpeedMultiplier,
}) {
  // Seeded RNG persistent across renders for deterministic but varying sequences
  const rand = useMemo(() => (
    Number.isFinite(seed) ? createSeededRandom(Number(seed)) : Math.random
  ), [seed]);

  // Local mix using seeded RNG
  const mixRand = (baseVal, min, max, w, integer = false) => {
    const rnd = min + rand() * Math.max(0, (max - min));
    let next = baseVal * (1 - w) + rnd * w;
    next = clamp(next, min, max);
    if (integer) next = Math.round(next);
    return next;
  };
  const wrapTo180 = (deg) => (((deg + 180) % 360) + 360) % 360 - 180;
  const randomBackgroundColor = () => {
    const h = Math.floor(rand() * 360);
    const s = Math.floor(40 + rand() * 40);
    const l = Math.floor(25 + rand() * 55);
    return hslToHex(h, s, l);
  };

  // Subtle HSL perturbation helper for colour arrays (perceptual)
  const perturbColorsHSL = (arr, amount, rnd) => {
    const out = [];
    const a = Math.max(0, Math.min(1, amount || 0));
    // Nonlinear scaling (quadratic) so low amounts cause very small shifts
    const aN = a * a;
    const hueMax = 1 + 24 * aN;     // ~1deg at tiny values up to ~25deg at a=1
    const satMax = 1 + 18 * aN;     // percentage points
    const lightMax = 1 + 18 * aN;   // percentage points
    for (let i = 0; i < arr.length; i++) {
      const hex = arr[i] || '#000000';
      const { h, s, l } = hexToHsl(hex);
      const h2 = ((h + (rnd() * 2 - 1) * hueMax) % 360 + 360) % 360;
      const s2 = Math.max(0, Math.min(100, s + (rnd() * 2 - 1) * satMax));
      const l2 = Math.max(0, Math.min(100, l + (rnd() * 2 - 1) * lightMax));
      out.push(hslToHex(h2, s2, l2));
    }
    return out;
  };

  const randomizeLayer = (index, _forcePalette = false) => {
    const randomizableParams = parameters.filter(p => p.isRandomizable);
    const idx = Math.max(0, Math.min(Number.isFinite(index) ? index : 0, Math.max(0, layers.length - 1)));
    const layer = layers[idx];
    const newProps = {};

    randomizableParams.forEach(param => {
      if (param.id === 'opacity') return; // avoid per-layer opacity
      if (layer.layerType === 'image' && param.group === 'Shape') return;
      switch (param.type) {
        case 'slider': {
          const rmin = Number.isFinite(param.randomMin) ? param.randomMin : param.min;
          const rmax = Number.isFinite(param.randomMax) ? param.randomMax : param.max;
          const low = Math.min(rmin ?? param.min, rmax ?? param.max);
          const high = Math.max(rmin ?? param.min, rmax ?? param.max);
          let rawValue = low + rand() * (high - low);
          rawValue = Math.min(param.max, Math.max(param.min, rawValue));
          const finalValue = param.step === 1 ? Math.round(rawValue) : rawValue;
          newProps[param.id] = finalValue;
          break;
        }
        default:
          if (param.type === 'dropdown' && param.options) {
            newProps[param.id] = param.options[Math.floor(rand() * param.options.length)];
          }
      }
    });

    // Color randomization via global toggles
    const doPalette = !!randomizePalette;
    const doCount = !!randomizeNumColors;
    if (doPalette || doCount) {
      const baseColors = Array.isArray(layer.colors) ? layer.colors : [];
      const currentN = Number.isFinite(layer.numColors) ? layer.numColors : (baseColors.length || 0);
      let nextPalette = baseColors;
      if (doPalette) {
        const colors = pickPaletteColors(palettes, rand, baseColors);
        nextPalette = colors.length ? colors : baseColors;
      }
      let nextN = currentN;
      if (doCount) {
        const cMin = Math.max(1, Math.floor(colorCountMin));
        const cMaxCap = Math.max(cMin, Math.floor(colorCountMax));
        const maxN = Math.min(cMaxCap, (nextPalette.length || cMaxCap));
        const minN = cMin;
        nextN = Math.max(1, Math.floor(rand() * (maxN - minN + 1)) + minN);
      }
      const nextColors = sampleColorsEven(nextPalette.length ? nextPalette : baseColors, nextN || currentN || 1);
      newProps.colors = nextColors;
      newProps.numColors = nextColors.length;
      newProps.selectedColor = 0;
    }

    const updatedLayer = { ...(layers[idx] || DEFAULT_LAYER), ...newProps };
    if (newProps.movementAngle !== undefined || newProps.movementSpeed !== undefined) {
      const angleRad = updatedLayer.movementAngle * (Math.PI / 180);
      updatedLayer.vx = Math.cos(angleRad) * (updatedLayer.movementSpeed * 0.001) * 1.0;
      updatedLayer.vy = Math.sin(angleRad) * (updatedLayer.movementSpeed * 0.001) * 1.0;
    }
    return updatedLayer;
  };

  const randomizeAnimationOnly = (index) => {
    const idx = Math.max(0, Math.min(Number.isFinite(index) ? index : 0, Math.max(0, layers.length - 1)));
    const layer = layers[idx];
    if (!layer) return null;
    const sampleSliderParam = (id, defMin, defMax, roundInt = false) => {
      const p = parameters.find(pp => pp.id === id);
      if (p && p.type === 'slider') {
        const rmin = Number.isFinite(p.randomMin) ? p.randomMin : p.min;
        const rmax = Number.isFinite(p.randomMax) ? p.randomMax : p.max;
        const low = Math.min(rmin ?? p.min, rmax ?? p.max);
        const high = Math.max(rmin ?? p.min, rmax ?? p.max);
        let v = low + rand() * (high - low);
        v = Math.min(p.max, Math.max(p.min, v));
        return p.step === 1 || roundInt ? Math.round(v) : v;
      }
      let v = defMin + rand() * (defMax - defMin);
      return roundInt ? Math.round(v) : v;
    };
    const newProps = {};
    newProps.movementSpeed = sampleSliderParam('movementSpeed', 0, 5);
    newProps.movementAngle = ((sampleSliderParam('movementAngle', 0, 360, true) % 360) + 360) % 360;
    newProps.scaleSpeed = sampleSliderParam('scaleSpeed', 0, 1);
    // Also randomize noise and wobble as part of animation dice
    // Use parameter metadata if available; otherwise fall back to sensible defaults
    newProps.wobble = sampleSliderParam('wobble', 0, 1);
    newProps.noiseAmount = sampleSliderParam('noiseAmount', 0, 10);
    const updated = { ...layer, ...newProps };
    const angleRad = updated.movementAngle * (Math.PI / 180);
    updated.vx = Math.cos(angleRad) * (updated.movementSpeed * 0.001) * 1.0;
    updated.vy = Math.sin(angleRad) * (updated.movementSpeed * 0.001) * 1.0;
    return updated;
  };

  const modernRandomizeAll = () => {
    const incBG = getIsRnd('backgroundColor');
    const incSpeed = getIsRnd('globalSpeedMultiplier');
    const incBlend = getIsRnd('globalBlendMode');
    const incOpacity = getIsRnd('globalOpacity');
    const incLayers = getIsRnd('layersCount');
    const incPalette = getIsRnd('globalPaletteIndex');
    const incRotation = getIsRnd('rotation');

    const getParam = (id) => parameters.find(p => p.id === id);

    const layersParam = parameters.find(p => p.id === 'layersCount');
    const defMinL = Number.isFinite(layersParam?.min) ? layersParam.min : 1;
    const defMaxL = Number.isFinite(layersParam?.max) ? layersParam.max : 8;
    const layerCount = incLayers
      ? Math.floor(rand() * (defMaxL - defMinL + 1)) + defMinL
      : layers.length;

    // Pick a scene palette. If Include (palette) is ON, try to avoid re-picking the current base palette for visible change.
    let sceneColors = pickPaletteColors(palettes, rand, []);
    const currentBase = Array.isArray(layers?.[0]?.colors) ? layers[0].colors : [];
    if (incPalette) {
      const curKey = JSON.stringify(currentBase);
      let guard = 0;
      // Try a few times to get a different palette than current
      while (JSON.stringify(sceneColors) === curKey && guard++ < 5) {
        sceneColors = pickPaletteColors(palettes, rand, currentBase.length ? currentBase : []);
      }
    }
    const currentN = Number.isFinite(layers?.[0]?.numColors) ? layers[0].numColors : (currentBase.length || 3);
    // If Global Include (palette) is OFF, keep current base; when ON, use a single scene palette
    if (!incPalette) {
      sceneColors = currentBase.length ? currentBase : (sceneColors || []);
    }
    const cMin = Math.max(1, Math.floor(colorCountMin));
    const cMaxCap = Math.max(cMin, Math.floor(colorCountMax));
    const sceneMaxN = Math.min(cMaxCap, (sceneColors.length || currentN || cMaxCap));
    const sceneMinN = cMin;
    const sceneN = randomizeNumColors
      ? (sceneMaxN > 0 ? Math.floor(rand() * (sceneMaxN - sceneMinN + 1)) + sceneMinN : currentN)
      : currentN;
    const baseColors = (sceneColors.length || currentBase.length)
      ? sampleColorsEven(sceneColors.length ? sceneColors : currentBase, Math.max(1, sceneN))
      : ["#FFC300", "#FF5733", "#C70039"];

    const layersOut = [];
    // Variation intensities: separate shape/anim/color paths
    const includeVarShape = !!getIsRnd('variationShape');
    const includeVarAnim = !!getIsRnd('variationAnim');
    const includeVarColor = !!getIsRnd('variationColor');
    const pVarShape = parameters.find(p => p.id === 'variationShape');
    const pVarAnim = parameters.find(p => p.id === 'variationAnim');
    const pVarColor = parameters.find(p => p.id === 'variationColor');
    const currentShape = Number(layers?.[0]?.variationShape ?? layers?.[0]?.variation ?? DEFAULT_LAYER.variationShape);
    const currentAnim = Number(layers?.[0]?.variationAnim ?? layers?.[0]?.variation ?? DEFAULT_LAYER.variationAnim);
    const currentColor = Number(layers?.[0]?.variationColor ?? layers?.[0]?.variation ?? DEFAULT_LAYER.variationColor);
    const sampleVarFromParam = (param, fallback) => {
      if (!param || param.type !== 'slider') return fallback;
      const rmin = Number.isFinite(param.randomMin) ? param.randomMin : param.min;
      const rmax = Number.isFinite(param.randomMax) ? param.randomMax : param.max;
      const low = Math.min(rmin ?? param.min, rmax ?? param.max);
      const high = Math.max(rmin ?? param.min, rmax ?? param.max);
      let v = low + rand() * (high - low);
      return clamp(v, param.min, param.max);
    };
    const sampledShape = includeVarShape ? sampleVarFromParam(pVarShape, currentShape) : currentShape;
    const sampledAnim = includeVarAnim ? sampleVarFromParam(pVarAnim, currentAnim) : currentAnim;
    const sampledColor = includeVarColor ? sampleVarFromParam(pVarColor, currentColor) : currentColor;
    const boostAboveOne = (v) => {
      let x = Number(v) || 0;
      if (x > 1) x = 1 + (x - 1) * 1.4;
      if (x < 0) x = 0; if (x > 3) x = 3;
      return x;
    };
    // If rotation should not vary across layers, sample one rotation (for the Rotate slider)
    const uniformRotation = (() => {
      if (!incRotation || rotationVaryAcrossLayers) return null;
      const base = mixRand(layers?.[0]?.rotation ?? 0, -180, 180, 1, true);
      return wrapTo180(base);
    })();

    for (let idx = 0; idx < Math.max(1, layerCount); idx++) {
      const prev = layers[idx] || DEFAULT_LAYER;
      const varied = { ...prev };

      // Variation weights come from the sampled per-category values
      const wShape = clamp((Number(sampledShape) || 0) / 3, 0, 1);
      const wAnim = clamp((Number(sampledAnim) || 0) / 3, 0, 1);
      const wColor = clamp(boostAboveOne(sampledColor) / 3, 0, 1);

      // IMPORTANT: Randomize All should affect core properties regardless of per-layer vary flags.
      // Use variation only to scale the intensity of the change.
      varied.numSides = Math.max(3, Math.round(mixRand(prev.numSides ?? DEFAULT_LAYER.numSides, 3, 20, wShape, true)));
      varied.curviness = Number(mixRand(prev.curviness ?? DEFAULT_LAYER.curviness, 0, 1, wShape).toFixed(3));
      varied.noiseAmount = Number(mixRand(prev.noiseAmount ?? DEFAULT_LAYER.noiseAmount, 0, 10, wShape).toFixed(2));
      varied.wobble = Number(mixRand(prev.wobble ?? DEFAULT_LAYER.wobble, 0, 1, wShape).toFixed(3));
      // Use relative size instead of pixel width/height
      const baseRF = Number(prev.radiusFactor ?? DEFAULT_LAYER.radiusFactor ?? 0.4);
      const rfMin = 0.05, rfMax = 0.45;
      varied.radiusFactor = Number(mixRand(baseRF, rfMin, rfMax, wShape).toFixed(3));
      // X/Y offsets (screen-relative), vary with shape weight
      const pXO = getParam('xOffset');
      const pYO = getParam('yOffset');
      const allowXO = pXO ? !!pXO.isRandomizable : true;
      const allowYO = pYO ? !!pYO.isRandomizable : true;
      const baseXO = Number(prev.xOffset ?? 0);
      const baseYO = Number(prev.yOffset ?? 0);
      const xoMin = Number.isFinite(pXO?.randomMin) ? pXO.randomMin : (Number.isFinite(pXO?.min) ? pXO.min : -0.5);
      const xoMax = Number.isFinite(pXO?.randomMax) ? pXO.randomMax : (Number.isFinite(pXO?.max) ? pXO.max : 0.5);
      const yoMin = Number.isFinite(pYO?.randomMin) ? pYO.randomMin : (Number.isFinite(pYO?.min) ? pYO.min : -0.5);
      const yoMax = Number.isFinite(pYO?.randomMax) ? pYO.randomMax : (Number.isFinite(pYO?.max) ? pYO.max : 0.5);
      if (allowXO) varied.xOffset = Number(mixRand(baseXO, xoMin, xoMax, wShape).toFixed(3));
      if (allowYO) varied.yOffset = Number(mixRand(baseYO, yoMin, yoMax, wShape).toFixed(3));

      // Movement
      // Randomize movement style with a probability scaled by variation weight; otherwise keep previous
      {
        const styles = ['bounce', 'drift', 'still'];
        const cur = prev.movementStyle ?? DEFAULT_LAYER.movementStyle;
        let nextStyle = cur;
        const changeProb = Math.max(0.3, wAnim); // ensure some chance even at low variation
        if (styles.length && rand() < changeProb) {
          const others = styles.filter(s => s !== cur);
          const pool = others.length ? others : styles;
          nextStyle = pool[Math.floor(rand() * pool.length)];
        }
        varied.movementStyle = nextStyle;
      }
      varied.movementSpeed = Number(mixRand(prev.movementSpeed ?? DEFAULT_LAYER.movementSpeed, 0, 5, wAnim).toFixed(3));
      if (incRotation) {
        const nextRot = (uniformRotation !== null)
          ? uniformRotation
          : wrapTo180(mixRand(prev.rotation ?? 0, -180, 180, 1, true));
        varied.rotation = nextRot;
      }

      // Scale
      varied.scaleSpeed = Number(mixRand(prev.scaleSpeed ?? 0.05, 0, 0.2, wAnim).toFixed(3));
      let nextScaleMin = prev.scaleMin ?? 0.2;
      let nextScaleMax = prev.scaleMax ?? 1.5;
      // Keep scale bounds as non-randomizable defaults; do not change unless your design later permits
      varied.scaleMin = Math.min(nextScaleMin, nextScaleMax);
      varied.scaleMax = Math.max(nextScaleMin, nextScaleMax);

      // Position jitter
      const baseX = prev.position?.x ?? 0.5;
      const baseY = prev.position?.y ?? 0.5;
      const jitter = 0.15 * wAnim;
      const jx = (rand() * 2 - 1) * jitter;
      const jy = (rand() * 2 - 1) * jitter;
      const nx = clamp(baseX + jx, 0.0, 1.0);
      const ny = clamp(baseY + jy, 0.0, 1.0);
      varied.position = {
        ...(prev.position || DEFAULT_LAYER.position),
        x: nx,
        y: ny,
        scale: prev.position?.scale ?? 1.0,
        scaleDirection: prev.position?.scaleDirection ?? 1,
      };

      // Velocity recompute
      const angleRad = (varied.movementAngle ?? prev.movementAngle ?? 0) * (Math.PI / 180);
      varied.vx = Math.cos(angleRad) * ((varied.movementSpeed ?? prev.movementSpeed ?? 1) * 0.001) * 1.0;
      varied.vy = Math.sin(angleRad) * ((varied.movementSpeed ?? prev.movementSpeed ?? 1) * 0.001) * 1.0;

      // Colors (continuous response):
      // - wColor === 0: no change
      // - Otherwise: compute continuous perturbation magnitude; increase probability of shuffle and palette swap as w grows
      if (Array.isArray(prev.colors) && prev.colors.length) {
        if (wColor <= 0) {
          varied.colors = [...prev.colors];
          varied.numColors = prev.numColors ?? prev.colors.length;
        } else {
          // Continuous magnitudes and probabilities
          const uniqueCount = (() => { try { return new Set(prev.colors.map(c => (c || '').toLowerCase())).size; } catch { return prev.colors.length; } })();
          const amt = Math.max(0.02, wColor); // base magnitude
          // Quadratic easing so small w produce small changes, larger w accelerate
          const a2 = amt * amt;
          // Probabilities for operations
          const pPalette = Math.max(0, Math.min(1, (wColor - 0.5) / 0.5)); // 0 at 0.5, 1 at 1.0
          const pShuffle = Math.max(0, Math.min(1, (wColor - 0.1) / 0.5)); // start around 0.1, 1 by 0.6

          // First decide if we do a palette swap
          if (rand() < pPalette) {
            const currentKey = JSON.stringify(prev.colors);
            const candidates = palettes.filter(p => JSON.stringify(getColorsFromPalette(p)) !== currentKey);
            const pool = candidates.length ? candidates : palettes;
            const chosenArr = getColorsFromPalette(pool[Math.max(0, Math.min(pool.length - 1, Math.floor(rand() * pool.length)))]);
            varied.colors = Array.isArray(chosenArr) ? [...chosenArr] : [...prev.colors];
            varied.numColors = varied.colors.length;
          } else if (uniqueCount > 1 && rand() < pShuffle) {
            // Shuffle with fallback to ensure visible change
            const arr = [...prev.colors];
            for (let i = arr.length - 1; i > 0; i--) {
              if (rand() < 0.4 + 0.4 * a2) { // increase swap chance with w
                const j = Math.floor(rand() * (i + 1));
                [arr[i], arr[j]] = [arr[j], arr[i]];
              }
            }
            const same = arr.length === prev.colors.length && arr.every((c, i) => c === prev.colors[i]);
            varied.colors = same ? [...arr.slice(1), arr[0]] : [...arr];
            varied.numColors = arr.length;
          } else {
            // Subtle/strong perturbation depending on amt
            const perturbed = perturbColorsHSL(prev.colors, amt, rand);
            varied.colors = perturbed;
            varied.numColors = perturbed.length;
          }
        }
      }

      layersOut.push({ ...DEFAULT_LAYER, ...varied });
    }

    // Apply palette/numColors per requirement
    try {
      if (incPalette) {
        // Spread one distinct colour per layer from the global scene palette
        const singles = sampleColorsEven(baseColors, Math.max(1, layerCount));
        for (let i = 0; i < layersOut.length; i++) {
          const c = singles[i % singles.length];
          layersOut[i].colors = [c];
          layersOut[i].numColors = 1;
          layersOut[i].selectedColor = 0;
        }
      } else {
        // Respect per-layer color randomization settings (global toggles control behavior)
        for (let i = 0; i < layersOut.length; i++) {
          const prev = layers[i] || DEFAULT_LAYER;
          const curColors = Array.isArray(prev.colors) ? prev.colors : [];
          // Per-layer palette choice: if global randomizePalette is ON, pick per layer; else keep current
          const perLayerPalette = randomizePalette
            ? (pickPaletteColors(palettes, rand, curColors) || curColors)
            : curColors;
          const cMin = Math.max(1, Math.floor(colorCountMin));
          const cMaxCap = Math.max(cMin, Math.floor(colorCountMax));
          const maxN = Math.min(cMaxCap, (perLayerPalette.length || cMaxCap));
          const minN = cMin;
          const n = randomizeNumColors
            ? (maxN > 0 ? Math.floor(rand() * (maxN - minN + 1)) + minN : (curColors.length || 1))
            : (prev.numColors || curColors.length || 1);
          const next = sampleColorsEven(perLayerPalette.length ? perLayerPalette : curColors, Math.max(1, n));
          layersOut[i].colors = next;
          layersOut[i].numColors = next.length;
          layersOut[i].selectedColor = 0;
        }
      }
    } catch {}

    // Global opacity randomization (gated)
    if (incOpacity) {
      const p = getParam('globalOpacity');
      const omin = Number.isFinite(p?.min) ? p.min : 0;
      const omax = Number.isFinite(p?.max) ? p.max : 1;
      const oval = omin + rand() * Math.max(0, omax - omin);
      layersOut.forEach(l => { l.opacity = Number(oval.toFixed(2)); });
    }

    // Apply sampled base variations when included
    if (layersOut.length > 0) {
      if (includeVarShape) layersOut[0].variationShape = Number(sampledShape.toFixed ? sampledShape.toFixed(2) : sampledShape);
      if (includeVarAnim) layersOut[0].variationAnim = Number(sampledAnim.toFixed ? sampledAnim.toFixed(2) : sampledAnim);
      if (includeVarColor) layersOut[0].variationColor = Number(sampledColor.toFixed ? sampledColor.toFixed(2) : sampledColor);
    }

    setLayers(layersOut.map((l, idx) => ({ ...l, name: `Layer ${idx + 1}` })));
    setSelectedLayerIndex(0);

    // Background
    if (incBG) setBackgroundColor(randomBackgroundColor());
    // Blend
    if (incBlend) setGlobalBlendMode(blendModes[Math.floor(rand() * blendModes.length)]);
    // Speed
    if (incSpeed) {
      const p = getParam('globalSpeedMultiplier');
      const smin = Number.isFinite(p?.min) ? p.min : 0;
      const smax = Number.isFinite(p?.max) ? p.max : 5;
      const sval = smin + rand() * Math.max(0, smax - smin);
      setGlobalSpeedMultiplier(Number(sval.toFixed(2)));
    }
  };

  const classicRandomizeAll = () => {
    const rnd = rand;
    const incBG = getIsRnd('backgroundColor');
    const incSpeed = getIsRnd('globalSpeedMultiplier');
    const incBlend = getIsRnd('globalBlendMode');
    const incOpacity = getIsRnd('globalOpacity');
    const incLayers = getIsRnd('layersCount');
    const incPalette = getIsRnd('globalPaletteIndex');
    const incRotation = getIsRnd('rotation');
    const incVarShape = getIsRnd('variationShape');
    const incVarAnim = getIsRnd('variationAnim');
    const incVarColor = getIsRnd('variationColor');

    // Variation handling (base layer): preserve unless included, then sample
    const pVS = parameters.find(p => p.id === 'variationShape');
    const pVA = parameters.find(p => p.id === 'variationAnim');
    const pVC = parameters.find(p => p.id === 'variationColor');
    const prevVS = Number(layers?.[0]?.variationShape ?? layers?.[0]?.variation ?? DEFAULT_LAYER.variationShape);
    const prevVA = Number(layers?.[0]?.variationAnim ?? layers?.[0]?.variation ?? DEFAULT_LAYER.variationAnim);
    const prevVC = Number(layers?.[0]?.variationColor ?? layers?.[0]?.variation ?? DEFAULT_LAYER.variationColor);
    const sampleClassic = (p, fb) => {
      if (!p || p.type !== 'slider') return fb;
      const rmin = Number.isFinite(p.randomMin) ? p.randomMin : p.min;
      const rmax = Number.isFinite(p.randomMax) ? p.randomMax : p.max;
      const low = Math.min(rmin ?? p.min, rmax ?? p.max);
      const high = Math.max(rmin ?? p.min, rmax ?? p.max);
      let v = low + rnd() * (high - low);
      return clamp(v, p.min, p.max);
    };
    const sampledVS = incVarShape ? sampleClassic(pVS, prevVS) : prevVS;
    const sampledVA = incVarAnim ? sampleClassic(pVA, prevVA) : prevVA;
    const sampledVC = incVarColor ? sampleClassic(pVC, prevVC) : prevVC;

    // Scene palette
    let baseColors = pickPaletteColors(palettes, rnd, []);
    const currentBase = Array.isArray(layers?.[0]?.colors) ? layers[0].colors : [];
    const currentN = Number.isFinite(layers?.[0]?.numColors) ? layers[0].numColors : (currentBase.length || 3);
    // Only change global base colors if Include (palette) is ON
    if (!incPalette) baseColors = currentBase.length ? currentBase : baseColors;
    if (randomizeNumColors) {
      const maxN = Math.min(5, baseColors.length || 5);
      const minN = Math.min(3, maxN);
      const n = Math.floor(rnd() * (maxN - minN + 1)) + minN;
      baseColors = sampleColorsEven(baseColors, n);
    } else {
      baseColors = sampleColorsEven(baseColors, Math.max(1, currentN));
    }

    // Layers count
    const layersParam = parameters.find(p => p.id === 'layersCount');
    const defMinL = Number.isFinite(layersParam?.min) ? layersParam.min : 1;
    const defMaxL = Number.isFinite(layersParam?.max) ? layersParam.max : 20;
    const layerCount = incLayers ? (Math.floor(rnd() * (defMaxL - defMinL + 1)) + defMinL) : layers.length;

    // If rotation should not vary across layers, sample once (classic) for Rotate slider
    const classicUniformRotation = (!incRotation || rotationVaryAcrossLayers)
      ? null
      : (((Math.floor(rnd() * 360) + 180) % 360) - 180);

    const buildLayer = (idx) => {
      const layer = { ...DEFAULT_LAYER };
      layer.name = `Layer ${idx + 1}`;
      layer.layerType = 'shape';
      layer.seed = rnd();
      layer.noiseSeed = rnd();
      layer.numSides = Math.floor(3 + rnd() * 17);
      layer.curviness = Number((0.3 + rnd() * 1.2).toFixed(3));
      layer.wobble = rnd();
      layer.noiseAmount = Number((rnd() * 8).toFixed(2));
      // Relative size in classic mode as well
      layer.radiusFactor = Number((0.05 + rnd() * 0.4).toFixed(3));
      layer.colors = baseColors;
      layer.numColors = baseColors.length;
      layer.opacity = Number(layers?.[0]?.opacity ?? 0.8);
      layer.movementStyle = 'bounce';
      // movementAngle remains independent; do not gate by rotation include flag
      layer.movementAngle = layers?.[idx]?.movementAngle ?? DEFAULT_LAYER.movementAngle;
      // Apply rotation when included
      if (incRotation) {
        const r = (classicUniformRotation !== null) ? classicUniformRotation : (((Math.floor(rnd() * 360) + 180) % 360) - 180);
        layer.rotation = r;
      } else {
        layer.rotation = layers?.[idx]?.rotation ?? 0;
      }
      layer.movementSpeed = Number((Math.pow(rnd(), 4) * 5).toFixed(3));
      const angleRad = layer.movementAngle * (Math.PI / 180);
      layer.vx = Math.cos(angleRad) * (layer.movementSpeed * 0.001);
      layer.vy = Math.sin(angleRad) * (layer.movementSpeed * 0.001);
      // Randomize Z scale parameters for variety (independent of include flags)
      // scaleSpeed in [0, 0.2], biased toward small
      layer.scaleSpeed = Number((rnd() * 0.2).toFixed(3));
      // scaleMin in [0, 0.8]
      const sMin = Math.max(0, Math.min(0.8, Number((rnd() * 0.8).toFixed(2))));
      // scaleMax at least sMin + 0.2, up to 2.0
      const sMaxCandidate = sMin + 0.2 + rnd() * 1.8;
      const sMax = Math.max(sMin + 0.2, Math.min(2.0, sMaxCandidate));
      layer.scaleMin = Number(sMin.toFixed(2));
      layer.scaleMax = Number(sMax.toFixed(2));
      layer.position = { ...DEFAULT_LAYER.position, x: rnd(), y: rnd(), scale: 1, scaleDirection: 1 };
      // Classic offsets: random within full allowed range
      layer.xOffset = Number((rnd() - 0.5).toFixed(3));
      layer.yOffset = Number((rnd() - 0.5).toFixed(3));
      // Apply base variations to base layer only; others will vary from this baseline when added later
      if (idx === 0) {
        layer.variationShape = sampledVS;
        layer.variationAnim = sampledVA;
        layer.variationColor = sampledVC;
        layer.variation = Number(layer.variation ?? sampledVS); // keep legacy populated
      }
      return layer;
    };

    const newLayers = Array.from({ length: layerCount }, (_, idx) => buildLayer(idx));

    // Base variations were set in buildLayer for idx 0

    // Apply colours based on Include flag for palette
    if (incPalette) {
      // Spread single colour per layer from the global base palette
      try {
        const singleColours = sampleColorsEven(baseColors, Math.max(1, layerCount));
        for (let i = 0; i < newLayers.length; i++) {
          const c = singleColours[i % singleColours.length];
          newLayers[i].colors = [c];
          newLayers[i].numColors = 1;
          newLayers[i].selectedColor = 0;
        }
      } catch {}
    } else {
      // Preserve previous per-layer colours and counts
      for (let i = 0; i < newLayers.length; i++) {
        const prev = layers[i];
        const cur = Array.isArray(prev?.colors) ? prev.colors : [];
        newLayers[i].colors = cur.length ? [...cur] : newLayers[i].colors;
        newLayers[i].numColors = Number.isFinite(prev?.numColors) ? prev.numColors : (cur.length || newLayers[i].numColors);
        newLayers[i].selectedColor = 0;
      }
    }

    if (incOpacity) {
      const p = parameters.find(pp => pp.id === 'globalOpacity');
      const omin = Number.isFinite(p?.min) ? p.min : 0;
      const omax = Number.isFinite(p?.max) ? p.max : 1;
      const oval = omin + rnd() * Math.max(0, omax - omin);
      newLayers.forEach(l => { l.opacity = Number(oval.toFixed(2)); });
    }

    setLayers(newLayers);
    setSelectedLayerIndex(0);

    if (incBG) setBackgroundColor(randomBackgroundColor());
    if (incBlend && Array.isArray(blendModes) && blendModes.length) {
      setGlobalBlendMode(blendModes[Math.floor(rnd() * blendModes.length)]);
    }
    if (incSpeed) {
      const p = parameters.find(pp => pp.id === 'globalSpeedMultiplier');
      const smin = Number.isFinite(p?.min) ? p.min : 0;
      const smax = Number.isFinite(p?.max) ? p.max : 5;
      const sval = smin + rnd() * Math.max(0, smax - smin);
      setGlobalSpeedMultiplier(Number(sval.toFixed(2)));
    }
  };

  const randomizeScene = () => {
    if (classicMode) return classicRandomizeAll();
    const newLayers = layers.map((_, index) => randomizeLayer(index));
    setLayers(newLayers);
    setBackgroundColor(randomBackgroundColor());
  };

  return { modernRandomizeAll, classicRandomizeAll, randomizeLayer, randomizeAnimationOnly, randomizeScene };
}
