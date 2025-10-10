import React, { createContext, useContext, useReducer, useMemo, useCallback } from 'react';
import {
  clampValue,
  clampPoint,
  createRegularPolygon,
  jitterPolygon,
} from '../utils/shapeMath.js';

const MobileArtContext = createContext(null);

const paletteOptions = [
  {
    id: 'sunset',
    name: 'Sunset Bloom',
    color: '#f97316',
  },
  {
    id: 'lagoon',
    name: 'Lagoon',
    color: '#22d3ee',
  },
  {
    id: 'neon',
    name: 'Neon Night',
    color: '#a855f7',
  },
  {
    id: 'mono',
    name: 'Monochrome',
    color: '#94a3b8',
  },
];

const defaults = {
  nodes: createRegularPolygon(6, 0.65),
  curviness: 1,
  size: 0.75,
  layers: 1,
  sides: 6,
  variationPosition: 0,
  variationShape: 0,
  variationColor: 0,
  paletteIndex: 0,
  isDrawerOpen: true,
  selectedLayer: 0,
  layerOverrides: {},
};

const sliderRanges = {
  size: { min: 0.35, max: 1.1, step: 0.01 },
  sides: { min: 3, max: 10, step: 1 },
  variationPosition: { min: 0, max: 0.6, step: 0.01 },
  variationShape: { min: 0, max: 0.8, step: 0.02 },
  variationColor: { min: 0, max: 0.9, step: 0.01 },
};

const clampNodes = (nodes) => nodes.map((node) => ({
  ...node,
  ...clampPoint(node, 0.92),
}));

const reducer = (state, action) => {
  switch (action.type) {
    case 'SET_SLIDER': {
      if (!(action.key in sliderRanges)) return state;
      const range = sliderRanges[action.key];
      const rawValue = clampValue(action.value, range.min, range.max);
      if (action.key === 'sides') {
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
      return {
        ...state,
        nodes: clampNodes(action.nodes || []),
      };
    case 'SET_LAYER_OVERRIDE':
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
      const value = clampValue(action.value, 1, 6);
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
      return {
        ...state,
        isDrawerOpen: !!action.value,
      };
    case 'TOGGLE_DRAWER':
      return {
        ...state,
        isDrawerOpen: !state.isDrawerOpen,
      };
    case 'SET_SELECTED_LAYER':
      return {
        ...state,
        selectedLayer: clampValue(action.index, 0, state.layers - 1),
      };
    case 'RESET_SHAPE':
      return {
        ...state,
        ...defaults,
        nodes: createRegularPolygon(defaults.sides, 0.65),
        paletteIndex: state.paletteIndex,
      };
    case 'RANDOMIZE_SHAPE': {
      const sides = Math.floor(clampValue(Math.random() * 5 + 4, 4, 8));
      const newNodes = clampNodes(
        jitterPolygon(createRegularPolygon(sides, clampValue(Math.random() * 0.3 + 0.5, 0.45, 0.8)), 0.12),
      );
      return {
        ...state,
        nodes: newNodes,
        curviness: 1,
        size: clampValue(Math.random() * 0.4 + 0.55, 0.4, 1.05),
        sides,
        variationPosition: clampValue(Math.random() * 0.4, 0, 0.6),
        variationShape: clampValue(Math.random() * 0.45, 0, 0.8),
        variationColor: clampValue(Math.random() * 0.6, 0, 0.9),
        layers: Math.floor(Math.random() * 3) + 1,
        paletteIndex: Math.floor(Math.random() * paletteOptions.length),
        layerOverrides: {},
        selectedLayer: 0,
      };
    }
    case 'SET_PALETTE_INDEX':
      return {
        ...state,
        paletteIndex: clampValue(
          Math.round(action.index),
          0,
          paletteOptions.length - 1,
        ),
      };
    default:
      return state;
  }
};

export const MobileArtProvider = ({ children }) => {
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

  const setPaletteIndex = useCallback((index) => {
    dispatch({ type: 'SET_PALETTE_INDEX', index });
  }, []);

  const value = useMemo(() => {
    const palette = paletteOptions[state.paletteIndex] || paletteOptions[0];
    return {
      ...state,
      palette,
      paletteOptions,
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
      setPaletteIndex,
    };
  }, [state, setSlider, setNodes, setLayers, setDrawerOpen, toggleDrawer, setLayerOverride, clearLayerOverride, setSelectedLayer, resetShape, randomizeShape, setPaletteIndex]);

  return React.createElement(MobileArtContext.Provider, { value }, children);
};

export const useMobileArtState = () => {
  const ctx = useContext(MobileArtContext);
  if (!ctx) {
    throw new Error('useMobileArtState must be used within a MobileArtProvider');
  }
  return ctx;
};
