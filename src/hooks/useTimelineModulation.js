import { useEffect, useRef, useCallback } from 'react';
import { useTimeline } from '../context/TimelineContext.jsx';
import { useAppState } from '../context/AppStateContext.jsx';
import { evaluateTrackAtTime, evaluateShapeTrackAtTime, evaluateColorTrackAtTime, evaluateGlobalShapeTrackAtTime } from '../utils/envelopes.js';
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
  // Context hooks (timeline mode is authoritative; we don't clear user mappings)
  bpmContext,
  audioContext,
  midiContext,
  // Global setters for global parameters
  setGlobalSpeedMultiplier,
  setGlobalOpacity,
  setBackgroundColor,
  setGlobalBlendMode,
  // Global appearance helpers
  blendModes,
  palettes,
  sampleColorsEven,
  // Layer setters / morph helpers
  setLayers,
  getPresetSlot,
  morphRoute,
  morphNodes,
  // Ref for shape track updates (consumed by animation loop)
  shapeTrackUpdatesRef,
}) {
  const timeline = useTimeline();
  const { isNodeEditMode, nodeEditContext, timelineMode } = useAppState() || {};
  
  // Refs to avoid re-renders
  const modulationStoreRef = useRef(modulationStore);
  // Initialize layersRef with current layers value (not empty)
  const layersRef = useRef(Array.isArray(layers) ? layers : []);
  const bpmContextRef = useRef(bpmContext);
  const audioContextRef = useRef(audioContext);
  const midiContextRef = useRef(midiContext);
  const getPresetSlotRef = useRef(getPresetSlot);
  const morphRouteRef = useRef(Array.isArray(morphRoute) ? [...morphRoute] : []);
  const morphNodesRef = useRef(false);
  
  // Keep refs in sync - update synchronously to avoid stale data in RAF loops
  modulationStoreRef.current = modulationStore;
  layersRef.current = Array.isArray(layers) ? layers : [];
  useEffect(() => { bpmContextRef.current = bpmContext; }, [bpmContext]);
  useEffect(() => { audioContextRef.current = audioContext; }, [audioContext]);
  useEffect(() => { midiContextRef.current = midiContext; }, [midiContext]);
  useEffect(() => { getPresetSlotRef.current = getPresetSlot; }, [getPresetSlot]);
  useEffect(() => { morphRouteRef.current = Array.isArray(morphRoute) ? [...morphRoute] : []; }, [morphRoute]);
  useEffect(() => { morphNodesRef.current = !!morphNodes; }, [morphNodes]);

  // Layer pool for timeline layersCount modulation - preserves layer IDs when shrinking/growing
  // This prevents tracks from losing their targets when layer count changes during playback
  const layerPoolRef = useRef([]);
  
  // Track the max layer count seen during this timeline session to know when to use pool
  const maxLayerCountRef = useRef(0);
  useEffect(() => {
    if (Array.isArray(layers) && layers.length > maxLayerCountRef.current) {
      maxLayerCountRef.current = layers.length;
    }
  }, [layers]);

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

  // In the "two-mode" model, timeline mode is authoritative and BPM/Audio are disabled.
  // Avoid destructive clearing of user mappings.

  // Get direct position access from timeline (for RAF-based updates)
  const getPositionSeconds = timeline?.getPositionSeconds;
  const getPositionSecondsRef = useRef(getPositionSeconds);
  useEffect(() => { getPositionSecondsRef.current = getPositionSeconds; }, [getPositionSeconds]);

  // shapeTrackUpdatesRef is passed in from parent and shared with animation loop
  // This allows shape track data to be applied at the animation loop's framerate

  // Apply timeline values to modulation store on each frame
  // Note: During playback, the RAF loop below handles layer parameter updates for smoother animation
  useEffect(() => {
    if (!timeline) return;
    if (!timelineMode) {
      const store = modulationStoreRef.current;
      if (store) {
        store.clearAllMods('timeline');
      }
      if (shapeTrackUpdatesRef) {
        shapeTrackUpdatesRef.current = new Map();
      }
      return;
    }
    
    const { isPlaying, positionSeconds, tracks } = timeline;
    const store = modulationStoreRef.current;
    
    if (!store || !Array.isArray(tracks)) return;
    
    // Clear all timeline modulations first when not playing
    // During playback, RAF loop manages layer params for smoother updates
    if (!isPlaying) {
      store.clearAllMods('timeline');
    }
    
    // Evaluate each enabled track
    // Collect shape track results to apply after numeric tracks
    const shapeUpdates = []; // { layerId, nodes, subpaths, position, animation, colors }

    for (const track of tracks) {
      if (!track.enabled || !track.targetId) continue;
      
      // Handle global shape tracks (affects ALL layers at once)
      // During playback, the RAF loop handles this for smooth 60fps updates
      // When paused (scrubbing), we add to shapeUpdates for the scrubbing preview below
      if (track.type === 'globalShape') {
        if (!isPlaying) {
          const globalResult = evaluateGlobalShapeTrackAtTime(track, positionSeconds, lerpNodes, lerpSubpaths);
          if (globalResult && Array.isArray(globalResult.layers)) {
            // Add each layer's interpolated data to shapeUpdates
            globalResult.layers.forEach((interpolatedData, index) => {
              const layer = layers[index];
              if (!layer || !interpolatedData) return;
              
              const updateData = {
                layerId: layer.id,
                layerName: layer.name,
                nodes: interpolatedData.nodes,
                subpaths: interpolatedData.subpaths,
                position: interpolatedData.position,
                shapeParams: interpolatedData.shapeParams,
                animation: interpolatedData.animation,
                colors: interpolatedData.colors,
                isGlobalShapeTrack: true,
              };
              
              shapeUpdates.push(updateData);
            });
          }
        }
        continue;
      }
      
      // Handle shape tracks separately (now includes position, animation, colors)
      if (track.type === 'shape') {
        const shapeResult = evaluateShapeTrackAtTime(track, positionSeconds, lerpNodes, lerpSubpaths);
        if (shapeResult) {
          const parsed = parseTargetId(track.targetId);
          if (parsed?.type === 'layer' && parsed.paramId === 'shape') {
            // Extract original layer name from targetId for reliable lookup
            const parts = track.targetId.split(':');
            const originalLayerName = parts.length >= 2 ? parts[1] : parsed.layerId;
            shapeUpdates.push({
              layerId: parsed.layerId,
              layerName: originalLayerName, // Store original name for lookup
              nodes: shapeResult.nodes,
              subpaths: shapeResult.subpaths,
              position: shapeResult.position,       // Extended: interpolated position
              shapeParams: shapeResult.shapeParams, // Extended: Layer Shape Tab params (Sides, Curviness, Size, etc.)
              animation: shapeResult.animation,     // Extended: interpolated animation params
              colors: shapeResult.colors,           // Extended: interpolated colors
            });
          }
        }
        continue;
      }
      
      // Handle color tracks separately
      if (track.type === 'color') {
        const colorResult = evaluateColorTrackAtTime(track, positionSeconds);
        if (colorResult) {
          const parsed = parseTargetId(track.targetId);
          if (parsed?.type === 'layer' && parsed.paramId === 'color') {
            // Store the color in the modulation store as 'colors' array
            store.setMod('timeline', parsed.layerId, 'colors', [colorResult]);
          }
        }
        continue;
      }
      
      // Evaluate numeric track at current position
      const value = evaluateTrackAtTime(track, positionSeconds);
      if (value === null) continue;
      
      // Parse target and apply
      const parsed = parseTargetId(track.targetId);
      if (!parsed) continue;
      
      if (parsed.type === 'layer') {
        // Apply to modulation store for layer parameter
        // During playback, RAF loop handles this for smoother updates
        if (!isPlaying) {
          store.setMod('timeline', parsed.layerId, parsed.paramId, value);
        }
      } else if (parsed.type === 'global') {
        // Apply to global setter directly
        switch (parsed.paramId) {
          case 'globalSpeedMultiplier':
            if (setGlobalSpeedMultiplier) setGlobalSpeedMultiplier(value);
            break;
          case 'globalBlendMode': {
            // Map numeric value (expected 0-1) to discrete blend mode using same
            // behaviour as Audio/BPM handlers
            if (Array.isArray(blendModes) && blendModes.length && typeof setGlobalBlendMode === 'function') {
              const v = Math.max(0, Math.min(1, Number(value) || 0));
              const index = Math.floor(v * blendModes.length);
              const clampedIndex = Math.max(0, Math.min(blendModes.length - 1, index));
              const mode = blendModes[clampedIndex];
              setGlobalBlendMode(mode);
            }
            break;
          }
          case 'globalPaletteIndex': {
            // Global palette: affect ALL layers. Behaviour mirrors GlobalControls
            // and audio/BPM handlers: map control value to a palette index and
            // then distribute colours across layers.
            if (!Array.isArray(palettes) || !palettes.length || typeof setLayers !== 'function') {
              break;
            }

            const v = Math.max(0, Math.min(1, Number(value) || 0));
            const index = Math.floor(v * palettes.length);
            const clampedIndex = Math.max(0, Math.min(palettes.length - 1, index));
            const pick = palettes[clampedIndex];
            const src = Array.isArray(pick) ? pick : (pick && Array.isArray(pick.colors) ? pick.colors : []);
            if (!src.length) break;

            const layerCount = Array.isArray(layersRef.current) ? layersRef.current.length : 0;
            if (!layerCount) break;

            // Evenly sample colours for the number of layers
            const paletteColors = sampleColorsEven
              ? (sampleColorsEven(src, Math.max(1, layerCount)) || src.slice(0, layerCount))
              : src.slice(0, layerCount);

            setLayers(prev => {
              if (!Array.isArray(prev) || !prev.length) return prev;
              const n = Math.max(1, paletteColors.length);
              return prev.map((layer, i) => {
                const c = paletteColors[i % n];
                if (!c) return layer;
                return {
                  ...layer,
                  colors: [c],
                  numColors: 1,
                  selectedColor: 0,
                };
              });
            });
            break;
          }
          case 'layersCount': {
            if (typeof setLayers === 'function') {
              const target = Math.max(1, Math.min(20, Math.round(value)));
              // Check if we already have the target count to avoid infinite loops
              const currentCount = layersRef.current?.length || 0;
              if (currentCount === target) break;
              
              setLayers(prev => {
                if (!Array.isArray(prev)) return prev;
                if (prev.length === target) return prev;
                
                if (prev.length > target) {
                  // Shrinking: move removed layers to pool (preserves their IDs for later)
                  const removed = prev.slice(target);
                  const pool = layerPoolRef.current;
                  removed.forEach(layer => {
                    // Only add to pool if not already there
                    if (!pool.find(p => p.id === layer.id)) {
                      pool.push(layer);
                    }
                  });
                  return prev.slice(0, target);
                }
                
                // Growing: try to restore from pool first (preserves IDs)
                const next = [...prev];
                const pool = layerPoolRef.current;
                
                while (next.length < target) {
                  const layerIndex = next.length;
                  
                  // Try to find a pooled layer that was previously at this index or has matching name
                  const pooledIndex = pool.findIndex(p => 
                    p.name === `Layer ${layerIndex + 1}` || 
                    pool.indexOf(p) === 0 // fallback: use first available
                  );
                  
                  if (pooledIndex >= 0) {
                    // Restore from pool - preserves the original ID!
                    const restored = pool.splice(pooledIndex, 1)[0];
                    next.push(restored);
                  } else {
                    // No pooled layer available, create new one
                    const template = prev[prev.length - 1] || DEFAULT_LAYER;
                    const baseVar = {
                      shape: template.variationShape ?? 0.2,
                      anim: template.variationAnim ?? 0.2,
                      color: template.variationColor ?? 0.2,
                      position: template.variationPosition ?? 0.2,
                      scale: template.variationScale ?? 0.2,
                    };
                    const varied = buildVariedLayerFrom(template, layerIndex + 1, baseVar);
                    const newLayer = varied ? {
                      ...varied,
                      id: `layer-timeline-${Date.now()}-${layerIndex + 1}-${Math.random().toString(36).slice(2, 8)}`,
                      name: `Layer ${layerIndex + 1}`,
                    } : {
                      ...template,
                      id: `layer-timeline-${Date.now()}-${layerIndex + 1}-${Math.random().toString(36).slice(2, 8)}`,
                      name: `Layer ${layerIndex + 1}`,
                    };
                    next.push(newLayer);
                  }
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

                  // Ensure pa is fully initialized before any usage to avoid
                  // temporal dead zone issues in transpiled bundles
                  let pa = la?.position || { x: 0.5, y: 0.5, scale: 1 };
                  if (laSrc && laSrc.position) {
                    pa = laSrc.position;
                  }

                  let pb = pa;
                  if (lbSrc && lbSrc.position) {
                    pb = lbSrc.position;
                  }

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
              // Check if the value has actually changed to avoid infinite loops
              const currentValue = layersRef.current?.[0]?.[prop];
              if (currentValue !== undefined && Math.abs(currentValue - value) < 0.001) break;
              
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
                
                // Check again inside setLayers to be safe
                const currentVal = prev[0]?.[prop];
                if (currentVal !== undefined && Math.abs(currentVal - value) < 0.001) return prev;
                
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

    if (shapeUpdates.length > 0) {
      const updateMap = new Map();
      for (const update of shapeUpdates) {
        // Store by resolved ID (UUID)
        updateMap.set(update.layerId, update);
        // Also store by original layer name from targetId
        if (update.layerName && update.layerName !== update.layerId) {
          updateMap.set(update.layerName, update);
        }
        // Also find and store by the layer's actual name property
        if (Array.isArray(layers)) {
          const matchingLayer = layers.find(l => 
            l?.id === update.layerId || l?.name === update.layerName
          );
          if (matchingLayer?.name && matchingLayer.name !== update.layerId && matchingLayer.name !== update.layerName) {
            updateMap.set(matchingLayer.name, update);
          }
        }
      }
      shapeTrackUpdatesRef.current = updateMap;
      
      // When paused, apply shape updates directly to layers (scrubbing preview)
      // During playback, the animation loop handles this
      if (!isPlaying && typeof setLayers === 'function') {
        setLayers(prev => {
          if (!Array.isArray(prev)) return prev;
          
          let changed = false;
          const updated = prev.map(layer => {
            const shapeUpdate = updateMap.get(layer?.name) || updateMap.get(layer?.id);
            if (!shapeUpdate) return layer;
            
            changed = true;
            const updatedLayer = { ...layer };

            // Determine if we should block geometry updates for this layer
            // Block only if:
            // 1. Node edit mode is active
            // 2. This is the layer being edited (by id or name)
            // 3. Timeline position hasn't changed significantly from when edit started
            const nodeEditActive = !!isNodeEditMode;
            const isEditedLayer = nodeEditContext && (
              layer?.id === nodeEditContext.layerId ||
              layer?.name === nodeEditContext.layerName
            );
            const TIME_EPSILON = 0.05; // 50ms tolerance
            const positionChanged = nodeEditContext?.timelinePosition != null &&
              Math.abs(positionSeconds - nodeEditContext.timelinePosition) > TIME_EPSILON;
            
            // Block geometry updates only for the edited layer when position hasn't changed
            // If user scrubs timeline, we apply the new geometry (timeline is authoritative)
            const shouldBlockGeometry = nodeEditActive && isEditedLayer && !positionChanged;
            
            if (!shouldBlockGeometry) {
              if (shapeUpdate.subpaths) {
                updatedLayer.subpaths = shapeUpdate.subpaths;
                updatedLayer.nodes = undefined;
              } else if (shapeUpdate.nodes) {
                updatedLayer.nodes = shapeUpdate.nodes;
                updatedLayer.subpaths = undefined;
              }
            }
            
            // Apply position
            if (shapeUpdate.position) {
              updatedLayer.position = {
                ...updatedLayer.position,
                x: shapeUpdate.position.x ?? updatedLayer.position?.x ?? 0.5,
                y: shapeUpdate.position.y ?? updatedLayer.position?.y ?? 0.5,
                scale: shapeUpdate.position.scale ?? updatedLayer.position?.scale ?? 1,
              };
              if (shapeUpdate.position.xOffset !== undefined) {
                updatedLayer.xOffset = shapeUpdate.position.xOffset;
              }
              if (shapeUpdate.position.yOffset !== undefined) {
                updatedLayer.yOffset = shapeUpdate.position.yOffset;
              }
            }
            
            // Apply shape params (Layer Shape Tab)
            if (shapeUpdate.shapeParams) {
              const sp = shapeUpdate.shapeParams;
              if (sp.numSides !== undefined) updatedLayer.numSides = sp.numSides;
              if (sp.curviness !== undefined) updatedLayer.curviness = sp.curviness;
              if (sp.radiusFactor !== undefined) updatedLayer.radiusFactor = sp.radiusFactor;
              if (sp.radiusFactorX !== undefined) updatedLayer.radiusFactorX = sp.radiusFactorX;
              if (sp.radiusFactorY !== undefined) updatedLayer.radiusFactorY = sp.radiusFactorY;
              if (sp.rotation !== undefined) updatedLayer.rotation = sp.rotation;
            }
            
            // Apply animation params
            if (shapeUpdate.animation) {
              const anim = shapeUpdate.animation;
              if (anim.movementStyle !== undefined) updatedLayer.movementStyle = anim.movementStyle;
              if (anim.movementSpeed !== undefined) updatedLayer.movementSpeed = anim.movementSpeed;
              if (anim.movementAngle !== undefined) updatedLayer.movementAngle = anim.movementAngle;
              if (anim.scaleSpeed !== undefined) updatedLayer.scaleSpeed = anim.scaleSpeed;
              if (anim.scaleMin !== undefined) updatedLayer.scaleMin = anim.scaleMin;
              if (anim.scaleMax !== undefined) updatedLayer.scaleMax = anim.scaleMax;
            }
            
            // Apply colors
            if (shapeUpdate.colors && Array.isArray(shapeUpdate.colors) && shapeUpdate.colors.length > 0) {
              updatedLayer.colors = shapeUpdate.colors;
              updatedLayer.numColors = shapeUpdate.colors.length;
            }
            
            return updatedLayer;
          });
          
          if (changed) return updated;
          return prev;
        });
      }
    } else {
      // Clear if no shape updates
      shapeTrackUpdatesRef.current = new Map();
    }
  }, [
    timeline?.isPlaying,
    timeline?.positionSeconds,
    timeline?.tracks,
    parseTargetId,
    setGlobalSpeedMultiplier,
    setLayers,
    isNodeEditMode,
    nodeEditContext,
    timelineMode,
  ]);

  // RAF-based modulation update during playback
  // This ensures modulations are applied every frame, not just when React re-renders
  // Now also evaluates shape tracks and stores in shapeTrackUpdatesRef for smooth 60fps interpolation
  useEffect(() => {
    if (!timeline?.isPlaying || !timeline?.visible) return;
    if (!timelineMode) return;
    
    const getPos = getPositionSecondsRef.current;
    if (!getPos) return;
    
    let rafId;
    const updateModulations = () => {
      const pos = getPos();
      const store = modulationStoreRef.current;
      const tracks = timeline?.tracks;
      
      if (store && Array.isArray(tracks)) {
        // Clear and re-apply timeline modulations
        store.clearAllMods('timeline');
        
        // Collect shape track updates
        const shapeUpdates = new Map();
        
        for (const track of tracks) {
          if (!track.enabled || !track.targetId) continue;
          
          // Handle global shape tracks - affects ALL layers at once
          if (track.type === 'globalShape') {
            const globalResult = evaluateGlobalShapeTrackAtTime(track, pos, lerpNodes, lerpSubpaths);
            if (globalResult && Array.isArray(globalResult.layers)) {
              const currentLayers = layersRef.current;
              // Debug: log once when we have global shape data
              if (Math.random() < 0.01) {
                console.log('[GlobalShape] result layers:', globalResult.layers.length, 'currentLayers:', currentLayers?.length);
              }
              if (Array.isArray(currentLayers)) {
                // Store update for each layer by index, using layer id/name as key
                globalResult.layers.forEach((interpolatedData, index) => {
                  const layer = currentLayers[index];
                  if (!layer || !interpolatedData) return;
                  
                  const updateData = {
                    layerId: layer.id,
                    nodes: interpolatedData.nodes,
                    subpaths: interpolatedData.subpaths,
                    position: interpolatedData.position,
                    shapeParams: interpolatedData.shapeParams,
                    animation: interpolatedData.animation,
                    colors: interpolatedData.colors,
                    isGlobalShapeTrack: true, // Flag to identify source
                  };
                  
                  // Store by layer id and name
                  if (layer.id) shapeUpdates.set(layer.id, updateData);
                  if (layer.name) shapeUpdates.set(layer.name, updateData);
                });
              }
            }
            continue;
          }
          
          // Handle shape tracks - evaluate and store in ref for animation loop
          if (track.type === 'shape') {
            const shapeResult = evaluateShapeTrackAtTime(track, pos, lerpNodes, lerpSubpaths);
            if (shapeResult) {
              const parsed = parseTargetId(track.targetId);
              if (parsed?.type === 'layer' && parsed.paramId === 'shape') {
                const updateData = {
                  layerId: parsed.layerId,
                  nodes: shapeResult.nodes,
                  subpaths: shapeResult.subpaths,
                  position: shapeResult.position,
                  shapeParams: shapeResult.shapeParams,
                  animation: shapeResult.animation,
                  colors: shapeResult.colors,
                };
                // Store by resolved ID (UUID)
                shapeUpdates.set(parsed.layerId, updateData);
                
                // Also store by original layer name from targetId
                const parts = track.targetId.split(':');
                const originalName = parts.length >= 2 ? parts[1] : null;
                if (originalName && originalName !== parsed.layerId) {
                  shapeUpdates.set(originalName, updateData);
                }
                
                // Also find and store by the layer's actual name property
                // This handles cases where layer.name differs from targetId name
                const currentLayers = layersRef.current;
                if (Array.isArray(currentLayers)) {
                  const matchingLayer = currentLayers.find(l => 
                    l?.id === parsed.layerId || l?.name === originalName
                  );
                  if (matchingLayer?.name && matchingLayer.name !== parsed.layerId && matchingLayer.name !== originalName) {
                    shapeUpdates.set(matchingLayer.name, updateData);
                  }
                }
              }
            }
            continue;
          }
          
          // Handle color tracks
          if (track.type === 'color') {
            const colorResult = evaluateColorTrackAtTime(track, pos);
            if (colorResult) {
              const parsed = parseTargetId(track.targetId);
              if (parsed?.type === 'layer' && parsed.paramId === 'color') {
                store.setMod('timeline', parsed.layerId, 'colors', [colorResult]);
              }
            }
            continue;
          }
          
          const value = evaluateTrackAtTime(track, pos);
          if (value === null) continue;
          
          const parsed = parseTargetId(track.targetId);
          if (!parsed) continue;
          
          if (parsed.type === 'layer') {
            store.setMod('timeline', parsed.layerId, parsed.paramId, value);
          }
          // Global params are handled by the main effect since they need setters
        }
        
        // Update shape track ref (consumed by animation loop)
        if (shapeTrackUpdatesRef) {
          shapeTrackUpdatesRef.current = shapeUpdates;
          // Debug: log once per second if we have global shape updates
          if (shapeUpdates.size > 0 && Math.random() < 0.016) {
            const keys = [...shapeUpdates.keys()];
            const firstVal = shapeUpdates.get(keys[0]);
            console.log('[Timeline->Animation] keys:', keys.slice(0, 4), 'pos:', firstVal?.position?.x?.toFixed(2), firstVal?.position?.y?.toFixed(2));
          }
        }
      }
      
      rafId = requestAnimationFrame(updateModulations);
    };
    
    rafId = requestAnimationFrame(updateModulations);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [timeline?.isPlaying, timeline?.visible, timeline?.tracks, parseTargetId, shapeTrackUpdatesRef, timelineMode]);

  // Clean up timeline modulations when timeline is hidden or stopped
  useEffect(() => {
    if (!timelineMode || !timeline?.visible || !timeline?.isPlaying) {
      const store = modulationStoreRef.current;
      if (store) {
        store.clearAllMods('timeline');
      }
      // Clear shape track updates
      if (shapeTrackUpdatesRef) {
        shapeTrackUpdatesRef.current = new Map();
      }
      // Clear layer pool when timeline stops (fresh start next time)
      layerPoolRef.current = [];
      maxLayerCountRef.current = 0;
    }
  }, [timeline?.visible, timeline?.isPlaying, shapeTrackUpdatesRef, timelineMode]);

  return {
    parseTargetId,
  };
}

export default useTimelineModulation;
