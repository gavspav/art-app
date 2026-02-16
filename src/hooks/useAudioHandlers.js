import { useCallback, useEffect, useMemo, useRef } from 'react';
import { hexToRgb, rgbToHex } from '../utils/colorUtils.js';

/**
 * useAudioHandlers - Consolidates all audio registerAudioHandler effects
 * 
 * Mirrors the pattern from useMIDIHandlers.js but for audio input.
 * Each handler receives { value01, band, raw, processed } when audio is active,
 * plus trigger metadata for threshold-driven mappings.
 * 
 * IMPORTANT: value01 is ALREADY mapped through the range (outputMin → outputMax),
 * so handlers should use it directly without additional scaling.
 */
export function useAudioHandlers({
  registerAudioHandler,
  // Globals
  setGlobalSpeedMultiplier,
  setGlobalBlendMode,
  blendModes,
  // Layers
  layers,
  setLayers,
  DEFAULT_LAYER,
  buildVariedLayerFrom,
  setSelectedLayerIndex,
  // Palette helpers
  palettes,
  sampleColorsEven,
  // Background
  backgroundColor,
  setBackgroundColor,
  // Randomize All
  rndAllPrevRef,
  handleRandomizeAll,
  // Selection
  clampedSelectedIndex,
  // Optional palette sync
  globalPaletteIndex,
  setGlobalPaletteIndex,
  // Optional spawn trigger hook
  triggerAudioSpawn,
  // Current audio mapping definitions (for range normalization)
  audioMappings = {},
  // Parameter metadata (min/max/random range handles)
  parameters = [],
}) {
  const blendModeStateRef = useRef({ index: -1, lastChangeMs: 0 });
  const paletteStateRef = useRef({ index: -1, lastChangeMs: 0 });
  const triggerPaletteStateRef = useRef({ index: -1 });
  const randomizeStateRef = useRef({ lastTriggerMs: 0 });
  const layersCountStateRef = useRef({ count: null, lastChangeMs: 0 });
  const latestLayerCountRef = useRef(Array.isArray(layers) ? layers.length : 1);
  const movementPulseStateRef = useRef({ active: false, layerId: null, baseSpeed: null });
  const audioMappingsRef = useRef(audioMappings);
  audioMappingsRef.current = audioMappings;

  const parameterBoundsById = useMemo(() => {
    const map = new Map();
    if (!Array.isArray(parameters)) return map;
    parameters.forEach((param) => {
      const id = typeof param?.id === 'string' ? param.id : null;
      if (!id) return;
      const randomMin = Number(param?.randomMin);
      const randomMax = Number(param?.randomMax);
      const fallbackMin = Number(param?.min);
      const fallbackMax = Number(param?.max);
      const min = Number.isFinite(randomMin) ? randomMin : fallbackMin;
      const max = Number.isFinite(randomMax) ? randomMax : fallbackMax;
      if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) return;
      map.set(id, { min, max });
    });
    return map;
  }, [parameters]);

  const getBounds = useCallback((paramId, fallbackMin, fallbackMax) => {
    const bounds = parameterBoundsById.get(paramId);
    const min = Number.isFinite(bounds?.min) ? bounds.min : fallbackMin;
    const max = Number.isFinite(bounds?.max) ? bounds.max : fallbackMax;
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    return { min: lo, max: hi };
  }, [parameterBoundsById]);

  const projectToBounds = useCallback((paramId, value, fallbackMin, fallbackMax) => {
    const { min, max } = getBounds(paramId, fallbackMin, fallbackMax);
    if (!Number.isFinite(value)) return min;

    const mapping = (audioMappingsRef.current && typeof audioMappingsRef.current === 'object')
      ? audioMappingsRef.current[paramId]
      : null;
    const outMin = Number(mapping?.range?.outputMin);
    const outMax = Number(mapping?.range?.outputMax);
    if (Number.isFinite(outMin) && Number.isFinite(outMax) && Math.abs(outMax - outMin) > 1e-9) {
      const normalized = (value - outMin) / (outMax - outMin);
      const n = Math.max(0, Math.min(1, normalized));
      return min + n * (max - min);
    }

    return Math.max(min, Math.min(max, value));
  }, [getBounds]);

  const applyPaletteByIndex = useCallback((targetIndex) => {
    const list = Array.isArray(palettes) ? palettes : [];
    if (list.length === 0) return;
    const idx = Math.max(0, Math.min(list.length - 1, Number.isFinite(targetIndex) ? Math.floor(targetIndex) : 0));
    const pick = list[idx];
    const src = Array.isArray(pick) ? pick : (pick?.colors || []);
    setLayers?.(prev => {
      if (!Array.isArray(prev) || prev.length === 0) return prev;
      const sel = Math.max(0, Math.min(clampedSelectedIndex ?? 0, Math.max(0, prev.length - 1)));
      const layer = prev[sel] || {};
      const count = Number.isFinite(layer?.numColors)
        ? layer.numColors
        : ((Array.isArray(layer?.colors) ? layer.colors.length : 0) || (src.length || 1));
      const nextColors = sampleColorsEven?.(src, Math.max(1, count)) || [];
      return prev.map((l, i) => (i === sel ? { ...l, colors: nextColors, numColors: nextColors.length, selectedColor: 0 } : l));
    });
    setGlobalPaletteIndex?.(idx);
  }, [clampedSelectedIndex, palettes, sampleColorsEven, setGlobalPaletteIndex, setLayers]);

  useEffect(() => {
    const listLength = Array.isArray(palettes) ? palettes.length : 0;
    if (!listLength) {
      triggerPaletteStateRef.current.index = -1;
      return;
    }
    const parsed = Number(globalPaletteIndex);
    if (Number.isFinite(parsed)) {
      triggerPaletteStateRef.current.index = Math.max(0, Math.min(listLength - 1, Math.floor(parsed)));
    }
  }, [globalPaletteIndex, palettes]);

  useEffect(() => {
    const { min, max } = getBounds('layersCount', 1, 400);
    const currentCount = Math.max(min, Math.min(max, Number.isFinite(layers?.length) ? layers.length : 1));
    latestLayerCountRef.current = currentCount;
    const state = layersCountStateRef.current;
    state.count = currentCount;
  }, [getBounds, layers?.length]);

  // Randomize All (rising-edge trigger)
  useEffect(() => {
    if (!registerAudioHandler) return;
    const unregister = registerAudioHandler('randomizeAll', ({ value01, raw, processed }) => {
      const prev = rndAllPrevRef?.current || 0;
      const source = Number.isFinite(processed)
        ? processed
        : (Number.isFinite(raw) ? raw : value01);
      const cur = Math.max(0, Math.min(1, source));
      const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
        ? performance.now()
        : Date.now();
      const minIntervalMs = 1000;
      if (prev < 0.5 && cur >= 0.5 && (now - (randomizeStateRef.current.lastTriggerMs || 0)) >= minIntervalMs) {
        randomizeStateRef.current.lastTriggerMs = now;
        handleRandomizeAll?.();
      }
      if (rndAllPrevRef) rndAllPrevRef.current = cur;
    });
    return unregister;
  }, [registerAudioHandler, handleRandomizeAll, rndAllPrevRef, randomizeStateRef]);

  // Global Speed - value01 is already mapped to output range (e.g., 0.5 → 3.0)
  useEffect(() => {
    if (!registerAudioHandler) return;
    const unregister = registerAudioHandler('globalSpeedMultiplier', ({ value01 }) => {
      // value01 is already the final value from range mapping, just clamp to valid range
      const clamped = projectToBounds('globalSpeedMultiplier', value01, 0, 5);
      setGlobalSpeedMultiplier?.(+clamped.toFixed(2));
    });
    return unregister;
  }, [projectToBounds, registerAudioHandler, setGlobalSpeedMultiplier]);

  // Global Opacity for all layers - value01 is already mapped to output range
  useEffect(() => {
    if (!registerAudioHandler) return;
    const unregister = registerAudioHandler('globalOpacity', ({ value01 }) => {
      const clamped = projectToBounds('globalOpacity', value01, 0, 1);
      setLayers?.(prev => prev.map(l => ({ ...l, opacity: clamped })));
    });
    return unregister;
  }, [projectToBounds, registerAudioHandler, setLayers]);

  // Legacy Layer Variation - value01 is already mapped to output range
  useEffect(() => {
    if (!registerAudioHandler) return;
    const unregister = registerAudioHandler('variation', ({ value01 }) => {
      const clamped = projectToBounds('variation', value01, 0, 3);
      const mapped = +clamped.toFixed(2);
      setLayers?.(prev => prev.map((l, i) => (i === 0 ? { 
        ...l, 
        variation: mapped, 
        variationShape: mapped, 
        variationAnim: mapped, 
        variationColor: mapped, 
        variationPosition: mapped 
      } : l)));
    });
    return unregister;
  }, [projectToBounds, registerAudioHandler, setLayers]);

  // Split variations - value01 is already mapped to output range
  useEffect(() => {
    if (!registerAudioHandler) return;
    const u0 = registerAudioHandler('variationPosition', ({ value01 }) => {
      const mapped = +projectToBounds('variationPosition', value01, 0, 3).toFixed(2);
      setLayers?.(prev => prev.map((l, i) => (i === 0 ? { ...l, variationPosition: mapped } : l)));
    });
    const u1 = registerAudioHandler('variationShape', ({ value01 }) => {
      const mapped = +projectToBounds('variationShape', value01, 0, 3).toFixed(2);
      setLayers?.(prev => prev.map((l, i) => (i === 0 ? { ...l, variationShape: mapped } : l)));
    });
    const u2 = registerAudioHandler('variationAnim', ({ value01 }) => {
      const mapped = +projectToBounds('variationAnim', value01, 0, 3).toFixed(2);
      setLayers?.(prev => prev.map((l, i) => (i === 0 ? { ...l, variationAnim: mapped } : l)));
    });
    const u3 = registerAudioHandler('variationColor', ({ value01 }) => {
      const mapped = +projectToBounds('variationColor', value01, 0, 3).toFixed(2);
      setLayers?.(prev => prev.map((l, i) => (i === 0 ? { ...l, variationColor: mapped } : l)));
    });
    return () => {
      if (typeof u0 === 'function') u0();
      if (typeof u1 === 'function') u1();
      if (typeof u2 === 'function') u2();
      if (typeof u3 === 'function') u3();
    };
  }, [projectToBounds, registerAudioHandler, setLayers]);

  // variationScale - value01 is already mapped to output range
  useEffect(() => {
    if (!registerAudioHandler) return;
    const unregister = registerAudioHandler('variationScale', ({ value01 }) => {
      const mapped = +projectToBounds('variationScale', value01, -3, 3).toFixed(2);
      setLayers?.(prev => prev.map((l, i) => (i === 0 ? { ...l, variationScale: mapped } : l)));
    });
    return unregister;
  }, [projectToBounds, registerAudioHandler, setLayers]);

  // Global Blend Mode (dropdown over blendModes) - use raw 0-1 for index lookup
  useEffect(() => {
    if (!registerAudioHandler) return;
    const unregister = registerAudioHandler('globalBlendMode', ({ value01, raw, processed }) => {
      const opts = Array.isArray(blendModes) ? blendModes : [];
      if (!opts.length) return;

      const normalized = Math.max(0, Math.min(
        1,
        Number.isFinite(processed)
          ? processed
          : (Number.isFinite(raw) ? raw : (Number.isFinite(value01) ? value01 : 0))
      ));
      const idx = Math.max(0, Math.min(opts.length - 1, Math.floor(normalized * opts.length)));
      const state = blendModeStateRef.current;
      const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
        ? performance.now()
        : Date.now();
      const minSwitchMs = 260;

      if (idx === state.index) return;
      if ((now - state.lastChangeMs) < minSwitchMs) return;

      state.index = idx;
      state.lastChangeMs = now;
      setGlobalBlendMode?.(opts[idx]);
    });
    return unregister;
  }, [registerAudioHandler, setGlobalBlendMode, blendModes, blendModeStateRef]);

  // Layers Count - value01 is already mapped to output range
  useEffect(() => {
    if (!registerAudioHandler) return;
    const unregister = registerAudioHandler('layersCount', ({ value01 }) => {
      const { min, max } = getBounds('layersCount', 1, 400);
      const bounded = projectToBounds('layersCount', value01, min, max);
      const target = Math.max(min, Math.min(max, Math.round(bounded)));
      const state = layersCountStateRef.current;
      const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
        ? performance.now()
        : Date.now();
      const minStepMs = 220;
      const current = Number.isFinite(state.count) ? state.count : latestLayerCountRef.current;
      if (target === current) return;
      if ((now - state.lastChangeMs) < minStepMs) return;
      const step = target > current ? 1 : -1;
      const nextCount = Math.max(min, Math.min(max, current + step));
      state.count = nextCount;
      state.lastChangeMs = now;

      setLayers?.(prev => {
        let next = prev;
        if (nextCount > prev.length) {
          // Adding layers
          const addCount = nextCount - prev.length;
          const baseVar = {
            shape: (typeof prev?.[0]?.variationShape === 'number') ? prev[0].variationShape : (typeof prev?.[0]?.variation === 'number' ? prev[0].variation : DEFAULT_LAYER.variationShape),
            anim: (typeof prev?.[0]?.variationAnim === 'number') ? prev[0].variationAnim : (typeof prev?.[0]?.variation === 'number' ? prev[0].variation : DEFAULT_LAYER.variationAnim),
            color: (typeof prev?.[0]?.variationColor === 'number') ? prev[0].variationColor : (typeof prev?.[0]?.variation === 'number' ? prev[0].variation : DEFAULT_LAYER.variationColor),
            position: (typeof prev?.[0]?.variationPosition === 'number') ? prev[0].variationPosition : (typeof prev?.[0]?.variation === 'number' ? prev[0].variation : DEFAULT_LAYER.variationPosition),
          };
          let last = prev[prev.length - 1] || DEFAULT_LAYER;
          const additions = Array.from({ length: addCount }, (_, i) => {
            const nextIdx = prev.length + i + 1;
            const nl = buildVariedLayerFrom(last, nextIdx, baseVar);
            if (!Array.isArray(nl.nodes) || nl.nodes?.length < 3) nl.nodes = null;
            nl.layerType = 'shape';
            last = nl;
            return nl;
          });
          next = [...prev, ...additions];
        } else if (nextCount < prev.length) {
          next = prev.slice(0, nextCount);
        }
        return next.map((l, i) => ({ ...l, name: `Layer ${i + 1}` }));
      });
      const selected = Number.isFinite(clampedSelectedIndex) ? clampedSelectedIndex : 0;
      setSelectedLayerIndex?.(Math.max(0, Math.min(selected, nextCount - 1)));
    });
    return unregister;
  }, [DEFAULT_LAYER, buildVariedLayerFrom, clampedSelectedIndex, getBounds, projectToBounds, registerAudioHandler, setLayers, setSelectedLayerIndex]);

  // Background Color (RGB) - use raw 0-1 for color channel mapping
  useEffect(() => {
    if (!registerAudioHandler) return;

    const setChannel = (channel) => ({ raw }) => {
      const cur = hexToRgb(backgroundColor || '#000000');
      // Use raw 0-1 value for color channel (0-255)
      const v255 = Math.max(0, Math.min(255, Math.round(raw * 255)));
      const next = { ...cur, [channel]: v255 };
      setBackgroundColor?.(rgbToHex(next));
    };

    const u1 = registerAudioHandler('backgroundColorR', setChannel('r'));
    const u2 = registerAudioHandler('backgroundColorG', setChannel('g'));
    const u3 = registerAudioHandler('backgroundColorB', setChannel('b'));
    return () => { 
      if (typeof u1 === 'function') u1(); 
      if (typeof u2 === 'function') u2(); 
      if (typeof u3 === 'function') u3(); 
    };
  }, [registerAudioHandler, backgroundColor, setBackgroundColor]);

  // Global Palette Preset -> applies to currently selected layer - use raw 0-1 for index lookup
  useEffect(() => {
    if (!registerAudioHandler) return;
    const unregister = registerAudioHandler('globalPaletteIndex', ({ value01, raw, processed }) => {
      const list = palettes || [];
      if (!Array.isArray(list) || list.length === 0) return;

      const normalized = Math.max(0, Math.min(
        1,
        Number.isFinite(processed)
          ? processed
          : (Number.isFinite(raw) ? raw : (Number.isFinite(value01) ? value01 : 0))
      ));
      const idx = Math.max(0, Math.min(list.length - 1, Math.floor(normalized * list.length)));
      const state = paletteStateRef.current;
      const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
        ? performance.now()
        : Date.now();
      const minSwitchMs = 320;

      if (idx === state.index) return;
      if ((now - state.lastChangeMs) < minSwitchMs) return;

      state.index = idx;
      state.lastChangeMs = now;
      applyPaletteByIndex(idx);
    });
    return unregister;
  }, [registerAudioHandler, applyPaletteByIndex, palettes, paletteStateRef]);

  // Matrix trigger: step palette on threshold crossings
  useEffect(() => {
    if (!registerAudioHandler) return;
    const unregister = registerAudioHandler('triggerPaletteStep', ({ triggered, triggerDirection }) => {
      if (!triggered) return;
      const list = Array.isArray(palettes) ? palettes : [];
      if (list.length === 0) return;

      const state = triggerPaletteStateRef.current;
      const currentIdx = Number.isFinite(state.index) ? state.index : 0;
      const step = triggerDirection === 'down' ? -1 : 1;
      const nextIdx = (currentIdx + step + list.length) % list.length;
      state.index = nextIdx;
      applyPaletteByIndex(nextIdx);
    });
    return unregister;
  }, [registerAudioHandler, palettes, applyPaletteByIndex]);

  // Matrix trigger: spawn/despawn ephemeral audio layer overlays (half-life handled by spawn hook)
  useEffect(() => {
    if (!registerAudioHandler) return;
    const unregister = registerAudioHandler('triggerSpawnLayer', ({ triggered, triggerDirection, triggerReverseOnFall }) => {
      if (!triggered || typeof triggerAudioSpawn !== 'function') return;
      if (triggerDirection === 'down' && triggerReverseOnFall) {
        triggerAudioSpawn('despawn');
      } else {
        triggerAudioSpawn('spawn');
      }
    });
    return unregister;
  }, [registerAudioHandler, triggerAudioSpawn]);

  // Matrix trigger: movement pulse with optional reverse-on-fall restore
  useEffect(() => {
    if (!registerAudioHandler) return;
    const unregister = registerAudioHandler('triggerMovementPulse', ({ value01, triggered, triggerDirection, triggerReverseOnFall }) => {
      if (!triggered || !setLayers) return;

      if (triggerDirection === 'up') {
        const pulseSpeed = Math.max(0, Math.min(8, Number.isFinite(value01) ? value01 : 1));
        setLayers((prev) => {
          if (!Array.isArray(prev) || prev.length === 0) return prev;
          const sel = Math.max(0, Math.min(clampedSelectedIndex ?? 0, Math.max(0, prev.length - 1)));
          const target = prev[sel];
          if (!target) return prev;
          const targetLayerId = target?.id ?? sel;
          const state = movementPulseStateRef.current;
          if (!state.active || state.layerId !== targetLayerId) {
            state.active = true;
            state.layerId = targetLayerId;
            state.baseSpeed = Number.isFinite(target?.movementSpeed) ? target.movementSpeed : 1;
          }
          return prev.map((layer, index) => (
            index === sel ? { ...layer, movementSpeed: pulseSpeed } : layer
          ));
        });
        return;
      }

      if (triggerDirection === 'down' && triggerReverseOnFall) {
        const state = movementPulseStateRef.current;
        if (!state.active) return;
        setLayers((prev) => {
          if (!Array.isArray(prev) || prev.length === 0) return prev;
          const restoreIndex = prev.findIndex((layer, index) => ((layer?.id ?? index) === state.layerId));
          const targetIndex = restoreIndex >= 0
            ? restoreIndex
            : Math.max(0, Math.min(clampedSelectedIndex ?? 0, Math.max(0, prev.length - 1)));
          const baseSpeed = Number.isFinite(state.baseSpeed) ? state.baseSpeed : 1;
          return prev.map((layer, index) => (
            index === targetIndex ? { ...layer, movementSpeed: baseSpeed } : layer
          ));
        });
        movementPulseStateRef.current = { active: false, layerId: null, baseSpeed: null };
      }
    });
    return unregister;
  }, [registerAudioHandler, setLayers, clampedSelectedIndex]);

  // Per-layer position handlers (X, Y, Z/scale) - use raw 0-1 for position mapping
  useEffect(() => {
    if (!registerAudioHandler) return;
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

        // X - use raw 0-1 value with layer's custom range
        unsubs.push(registerAudioHandler(idX, ({ raw }) => {
          if (!layer?.manualAudioPositionEnabled) return;
          const r = layer?.audioPosRangeX || { min: 0, max: 1 };
          const mapped = (r.min ?? 0) + raw * ((r.max ?? 1) - (r.min ?? 0));
          const v = clamp01(mapped);
          setLayers?.(prev => prev.map((l, i) => (
            i === index ? { ...l, position: { ...(l.position || {}), x: v } } : l
          )));
        }));

        // Y - use raw 0-1 value with layer's custom range
        unsubs.push(registerAudioHandler(idY, ({ raw }) => {
          if (!layer?.manualAudioPositionEnabled) return;
          const r = layer?.audioPosRangeY || { min: 0, max: 1 };
          const mapped = (r.min ?? 0) + raw * ((r.max ?? 1) - (r.min ?? 0));
          const v = clamp01(mapped);
          setLayers?.(prev => prev.map((l, i) => (
            i === index ? { ...l, position: { ...(l.position || {}), y: v } } : l
          )));
        }));

        // Z (scale) - use raw 0-1 value with layer's custom range
        unsubs.push(registerAudioHandler(idZ, ({ raw }) => {
          if (!layer?.manualAudioPositionEnabled) return;
          const scaleMin = Number.isFinite(layer?.scaleMin) ? layer.scaleMin : 0.2;
          const scaleMax = Number.isFinite(layer?.scaleMax) ? layer.scaleMax : 1.5;
          const r = layer?.audioPosRangeZ || { min: scaleMin, max: scaleMax };
          const outMin = Number.isFinite(r.min) ? r.min : scaleMin;
          const outMax = Number.isFinite(r.max) ? r.max : scaleMax;
          const mapped = outMin + raw * (outMax - outMin);
          const v = Math.max(scaleMin, Math.min(scaleMax, mapped));
          setLayers?.(prev => prev.map((l, i) => (
            i === index ? { ...l, position: { ...(l.position || {}), scale: v } } : l
          )));
        }));
      });
    });

    return () => { unsubs.forEach(u => { if (typeof u === 'function') u(); }); };
  }, [registerAudioHandler, setLayers, layers]);

  // Per-layer color handlers (RGBA) - use raw 0-1 for color channel mapping
  useEffect(() => {
    if (!registerAudioHandler) return;
    const unsubs = [];

    layers.forEach((layer, index) => {
      const legacyKey = (layer?.name || `Layer ${index + 1}`).toString();
      const stableKey = String(layer?.id ?? legacyKey);
      const layerKeys = Array.from(new Set([stableKey, legacyKey].filter(Boolean)));

      const updateChannel = (channel, raw) => {
        if (!layer?.manualAudioColorEnabled) return;
        const selIdx = Number.isFinite(layer?.selectedColor) ? layer.selectedColor : 0;
        const colors = Array.isArray(layer?.colors) ? layer.colors : [];
        const curHex = colors[selIdx] || '#000000';
        const cur = hexToRgb(curHex);
        // Use raw 0-1 value for color channel (0-255)
        const v255 = Math.max(0, Math.min(255, Math.round(raw * 255)));
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

        unsubs.push(registerAudioHandler(idR, ({ raw }) => updateChannel('r', raw)));
        unsubs.push(registerAudioHandler(idG, ({ raw }) => updateChannel('g', raw)));
        unsubs.push(registerAudioHandler(idB, ({ raw }) => updateChannel('b', raw)));
        unsubs.push(registerAudioHandler(idA, ({ raw }) => {
          if (!layer?.manualAudioColorEnabled) return;
          // Use raw 0-1 value for opacity
          const v = Math.max(0, Math.min(1, raw));
          setLayers?.(prev => prev.map((l, i) => (i === index ? { ...l, opacity: v } : l)));
        }));
      });
    });

    return () => { unsubs.forEach(u => { if (typeof u === 'function') u(); }); };
  }, [registerAudioHandler, setLayers, layers]);

  // Universal trigger action handlers for all catalog parameters.
  // When a mapping's trigger fires with a non-modulate action (addLayer, randomize,
  // increase, decrease), this handler performs the action regardless of which param
  // the trigger is attached to. Multiple handlers per paramId are supported (Set).
  const triggerActionLastMs = useRef({});

  const speedRef = useRef(1);

  const paramStepConfig = useMemo(() => ({
    globalSpeedMultiplier: {
      applyDelta: (delta) => {
        const cur = Number.isFinite(speedRef.current) ? speedRef.current : 1;
        const next = Math.max(0, Math.min(5, +(cur + delta).toFixed(3)));
        speedRef.current = next;
        setGlobalSpeedMultiplier?.(next);
      },
      step: 0.15,
    },
    globalOpacity: { setViaLayers: (delta) => setLayers?.(prev => prev.map(l => ({ ...l, opacity: Math.max(0, Math.min(1, (l.opacity ?? 1) + delta)) }))), step: 0.08 },
    layersCount: { isCount: true, step: 1, min: 1, max: 400 },
    variationShape: { setViaLayers: (delta) => setLayers?.(prev => prev.map((l, i) => i === 0 ? { ...l, variationShape: Math.max(0, Math.min(3, (l.variationShape ?? 0) + delta)) } : l)), step: 0.25 },
    variationAnim: { setViaLayers: (delta) => setLayers?.(prev => prev.map((l, i) => i === 0 ? { ...l, variationAnim: Math.max(0, Math.min(3, (l.variationAnim ?? 0) + delta)) } : l)), step: 0.25 },
    variationColor: { setViaLayers: (delta) => setLayers?.(prev => prev.map((l, i) => i === 0 ? { ...l, variationColor: Math.max(0, Math.min(3, (l.variationColor ?? 0) + delta)) } : l)), step: 0.25 },
    variationScale: { setViaLayers: (delta) => setLayers?.(prev => prev.map((l, i) => i === 0 ? { ...l, variationScale: Math.max(-3, Math.min(3, (l.variationScale ?? 0) + delta)) } : l)), step: 0.25 },
    variationPosition: { setViaLayers: (delta) => setLayers?.(prev => prev.map((l, i) => i === 0 ? { ...l, variationPosition: Math.max(0, Math.min(3, (l.variationPosition ?? 0) + delta)) } : l)), step: 0.25 },
  }), [setGlobalSpeedMultiplier, setLayers]);

  useEffect(() => {
    if (!registerAudioHandler) return;
    const unsubs = [];
    const catalogIds = [
      'globalSpeedMultiplier', 'globalOpacity', 'globalBlendMode', 'globalPaletteIndex',
      'layersCount', 'backgroundColorR', 'backgroundColorG', 'backgroundColorB',
      'variationShape', 'variationAnim', 'variationColor', 'variationScale',
      'variationPosition', 'variation', 'randomizeAll',
      'triggerPaletteStep', 'triggerSpawnLayer', 'triggerMovementPulse',
    ];

    catalogIds.forEach(paramId => {
      unsubs.push(registerAudioHandler(paramId, ({ triggered, triggerAction, triggerDirection }) => {
        if (!triggered || !triggerAction || triggerAction === 'modulate') return;
        const now = performance.now();
        const last = triggerActionLastMs.current[paramId] || 0;
        if (now - last < 200) return;
        triggerActionLastMs.current[paramId] = now;

        switch (triggerAction) {
          case 'addLayer':
            if (typeof triggerAudioSpawn === 'function') {
              triggerAudioSpawn(triggerDirection === 'down' ? 'despawn' : 'spawn');
            } else {
              setLayers?.(prev => {
                if (!Array.isArray(prev)) return prev;
                const base = prev[prev.length - 1] || DEFAULT_LAYER;
                const nl = buildVariedLayerFrom?.(base, prev.length + 1, {}) || { ...DEFAULT_LAYER };
                nl.layerType = 'shape';
                return [...prev, nl].map((l, i) => ({ ...l, name: `Layer ${i + 1}` }));
              });
            }
            break;
          case 'randomize':
            handleRandomizeAll?.();
            break;
          case 'increase':
          case 'decrease': {
            const cfg = paramStepConfig[paramId];
            if (!cfg) break;
            const sign = triggerAction === 'increase' ? 1 : -1;
            const delta = (cfg.step || 0.1) * sign;
            if (cfg.isCount) {
              setLayers?.(prev => {
                if (!Array.isArray(prev)) return prev;
                const target = Math.max(cfg.min || 1, Math.min(cfg.max || 20, prev.length + (sign > 0 ? 1 : -1)));
                if (target === prev.length) return prev;
                if (target > prev.length) {
                  const base = prev[prev.length - 1] || DEFAULT_LAYER;
                  const nl = buildVariedLayerFrom?.(base, prev.length + 1, {}) || { ...DEFAULT_LAYER };
                  nl.layerType = 'shape';
                  return [...prev, nl].map((l, i) => ({ ...l, name: `Layer ${i + 1}` }));
                }
                return prev.slice(0, target).map((l, i) => ({ ...l, name: `Layer ${i + 1}` }));
              });
            } else if (typeof cfg.applyDelta === 'function') {
              cfg.applyDelta(delta);
            } else if (typeof cfg.setViaLayers === 'function') {
              cfg.setViaLayers(delta);
            }
            break;
          }
          default:
            break;
        }
      }));
    });

    return () => { unsubs.forEach(u => { if (typeof u === 'function') u(); }); };
  }, [registerAudioHandler, triggerAudioSpawn, handleRandomizeAll, setLayers, DEFAULT_LAYER, buildVariedLayerFrom, paramStepConfig]);
}
