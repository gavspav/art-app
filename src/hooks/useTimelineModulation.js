import { useEffect, useRef, useCallback } from 'react';
import { useTimeline } from '../context/TimelineContext.jsx';
import { evaluateTrackAtTime } from '../utils/envelopes.js';

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
}) {
  const timeline = useTimeline();
  
  // Refs to avoid re-renders
  const modulationStoreRef = useRef(modulationStore);
  const layersRef = useRef(layers);
  const bpmContextRef = useRef(bpmContext);
  const audioContextRef = useRef(audioContext);
  const midiContextRef = useRef(midiContext);
  
  // Keep refs in sync
  useEffect(() => { modulationStoreRef.current = modulationStore; }, [modulationStore]);
  useEffect(() => { layersRef.current = layers; }, [layers]);
  useEffect(() => { bpmContextRef.current = bpmContext; }, [bpmContext]);
  useEffect(() => { audioContextRef.current = audioContext; }, [audioContext]);
  useEffect(() => { midiContextRef.current = midiContext; }, [midiContext]);

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
