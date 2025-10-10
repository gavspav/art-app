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
  variationPosition: 0,
  variationShape: 0,
  variationColor: 0,
  paletteIndex: 0,
  isDrawerOpen: true,
  activeNodeId: null,
  showHandles: true,
};

const sliderRanges = {
  size: { min: 0.35, max: 1.1, step: 0.01 },
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
      const value = clampValue(action.value, range.min, range.max);
      return {
        ...state,
        [action.key]: Number.parseFloat(value.toFixed(4)),
      };
    }
    case 'SET_SHOW_HANDLES':
      return {
        ...state,
        showHandles: !!action.value,
      };
    case 'SET_LAYERS': {
      const value = clampValue(action.value, 1, 6);
      return {
        ...state,
        layers: Math.round(value),
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
    case 'START_NODE_DRAG':
      return {
        ...state,
        activeNodeId: action.nodeId,
      };
    case 'UPDATE_ACTIVE_NODE': {
      if (!state.activeNodeId) return state;
      const { x, y } = clampPoint({ x: action.x, y: action.y }, 0.92);
      const nodes = state.nodes.map((node) =>
        node.id === state.activeNodeId ? { ...node, x, y } : node,
      );
      return {
        ...state,
        nodes,
      };
    }
    case 'END_NODE_DRAG':
      if (!state.activeNodeId) return state;
      return {
        ...state,
        activeNodeId: null,
      };
    case 'RESET_SHAPE':
      return {
        ...state,
        ...defaults,
        nodes: createRegularPolygon(6, 0.65),
        paletteIndex: state.paletteIndex,
        showHandles: true,
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
        variationPosition: clampValue(Math.random() * 0.4, 0, 0.6),
        variationShape: clampValue(Math.random() * 0.45, 0, 0.8),
        variationColor: clampValue(Math.random() * 0.6, 0, 0.9),
        layers: Math.floor(Math.random() * 3) + 1,
        paletteIndex: Math.floor(Math.random() * paletteOptions.length),
        showHandles: true,
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

  const setLayers = useCallback((value) => {
    dispatch({ type: 'SET_LAYERS', value });
  }, []);

  const setDrawerOpen = useCallback((value) => {
    dispatch({ type: 'SET_DRAWER_OPEN', value });
  }, []);

  const toggleDrawer = useCallback(() => {
    dispatch({ type: 'TOGGLE_DRAWER' });
  }, []);

  const startNodeDrag = useCallback((nodeId) => {
    dispatch({ type: 'START_NODE_DRAG', nodeId });
  }, []);

  const updateActiveNode = useCallback((coords) => {
    dispatch({ type: 'UPDATE_ACTIVE_NODE', ...coords });
  }, []);

  const endNodeDrag = useCallback(() => {
    dispatch({ type: 'END_NODE_DRAG' });
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

  const setShowHandles = useCallback((value) => {
    dispatch({ type: 'SET_SHOW_HANDLES', value });
  }, []);

  const value = useMemo(() => {
    const palette = paletteOptions[state.paletteIndex] || paletteOptions[0];
    return {
      ...state,
      palette,
      paletteOptions,
      setSlider,
      setLayers,
      setDrawerOpen,
      toggleDrawer,
      startNodeDrag,
      updateActiveNode,
      endNodeDrag,
      resetShape,
      randomizeShape,
      setPaletteIndex,
      setShowHandles,
    };
  }, [state, setSlider, setLayers, setDrawerOpen, toggleDrawer, startNodeDrag, updateActiveNode, endNodeDrag, resetShape, randomizeShape, setPaletteIndex, setShowHandles]);

  return React.createElement(MobileArtContext.Provider, { value }, children);
};

export const useMobileArtState = () => {
  const ctx = useContext(MobileArtContext);
  if (!ctx) {
    throw new Error('useMobileArtState must be used within a MobileArtProvider');
  }
  return ctx;
};
