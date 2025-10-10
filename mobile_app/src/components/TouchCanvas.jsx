import React, { useRef, useEffect, useMemo, useCallback } from 'react';
import { useMobileArtState } from '../state/useMobileArtState.js';
import { clampValue, buildSmoothPath, deriveLayerPoints } from '../utils/shapeMath.js';
import '../styles/canvas.css';

const normalizeCoord = (client, rect) => {
  if (!rect || rect.width === 0 || rect.height === 0) {
    return { x: 0, y: 0 };
  }
  const dx = (client.x - rect.left) / rect.width;
  const dy = (client.y - rect.top) / rect.height;
  const nx = (dx - 0.5) * 2;
  const ny = (dy - 0.5) * 2;
  return { x: nx, y: ny };
};

const clamp01 = (value) => Math.max(0, Math.min(1, value));

const hexToRgb = (hex) => {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return { r: 128, g: 128, b: 128 };
  const bigint = Number.parseInt(normalized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return { r, g, b };
};

const tintColor = (baseHex, variation, layerIndex) => {
  const amount = clamp01(variation * layerIndex);
  if (amount <= 0) return baseHex;
  const base = hexToRgb(baseHex);
  const mixed = {
    r: base.r + (255 - base.r) * amount,
    g: base.g + (255 - base.g) * amount,
    b: base.b + (255 - base.b) * amount,
  };
  return `#${[mixed.r, mixed.g, mixed.b]
    .map((component) => Math.max(0, Math.min(255, Math.round(component))).toString(16).padStart(2, '0'))
    .join('')}`;
};

const TouchCanvas = () => {
  const {
    nodes,
    curviness,
    size,
    layers,
    layerOverrides,
    selectedLayer,
    variationPosition,
    variationShape,
    variationColor,
    palette,
    setNodes,
    setLayerOverride,
    setSelectedLayer,
  } = useMobileArtState();

  const svgRef = useRef(null);
  const layerNodeSets = useMemo(() => {
    const count = Math.max(1, layers);
    return Array.from({ length: count }).map((_, index) => {
      if (index === 0) return nodes;
      return layerOverrides[index] || nodes;
    });
  }, [nodes, layerOverrides, layers]);

  const layerNodeSetsRef = useRef(layerNodeSets);
  useEffect(() => {
    layerNodeSetsRef.current = layerNodeSets;
  }, [layerNodeSets]);

  const selectedLayerRef = useRef(selectedLayer);
  useEffect(() => {
    selectedLayerRef.current = selectedLayer;
  }, [selectedLayer]);

  const gestureRef = useRef({
    pointers: new Map(),
    mode: null,
    baseNodes: [],
    baseDistance: 0,
    basePinchCenter: { x: 0, y: 0 },
    nodeCentroid: { x: 0, y: 0 },
    primaryPointerId: null,
    activeLayerIndex: 0,
  });

  const layerPaths = useMemo(() => {
    if (!Array.isArray(nodes)) return [];
    const count = Math.max(1, Math.floor(layers));
    const baseColor = palette?.color || '#38bdf8';
    return Array.from({ length: count }).map((_, index) => {
      const layerNodes = layerNodeSets[index] || nodes;
      const points = deriveLayerPoints(layerNodes, {
        size,
        variationShape,
        variationPosition,
        layerIndex: index,
      });
      return {
        id: `layer-${index}`,
        path: buildSmoothPath(points, curviness),
        opacity: clamp01(1 - index / Math.max(1, count + 1)),
        color: tintColor(baseColor, variationColor, index),
      };
    });
  }, [layerNodeSets, nodes, layers, size, variationShape, variationPosition, variationColor, curviness, palette]);

  const commitNodes = useCallback((layerIndex, updatedNodes) => {
    if (layerIndex === 0) {
      setNodes(updatedNodes);
    } else {
      setLayerOverride(layerIndex, updatedNodes);
    }
  }, [setNodes, setLayerOverride]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;

    const getGesture = () => gestureRef.current;

    const ensureBaseNodes = () => {
      const gesture = getGesture();
      const layerIndex = selectedLayerRef.current;
      const sourceNodes = layerNodeSetsRef.current[layerIndex] || [];
      gesture.activeLayerIndex = layerIndex;
      gesture.baseNodes = sourceNodes.map((node) => ({ ...node }));
      return gesture.baseNodes;
    };

    const computeCentroid = (nodeList) => {
      if (!nodeList.length) return { x: 0, y: 0 };
      const sum = nodeList.reduce(
        (acc, node) => ({ x: acc.x + node.x, y: acc.y + node.y }),
        { x: 0, y: 0 },
      );
      return { x: sum.x / nodeList.length, y: sum.y / nodeList.length };
    };

    const addPointer = (event, normalized) => {
      const gesture = getGesture();
      if (!gesture.pointers.has(event.pointerId)) {
        gesture.pointers.set(event.pointerId, {
          id: event.pointerId,
          startNorm: normalized,
          currentNorm: normalized,
        });
      }
    };

    const updatePointer = (event, normalized) => {
      const gesture = getGesture();
      const pointer = gesture.pointers.get(event.pointerId);
      if (pointer) {
        pointer.currentNorm = normalized;
      }
    };

    const removePointer = (pointerId) => {
      const gesture = getGesture();
      gesture.pointers.delete(pointerId);
    };

    const applyDrag = () => {
      const gesture = getGesture();
      const pointer = gesture.primaryPointerId
        ? gesture.pointers.get(gesture.primaryPointerId)
        : Array.from(gesture.pointers.values())[0];
      if (!pointer || !gesture.baseNodes.length) return;

      const deltaX = pointer.currentNorm.x - pointer.startNorm.x;
      const deltaY = pointer.currentNorm.y - pointer.startNorm.y;
      if (Number.isNaN(deltaX) || Number.isNaN(deltaY)) return;

      const influenceRadius = 0.85;
      const influenceFalloff = influenceRadius * influenceRadius;

      const updatedNodes = gesture.baseNodes.map((node) => {
        const dx = pointer.startNorm.x - node.x;
        const dy = pointer.startNorm.y - node.y;
        const distSq = dx * dx + dy * dy;
        const influence = Math.exp(-distSq / influenceFalloff);
        return {
          ...node,
          x: node.x + deltaX * influence,
          y: node.y + deltaY * influence,
        };
      });

      commitNodes(gesture.activeLayerIndex ?? selectedLayerRef.current, updatedNodes);
    };

    const applyPinch = () => {
      const gesture = getGesture();
      if (gesture.pointers.size < 2 || !gesture.baseNodes.length || !gesture.baseDistance) {
        return;
      }
      const pointerValues = Array.from(gesture.pointers.values());
      const [a, b] = pointerValues;
      const currentDistance = Math.hypot(
        a.currentNorm.x - b.currentNorm.x,
        a.currentNorm.y - b.currentNorm.y,
      );
      if (!Number.isFinite(currentDistance) || currentDistance <= 0.0001) return;

      const scale = clampValue(currentDistance / gesture.baseDistance, 0.4, 1.8);
      const currentCenter = {
        x: (a.currentNorm.x + b.currentNorm.x) / 2,
        y: (a.currentNorm.y + b.currentNorm.y) / 2,
      };
      const translation = {
        x: currentCenter.x - gesture.basePinchCenter.x,
        y: currentCenter.y - gesture.basePinchCenter.y,
      };

      const updatedNodes = gesture.baseNodes.map((node) => {
        const offsetX = node.x - gesture.nodeCentroid.x;
        const offsetY = node.y - gesture.nodeCentroid.y;
        return {
          ...node,
          x: gesture.nodeCentroid.x + offsetX * scale + translation.x,
          y: gesture.nodeCentroid.y + offsetY * scale + translation.y,
        };
      });

      commitNodes(gesture.activeLayerIndex ?? selectedLayerRef.current, updatedNodes);
    };

    const handlePointerDown = (event) => {
      const rect = svg.getBoundingClientRect();
      const normalized = normalizeCoord({ x: event.clientX, y: event.clientY }, rect);
      const gesture = getGesture();

      const layerElement = event.target?.closest?.('[data-layer-index]');
      if (layerElement) {
        const layerIndex = Number.parseInt(layerElement.dataset.layerIndex, 10);
        if (Number.isFinite(layerIndex)) {
          setSelectedLayer(layerIndex);
          selectedLayerRef.current = clampValue(layerIndex, 0, layers - 1);
        }
      }

      const touchingShape = !!layerElement;
      if (!touchingShape && gesture.pointers.size === 0) {
        return;
      }

      addPointer(event, normalized);
      svg.setPointerCapture(event.pointerId);

      if (gesture.pointers.size === 1) {
        gesture.mode = 'drag';
        gesture.primaryPointerId = event.pointerId;
        const baseNodes = ensureBaseNodes();
        gesture.nodeCentroid = computeCentroid(baseNodes);
      } else if (gesture.pointers.size === 2) {
        gesture.mode = 'pinch';
        const baseNodes = ensureBaseNodes();
        gesture.nodeCentroid = computeCentroid(baseNodes);
        const pointerValues = Array.from(gesture.pointers.values());
        const [a, b] = pointerValues;
        gesture.baseDistance = Math.hypot(
          a.currentNorm.x - b.currentNorm.x,
          a.currentNorm.y - b.currentNorm.y,
        );
        gesture.basePinchCenter = {
          x: (a.currentNorm.x + b.currentNorm.x) / 2,
          y: (a.currentNorm.y + b.currentNorm.y) / 2,
        };
      }
    };

    const handlePointerMove = (event) => {
      const gesture = getGesture();
      if (!gesture.pointers.has(event.pointerId)) return;
      const rect = svg.getBoundingClientRect();
      const normalized = normalizeCoord({ x: event.clientX, y: event.clientY }, rect);
      updatePointer(event, normalized);

      if (gesture.mode === 'drag') {
        applyDrag();
      } else if (gesture.mode === 'pinch') {
        applyPinch();
      }
    };

    const resetGestureIfNeeded = () => {
      const gesture = getGesture();
      if (gesture.pointers.size === 0) {
        gesture.mode = null;
        gesture.baseNodes = [];
        gesture.baseDistance = 0;
        gesture.primaryPointerId = null;
      }
    };

    const handlePointerEnd = (event) => {
      if (!getGesture().pointers.has(event.pointerId)) return;
      svg.releasePointerCapture(event.pointerId);
      removePointer(event.pointerId);

      const gesture = getGesture();
      if (gesture.pointers.size === 1) {
        gesture.mode = 'drag';
        const remainingPointer = Array.from(gesture.pointers.values())[0];
        gesture.primaryPointerId = remainingPointer.id;
        ensureBaseNodes();
        gesture.nodeCentroid = computeCentroid(gesture.baseNodes);
        remainingPointer.startNorm = remainingPointer.currentNorm;
      } else if (gesture.pointers.size < 1) {
        resetGestureIfNeeded();
      } else if (gesture.pointers.size === 2) {
        // Reinitialize pinch baseline with the remaining two pointers
        const pointerValues = Array.from(gesture.pointers.values());
        const [a, b] = pointerValues;
        ensureBaseNodes();
        gesture.nodeCentroid = computeCentroid(gesture.baseNodes);
        gesture.baseDistance = Math.hypot(
          a.currentNorm.x - b.currentNorm.x,
          a.currentNorm.y - b.currentNorm.y,
        );
        gesture.basePinchCenter = {
          x: (a.currentNorm.x + b.currentNorm.x) / 2,
          y: (a.currentNorm.y + b.currentNorm.y) / 2,
        };
      }
    };

    svg.addEventListener('pointerdown', handlePointerDown);
    svg.addEventListener('pointermove', handlePointerMove);
    svg.addEventListener('pointerup', handlePointerEnd);
    svg.addEventListener('pointercancel', handlePointerEnd);

    return () => {
      svg.removeEventListener('pointerdown', handlePointerDown);
      svg.removeEventListener('pointermove', handlePointerMove);
      svg.removeEventListener('pointerup', handlePointerEnd);
      svg.removeEventListener('pointercancel', handlePointerEnd);
    };
  }, [commitNodes, setSelectedLayer, layers]);

  return (
    <div className="canvas-wrapper">
      <svg ref={svgRef} className="artboard" viewBox="-100 -100 200 200">
        <rect className="artboard-bg" x="-100" y="-100" width="200" height="200" rx="18" />
        {layerPaths.map((layer, index) => (
          <g key={layer.id} data-layer-index={index} data-shape-path="true">
            <path
              d={layer.path}
              fill={layer.color}
              fillOpacity={Math.max(0.18, layer.opacity)}
              stroke={index === selectedLayer ? palette?.color || '#e2e8f0' : 'none'}
              strokeOpacity={index === selectedLayer ? 0.35 : 0}
              strokeWidth={index === selectedLayer ? 1.4 : 0}
            />
          </g>
        ))}
      </svg>
    </div>
  );
};

export default TouchCanvas;
