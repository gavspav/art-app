import { useEffect } from 'react';

/**
 * Registers BPM handlers for layer parameters.
 * Similar to useMIDIHandlers but for BPM-synced automation.
 * 
 * The BPMContext dispatches values via requestAnimationFrame with throttling,
 * so this won't cause infinite re-render loops like the previous approach.
 */
export function useBPMLayerHandlers({
  registerBPMHandler,
  setLayers,
  layers,
}) {
  // Build a signature of layer names so we only re-register when structure changes
  const layerSignature = Array.isArray(layers)
    ? layers.map((layer, index) => (layer?.name || `Layer ${index + 1}`)).join('|')
    : '';

  const updateLayerByName = (layerName, updater) => {
    setLayers?.(prev => prev.map((layer, index) => {
      const key = (layer?.name || `Layer ${index + 1}`).toString();
      if (key !== layerName) return layer;
      return updater(layer);
    }));
  };

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
        updateLayerByName(layerKey, (layer) => ({
          ...layer,
          position: { ...(layer?.position || {}), scale: value01 },
        }));
      }));

      numericParams.forEach(param => {
        const paramId = `layer:${layerKey}:${param}`;
        unsubs.push(registerBPMHandler(paramId, ({ value01 }) => {
          updateLayerByName(layerKey, (layer) => ({
            ...layer,
            [param]: value01,
          }));
        }));
      });
    });

    return () => {
      unsubs.forEach(u => { if (typeof u === 'function') u(); });
    };
  }, [registerBPMHandler, setLayers, layerSignature]);
}
