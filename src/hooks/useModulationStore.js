import { useRef, useCallback, useMemo } from 'react';
import { MOVEMENT_STYLES } from './movementStyles.js';
import { hexToRgb, rgbToHex } from '../utils/colorUtils.js';
import { resizeNodes } from '../utils/nodeUtils.js';

// Rate-limit movement style switching to avoid rapid audio-driven visual popping.
const movementStyleSwitchState = new Map(); // layerId -> { style, changedAtMs }

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
   * Remove modulations for layers that no longer exist (all sources)
   */
  const pruneLayerMods = useCallback((keepLayerIds) => {
    const keepSet = new Set(keepLayerIds);
    keepSet.add('__global__');

    const pruneSource = (ref, activeRef) => {
      Object.keys(ref.current).forEach(layerId => {
        if (!keepSet.has(layerId)) {
          Object.keys(ref.current[layerId] || {}).forEach(paramId => {
            activeRef.current.delete(`${layerId}:${paramId}`);
          });
          delete ref.current[layerId];
        }
      });
    };

    pruneSource(timelineModsRef, activeTimelineParamsRef);
    pruneSource(bpmModsRef, activeBpmParamsRef);
    pruneSource(audioModsRef, activeAudioParamsRef);
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
      } else if (paramId === 'numSides') {
        const v = Number(value);
        const nextSides = Number.isFinite(v) ? Math.max(3, Math.round(v)) : modifiedLayer.numSides;
        modifiedLayer = {
          ...modifiedLayer,
          numSides: nextSides,
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
    pruneLayerMods,
    getLayerMods,
    getAllMods,
    isParamModulated,
    isParamModulatedByTimeline,
    applyModsToLayer,
    // Direct ref access for animation loop (avoids function call overhead)
    bpmModsRef,
    audioModsRef,
    timelineModsRef,
  }), [setMod, clearMod, clearAllMods, clearModsExcept, pruneLayerMods, getLayerMods, getAllMods, isParamModulated, isParamModulatedByTimeline, applyModsToLayer]);
}

// Helper to convert hex color to RGB components
function hexToRgbComponents(hex) {
  const rgb = hexToRgb(hex || '#000000');
  return {
    r: rgb.r / 255,
    g: rgb.g / 255,
    b: rgb.b / 255,
  };
}

// Helper to convert RGB components (0-1) to hex
function rgbComponentsToHex(r, g, b) {
  return rgbToHex({
    r: Math.max(0, Math.min(1, r)) * 255,
    g: Math.max(0, Math.min(1, g)) * 255,
    b: Math.max(0, Math.min(1, b)) * 255,
  });
}

/**
 * Apply modulations from refs to a layer (standalone function for animation loop)
 * This avoids the overhead of going through the hook's callback
 * Precedence: timeline > bpm > audio
 */
export function applyModulationsToLayer(layer, bpmMods, audioMods, timelineMods = {}, baseLayer = null) {
  if (!layer || !layer.id) return layer;
  
  const layerBpmMods = bpmMods[layer.id] || {};
  const layerAudioMods = audioMods[layer.id] || {};
  const layerTimelineMods = timelineMods[layer.id] || {};
  
  // Merge: Timeline > BPM > Audio precedence
  // Timeline mods are additive (deltas from range midpoint, added to base layer value)
  // BPM/Audio mods are absolute (override layer value)
  const mods = { ...layerAudioMods, ...layerBpmMods, ...layerTimelineMods };
  
  if (Object.keys(mods).length === 0) return layer;
  
  let modifiedLayer = { ...layer };
  // Timeline deltas should be applied against the stable scene/base layer,
  // not against the already-modulated animated layer from the previous frame.
  const additiveBaseLayer = (baseLayer && typeof baseLayer === 'object') ? baseLayer : layer;
  
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
    
    // Timeline mods are additive (delta added to base layer value)
    // BPM/Audio mods are absolute (replace layer value)
    const isTimelineMod = paramId in layerTimelineMods;
    
    if (paramId === 'scale') {
      if (isTimelineMod) {
        const baseScale = additiveBaseLayer.position?.scale ?? layer.position?.scale ?? 1;
        modifiedLayer = {
          ...modifiedLayer,
          position: { ...(modifiedLayer.position || {}), scale: baseScale + value },
        };
      } else {
        modifiedLayer = {
          ...modifiedLayer,
          position: { ...(modifiedLayer.position || {}), scale: value },
        };
      }
    } else if (paramId === 'numSides') {
      const minimum = modifiedLayer?.pathMode === 'open' && modifiedLayer?.pathClosed !== true ? 2 : 3;
      let nextSides;
      if (isTimelineMod) {
        const baseSides = additiveBaseLayer.numSides ?? layer.numSides ?? 6;
        nextSides = Math.max(minimum, Math.min(256, Math.round(baseSides + value)));
      } else {
        const v = Number(value);
        // Keep polygon sides discrete + sane; fractional sides can cause visual "no change"
        // and excessive churn from tiny per-frame updates.
        nextSides = Number.isFinite(v)
          ? Math.max(minimum, Math.min(256, Math.round(v)))
          : modifiedLayer.numSides;
      }
      const sourceNodes = Array.isArray(additiveBaseLayer.nodes) ? additiveBaseLayer.nodes : modifiedLayer.nodes;
      const closed = modifiedLayer?.pathMode !== 'open' || modifiedLayer?.pathClosed === true;
      modifiedLayer = {
        ...modifiedLayer,
        numSides: nextSides,
        ...(Array.isArray(sourceNodes) && sourceNodes.length >= minimum
          ? { nodes: resizeNodes(sourceNodes, nextSides, { closed }) }
          : {}),
      };
    } else if (paramId === 'radiusFactor') {
      const baseRadius = Number(additiveBaseLayer.radiusFactor ?? layer.radiusFactor);
      const nextRadius = isTimelineMod
        ? baseRadius + Number(value)
        : Number(value);
      if (!Number.isFinite(nextRadius)) continue;

      const ratio = Number.isFinite(baseRadius) && Math.abs(baseRadius) > 1e-9
        ? nextRadius / baseRadius
        : 1;
      const patch = { radiusFactor: nextRadius };

      // Rendering prefers the explicit axes, so Size must keep them in sync.
      // Explicit Size X/Y mappings still take precedence over this coupled update.
      if (!('radiusFactorX' in mods)) {
        const baseX = Number(additiveBaseLayer.radiusFactorX ?? layer.radiusFactorX ?? baseRadius);
        patch.radiusFactorX = Number.isFinite(baseX) ? baseX * ratio : nextRadius;
      }
      if (!('radiusFactorY' in mods)) {
        const baseY = Number(additiveBaseLayer.radiusFactorY ?? layer.radiusFactorY ?? baseRadius);
        patch.radiusFactorY = Number.isFinite(baseY) ? baseY * ratio : nextRadius;
      }

      modifiedLayer = { ...modifiedLayer, ...patch };
    } else if (paramId === 'movementStyle') {
      // Map numeric value to discrete movement style string (always absolute)
      const styles = Array.isArray(MOVEMENT_STYLES) && MOVEMENT_STYLES.length
        ? MOVEMENT_STYLES
        : ['bounce', 'drift', 'still', 'orbit', 'spin'];
      const num = Number(value);
      // Allow both 0-1 and 0..N ranges
      let index;
      if (Number.isFinite(num)) {
        if (num <= 1 && num >= 0) {
          index = Math.floor(num * styles.length);
        } else {
          index = Math.round(num);
        }
      } else {
        index = 0;
      }
      const clampedIndex = Math.max(0, Math.min(styles.length - 1, index));
      const nextStyle = styles[clampedIndex];
      const nowMs = (typeof performance !== 'undefined' && typeof performance.now === 'function')
        ? performance.now()
        : Date.now();
      const minSwitchMs = 280;
      const state = movementStyleSwitchState.get(layer.id) || {
        style: layer.movementStyle || styles[0],
        changedAtMs: 0,
      };

      if (state.style !== nextStyle && (nowMs - state.changedAtMs) < minSwitchMs) {
        // Keep current style until cooldown passes.
        modifiedLayer = {
          ...modifiedLayer,
          movementStyle: state.style,
        };
        continue;
      }

      const styleToApply = (state.style === nextStyle) ? state.style : nextStyle;
      if (state.style !== styleToApply) {
        movementStyleSwitchState.set(layer.id, { style: styleToApply, changedAtMs: nowMs });
      } else if (!movementStyleSwitchState.has(layer.id)) {
        movementStyleSwitchState.set(layer.id, { style: styleToApply, changedAtMs: nowMs });
      }
      modifiedLayer = {
        ...modifiedLayer,
        movementStyle: styleToApply,
      };
    } else if (paramId === 'colors' && Array.isArray(value)) {
      // Colors are always absolute
      modifiedLayer = {
        ...modifiedLayer,
        colors: [...value],
      };
    } else {
      if (isTimelineMod) {
        // Additive: add delta to layer's base value
        const baseValue = additiveBaseLayer[paramId] ?? layer[paramId] ?? 0;
        modifiedLayer = {
          ...modifiedLayer,
          [paramId]: baseValue + value,
        };
      } else {
        modifiedLayer = {
          ...modifiedLayer,
          [paramId]: value,
        };
      }
    }
  }
  
  return modifiedLayer;
}
