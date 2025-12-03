import { useEffect, useCallback } from 'react';
import { resolveLayerTargets, applyWithVary } from '../utils/varyUtils.js';

/**
 * Registers BPM handlers for layer parameters.
 * Similar to useMIDIHandlers but for BPM-synced automation.
 * 
 * The BPMContext dispatches values via requestAnimationFrame with throttling,
 * so this won't cause infinite re-render loops like the previous approach.
 * 
 * Now respects parameterTargetMode (global vs individual) like MIDI does.
 */
export function useBPMLayerHandlers({
  registerBPMHandler,
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
    if (!registerBPMHandler || !setLayers || !layerSignature) return;

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
    ];

    layerKeys.forEach(layerKey => {
      const scaleId = `layer:${layerKey}:scale`;
      unsubs.push(registerBPMHandler(scaleId, ({ value01 }) => {
        applyUpdateToTargets(layerKey, (layer) => ({
          ...layer,
          position: { ...(layer?.position || {}), scale: value01 },
        }));
      }));

      numericParams.forEach(param => {
        const paramId = `layer:${layerKey}:${param}`;
        unsubs.push(registerBPMHandler(paramId, ({ value01 }) => {
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
  }, [registerBPMHandler, setLayers, layerSignature, applyUpdateToTargets]);
}
