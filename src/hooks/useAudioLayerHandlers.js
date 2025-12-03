import { useEffect, useCallback } from 'react';
import { resolveLayerTargets, applyWithVary } from '../utils/varyUtils.js';
import { palettes } from '../constants/palettes';

// Sample colors from a palette (same logic as Controls.jsx)
const sampleColors = (src, count) => {
  if (!Array.isArray(src) || src.length === 0) return ['#000000'];
  if (count <= 0) return [src[0]];
  if (count >= src.length) return [...src];
  const result = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.floor((i / count) * src.length);
    result.push(src[idx]);
  }
  return result;
};

/**
 * Registers Audio handlers for layer parameters.
 * Similar to useBPMLayerHandlers but for audio-reactive automation.
 * 
 * The AudioContext dispatches values when audio is active,
 * allowing parameters to react to audio input.
 * 
 * Now respects parameterTargetMode (global vs individual) like MIDI does.
 */
export function useAudioLayerHandlers({
  registerAudioHandler,
  setLayers,
  layers,
  parameterTargetMode = 'individual',
  getActiveTargetLayerIds,
}) {
  // Build a signature of layer names so we only re-register when structure changes
  const layerSignature = Array.isArray(layers)
    ? layers.map((layer, index) => (layer?.name || `Layer ${index + 1}`)).join('|')
    : '';

  // Build a target set based on current target mode
  const buildTargetSet = useCallback((options = {}) => {
    const mode = options.mode || 'targeted';
    const layerIds = Array.isArray(layers) ? layers.map(l => l?.id).filter(Boolean) : [];
    if (mode === 'all') {
      return new Set(layerIds);
    }
    if (typeof getActiveTargetLayerIds !== 'function') return new Set();
    const ids = getActiveTargetLayerIds();
    return new Set(Array.isArray(ids) ? ids.filter(Boolean) : []);
  }, [getActiveTargetLayerIds, layers]);

  // Apply update respecting target mode (like MIDI's applyUpdateToTargets)
  const applyUpdateToTargets = useCallback((layerName, updater) => {
    // Find the layer that triggered this (by name)
    const triggerLayer = layers?.find((l, i) => (l?.name || `Layer ${i + 1}`) === layerName);
    
    const { effective: targets } = resolveLayerTargets({
      currentLayer: triggerLayer,
      buildTargetSet,
      targetMode: parameterTargetMode,
    });

    if (typeof setLayers === 'function' && targets.size > 0) {
      setLayers(prev => applyWithVary({
        layers: prev,
        targets,
        updater: (layer) => updater(layer),
      }));
    }
  }, [buildTargetSet, layers, parameterTargetMode, setLayers]);

  useEffect(() => {
    if (!registerAudioHandler || !setLayers || !layerSignature) return;

    const layerKeys = layerSignature.split('|').filter(Boolean);
    if (layerKeys.length === 0) return;

    const unsubs = [];

    const numericParams = [
      'numSides',
      'radiusFactor',
      'radiusX',
      'radiusY',
      'movementSpeed',
      'curviness',
      'wobble',
      'orbitRadiusX',
      'orbitRadiusY',
      'noiseAmount',
      'noiseScale',
      'opacity',
      'scaleSpeed',
      'scaleMin',
      'scaleMax',
      'width',
      'height',
      'colorFadeSpeed',
    ];

    layerKeys.forEach(layerKey => {
      const scaleId = `layer:${layerKey}:scale`;
      unsubs.push(registerAudioHandler(scaleId, ({ value01 }) => {
        applyUpdateToTargets(layerKey, (layer) => ({
          ...layer,
          position: { ...(layer?.position || {}), scale: value01 },
        }));
      }));

      // Palette index handler - cycles through palettes based on audio
      const paletteId = `layer:${layerKey}:paletteIndex`;
      unsubs.push(registerAudioHandler(paletteId, ({ value01 }) => {
        const list = palettes || [];
        if (!Array.isArray(list) || list.length === 0) return;
        const idx = Math.max(0, Math.min(list.length - 1, Math.floor(value01 * list.length)));
        const palette = list[idx];
        applyUpdateToTargets(layerKey, (layer) => {
          const count = Number.isFinite(layer?.numColors)
            ? layer.numColors
            : ((Array.isArray(layer?.colors) ? layer.colors.length : 0) || (palette?.colors?.length ?? 1));
          const src = Array.isArray(palette) ? palette : palette?.colors;
          const nextColors = sampleColors(src || [], count);
          return { ...layer, colors: [...nextColors], numColors: count, selectedColor: 0 };
        });
      }));

      numericParams.forEach(param => {
        const paramId = `layer:${layerKey}:${param}`;
        unsubs.push(registerAudioHandler(paramId, ({ value01 }) => {
          applyUpdateToTargets(layerKey, (layer) => ({
            ...layer,
            [param]: value01,
          }));
        }));
      });
    });

    return () => {
      unsubs.forEach(u => { if (typeof u === 'function') u(); });
    };
  }, [registerAudioHandler, setLayers, layerSignature, applyUpdateToTargets]);
}
