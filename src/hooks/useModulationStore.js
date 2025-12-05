import { useRef, useCallback, useMemo } from 'react';

/**
 * useModulationStore - Centralized store for Audio/BPM modulations
 * 
 * Instead of Audio/BPM handlers calling setLayers directly (causing multiple
 * React updates per frame), they write to this store. The animation loop
 * then reads from here and applies all modulations in a single setLayers call.
 * 
 * Structure:
 * {
 *   bpm: { [layerId]: { [paramId]: value, ... }, ... },
 *   audio: { [layerId]: { [paramId]: value, ... }, ... },
 * }
 */
export function useModulationStore() {
  // Refs to avoid re-renders when modulations change
  const bpmModsRef = useRef({});
  const audioModsRef = useRef({});
  
  // Track which params are actively modulated (for UI indicators)
  const activeBpmParamsRef = useRef(new Set());
  const activeAudioParamsRef = useRef(new Set());

  /**
   * Set a modulation value for a layer parameter
   * @param {'bpm'|'audio'} source - The modulation source
   * @param {string} layerId - The layer ID
   * @param {string} paramId - The parameter name (e.g., 'radiusFactor', 'scale')
   * @param {number} value - The modulated value
   */
  const setMod = useCallback((source, layerId, paramId, value) => {
    const ref = source === 'bpm' ? bpmModsRef : audioModsRef;
    const activeRef = source === 'bpm' ? activeBpmParamsRef : activeAudioParamsRef;
    
    if (!ref.current[layerId]) {
      ref.current[layerId] = {};
    }
    ref.current[layerId][paramId] = value;
    activeRef.current.add(`${layerId}:${paramId}`);
  }, []);

  /**
   * Clear a modulation for a layer parameter
   */
  const clearMod = useCallback((source, layerId, paramId) => {
    const ref = source === 'bpm' ? bpmModsRef : audioModsRef;
    const activeRef = source === 'bpm' ? activeBpmParamsRef : activeAudioParamsRef;
    
    if (ref.current[layerId]) {
      delete ref.current[layerId][paramId];
      if (Object.keys(ref.current[layerId]).length === 0) {
        delete ref.current[layerId];
      }
    }
    activeRef.current.delete(`${layerId}:${paramId}`);
  }, []);

  /**
   * Clear all modulations for a source
   */
  const clearAllMods = useCallback((source) => {
    if (source === 'bpm') {
      bpmModsRef.current = {};
      activeBpmParamsRef.current.clear();
    } else {
      audioModsRef.current = {};
      activeAudioParamsRef.current.clear();
    }
  }, []);

  /**
   * Clear modulations for all layers except the specified ones
   * Used when switching from global to individual mode
   */
  const clearModsExcept = useCallback((source, keepLayerIds) => {
    const ref = source === 'bpm' ? bpmModsRef : audioModsRef;
    const activeRef = source === 'bpm' ? activeBpmParamsRef : activeAudioParamsRef;
    const keepSet = new Set(keepLayerIds);
    
    // Remove layers not in keepSet
    Object.keys(ref.current).forEach(layerId => {
      if (!keepSet.has(layerId)) {
        // Remove from active params
        Object.keys(ref.current[layerId] || {}).forEach(paramId => {
          activeRef.current.delete(`${layerId}:${paramId}`);
        });
        delete ref.current[layerId];
      }
    });
  }, []);

  /**
   * Get all modulations for a layer (merged from all sources)
   * BPM takes precedence over Audio if both modulate the same param
   */
  const getLayerMods = useCallback((layerId) => {
    const audioMods = audioModsRef.current[layerId] || {};
    const bpmMods = bpmModsRef.current[layerId] || {};
    // BPM overrides Audio for same param
    return { ...audioMods, ...bpmMods };
  }, []);

  /**
   * Get all modulations (for animation loop to process all layers)
   */
  const getAllMods = useCallback(() => {
    return {
      bpm: bpmModsRef.current,
      audio: audioModsRef.current,
    };
  }, []);

  /**
   * Check if a param is actively being modulated
   */
  const isParamModulated = useCallback((layerId, paramId) => {
    const key = `${layerId}:${paramId}`;
    return activeBpmParamsRef.current.has(key) || activeAudioParamsRef.current.has(key);
  }, []);

  /**
   * Apply modulations to a layer object
   * Returns a new layer with modulated values applied
   */
  const applyModsToLayer = useCallback((layer) => {
    if (!layer || !layer.id) return layer;
    
    const mods = getLayerMods(layer.id);
    if (Object.keys(mods).length === 0) return layer;
    
    let modifiedLayer = { ...layer };
    
    for (const [paramId, value] of Object.entries(mods)) {
      if (paramId === 'scale') {
        // Scale is nested in position
        modifiedLayer = {
          ...modifiedLayer,
          position: { ...(modifiedLayer.position || {}), scale: value },
        };
      } else if (paramId === 'colors' && Array.isArray(value)) {
        // Colors array
        modifiedLayer = {
          ...modifiedLayer,
          colors: [...value],
        };
      } else {
        // Direct property
        modifiedLayer = {
          ...modifiedLayer,
          [paramId]: value,
        };
      }
    }
    
    return modifiedLayer;
  }, [getLayerMods]);

  return useMemo(() => ({
    setMod,
    clearMod,
    clearAllMods,
    clearModsExcept,
    getLayerMods,
    getAllMods,
    isParamModulated,
    applyModsToLayer,
    // Direct ref access for animation loop (avoids function call overhead)
    bpmModsRef,
    audioModsRef,
  }), [setMod, clearMod, clearAllMods, clearModsExcept, getLayerMods, getAllMods, isParamModulated, applyModsToLayer]);
}

/**
 * Apply modulations from refs to a layer (standalone function for animation loop)
 * This avoids the overhead of going through the hook's callback
 */
export function applyModulationsToLayer(layer, bpmMods, audioMods) {
  if (!layer || !layer.id) return layer;
  
  const layerBpmMods = bpmMods[layer.id] || {};
  const layerAudioMods = audioMods[layer.id] || {};
  
  // Merge: BPM takes precedence
  const mods = { ...layerAudioMods, ...layerBpmMods };
  
  if (Object.keys(mods).length === 0) return layer;
  
  let modifiedLayer = { ...layer };
  
  for (const [paramId, value] of Object.entries(mods)) {
    if (paramId === 'scale') {
      modifiedLayer = {
        ...modifiedLayer,
        position: { ...(modifiedLayer.position || {}), scale: value },
      };
    } else if (paramId === 'colors' && Array.isArray(value)) {
      modifiedLayer = {
        ...modifiedLayer,
        colors: [...value],
      };
    } else {
      modifiedLayer = {
        ...modifiedLayer,
        [paramId]: value,
      };
    }
  }
  
  return modifiedLayer;
}
