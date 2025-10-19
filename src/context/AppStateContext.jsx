import React, { createContext, useState, useContext, useCallback, useEffect, useRef } from 'react';
import { DEFAULTS } from '../constants/defaults';
import {
  StateStore,
  createInitialAppState,
  normalizeImportedAppState,
  assignLayerIds,
  createLayerIdFactory,
  DEFAULT_APP_STATE,
} from '@art-app/core';

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
  const layerIdFactoryRef = useRef(createLayerIdFactory());
  const makeLayerId = useCallback(() => layerIdFactoryRef.current(), []);
  const assignIds = useCallback(
    (layers = []) => assignLayerIds(layers, makeLayerId),
    [makeLayerId],
  );

  const createStateFromDefaults = useCallback(() => {
    const base = createInitialAppState();
    return {
      ...base,
      backgroundColor: DEFAULTS.backgroundColor ?? base.backgroundColor,
      globalBlendMode: DEFAULTS.globalBlendMode ?? base.globalBlendMode,
      globalSpeedMultiplier: DEFAULTS.globalSpeedMultiplier ?? base.globalSpeedMultiplier,
      selectedLayerIndex: DEFAULTS.selectedLayerIndex ?? base.selectedLayerIndex,
      parameterTargetMode: DEFAULTS.parameterTargetMode ?? base.parameterTargetMode ?? 'individual',
      applyVariationInstantly: DEFAULTS.applyVariationInstantly ?? base.applyVariationInstantly ?? true,
    };
  }, []);

  const storeRef = useRef(new StateStore({ initialState: createStateFromDefaults() }));
  const [{ appState, version }, setSnapshot] = useState(() => {
    const snap = storeRef.current.snapshot();
    return { appState: snap.state, version: snap.version };
  });

  const syncFromStore = useCallback(() => {
    const snap = storeRef.current.snapshot();
    setSnapshot({ appState: snap.state, version: snap.version });
  }, []);

  // RAM preset slot stored in-memory only
  const [quickPreset, setQuickPreset] = useState(null);

  const setQuickPresetSnapshot = useCallback((snapshot) => {
    if (!snapshot || typeof snapshot !== 'object') {
      setQuickPreset(null);
      return;
    }
    try {
      const cloned = typeof structuredClone === 'function'
        ? structuredClone(snapshot)
        : JSON.parse(JSON.stringify(snapshot));
      setQuickPreset(cloned);
    } catch {
      setQuickPreset(snapshot);
    }
  }, []);

  const clearQuickPresetSnapshot = useCallback(() => {
    setQuickPreset(null);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof WebSocket === 'undefined') {
      return undefined;
    }

    let socket = null;
    let active = true;
    let retryTimer = null;

    const applySnapshot = (payload) => {
      if (!payload || typeof payload.version !== 'number' || !payload.state) {
        return;
      }
      try {
        storeRef.current.loadSnapshot(payload, { resetHistory: true });
        syncFromStore();
      } catch (error) {
        console.warn('[AppState] Failed to apply MCP snapshot', error);
      }
    };

    const resolveUrl = () => {
      const envUrl = import.meta?.env?.VITE_MCP_WS_URL;
      if (typeof envUrl === 'string' && envUrl.length > 0) {
        return envUrl;
      }
      const host = import.meta?.env?.VITE_MCP_WS_HOST || window.location.hostname || '127.0.0.1';
      const rawPort = import.meta?.env?.VITE_MCP_WS_PORT;
      const port = typeof rawPort === 'string' && rawPort.length > 0 ? rawPort : '3211';
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      return `${protocol}://${host}:${port}`;
    };

    const scheduleReconnect = () => {
      if (!active) {
        return;
      }
      if (retryTimer) {
        return;
      }
      retryTimer = setTimeout(() => {
        retryTimer = null;
        connect();
      }, 1500);
    };

    const connect = () => {
      let url;
      try {
        url = resolveUrl();
      } catch (error) {
        console.warn('[AppState] Failed to resolve MCP WS URL', error);
        scheduleReconnect();
        return;
      }

      try {
        socket = new WebSocket(url);
      } catch (error) {
        console.warn('[AppState] Failed to open MCP WS', error);
        scheduleReconnect();
        return;
      }

      socket.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed?.type === 'snapshot') {
            applySnapshot(parsed.payload);
          }
        } catch (error) {
          console.warn('[AppState] Failed to parse MCP message', error);
        }
      };

      socket.onclose = () => {
        if (active) {
          scheduleReconnect();
        }
      };

      socket.onerror = () => {
        socket?.close();
      };
    };

    connect();

    return () => {
      active = false;
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
      if (socket) {
        try {
          socket.close();
        } catch {
          /* noop */
        }
      }
    };
  }, [syncFromStore]);

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
    storeRef.current.update((prev) => ({
      ...prev,
      isFrozen: typeof value === 'function' ? value(prev.isFrozen) : value,
    }));
    syncFromStore();
  }, [syncFromStore]);

  const setBackgroundColor = useCallback((value) => {
    storeRef.current.update((prev) => ({ ...prev, backgroundColor: value }));
    syncFromStore();
  }, [syncFromStore]);

  const setBackgroundImage = useCallback((value) => {
    storeRef.current.update((prev) => ({
      ...prev,
      backgroundImage: typeof value === 'function'
        ? value(prev.backgroundImage)
        : { ...prev.backgroundImage, ...(value || {}) },
    }));
    syncFromStore();
  }, [syncFromStore]);

  const setGlobalBlendMode = useCallback((value) => {
    storeRef.current.update((prev) => ({ ...prev, globalBlendMode: value }));
    syncFromStore();
  }, [syncFromStore]);

  const setGlobalSeed = useCallback((value) => {
    storeRef.current.update((prev) => ({ ...prev, globalSeed: value }));
    syncFromStore();
  }, [syncFromStore]);

  const setGlobalSpeedMultiplier = useCallback((value) => {
    storeRef.current.update((prev) => ({ ...prev, globalSpeedMultiplier: value }));
    syncFromStore();
  }, [syncFromStore]);

  // Important: support functional updates correctly to avoid stale state reappearing.
  // If an updater function is provided, call it with prev.layers inside setAppState.
  const setLayers = useCallback((value) => {
    storeRef.current.update((prev) => {
      const nextLayers = typeof value === 'function' ? value(prev.layers) : value;
      return { ...prev, layers: assignIds(nextLayers) };
    });
    syncFromStore();
  }, [assignIds, syncFromStore]);

  const setSelectedLayerIndex = useCallback((value) => {
    storeRef.current.update((prev) => ({ ...prev, selectedLayerIndex: value }));
    syncFromStore();
  }, [syncFromStore]);

  const setIsOverlayVisible = useCallback((value) => {
    storeRef.current.update((prev) => ({
      ...prev,
      isOverlayVisible: typeof value === 'function' ? value(prev.isOverlayVisible) : value,
    }));
    syncFromStore();
  }, [syncFromStore]);

  const setIsNodeEditMode = useCallback((value) => {
    storeRef.current.update((prev) => ({ ...prev, isNodeEditMode: value }));
    syncFromStore();
  }, [syncFromStore]);

  // Toggle Classic Mode (original CodePen-like aesthetics)
  const setClassicMode = useCallback((value) => {
    storeRef.current.update((prev) => ({ ...prev, classicMode: !!value }));
    syncFromStore();
  }, [syncFromStore]);

  // Toggle Z-Ignore (disable Z movement)
  const setZIgnore = useCallback((value) => {
    storeRef.current.update((prev) => ({ ...prev, zIgnore: !!value }));
    syncFromStore();
  }, [syncFromStore]);

  // Global toggles for color randomization behavior
  const setRandomizePalette = useCallback((value) => {
    storeRef.current.update((prev) => ({ ...prev, randomizePalette: !!value }));
    syncFromStore();
  }, [syncFromStore]);

  const setRandomizeNumColors = useCallback((value) => {
    storeRef.current.update((prev) => ({ ...prev, randomizeNumColors: !!value }));
    syncFromStore();
  }, [syncFromStore]);

  const setColorFadeWhileFrozen = useCallback((value) => {
    storeRef.current.update((prev) => ({ ...prev, colorFadeWhileFrozen: !!value }));
    syncFromStore();
  }, [syncFromStore]);

  const setParameterTargetMode = useCallback((mode) => {
    const normalized = typeof mode === 'string' && mode.toLowerCase() === 'global' ? 'global' : 'individual';
    storeRef.current.update((prev) => ({ ...prev, parameterTargetMode: normalized }));
    syncFromStore();
  }, [syncFromStore]);

  const setShowLayerOutlines = useCallback((value) => {
    storeRef.current.update((prev) => ({
      ...prev,
      showLayerOutlines: typeof value === 'function' ? !!value(prev.showLayerOutlines) : !!value,
    }));
    syncFromStore();
  }, [syncFromStore]);

  const setSyncLayerColorsToFirst = useCallback((value) => {
    storeRef.current.update((prev) => ({ ...prev, syncLayerColorsToFirst: !!value }));
    syncFromStore();
  }, [syncFromStore]);

  const setApplyVariationInstantly = useCallback((value) => {
    storeRef.current.update((prev) => ({ ...prev, applyVariationInstantly: !!value }));
    syncFromStore();
  }, [syncFromStore]);

  // Morph setters
  const setMorphEnabled = useCallback((value) => {
    storeRef.current.update((prev) => ({ ...prev, morphEnabled: !!value }));
    syncFromStore();
  }, [syncFromStore]);
  const setMorphRoute = useCallback((value) => {
    storeRef.current.update((prev) => ({
      ...prev,
      morphRoute: Array.isArray(value) ? value.slice(0, 16) : prev.morphRoute,
    }));
    syncFromStore();
  }, [syncFromStore]);
  const setMorphDurationPerLeg = useCallback((value) => {
    const v = parseFloat(value);
    storeRef.current.update((prev) => ({
      ...prev,
      morphDurationPerLeg: Number.isFinite(v) ? Math.max(0.2, Math.min(120, v)) : prev.morphDurationPerLeg,
    }));
    syncFromStore();
  }, [syncFromStore]);
  const setMorphEasing = useCallback((value) => {
    const allowed = ['linear'];
    storeRef.current.update((prev) => ({
      ...prev,
      morphEasing: allowed.includes(value) ? value : prev.morphEasing,
    }));
    syncFromStore();
  }, [syncFromStore]);
  const setMorphLoopMode = useCallback((value) => {
    const allowed = ['loop', 'pingpong'];
    storeRef.current.update((prev) => ({
      ...prev,
      morphLoopMode: allowed.includes(value) ? value : prev.morphLoopMode,
    }));
    syncFromStore();
  }, [syncFromStore]);
  const setMorphMode = useCallback((value) => {
    const allowed = ['tween', 'fade'];
    storeRef.current.update((prev) => ({
      ...prev,
      morphMode: allowed.includes(value) ? value : prev.morphMode,
    }));
    syncFromStore();
  }, [syncFromStore]);

  // Function to get current app state for saving
  const getCurrentAppState = useCallback(() => {
    const snap = storeRef.current.snapshot();
    return snap.state;
  }, []);

  // Function to load app state
  const loadAppState = useCallback((newState) => {
    if (!newState) {
      return false;
    }
    try {
      storeRef.current.replaceState(normalizeImportedAppState(newState, makeLayerId));
      syncFromStore();
      return true;
    } catch (error) {
      console.warn('[AppState] Failed to load app state', error);
      return false;
    }
  }, [makeLayerId, syncFromStore]);

  // Selection helpers
  const toggleLayerSelection = useCallback((layerId) => {
    storeRef.current.update((prev) => {
      const set = new Set(prev.selectedLayerIds || []);
      if (set.has(layerId)) {
        set.delete(layerId);
      } else {
        set.add(layerId);
      }
      return { ...prev, selectedLayerIds: Array.from(set) };
    });
    syncFromStore();
  }, [syncFromStore]);
  const clearSelection = useCallback(() => {
    storeRef.current.update((prev) => ({ ...prev, selectedLayerIds: [] }));
    syncFromStore();
  }, [syncFromStore]);

  // Groups CRUD
  const createGroup = useCallback(({ name, color = '#7c84ff', memberIds = [] } = {}) => {
    const id = `group-${Date.now().toString(36)}-${Math.floor(Math.random()*1e4)}`;
    storeRef.current.update((prev) => ({
      ...prev,
      layerGroups: [...(prev.layerGroups || []), { id, name: name || 'Group', color, memberIds: [...new Set(memberIds)] }],
    }));
    syncFromStore();
    return id;
  }, [syncFromStore]);
  const renameGroup = useCallback((groupId, name) => {
    storeRef.current.update((prev) => ({
      ...prev,
      layerGroups: (prev.layerGroups || []).map((g) => (g.id === groupId ? { ...g, name } : g)),
    }));
    syncFromStore();
  }, [syncFromStore]);
  const setGroupColor = useCallback((groupId, color) => {
    storeRef.current.update((prev) => ({
      ...prev,
      layerGroups: (prev.layerGroups || []).map((g) => (g.id === groupId ? { ...g, color } : g)),
    }));
    syncFromStore();
  }, [syncFromStore]);
  const addMembersToGroup = useCallback((groupId, ids = []) => {
    storeRef.current.update((prev) => ({
      ...prev,
      layerGroups: (prev.layerGroups || []).map((g) => (g.id === groupId
        ? { ...g, memberIds: Array.from(new Set([...(g.memberIds || []), ...ids])) }
        : g)),
    }));
    syncFromStore();
  }, [syncFromStore]);
  const removeMembersFromGroup = useCallback((groupId, ids = []) => {
    const remove = new Set(ids);
    storeRef.current.update((prev) => ({
      ...prev,
      layerGroups: (prev.layerGroups || []).map((g) => (g.id === groupId
        ? { ...g, memberIds: (g.memberIds || []).filter((id) => !remove.has(id)) }
        : g)),
    }));
    syncFromStore();
  }, [syncFromStore]);
  const deleteGroup = useCallback((groupId) => {
    storeRef.current.update((prev) => ({
      ...prev,
      layerGroups: (prev.layerGroups || []).filter((g) => g.id !== groupId),
    }));
    syncFromStore();
  }, [syncFromStore]);

  // Edit target
  const setEditTarget = useCallback((target) => {
    // target: { type: 'single'|'selection'|'group', groupId? }
    storeRef.current.update((prev) => ({ ...prev, editTarget: target && target.type ? target : { type: 'single' } }));
    syncFromStore();
  }, [syncFromStore]);
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
    storeRef.current.replaceState(createStateFromDefaults());
    syncFromStore();
  }, [createStateFromDefaults, syncFromStore]);

  const value = {
    // Current state
    ...appState,
    version,
    quickPreset,
    setQuickPresetSnapshot,
    clearQuickPresetSnapshot,
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
    applyVariationInstantly: appState.applyVariationInstantly,
    setApplyVariationInstantly,
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
