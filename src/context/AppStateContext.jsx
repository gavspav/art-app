/* eslint-disable react-hooks/exhaustive-deps -- setAppState is a stable history-aware setter. */
import React, { createContext, useState, useContext, useCallback, useEffect, useRef, useMemo } from 'react';
import { DEFAULTS, DEFAULT_LAYER } from '../constants/defaults';

const SEED_MIN = 1;
const SEED_MAX = 2147483646;
const INTERACTION_WINDOW_MS = 2500;
// Hold-off duration: pause audio/BPM automation when user is actively adjusting controls
const AUTOMATION_HOLDOFF_MS = 1500;
const IGNORED_KEYS = new Set(['Shift', 'Meta', 'Control', 'Alt', 'CapsLock']);
const generateSeed = () => Math.floor(Math.random() * (SEED_MAX - SEED_MIN + 1)) + SEED_MIN;

// Create the context
const AppStateContext = createContext();

// Create a custom hook for easy access to the context
export const useAppState = () => useContext(AppStateContext);

const pruneLayerScopedState = (state, layers) => {
  const liveIds = new Set((Array.isArray(layers) ? layers : []).map(layer => layer?.id).filter(Boolean));
  const selectedLayerIds = Array.isArray(state?.selectedLayerIds)
    ? state.selectedLayerIds.filter(id => liveIds.has(id))
    : [];
  let editTarget = state?.editTarget || { type: 'single' };
  if (editTarget?.type === 'selection' && selectedLayerIds.length === 0) {
    editTarget = { type: 'single' };
  } else if (editTarget?.type !== 'single' && editTarget?.type !== 'selection') {
    editTarget = { type: 'single' };
  }

  return {
    ...state,
    selectedLayerIds,
    editTarget,
  };
};

// Create the provider component
export const AppStateProvider = ({ children }) => {
  const historyRef = useRef({ undo: [], redo: [], lastCapturedAt: 0 });
  const historyReadyRef = useRef(false);
  const historySuspendedRef = useRef(false);
  const [historyVersion, setHistoryVersion] = useState(0);
  const lastInteractionRef = useRef(0);
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
    let hasChanges = false;

    // Pass 1: Check for duplicates or missing IDs
    const result = list.map((layer) => {
      const out = ensureLayerId(layer);

      // Check if ensureLayerId created a new object (meaning ID was missing)
      if (out !== layer) {
        hasChanges = true;
      }

      if (seen.has(out.id)) {
        // Duplicate detected
        hasChanges = true;
        const newId = makeLayerId();
        try { console.debug('[AppState] Duplicate layer id detected; reassigning', { old: out.id, new: newId }); } catch { /* noop */ }
        seen.add(newId);
        return { ...out, id: newId };
      }

      seen.add(out.id);
      return out;
    });

    // Optimization: If no changes were made, return the original array to preserve referential identity
    // This allows React.memo and useEffect dependencies to skip updates
    return hasChanges ? result : list;
  }, [ensureLayerId, makeLayerId]);

  // Main app state that should be saveable
  const [appState, setAppStateRaw] = useState({
    isFrozen: DEFAULTS.isFrozen,
    enableBreathing: false,
    enableEnergyScaling: false,
    energyInfluence: 0.5,
    // Live audio-spawn overlay layers.
    audioSpawnEnabled: false,
    audioSpawnTriggerMode: 'level',
    audioSpawnRepeatWhileAbove: true,
    audioSpawnHysteresis: 0.08,
    audioSpawnBand: 'rms',
    audioSpawnThreshold: 0.6,
    audioSpawnCooldownMs: 250,
    audioSpawnHalfLifeMs: 1500,
    audioSpawnHalfLifeEnergyFactor: 1.0,
    audioSpawnMaxLayers: 12,
    audioSpawnPresetActive: false,
    audioSpawnUseGlobalPalette: false,
    audioSpawnMicReactive: false,
    audioSpawnMicReactiveAmount: 100,
    audioSpawnForceContourMode: false,
    audioSpawnDirectionMode: 'template',
    audioSpawnDirectionSpread: 0,
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
    nodeEditContext: null, // { layerId: string, layerName: string }
    classicMode: false,
    // Z-axis movement ignore (disable all Z scaling movement)
    zIgnore: true,
    // Global randomization toggles for palette and color count
    randomizePalette: true,
    randomizeNumColors: true,
    // Global palette preset selection (used for generation constraints)
    globalPaletteIndex: 'custom', // 'custom' | number
    // Optional custom palette selection by id
    globalPaletteRef: null, // string | null
    // When false, all layers get the same number of colors (uniformColorCount)
    randomizeColorsPerLayer: true,
    uniformColorCount: 3,
    // Global: allow colour fading to continue while frozen
    colorFadeWhileFrozen: true,
    // Keep every layer in sync with layer 1 colours when enabled
    syncLayerColorsToFirst: false,
    applyVariationInstantly: DEFAULTS.applyVariationInstantly ?? true,
    // Parameter targeting mode
    parameterTargetMode: DEFAULTS.parameterTargetMode || 'individual',
    // Selection outline visibility (disabled by default)
    showLayerOutlines: false,
    isolateMode: false,

    // Temporary multi-selection
    selectedLayerIds: [], // array of layer.id
    editTarget: { type: 'single' }, // 'single' | 'selection'
  });
  const appStateRef = useRef(appState);
  useEffect(() => { appStateRef.current = appState; }, [appState]);

  // Stable getter for layers - use this instead of context.layers to avoid re-renders
  const getLayers = useCallback(() => appStateRef.current.layers, []);

  // Autosave tracking
  const [isDirty, setIsDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(Date.now());
  const dirtyGuardRef = useRef(0);

  const cloneState = useCallback((value) => {
    try {
      return typeof structuredClone === 'function'
        ? structuredClone(value)
        : JSON.parse(JSON.stringify(value));
    } catch {
      return value;
    }
  }, []);

  const setAppState = useCallback((value) => {
    setAppStateRaw(previous => {
      const next = typeof value === 'function' ? value(previous) : value;
      if (!next || Object.is(previous, next)) return previous;
      const now = Date.now();
      const userInitiated = lastInteractionRef.current > 0 && (now - lastInteractionRef.current) < INTERACTION_WINDOW_MS;
      if (historyReadyRef.current && !historySuspendedRef.current && userInitiated) {
        const history = historyRef.current;
        // Continuous sliders and pointer gestures become one transaction.
        if ((now - history.lastCapturedAt) > 350 || history.undo.length === 0) {
          history.undo.push(cloneState(previous));
          if (history.undo.length > 50) history.undo.shift();
        }
        history.redo = [];
        history.lastCapturedAt = now;
        setHistoryVersion(version => version + 1);
      }
      return next;
    });
  }, [cloneState]);

  const resetHistory = useCallback(() => {
    historyRef.current = { undo: [], redo: [], lastCapturedAt: 0 };
    setHistoryVersion(version => version + 1);
  }, []);

  const undo = useCallback(() => {
    const history = historyRef.current;
    const snapshot = history.undo.pop();
    if (!snapshot) return;
    history.redo.push(cloneState(appStateRef.current));
    history.lastCapturedAt = 0;
    historySuspendedRef.current = true;
    setAppStateRaw(snapshot);
    queueMicrotask(() => { historySuspendedRef.current = false; });
    setHistoryVersion(version => version + 1);
    setIsDirty(true);
  }, [cloneState]);

  const redo = useCallback(() => {
    const history = historyRef.current;
    const snapshot = history.redo.pop();
    if (!snapshot) return;
    history.undo.push(cloneState(appStateRef.current));
    history.lastCapturedAt = 0;
    historySuspendedRef.current = true;
    setAppStateRaw(snapshot);
    queueMicrotask(() => { historySuspendedRef.current = false; });
    setHistoryVersion(version => version + 1);
    setIsDirty(true);
  }, [cloneState]);

  useEffect(() => {
    historyReadyRef.current = true;
  }, []);

  const markDirty = useCallback(() => {
    if (dirtyGuardRef.current > 0) return;
    const now = Date.now();
    const last = lastInteractionRef.current;
    if (!last || (now - last) > INTERACTION_WINDOW_MS) return;
    setIsDirty(true);
  }, []);

  const runWithoutDirty = useCallback((fn) => {
    dirtyGuardRef.current += 1;
    try {
      if (typeof fn === 'function') {
        return fn();
      }
      return undefined;
    } finally {
      dirtyGuardRef.current = Math.max(0, dirtyGuardRef.current - 1);
    }
  }, []);

  const noteUserInteraction = useCallback(() => {
    lastInteractionRef.current = Date.now();
    // Do not modify dirtyGuardRef here - it is managed by runWithoutDirty
  }, []);

  // Check if user is currently interacting (within hold-off window)
  // Used by Audio/BPM contexts to pause automation during user input
  const isUserInteracting = useCallback(() => {
    const now = Date.now();
    const last = lastInteractionRef.current;
    return last > 0 && (now - last) < AUTOMATION_HOLDOFF_MS;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return () => { };

    const handlePointer = () => { noteUserInteraction(); };
    const handlePointerMove = () => { noteUserInteraction(); };
    const handleKey = (event) => {
      if (!event || typeof event.key !== 'string') {
        noteUserInteraction();
        return;
      }
      if (IGNORED_KEYS.has(event.key)) return;
      noteUserInteraction();
    };

    const passiveOpts = { passive: true };

    window.addEventListener('pointerdown', handlePointer, passiveOpts);
    window.addEventListener('pointerup', handlePointer, passiveOpts);
    window.addEventListener('pointermove', handlePointerMove, passiveOpts);
    window.addEventListener('keydown', handleKey, true);

    return () => {
      window.removeEventListener('pointerdown', handlePointer, passiveOpts);
      window.removeEventListener('pointerup', handlePointer, passiveOpts);
      window.removeEventListener('pointermove', handlePointerMove, passiveOpts);
      window.removeEventListener('keydown', handleKey, true);
    };
  }, [noteUserInteraction]);

  // Individual state setters for backward compatibility
  const setIsFrozen = useCallback((value) => {
    setAppState(prev => ({
      ...prev,
      isFrozen: (typeof value === 'function') ? value(prev.isFrozen) : value,
    }));
    markDirty();
  }, [markDirty]);

  const setEnableBreathing = useCallback((value) => {
    setAppState(prev => ({
      ...prev,
      enableBreathing: (typeof value === 'function') ? value(prev.enableBreathing) : !!value,
    }));
    markDirty();
  }, [markDirty]);

  const setEnableEnergyScaling = useCallback((value) => {
    setAppState(prev => ({
      ...prev,
      enableEnergyScaling: (typeof value === 'function') ? value(prev.enableEnergyScaling) : !!value,
    }));
    markDirty();
  }, [markDirty]);

  const setEnergyInfluence = useCallback((value) => {
    setAppState(prev => {
      const raw = (typeof value === 'function') ? value(prev.energyInfluence) : value;
      const next = Number.isFinite(raw) ? Math.max(0, Math.min(2, raw)) : prev.energyInfluence;
      return {
        ...prev,
        energyInfluence: next,
      };
    });
    markDirty();
  }, [markDirty]);

  const setAudioSpawnEnabled = useCallback((value) => {
    setAppState(prev => ({
      ...prev,
      audioSpawnEnabled: (typeof value === 'function') ? !!value(prev.audioSpawnEnabled) : !!value,
    }));
    markDirty();
  }, [markDirty]);

  const setAudioSpawnPresetActive = useCallback((value) => {
    setAppState(prev => ({
      ...prev,
      audioSpawnPresetActive: (typeof value === 'function')
        ? !!value(prev.audioSpawnPresetActive)
        : !!value,
    }));
    markDirty();
  }, [markDirty]);

  const setAudioSpawnUseGlobalPalette = useCallback((value) => {
    setAppState(prev => ({
      ...prev,
      audioSpawnUseGlobalPalette: (typeof value === 'function')
        ? !!value(prev.audioSpawnUseGlobalPalette)
        : !!value,
    }));
    markDirty();
  }, [markDirty]);

  const setAudioSpawnMicReactive = useCallback((value) => {
    setAppState(prev => {
      const nextMicReactive = (typeof value === 'function')
        ? !!value(prev.audioSpawnMicReactive)
        : !!value;
      const amountRaw = Number(prev.audioSpawnMicReactiveAmount);
      const amount = Number.isFinite(amountRaw) ? Math.max(0, Math.min(100, amountRaw)) : 0;
      return {
        ...prev,
        audioSpawnMicReactive: nextMicReactive,
        audioSpawnMicReactiveAmount: (nextMicReactive && amount <= 0) ? 100 : amount,
      };
    });
    markDirty();
  }, [markDirty]);

  const setAudioSpawnMicReactiveAmount = useCallback((value) => {
    const raw = (typeof value === 'function')
      ? value(appStateRef.current.audioSpawnMicReactiveAmount)
      : value;
    const next = Number.isFinite(Number(raw))
      ? Math.max(0, Math.min(100, Number(raw)))
      : appStateRef.current.audioSpawnMicReactiveAmount;
    setAppState(prev => ({ ...prev, audioSpawnMicReactiveAmount: next }));
    markDirty();
  }, [markDirty]);

  const setAudioSpawnForceContourMode = useCallback((value) => {
    setAppState(prev => ({
      ...prev,
      audioSpawnForceContourMode: (typeof value === 'function')
        ? !!value(prev.audioSpawnForceContourMode)
        : !!value,
    }));
    markDirty();
  }, [markDirty]);

  const setAudioSpawnDirectionMode = useCallback((value) => {
    const allowed = new Set(['template', 'spread']);
    setAppState(prev => {
      const raw = (typeof value === 'function')
        ? value(prev.audioSpawnDirectionMode)
        : value;
      const next = allowed.has(raw) ? raw : prev.audioSpawnDirectionMode;
      return { ...prev, audioSpawnDirectionMode: next };
    });
    markDirty();
  }, [markDirty]);

  const setAudioSpawnDirectionSpread = useCallback((value) => {
    const raw = (typeof value === 'function')
      ? value(appStateRef.current.audioSpawnDirectionSpread)
      : value;
    const next = Number.isFinite(Number(raw))
      ? Math.max(0, Math.min(180, Number(raw)))
      : appStateRef.current.audioSpawnDirectionSpread;
    setAppState(prev => ({ ...prev, audioSpawnDirectionSpread: next }));
    markDirty();
  }, [markDirty]);

  const setAudioSpawnBand = useCallback((value) => {
    const allowed = new Set(['rms', 'bass', 'mids', 'highs', 'pitch', 'transient', 'beat', 'waveformEnergy']);
    setAppState(prev => ({
      ...prev,
      audioSpawnBand: allowed.has(value) ? value : prev.audioSpawnBand,
    }));
    markDirty();
  }, [markDirty]);

  const setAudioSpawnTriggerMode = useCallback((value) => {
    const allowed = new Set(['level', 'transient']);
    setAppState(prev => ({
      ...prev,
      audioSpawnTriggerMode: allowed.has(value) ? value : prev.audioSpawnTriggerMode,
    }));
    markDirty();
  }, [markDirty]);

  const setAudioSpawnRepeatWhileAbove = useCallback((value) => {
    setAppState(prev => ({
      ...prev,
      audioSpawnRepeatWhileAbove: (typeof value === 'function')
        ? !!value(prev.audioSpawnRepeatWhileAbove)
        : !!value,
    }));
    markDirty();
  }, [markDirty]);

  const setAudioSpawnHysteresis = useCallback((value) => {
    const raw = (typeof value === 'function') ? value(appStateRef.current.audioSpawnHysteresis) : value;
    const next = Number.isFinite(Number(raw)) ? Math.max(0, Math.min(0.5, Number(raw))) : appStateRef.current.audioSpawnHysteresis;
    setAppState(prev => ({ ...prev, audioSpawnHysteresis: next }));
    markDirty();
  }, [markDirty]);

  const setAudioSpawnThreshold = useCallback((value) => {
    const raw = (typeof value === 'function') ? value(appStateRef.current.audioSpawnThreshold) : value;
    const next = Number.isFinite(Number(raw)) ? Math.max(0, Math.min(1, Number(raw))) : appStateRef.current.audioSpawnThreshold;
    setAppState(prev => ({ ...prev, audioSpawnThreshold: next }));
    markDirty();
  }, [markDirty]);

  const setAudioSpawnCooldownMs = useCallback((value) => {
    const raw = (typeof value === 'function') ? value(appStateRef.current.audioSpawnCooldownMs) : value;
    const next = Number.isFinite(Number(raw)) ? Math.max(0, Math.min(10_000, Math.round(Number(raw)))) : appStateRef.current.audioSpawnCooldownMs;
    setAppState(prev => ({ ...prev, audioSpawnCooldownMs: next }));
    markDirty();
  }, [markDirty]);

  const setAudioSpawnHalfLifeMs = useCallback((value) => {
    const raw = (typeof value === 'function') ? value(appStateRef.current.audioSpawnHalfLifeMs) : value;
    const next = Number.isFinite(Number(raw)) ? Math.max(50, Math.min(60_000, Math.round(Number(raw)))) : appStateRef.current.audioSpawnHalfLifeMs;
    setAppState(prev => ({ ...prev, audioSpawnHalfLifeMs: next }));
    markDirty();
  }, [markDirty]);

  const setAudioSpawnHalfLifeEnergyFactor = useCallback((value) => {
    const raw = (typeof value === 'function') ? value(appStateRef.current.audioSpawnHalfLifeEnergyFactor) : value;
    const next = Number.isFinite(Number(raw)) ? Math.max(0, Math.min(4, Number(raw))) : appStateRef.current.audioSpawnHalfLifeEnergyFactor;
    setAppState(prev => ({ ...prev, audioSpawnHalfLifeEnergyFactor: next }));
    markDirty();
  }, [markDirty]);

  const setAudioSpawnMaxLayers = useCallback((value) => {
    const raw = (typeof value === 'function') ? value(appStateRef.current.audioSpawnMaxLayers) : value;
    const next = Number.isFinite(Number(raw)) ? Math.max(0, Math.min(200, Math.round(Number(raw)))) : appStateRef.current.audioSpawnMaxLayers;
    setAppState(prev => ({ ...prev, audioSpawnMaxLayers: next }));
    markDirty();
  }, [markDirty]);

  const setBackgroundColor = useCallback((value) => {
    setAppState(prev => ({ ...prev, backgroundColor: value }));
    markDirty();
  }, [markDirty]);

  const setBackgroundImage = useCallback((value) => {
    // value can be partial update or full object
    setAppState(prev => ({
      ...prev,
      backgroundImage: typeof value === 'function'
        ? value(prev.backgroundImage)
        : { ...prev.backgroundImage, ...(value || {}) }
    }));
    markDirty();
  }, [markDirty]);

  const setGlobalBlendMode = useCallback((value) => {
    setAppState(prev => ({ ...prev, globalBlendMode: value }));
    markDirty();
  }, [markDirty]);

  const setGlobalSeed = useCallback((value) => {
    setAppState(prev => ({ ...prev, globalSeed: value }));
    markDirty();
  }, [markDirty]);

  const setGlobalSpeedMultiplier = useCallback((value) => {
    setAppState(prev => ({ ...prev, globalSpeedMultiplier: value }));
    markDirty();
  }, [markDirty]);

  // Important: support functional updates correctly to avoid stale state reappearing.
  // If an updater function is provided, call it with prev.layers inside setAppState.
  const setLayers = useCallback((value) => {
    setAppState(prev => {
      const nextLayersRaw = typeof value === 'function' ? value(prev.layers) : value;
      const nextLayers = assignIds(nextLayersRaw);

      // Optimization: If assignIds returns the exact same array reference,
      // and we are not forcing an update via some other means,
      // return the previous state object to completely skip the React update.
      if (nextLayers === prev.layers) {
        return prev;
      }

      return pruneLayerScopedState({ ...prev, layers: nextLayers }, nextLayers);
    });
    markDirty();
  }, [assignIds, markDirty]);

  const setSelectedLayerIndex = useCallback((value) => {
    setAppState(prev => ({ ...prev, selectedLayerIndex: value }));
    markDirty();
  }, [markDirty]);

  const setIsOverlayVisible = useCallback((value) => {
    setAppState(prev => ({
      ...prev,
      isOverlayVisible: (typeof value === 'function') ? value(prev.isOverlayVisible) : value,
    }));
    markDirty();
  }, [markDirty]);

  const setIsNodeEditMode = useCallback((value, context = null) => {
    setAppState(prev => ({
      ...prev,
      isNodeEditMode: value,
      // When entering node edit mode, store context; when exiting, clear it
      nodeEditContext: value ? (context || prev.nodeEditContext) : null,
    }));
    markDirty();
  }, [markDirty]);


  // Toggle Classic Mode (original CodePen-like aesthetics)
  const setClassicMode = useCallback((value) => {
    setAppState(prev => ({ ...prev, classicMode: !!value }));
    markDirty();
  }, [markDirty]);

  // Toggle Z-Ignore (disable Z movement)
  const setZIgnore = useCallback((value) => {
    setAppState(prev => ({ ...prev, zIgnore: !!value }));
    markDirty();
  }, [markDirty]);

  // Global toggles for color randomization behavior
  const setRandomizePalette = useCallback((value) => {
    setAppState(prev => ({ ...prev, randomizePalette: !!value }));
    markDirty();
  }, [markDirty]);

  const setRandomizeNumColors = useCallback((value) => {
    setAppState(prev => ({ ...prev, randomizeNumColors: !!value }));
    markDirty();
  }, [markDirty]);

  const setGlobalPaletteIndex = useCallback((value) => {
    setAppState(prev => {
      const raw = (typeof value === 'function') ? value(prev.globalPaletteIndex) : value;
      if (raw === 'custom') return { ...prev, globalPaletteIndex: 'custom', globalPaletteRef: null };
      const idx = Number(raw);
      if (!Number.isFinite(idx)) return prev;
      const next = Math.max(0, Math.min(10_000, Math.round(idx)));
      return { ...prev, globalPaletteIndex: next, globalPaletteRef: null };
    });
    markDirty();
  }, [markDirty]);

  const setGlobalPaletteRef = useCallback((value) => {
    setAppState(prev => ({
      ...prev,
      globalPaletteRef: (typeof value === 'string' && value.trim().length > 0) ? value.trim() : null,
      globalPaletteIndex: 'custom',
    }));
    markDirty();
  }, [markDirty]);

  const setRandomizeColorsPerLayer = useCallback((value) => {
    setAppState(prev => ({ ...prev, randomizeColorsPerLayer: !!value }));
    markDirty();
  }, [markDirty]);

  const setUniformColorCount = useCallback((value) => {
    const v = parseInt(value, 10);
    setAppState(prev => ({ ...prev, uniformColorCount: Number.isFinite(v) ? Math.max(1, Math.min(32, v)) : prev.uniformColorCount }));
    markDirty();
  }, [markDirty]);

  const setColorFadeWhileFrozen = useCallback((value) => {
    setAppState(prev => ({ ...prev, colorFadeWhileFrozen: !!value }));
    markDirty();
  }, [markDirty]);

  const setParameterTargetMode = useCallback((mode) => {
    const normalized = (typeof mode === 'string' && mode.toLowerCase() === 'global') ? 'global' : 'individual';
    setAppState(prev => ({ ...prev, parameterTargetMode: normalized }));
    markDirty();
  }, [markDirty]);

  const setShowLayerOutlines = useCallback((value) => {
    setAppState(prev => ({
      ...prev,
      showLayerOutlines: (typeof value === 'function')
        ? !!value(prev.showLayerOutlines)
        : !!value,
    }));
    markDirty();
  }, [markDirty]);

  const setIsolateMode = useCallback((value) => {
    setAppState(prev => ({
      ...prev,
      isolateMode: (typeof value === 'function') ? !!value(prev.isolateMode) : !!value,
    }));
    markDirty();
  }, [markDirty]);

  const setSyncLayerColorsToFirst = useCallback((value) => {
    setAppState(prev => ({ ...prev, syncLayerColorsToFirst: !!value }));
    markDirty();
  }, [markDirty]);

  const setApplyVariationInstantly = useCallback((value) => {
    setAppState(prev => ({ ...prev, applyVariationInstantly: !!value }));
    markDirty();
  }, [markDirty]);

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
        const movementStyle = ['bounce', 'drift', 'still', 'orbit', 'spin'].includes(base.movementStyle) ? base.movementStyle : DEFAULT_LAYER.movementStyle;
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
      runWithoutDirty(() => {
        const {
          timelineMode: _timelineMode,
          layerGroups: _layerGroups,
          morphEnabled: _morphEnabled,
          morphRoute: _morphRoute,
          morphDurationPerLeg: _morphDurationPerLeg,
          morphEasing: _morphEasing,
          morphLoopMode: _morphLoopMode,
          morphMode: _morphMode,
          morphNodes: _morphNodes,
          ...supportedState
        } = newState;
        const rawGlobalPaletteIndex = newState.globalPaletteIndex;
        const normalizedPaletteIndex = (rawGlobalPaletteIndex === 'custom')
          ? 'custom'
          : (Number.isFinite(Number(rawGlobalPaletteIndex)) ? Math.max(0, Math.round(Number(rawGlobalPaletteIndex))) : 'custom');
        const normalizedPaletteRef = (typeof newState.globalPaletteRef === 'string' && newState.globalPaletteRef.trim().length > 0)
          ? newState.globalPaletteRef.trim()
          : null;
        setAppState(prevState => {
          const normalizedLayers = Array.isArray(newState.layers) && newState.layers.length > 0
            ? newState.layers.map(normalizeLayer)
            : prevState.layers.map(normalizeLayer);
          return pruneLayerScopedState({
          ...prevState,
          ...supportedState,
          editTarget: newState.editTarget?.type === 'selection' ? { type: 'selection' } : { type: 'single' },
          audioSpawnMicReactive: typeof newState.audioSpawnMicReactive === 'boolean'
            ? newState.audioSpawnMicReactive
            : !!prevState.audioSpawnMicReactive,
          audioSpawnMicReactiveAmount: Number.isFinite(Number(newState.audioSpawnMicReactiveAmount))
            ? Math.max(0, Math.min(100, Number(newState.audioSpawnMicReactiveAmount)))
            : (typeof newState.audioSpawnMicReactive === 'boolean'
              ? (newState.audioSpawnMicReactive ? 100 : 0)
              : (Number.isFinite(Number(prevState.audioSpawnMicReactiveAmount))
                ? Math.max(0, Math.min(100, Number(prevState.audioSpawnMicReactiveAmount)))
                : (prevState.audioSpawnMicReactive ? 100 : 0))),
          audioSpawnForceContourMode: typeof newState.audioSpawnForceContourMode === 'boolean'
            ? newState.audioSpawnForceContourMode
            : !!prevState.audioSpawnForceContourMode,
          audioSpawnDirectionMode: newState.audioSpawnDirectionMode === 'spread'
            ? 'spread'
            : (newState.audioSpawnDirectionMode === 'template'
              ? 'template'
              : (prevState.audioSpawnDirectionMode === 'spread' ? 'spread' : 'template')),
          audioSpawnDirectionSpread: Number.isFinite(Number(newState.audioSpawnDirectionSpread))
            ? Math.max(0, Math.min(180, Number(newState.audioSpawnDirectionSpread)))
            : (Number.isFinite(Number(prevState.audioSpawnDirectionSpread))
              ? Math.max(0, Math.min(180, Number(prevState.audioSpawnDirectionSpread)))
              : 0),
          audioSpawnPresetActive: typeof newState.audioSpawnPresetActive === 'boolean'
            ? newState.audioSpawnPresetActive
            : false,
          globalPaletteIndex: normalizedPaletteIndex,
          globalPaletteRef: normalizedPaletteRef,
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
          layers: normalizedLayers
        }, normalizedLayers);
        });
      });
      setIsDirty(false);
      setLastSavedAt(Date.now());
      resetHistory();
      return true;
    }
    return false;
  }, [makeLayerId, resetHistory, runWithoutDirty, setIsDirty, setLastSavedAt]);

  // Selection helpers
  const toggleLayerSelection = useCallback((layerId) => {
    setAppState(prev => {
      const set = new Set(prev.selectedLayerIds || []);
      if (set.has(layerId)) set.delete(layerId); else set.add(layerId);
      return { ...prev, selectedLayerIds: Array.from(set) };
    });
    markDirty();
  }, [markDirty]);
  const clearSelection = useCallback(() => {
    setAppState(prev => ({ ...prev, selectedLayerIds: [] }));
    markDirty();
  }, [markDirty]);

  // Edit target
  const setEditTarget = useCallback((target) => {
    const type = target?.type === 'selection' ? 'selection' : 'single';
    setAppState(prev => ({ ...prev, editTarget: { type } }));
    markDirty();
  }, [markDirty]);
  const getActiveTargetLayerIds = useCallback(() => {
    const state = appStateRef.current;
    if (!state) return [];
    if (state.editTarget?.type === 'selection') return state.selectedLayerIds || [];
    // single -> current selectedLayerIndex
    const idx = Math.max(0, Math.min(Number(state.selectedLayerIndex) || 0, Math.max(0, (state.layers || []).length - 1)));
    const l = (state.layers || [])[idx];
    return l && l.id ? [l.id] : [];
  }, []);

  // Function to reset app state to defaults
  const resetAppState = useCallback(() => {
    setAppState({
      isFrozen: DEFAULTS.isFrozen,
      enableBreathing: false,
      enableEnergyScaling: false,
      energyInfluence: 0.5,
      audioSpawnEnabled: false,
      audioSpawnTriggerMode: 'level',
      audioSpawnRepeatWhileAbove: true,
      audioSpawnHysteresis: 0.08,
      audioSpawnBand: 'rms',
      audioSpawnThreshold: 0.6,
      audioSpawnCooldownMs: 250,
      audioSpawnHalfLifeMs: 1500,
      audioSpawnHalfLifeEnergyFactor: 1.0,
      audioSpawnMaxLayers: 12,
      audioSpawnPresetActive: false,
      audioSpawnUseGlobalPalette: false,
      audioSpawnMicReactive: false,
      audioSpawnMicReactiveAmount: 100,
      audioSpawnForceContourMode: false,
      audioSpawnDirectionMode: 'template',
      audioSpawnDirectionSpread: 0,
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
      nodeEditContext: null,
      classicMode: false,
      zIgnore: true,
      randomizePalette: true,
      randomizeNumColors: true,
      globalPaletteIndex: 'custom',
      globalPaletteRef: null,
      parameterTargetMode: DEFAULTS.parameterTargetMode || 'individual',
      colorFadeWhileFrozen: true,
      showLayerOutlines: false,
      isolateMode: false,
      syncLayerColorsToFirst: false,
    });
    markDirty();
  }, [markDirty]);

  // Context value - we include appState but consumers should use React.memo
  // with custom comparators to avoid re-rendering on every frame
  const canUndo = historyRef.current.undo.length > 0;
  const canRedo = historyRef.current.redo.length > 0;
  const value = useMemo(() => ({
    // Current state
    ...appState,
    // Also provide getLayers() for components that need stable access
    getLayers,
    isDirty,
    setIsDirty,
    lastSavedAt,
    setLastSavedAt,
    markDirty,
    noteUserInteraction,
    isUserInteracting,
    canUndo,
    canRedo,
    undo,
    redo,
    resetHistory,

    // Individual setters
    setIsFrozen,
    setEnableBreathing,
    setEnableEnergyScaling,
    setEnergyInfluence,
    setAudioSpawnEnabled,
    setAudioSpawnPresetActive,
    setAudioSpawnUseGlobalPalette,
    setAudioSpawnMicReactive,
    setAudioSpawnMicReactiveAmount,
    setAudioSpawnForceContourMode,
    setAudioSpawnDirectionMode,
    setAudioSpawnDirectionSpread,
    setAudioSpawnBand,
    setAudioSpawnTriggerMode,
    setAudioSpawnRepeatWhileAbove,
    setAudioSpawnHysteresis,
    setAudioSpawnThreshold,
    setAudioSpawnCooldownMs,
    setAudioSpawnHalfLifeMs,
    setAudioSpawnHalfLifeEnergyFactor,
    setAudioSpawnMaxLayers,
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
    setGlobalPaletteIndex,
    setGlobalPaletteRef,
    setRandomizeColorsPerLayer,
    randomizeColorsPerLayer: appState.randomizeColorsPerLayer,
    uniformColorCount: appState.uniformColorCount,
    setUniformColorCount,
    setColorFadeWhileFrozen,
    syncLayerColorsToFirst: appState.syncLayerColorsToFirst,
    setSyncLayerColorsToFirst,
    applyVariationInstantly: appState.applyVariationInstantly,
    setApplyVariationInstantly,
    setParameterTargetMode,
    setShowLayerOutlines,
    setIsolateMode,

    // Temporary selection API
    toggleLayerSelection,
    clearSelection,
    setEditTarget,
    getActiveTargetLayerIds,

    // State management functions
    getCurrentAppState,
    loadAppState,
    resetAppState,
    runWithoutDirty,
  }), [
    appState,
    historyVersion,
    getLayers,
    isDirty,
    setIsDirty,
    lastSavedAt,
    setLastSavedAt,
    markDirty,
    noteUserInteraction,
    isUserInteracting,
    canUndo,
    canRedo,
    undo,
    redo,
    resetHistory,
    setIsFrozen,
    setEnableBreathing,
    setEnableEnergyScaling,
    setEnergyInfluence,
    setAudioSpawnEnabled,
    setAudioSpawnPresetActive,
    setAudioSpawnUseGlobalPalette,
    setAudioSpawnMicReactive,
    setAudioSpawnMicReactiveAmount,
    setAudioSpawnForceContourMode,
    setAudioSpawnDirectionMode,
    setAudioSpawnDirectionSpread,
    setAudioSpawnBand,
    setAudioSpawnTriggerMode,
    setAudioSpawnRepeatWhileAbove,
    setAudioSpawnHysteresis,
    setAudioSpawnThreshold,
    setAudioSpawnCooldownMs,
    setAudioSpawnHalfLifeMs,
    setAudioSpawnHalfLifeEnergyFactor,
    setAudioSpawnMaxLayers,
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
    setGlobalPaletteIndex,
    setGlobalPaletteRef,
    setRandomizeColorsPerLayer,
    setUniformColorCount,
    setColorFadeWhileFrozen,
    setSyncLayerColorsToFirst,
    setApplyVariationInstantly,
    setParameterTargetMode,
    setShowLayerOutlines,
    setIsolateMode,
    toggleLayerSelection,
    clearSelection,
    setEditTarget,
    getActiveTargetLayerIds,
    getCurrentAppState,
    loadAppState,
    resetAppState,
    runWithoutDirty,
  ]);

  return (
    <AppStateContext.Provider value={value}>
      {children}
    </AppStateContext.Provider>
  );
};
