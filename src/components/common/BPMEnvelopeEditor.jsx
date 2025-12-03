import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';

/**
 * BPM Envelope Editor
 * 
 * A visual curve editor for BPM-synced parameter automation.
 * Features:
 * - Draggable nodes on a curve
 * - Beat division lines (1/4, 2/4, 3/4, 4/4)
 * - Preset curves (ADSR, LFO, Saw, etc.)
 * - Right-click context menu for curve generation
 */

// Preset envelope curves
export const ENVELOPE_PRESETS = {
  linear: {
    name: 'Linear',
    nodes: [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ],
  },
  easyEase: {
    name: 'Easy Ease',
    nodes: [
      { x: 0, y: 0 },
      { x: 0.25, y: 0.1 },
      { x: 0.75, y: 0.9 },
      { x: 1, y: 1 },
    ],
  },
  adsr: {
    name: 'ADSR',
    nodes: [
      { x: 0, y: 0 },
      { x: 0.1, y: 1 },
      { x: 0.3, y: 0.7 },
      { x: 0.8, y: 0.7 },
      { x: 1, y: 0 },
    ],
  },
  asr: {
    name: 'ASR',
    nodes: [
      { x: 0, y: 0 },
      { x: 0.2, y: 1 },
      { x: 0.8, y: 1 },
      { x: 1, y: 0 },
    ],
  },
  saw: {
    name: 'Saw',
    nodes: [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ],
  },
  sawReverse: {
    name: 'Saw (Rev)',
    nodes: [
      { x: 0, y: 1 },
      { x: 1, y: 0 },
    ],
  },
  triangle: {
    name: 'Triangle',
    nodes: [
      { x: 0, y: 0 },
      { x: 0.5, y: 1 },
      { x: 1, y: 0 },
    ],
  },
  square: {
    name: 'Square',
    nodes: [
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 0.5, y: 1 },
      { x: 0.5, y: 0 },
      { x: 1, y: 0 },
    ],
  },
  digital: {
    name: 'Digital',
    nodes: [
      { x: 0, y: 0 },
      { x: 0.25, y: 0 },
      { x: 0.25, y: 1 },
      { x: 0.5, y: 1 },
      { x: 0.5, y: 0 },
      { x: 0.75, y: 0 },
      { x: 0.75, y: 1 },
      { x: 1, y: 1 },
    ],
  },
  fourToFloor: {
    name: '4 To The Floor',
    nodes: [
      { x: 0, y: 1 },
      { x: 0.1, y: 0 },
      { x: 0.25, y: 1 },
      { x: 0.35, y: 0 },
      { x: 0.5, y: 1 },
      { x: 0.6, y: 0 },
      { x: 0.75, y: 1 },
      { x: 0.85, y: 0 },
      { x: 1, y: 0 },
    ],
  },
  lfo: {
    name: 'LFO (Sine)',
    nodes: (() => {
      // Generate sine wave approximation with 9 points
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        const x = i / 8;
        const y = (Math.sin(x * Math.PI * 2) + 1) / 2;
        pts.push({ x, y });
      }
      return pts;
    })(),
  },
  jaws: {
    name: 'Jaws',
    nodes: [
      { x: 0, y: 0 },
      { x: 0.125, y: 0.3 },
      { x: 0.25, y: 0 },
      { x: 0.375, y: 0.5 },
      { x: 0.5, y: 0 },
      { x: 0.625, y: 0.7 },
      { x: 0.75, y: 0 },
      { x: 0.875, y: 1 },
      { x: 1, y: 0 },
    ],
  },
  upNDown: {
    name: 'Up N Down',
    nodes: [
      { x: 0, y: 0.5 },
      { x: 0.25, y: 1 },
      { x: 0.5, y: 0.5 },
      { x: 0.75, y: 0 },
      { x: 1, y: 0.5 },
    ],
  },
  exponentialIn: {
    name: 'Exp In',
    nodes: (() => {
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        const x = i / 8;
        const y = Math.pow(x, 3);
        pts.push({ x, y });
      }
      return pts;
    })(),
  },
  exponentialOut: {
    name: 'Exp Out',
    nodes: (() => {
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        const x = i / 8;
        const y = 1 - Math.pow(1 - x, 3);
        pts.push({ x, y });
      }
      return pts;
    })(),
  },
  bounce: {
    name: 'Bounce',
    nodes: [
      { x: 0, y: 0 },
      { x: 0.2, y: 1 },
      { x: 0.4, y: 0.3 },
      { x: 0.55, y: 0.7 },
      { x: 0.7, y: 0.4 },
      { x: 0.82, y: 0.55 },
      { x: 0.92, y: 0.48 },
      { x: 1, y: 0.5 },
    ],
  },
};

// Default envelope (linear ramp)
export const DEFAULT_ENVELOPE = {
  nodes: [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ],
  preset: 'linear',
};

/**
 * Evaluate envelope at a given x position (0-1)
 * Uses linear interpolation between nodes
 */
export const evaluateEnvelope = (envelope, x) => {
  if (!envelope?.nodes || envelope.nodes.length === 0) return x;
  
  const nodes = envelope.nodes;
  if (nodes.length === 1) return nodes[0].y;
  
  // Clamp x to 0-1
  x = Math.max(0, Math.min(1, x));
  
  // Find the two nodes to interpolate between
  let left = nodes[0];
  let right = nodes[nodes.length - 1];
  
  for (let i = 0; i < nodes.length - 1; i++) {
    if (x >= nodes[i].x && x <= nodes[i + 1].x) {
      left = nodes[i];
      right = nodes[i + 1];
      break;
    }
  }
  
  // Handle edge cases
  if (x <= left.x) return left.y;
  if (x >= right.x) return right.y;
  
  // Linear interpolation
  const t = (x - left.x) / (right.x - left.x);
  return left.y + t * (right.y - left.y);
};

/**
 * BPM Envelope Editor Component
 */
const BPMEnvelopeEditor = ({ 
  envelope = DEFAULT_ENVELOPE, 
  onChange, 
  beatsPerBar = 4,
  width = 200,
  height = 80,
}) => {
  const svgRef = useRef(null);
  const [draggingNode, setDraggingNode] = useState(null);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const [showPresets, setShowPresets] = useState(false);
  
  const nodes = envelope?.nodes || DEFAULT_ENVELOPE.nodes;
  
  // Padding for the editor
  const padding = { top: 8, right: 8, bottom: 8, left: 8 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  
  // Convert node coordinates to SVG coordinates
  const nodeToSvg = useCallback((node) => ({
    x: padding.left + node.x * innerWidth,
    y: padding.top + (1 - node.y) * innerHeight,
  }), [innerWidth, innerHeight, padding]);
  
  // Convert SVG coordinates to node coordinates
  const svgToNode = useCallback((svgX, svgY) => ({
    x: Math.max(0, Math.min(1, (svgX - padding.left) / innerWidth)),
    y: Math.max(0, Math.min(1, 1 - (svgY - padding.top) / innerHeight)),
  }), [innerWidth, innerHeight, padding]);
  
  // Generate path for the curve
  const pathD = useMemo(() => {
    if (nodes.length === 0) return '';
    const pts = nodes.map(nodeToSvg);
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      d += ` L ${pts[i].x} ${pts[i].y}`;
    }
    return d;
  }, [nodes, nodeToSvg]);
  
  // Handle mouse down on node
  const handleNodeMouseDown = (e, index) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Don't allow dragging first or last node's x position
    setDraggingNode(index);
  };
  
  // Handle mouse move
  const handleMouseMove = useCallback((e) => {
    if (draggingNode === null) return;
    
    const svg = svgRef.current;
    if (!svg) return;
    
    const rect = svg.getBoundingClientRect();
    const svgX = e.clientX - rect.left;
    const svgY = e.clientY - rect.top;
    const newPos = svgToNode(svgX, svgY);
    
    // Update node position
    const newNodes = [...nodes];
    const isFirst = draggingNode === 0;
    const isLast = draggingNode === nodes.length - 1;
    
    // First and last nodes are locked to x=0 and x=1
    if (isFirst) {
      newNodes[draggingNode] = { x: 0, y: newPos.y };
    } else if (isLast) {
      newNodes[draggingNode] = { x: 1, y: newPos.y };
    } else {
      // Clamp x between neighbors
      const prevX = nodes[draggingNode - 1].x;
      const nextX = nodes[draggingNode + 1].x;
      const clampedX = Math.max(prevX + 0.01, Math.min(nextX - 0.01, newPos.x));
      newNodes[draggingNode] = { x: clampedX, y: newPos.y };
    }
    
    onChange?.({ ...envelope, nodes: newNodes, preset: null });
  }, [draggingNode, nodes, svgToNode, onChange, envelope]);
  
  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    setDraggingNode(null);
  }, []);
  
  // Add global mouse listeners when dragging
  useEffect(() => {
    if (draggingNode !== null) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [draggingNode, handleMouseMove, handleMouseUp]);
  
  // Handle double-click to add node
  const handleDoubleClick = (e) => {
    const svg = svgRef.current;
    if (!svg) return;
    
    const rect = svg.getBoundingClientRect();
    const svgX = e.clientX - rect.left;
    const svgY = e.clientY - rect.top;
    const newPos = svgToNode(svgX, svgY);
    
    // Find where to insert the new node
    let insertIndex = nodes.length;
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].x > newPos.x) {
        insertIndex = i;
        break;
      }
    }
    
    const newNodes = [...nodes];
    newNodes.splice(insertIndex, 0, newPos);
    onChange?.({ ...envelope, nodes: newNodes, preset: null });
  };
  
  // Handle right-click for context menu
  const handleContextMenu = (e) => {
    e.preventDefault();
    setContextMenuPos({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
  };
  
  // Handle node right-click to delete
  const handleNodeContextMenu = (e, index) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Don't delete first or last node
    if (index === 0 || index === nodes.length - 1) return;
    if (nodes.length <= 2) return;
    
    const newNodes = nodes.filter((_, i) => i !== index);
    onChange?.({ ...envelope, nodes: newNodes, preset: null });
  };
  
  // Apply preset
  const applyPreset = (presetKey) => {
    const preset = ENVELOPE_PRESETS[presetKey];
    if (preset) {
      onChange?.({ nodes: [...preset.nodes], preset: presetKey });
    }
    setShowContextMenu(false);
    setShowPresets(false);
  };
  
  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => {
      setShowContextMenu(false);
      setShowPresets(false);
    };
    if (showContextMenu || showPresets) {
      window.addEventListener('click', handleClick);
      return () => window.removeEventListener('click', handleClick);
    }
  }, [showContextMenu, showPresets]);
  
  // Beat division lines
  const beatLines = useMemo(() => {
    const lines = [];
    for (let i = 1; i < beatsPerBar; i++) {
      const x = padding.left + (i / beatsPerBar) * innerWidth;
      lines.push(
        <line
          key={i}
          x1={x}
          y1={padding.top}
          x2={x}
          y2={height - padding.bottom}
          stroke="rgba(255,255,255,0.15)"
          strokeWidth="1"
          strokeDasharray="2,2"
        />
      );
    }
    return lines;
  }, [beatsPerBar, innerWidth, height, padding]);
  
  return (
    <div style={{ position: 'relative' }}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        style={{ 
          background: 'rgba(0,0,0,0.3)', 
          borderRadius: 4,
          cursor: draggingNode !== null ? 'grabbing' : 'crosshair',
        }}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
      >
        {/* Background grid */}
        <rect
          x={padding.left}
          y={padding.top}
          width={innerWidth}
          height={innerHeight}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="1"
        />
        
        {/* Beat division lines */}
        {beatLines}
        
        {/* Beat labels */}
        {Array.from({ length: beatsPerBar }, (_, i) => (
          <text
            key={i}
            x={padding.left + ((i + 0.5) / beatsPerBar) * innerWidth}
            y={height - 2}
            fill="rgba(255,255,255,0.3)"
            fontSize="8"
            textAnchor="middle"
          >
            {i + 1}/{beatsPerBar}
          </text>
        ))}
        
        {/* Curve path */}
        <path
          d={pathD}
          fill="none"
          stroke="#4fc3f7"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        
        {/* Filled area under curve */}
        <path
          d={`${pathD} L ${padding.left + innerWidth} ${height - padding.bottom} L ${padding.left} ${height - padding.bottom} Z`}
          fill="rgba(79, 195, 247, 0.15)"
        />
        
        {/* Nodes */}
        {nodes.map((node, i) => {
          const pos = nodeToSvg(node);
          const isEndpoint = i === 0 || i === nodes.length - 1;
          return (
            <circle
              key={i}
              cx={pos.x}
              cy={pos.y}
              r={isEndpoint ? 5 : 4}
              fill={isEndpoint ? '#4fc3f7' : '#fff'}
              stroke={isEndpoint ? '#fff' : '#4fc3f7'}
              strokeWidth="2"
              style={{ cursor: 'grab' }}
              onMouseDown={(e) => handleNodeMouseDown(e, i)}
              onContextMenu={(e) => handleNodeContextMenu(e, i)}
            />
          );
        })}
      </svg>
      
      {/* Preset button */}
      <button
        type="button"
        className="btn-compact-secondary"
        style={{ 
          position: 'absolute', 
          top: 4, 
          right: 4, 
          fontSize: '0.6rem', 
          padding: '2px 4px',
          opacity: 0.7,
        }}
        onClick={(e) => {
          e.stopPropagation();
          setShowPresets(!showPresets);
        }}
        title="Envelope presets"
      >
        ▼
      </button>
      
      {/* Presets dropdown */}
      {showPresets && (
        <div
          style={{
            position: 'absolute',
            top: 20,
            right: 4,
            background: 'rgba(30, 30, 40, 0.98)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 4,
            padding: '4px 0',
            zIndex: 1000,
            maxHeight: 200,
            overflowY: 'auto',
            minWidth: 100,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {Object.entries(ENVELOPE_PRESETS).map(([key, preset]) => (
            <div
              key={key}
              style={{
                padding: '4px 8px',
                cursor: 'pointer',
                fontSize: '0.7rem',
                background: envelope?.preset === key ? 'rgba(79, 195, 247, 0.3)' : 'transparent',
              }}
              onClick={() => applyPreset(key)}
              onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.1)'}
              onMouseLeave={(e) => e.target.style.background = envelope?.preset === key ? 'rgba(79, 195, 247, 0.3)' : 'transparent'}
            >
              {preset.name}
            </div>
          ))}
        </div>
      )}
      
      {/* Context menu */}
      {showContextMenu && (
        <div
          style={{
            position: 'fixed',
            left: contextMenuPos.x,
            top: contextMenuPos.y,
            background: 'rgba(30, 30, 40, 0.98)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 4,
            padding: '4px 0',
            zIndex: 1001,
            minWidth: 120,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{ padding: '4px 8px', fontSize: '0.7rem', opacity: 0.6, borderBottom: '1px solid rgba(255,255,255,0.1)' }}
          >
            Presets
          </div>
          {Object.entries(ENVELOPE_PRESETS).slice(0, 8).map(([key, preset]) => (
            <div
              key={key}
              style={{
                padding: '4px 8px',
                cursor: 'pointer',
                fontSize: '0.7rem',
              }}
              onClick={() => applyPreset(key)}
              onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.1)'}
              onMouseLeave={(e) => e.target.style.background = 'transparent'}
            >
              {preset.name}
            </div>
          ))}
          <div
            style={{ padding: '4px 8px', fontSize: '0.7rem', opacity: 0.6, borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: 4 }}
          >
            Double-click to add node
          </div>
          <div
            style={{ padding: '4px 8px', fontSize: '0.7rem', opacity: 0.6 }}
          >
            Right-click node to delete
          </div>
        </div>
      )}
    </div>
  );
};

export default BPMEnvelopeEditor;
