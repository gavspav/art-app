import { useEffect, useRef } from 'react';
import { hexToRgb, rgbToHex } from '../utils/colorUtils.js';

/**
 * useAudioHandlers - Consolidates all audio registerAudioHandler effects
 * 
 * Mirrors the pattern from useMIDIHandlers.js but for audio input.
 * Each handler receives { value01, band, raw } when audio is active.
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
}) {
  const blendModeStateRef = useRef({ index: -1, lastChangeMs: 0 });
  const paletteStateRef = useRef({ index: -1, lastChangeMs: 0 });
  const randomizeStateRef = useRef({ lastTriggerMs: 0 });

  // Randomize All (rising-edge trigger)
  useEffect(() => {
    if (!registerAudioHandler) return;
    const unregister = registerAudioHandler('randomizeAll', ({ value01 }) => {
      const prev = rndAllPrevRef?.current || 0;
      const cur = Math.max(0, Math.min(1, value01));
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
      const clamped = Math.max(0, Math.min(5, value01));
      setGlobalSpeedMultiplier?.(+clamped.toFixed(2));
    });
    return unregister;
  }, [registerAudioHandler, setGlobalSpeedMultiplier]);

  // Global Opacity for all layers - value01 is already mapped to output range
  useEffect(() => {
    if (!registerAudioHandler) return;
    const unregister = registerAudioHandler('globalOpacity', ({ value01 }) => {
      const clamped = Math.max(0, Math.min(1, value01));
      setLayers?.(prev => prev.map(l => ({ ...l, opacity: clamped })));
    });
    return unregister;
  }, [registerAudioHandler, setLayers]);

  // Legacy Layer Variation - value01 is already mapped to output range
  useEffect(() => {
    if (!registerAudioHandler) return;
    const unregister = registerAudioHandler('variation', ({ value01 }) => {
      const clamped = Math.max(0, Math.min(3, value01));
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
  }, [registerAudioHandler, setLayers]);

  // Split variations - value01 is already mapped to output range
  useEffect(() => {
    if (!registerAudioHandler) return;
    const u0 = registerAudioHandler('variationPosition', ({ value01 }) => {
      const mapped = +Math.max(0, Math.min(3, value01)).toFixed(2);
      setLayers?.(prev => prev.map((l, i) => (i === 0 ? { ...l, variationPosition: mapped } : l)));
    });
    const u1 = registerAudioHandler('variationShape', ({ value01 }) => {
      const mapped = +Math.max(0, Math.min(3, value01)).toFixed(2);
      setLayers?.(prev => prev.map((l, i) => (i === 0 ? { ...l, variationShape: mapped } : l)));
    });
    const u2 = registerAudioHandler('variationAnim', ({ value01 }) => {
      const mapped = +Math.max(0, Math.min(3, value01)).toFixed(2);
      setLayers?.(prev => prev.map((l, i) => (i === 0 ? { ...l, variationAnim: mapped } : l)));
    });
    const u3 = registerAudioHandler('variationColor', ({ value01 }) => {
      const mapped = +Math.max(0, Math.min(3, value01)).toFixed(2);
      setLayers?.(prev => prev.map((l, i) => (i === 0 ? { ...l, variationColor: mapped } : l)));
    });
    return () => {
      if (typeof u0 === 'function') u0();
      if (typeof u1 === 'function') u1();
      if (typeof u2 === 'function') u2();
      if (typeof u3 === 'function') u3();
    };
  }, [registerAudioHandler, setLayers]);

  // variationScale - value01 is already mapped to output range
  useEffect(() => {
    if (!registerAudioHandler) return;
    const unregister = registerAudioHandler('variationScale', ({ value01 }) => {
      const mapped = +Math.max(-3, Math.min(3, value01)).toFixed(2);
      setLayers?.(prev => prev.map((l, i) => (i === 0 ? { ...l, variationScale: mapped } : l)));
    });
    return unregister;
  }, [registerAudioHandler, setLayers]);

  // Global Blend Mode (dropdown over blendModes) - use raw 0-1 for index lookup
  useEffect(() => {
    if (!registerAudioHandler) return;
    const unregister = registerAudioHandler('globalBlendMode', ({ value01, raw }) => {
      const opts = Array.isArray(blendModes) ? blendModes : [];
      if (!opts.length) return;

      const normalized = Math.max(0, Math.min(
        1,
        Number.isFinite(value01) ? value01 : (Number.isFinite(raw) ? raw : 0)
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
      const target = Math.max(1, Math.min(20, Math.round(value01)));
      setLayers?.(prev => {
        let next = prev;
        if (target > prev.length) {
          // Adding layers
          const addCount = target - prev.length;
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
        } else if (target < prev.length) {
          next = prev.slice(0, target);
        }
        return next.map((l, i) => ({ ...l, name: `Layer ${i + 1}` }));
      });
      setSelectedLayerIndex?.(Math.max(0, target - 1));
    });
    return unregister;
  }, [DEFAULT_LAYER, buildVariedLayerFrom, registerAudioHandler, setLayers, setSelectedLayerIndex]);

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
    const unregister = registerAudioHandler('globalPaletteIndex', ({ value01, raw }) => {
      const list = palettes || [];
      if (!Array.isArray(list) || list.length === 0) return;

      const normalized = Math.max(0, Math.min(
        1,
        Number.isFinite(value01) ? value01 : (Number.isFinite(raw) ? raw : 0)
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
  }, [registerAudioHandler, clampedSelectedIndex, setLayers, palettes, sampleColorsEven, paletteStateRef]);

  // Per-layer position handlers (X, Y, Z/scale) - use raw 0-1 for position mapping
  useEffect(() => {
    if (!registerAudioHandler) return;
    const unsubs = [];

    const clamp01 = (v) => Math.max(0, Math.min(1, v));

    layers.forEach((layer, index) => {
      const layerKey = (layer?.name || `Layer ${index + 1}`).toString();
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

    return () => { unsubs.forEach(u => { if (typeof u === 'function') u(); }); };
  }, [registerAudioHandler, setLayers, layers]);

  // Per-layer color handlers (RGBA) - use raw 0-1 for color channel mapping
  useEffect(() => {
    if (!registerAudioHandler) return;
    const unsubs = [];

    layers.forEach((layer, index) => {
      const layerKey = (layer?.name || `Layer ${index + 1}`).toString();
      const idR = `layer:${layerKey}:colorR`;
      const idG = `layer:${layerKey}:colorG`;
      const idB = `layer:${layerKey}:colorB`;
      const idA = `layer:${layerKey}:colorA`;

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

    return () => { unsubs.forEach(u => { if (typeof u === 'function') u(); }); };
  }, [registerAudioHandler, setLayers, layers]);
}
