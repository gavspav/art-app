import { useCallback, useEffect, useRef } from 'react';
import { hexToRgb, rgbToHex } from '../utils/colorUtils.js';

// Consolidates all MIDI registerParamHandler effects
export function useMIDIHandlers({
  registerParamHandler,
  // Globals
  setGlobalSpeedMultiplier,
  setGlobalBlendMode,
  setGlobalPaletteIndex,
  setGlobalPaletteRef,
  globalPaletteIndex: _globalPaletteIndex,
  blendModes,
  parameters = [],
  layersCountParam,
  applyVariationInstantly = false,
  audioSpawnUseGlobalPalette = false,
  paletteColorsForVariation = [],
  // Layers
  layers,
  setLayers,
  DEFAULT_LAYER,
  buildVariedLayerFrom,
  setSelectedLayerIndex,
  // Palette helpers
  palettes,
  sampleColorsEven,
  assignOneColorPerLayer,
  // Background
  backgroundColor,
  setBackgroundColor,
  // Randomize All
  rndAllPrevRef,
  handleRandomizeAll,
  randomizeCurrentLayer,
  randomizeAnimationForCurrentLayer,
  randomizeCurrentLayerColors,
  // Selection
  clampedSelectedIndex,
}) {
  const backgroundColorRef = useRef(backgroundColor || '#000000');
  const randomizePreviousValuesRef = useRef(new Map());

  useEffect(() => {
    backgroundColorRef.current = backgroundColor || '#000000';
  }, [backgroundColor]);

  const applyVariationValue = useCallback((prop, rawValue) => {
    setLayers?.(prev => {
      if (!Array.isArray(prev) || prev.length === 0) return prev;

      let anyChange = false;
      const updated = prev.map((layer) => {
        if (layer?.[prop] === rawValue) return layer;
        anyChange = true;
        return { ...layer, [prop]: rawValue };
      });

      if (!anyChange) return prev;
      if (!applyVariationInstantly || updated.length <= 1 || typeof buildVariedLayerFrom !== 'function') {
        return updated;
      }

      const firstLayer = updated[0];
      const baseVar = {
        shape: Number(firstLayer?.variationShape ?? DEFAULT_LAYER.variationShape),
        anim: Number(firstLayer?.variationAnim ?? DEFAULT_LAYER.variationAnim),
        color: Number(firstLayer?.variationColor ?? DEFAULT_LAYER.variationColor),
        position: Number(firstLayer?.variationPosition ?? DEFAULT_LAYER.variationPosition),
        scale: Number(firstLayer?.variationScale ?? DEFAULT_LAYER.variationScale ?? 0),
      };
      const categoryMap = {
        variationPosition: ['position'],
        variationShape: ['shape'],
        variationAnim: ['anim'],
        variationColor: ['color'],
        variationScale: ['scale'],
      };
      const affectCategories = categoryMap[prop] || null;
      const categorySet = affectCategories ? new Set(affectCategories) : null;
      const rebuilt = [firstLayer];
      let prevLayer = firstLayer;

      for (let i = 1; i < updated.length; i += 1) {
        const original = updated[i];
        const varied = buildVariedLayerFrom(prevLayer, i + 1, baseVar, {
          affectCategories,
          preserveSeeds: true,
          constrainColorsToPalette: !!audioSpawnUseGlobalPalette,
          paletteColors: paletteColorsForVariation,
        }) || original;
        const merged = {
          ...original,
          ...varied,
          id: original.id ?? varied.id,
          name: original.name || varied.name,
        };

        if (categorySet) {
          if (!categorySet.has('color')) {
            merged.colors = Array.isArray(original.colors) ? [...original.colors] : original.colors;
            if (typeof original.numColors !== 'undefined') merged.numColors = original.numColors;
          }
          if (!categorySet.has('position') && !categorySet.has('scale')) {
            if (typeof original.xOffset !== 'undefined') merged.xOffset = original.xOffset;
            if (typeof original.yOffset !== 'undefined') merged.yOffset = original.yOffset;
            if (original.position && typeof original.position === 'object') {
              merged.position = { ...original.position };
            }
          }
          if (!categorySet.has('shape')) {
            [
              'numSides',
              'curviness',
              'wobble',
              'noiseAmount',
              'width',
              'height',
              'radiusFactor',
              'radiusFactorX',
              'radiusFactorY',
              'nodes',
              'syncNodesToNumSides',
              'viewBoxMapped',
            ].forEach((field) => {
              if (field in original) {
                merged[field] = Array.isArray(original[field])
                  ? [...original[field]]
                  : (original[field] && typeof original[field] === 'object' ? { ...original[field] } : original[field]);
              }
            });
          }
          if (!categorySet.has('anim')) {
            [
              'movementStyle',
              'movementSpeed',
              'movementAngle',
              'scaleSpeed',
              'scaleMin',
              'scaleMax',
              'imageBlur',
              'imageBrightness',
              'imageContrast',
              'imageHue',
              'imageSaturation',
              'imageDistortion',
              'vx',
              'vy',
              'orbitCenterX',
              'orbitCenterY',
              'orbitAngle',
              'orbitRadiusX',
              'orbitRadiusY',
            ].forEach((field) => {
              if (field in original) merged[field] = original[field];
            });
          }
          if (!categorySet.has('scale')) {
            if (typeof original.variationScale !== 'undefined') merged.variationScale = original.variationScale;
            if (original.position && typeof original.position === 'object') {
              merged.position = {
                ...(merged.position || {}),
                ...(original.position || {}),
                scale: original.position.scale,
                scaleDirection: original.position.scaleDirection,
              };
            }
          } else {
            const rawScaleVar = Number(baseVar.scale || 0);
            const originalScale = original.position?.scale ?? 1;
            if (rawScaleVar !== 0) {
              const layerSeed = (firstLayer?.seed ?? 1) + (i * 1013904223);
              const rng = () => {
                const x = Math.sin(layerSeed * 9999) * 10000;
                return x - Math.floor(x);
              };
              const absWeight = Math.min(Math.abs(rawScaleVar) / 3, 1);
              const ratio = rawScaleVar < 0
                ? Math.max(0.05, 1 - rng() * (0.95 * absWeight))
                : 1 + rng() * (1.2 * absWeight);
              merged.position = {
                ...(original.position || {}),
                scale: Math.max(0.05, Math.min(5, originalScale * ratio)),
              };
            }
          }
        }

        rebuilt.push(merged);
        prevLayer = merged;
      }

      return rebuilt;
    });
  }, [
    DEFAULT_LAYER,
    applyVariationInstantly,
    audioSpawnUseGlobalPalette,
    buildVariedLayerFrom,
    paletteColorsForVariation,
    setLayers,
  ]);

  // Randomize All (rising-edge)
  useEffect(() => {
    if (!registerParamHandler) return;
    const unregister = registerParamHandler('randomizeAll', ({ value01 }) => {
      const prev = rndAllPrevRef.current || 0;
      const cur = Math.max(0, Math.min(1, value01));
      if (prev < 0.5 && cur >= 0.5) {
        handleRandomizeAll?.();
      }
      rndAllPrevRef.current = cur;
    });
    return unregister;
  }, [registerParamHandler, handleRandomizeAll, rndAllPrevRef]);

  // Global Speed (0..5)
  useEffect(() => {
    if (!registerParamHandler) return;
    const unregister = registerParamHandler('globalSpeedMultiplier', ({ value01 }) => {
      const v = Math.max(0, Math.min(1, value01));
      const scaled = +(v * 5).toFixed(2);
      setGlobalSpeedMultiplier?.(scaled);
    });
    return unregister;
  }, [registerParamHandler, setGlobalSpeedMultiplier]);

  // Legacy Layer Variation (0..3) -> now maps to all three split variations on every layer
  useEffect(() => {
    if (!registerParamHandler) return;
    const unregister = registerParamHandler('variation', ({ value01 }) => {
      const v = Math.max(0, Math.min(1, value01));
      const mapped = +(v * 3).toFixed(2);
      setLayers?.(prev => prev.map(l => ({ ...l, variation: mapped, variationShape: mapped, variationAnim: mapped, variationColor: mapped })));
      applyVariationValue('variationPosition', mapped);
    });
    return unregister;
  }, [applyVariationValue, registerParamHandler, setLayers]);

  // Split variations: variationShape, variationAnim, variationColor (0..3) on every layer
  useEffect(() => {
    if (!registerParamHandler) return;
    const u0 = registerParamHandler('variationPosition', ({ value01 }) => {
      const v = Math.max(0, Math.min(1, value01));
      const mapped = +(v * 3).toFixed(2);
      applyVariationValue('variationPosition', mapped);
    });
    const u1 = registerParamHandler('variationShape', ({ value01 }) => {
      const v = Math.max(0, Math.min(1, value01));
      const mapped = +(v * 3).toFixed(2);
      applyVariationValue('variationShape', mapped);
    });
    const u2 = registerParamHandler('variationAnim', ({ value01 }) => {
      const v = Math.max(0, Math.min(1, value01));
      const mapped = +(v * 3).toFixed(2);
      applyVariationValue('variationAnim', mapped);
    });
    const u3 = registerParamHandler('variationColor', ({ value01 }) => {
      const v = Math.max(0, Math.min(1, value01));
      const mapped = +(v * 3).toFixed(2);
      applyVariationValue('variationColor', mapped);
    });
    return () => {
      if (typeof u0 === 'function') u0();
      if (typeof u1 === 'function') u1();
      if (typeof u2 === 'function') u2();
      if (typeof u3 === 'function') u3();
    };
  }, [applyVariationValue, registerParamHandler]);

  useEffect(() => {
    if (!registerParamHandler) return;
    const unregister = registerParamHandler('variationScale', ({ value01 }) => {
      const v = Math.max(0, Math.min(1, value01));
      const mapped = +((-3) + v * 6).toFixed(2);
      applyVariationValue('variationScale', mapped);
    });
    return unregister;
  }, [applyVariationValue, registerParamHandler]);

  // Global Blend Mode (dropdown over blendModes)
  useEffect(() => {
    if (!registerParamHandler) return;
    const unregister = registerParamHandler('globalBlendMode', ({ value01 }) => {
      const opts = Array.isArray(blendModes) ? blendModes : [];
      if (!opts.length) return;
      const idx = Math.max(0, Math.min(opts.length - 1, Math.floor(value01 * opts.length)));
      setGlobalBlendMode?.(opts[idx]);
    });
    return unregister;
  }, [registerParamHandler, setGlobalBlendMode, blendModes]);

  // Global Opacity for all layers (0..1)
  useEffect(() => {
    if (!registerParamHandler) return;
    const unregister = registerParamHandler('globalOpacity', ({ value01 }) => {
      const v = Math.max(0, Math.min(1, value01));
      setLayers?.(prev => prev.map(l => ({ ...l, opacity: v })));
    });
    return unregister;
  }, [registerParamHandler, setLayers]);

  // Layers Count (1..20)
  useEffect(() => {
    if (!registerParamHandler) return;
    const unregister = registerParamHandler('layersCount', ({ value01 }) => {
      const target = Math.max(1, Math.min(20, Math.round(1 + value01 * 19)));
      setLayers?.(prev => {
        let next = prev;
        if (target > prev.length) {
          // Adding layers: preserve existing layers, only create new ones
          const addCount = target - prev.length;
          const baseVar = {
            shape: (typeof prev?.[0]?.variationShape === 'number') ? prev[0].variationShape : (typeof prev?.[0]?.variation === 'number' ? prev[0].variation : DEFAULT_LAYER.variationShape),
            anim: (typeof prev?.[0]?.variationAnim === 'number') ? prev[0].variationAnim : (typeof prev?.[0]?.variation === 'number' ? prev[0].variation : DEFAULT_LAYER.variationAnim),
            color: (typeof prev?.[0]?.variationColor === 'number') ? prev[0].variationColor : (typeof prev?.[0]?.variation === 'number' ? prev[0].variation : DEFAULT_LAYER.variationColor),
            position: (typeof prev?.[0]?.variationPosition === 'number') ? prev[0].variationPosition : (typeof prev?.[0]?.variation === 'number' ? prev[0].variation : DEFAULT_LAYER.variationPosition),
            scale: (typeof prev?.[0]?.variationScale === 'number') ? prev[0].variationScale : (DEFAULT_LAYER.variationScale ?? 0),
          };
          let last = prev[prev.length - 1] || DEFAULT_LAYER;
          const additions = Array.from({ length: addCount }, (_, i) => {
            const nextIdx = prev.length + i + 1;
            const nl = buildVariedLayerFrom(last, nextIdx, baseVar);
            if (!Array.isArray(nl.nodes) || nl.nodes?.length < 3) nl.nodes = null; // ensure shape type defaults
            nl.layerType = 'shape';
            last = nl;
            return nl;
          });
          next = [...prev, ...additions];
        } else if (target < prev.length) {
          // Removing layers: just slice, preserving existing layer objects
          next = prev.slice(0, target);
        }
        // Only update names, preserve all other properties including nodes
        return next.map((l, i) => ({ ...l, name: `Layer ${i + 1}` }));
      });
      // Select topmost layer after change
      setSelectedLayerIndex?.(Math.max(0, target - 1));
    });
    return unregister;
  }, [DEFAULT_LAYER, buildVariedLayerFrom, registerParamHandler, setLayers, setSelectedLayerIndex]);

  // (removed: global assign-one-per-layer variant to avoid duplicate id handlers)

  // Global per-layer MIDI Position handlers (work in background)
  useEffect(() => {
    if (!registerParamHandler) return;
    const unsubs = [];

    const clamp01 = (v) => Math.max(0, Math.min(1, v));

    layers.forEach((layer, index) => {
      const legacyKey = (layer?.name || `Layer ${index + 1}`).toString();
      const stableKey = String(layer?.id ?? legacyKey);
      const layerKeys = Array.from(new Set([stableKey, legacyKey].filter(Boolean)));

      layerKeys.forEach((layerKey) => {
        const idX = `layer:${layerKey}:posX`;
        const idY = `layer:${layerKey}:posY`;
        const idZ = `layer:${layerKey}:posZ`;

        // X
        unsubs.push(registerParamHandler(idX, ({ value01 }) => {
          if (!layer?.manualMidiPositionEnabled) return;
          const r = layer?.midiPosRangeX || { min: 0, max: 1 };
          const mapped = (r.min ?? 0) + value01 * ((r.max ?? 1) - (r.min ?? 0));
          const v = clamp01(mapped);
          setLayers?.(prev => prev.map((l, i) => (
            i === index ? { ...l, position: { ...(l.position || {}), x: v } } : l
          )));
        }));

        // Y
        unsubs.push(registerParamHandler(idY, ({ value01 }) => {
          if (!layer?.manualMidiPositionEnabled) return;
          const r = layer?.midiPosRangeY || { min: 0, max: 1 };
          const mapped = (r.min ?? 0) + value01 * ((r.max ?? 1) - (r.min ?? 0));
          const v = clamp01(mapped);
          setLayers?.(prev => prev.map((l, i) => (
            i === index ? { ...l, position: { ...(l.position || {}), y: v } } : l
          )));
        }));

        // Z (scale)
        unsubs.push(registerParamHandler(idZ, ({ value01 }) => {
          if (!layer?.manualMidiPositionEnabled) return;
          const scaleMin = Number.isFinite(layer?.scaleMin) ? layer.scaleMin : 0.2;
          const scaleMax = Number.isFinite(layer?.scaleMax) ? layer.scaleMax : 1.5;
          const r = layer?.midiPosRangeZ || { min: scaleMin, max: scaleMax };
          const outMin = Number.isFinite(r.min) ? r.min : scaleMin;
          const outMax = Number.isFinite(r.max) ? r.max : scaleMax;
          const mapped = outMin + value01 * (outMax - outMin);
          const v = Math.max(scaleMin, Math.min(scaleMax, mapped));
          setLayers?.(prev => prev.map((l, i) => (
            i === index ? { ...l, position: { ...(l.position || {}), scale: v } } : l
          )));
        }));
      });
    });

    return () => { unsubs.forEach(u => { if (typeof u === 'function') u(); }); };
    // Re-register if layer list, names, ranges, or enable flags change
  }, [registerParamHandler, setLayers, layers]);

  // Background Color (whole colour + RGB channels)
  useEffect(() => {
    if (!registerParamHandler) return;

    const idAll = 'backgroundColor';
    const idR = 'backgroundColorR';
    const idG = 'backgroundColorG';
    const idB = 'backgroundColorB';

    const setAllChannels = ({ value01 }) => {
      const v255 = Math.max(0, Math.min(255, Math.round(value01 * 255)));
      const nextHex = rgbToHex({ r: v255, g: v255, b: v255 });
      backgroundColorRef.current = nextHex;
      setBackgroundColor?.(nextHex);
    };

    const setChannel = (channel) => ({ value01 }) => {
      const cur = hexToRgb(backgroundColorRef.current || '#000000');
      const v255 = Math.max(0, Math.min(255, Math.round(value01 * 255)));
      const next = { ...cur, [channel]: v255 };
      const nextHex = rgbToHex(next);
      backgroundColorRef.current = nextHex;
      setBackgroundColor?.(nextHex);
    };

    const u0 = registerParamHandler(idAll, setAllChannels);
    const u1 = registerParamHandler(idR, setChannel('r'));
    const u2 = registerParamHandler(idG, setChannel('g'));
    const u3 = registerParamHandler(idB, setChannel('b'));
    return () => {
      if (typeof u0 === 'function') u0();
      if (typeof u1 === 'function') u1();
      if (typeof u2 === 'function') u2();
      if (typeof u3 === 'function') u3();
    };
  }, [registerParamHandler, setBackgroundColor]);

  // Randomise triggers must work even when the control tab/panel is unmounted.
  useEffect(() => {
    if (!registerParamHandler) return;

    const getParam = (paramId) => (
      (Array.isArray(parameters) ? parameters : []).find(param => param?.id === paramId)
    );

    const randomInRange = (paramId, fallbackMin, fallbackMax, fallbackStep = 0.01) => {
      const param = paramId === 'layersCount' && layersCountParam ? layersCountParam : getParam(paramId);
      const min = Number.isFinite(param?.min) ? param.min : fallbackMin;
      const max = Number.isFinite(param?.max) ? param.max : fallbackMax;
      const randomMin = Number.isFinite(param?.randomMin) ? param.randomMin : min;
      const randomMax = Number.isFinite(param?.randomMax) ? param.randomMax : max;
      const step = Number.isFinite(param?.step) && param.step > 0 ? param.step : fallbackStep;
      const low = Math.min(randomMin, randomMax);
      const high = Math.max(randomMin, randomMax);
      let next = low + Math.random() * Math.max(0, high - low);
      next = Math.round((next - low) / step) * step + low;
      return Math.max(min, Math.min(max, Number(next.toFixed(6))));
    };

    const setLayerCount = (targetRaw) => {
      const target = Math.max(1, Math.round(Number(targetRaw) || 1));
      setLayers?.(prev => {
        if (!Array.isArray(prev) || prev.length === target) return prev;
        let next = prev;
        if (target > prev.length) {
          const addCount = target - prev.length;
          const baseVar = {
            shape: (typeof prev?.[0]?.variationShape === 'number') ? prev[0].variationShape : (typeof prev?.[0]?.variation === 'number' ? prev[0].variation : DEFAULT_LAYER.variationShape),
            anim: (typeof prev?.[0]?.variationAnim === 'number') ? prev[0].variationAnim : (typeof prev?.[0]?.variation === 'number' ? prev[0].variation : DEFAULT_LAYER.variationAnim),
            color: (typeof prev?.[0]?.variationColor === 'number') ? prev[0].variationColor : (typeof prev?.[0]?.variation === 'number' ? prev[0].variation : DEFAULT_LAYER.variationColor),
            position: (typeof prev?.[0]?.variationPosition === 'number') ? prev[0].variationPosition : (typeof prev?.[0]?.variation === 'number' ? prev[0].variation : DEFAULT_LAYER.variationPosition),
            scale: (typeof prev?.[0]?.variationScale === 'number') ? prev[0].variationScale : (DEFAULT_LAYER.variationScale ?? 0),
          };
          let last = prev[prev.length - 1] || DEFAULT_LAYER;
          const additions = Array.from({ length: addCount }, (_, i) => {
            const nextIdx = prev.length + i + 1;
            const layer = buildVariedLayerFrom(last, nextIdx, baseVar);
            if (!Array.isArray(layer.nodes) || layer.nodes?.length < 3) layer.nodes = null;
            layer.layerType = 'shape';
            last = layer;
            return layer;
          });
          next = [...prev, ...additions];
        } else {
          next = prev.slice(0, target);
        }
        return next.map((layer, index) => ({ ...layer, name: `Layer ${index + 1}` }));
      });
      setSelectedLayerIndex?.(Math.max(0, target - 1));
    };

    const randomizeGlobalParam = (paramId) => {
      if (paramId === 'backgroundColor') {
        const channel = () => Math.floor(Math.random() * 256);
        const nextHex = rgbToHex({ r: channel(), g: channel(), b: channel() });
        backgroundColorRef.current = nextHex;
        setBackgroundColor?.(nextHex);
      } else if (paramId === 'globalSpeedMultiplier') {
        setGlobalSpeedMultiplier?.(randomInRange(paramId, 0, 5, 0.01));
      } else if (paramId === 'globalPaletteIndex') {
        const list = Array.isArray(palettes) ? palettes : [];
        if (!list.length) return;
        const index = Math.floor(Math.random() * list.length);
        const palette = list[index];
        const colors = Array.isArray(palette) ? palette : palette?.colors;
        setGlobalPaletteRef?.(null);
        setGlobalPaletteIndex?.(index);
        if (typeof assignOneColorPerLayer === 'function') {
          assignOneColorPerLayer(typeof sampleColorsEven === 'function'
            ? sampleColorsEven(colors || [], Math.max(1, Array.isArray(layers) ? layers.length : 1))
            : (colors || []));
        }
      } else if (paramId === 'globalBlendMode') {
        const options = Array.isArray(blendModes) ? blendModes : [];
        if (!options.length) return;
        setGlobalBlendMode?.(options[Math.floor(Math.random() * options.length)]);
      } else if (paramId === 'globalOpacity') {
        const next = randomInRange(paramId, 0, 1, 0.01);
        setLayers?.(prev => prev.map(layer => ({ ...layer, opacity: next })));
      } else if (paramId === 'layersCount') {
        setLayerCount(randomInRange(paramId, 1, 20, 1));
      } else if (paramId === 'variationPosition') {
        const next = randomInRange(paramId, 0, 3, 0.01);
        applyVariationValue('variationPosition', next);
      } else if (paramId === 'variationShape') {
        const next = randomInRange(paramId, 0, 3, 0.01);
        applyVariationValue('variationShape', next);
      } else if (paramId === 'variationAnim') {
        const next = randomInRange(paramId, 0, 3, 0.01);
        applyVariationValue('variationAnim', next);
      } else if (paramId === 'variationColor') {
        const next = randomInRange(paramId, 0, 3, 0.01);
        applyVariationValue('variationColor', next);
      } else if (paramId === 'variationScale') {
        const next = randomInRange(paramId, -3, 3, 0.01);
        applyVariationValue('variationScale', next);
      }
    };

    const triggerMap = new Map([
      ['randomize:backgroundColor', () => randomizeGlobalParam('backgroundColor')],
      ['randomize:globalSpeedMultiplier', () => randomizeGlobalParam('globalSpeedMultiplier')],
      ['randomize:globalPaletteIndex', () => randomizeGlobalParam('globalPaletteIndex')],
      ['randomize:globalBlendMode', () => randomizeGlobalParam('globalBlendMode')],
      ['randomize:globalOpacity', () => randomizeGlobalParam('globalOpacity')],
      ['randomize:layersCount', () => randomizeGlobalParam('layersCount')],
      ['randomize:variationPosition', () => randomizeGlobalParam('variationPosition')],
      ['randomize:variationShape', () => randomizeGlobalParam('variationShape')],
      ['randomize:variationAnim', () => randomizeGlobalParam('variationAnim')],
      ['randomize:variationColor', () => randomizeGlobalParam('variationColor')],
      ['randomize:variationScale', () => randomizeGlobalParam('variationScale')],
      ['randomize:currentLayer', () => randomizeCurrentLayer?.(false)],
      ['randomize:layerAnimation', () => randomizeAnimationForCurrentLayer?.()],
      ['randomize:layerColors', () => randomizeCurrentLayerColors?.()],
    ]);

    const unregisters = Array.from(triggerMap.entries()).map(([paramId, onTrigger]) => registerParamHandler(paramId, ({ value01 }) => {
      const previous = randomizePreviousValuesRef.current.get(paramId) || 0;
      const current = Math.max(0, Math.min(1, Number(value01) || 0));
      if (previous < 0.5 && current >= 0.5) {
        onTrigger();
      }
      randomizePreviousValuesRef.current.set(paramId, current);
    }));

    return () => {
      unregisters.forEach(unregister => {
        if (typeof unregister === 'function') unregister();
      });
    };
  }, [
    DEFAULT_LAYER,
    applyVariationValue,
    assignOneColorPerLayer,
    blendModes,
    buildVariedLayerFrom,
    layers,
    layersCountParam,
    parameters,
    palettes,
    randomizeAnimationForCurrentLayer,
    randomizeCurrentLayer,
    randomizeCurrentLayerColors,
    registerParamHandler,
    sampleColorsEven,
    setBackgroundColor,
    setGlobalBlendMode,
    setGlobalPaletteIndex,
    setGlobalPaletteRef,
    setGlobalSpeedMultiplier,
    setLayers,
    setSelectedLayerIndex,
  ]);

  // Global per-layer MIDI Colour handlers (RGBA)
  useEffect(() => {
    if (!registerParamHandler) return;
    const unsubs = [];

    layers.forEach((layer, index) => {
      const legacyKey = (layer?.name || `Layer ${index + 1}`).toString();
      const stableKey = String(layer?.id ?? legacyKey);
      const layerKeys = Array.from(new Set([stableKey, legacyKey].filter(Boolean)));

      const updateChannel = (channel, value01) => {
        if (!layer?.manualMidiColorEnabled) return;
        const selIdx = Number.isFinite(layer?.selectedColor) ? layer.selectedColor : 0;
        const colors = Array.isArray(layer?.colors) ? layer.colors : [];
        const curHex = colors[selIdx] || '#000000';
        const cur = hexToRgb(curHex);
        const v255 = Math.max(0, Math.min(255, Math.round(value01 * 255)));
        const next = { ...cur, [channel]: v255 };
        const nextHex = rgbToHex(next);
        setLayers?.(prev => prev.map((l, i) => {
          if (i !== index) return l;
          const arr = Array.isArray(l.colors) ? [...l.colors] : [];
          const si = Number.isFinite(l.selectedColor) ? l.selectedColor : 0;
          arr[si] = nextHex;
          return { ...l, colors: arr };
        }));
      };

      layerKeys.forEach((layerKey) => {
        const idR = `layer:${layerKey}:colorR`;
        const idG = `layer:${layerKey}:colorG`;
        const idB = `layer:${layerKey}:colorB`;
        const idA = `layer:${layerKey}:colorA`;

        // R
        unsubs.push(registerParamHandler(idR, ({ value01 }) => {
          updateChannel('r', value01);
        }));
        // G
        unsubs.push(registerParamHandler(idG, ({ value01 }) => {
          updateChannel('g', value01);
        }));
        // B
        unsubs.push(registerParamHandler(idB, ({ value01 }) => {
          updateChannel('b', value01);
        }));
        // A (opacity)
        unsubs.push(registerParamHandler(idA, ({ value01 }) => {
          if (!layer?.manualMidiColorEnabled) return;
          const v = Math.max(0, Math.min(1, value01));
          setLayers?.(prev => prev.map((l, i) => (i === index ? { ...l, opacity: v } : l)));
        }));
      });
    });

    return () => { unsubs.forEach(u => { if (typeof u === 'function') u(); }); };
  }, [registerParamHandler, setLayers, layers]);

  // Secret hardcoded CC handlers for Layer 1 RGB (CC 50/51/52)
  useEffect(() => {
    if (!registerParamHandler) return;
    const byteFromMsg = ({ value01, raw }) => {
      const rawVal = Number.isFinite(raw?.value) ? raw.value : Math.round(Math.max(0, Math.min(1, value01)) * 127);
      const doubled = rawVal * 2;
      return Math.max(0, Math.min(255, doubled));
    };

    const makeHandler = (channel) => ({ value01, raw }) => {
      setLayers?.(prev => {
        if (!Array.isArray(prev) || prev.length === 0) return prev;
        const next = [...prev];
        const layer = { ...next[0] };
        const selIdxRaw = Number.isFinite(layer.selectedColor) ? layer.selectedColor : 0;
        const selIdx = Math.max(0, Math.min(selIdxRaw, (Array.isArray(layer.colors) ? layer.colors.length : 1) - 1));
        const colors = Array.isArray(layer.colors) && layer.colors.length
          ? [...layer.colors]
          : ['#000000'];
        if (selIdx >= colors.length) {
          while (colors.length <= selIdx) colors.push('#000000');
        }
        const currentHex = colors[selIdx] || '#000000';
        const current = hexToRgb(currentHex);
        const nextByte = byteFromMsg({ value01, raw });
        const updated = { ...current, [channel]: nextByte };
        colors[selIdx] = rgbToHex(updated);
        layer.colors = colors;
        layer.numColors = Number.isFinite(layer.numColors) ? Math.max(layer.numColors, colors.length) : colors.length;
        next[0] = layer;
        return next;
      });
    };

    const unregR = registerParamHandler('__secretLayer1ColorR', makeHandler('r'));
    const unregG = registerParamHandler('__secretLayer1ColorG', makeHandler('g'));
    const unregB = registerParamHandler('__secretLayer1ColorB', makeHandler('b'));

    return () => {
      if (typeof unregR === 'function') unregR();
      if (typeof unregG === 'function') unregG();
      if (typeof unregB === 'function') unregB();
    };
  }, [registerParamHandler, setLayers]);

  // Register MIDI: Global Palette Preset -> applies to currently selected layer
  useEffect(() => {
    if (!registerParamHandler) return;
    const unregister = registerParamHandler('globalPaletteIndex', ({ value01 }) => {
      const list = palettes || [];
      if (!Array.isArray(list) || list.length === 0) return;
      const idx = Math.max(0, Math.min(list.length - 1, Math.floor(value01 * list.length)));
      const pick = list[idx];
      const src = Array.isArray(pick) ? pick : (pick?.colors || []);
      setLayers?.(prev => {
        const sel = Math.max(0, Math.min(clampedSelectedIndex ?? 0, Math.max(0, prev.length - 1)));
        const layer = prev[sel] || {};
        const count = Number.isFinite(layer?.numColors)
          ? layer.numColors
          : ((Array.isArray(layer?.colors) ? layer.colors.length : 0) || (src.length || 1));
        const nextColors = sampleColorsEven?.(src, Math.max(1, count)) || [];
        return prev.map((l, i) => (i === sel ? { ...l, colors: nextColors, numColors: nextColors.length, selectedColor: 0 } : l));
      });
    });
    return unregister;
  }, [registerParamHandler, clampedSelectedIndex, setLayers, palettes, sampleColorsEven]);
}
