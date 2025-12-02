import { useEffect } from 'react';

/**
 * Registers Audio handlers for layer parameters.
 * Similar to useBPMLayerHandlers but for audio-reactive automation.
 * 
 * The AudioContext dispatches values when audio is active,
 * allowing parameters to react to audio input.
 */
export function useAudioLayerHandlers({
  registerAudioHandler,
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
    ];

    layerKeys.forEach(layerKey => {
      const scaleId = `layer:${layerKey}:scale`;
      unsubs.push(registerAudioHandler(scaleId, ({ value01 }) => {
        updateLayerByName(layerKey, (layer) => ({
          ...layer,
          position: { ...(layer?.position || {}), scale: value01 },
        }));
      }));

      numericParams.forEach(param => {
        const paramId = `layer:${layerKey}:${param}`;
        unsubs.push(registerAudioHandler(paramId, ({ value01 }) => {
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
  }, [registerAudioHandler, setLayers, layerSignature]);
}
