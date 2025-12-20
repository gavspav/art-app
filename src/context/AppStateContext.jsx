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
  const [appState, setAppState] = useState({
    isFrozen: DEFAULTS.isFrozen,
    enableBreathing: false,
    enableEnergyScaling: false,
    energyInfluence: 0.5,
    // Live audio spawn mode (non-timeline, runtime-only layers)
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
    audioSpawnUseGlobalPalette: false,
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
    // Node edit context: tracks which layer and timeline position is being edited
    // This allows timeline to know whether to apply geometry updates
    nodeEditContext: null, // { layerId: string, layerName: string, timelinePosition: number | null }
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
    morphNodes: false, // interpolate node geometry (requires matching topology)

    // Two-mode UI: when true, timeline is the authority.
    timelineMode: false,
  });
  const appStateRef = useRef(appState);
  useEffect(() => { appStateRef.current = appState; }, [appState]);

  // Stable getter for layers - use this instead of context.layers to avoid re-renders
  const getLayers = useCallback(() => appStateRef.current.layers, []);

  // RAM preset slot stored in-memory only
  const [quickPreset, setQuickPreset] = useState(null);

  // Autosave tracking
  const [isDirty, setIsDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(Date.now());
  const dirtyGuardRef = useRef(0);
  const lastInteractionRef = useRef(0);

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
    if (typeof window === 'undefined') return () => {};

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

  const setAudioSpawnUseGlobalPalette = useCallback((value) => {
    setAppState(prev => ({
      ...prev,
      audioSpawnUseGlobalPalette: (typeof value === 'function')
        ? !!value(prev.audioSpawnUseGlobalPalette)
        : !!value,
    }));
    markDirty();
  }, [markDirty]);

  const setAudioSpawnBand = useCallback((value) => {
    const allowed = new Set(['rms', 'bass', 'mids', 'highs']);
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
      
      return { ...prev, layers: nextLayers };
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

  const setTimelineMode = useCallback((value) => {
    setAppState(prev => ({
      ...prev,
      timelineMode: (typeof value === 'function') ? !!value(!!prev.timelineMode) : !!value,
    }));
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

  // Morph setters
  const setMorphEnabled = useCallback((value) => {
    setAppState(prev => ({ ...prev, morphEnabled: !!value }));
    markDirty();
  }, [markDirty]);
  const setMorphRoute = useCallback((value) => {
    setAppState(prev => ({ ...prev, morphRoute: Array.isArray(value) ? value.slice(0, 16) : prev.morphRoute }));
    markDirty();
  }, [markDirty]);
  const setMorphDurationPerLeg = useCallback((value) => {
    const v = parseFloat(value);
    setAppState(prev => ({ ...prev, morphDurationPerLeg: Number.isFinite(v) ? Math.max(0.2, Math.min(120, v)) : prev.morphDurationPerLeg }));
    markDirty();
  }, [markDirty]);
  const setMorphEasing = useCallback((value) => {
    const allowed = ['linear'];
    setAppState(prev => ({ ...prev, morphEasing: allowed.includes(value) ? value : prev.morphEasing }));
    markDirty();
  }, [markDirty]);
  const setMorphLoopMode = useCallback((value) => {
    const allowed = ['loop','pingpong'];
    setAppState(prev => ({ ...prev, morphLoopMode: allowed.includes(value) ? value : prev.morphLoopMode }));
    markDirty();
  }, [markDirty]);
  const setMorphMode = useCallback((value) => {
    const allowed = ['tween','fade'];
    setAppState(prev => ({ ...prev, morphMode: allowed.includes(value) ? value : prev.morphMode }));
    markDirty();
  }, [markDirty]);
  const setMorphNodes = useCallback((value) => {
    setAppState(prev => ({ ...prev, morphNodes: !!value }));
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
        const movementStyle = ['bounce','drift','still','orbit','spin'].includes(base.movementStyle) ? base.movementStyle : DEFAULT_LAYER.movementStyle;
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
        const rawGlobalPaletteIndex = newState.globalPaletteIndex;
        const normalizedPaletteIndex = (rawGlobalPaletteIndex === 'custom')
          ? 'custom'
          : (Number.isFinite(Number(rawGlobalPaletteIndex)) ? Math.max(0, Math.round(Number(rawGlobalPaletteIndex))) : 'custom');
        const normalizedPaletteRef = (typeof newState.globalPaletteRef === 'string' && newState.globalPaletteRef.trim().length > 0)
          ? newState.globalPaletteRef.trim()
          : null;
        setAppState(prevState => ({
          ...prevState,
          ...newState,
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
          layers: Array.isArray(newState.layers) && newState.layers.length > 0
            ? newState.layers.map(normalizeLayer)
            : prevState.layers.map(normalizeLayer)
        }));
      });
      setIsDirty(false);
      setLastSavedAt(Date.now());
      return true;
    }
    return false;
  }, [makeLayerId, runWithoutDirty, setIsDirty, setLastSavedAt]);

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

  // Groups CRUD
  const createGroup = useCallback(({ name, color = '#7c84ff', memberIds = [] } = {}) => {
    const id = `group-${Date.now().toString(36)}-${Math.floor(Math.random()*1e4)}`;
    setAppState(prev => ({ ...prev, layerGroups: [...(prev.layerGroups || []), { id, name: name || 'Group', color, memberIds: [...new Set(memberIds)] }] }));
    markDirty();
    return id;
  }, [markDirty]);
  const renameGroup = useCallback((groupId, name) => {
    setAppState(prev => ({ ...prev, layerGroups: (prev.layerGroups || []).map(g => g.id === groupId ? { ...g, name } : g) }));
    markDirty();
  }, [markDirty]);
  const setGroupColor = useCallback((groupId, color) => {
    setAppState(prev => ({ ...prev, layerGroups: (prev.layerGroups || []).map(g => g.id === groupId ? { ...g, color } : g) }));
    markDirty();
  }, [markDirty]);
  const addMembersToGroup = useCallback((groupId, ids = []) => {
    setAppState(prev => ({
      ...prev,
      layerGroups: (prev.layerGroups || []).map(g => g.id === groupId ? { ...g, memberIds: Array.from(new Set([...(g.memberIds || []), ...ids])) } : g)
    }));
    markDirty();
  }, [markDirty]);
  const removeMembersFromGroup = useCallback((groupId, ids = []) => {
    const remove = new Set(ids);
    setAppState(prev => ({
      ...prev,
      layerGroups: (prev.layerGroups || []).map(g => g.id === groupId ? { ...g, memberIds: (g.memberIds || []).filter(id => !remove.has(id)) } : g)
    }));
    markDirty();
  }, [markDirty]);
  const deleteGroup = useCallback((groupId) => {
    setAppState(prev => ({ ...prev, layerGroups: (prev.layerGroups || []).filter(g => g.id !== groupId) }));
    markDirty();
  }, [markDirty]);

  // Edit target
  const setEditTarget = useCallback((target) => {
    // target: { type: 'single'|'selection'|'group', groupId? }
    setAppState(prev => ({ ...prev, editTarget: target && target.type ? target : { type: 'single' } }));
    markDirty();
  }, [markDirty]);
  const getActiveTargetLayerIds = useCallback(() => {
    const state = appStateRef.current;
    if (!state) return [];
    if (state.editTarget?.type === 'selection') return state.selectedLayerIds || [];
    if (state.editTarget?.type === 'group') {
      const g = (state.layerGroups || []).find(x => x.id === state.editTarget.groupId);
      return g ? (g.memberIds || []) : [];
    }
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
      audioSpawnUseGlobalPalette: false,
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
      timelineMode: false,
    });
    markDirty();
  }, [markDirty]);

  // Context value - we include appState but consumers should use React.memo
  // with custom comparators to avoid re-rendering on every frame
  const value = useMemo(() => ({
    // Current state
    ...appState,
    // Also provide getLayers() for components that need stable access
    getLayers,
    quickPreset,
    setQuickPresetSnapshot,
    clearQuickPresetSnapshot,
    isDirty,
    setIsDirty,
    lastSavedAt,
    setLastSavedAt,
    markDirty,
    noteUserInteraction,
    isUserInteracting,
    presetSlots,
    setPresetSlots,
    setPresetSlot,
    clearPresetSlot,
    getPresetSlot,

    // Individual setters
    setIsFrozen,
    setEnableBreathing,
    setEnableEnergyScaling,
    setEnergyInfluence,
    setAudioSpawnEnabled,
    setAudioSpawnUseGlobalPalette,
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
    setTimelineMode,
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

    // Morph setters
    setMorphEnabled,
    setMorphRoute,
    setMorphDurationPerLeg,
    setMorphEasing,
    setMorphLoopMode,
    setMorphMode,
    setMorphNodes,

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
    runWithoutDirty,
  }), [
    appState,
    getLayers,
    quickPreset,
    setQuickPresetSnapshot,
    clearQuickPresetSnapshot,
    isDirty,
    setIsDirty,
    lastSavedAt,
    setLastSavedAt,
    markDirty,
    noteUserInteraction,
    presetSlots,
    setPresetSlots,
    setPresetSlot,
    clearPresetSlot,
    getPresetSlot,
    setIsFrozen,
    setEnableBreathing,
    setEnableEnergyScaling,
    setEnergyInfluence,
    setAudioSpawnEnabled,
    setAudioSpawnUseGlobalPalette,
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
    setTimelineMode,
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
    setMorphEnabled,
    setMorphRoute,
    setMorphDurationPerLeg,
    setMorphEasing,
    setMorphLoopMode,
    setMorphMode,
    setMorphNodes,
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
