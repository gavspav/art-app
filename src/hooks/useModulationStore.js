import { useRef, useCallback, useMemo } from 'react';

/**
 * useModulationStore - Centralized store for Audio/BPM/Timeline modulations
 * 
 * Instead of Audio/BPM/Timeline handlers calling setLayers directly (causing multiple
 * React updates per frame), they write to this store. The animation loop
 * then reads from here and applies all modulations in a single setLayers call.
 * 
 * Structure:
 * {
 *   bpm: { [layerId]: { [paramId]: value, ... }, ... },
 *   audio: { [layerId]: { [paramId]: value, ... }, ... },
 *   timeline: { [layerId]: { [paramId]: value, ... }, ... },
 * }
 * 
 * Precedence (highest to lowest): timeline > bpm > audio
 */
export function useModulationStore() {
  // Refs to avoid re-renders when modulations change
  const bpmModsRef = useRef({});
  const audioModsRef = useRef({});
  const timelineModsRef = useRef({});
  
  // Track which params are actively modulated (for UI indicators)
  const activeBpmParamsRef = useRef(new Set());
  const activeAudioParamsRef = useRef(new Set());
  const activeTimelineParamsRef = useRef(new Set());

  /**
   * Set a modulation value for a layer parameter
   * @param {'bpm'|'audio'|'timeline'} source - The modulation source
   * @param {string} layerId - The layer ID
   * @param {string} paramId - The parameter name (e.g., 'radiusFactor', 'scale')
   * @param {number} value - The modulated value
   */
  const setMod = useCallback((source, layerId, paramId, value) => {
    let ref, activeRef;
    if (source === 'timeline') {
      ref = timelineModsRef;
      activeRef = activeTimelineParamsRef;
    } else if (source === 'bpm') {
      ref = bpmModsRef;
      activeRef = activeBpmParamsRef;
    } else {
      ref = audioModsRef;
      activeRef = activeAudioParamsRef;
    }
    
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
    let ref, activeRef;
    if (source === 'timeline') {
      ref = timelineModsRef;
      activeRef = activeTimelineParamsRef;
    } else if (source === 'bpm') {
      ref = bpmModsRef;
      activeRef = activeBpmParamsRef;
    } else {
      ref = audioModsRef;
      activeRef = activeAudioParamsRef;
    }
    
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
    if (source === 'timeline') {
      timelineModsRef.current = {};
      activeTimelineParamsRef.current.clear();
    } else if (source === 'bpm') {
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
    let ref, activeRef;
    if (source === 'timeline') {
      ref = timelineModsRef;
      activeRef = activeTimelineParamsRef;
    } else if (source === 'bpm') {
      ref = bpmModsRef;
      activeRef = activeBpmParamsRef;
    } else {
      ref = audioModsRef;
      activeRef = activeAudioParamsRef;
    }
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
   * Precedence: timeline > bpm > audio
   */
  const getLayerMods = useCallback((layerId) => {
    const audioMods = audioModsRef.current[layerId] || {};
    const bpmMods = bpmModsRef.current[layerId] || {};
    const timelineMods = timelineModsRef.current[layerId] || {};
    // Timeline overrides BPM overrides Audio for same param
    return { ...audioMods, ...bpmMods, ...timelineMods };
  }, []);

  /**
   * Get all modulations (for animation loop to process all layers)
   */
  const getAllMods = useCallback(() => {
    return {
      bpm: bpmModsRef.current,
      audio: audioModsRef.current,
      timeline: timelineModsRef.current,
    };
  }, []);

  /**
   * Check if a param is actively being modulated
   */
  const isParamModulated = useCallback((layerId, paramId) => {
    const key = `${layerId}:${paramId}`;
    return activeTimelineParamsRef.current.has(key) || activeBpmParamsRef.current.has(key) || activeAudioParamsRef.current.has(key);
  }, []);

  /**
   * Check if a param is being modulated by timeline specifically
   */
  const isParamModulatedByTimeline = useCallback((layerId, paramId) => {
    const key = `${layerId}:${paramId}`;
    return activeTimelineParamsRef.current.has(key);
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
    isParamModulatedByTimeline,
    applyModsToLayer,
    // Direct ref access for animation loop (avoids function call overhead)
    bpmModsRef,
    audioModsRef,
    timelineModsRef,
  }), [setMod, clearMod, clearAllMods, clearModsExcept, getLayerMods, getAllMods, isParamModulated, isParamModulatedByTimeline, applyModsToLayer]);
}

// Helper to convert hex color to RGB components
function hexToRgbComponents(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255,
  } : { r: 0, g: 0, b: 0 };
}

// Helper to convert RGB components (0-1) to hex
function rgbComponentsToHex(r, g, b) {
  const toHex = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Apply modulations from refs to a layer (standalone function for animation loop)
 * This avoids the overhead of going through the hook's callback
 * Precedence: timeline > bpm > audio
 */
export function applyModulationsToLayer(layer, bpmMods, audioMods, timelineMods = {}) {
  if (!layer || !layer.id) return layer;
  
  const layerBpmMods = bpmMods[layer.id] || {};
  const layerAudioMods = audioMods[layer.id] || {};
  const layerTimelineMods = timelineMods[layer.id] || {};
  
  // Merge: Timeline > BPM > Audio precedence
  const mods = { ...layerAudioMods, ...layerBpmMods, ...layerTimelineMods };
  
  if (Object.keys(mods).length === 0) return layer;
  
  let modifiedLayer = { ...layer };
  
  // Check if we have color component modulations (colorR, colorG, colorB)
  const hasColorMods = 'colorR' in mods || 'colorG' in mods || 'colorB' in mods;
  
  // If we have color component mods, apply them to the colors array
  if (hasColorMods) {
    const currentColors = Array.isArray(modifiedLayer.colors) && modifiedLayer.colors.length > 0
      ? [...modifiedLayer.colors]
      : ['#ffffff'];
    
    // Apply RGB modulations to all colors in the array
    const newColors = currentColors.map(color => {
      const rgb = hexToRgbComponents(color);
      const newR = 'colorR' in mods ? mods.colorR : rgb.r;
      const newG = 'colorG' in mods ? mods.colorG : rgb.g;
      const newB = 'colorB' in mods ? mods.colorB : rgb.b;
      return rgbComponentsToHex(newR, newG, newB);
    });
    
    modifiedLayer = { ...modifiedLayer, colors: newColors };
  }
  
  for (const [paramId, value] of Object.entries(mods)) {
    // Skip color components - already handled above
    if (paramId === 'colorR' || paramId === 'colorG' || paramId === 'colorB') {
      continue;
    }
    
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
