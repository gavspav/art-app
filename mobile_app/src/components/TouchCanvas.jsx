import React, { useRef, useEffect, useMemo } from 'react';
import { useMobileArtState } from '../state/useMobileArtState.js';
import { buildSmoothPath, deriveLayerPoints } from '../utils/shapeMath.js';
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
    variationPosition,
    variationShape,
    variationColor,
    palette,
    showHandles,
    activeNodeId,
    startNodeDrag,
    updateActiveNode,
    endNodeDrag,
    setShowHandles,
  } = useMobileArtState();

  const svgRef = useRef(null);
  const activePointer = useRef(null);

  const basePoints = useMemo(() => {
    return deriveLayerPoints(nodes, {
      size,
      variationShape: 0,
      variationPosition: 0,
      layerIndex: 0,
    });
  }, [nodes, size]);

  const basePath = useMemo(() => {
    const points = basePoints;
    return buildSmoothPath(points, curviness);
  }, [basePoints, curviness]);

  const layerPaths = useMemo(() => {
    if (!Array.isArray(nodes)) return [];
    const count = Math.max(1, Math.floor(layers));
    const baseColor = palette?.color || '#38bdf8';
    return Array.from({ length: count }).map((_, index) => {
      const points = deriveLayerPoints(nodes, {
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
  }, [nodes, layers, size, variationShape, variationPosition, variationColor, curviness, palette]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;

    const handlePointerDown = (event) => {
      const rect = svg.getBoundingClientRect();
      const current = normalizeCoord({ x: event.clientX, y: event.clientY }, rect);

      const hitRadius = 0.11;
      const hitNode = nodes.find((node) => {
        const dx = node.x - current.x;
        const dy = node.y - current.y;
        return Math.hypot(dx, dy) <= hitRadius;
      });

      if (hitNode) {
        event.preventDefault();
        activePointer.current = event.pointerId;
        svg.setPointerCapture(event.pointerId);
        startNodeDrag(hitNode.id);
        setShowHandles(true);
        return;
      }

      const pathElement = event.target?.closest?.('[data-shape-path="true"]');
      if (pathElement) {
        setShowHandles(true);
        return;
      }

      setShowHandles(false);
      endNodeDrag();
    };

    const handlePointerMove = (event) => {
      if (activePointer.current !== event.pointerId) return;
      const rect = svg.getBoundingClientRect();
      const { x, y } = normalizeCoord({ x: event.clientX, y: event.clientY }, rect);
      updateActiveNode({ x, y });
    };

    const handlePointerUp = (event) => {
      if (activePointer.current !== event.pointerId) return;
      event.preventDefault();
      svg.releasePointerCapture(event.pointerId);
      activePointer.current = null;
      endNodeDrag();
    };

    const handlePointerCancel = (event) => {
      if (activePointer.current !== event.pointerId) return;
      svg.releasePointerCapture(event.pointerId);
      activePointer.current = null;
      endNodeDrag();
    };

    svg.addEventListener('pointerdown', handlePointerDown);
    svg.addEventListener('pointermove', handlePointerMove);
    svg.addEventListener('pointerup', handlePointerUp);
    svg.addEventListener('pointercancel', handlePointerCancel);

    return () => {
      svg.removeEventListener('pointerdown', handlePointerDown);
      svg.removeEventListener('pointermove', handlePointerMove);
      svg.removeEventListener('pointerup', handlePointerUp);
      svg.removeEventListener('pointercancel', handlePointerCancel);
    };
  }, [nodes, startNodeDrag, updateActiveNode, endNodeDrag, setShowHandles]);

  return (
    <div className="canvas-wrapper">
      <svg ref={svgRef} className="artboard" viewBox="-100 -100 200 200">
        <rect className="artboard-bg" x="-100" y="-100" width="200" height="200" rx="18" />
        {layerPaths.map((layer, index) => (
          <path
            key={layer.id}
            data-shape-path="true"
            d={layer.path}
            fill={layer.color}
            fillOpacity={Math.max(0.18, layer.opacity)}
            stroke={layer.color}
            strokeOpacity={0.28}
            strokeWidth={index === 0 ? 0.9 : 0.5}
          />
        ))}
        <path className="base-shape" d={basePath} stroke={palette?.color || '#e2e8f0'} />
        {showHandles &&
          nodes.map((node) => (
            <circle
              key={node.id}
              className={`node-handle${node.id === activeNodeId ? ' active' : ''}`}
              cx={node.x * 100}
              cy={node.y * 100}
              r={node.id === activeNodeId ? 6 : 5}
            />
          ))}
      </svg>
    </div>
  );
};

export default TouchCanvas;
