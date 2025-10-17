/**
 * Global art-state context for the mobile app.
 * Centralizes every parameter that influences the rendered artwork and UI
 * controls so individual components can stay declarative and focused on their
 * presentation. Components consume this context via `useMobileArtState()`.
 */
import React, { createContext, useContext, useReducer, useMemo, useCallback } from 'react';
import {
  clampValue,
  clampPoint,
  createRegularPolygon,
  jitterPolygon,
} from '../utils/shapeMath.js';
import { blendModes } from '../constants/blendModes.js';
import { palettes } from '../constants/palettes.js';

const MobileArtContext = createContext(null);


// Default artwork configuration shown when the app loads or when a reset occurs.
const defaults = {
  nodes: createRegularPolygon(6, 0.65),
  curviness: 1,
  size: 0.75,
  layers: 1,
  sides: 6,
  variationPosition: 0,
  variationShape: 0,
  variationColor: 0,
  backgroundColor: '#0f172a',
  foregroundColor: '#38bdf8',
  isDrawerOpen: false,
  selectedLayer: 0,
  layerOverrides: {},
  isNodeEditMode: false,
  blendMode: 'normal',
  paletteIndex: null,
  layerColors: [],
  noiseAmount: 0,
  noiseSeed: 1,
  noiseFreq1: 2,
  noiseFreq2: 3,
  noiseFreq3: 4,
};

// Allowed ranges for all slider-driven parameters to keep UI input constrained.
const sliderRanges = {
  size: { min: 0.35, max: 1.1, step: 0.01 },
  sides: { min: 3, max: 10, step: 1 },
  variationPosition: { min: 0, max: 0.6, step: 0.01 },
  variationShape: { min: 0, max: 0.8, step: 0.02 },
  variationColor: { min: 0, max: 0.9, step: 0.01 },
  noiseAmount: { min: 0, max: 1, step: 0.01 },
  noiseFreq1: { min: 0.5, max: 12, step: 0.1 },
  noiseFreq2: { min: 0.5, max: 12, step: 0.1 },
  noiseFreq3: { min: 0.5, max: 30, step: 0.1 },
};

// Ensure node coordinates never stray outside the visible canvas boundary.
const clampNodes = (nodes) => nodes.map((node) => ({
  ...node,
  ...clampPoint(node, 0.85),
}));

// Reducer drives all state transitions in response to dispatched actions.
const reducer = (state, action) => {
  switch (action.type) {
    case 'SET_SLIDER': {
      // Update any slider-controlled scalar value while respecting its range.
      if (!(action.key in sliderRanges)) return state;
      const range = sliderRanges[action.key];
      const rawValue = clampValue(action.value, range.min, range.max);
      if (action.key === 'sides') {
        // Changing polygon sides regenerates the base node list and clears overrides.
        const sides = Math.round(rawValue);
        const newNodes = createRegularPolygon(sides, 0.65);
        return {
          ...state,
          sides,
          nodes: newNodes,
          layerOverrides: {},
          selectedLayer: Math.min(state.selectedLayer, state.layers - 1),
        };
      }
      return {
        ...state,
        [action.key]: Number.parseFloat(rawValue.toFixed(4)),
      };
    }
    case 'SET_NODES':
      // Replace the root layer nodes (layer 0) with clamped coordinates.
      return {
        ...state,
        nodes: clampNodes(action.nodes || []),
      };
    case 'SET_LAYER_OVERRIDE':
      // Persist per-layer node overrides for layers above the base layer.
      return {
        ...state,
        layerOverrides: {
          ...state.layerOverrides,
          [action.layerIndex]: clampNodes(action.nodes || []),
        },
      };
    case 'CLEAR_LAYER_OVERRIDE': {
      if (!(action.layerIndex in state.layerOverrides)) return state;
      const nextOverrides = { ...state.layerOverrides };
      delete nextOverrides[action.layerIndex];
      return {
        ...state,
        layerOverrides: nextOverrides,
      };
    }
    case 'SET_LAYERS': {
      // Adjust number of rendered layers and discard overrides beyond the limit.
      const value = clampValue(action.value, 1, 20);
      const nextLayerCount = Math.round(value);
      const nextOverrides = Object.fromEntries(
        Object.entries(state.layerOverrides).filter(([key]) => Number(key) < nextLayerCount),
      );
      return {
        ...state,
        layers: nextLayerCount,
        layerOverrides: nextOverrides,
        selectedLayer: Math.min(state.selectedLayer, nextLayerCount - 1),
      };
    }
    case 'SET_DRAWER_OPEN':
      // Explicitly set the controls drawer visibility.
      return {
        ...state,
        isDrawerOpen: !!action.value,
      };
    case 'TOGGLE_DRAWER':
      // Flip the drawer open/closed state.
      return {
        ...state,
        isDrawerOpen: !state.isDrawerOpen,
      };
    case 'SET_SELECTED_LAYER': {
      // Update which layer is selected for editing or deselect when negative.
      const index = Number.isFinite(action.index) ? action.index : null;
      if (index === null || index < 0) {
        return {
          ...state,
          selectedLayer: -1,
        };
      }
      return {
        ...state,
        selectedLayer: clampValue(index, 0, state.layers - 1),
      };
    }
    case 'SET_BACKGROUND_COLOR':
      // Update the background fill used behind the artwork.
      return {
        ...state,
        backgroundColor: action.color || defaults.backgroundColor,
      };
    case 'SET_FOREGROUND_COLOR':
      // Update the primary color used for shapes when no palette is active.
      return {
        ...state,
        foregroundColor: action.color || defaults.foregroundColor,
      };
    case 'SET_NODE_EDIT_MODE':
      // Enable or disable node-edit handles in desktop mode.
      return {
        ...state,
        isNodeEditMode: !!action.value,
      };
    case 'TOGGLE_NODE_EDIT_MODE':
      // Toggle node-edit handles visibility.
      return {
        ...state,
        isNodeEditMode: !state.isNodeEditMode,
      };
    case 'SET_BLEND_MODE':
      // Change the canvas blend mode applied to layers.
      return {
        ...state,
        blendMode: action.mode || defaults.blendMode,
      };
    case 'SET_PALETTE':
      // Select a palette and store its colors for layer sampling.
      return {
        ...state,
        paletteIndex: action.index,
        layerColors: action.colors || [],
      };
    case 'SET_NOISE_SEED':
      // Assign deterministic seed value for layer noise deformation.
      return {
        ...state,
        noiseSeed: Number.isFinite(action.seed) ? Math.max(1, Math.floor(action.seed)) : defaults.noiseSeed,
      };
    case 'RESET_SHAPE':
      // Restore defaults (keeping background/foreground colors) for a fresh start.
      return {
        ...state,
        ...defaults,
        nodes: createRegularPolygon(defaults.sides, 0.65),
        backgroundColor: state.backgroundColor,
        foregroundColor: state.foregroundColor,
      };
    case 'RANDOMIZE_SHAPE': {
      // Procedurally pick new geometry, colors, layers, blend mode, and noise values.
      const sides = Math.floor(clampValue(Math.random() * 5 + 4, 4, 8));
      const newNodes = clampNodes(
        jitterPolygon(createRegularPolygon(sides, clampValue(Math.random() * 0.3 + 0.5, 0.45, 0.8)), 0.12),
      );
      const randomColors = [
        '#f97316', '#22d3ee', '#a855f7', '#94a3b8', '#ef4444', '#10b981', '#f59e0b',
      ];
      const availableBlendModes = Array.isArray(blendModes) && blendModes.length > 0
        ? blendModes
        : [{ value: defaults.blendMode }];
      const blendChoice = availableBlendModes[Math.floor(Math.random() * availableBlendModes.length)]?.value
        || defaults.blendMode;

      const paletteOptions = Array.isArray(palettes) && palettes.length > 0
        ? [-1, ...palettes.map((_, index) => index)]
        : [-1];
      const paletteChoice = paletteOptions[Math.floor(Math.random() * paletteOptions.length)] ?? -1;
      let nextPaletteIndex = null;
      let nextLayerColors = [];
      if (paletteChoice !== -1) {
        const selectedPalette = palettes[paletteChoice];
        if (selectedPalette) {
          nextPaletteIndex = paletteChoice;
          nextLayerColors = Array.isArray(selectedPalette.colors) ? [...selectedPalette.colors] : [];
        }
      }

      return {
        ...state,
        nodes: newNodes,
        curviness: 1,
        size: clampValue(Math.random() * 0.4 + 0.55, 0.4, 1.05),
        sides,
        variationPosition: clampValue(Math.random() * 0.4, 0, 0.6),
        variationShape: clampValue(Math.random() * 0.45, 0, 0.8),
        variationColor: clampValue(Math.random() * 0.6, 0, 0.9),
        layers: Math.floor(Math.random() * 5) + 3,
        foregroundColor: randomColors[Math.floor(Math.random() * randomColors.length)],
        layerOverrides: {},
        selectedLayer: 0,
        blendMode: blendChoice,
        paletteIndex: nextPaletteIndex,
        layerColors: nextLayerColors,
        noiseAmount: clampValue(Math.random(), 0, 1),
        noiseSeed: Math.floor(Math.random() * 1_000_000) + 1,
        noiseFreq1: clampValue(1 + Math.random() * 5, sliderRanges.noiseFreq1.min, sliderRanges.noiseFreq1.max),
        noiseFreq2: clampValue(1 + Math.random() * 6, sliderRanges.noiseFreq2.min, sliderRanges.noiseFreq2.max),
        noiseFreq3: clampValue(2 + Math.random() * 10, sliderRanges.noiseFreq3.min, sliderRanges.noiseFreq3.max),
      };
    }
    default:
      return state;
  }
};

export const MobileArtProvider = ({ children }) => {
  // Hold the reducer state and expose memoized callbacks for consumers.
  const [state, dispatch] = useReducer(reducer, defaults);

  const setSlider = useCallback((key, value) => {
    dispatch({ type: 'SET_SLIDER', key, value });
  }, [dispatch]);

  const setNodes = useCallback((nodes) => {
    dispatch({ type: 'SET_NODES', nodes });
  }, [dispatch]);

  const setLayers = useCallback((value) => {
    dispatch({ type: 'SET_LAYERS', value });
  }, []);

  const setLayerOverride = useCallback((layerIndex, nodes) => {
    dispatch({ type: 'SET_LAYER_OVERRIDE', layerIndex, nodes });
  }, []);

  const clearLayerOverride = useCallback((layerIndex) => {
    dispatch({ type: 'CLEAR_LAYER_OVERRIDE', layerIndex });
  }, []);

  const setSelectedLayer = useCallback((index) => {
    dispatch({ type: 'SET_SELECTED_LAYER', index });
  }, []);

  const setDrawerOpen = useCallback((value) => {
    dispatch({ type: 'SET_DRAWER_OPEN', value });
  }, []);

  const toggleDrawer = useCallback(() => {
    dispatch({ type: 'TOGGLE_DRAWER' });
  }, []);

  const resetShape = useCallback(() => {
    dispatch({ type: 'RESET_SHAPE' });
  }, []);

  const randomizeShape = useCallback(() => {
    dispatch({ type: 'RANDOMIZE_SHAPE' });
  }, []);

  const setBackgroundColor = useCallback((color) => {
    dispatch({ type: 'SET_BACKGROUND_COLOR', color });
  }, []);

  const setForegroundColor = useCallback((color) => {
    dispatch({ type: 'SET_FOREGROUND_COLOR', color });
  }, []);

  const setNodeEditMode = useCallback((value) => {
    dispatch({ type: 'SET_NODE_EDIT_MODE', value });
  }, []);

  const toggleNodeEditMode = useCallback(() => {
    dispatch({ type: 'TOGGLE_NODE_EDIT_MODE' });
  }, []);

  const setBlendMode = useCallback((mode) => {
    dispatch({ type: 'SET_BLEND_MODE', mode });
  }, []);

  const setPalette = useCallback((index, colors) => {
    dispatch({ type: 'SET_PALETTE', index, colors });
  }, []);

  const setNoiseSeed = useCallback((seed) => {
    dispatch({ type: 'SET_NOISE_SEED', seed });
  }, []);

  const value = useMemo(() => {
    // Context value merges the current state snapshot with action dispatchers.
    return {
      ...state,
      setSlider,
      setNodes,
      setLayers,
      setDrawerOpen,
      toggleDrawer,
      setLayerOverride,
      clearLayerOverride,
      setSelectedLayer,
      resetShape,
      randomizeShape,
      setBackgroundColor,
      setForegroundColor,
      setNodeEditMode,
      toggleNodeEditMode,
      setBlendMode,
      setPalette,
      setNoiseSeed,
    };
  }, [state, setSlider, setNodes, setLayers, setDrawerOpen, toggleDrawer, setLayerOverride, clearLayerOverride, setSelectedLayer, resetShape, randomizeShape, setBackgroundColor, setForegroundColor, setNodeEditMode, toggleNodeEditMode, setBlendMode, setPalette, setNoiseSeed]);

  return React.createElement(MobileArtContext.Provider, { value }, children);
};

export const useMobileArtState = () => {
  // Shortcut hook for components; enforces provider usage at runtime.
  const ctx = useContext(MobileArtContext);
  if (!ctx) {
    throw new Error('useMobileArtState must be used within a MobileArtProvider');
  }
  return ctx;
};
