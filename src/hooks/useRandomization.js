// Randomization hook: provides modern/classic/randomize-layer/scene functions
export function useRandomization({
  // inputs and helpers
  parameters,
  DEFAULT_LAYER,
  palettes,
  blendModes,
  layers,
  selectedLayerIndex,
  randomizePalette,
  randomizeNumColors,
  colorCountMin = 1,
  colorCountMax = 8,
  classicMode,
  // helpers
  sampleColorsEven,
  assignOneColorPerLayer,
  getIsRnd,
  // setters
  setLayers,
  setSelectedLayerIndex,
  setBackgroundColor,
  setGlobalBlendMode,
  setGlobalSpeedMultiplier,
}) {
  const clamp = (val, min, max) => Math.min(max, Math.max(min, val));

  const randomBackgroundColor = () => {
    const h = Math.floor(Math.random() * 360);
    const s = Math.floor(40 + Math.random() * 40);
    const l = Math.floor(25 + Math.random() * 55);
    const hslToHex = (hh, ss, ll) => {
      const s1 = ss / 100;
      const l1 = ll / 100;
      const c = (1 - Math.abs(2 * l1 - 1)) * s1;
      const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
      const m = l1 - c / 2;
      let r = 0, g = 0, b = 0;
      if (hh < 60) { r = c; g = x; b = 0; }
      else if (hh < 120) { r = x; g = c; b = 0; }
      else if (hh < 180) { r = 0; g = c; b = x; }
      else if (hh < 240) { r = 0; g = x; b = c; }
      else if (hh < 300) { r = x; g = 0; b = c; }
      else { r = c; g = 0; b = x; }
      const toHex = (v) => {
        const n = Math.round((v + m) * 255);
        return n.toString(16).padStart(2, '0');
      };
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    };
    return hslToHex(h, s, l);
  };

  const randomizeLayer = (index, _forcePalette = false) => {
    const randomizableParams = parameters.filter(p => p.isRandomizable);
    const layer = layers[index];
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
          let rawValue = low + Math.random() * (high - low);
          rawValue = Math.min(param.max, Math.max(param.min, rawValue));
          const finalValue = param.step === 1 ? Math.round(rawValue) : rawValue;
          newProps[param.id] = finalValue;
          break;
        }
        default:
          if (param.type === 'dropdown' && param.options) {
            newProps[param.id] = param.options[Math.floor(Math.random() * param.options.length)];
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
        const pick = palettes[Math.floor(Math.random() * palettes.length)];
        nextPalette = Array.isArray(pick) ? pick : (pick.colors || baseColors);
      }
      let nextN = currentN;
      if (doCount) {
        const cMin = Math.max(1, Math.floor(colorCountMin));
        const cMaxCap = Math.max(cMin, Math.floor(colorCountMax));
        const maxN = Math.min(cMaxCap, (nextPalette.length || cMaxCap));
        const minN = cMin;
        nextN = Math.max(1, Math.floor(Math.random() * (maxN - minN + 1)) + minN);
      }
      const nextColors = sampleColorsEven(nextPalette.length ? nextPalette : baseColors, nextN || currentN || 1);
      newProps.colors = nextColors;
      newProps.numColors = nextColors.length;
      newProps.selectedColor = 0;
    }

    const updatedLayer = { ...layers[index], ...newProps };
    if (newProps.movementAngle !== undefined || newProps.movementSpeed !== undefined) {
      const angleRad = updatedLayer.movementAngle * (Math.PI / 180);
      updatedLayer.vx = Math.cos(angleRad) * (updatedLayer.movementSpeed * 0.001) * 1.0;
      updatedLayer.vy = Math.sin(angleRad) * (updatedLayer.movementSpeed * 0.001) * 1.0;
    }
    return updatedLayer;
  };

  const randomizeAnimationOnly = (index) => {
    const layer = layers[index];
    if (!layer) return null;
    const sampleSliderParam = (id, defMin, defMax, roundInt = false) => {
      const p = parameters.find(pp => pp.id === id);
      if (p && p.type === 'slider') {
        const rmin = Number.isFinite(p.randomMin) ? p.randomMin : p.min;
        const rmax = Number.isFinite(p.randomMax) ? p.randomMax : p.max;
        const low = Math.min(rmin ?? p.min, rmax ?? p.max);
        const high = Math.max(rmin ?? p.min, rmax ?? p.max);
        let v = low + Math.random() * (high - low);
        v = Math.min(p.max, Math.max(p.min, v));
        return p.step === 1 || roundInt ? Math.round(v) : v;
      }
      let v = defMin + Math.random() * (defMax - defMin);
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

    const getParam = (id) => parameters.find(p => p.id === id);
    const mixRandom = (baseVal, min, max, w, integer = false) => {
      const rnd = min + Math.random() * Math.max(0, (max - min));
      let next = baseVal * (1 - w) + rnd * w;
      next = clamp(next, min, max);
      if (integer) next = Math.round(next);
      return next;
    };

    const layersParam = parameters.find(p => p.id === 'layersCount');
    const defMinL = Number.isFinite(layersParam?.min) ? layersParam.min : 1;
    const defMaxL = Number.isFinite(layersParam?.max) ? layersParam.max : 8;
    const layerCount = incLayers
      ? Math.floor(Math.random() * (defMaxL - defMinL + 1)) + defMinL
      : layers.length;

    let scenePreset = palettes[Math.floor(Math.random() * palettes.length)];
    let sceneColors = Array.isArray(scenePreset) ? scenePreset : (scenePreset.colors || []);
    const currentBase = Array.isArray(layers?.[0]?.colors) ? layers[0].colors : [];
    const currentN = Number.isFinite(layers?.[0]?.numColors) ? layers[0].numColors : (currentBase.length || 3);
    if (!randomizePalette) {
      sceneColors = currentBase.length ? currentBase : (sceneColors || []);
    }
    const cMin = Math.max(1, Math.floor(colorCountMin));
    const cMaxCap = Math.max(cMin, Math.floor(colorCountMax));
    const sceneMaxN = Math.min(cMaxCap, (sceneColors.length || currentN || cMaxCap));
    const sceneMinN = cMin;
    const sceneN = randomizeNumColors
      ? (sceneMaxN > 0 ? Math.floor(Math.random() * (sceneMaxN - sceneMinN + 1)) + sceneMinN : currentN)
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
      let v = low + Math.random() * (high - low);
      return clamp(v, pVar.min, pVar.max);
    })();
    for (let idx = 0; idx < Math.max(1, layerCount); idx++) {
      const prev = layers[idx] || DEFAULT_LAYER;
      const varied = { ...prev };

      // Variation weight uses current or sampled variation value
      const baseVariation = sampledVariation;
      const w = clamp((Number(baseVariation) || 0) / 3, 0, 1);

      // IMPORTANT: Randomize All should affect core properties regardless of per-layer vary flags.
      // Use variation only to scale the intensity of the change.
      varied.numSides = Math.max(3, Math.round(mixRandom(prev.numSides ?? DEFAULT_LAYER.numSides, 3, 20, w, true)));
      varied.curviness = Number(mixRandom(prev.curviness ?? DEFAULT_LAYER.curviness, 0, 1, w).toFixed(3));
      varied.noiseAmount = Number(mixRandom(prev.noiseAmount ?? DEFAULT_LAYER.noiseAmount, 0, 10, w).toFixed(2));
      varied.wobble = Number(mixRandom(prev.wobble ?? DEFAULT_LAYER.wobble, 0, 1, w).toFixed(3));
      varied.width = Math.round(mixRandom(prev.width ?? DEFAULT_LAYER.width, 10, 900, w, true));
      varied.height = Math.round(mixRandom(prev.height ?? DEFAULT_LAYER.height, 10, 900, w, true));

      // Movement
      // Randomize movement style with a probability scaled by variation weight; otherwise keep previous
      {
        const styles = ['bounce', 'drift', 'still'];
        const cur = prev.movementStyle ?? DEFAULT_LAYER.movementStyle;
        let nextStyle = cur;
        const changeProb = Math.max(0.3, w); // ensure some chance even at low variation
        if (styles.length && Math.random() < changeProb) {
          const others = styles.filter(s => s !== cur);
          const pool = others.length ? others : styles;
          nextStyle = pool[Math.floor(Math.random() * pool.length)];
        }
        varied.movementStyle = nextStyle;
      }
      varied.movementSpeed = Number(mixRandom(prev.movementSpeed ?? DEFAULT_LAYER.movementSpeed, 0, 5, w).toFixed(3));
      {
        const nextAngle = mixRandom(prev.movementAngle ?? 45, 0, 360, true);
        varied.movementAngle = ((nextAngle % 360) + 360) % 360;
      }

      // Scale
      varied.scaleSpeed = Number(mixRandom(prev.scaleSpeed ?? 0.05, 0, 0.2, w).toFixed(3));
      let nextScaleMin = prev.scaleMin ?? 0.2;
      let nextScaleMax = prev.scaleMax ?? 1.5;
      // Keep scale bounds as non-randomizable defaults; do not change unless your design later permits
      varied.scaleMin = Math.min(nextScaleMin, nextScaleMax);
      varied.scaleMax = Math.max(nextScaleMin, nextScaleMax);

      // Position jitter
      const baseX = prev.position?.x ?? 0.5;
      const baseY = prev.position?.y ?? 0.5;
      const jitter = 0.15 * w;
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

      // Velocity recompute
      const angleRad = (varied.movementAngle ?? prev.movementAngle ?? 0) * (Math.PI / 180);
      varied.vx = Math.cos(angleRad) * ((varied.movementSpeed ?? prev.movementSpeed ?? 1) * 0.001) * 1.0;
      varied.vy = Math.sin(angleRad) * ((varied.movementSpeed ?? prev.movementSpeed ?? 1) * 0.001) * 1.0;

      // Colors: small shuffle based on variation weight; not gated by vary flags
      if (Array.isArray(prev.colors) && prev.colors.length) {
        if (w >= 0.75) {
          const currentKey = JSON.stringify(prev.colors);
          const candidates = palettes.filter(p => JSON.stringify(p) !== currentKey);
          const chosen = (candidates.length ? candidates : palettes)[Math.floor(Math.random() * (candidates.length || palettes.length))];
          const chosenArr = Array.isArray(chosen) ? chosen : (chosen.colors || prev.colors);
          varied.colors = Array.isArray(chosenArr) ? [...chosenArr] : [];
          varied.numColors = varied.colors.length;
        } else if (w >= 0.4) {
          const arr = [...prev.colors];
          for (let i = arr.length - 1; i > 0; i--) {
            if (Math.random() < 0.5 * w) {
              const j = Math.floor(Math.random() * (i + 1));
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

    // Apply palette/numColors to each layer based on toggles
    try {
      for (let i = 0; i < layersOut.length; i++) {
        const prev = layers[i] || DEFAULT_LAYER;
        const curColors = Array.isArray(prev.colors) ? prev.colors : [];
        const srcPalette = randomizePalette ? baseColors : (curColors.length ? curColors : baseColors);
        const cMin = Math.max(1, Math.floor(colorCountMin));
        const cMaxCap = Math.max(cMin, Math.floor(colorCountMax));
        const maxN = Math.min(cMaxCap, (srcPalette.length || cMaxCap));
        const minN = cMin;
        let n;
        if (randomizeNumColors) {
          n = maxN > 0 ? Math.floor(Math.random() * (maxN - minN + 1)) + minN : (curColors.length || 1);
        } else {
          n = randomizePalette ? Math.min(srcPalette.length, maxN) : (prev.numColors || curColors.length || 1);
        }
        const next = sampleColorsEven(srcPalette, Math.max(1, n));
        layersOut[i].colors = next;
        layersOut[i].numColors = next.length;
        layersOut[i].selectedColor = 0;
      }
    } catch {}

    // Global opacity randomization (gated)
    if (incOpacity) {
      const p = getParam('globalOpacity');
      const omin = Number.isFinite(p?.min) ? p.min : 0;
      const omax = Number.isFinite(p?.max) ? p.max : 1;
      const oval = omin + Math.random() * Math.max(0, omax - omin);
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
    if (incBlend) setGlobalBlendMode(blendModes[Math.floor(Math.random() * blendModes.length)]);
    // Speed
    if (incSpeed) {
      const p = getParam('globalSpeedMultiplier');
      const smin = Number.isFinite(p?.min) ? p.min : 0;
      const smax = Number.isFinite(p?.max) ? p.max : 5;
      const sval = smin + Math.random() * Math.max(0, smax - smin);
      setGlobalSpeedMultiplier(Number(sval.toFixed(2)));
    }
  };

  const classicRandomizeAll = () => {
    const rnd = Math.random;
    const incBG = getIsRnd('backgroundColor');
    const incSpeed = getIsRnd('globalSpeedMultiplier');
    const incBlend = getIsRnd('globalBlendMode');
    const incOpacity = getIsRnd('globalOpacity');
    const incLayers = getIsRnd('layersCount');

    // Scene palette
    let scenePreset = palettes[Math.floor(rnd() * palettes.length)];
    let baseColors = Array.isArray(scenePreset) ? scenePreset : (scenePreset.colors || []);
    const currentBase = Array.isArray(layers?.[0]?.colors) ? layers[0].colors : [];
    const currentN = Number.isFinite(layers?.[0]?.numColors) ? layers[0].numColors : (currentBase.length || 3);
    if (!randomizePalette) baseColors = currentBase.length ? currentBase : baseColors;
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
      layer.width = Math.floor(10 + rnd() * 890);
      layer.height = Math.floor(10 + rnd() * 890);
      layer.colors = baseColors;
      layer.numColors = baseColors.length;
      layer.opacity = Number(layers?.[0]?.opacity ?? 0.8);
      layer.movementStyle = 'bounce';
      layer.movementAngle = Math.floor(rnd() * 360);
      layer.movementSpeed = Number((Math.pow(rnd(), 4) * 5).toFixed(3));
      const angleRad = layer.movementAngle * (Math.PI / 180);
      layer.vx = Math.cos(angleRad) * (layer.movementSpeed * 0.001);
      layer.vy = Math.sin(angleRad) * (layer.movementSpeed * 0.001);
      layer.scaleMin = 0.2;
      layer.scaleMax = 1.5;
      layer.scaleSpeed = 0.05;
      layer.position = { ...DEFAULT_LAYER.position, x: rnd(), y: rnd(), scale: 1, scaleDirection: 1 };
      return layer;
    };

    const newLayers = Array.from({ length: layerCount }, (_, idx) => buildLayer(idx));

    // Spread single colour per layer
    try {
      const singleColours = sampleColorsEven(baseColors, Math.max(1, layerCount));
      for (let i = 0; i < newLayers.length; i++) {
        const c = singleColours[i % singleColours.length];
        newLayers[i].colors = [c];
        newLayers[i].numColors = 1;
        newLayers[i].selectedColor = 0;
      }
    } catch {}

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
    if (incBlend) setGlobalBlendMode('source-over');
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
