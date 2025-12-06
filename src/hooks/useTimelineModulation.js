import { useEffect, useRef, useCallback } from 'react';
import { useTimeline } from '../context/TimelineContext.jsx';
import { evaluateTrackAtTime } from '../utils/envelopes.js';
import { buildVariedLayerFrom } from '../utils/layerVariation.js';
import { DEFAULT_LAYER } from '../constants/defaults.js';
import { hexToRgb, rgbToHex } from '../utils/colorUtils.js';
import { lerpNodes, lerpSubpaths } from '../utils/nodeUtils.js';

const lerp = (a, b, t) => a + (b - a) * t;
const toNumber = (value, fallback) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};
const sanitizeHex = (val) => (typeof val === 'string' && /^#([0-9a-fA-F]{6})$/.test(val) ? val : '#000000');
const lerpColor = (ca, cb, t) => {
  const ra = hexToRgb(sanitizeHex(ca));
  const rb = hexToRgb(sanitizeHex(cb));
  return rgbToHex({
    r: Math.round(lerp(ra.r, rb.r, t)),
    g: Math.round(lerp(ra.g, rb.g, t)),
    b: Math.round(lerp(ra.b, rb.b, t)),
  });
};

const stripMorphFields = (state) => {
  if (!state || typeof state !== 'object') return state;
  const {
    morphEnabled: _me,
    morphRoute: _mr,
    morphDurationPerLeg: _md,
    morphEasing: _meas,
    morphLoopMode: _ml,
    morphMode: _mm,
    ...rest
  } = state;
  return rest;
};

/**
 * useTimelineModulation - Applies timeline track values to the modulation store
 * 
 * This hook evaluates all enabled timeline tracks at the current playback position
 * and writes the values to the modulation store. The animation loop then reads
 * from the store and applies all modulations in a single pass.
 * 
 * Also handles exclusivity: when a timeline track is enabled for a parameter,
 * it clears BPM/Audio/MIDI mappings for that parameter.
 */
export function useTimelineModulation({
  modulationStore,
  layers,
  // Context hooks for clearing other mappings (exclusivity)
  bpmContext,
  audioContext,
  midiContext,
  // Global setters for global parameters
  setGlobalSpeedMultiplier,
  setGlobalOpacity,
  setBackgroundColor,
  setLayers,
  getPresetSlot,
  morphRoute,
  morphNodes,
}) {
  const timeline = useTimeline();
  
  // Refs to avoid re-renders
  const modulationStoreRef = useRef(modulationStore);
  const layersRef = useRef(layers);
  const bpmContextRef = useRef(bpmContext);
  const audioContextRef = useRef(audioContext);
  const midiContextRef = useRef(midiContext);
  const getPresetSlotRef = useRef(getPresetSlot);
  const morphRouteRef = useRef(Array.isArray(morphRoute) ? [...morphRoute] : []);
  const morphNodesRef = useRef(false);
  
  // Keep refs in sync
  useEffect(() => { modulationStoreRef.current = modulationStore; }, [modulationStore]);
  useEffect(() => { layersRef.current = layers; }, [layers]);
  useEffect(() => { bpmContextRef.current = bpmContext; }, [bpmContext]);
  useEffect(() => { audioContextRef.current = audioContext; }, [audioContext]);
  useEffect(() => { midiContextRef.current = midiContext; }, [midiContext]);
  useEffect(() => { getPresetSlotRef.current = getPresetSlot; }, [getPresetSlot]);
  useEffect(() => { morphRouteRef.current = Array.isArray(morphRoute) ? [...morphRoute] : []; }, [morphRoute]);
  useEffect(() => { morphNodesRef.current = !!morphNodes; }, [morphNodes]);

  // Build a map of layer name -> layer id for resolving targetIds
  const layerNameToIdRef = useRef({});
  useEffect(() => {
    const map = {};
    if (Array.isArray(layers)) {
      layers.forEach((layer, index) => {
        const name = layer?.name || `Layer ${index + 1}`;
        map[name] = layer?.id;
        // Also map by id directly
        if (layer?.id) {
          map[layer.id] = layer.id;
        }
      });
    }
    layerNameToIdRef.current = map;
  }, [layers]);

  /**
   * Parse a targetId into its components
   * Format: 'layer:<layerIdOrName>:<paramId>' or 'global:<paramId>'
   */
  const parseTargetId = useCallback((targetId) => {
    if (!targetId || typeof targetId !== 'string') return null;
    
    const parts = targetId.split(':');
    if (parts.length < 2) return null;
    
    const type = parts[0];
    
    if (type === 'global') {
      return { type: 'global', paramId: parts[1] };
    }
    
    if (type === 'layer' && parts.length >= 3) {
      const layerIdOrName = parts[1];
      const paramId = parts.slice(2).join(':'); // In case param has colons
      
      // Resolve layer name to id
      const layerId = layerNameToIdRef.current[layerIdOrName] || layerIdOrName;
      
      return { type: 'layer', layerId, paramId };
    }
    
    return null;
  }, []);

  /**
   * Clear other modulation sources for a parameter (exclusivity)
   */
  const clearOtherMappings = useCallback((targetId) => {
    const parsed = parseTargetId(targetId);
    if (!parsed) return;
    
    if (parsed.type === 'layer') {
      const { layerId, paramId } = parsed;
      const layerName = layersRef.current?.find(l => l?.id === layerId)?.name;
      const fullParamId = layerName ? `layer:${layerName}:${paramId}` : null;
      
      // Clear BPM mapping
      if (fullParamId && bpmContextRef.current?.clearMapping) {
        bpmContextRef.current.clearMapping(fullParamId);
      }
      
      // Clear Audio mapping
      if (fullParamId && audioContextRef.current?.setMapping) {
        audioContextRef.current.setMapping(fullParamId, { band: 'none' });
      }
      
      // Clear MIDI mapping
      if (fullParamId && midiContextRef.current?.clearMapping) {
        midiContextRef.current.clearMapping(fullParamId);
      }
    } else if (parsed.type === 'global') {
      const { paramId } = parsed;
      
      // Clear BPM mapping for global param
      if (bpmContextRef.current?.clearMapping) {
        bpmContextRef.current.clearMapping(paramId);
      }
      
      // Clear Audio mapping for global param
      if (audioContextRef.current?.setMapping) {
        audioContextRef.current.setMapping(paramId, { band: 'none' });
      }
      
      // Clear MIDI mapping for global param
      if (midiContextRef.current?.clearMapping) {
        midiContextRef.current.clearMapping(paramId);
      }
    }
  }, [parseTargetId]);

  // Track which targetIds we've cleared mappings for (to avoid repeated clears)
  const clearedTargetsRef = useRef(new Set());

  // Apply timeline values to modulation store on each frame
  useEffect(() => {
    if (!timeline) return;
    
    const { isPlaying, positionSeconds, tracks } = timeline;
    const store = modulationStoreRef.current;
    
    if (!store || !Array.isArray(tracks)) return;
    
    // Clear all timeline modulations first
    store.clearAllMods('timeline');
    
    // Evaluate each enabled track
    for (const track of tracks) {
      if (!track.enabled || !track.targetId) continue;
      
      // Ensure exclusivity (clear other mappings once per target)
      if (!clearedTargetsRef.current.has(track.targetId)) {
        clearOtherMappings(track.targetId);
        clearedTargetsRef.current.add(track.targetId);
      }
      
      // Evaluate track at current position
      const value = evaluateTrackAtTime(track, positionSeconds);
      if (value === null) continue;
      
      // Parse target and apply
      const parsed = parseTargetId(track.targetId);
      if (!parsed) continue;
      
      if (parsed.type === 'layer') {
        // Apply to modulation store for layer parameter
        store.setMod('timeline', parsed.layerId, parsed.paramId, value);
      } else if (parsed.type === 'global') {
        // Apply to global setter directly
        switch (parsed.paramId) {
          case 'globalSpeedMultiplier':
            if (setGlobalSpeedMultiplier) setGlobalSpeedMultiplier(value);
            break;
          case 'layersCount': {
            if (typeof setLayers === 'function') {
              const target = Math.max(1, Math.min(20, Math.round(value)));
              setLayers(prev => {
                if (!Array.isArray(prev)) return prev;
                if (prev.length === target) return prev;
                if (prev.length > target) {
                  return prev.slice(0, target);
                }
                // grow by cloning last layer
                const next = [...prev];
                const template = prev[prev.length - 1] || {};
                while (next.length < target) {
                  next.push({
                    ...template,
                    id: `${template.id || 'layer'}-${Date.now()}-${next.length}`,
                    name: template.name ? `${template.name} ${next.length}` : `Layer ${next.length + 1}`,
                  });
                }
                return next;
              });
            }
            break;
          }
          case 'globalOpacity':
            // Apply opacity to all layers via modulation store
            if (Array.isArray(layersRef.current)) {
              layersRef.current.forEach(layer => {
                if (layer?.id) {
                  store.setMod('timeline', layer.id, 'opacity', value);
                }
              });
            }
            break;
          case 'morphProgress': {
            const getSlot = getPresetSlotRef.current;
            const route = morphRouteRef.current;
            if (!getSlot || !Array.isArray(route) || route.length < 2) {
              break;
            }

            const clamped = Math.max(0, Math.min(1, value));
            const totalLegs = route.length - 1;
            if (totalLegs <= 0) break;

            const scaled = clamped * totalLegs;
            let legIndex = Math.floor(scaled);
            if (legIndex >= totalLegs) {
              legIndex = totalLegs - 1;
            }
            const localT = Math.max(0, Math.min(1, scaled - legIndex));

            const fromId = route[legIndex];
            const toId = route[legIndex + 1];

            const fromSlot = getSlot(fromId);
            const toSlot = getSlot(toId);
            const fromState = fromSlot?.payload?.appState;
            const toState = toSlot?.payload?.appState;
            if (!fromState || !toState) {
              break;
            }

            const a = stripMorphFields(fromState);
            const b = stripMorphFields(toState);

            if (setBackgroundColor) {
              setBackgroundColor(lerpColor(a.backgroundColor || '#000000', b.backgroundColor || '#000000', localT));
            }

            if (setGlobalSpeedMultiplier) {
              const nextGS = lerp(
                Number(a.globalSpeedMultiplier || 1),
                Number(b.globalSpeedMultiplier || 1),
                localT,
              );
              setGlobalSpeedMultiplier(Number(nextGS));
            }

            const aLayers = Array.isArray(a.layers) ? a.layers : [];
            const bLayers = Array.isArray(b.layers) ? b.layers : [];

            if (typeof setLayers === 'function') {
              setLayers((prev) => {
                const prevLayers = Array.isArray(prev) ? [...prev] : [];
                const maxLen = Math.max(prevLayers.length, aLayers.length, bLayers.length);

                for (let i = prevLayers.length; i < maxLen; i += 1) {
                  const template = aLayers[i] || bLayers[i];
                  if (!template) continue;
                  const fromExists = Boolean(aLayers[i]);
                  const initialOpacity = fromExists
                    ? toNumber(template.opacity ?? 1, 1)
                    : 0;
                  prevLayers[i] = { ...template, opacity: initialOpacity };
                }

                return prevLayers.map((la, i) => {
                  const fromTemplate = aLayers[i];
                  const toTemplate = bLayers[i];
                  const laSrc = fromTemplate || (toTemplate ? { ...toTemplate, opacity: 0 } : la);
                  const lbSrc = toTemplate || (fromTemplate ? { ...fromTemplate, opacity: 0 } : la);

                  const pa = laSrc?.position
                    ? laSrc.position
                    : (la?.position || { x: 0.5, y: 0.5, scale: 1 });
                  const pb = lbSrc?.position ? lbSrc.position : pa;

                  const ca = Array.isArray(laSrc?.colors)
                    ? laSrc.colors
                    : (Array.isArray(la?.colors) ? la.colors : []);
                  const cb = Array.isArray(lbSrc?.colors) ? lbSrc.colors : ca;
                  const n = Math.min(ca.length || 0, cb.length || 0);
                  let nextColors = Array.isArray(la?.colors) ? [...la.colors] : [];
                  if (n > 0) {
                    nextColors = Array.from({ length: n }, (_, k) => lerpColor(ca[k], cb[k], localT));
                  } else if (cb.length) {
                    nextColors = cb.slice();
                  } else if (ca.length) {
                    nextColors = ca.slice();
                  }

                  const baseLayer = la || laSrc || lbSrc || {};
                  const nextOpacity = lerp(
                    toNumber(laSrc?.opacity ?? baseLayer.opacity ?? 1, 1),
                    toNumber(lbSrc?.opacity ?? baseLayer.opacity ?? 1, 1),
                    localT,
                  );

                  return {
                    ...baseLayer,
                    opacity: Math.max(0, Math.min(1, nextOpacity)),
                    rotation: lerp(
                      toNumber(laSrc?.rotation ?? baseLayer.rotation ?? 0, 0),
                      toNumber(lbSrc?.rotation ?? baseLayer.rotation ?? 0, 0),
                      localT,
                    ),
                    radiusFactor: lerp(
                      toNumber(laSrc?.radiusFactor ?? baseLayer.radiusFactor ?? 0.125, 0.125),
                      toNumber(lbSrc?.radiusFactor ?? baseLayer.radiusFactor ?? 0.125, 0.125),
                      localT,
                    ),
                    movementSpeed: lerp(
                      toNumber(laSrc?.movementSpeed ?? baseLayer.movementSpeed ?? 1, 1),
                      toNumber(lbSrc?.movementSpeed ?? baseLayer.movementSpeed ?? 1, 1),
                      localT,
                    ),
                    colors: nextColors,
                    numColors: Array.isArray(nextColors) && nextColors.length
                      ? nextColors.length
                      : (baseLayer.numColors ?? 1),
                    selectedColor: 0,
                    position: {
                      ...pa,
                      x: lerp(
                        toNumber(pa?.x ?? 0.5, 0.5),
                        toNumber(pb?.x ?? (pa?.x ?? 0.5), pa?.x ?? 0.5),
                        localT,
                      ),
                      y: lerp(
                        toNumber(pa?.y ?? 0.5, 0.5),
                        toNumber(pb?.y ?? (pa?.y ?? 0.5), pa?.y ?? 0.5),
                        localT,
                      ),
                      scale: lerp(
                        toNumber(pa?.scale ?? 1, 1),
                        toNumber(pb?.scale ?? (pa?.scale ?? 1), pa?.scale ?? 1),
                        localT,
                      ),
                    },
                    // Node morphing (if enabled and topology matches)
                    ...(morphNodesRef.current ? (() => {
                      const nodesA = laSrc?.nodes;
                      const nodesB = lbSrc?.nodes;
                      const subpathsA = laSrc?.subpaths;
                      const subpathsB = lbSrc?.subpaths;
                      // Try subpaths first, then nodes
                      if (Array.isArray(subpathsA) && Array.isArray(subpathsB)) {
                        const interpolated = lerpSubpaths(subpathsA, subpathsB, localT);
                        if (interpolated) return { subpaths: interpolated };
                      }
                      if (Array.isArray(nodesA) && Array.isArray(nodesB)) {
                        const interpolated = lerpNodes(nodesA, nodesB, localT);
                        if (interpolated) return { nodes: interpolated };
                      }
                      return {};
                    })() : {}),
                  };
                });
              });
            }
            break;
          }
          case 'variationPosition':
          case 'variationShape':
          case 'variationAnim':
          case 'variationColor':
          case 'variationScale': {
            // Variation parameters require rebuilding layers, not just setting values
            // This mirrors the logic in GlobalControls.applyVariationValue
            if (typeof setLayers === 'function') {
              const prop = parsed.paramId;
              const categoryMap = {
                variationPosition: ['position'],
                variationShape: ['shape'],
                variationAnim: ['anim'],
                variationColor: ['color'],
                variationScale: ['scale'],
              };
              const affectCategories = categoryMap[prop] || null;
              
              setLayers(prev => {
                if (!Array.isArray(prev) || prev.length <= 1) return prev;
                
                // Update the variation value on all layers
                const updated = prev.map(layer => ({
                  ...layer,
                  [prop]: value,
                }));
                
                const firstLayer = updated[0];
                const baseVar = {
                  shape: Number(firstLayer?.variationShape ?? DEFAULT_LAYER.variationShape),
                  anim: Number(firstLayer?.variationAnim ?? DEFAULT_LAYER.variationAnim),
                  color: Number(firstLayer?.variationColor ?? DEFAULT_LAYER.variationColor),
                  position: Number(firstLayer?.variationPosition ?? DEFAULT_LAYER.variationPosition),
                  scale: Number(firstLayer?.variationScale ?? DEFAULT_LAYER.variationScale ?? 0),
                };
                
                // Rebuild layers with new variation
                const rebuilt = [firstLayer];
                let prevLayer = firstLayer;
                
                for (let i = 1; i < updated.length; i++) {
                  const original = updated[i];
                  const varied = buildVariedLayerFrom(prevLayer, i + 1, baseVar, {
                    affectCategories,
                    preserveSeeds: true,
                  }) || original;
                  
                  const merged = {
                    ...original,
                    ...varied,
                    id: original.id ?? varied.id,
                    name: original.name || varied.name,
                  };
                  
                  // Preserve fields not in the affected category
                  const categorySet = affectCategories ? new Set(affectCategories) : null;
                  if (categorySet) {
                    if (!categorySet.has('color') && Array.isArray(original.colors)) {
                      merged.colors = [...original.colors];
                      merged.numColors = original.numColors;
                    }
                    if (!categorySet.has('position') && !categorySet.has('scale') && original.position) {
                      merged.position = { ...original.position };
                    }
                  }
                  
                  rebuilt.push(merged);
                  prevLayer = merged;
                }
                
                return rebuilt;
              });
            }
            break;
          }
          // Add more global parameters as needed
          default:
            // For unknown global params, try to apply via modulation store
            // using a special 'global' layer id
            store.setMod('timeline', '__global__', parsed.paramId, value);
        }
      }
    }
  }, [
    timeline?.isPlaying,
    timeline?.positionSeconds,
    timeline?.tracks,
    parseTargetId,
    clearOtherMappings,
    setGlobalSpeedMultiplier,
    setLayers,
  ]);

  // Reset cleared targets when tracks change
  useEffect(() => {
    clearedTargetsRef.current.clear();
  }, [timeline?.tracks]);

  // Clean up timeline modulations when timeline is hidden or stopped
  useEffect(() => {
    if (!timeline?.visible || !timeline?.isPlaying) {
      const store = modulationStoreRef.current;
      if (store) {
        store.clearAllMods('timeline');
      }
    }
  }, [timeline?.visible, timeline?.isPlaying]);

  return {
    parseTargetId,
    clearOtherMappings,
  };
}

export default useTimelineModulation;
