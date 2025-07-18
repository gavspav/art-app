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
    variation: DEFAULTS.variation,
    backgroundColor: DEFAULTS.backgroundColor,
    globalSeed: DEFAULTS.globalSeed,
    globalSpeedMultiplier: DEFAULTS.globalSpeedMultiplier,
    layers: [{
      ...DEFAULT_LAYER,
      position: { ...DEFAULT_LAYER.position }
    }],
    selectedLayerIndex: DEFAULTS.selectedLayerIndex,
    isOverlayVisible: true,
  });

  // Individual state setters for backward compatibility
  const setIsFrozen = useCallback((value) => {
    setAppState(prev => ({ ...prev, isFrozen: value }));
  }, []);

  const setVariation = useCallback((value) => {
    setAppState(prev => ({ ...prev, variation: value }));
  }, []);

  const setBackgroundColor = useCallback((value) => {
    setAppState(prev => ({ ...prev, backgroundColor: value }));
  }, []);

  const setGlobalSeed = useCallback((value) => {
    setAppState(prev => ({ ...prev, globalSeed: value }));
  }, []);

  const setGlobalSpeedMultiplier = useCallback((value) => {
    setAppState(prev => ({ ...prev, globalSpeedMultiplier: value }));
  }, []);

  const setLayers = useCallback((value) => {
    const newLayers = typeof value === 'function' ? value(appState.layers) : value;
    setAppState(prev => ({ ...prev, layers: newLayers }));
  }, [appState.layers]);

  const setSelectedLayerIndex = useCallback((value) => {
    setAppState(prev => ({ ...prev, selectedLayerIndex: value }));
  }, []);

  const setIsOverlayVisible = useCallback((value) => {
    setAppState(prev => ({ ...prev, isOverlayVisible: value }));
  }, []);

  // Function to get current app state for saving
  const getCurrentAppState = useCallback(() => {
    return { ...appState };
  }, [appState]);

  // Function to load app state
  const loadAppState = useCallback((newState) => {
    if (newState) {
      setAppState(prevState => ({
        ...prevState,
        ...newState,
        // Ensure layers have proper structure
        layers: newState.layers?.map(layer => ({
          ...layer,
          position: layer.position || { ...DEFAULT_LAYER.position }
        })) || prevState.layers
      }));
      return true;
    }
    return false;
  }, []);

  // Function to reset app state to defaults
  const resetAppState = useCallback(() => {
    setAppState({
      isFrozen: DEFAULTS.isFrozen,
      variation: DEFAULTS.variation,
      backgroundColor: DEFAULTS.backgroundColor,
      globalSeed: DEFAULTS.globalSeed,
      globalSpeedMultiplier: DEFAULTS.globalSpeedMultiplier,
      layers: [{
        ...DEFAULT_LAYER,
        position: { ...DEFAULT_LAYER.position }
      }],
      selectedLayerIndex: DEFAULTS.selectedLayerIndex,
      isOverlayVisible: true,
    });
  }, []);

  const value = {
    // Current state
    ...appState,
    
    // Individual setters for backward compatibility
    setIsFrozen,
    setVariation,
    setBackgroundColor,
    setGlobalSeed,
    setGlobalSpeedMultiplier,
    setLayers,
    setSelectedLayerIndex,
    setIsOverlayVisible,
    
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
