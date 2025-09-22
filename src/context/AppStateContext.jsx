import React, { createContext, useState, useContext, useCallback, useEffect, useRef } from 'react';
import { DEFAULTS, DEFAULT_LAYER } from '../constants/defaults';

const SEED_MIN = 1;
const SEED_MAX = 2147483646;
const generateSeed = () => Math.floor(Math.random() * (SEED_MAX - SEED_MIN + 1)) + SEED_MIN;

// Create the context
const AppStateContext = createContext();

// Create a custom hook for easy access to the context
export const useAppState = () => useContext(AppStateContext);

// Presets persistence key
const PRESET_SLOTS_KEY = 'artapp-presets-v1';

// Build default 16 preset slots
const buildDefaultPresetSlots = () => (
  Array.from({ length: 16 }, (_, i) => ({
    id: i + 1,
    name: `P${i + 1}`,
    color: '#4fc3f7',
    savedAt: null,
    payload: null,
    version: '1.0',
  }))
);

// Create the provider component
export const AppStateProvider = ({ children }) => {
  // Simple unique id generator for layers
  const uidSeedRef = useRef(Math.floor(Math.random() * 1e6));
  const uidCounterRef = useRef(0);
  const makeLayerId = useCallback(() => {
    uidCounterRef.current += 1;
    return `layer-${uidSeedRef.current}-${Date.now().toString(36)}-${uidCounterRef.current}`;
  }, []);

  const ensureLayerId = useCallback((l) => {
    if (l && typeof l === 'object' && typeof l.id === 'string' && l.id.length > 0) return l;
    return { ...l, id: makeLayerId() };
  }, [makeLayerId]);
  const assignIds = useCallback((layers = []) => {
    const list = Array.isArray(layers) ? layers : [];
    const seen = new Set();
    return list.map((layer) => {
      let out = ensureLayerId(layer);
      let id = out.id;
      if (seen.has(id)) {
        // Generate a fresh unique id when a duplicate is detected
        const newId = makeLayerId();
        try { console.debug('[AppState] Duplicate layer id detected; reassigning', { old: id, new: newId }); } catch { /* noop */ }
        out = { ...out, id: newId };
        id = newId;
      }
      seen.add(id);
      return out;
    });
  }, [ensureLayerId, makeLayerId]);
  // Main app state that should be saveable
  const [appState, setAppState] = useState({
    isFrozen: DEFAULTS.isFrozen,
    backgroundColor: DEFAULTS.backgroundColor,
    backgroundImage: { src: null, opacity: 1, fit: 'cover', enabled: false },
    globalBlendMode: DEFAULTS.globalBlendMode,
    globalSeed: generateSeed(),
    globalSpeedMultiplier: DEFAULTS.globalSpeedMultiplier,
    layers: [{
      id: `layer-init-${Date.now()}`,
      ...DEFAULT_LAYER,
      position: { ...DEFAULT_LAYER.position }
    }],
    selectedLayerIndex: DEFAULTS.selectedLayerIndex,
    isOverlayVisible: true,
    isNodeEditMode: false,
    classicMode: false,
    // Z-axis movement ignore (disable all Z scaling movement)
    zIgnore: false,
    // Global randomization toggles for palette and color count
    randomizePalette: true,
    randomizeNumColors: true,
    // Global: allow colour fading to continue while frozen
    colorFadeWhileFrozen: true,
    // Keep every layer in sync with layer 1 colours when enabled
    syncLayerColorsToFirst: false,
    // Parameter targeting mode
    parameterTargetMode: DEFAULTS.parameterTargetMode || 'individual',
    // Selection outline visibility (disabled by default)
    showLayerOutlines: false,

    // Multi-select and Layer Groups
    selectedLayerIds: [], // array of layer.id
    layerGroups: [], // { id, name, color?, memberIds: string[] }
    editTarget: { type: 'single' }, // 'single' | 'selection' | 'group'

    // Preset morphing (Phase 3)
    morphEnabled: false,
    morphRoute: [1, 2], // array of preset ids (1..8)
    morphDurationPerLeg: 5, // seconds
    morphEasing: 'linear', // 'linear' | future: 'easeInOut'
    morphLoopMode: 'loop', // 'loop' | 'pingpong'
    morphMode: 'tween', // 'tween' | 'fade'
  });

  // Preset slots state (16 slots), persisted to localStorage
  const [presetSlots, setPresetSlots] = useState(() => {
    try {
      const raw = localStorage.getItem(PRESET_SLOTS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          // Migrate: if there are 8 slots, append 9..16 empty slots
          if (parsed.length < 16) {
            const next = [...parsed];
            for (let i = parsed.length; i < 16; i++) {
              next.push({ id: i + 1, name: `P${i + 1}`, color: '#4fc3f7', savedAt: null, payload: null, version: '1.0' });
            }
            return next.slice(0, 16);
          }
          return parsed.slice(0, 16);
        }
      }
    } catch (e) {
      console.warn('[AppState] Failed to load preset slots; using defaults', e);
    }
    return buildDefaultPresetSlots();
  });

  useEffect(() => {
    try {
      localStorage.setItem(PRESET_SLOTS_KEY, JSON.stringify(presetSlots));
    } catch (e) {
      console.warn('[AppState] Failed to persist preset slots', e);
    }
  }, [presetSlots]);

  const setPresetSlot = useCallback((slotId, updater) => {
    setPresetSlots(prev => prev.map(s => (
      s.id === slotId ? (typeof updater === 'function' ? updater(s) : { ...s, ...updater }) : s
    )));
  }, []);

  const clearPresetSlot = useCallback((slotId) => {
    setPresetSlots(prev => prev.map(s => (
      s.id === slotId ? { ...s, payload: null, savedAt: null } : s
    )));
  }, []);

  const getPresetSlot = useCallback((slotId) => (
    (presetSlots || []).find(s => s.id === slotId) || null
  ), [presetSlots]);

  // Individual state setters for backward compatibility
  const setIsFrozen = useCallback((value) => {
    setAppState(prev => ({
      ...prev,
      isFrozen: (typeof value === 'function') ? value(prev.isFrozen) : value,
    }));
  }, []);

  const setBackgroundColor = useCallback((value) => {
    setAppState(prev => ({ ...prev, backgroundColor: value }));
  }, []);

  const setBackgroundImage = useCallback((value) => {
    // value can be partial update or full object
    setAppState(prev => ({
      ...prev,
      backgroundImage: typeof value === 'function'
        ? value(prev.backgroundImage)
        : { ...prev.backgroundImage, ...(value || {}) }
    }));
  }, []);

  const setGlobalBlendMode = useCallback((value) => {
    setAppState(prev => ({ ...prev, globalBlendMode: value }));
  }, []);

  const setGlobalSeed = useCallback((value) => {
    setAppState(prev => ({ ...prev, globalSeed: value }));
  }, []);

  const setGlobalSpeedMultiplier = useCallback((value) => {
    setAppState(prev => ({ ...prev, globalSpeedMultiplier: value }));
  }, []);

  // Important: support functional updates correctly to avoid stale state reappearing.
  // If an updater function is provided, call it with prev.layers inside setAppState.
  const setLayers = useCallback((value) => {
    if (typeof value === 'function') {
      setAppState(prev => ({ ...prev, layers: assignIds(value(prev.layers)) }));
    } else {
      setAppState(prev => ({ ...prev, layers: assignIds(value) }));
    }
  }, [assignIds]);

  const setSelectedLayerIndex = useCallback((value) => {
    setAppState(prev => ({ ...prev, selectedLayerIndex: value }));
  }, []);

  const setIsOverlayVisible = useCallback((value) => {
    setAppState(prev => ({
      ...prev,
      isOverlayVisible: (typeof value === 'function') ? value(prev.isOverlayVisible) : value,
    }));
  }, []);

  const setIsNodeEditMode = useCallback((value) => {
    setAppState(prev => ({ ...prev, isNodeEditMode: value }));
  }, []);

  // Toggle Classic Mode (original CodePen-like aesthetics)
  const setClassicMode = useCallback((value) => {
    setAppState(prev => ({ ...prev, classicMode: !!value }));
  }, []);

  // Toggle Z-Ignore (disable Z movement)
  const setZIgnore = useCallback((value) => {
    setAppState(prev => ({ ...prev, zIgnore: !!value }));
  }, []);

  // Global toggles for color randomization behavior
  const setRandomizePalette = useCallback((value) => {
    setAppState(prev => ({ ...prev, randomizePalette: !!value }));
  }, []);

  const setRandomizeNumColors = useCallback((value) => {
    setAppState(prev => ({ ...prev, randomizeNumColors: !!value }));
  }, []);

  const setColorFadeWhileFrozen = useCallback((value) => {
    setAppState(prev => ({ ...prev, colorFadeWhileFrozen: !!value }));
  }, []);

  const setParameterTargetMode = useCallback((mode) => {
    const normalized = (typeof mode === 'string' && mode.toLowerCase() === 'global') ? 'global' : 'individual';
    setAppState(prev => ({ ...prev, parameterTargetMode: normalized }));
  }, []);

  const setShowLayerOutlines = useCallback((value) => {
    setAppState(prev => ({
      ...prev,
      showLayerOutlines: (typeof value === 'function')
        ? !!value(prev.showLayerOutlines)
        : !!value,
    }));
  }, []);

  const setSyncLayerColorsToFirst = useCallback((value) => {
    setAppState(prev => ({ ...prev, syncLayerColorsToFirst: !!value }));
  }, []);

  // Morph setters
  const setMorphEnabled = useCallback((value) => {
    setAppState(prev => ({ ...prev, morphEnabled: !!value }));
  }, []);
  const setMorphRoute = useCallback((value) => {
    setAppState(prev => ({ ...prev, morphRoute: Array.isArray(value) ? value.slice(0, 16) : prev.morphRoute }));
  }, []);
  const setMorphDurationPerLeg = useCallback((value) => {
    const v = parseFloat(value);
    setAppState(prev => ({ ...prev, morphDurationPerLeg: Number.isFinite(v) ? Math.max(0.2, Math.min(120, v)) : prev.morphDurationPerLeg }));
  }, []);
  const setMorphEasing = useCallback((value) => {
    const allowed = ['linear'];
    setAppState(prev => ({ ...prev, morphEasing: allowed.includes(value) ? value : prev.morphEasing }));
  }, []);
  const setMorphLoopMode = useCallback((value) => {
    const allowed = ['loop','pingpong'];
    setAppState(prev => ({ ...prev, morphLoopMode: allowed.includes(value) ? value : prev.morphLoopMode }));
  }, []);
  const setMorphMode = useCallback((value) => {
    const allowed = ['tween','fade'];
    setAppState(prev => ({ ...prev, morphMode: allowed.includes(value) ? value : prev.morphMode }));
  }, []);

  // Function to get current app state for saving
  const getCurrentAppState = useCallback(() => {
    // Omit deprecated legacy fields from layers
    const cleanedLayers = (appState.layers || []).map(l => {
      const out = { ...l };
      delete out.width;
      delete out.height;
      return out;
    });
    return { ...appState, layers: cleanedLayers };
  }, [appState]);

  // Function to load app state
  const loadAppState = useCallback((newState) => {
    if (newState) {
      const normalizeLayer = (layer) => {
        const base = { ...DEFAULT_LAYER, ...layer };
        const pos = base.position && typeof base.position === 'object' ? base.position : {};
        const position = {
          x: Number.isFinite(pos.x) ? pos.x : DEFAULT_LAYER.position.x,
          y: Number.isFinite(pos.y) ? pos.y : DEFAULT_LAYER.position.y,
          vx: Number.isFinite(pos.vx) ? pos.vx : 0,
          vy: Number.isFinite(pos.vy) ? pos.vy : 0,
          scale: Number.isFinite(pos.scale) ? pos.scale : DEFAULT_LAYER.position.scale,
          scaleDirection: (pos.scaleDirection === -1 || pos.scaleDirection === 1) ? pos.scaleDirection : 1,
        };
        // Clamp common fields
        position.x = Math.max(-0.2, Math.min(1.2, position.x));
        position.y = Math.max(-0.2, Math.min(1.2, position.y));
        position.scale = Math.max(0.05, Math.min(5, position.scale));
        const movementStyle = ['bounce','drift','still'].includes(base.movementStyle) ? base.movementStyle : DEFAULT_LAYER.movementStyle;
        const movementSpeed = Number.isFinite(base.movementSpeed) ? Math.max(0, Math.min(5, base.movementSpeed)) : DEFAULT_LAYER.movementSpeed;
        const movementAngle = Number.isFinite(base.movementAngle) ? ((Math.round(base.movementAngle) % 360) + 360) % 360 : DEFAULT_LAYER.movementAngle;
        const scaleSpeed = Number.isFinite(base.scaleSpeed) ? Math.max(0, Math.min(0.2, base.scaleSpeed)) : DEFAULT_LAYER.scaleSpeed;
        // Migrate legacy width/height to radiusFactor if missing
        let migratedRadiusFactor = base.radiusFactor;
        if (!Number.isFinite(migratedRadiusFactor)) {
          const w = Number(base.width) || 0;
          const h = Number(base.height) || 0;
          if (w > 0 || h > 0) {
            const avg = (w + h) / 2;
            const baseRF = Number.isFinite(base.baseRadiusFactor) ? base.baseRadiusFactor : 0.4;
            // Legacy effective radius ≈ avg * baseRadiusFactor; ratio to legacy cap (0.4 * minWH)
            const assumedMinWH = 640; // fallback when container size isn't available here
            const legacyRadiusPx = avg * baseRF;
            const rfEst = (legacyRadiusPx) / (assumedMinWH * 0.4);
            migratedRadiusFactor = Math.max(0.02, Math.min(0.9, rfEst || DEFAULT_LAYER.radiusFactor));
          } else {
            migratedRadiusFactor = DEFAULT_LAYER.radiusFactor;
          }
        }

        const layerOut = {
          ...base,
          radiusFactor: migratedRadiusFactor,
          movementStyle,
          movementSpeed,
          movementAngle,
          scaleSpeed,
          position,
        };
        // Ensure a stable id exists
        if (typeof layerOut.id !== 'string' || layerOut.id.length === 0) {
          layerOut.id = makeLayerId();
        }
        // Remove deprecated fields to avoid exporting them
        delete layerOut.width;
        delete layerOut.height;
        // Ensure arrays are arrays
        if (!Array.isArray(layerOut.colors)) layerOut.colors = [...(DEFAULT_LAYER.colors || ['#ffffff'])];
        // Ensure nodes valid or null
        if (layerOut.nodes && (!Array.isArray(layerOut.nodes) || layerOut.nodes.length < 3)) layerOut.nodes = null;
        return layerOut;
      };

      setAppState(prevState => ({
        ...prevState,
        ...newState,
        syncLayerColorsToFirst: typeof newState.syncLayerColorsToFirst === 'boolean'
          ? newState.syncLayerColorsToFirst
          : !!prevState.syncLayerColorsToFirst,
        backgroundImage: {
          src: null,
          opacity: 1,
          fit: 'cover',
          enabled: false,
          ...(newState.backgroundImage || {})
        },
        // Ensure layers have proper structure
        layers: Array.isArray(newState.layers) && newState.layers.length > 0
          ? newState.layers.map(normalizeLayer)
          : prevState.layers.map(normalizeLayer)
      }));
      return true;
    }
    return false;
  }, [makeLayerId]);

  // Selection helpers
  const toggleLayerSelection = useCallback((layerId) => {
    setAppState(prev => {
      const set = new Set(prev.selectedLayerIds || []);
      if (set.has(layerId)) set.delete(layerId); else set.add(layerId);
      return { ...prev, selectedLayerIds: Array.from(set) };
    });
  }, []);
  const clearSelection = useCallback(() => {
    setAppState(prev => ({ ...prev, selectedLayerIds: [] }));
  }, []);

  // Groups CRUD
  const createGroup = useCallback(({ name, color = '#7c84ff', memberIds = [] } = {}) => {
    const id = `group-${Date.now().toString(36)}-${Math.floor(Math.random()*1e4)}`;
    setAppState(prev => ({ ...prev, layerGroups: [...(prev.layerGroups || []), { id, name: name || 'Group', color, memberIds: [...new Set(memberIds)] }] }));
    return id;
  }, []);
  const renameGroup = useCallback((groupId, name) => {
    setAppState(prev => ({ ...prev, layerGroups: (prev.layerGroups || []).map(g => g.id === groupId ? { ...g, name } : g) }));
  }, []);
  const setGroupColor = useCallback((groupId, color) => {
    setAppState(prev => ({ ...prev, layerGroups: (prev.layerGroups || []).map(g => g.id === groupId ? { ...g, color } : g) }));
  }, []);
  const addMembersToGroup = useCallback((groupId, ids = []) => {
    setAppState(prev => ({
      ...prev,
      layerGroups: (prev.layerGroups || []).map(g => g.id === groupId ? { ...g, memberIds: Array.from(new Set([...(g.memberIds || []), ...ids])) } : g)
    }));
  }, []);
  const removeMembersFromGroup = useCallback((groupId, ids = []) => {
    const remove = new Set(ids);
    setAppState(prev => ({
      ...prev,
      layerGroups: (prev.layerGroups || []).map(g => g.id === groupId ? { ...g, memberIds: (g.memberIds || []).filter(id => !remove.has(id)) } : g)
    }));
  }, []);
  const deleteGroup = useCallback((groupId) => {
    setAppState(prev => ({ ...prev, layerGroups: (prev.layerGroups || []).filter(g => g.id !== groupId) }));
  }, []);

  // Edit target
  const setEditTarget = useCallback((target) => {
    // target: { type: 'single'|'selection'|'group', groupId? }
    setAppState(prev => ({ ...prev, editTarget: target && target.type ? target : { type: 'single' } }));
  }, []);
  const getActiveTargetLayerIds = useCallback(() => {
    const state = appState;
    if (state.editTarget?.type === 'selection') return state.selectedLayerIds || [];
    if (state.editTarget?.type === 'group') {
      const g = (state.layerGroups || []).find(x => x.id === state.editTarget.groupId);
      return g ? (g.memberIds || []) : [];
    }
    // single -> current selectedLayerIndex
    const idx = Math.max(0, Math.min(Number(state.selectedLayerIndex) || 0, Math.max(0, (state.layers || []).length - 1)));
    const l = (state.layers || [])[idx];
    return l && l.id ? [l.id] : [];
  }, [appState]);

  // Function to reset app state to defaults
  const resetAppState = useCallback(() => {
    setAppState({
      isFrozen: DEFAULTS.isFrozen,
      backgroundColor: DEFAULTS.backgroundColor,
      backgroundImage: { src: null, opacity: 1, fit: 'cover', enabled: false },
      globalSeed: generateSeed(),
      globalSpeedMultiplier: DEFAULTS.globalSpeedMultiplier,
      layers: [{
        ...DEFAULT_LAYER,
        position: { ...DEFAULT_LAYER.position }
      }],
      selectedLayerIndex: DEFAULTS.selectedLayerIndex,
      isOverlayVisible: true,
      isNodeEditMode: false,
      classicMode: false,
      randomizePalette: true,
      randomizeNumColors: true,
      parameterTargetMode: DEFAULTS.parameterTargetMode || 'individual',
      colorFadeWhileFrozen: true,
      showLayerOutlines: false,
      syncLayerColorsToFirst: false,
    });
  }, []);

  const value = {
    // Current state
    ...appState,
    // Presets API
    presetSlots,
    setPresetSlots,
    setPresetSlot,
    clearPresetSlot,
    getPresetSlot,

    // Individual setters for backward compatibility
    setIsFrozen,
    setBackgroundColor,
    setBackgroundImage,
    setGlobalBlendMode,
    setGlobalSeed,
    setGlobalSpeedMultiplier,
    setLayers,
    setSelectedLayerIndex,
    setIsOverlayVisible,
    setIsNodeEditMode,
    setClassicMode,
    setZIgnore,
    setRandomizePalette,
    setRandomizeNumColors,
    setColorFadeWhileFrozen,
    syncLayerColorsToFirst: appState.syncLayerColorsToFirst,
    setSyncLayerColorsToFirst,
    setParameterTargetMode,
    setShowLayerOutlines,

    // Morph setters
    setMorphEnabled,
    setMorphRoute,
    setMorphDurationPerLeg,
    setMorphEasing,
    setMorphLoopMode,
    setMorphMode,

    // Selection & Groups API
    toggleLayerSelection,
    clearSelection,
    createGroup,
    renameGroup,
    setGroupColor,
    addMembersToGroup,
    removeMembersFromGroup,
    deleteGroup,
    setEditTarget,
    getActiveTargetLayerIds,

    // State management functions
    getCurrentAppState,
    loadAppState,
    resetAppState,
  };

  return (
    <AppStateContext.Provider value={value}>
      {children}
    </AppStateContext.Provider>
  );
};
