import { useCallback, useState } from 'react';

export function useRandomizationControls({
  layersRef,
  setLayers,
  randomizeLayer,
  randomizeAnimationOnly,
  selectedLayerIndex,
  palettes,
  pickPaletteColors,
  sampleColorsEven,
  randomizePalette,
  randomizeNumColors,
  colorCountMin,
  colorCountMax,
  classicMode,
  classicRandomizeAll,
  modernRandomizeAll,
}) {
  const [includeRnd, setIncludeRnd] = useState({
    backgroundColor: true,
    globalSpeedMultiplier: true,
    globalBlendMode: true,
    layers: true,
    animation: true,
    palette: true,
    numColors: true,
    colorAssignments: true,
    exportSettings: true,
    // legacy key kept for backward compat with saved states; not used by new UI
    variation: true,
  });

  const getIsRnd = useCallback((id) => !!includeRnd[id], [includeRnd]);

  const setIsRnd = useCallback((id, value) => {
    setIncludeRnd(prev => ({
      ...prev,
      [id]: !!value,
    }));
  }, []);

  const randomizeCurrentLayer = useCallback((randomizePaletteFlag = false) => {
    const snapshot = layersRef.current || [];
    const idx = Math.max(0, Math.min(selectedLayerIndex, Math.max(0, snapshot.length - 1)));
    const updated = randomizeLayer(idx, randomizePaletteFlag);
    if (!updated) return;
    setLayers(prev => prev.map((layer, i) => (i === idx ? updated : layer)));
  }, [layersRef, randomizeLayer, selectedLayerIndex, setLayers]);

  const randomizeAnimationForCurrentLayer = useCallback(() => {
    const snapshot = layersRef.current || [];
    const idx = Math.max(0, Math.min(selectedLayerIndex, Math.max(0, snapshot.length - 1)));
    const updated = randomizeAnimationOnly(idx);
    if (!updated) return;
    setLayers(prev => prev.map((layer, i) => (i === idx ? updated : layer)));
  }, [layersRef, randomizeAnimationOnly, selectedLayerIndex, setLayers]);

  const randomizeCurrentLayerColors = useCallback(() => {
    const snapshot = layersRef.current || [];
    const idx = Math.max(0, Math.min(selectedLayerIndex, Math.max(0, snapshot.length - 1)));
    const layer = snapshot[idx];
    if (!layer) return;
    const baseColors = Array.isArray(layer.colors) ? layer.colors : [];
    const srcPalette = randomizePalette
      ? pickPaletteColors(palettes, Math.random, baseColors)
      : baseColors;
    const cMin = Math.max(1, Math.floor(colorCountMin));
    const cMaxCap = Math.max(cMin, Math.floor(colorCountMax));
    let n = Number.isFinite(layer.numColors) ? layer.numColors : (baseColors.length || 1);
    if (randomizeNumColors) {
      const maxN = Math.min(cMaxCap, (srcPalette.length || cMaxCap));
      const minN = cMin;
      n = maxN > 0 ? Math.floor(Math.random() * (maxN - minN + 1)) + minN : 1;
    }
    let nextColors = sampleColorsEven(srcPalette, Math.max(1, n));
    if (!randomizePalette && !randomizeNumColors) {
      const same = Array.isArray(baseColors)
        && baseColors.length === nextColors.length
        && baseColors.every((color, index) => color === nextColors[index]);
      if (same) {
        if ((baseColors?.length || 0) <= 1) {
          const pool = pickPaletteColors(palettes, Math.random, baseColors.length ? baseColors : ['#ffffff']);
          if (pool.length) {
            let pick = pool[Math.floor(Math.random() * pool.length)];
            if (baseColors.length && pool.length > 1) {
              let guard = 0;
              while (pick === baseColors[0] && guard++ < 8) {
                pick = pool[Math.floor(Math.random() * pool.length)];
              }
            }
            nextColors = [pick];
            n = 1;
          }
        } else {
          const arr = [...baseColors];
          const len = arr.length;
          const offset = Math.max(1, Math.floor(Math.random() * len));
          nextColors = Array.from({ length: len }, (_, i) => arr[(i + offset) % len]);
        }
      }
    }
    const updated = {
      ...layer,
      colors: nextColors,
      numColors: nextColors.length,
      selectedColor: 0,
    };
    setLayers(prev => prev.map((l, i) => (i === idx ? updated : l)));
  }, [colorCountMax, colorCountMin, layersRef, palettes, randomizeNumColors, randomizePalette, sampleColorsEven, selectedLayerIndex, setLayers]);

  const handleRandomizeAll = useCallback(() => {
    if (classicMode) {
      classicRandomizeAll();
      return;
    }
    modernRandomizeAll();
  }, [classicMode, classicRandomizeAll, modernRandomizeAll]);

  return {
    getIsRnd,
    setIsRnd,
    randomizeCurrentLayer,
    randomizeAnimationForCurrentLayer,
    randomizeCurrentLayerColors,
    handleRandomizeAll,
  };
}
