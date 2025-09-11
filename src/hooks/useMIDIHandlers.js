import { useEffect } from 'react';
import { hexToRgb, rgbToHex } from '../utils/colorUtils.js';

// Consolidates all MIDI registerParamHandler effects
export function useMIDIHandlers({
  registerParamHandler,
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
  assignOneColorPerLayer,
  // Background
  backgroundColor,
  setBackgroundColor,
  // Randomize All
  rndAllPrevRef,
  handleRandomizeAll,
  // Selection
  clampedSelectedIndex,
}) {
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

  // Layer Variation (0..3) controlled by global/base layer [0]
  useEffect(() => {
    if (!registerParamHandler) return;
    const unregister = registerParamHandler('variation', ({ value01 }) => {
      const v = Math.max(0, Math.min(1, value01));
      const mapped = +(v * 3).toFixed(2);
      setLayers?.(prev => prev.map((l, i) => (i === 0 ? { ...l, variation: mapped } : l)));
    });
    return unregister;
  }, [registerParamHandler, setLayers]);

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
      const wasLen = layers.length;
      setLayers?.(prev => {
        let next = prev;
        if (target > prev.length) {
          // Adding layers: preserve existing layers, only create new ones
          const addCount = target - prev.length;
          const baseVar = (typeof prev?.[0]?.variation === 'number') ? prev[0].variation : DEFAULT_LAYER.variation;
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
  }, [registerParamHandler, setLayers, setSelectedLayerIndex, layers.length, DEFAULT_LAYER, buildVariedLayerFrom]);

  // (removed: global assign-one-per-layer variant to avoid duplicate id handlers)

  // Global per-layer MIDI Position handlers (work in background)
  useEffect(() => {
    if (!registerParamHandler) return;
    const unsubs = [];

    const clamp01 = (v) => Math.max(0, Math.min(1, v));

    layers.forEach((layer, index) => {
      const layerKey = (layer?.name || `Layer ${index + 1}`).toString();
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

    return () => { unsubs.forEach(u => { if (typeof u === 'function') u(); }); };
    // Re-register if layer list, names, ranges, or enable flags change
  }, [registerParamHandler, setLayers, layers]);

  // Background Color (RGB)
  useEffect(() => {
    if (!registerParamHandler) return;

    const idR = 'backgroundColorR';
    const idG = 'backgroundColorG';
    const idB = 'backgroundColorB';

    const setChannel = (channel) => ({ value01 }) => {
      const cur = hexToRgb(backgroundColor || '#000000');
      const v255 = Math.max(0, Math.min(255, Math.round(value01 * 255)));
      const next = { ...cur, [channel]: v255 };
      setBackgroundColor?.(rgbToHex(next));
    };

    const u1 = registerParamHandler(idR, setChannel('r'));
    const u2 = registerParamHandler(idG, setChannel('g'));
    const u3 = registerParamHandler(idB, setChannel('b'));
    return () => { if (typeof u1 === 'function') u1(); if (typeof u2 === 'function') u2(); if (typeof u3 === 'function') u3(); };
  }, [registerParamHandler, backgroundColor, setBackgroundColor]);

  // Global per-layer MIDI Colour handlers (RGBA)
  useEffect(() => {
    if (!registerParamHandler) return;
    const unsubs = [];

    layers.forEach((layer, index) => {
      const layerKey = (layer?.name || `Layer ${index + 1}`).toString();
      const idR = `layer:${layerKey}:colorR`;
      const idG = `layer:${layerKey}:colorG`;
      const idB = `layer:${layerKey}:colorB`;
      const idA = `layer:${layerKey}:colorA`;

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

    return () => { unsubs.forEach(u => { if (typeof u === 'function') u(); }); };
  }, [registerParamHandler, setLayers, layers]);

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
