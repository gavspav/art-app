import { useEffect } from 'react';

/**
 * useBPMHandlers - Consolidates all BPM registerBPMHandler effects
 * 
 * Mirrors the pattern from useMIDIHandlers.js and useAudioHandlers.js but for BPM/beat sync.
 * Each handler receives { value01, phase, beat } when BPM is playing.
 */
export function useBPMHandlers({
  registerBPMHandler,
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
  // Randomize All (rising-edge trigger)
  useEffect(() => {
    if (!registerBPMHandler) return;
    const unregister = registerBPMHandler('randomizeAll', ({ value01 }) => {
      const prev = rndAllPrevRef?.current || 0;
      const cur = Math.max(0, Math.min(1, value01));
      if (prev < 0.5 && cur >= 0.5) {
        handleRandomizeAll?.();
      }
      if (rndAllPrevRef) rndAllPrevRef.current = cur;
    });
    return unregister;
  }, [registerBPMHandler, handleRandomizeAll, rndAllPrevRef]);

  // Global Speed (0..5)
  useEffect(() => {
    if (!registerBPMHandler) return;
    const unregister = registerBPMHandler('globalSpeedMultiplier', ({ value01 }) => {
      const v = Math.max(0, Math.min(1, value01));
      const scaled = +(v * 5).toFixed(2);
      setGlobalSpeedMultiplier?.(scaled);
    });
    return unregister;
  }, [registerBPMHandler, setGlobalSpeedMultiplier]);

  // Global Opacity for all layers (0..1)
  useEffect(() => {
    if (!registerBPMHandler) return;
    const unregister = registerBPMHandler('globalOpacity', ({ value01 }) => {
      const v = Math.max(0, Math.min(1, value01));
      setLayers?.(prev => prev.map(l => ({ ...l, opacity: v })));
    });
    return unregister;
  }, [registerBPMHandler, setLayers]);

  // Layers Count (1..20)
  useEffect(() => {
    if (!registerBPMHandler) return;
    const unregister = registerBPMHandler('layersCount', ({ value01 }) => {
      const v = Math.max(0, Math.min(1, value01));
      const targetCount = Math.max(1, Math.min(20, Math.round(1 + v * 19)));
      
      setLayers?.(prev => {
        const currentCount = prev.length;
        if (currentCount === targetCount) return prev;
        
        if (targetCount > currentCount) {
          // Add layers
          const additions = [];
          const baseLayer = prev[prev.length - 1] || DEFAULT_LAYER;
          for (let i = 0; i < targetCount - currentCount; i++) {
            const newLayer = buildVariedLayerFrom?.(baseLayer, currentCount + i + 1, {
              shape: baseLayer.variationShape ?? 0.2,
              anim: baseLayer.variationAnim ?? 0.2,
              color: baseLayer.variationColor ?? 0.2,
              position: baseLayer.variationPosition ?? 0.2,
            }, { DEFAULT_LAYER, palettes }) || { ...baseLayer };
            additions.push({
              ...newLayer,
              id: `bpm-layer-${Date.now()}-${i}`,
              name: `Layer ${currentCount + i + 1}`,
            });
          }
          return [...prev, ...additions];
        } else {
          // Remove layers from end
          return prev.slice(0, targetCount);
        }
      });
    });
    return unregister;
  }, [registerBPMHandler, setLayers, DEFAULT_LAYER, buildVariedLayerFrom, palettes]);

  // Split variations: variationPosition, variationShape, variationAnim, variationColor, variationScale (0..3) on base layer [0]
  useEffect(() => {
    if (!registerBPMHandler) return;
    const u0 = registerBPMHandler('variationPosition', ({ value01 }) => {
      const v = Math.max(0, Math.min(1, value01));
      const mapped = +(v * 3).toFixed(2);
      setLayers?.(prev => prev.map((l, i) => (i === 0 ? { ...l, variationPosition: mapped } : l)));
    });
    const u1 = registerBPMHandler('variationShape', ({ value01 }) => {
      const v = Math.max(0, Math.min(1, value01));
      const mapped = +(v * 3).toFixed(2);
      setLayers?.(prev => prev.map((l, i) => (i === 0 ? { ...l, variationShape: mapped } : l)));
    });
    const u2 = registerBPMHandler('variationAnim', ({ value01 }) => {
      const v = Math.max(0, Math.min(1, value01));
      const mapped = +(v * 3).toFixed(2);
      setLayers?.(prev => prev.map((l, i) => (i === 0 ? { ...l, variationAnim: mapped } : l)));
    });
    const u3 = registerBPMHandler('variationColor', ({ value01 }) => {
      const v = Math.max(0, Math.min(1, value01));
      const mapped = +(v * 3).toFixed(2);
      setLayers?.(prev => prev.map((l, i) => (i === 0 ? { ...l, variationColor: mapped } : l)));
    });
    const u4 = registerBPMHandler('variationScale', ({ value01 }) => {
      const v = Math.max(0, Math.min(1, value01));
      const mapped = +(v * 6).toFixed(2) - 3; // -3 to +3
      setLayers?.(prev => prev.map((l, i) => (i === 0 ? { ...l, variationScale: mapped } : l)));
    });
    return () => {
      if (typeof u0 === 'function') u0();
      if (typeof u1 === 'function') u1();
      if (typeof u2 === 'function') u2();
      if (typeof u3 === 'function') u3();
      if (typeof u4 === 'function') u4();
    };
  }, [registerBPMHandler, setLayers]);

  // Global Blend Mode (cycle through modes)
  useEffect(() => {
    if (!registerBPMHandler) return;
    const unregister = registerBPMHandler('globalBlendMode', ({ value01 }) => {
      if (!blendModes || blendModes.length === 0) return;
      const v = Math.max(0, Math.min(1, value01));
      const index = Math.floor(v * blendModes.length);
      const clampedIndex = Math.max(0, Math.min(blendModes.length - 1, index));
      setGlobalBlendMode?.(blendModes[clampedIndex]);
    });
    return unregister;
  }, [registerBPMHandler, setGlobalBlendMode, blendModes]);

  // Palette selection (cycle through palettes)
  useEffect(() => {
    if (!registerBPMHandler) return;
    const unregister = registerBPMHandler('palette', ({ value01 }) => {
      if (!palettes || palettes.length === 0) return;
      const v = Math.max(0, Math.min(1, value01));
      const index = Math.floor(v * palettes.length);
      const clampedIndex = Math.max(0, Math.min(palettes.length - 1, index));
      const selectedPalette = palettes[clampedIndex];
      
      if (selectedPalette && selectedPalette.colors) {
        const colors = sampleColorsEven?.(selectedPalette.colors, 5) || selectedPalette.colors.slice(0, 5);
        setLayers?.(prev => prev.map((l, i) => (i === 0 ? {
          ...l,
          colors,
          numColors: colors.length,
          selectedColor: 0,
        } : l)));
      }
    });
    return unregister;
  }, [registerBPMHandler, setLayers, palettes, sampleColorsEven]);

  // Background Color (hue rotation)
  useEffect(() => {
    if (!registerBPMHandler) return;
    const unregister = registerBPMHandler('backgroundColor', ({ value01 }) => {
      const v = Math.max(0, Math.min(1, value01));
      const hue = Math.floor(v * 360);
      const color = `hsl(${hue}, 50%, 10%)`;
      setBackgroundColor?.(color);
    });
    return unregister;
  }, [registerBPMHandler, setBackgroundColor]);
}
