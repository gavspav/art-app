import { useEffect } from 'react';
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
 * Registers BPM handlers for layer parameters.
 * 
 * NEW APPROACH: Instead of calling setLayers directly (which caused multiple
 * React updates per frame and UI clogging), handlers now write to a modulation
 * store. The animation loop reads from the store and applies all modulations
 * in a single setLayers call per frame.
 * 
 * When parameterTargetMode is 'global', modulations are broadcast to ALL layers.
 */
export function useBPMLayerHandlers({
  registerBPMHandler,
  layers,
  modulationStore,
  palettes = [],
  parameterTargetMode = 'individual',
}) {
  // Build a signature of layer IDs and names so we only re-register when structure changes
  const layerSignature = Array.isArray(layers)
    ? layers.map((layer, index) => `${layer?.id || index}:${layer?.name || `Layer ${index + 1}`}`).join('|')
    : '';

  useEffect(() => {
    if (!registerBPMHandler || !modulationStore || !layerSignature) return;

    const { setMod } = modulationStore;
    
    // Parse layer signature to get id:name pairs
    const layerEntries = layerSignature.split('|').filter(Boolean).map(entry => {
      const [id, ...nameParts] = entry.split(':');
      return { id, name: nameParts.join(':') };
    });
    if (layerEntries.length === 0) return;

    const unsubs = [];

    const numericParams = [
      // Shape
      'numSides',
      'curviness',
      'radiusFactor',
      'radiusFactorX',
      'radiusFactorY',
      'xOffset',
      'yOffset',
      'rotation',
      'width',
      'height',
      // Variation
      'variationPosition',
      'variationShape',
      'variationAnim',
      'variationColor',
      'variationScale',
      // Appearance
      'opacity',
      // Movement
      'wobble',
      'noiseAmount',
      'noiseScale',
      'movementSpeed',
      'movementAngle',
      'scaleSpeed',
      'scaleMin',
      'scaleMax',
      'orbitRadiusX',
      'orbitRadiusY',
      // Advanced
      'freq1',
      'freq2',
      'freq3',
      // Color
      'colorFadeSpeed',
      // Image Effects
      'imageBlur',
      'imageBrightness',
      'imageContrast',
      'imageHue',
      'imageSaturation',
      'imageDistortion',
    ];

    // Helper to apply modulation to target layers based on parameterTargetMode
    const applyToTargets = (sourceLayerId, paramId, value) => {
      if (parameterTargetMode === 'global') {
        // Broadcast to ALL layers
        layerEntries.forEach(({ id }) => {
          setMod('bpm', id, paramId, value);
        });
      } else {
        // Apply only to the source layer
        setMod('bpm', sourceLayerId, paramId, value);
      }
    };

    layerEntries.forEach(({ id: layerId, name: layerName }) => {
      const layerKeys = Array.from(new Set([
        String(layerId || ''),
        String(layerName || ''),
      ].filter(Boolean)));

      layerKeys.forEach((layerKey) => {
        // Scale handler
        const scaleId = `layer:${layerKey}:scale`;
        unsubs.push(registerBPMHandler(scaleId, ({ value01 }) => {
          applyToTargets(layerId, 'scale', value01);
        }));

        // Palette index handler - cycles through palettes based on BPM
        const paletteId = `layer:${layerKey}:paletteIndex`;
        unsubs.push(registerBPMHandler(paletteId, ({ value01 }) => {
          const list = palettes || [];
          if (!Array.isArray(list) || list.length === 0) return;
          const normalized = Math.max(0, Math.min(1, value01));
          const idx = Math.max(0, Math.min(list.length - 1, Math.floor(normalized * list.length)));
          const palette = list[idx];
          const src = Array.isArray(palette) ? palette : palette?.colors;
          const nextColors = sampleColors(src || [], 5); // Default to 5 colors
          applyToTargets(layerId, 'colors', nextColors);
        }));

        // Numeric params
        numericParams.forEach(param => {
          const paramId = `layer:${layerKey}:${param}`;
          unsubs.push(registerBPMHandler(paramId, ({ value01 }) => {
            applyToTargets(layerId, param, value01);
          }));
        });
      });
    });

    return () => {
      unsubs.forEach(u => { if (typeof u === 'function') u(); });
    };
  }, [registerBPMHandler, modulationStore, layerSignature, parameterTargetMode, palettes]);
}
