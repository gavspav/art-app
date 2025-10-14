import React, { useRef, useEffect, useMemo, useCallback, useState } from 'react';
import { useMobileArtState } from '../state/useMobileArtState.js';
import { clampValue, buildSmoothPath, deriveLayerPoints } from '../utils/shapeMath.js';
import { isDesktop } from '../utils/platform.js';
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

const rgbToHex = ({ r, g, b }) => {
  const clamp = (value) => Math.max(0, Math.min(255, Math.round(value)));
  return `#${[clamp(r), clamp(g), clamp(b)].map((component) => component.toString(16).padStart(2, '0')).join('')}`;
};

const samplePaletteColor = (palette, position) => {
  if (!Array.isArray(palette) || palette.length === 0) return '#ffffff';
  if (palette.length === 1) return palette[0];

  const normalized = ((position % 1) + 1) % 1;
  const scaledIndex = normalized * (palette.length - 1);
  const leftIndex = Math.floor(scaledIndex);
  const rightIndex = Math.min(palette.length - 1, Math.ceil(scaledIndex));
  const fraction = scaledIndex - leftIndex;

  if (leftIndex === rightIndex || fraction <= 0) {
    return palette[leftIndex];
  }

  const a = hexToRgb(palette[leftIndex]);
  const b = hexToRgb(palette[rightIndex]);
  const mixed = {
    r: a.r + (b.r - a.r) * fraction,
    g: a.g + (b.g - a.g) * fraction,
    b: a.b + (b.b - a.b) * fraction,
  };
  return rgbToHex(mixed);
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
    backgroundColor,
    foregroundColor,
    isNodeEditMode,
    blendMode,
    paletteIndex,
    layerColors,
    setNodes,
    setLayerOverride,
    setSelectedLayer,
  } = useMobileArtState();

  const [isDesktopMode] = useState(isDesktop());
  const [hoveredNodeIndex, setHoveredNodeIndex] = useState(null);
  const [draggingNodeIndex, setDraggingNodeIndex] = useState(null);
  const [liveNodeOverrides, setLiveNodeOverrides] = useState({});
  const [canvasAspect, setCanvasAspect] = useState(1);

  const liveNodeOverridesRef = useRef(liveNodeOverrides);
  useEffect(() => {
    liveNodeOverridesRef.current = liveNodeOverrides;
  }, [liveNodeOverrides]);

  const svgRef = useRef(null);
  const wrapperRef = useRef(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || typeof ResizeObserver === 'undefined') return undefined;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (height > 0) {
        setCanvasAspect(width / height);
      }
    });

    resizeObserver.observe(wrapper);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  const viewBoxConfig = useMemo(() => {
    const SAFE_MIN = 0.1;
    const aspect = Number.isFinite(canvasAspect) && canvasAspect > SAFE_MIN ? canvasAspect : 1;
    const base = 100;
    let halfWidth = base;
    let halfHeight = base;
    if (aspect >= 1) {
      halfWidth = base * aspect;
    } else {
      halfHeight = base / aspect;
    }

    return {
      viewBox: `${-halfWidth} ${-halfHeight} ${halfWidth * 2} ${halfHeight * 2}`,
      clipX: -halfWidth,
      clipY: -halfHeight,
      clipWidth: halfWidth * 2,
      clipHeight: halfHeight * 2,
      clipRadius: 18 * Math.min(halfWidth / base, halfHeight / base),
    };
  }, [canvasAspect]);
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
    const aspect = Number.isFinite(canvasAspect) && canvasAspect > 0 ? canvasAspect : 1;
    const scaleX = aspect >= 1 ? aspect : 1;
    const scaleY = aspect >= 1 ? 1 : 1 / aspect;
    const fillScale = Math.max(scaleX, scaleY);
    const compensateX = scaleX === 0 ? 1 : fillScale / scaleX;
    const compensateY = scaleY === 0 ? 1 : fillScale / scaleY;
    return Array.from({ length: count }).map((_, index) => {
      let layerNodes = layerNodeSets[index] || nodes;
      if (liveNodeOverrides[index]) {
        layerNodes = liveNodeOverrides[index];
      }
      const points = deriveLayerPoints(layerNodes, {
        size,
        variationShape,
        variationPosition,
        layerIndex: index,
      });
      const compensatedPoints = points.map((point) => ({
        x: point.x * compensateX,
        y: point.y * compensateY,
      }));
      const scaledPoints = compensatedPoints.map((point) => ({
        x: point.x * scaleX,
        y: point.y * scaleY,
      }));

      // Determine color: use palette if available, otherwise use foreground with tinting
      let color;
      if (paletteIndex !== null && Array.isArray(layerColors) && layerColors.length > 0) {
        const palette = layerColors;
        const layersCount = Math.max(1, count);
        const basePosition = layersCount === 1 ? 0 : Math.min(1, index / (layersCount - 1));
        const normalizedVariation = clamp01(variationColor / 0.9);
        const samplePosition = basePosition + normalizedVariation;
        color = samplePaletteColor(palette, samplePosition);
      } else {
        // No palette: use foreground with tinting based on variation
        color = tintColor(foregroundColor, variationColor, index);
      }
      
      return {
        id: `layer-${index}`,
        path: buildSmoothPath(scaledPoints, curviness),
        opacity: clamp01(1 - index / Math.max(1, count + 1)),
        color,
        nodePoints: scaledPoints,
      };
    });
  }, [layerNodeSets, nodes, layers, size, variationShape, variationPosition, variationColor, curviness, foregroundColor, paletteIndex, layerColors, liveNodeOverrides, canvasAspect]);

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

  // Node editing helpers for desktop
  const handleNodeMouseDown = useCallback((e, nodeIndex) => {
    if (!isDesktopMode || !isNodeEditMode) return;
    e.stopPropagation();
    setDraggingNodeIndex(nodeIndex);
  }, [isDesktopMode, isNodeEditMode]);

  const handleNodeMouseMove = useCallback((e) => {
    if (!isDesktopMode || !isNodeEditMode || draggingNodeIndex === null) return;
    const svg = svgRef.current;
    if (!svg) return;
    
    const rect = svg.getBoundingClientRect();
    const normalized = normalizeCoord({ x: e.clientX, y: e.clientY }, rect);
    
    const layerIndex = selectedLayerRef.current;
    const currentNodes = layerNodeSetsRef.current[layerIndex] || [];
    
    if (draggingNodeIndex >= 0 && draggingNodeIndex < currentNodes.length) {
      const updatedNodes = currentNodes.map((node, i) => 
        i === draggingNodeIndex ? { ...node, x: normalized.x, y: normalized.y } : node
      );

      setLiveNodeOverrides((prev) => ({
        ...prev,
        [layerIndex]: updatedNodes,
      }));

      if (layerIndex === 0) {
        setNodes(updatedNodes);
      } else {
        setLayerOverride(layerIndex, updatedNodes);
      }
    }
  }, [isDesktopMode, isNodeEditMode, draggingNodeIndex, setNodes, setLayerOverride]);

  const handleNodeMouseUp = useCallback(() => {
    const layerIndex = selectedLayerRef.current;
    const overrides = liveNodeOverridesRef.current[layerIndex];
    if (overrides) {
      if (layerIndex === 0) {
        setNodes(overrides);
      } else {
        setLayerOverride(layerIndex, overrides);
      }
    }
    setLiveNodeOverrides((prev) => {
      const next = { ...prev };
      delete next[layerIndex];
      return next;
    });
    setDraggingNodeIndex(null);
  }, []);

  // Attach mouse listeners for desktop node editing
  useEffect(() => {
    if (!isDesktopMode || !isNodeEditMode) return;
    
    window.addEventListener('mousemove', handleNodeMouseMove);
    window.addEventListener('mouseup', handleNodeMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleNodeMouseMove);
      window.removeEventListener('mouseup', handleNodeMouseUp);
    };
  }, [isDesktopMode, isNodeEditMode, handleNodeMouseMove, handleNodeMouseUp]);

  // Render node handles for desktop edit mode
  const renderNodeHandles = () => {
    if (!isDesktopMode || !isNodeEditMode) return null;
    
    const layerIndex = selectedLayer;
    const currentNodes = layerNodeSets[layerIndex] || [];
    const layerData = layerPaths[layerIndex];
    const nodePoints = layerData?.nodePoints || [];
    
    return currentNodes.map((node, index) => {
      const point = nodePoints[index];
      if (!point) return null;
      const isHovered = hoveredNodeIndex === index;
      const isDragging = draggingNodeIndex === index;
      
      return (
        <circle
          key={`node-${index}`}
          cx={point.x}
          cy={point.y}
          r={isDragging ? 4.5 : isHovered ? 4 : 3.5}
          fill={isDragging ? '#fbbf24' : isHovered ? '#60a5fa' : foregroundColor}
          stroke="rgba(15, 23, 42, 0.8)"
          strokeWidth="1"
          style={{ cursor: 'grab', transition: 'all 0.15s ease' }}
          onMouseDown={(e) => handleNodeMouseDown(e, index)}
          onMouseEnter={() => setHoveredNodeIndex(index)}
          onMouseLeave={() => setHoveredNodeIndex(null)}
        />
      );
    });
  };

  return (
    <div ref={wrapperRef} className="canvas-wrapper">
      <svg ref={svgRef} className="artboard" viewBox={viewBoxConfig.viewBox} preserveAspectRatio="xMidYMid slice">
        <defs>
          <clipPath id="canvas-clip">
            <rect
              x={viewBoxConfig.clipX}
              y={viewBoxConfig.clipY}
              width={viewBoxConfig.clipWidth}
              height={viewBoxConfig.clipHeight}
              rx={viewBoxConfig.clipRadius}
            />
          </clipPath>
        </defs>
        <rect
          className="artboard-bg"
          x={viewBoxConfig.clipX}
          y={viewBoxConfig.clipY}
          width={viewBoxConfig.clipWidth}
          height={viewBoxConfig.clipHeight}
          rx={viewBoxConfig.clipRadius}
          fill={backgroundColor}
        />
        <g clipPath="url(#canvas-clip)">
          {layerPaths.map((layer, index) => (
            <g key={layer.id} data-layer-index={index} data-shape-path="true">
              <path
                d={layer.path}
                fill={layer.color}
                fillOpacity={Math.max(0.18, layer.opacity)}
                stroke={index === selectedLayer ? foregroundColor : 'none'}
                strokeOpacity={index === selectedLayer ? 0.35 : 0}
                strokeWidth={index === selectedLayer ? 1.4 : 0}
                style={{ mixBlendMode: blendMode }}
              />
            </g>
          ))}
        </g>
        {renderNodeHandles()}
      </svg>
    </div>
  );
};

export default TouchCanvas;
