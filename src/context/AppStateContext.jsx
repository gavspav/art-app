import React, { createContext, useState, useContext, useCallback } from 'react';
import { DEFAULTS, DEFAULT_LAYER } from '../constants/defaults';

// Create the context
const AppStateContext = createContext();

// Create a custom hook for easy access to the context
export const useAppState = () => useContext(AppStateContext);

// Create the provider component
export const AppStateProvider = ({ children }) => {
  // Main app state that should be saveable
  const [appState, setAppState] = useState({
    isFrozen: DEFAULTS.isFrozen,
    backgroundColor: DEFAULTS.backgroundColor,
    backgroundImage: { src: null, opacity: 1, fit: 'cover', enabled: false },
    globalBlendMode: DEFAULTS.globalBlendMode,
    globalSeed: DEFAULTS.globalSeed,
    globalSpeedMultiplier: DEFAULTS.globalSpeedMultiplier,
    layers: [{
      ...DEFAULT_LAYER,
      position: { ...DEFAULT_LAYER.position }
    }],
    selectedLayerIndex: DEFAULTS.selectedLayerIndex,
    isOverlayVisible: true,
    isNodeEditMode: false,
    classicMode: false,
    // Global randomization toggles for palette and color count
    randomizePalette: true,
    randomizeNumColors: true,
  });

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
      setAppState(prev => ({ ...prev, layers: value(prev.layers) }));
    } else {
      setAppState(prev => ({ ...prev, layers: value }));
    }
  }, []);

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

  // Global toggles for color randomization behavior
  const setRandomizePalette = useCallback((value) => {
    setAppState(prev => ({ ...prev, randomizePalette: !!value }));
  }, []);

  const setRandomizeNumColors = useCallback((value) => {
    setAppState(prev => ({ ...prev, randomizeNumColors: !!value }));
  }, []);

  // Function to get current app state for saving
  const getCurrentAppState = useCallback(() => {
    return { ...appState };
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
        const layerOut = {
          ...base,
          movementStyle,
          movementSpeed,
          movementAngle,
          scaleSpeed,
          position,
        };
        // Ensure arrays are arrays
        if (!Array.isArray(layerOut.colors)) layerOut.colors = [...(DEFAULT_LAYER.colors || ['#ffffff'])];
        // Ensure nodes valid or null
        if (layerOut.nodes && (!Array.isArray(layerOut.nodes) || layerOut.nodes.length < 3)) layerOut.nodes = null;
        return layerOut;
      };

      setAppState(prevState => ({
        ...prevState,
        ...newState,
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
  }, []);

  // Function to reset app state to defaults
  const resetAppState = useCallback(() => {
    setAppState({
      isFrozen: DEFAULTS.isFrozen,
      backgroundColor: DEFAULTS.backgroundColor,
      backgroundImage: { src: null, opacity: 1, fit: 'cover', enabled: false },
      globalSeed: DEFAULTS.globalSeed,
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
    });
  }, []);

  const value = {
    // Current state
    ...appState,
    
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
    setRandomizePalette,
    setRandomizeNumColors,

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
/* eslint-disable react-refresh/only-export-components */
