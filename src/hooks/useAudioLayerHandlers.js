import { useCallback, useEffect, useMemo, useRef } from 'react';
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
 * 
 * NEW APPROACH: Instead of calling setLayers directly (which caused multiple
 * React updates per frame and UI clogging), handlers now write to a modulation
 * store. The animation loop reads from the store and applies all modulations
 * in a single setLayers call per frame.
 * 
 * When parameterTargetMode is 'global', modulations are broadcast to ALL layers.
 */
export function useAudioLayerHandlers({
  registerAudioHandler,
  layers,
  modulationStore,
  palettes = [],
  parameterTargetMode = 'individual',
  audioMappings = {},
  parameters = [],
}) {
  // Keep a fresh ref to audioMappings so the randomizeAll handler always reads current state
  const audioMappingsRef = useRef(audioMappings);
  audioMappingsRef.current = audioMappings;
  const activeLayerMappingIdsRef = useRef(new Set());

  // Build a signature of layer IDs and names so we only re-register when structure changes
  const layerSignature = Array.isArray(layers)
    ? layers.map((layer, index) => `${layer?.id || index}:${layer?.name || `Layer ${index + 1}`}`).join('|')
    : '';

  const layerEntriesForCleanup = useMemo(() => (
    layerSignature
      .split('|')
      .filter(Boolean)
      .map((entry) => {
        const [id, ...nameParts] = entry.split(':');
        return { id, name: nameParts.join(':') };
      })
      .filter((entry) => !!entry.id)
  ), [layerSignature]);

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

  const projectToParamBounds = useCallback((paramId, value, mappingId = null) => {
    const bounds = parameterBoundsById.get(paramId);
    if (!bounds || !Number.isFinite(value)) return value;

    const mapping = (
      mappingId
      && audioMappingsRef.current
      && typeof audioMappingsRef.current === 'object'
    ) ? audioMappingsRef.current[mappingId] : null;
    const outMin = Number(mapping?.range?.outputMin);
    const outMax = Number(mapping?.range?.outputMax);
    if (Number.isFinite(outMin) && Number.isFinite(outMax) && Math.abs(outMax - outMin) > 1e-9) {
      const normalized = (value - outMin) / (outMax - outMin);
      const n = Math.max(0, Math.min(1, normalized));
      return bounds.min + n * (bounds.max - bounds.min);
    }

    return Math.max(bounds.min, Math.min(bounds.max, value));
  }, [parameterBoundsById]);

  // Clear stale per-layer audio mods when mappings are removed/disabled.
  useEffect(() => {
    if (!modulationStore?.clearMod) return;
    const mappings = (audioMappings && typeof audioMappings === 'object') ? audioMappings : {};
    const nextActive = new Set(
      Object.entries(mappings)
        .filter(([paramId, mapping]) => (
          typeof paramId === 'string'
          && paramId.startsWith('layer:')
          && mapping
          && mapping.band
          && mapping.band !== 'none'
        ))
        .map(([paramId]) => paramId)
    );

    const removedIds = [];
    activeLayerMappingIdsRef.current.forEach((paramId) => {
      if (!nextActive.has(paramId)) removedIds.push(paramId);
    });

    if (removedIds.length > 0) {
      const layerEntries = layerEntriesForCleanup;

      const resolveTargetLayerIds = (target) => {
        if (target === 'all') {
          return layerEntries.map(entry => entry.id).filter(Boolean);
        }
        const numeric = parseInt(target, 10);
        if (Number.isFinite(numeric) && String(numeric) === target) {
          const hit = layerEntries[numeric - 1];
          if (hit?.id) return [hit.id];
          return layerEntries.map(entry => entry.id).filter(Boolean);
        }
        const matches = layerEntries
          .filter(entry => entry.id === target || entry.name === target)
          .map(entry => entry.id)
          .filter(Boolean);
        if (matches.length > 0) return matches;
        return layerEntries.map(entry => entry.id).filter(Boolean);
      };

      removedIds.forEach((paramId) => {
        const parts = paramId.split(':');
        if (parts.length < 3 || parts[0] !== 'layer') return;
        const target = parts[1];
        const layerParam = parts.slice(2).join(':');
        resolveTargetLayerIds(target).forEach((layerId) => {
          modulationStore.clearMod('audio', layerId, layerParam);
        });
      });
    }

    activeLayerMappingIdsRef.current = nextActive;
  }, [audioMappings, layerEntriesForCleanup, modulationStore]);

  useEffect(() => {
    if (!registerAudioHandler || !modulationStore || !layerSignature) return;

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
      'wobbleSpeed',
      'symmetry',
      'freqJitter',
      'movementSpeed',
      'movementStyle',
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
          setMod('audio', id, paramId, value);
        });
      } else {
        // Apply only to the source layer
        setMod('audio', sourceLayerId, paramId, value);
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
        unsubs.push(registerAudioHandler(scaleId, ({ value01 }) => {
          applyToTargets(layerId, 'scale', projectToParamBounds('scale', value01, scaleId));
        }));

        // Palette index handler - cycles through palettes based on audio
        const paletteId = `layer:${layerKey}:paletteIndex`;
        unsubs.push(registerAudioHandler(paletteId, ({ value01, raw, processed }) => {
          const list = palettes || [];
          if (!Array.isArray(list) || list.length === 0) return;
          const normalized = Math.max(0, Math.min(
            1,
            Number.isFinite(processed)
              ? processed
              : (Number.isFinite(raw) ? raw : (Number.isFinite(value01) ? value01 : 0))
          ));
          const idx = Math.max(0, Math.min(list.length - 1, Math.floor(normalized * list.length)));
          const palette = list[idx];
          const src = Array.isArray(palette) ? palette : palette?.colors;
          const nextColors = sampleColors(src || [], 5); // Default to 5 colors
          applyToTargets(layerId, 'colors', nextColors);
        }));

        // Numeric params
        numericParams.forEach(param => {
          const paramId = `layer:${layerKey}:${param}`;
          unsubs.push(registerAudioHandler(paramId, ({ value01 }) => {
            applyToTargets(layerId, param, projectToParamBounds(param, value01, paramId));
          }));
        });
      });
    });

    // Randomize All handler: randomize each active per-layer mapping within its configured range
    unsubs.push(registerAudioHandler('randomizeAll', () => {
      const mappings = audioMappingsRef.current;
      if (!mappings || typeof mappings !== 'object') return;

      Object.entries(mappings).forEach(([paramId, mapping]) => {
        if (!paramId.startsWith('layer:') || !mapping || mapping.band === 'none') return;
        const parts = paramId.split(':');
        if (parts.length < 3) return;
        const target = parts[1];
        const param = parts.slice(2).join(':');
        const range = mapping.range || {};
        const outMin = Number.isFinite(range.outputMin) ? range.outputMin : 0;
        const outMax = Number.isFinite(range.outputMax) ? range.outputMax : 1;
        const randomValue = outMin + Math.random() * (outMax - outMin);
        const boundedRandomValue = projectToParamBounds(param, randomValue, paramId);

        if (target === 'all') {
          layerEntries.forEach(({ id }) => { setMod('audio', id, param, boundedRandomValue); });
        } else {
          const idx = parseInt(target, 10);
          if (Number.isFinite(idx) && idx >= 1 && idx <= layerEntries.length) {
            setMod('audio', layerEntries[idx - 1].id, param, boundedRandomValue);
          }
        }
      });
    }));

    // Patch matrix per-layer handlers: layer:all:PARAM and layer:N:PARAM (1-based index)
    // These are keyed by the paramIds the Audio Patch Matrix UI constructs.
    const patchMatrixParams = [...numericParams, 'scale', 'paletteIndex'];

    // "All layers" target: layer:all:PARAM → broadcast to every layer
    patchMatrixParams.forEach(param => {
      const allId = `layer:all:${param}`;
      if (param === 'paletteIndex') {
        unsubs.push(registerAudioHandler(allId, ({ value01, raw, processed }) => {
          const list = palettes || [];
          if (!Array.isArray(list) || list.length === 0) return;
          const normalized = Math.max(0, Math.min(1,
            Number.isFinite(processed) ? processed
              : (Number.isFinite(raw) ? raw : (Number.isFinite(value01) ? value01 : 0))
          ));
          const idx = Math.max(0, Math.min(list.length - 1, Math.floor(normalized * list.length)));
          const palette = list[idx];
          const src = Array.isArray(palette) ? palette : palette?.colors;
          const nextColors = sampleColors(src || [], 5);
          layerEntries.forEach(({ id }) => { setMod('audio', id, 'colors', nextColors); });
        }));
      } else {
        unsubs.push(registerAudioHandler(allId, ({ value01 }) => {
          const bounded = projectToParamBounds(param, value01, allId);
          layerEntries.forEach(({ id }) => { setMod('audio', id, param, bounded); });
        }));
      }
    });

    // Per-index target: layer:N:PARAM (1-based) → apply to layer at index N-1
    layerEntries.forEach(({ id: layerId }, layerIndex) => {
      const oneBasedIndex = String(layerIndex + 1);
      patchMatrixParams.forEach(param => {
        const indexedId = `layer:${oneBasedIndex}:${param}`;
        if (param === 'paletteIndex') {
          unsubs.push(registerAudioHandler(indexedId, ({ value01, raw, processed }) => {
            const list = palettes || [];
            if (!Array.isArray(list) || list.length === 0) return;
            const normalized = Math.max(0, Math.min(1,
              Number.isFinite(processed) ? processed
                : (Number.isFinite(raw) ? raw : (Number.isFinite(value01) ? value01 : 0))
            ));
            const idx = Math.max(0, Math.min(list.length - 1, Math.floor(normalized * list.length)));
            const palette = list[idx];
            const src = Array.isArray(palette) ? palette : palette?.colors;
            const nextColors = sampleColors(src || [], 5);
            setMod('audio', layerId, 'colors', nextColors);
          }));
        } else {
          unsubs.push(registerAudioHandler(indexedId, ({ value01 }) => {
            setMod('audio', layerId, param, projectToParamBounds(param, value01, indexedId));
          }));
        }
      });
    });

    return () => {
      unsubs.forEach(u => { if (typeof u === 'function') u(); });
    };
  }, [registerAudioHandler, modulationStore, layerSignature, parameterTargetMode, palettes, projectToParamBounds]);
}
