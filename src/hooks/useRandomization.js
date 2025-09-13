import { useMemo } from 'react';
import { hslToHex } from '../utils/colorUtils.js';
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
    // Decide variation intensity source:
    // - Always use the current base layer's variation value to drive intensity
    // - If the user included 'variation' in Randomize All, resample a new variation value from parameter metadata
    const includeVar = !!getIsRnd('variation');
    const pVar = parameters.find(p => p.id === 'variation');
    const currentBaseVariation = Number(layers?.[0]?.variation ?? DEFAULT_LAYER.variation);
    const sampledVariation = (() => {
      if (!includeVar || !pVar || pVar.type !== 'slider') return currentBaseVariation;
      const rmin = Number.isFinite(pVar.randomMin) ? pVar.randomMin : pVar.min;
      const rmax = Number.isFinite(pVar.randomMax) ? pVar.randomMax : pVar.max;
      const low = Math.min(rmin ?? pVar.min, rmax ?? pVar.max);
      const high = Math.max(rmin ?? pVar.min, rmax ?? pVar.max);
      let v = low + rand() * (high - low);
      return clamp(v, pVar.min, pVar.max);
    })();
    // If rotation should not vary across layers, sample one rotation (for the Rotate slider)
    const uniformRotation = (() => {
      if (!incRotation || rotationVaryAcrossLayers) return null;
      const base = mixRand(layers?.[0]?.rotation ?? 0, -180, 180, 1, true);
      return wrapTo180(base);
    })();

    for (let idx = 0; idx < Math.max(1, layerCount); idx++) {
      const prev = layers[idx] || DEFAULT_LAYER;
      const varied = { ...prev };

      // Variation weight uses current or sampled variation value
      const baseVariation = sampledVariation;
      const w = clamp((Number(baseVariation) || 0) / 3, 0, 1);

      // IMPORTANT: Randomize All should affect core properties regardless of per-layer vary flags.
      // Use variation only to scale the intensity of the change.
      varied.numSides = Math.max(3, Math.round(mixRand(prev.numSides ?? DEFAULT_LAYER.numSides, 3, 20, w, true)));
      varied.curviness = Number(mixRand(prev.curviness ?? DEFAULT_LAYER.curviness, 0, 1, w).toFixed(3));
      varied.noiseAmount = Number(mixRand(prev.noiseAmount ?? DEFAULT_LAYER.noiseAmount, 0, 10, w).toFixed(2));
      varied.wobble = Number(mixRand(prev.wobble ?? DEFAULT_LAYER.wobble, 0, 1, w).toFixed(3));
      // Use relative size instead of pixel width/height
      const baseRF = Number(prev.radiusFactor ?? DEFAULT_LAYER.radiusFactor ?? 0.4);
      const rfMin = 0.05, rfMax = 0.45;
      varied.radiusFactor = Number(mixRand(baseRF, rfMin, rfMax, w).toFixed(3));

      // Movement
      // Randomize movement style with a probability scaled by variation weight; otherwise keep previous
      {
        const styles = ['bounce', 'drift', 'still'];
        const cur = prev.movementStyle ?? DEFAULT_LAYER.movementStyle;
        let nextStyle = cur;
        const changeProb = Math.max(0.3, w); // ensure some chance even at low variation
        if (styles.length && rand() < changeProb) {
          const others = styles.filter(s => s !== cur);
          const pool = others.length ? others : styles;
          nextStyle = pool[Math.floor(rand() * pool.length)];
        }
        varied.movementStyle = nextStyle;
      }
      varied.movementSpeed = Number(mixRand(prev.movementSpeed ?? DEFAULT_LAYER.movementSpeed, 0, 5, w).toFixed(3));
      if (incRotation) {
        const nextRot = (uniformRotation !== null)
          ? uniformRotation
          : wrapTo180(mixRand(prev.rotation ?? 0, -180, 180, 1, true));
        varied.rotation = nextRot;
      }

      // Scale
      varied.scaleSpeed = Number(mixRand(prev.scaleSpeed ?? 0.05, 0, 0.2, w).toFixed(3));
      let nextScaleMin = prev.scaleMin ?? 0.2;
      let nextScaleMax = prev.scaleMax ?? 1.5;
      // Keep scale bounds as non-randomizable defaults; do not change unless your design later permits
      varied.scaleMin = Math.min(nextScaleMin, nextScaleMax);
      varied.scaleMax = Math.max(nextScaleMin, nextScaleMax);

      // Position jitter
      const baseX = prev.position?.x ?? 0.5;
      const baseY = prev.position?.y ?? 0.5;
      const jitter = 0.15 * w;
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

      // Colors: small shuffle based on variation weight; not gated by vary flags
      if (Array.isArray(prev.colors) && prev.colors.length) {
        if (w >= 0.75) {
          const currentKey = JSON.stringify(prev.colors);
          const candidates = palettes.filter(p => JSON.stringify(getColorsFromPalette(p)) !== currentKey);
          const pool = candidates.length ? candidates : palettes;
          const chosenArr = getColorsFromPalette(pool[Math.max(0, Math.min(pool.length - 1, Math.floor(rand() * pool.length)))]);
          varied.colors = Array.isArray(chosenArr) ? [...chosenArr] : [];
          varied.numColors = varied.colors.length;
        } else if (w >= 0.4) {
          const arr = [...prev.colors];
          for (let i = arr.length - 1; i > 0; i--) {
            if (rand() < 0.5 * w) {
              const j = Math.floor(rand() * (i + 1));
              [arr[i], arr[j]] = [arr[j], arr[i]];
            }
          }
          varied.colors = [...arr];
          varied.numColors = arr.length;
        } else {
          varied.colors = [...prev.colors];
          varied.numColors = prev.numColors ?? prev.colors.length;
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

    // If variation was included, apply the newly sampled variation to the base layer
    if (includeVar && layersOut.length > 0) {
      layersOut[0].variation = Number(sampledVariation.toFixed ? sampledVariation.toFixed(2) : sampledVariation);
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
    const incVariation = getIsRnd('variation');

    // Variation handling (base layer): preserve unless included, then sample
    const pVar = parameters.find(p => p.id === 'variation');
    const prevBaseVar = Number(layers?.[0]?.variation ?? DEFAULT_LAYER.variation);
    const classicSampledVar = (() => {
      if (!incVariation || !pVar || pVar.type !== 'slider') return prevBaseVar;
      const rmin = Number.isFinite(pVar.randomMin) ? pVar.randomMin : pVar.min;
      const rmax = Number.isFinite(pVar.randomMax) ? pVar.randomMax : pVar.max;
      const low = Math.min(rmin ?? pVar.min, rmax ?? pVar.max);
      const high = Math.max(rmin ?? pVar.min, rmax ?? pVar.max);
      let v = low + rnd() * (high - low);
      return clamp(v, pVar.min, pVar.max);
    })();

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
      return layer;
    };

    const newLayers = Array.from({ length: layerCount }, (_, idx) => buildLayer(idx));

    // Apply base layer variation: preserve old or sampled when included
    if (newLayers.length > 0) {
      const v = classicSampledVar;
      newLayers[0].variation = Number(v?.toFixed ? v.toFixed(2) : v);
    }

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
