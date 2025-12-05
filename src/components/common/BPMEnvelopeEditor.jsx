import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';

/**
 * BPM Envelope Editor
 * 
 * A visual curve editor for BPM-synced parameter automation.
 * Features:
 * - Draggable nodes on a curve
 * - Beat division lines (1/4, 2/4, 3/4, 4/4)
 * - Preset curves (ADSR, LFO, Saw, etc.)
 * - Per-segment curve types (linear, easeIn, easeOut, etc.)
 * - Right-click context menu for segment curve type selection
 */

// Available curve types for segments
export const CURVE_TYPES = {
  linear: { name: 'Linear', icon: '/' },
  easeIn: { name: 'Ease In', icon: '⌒' },
  easeOut: { name: 'Ease Out', icon: '⌓' },
  easeInOut: { name: 'Ease In-Out', icon: '∿' },
  step: { name: 'Step (Mid)', icon: '⌐' },
  stepStart: { name: 'Step (Start)', icon: '⌐' },
  stepEnd: { name: 'Step (End)', icon: '⌐' },
};

// Easing functions for curve interpolation
// tension: 0 = very gentle, 0.5 = default, 1 = very steep
const easingFunctions = {
  linear: (t, tension = 0.5) => t,
  easeIn: (t, tension = 0.5) => {
    const exp = 1 + tension * 3; // 1 to 4
    return Math.pow(t, exp);
  },
  easeOut: (t, tension = 0.5) => {
    const exp = 1 + tension * 3; // 1 to 4
    return 1 - Math.pow(1 - t, exp);
  },
  easeInOut: (t, tension = 0.5) => {
    const exp = 1 + tension * 3; // 1 to 4
    if (t < 0.5) {
      return Math.pow(2, exp - 1) * Math.pow(t, exp);
    } else {
      return 1 - Math.pow(-2 * t + 2, exp) / 2;
    }
  },
  step: (t, tension = 0.5) => t < tension ? 0 : 1, // tension controls step position
  stepStart: (t) => t <= 0 ? 0 : 1,
  stepEnd: (t) => t >= 1 ? 1 : 0,
};

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
      { x: 0, y: 0, curve: 'easeInOut' },
      { x: 1, y: 1 },
    ],
  },
  adsr: {
    name: 'ADSR',
    nodes: [
      { x: 0, y: 0, curve: 'easeOut' },
      { x: 0.1, y: 1, curve: 'easeIn' },
      { x: 0.3, y: 0.7, curve: 'linear' },
      { x: 0.8, y: 0.7, curve: 'easeIn' },
      { x: 1, y: 0 },
    ],
  },
  asr: {
    name: 'ASR',
    nodes: [
      { x: 0, y: 0, curve: 'easeOut' },
      { x: 0.2, y: 1, curve: 'linear' },
      { x: 0.8, y: 1, curve: 'easeIn' },
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
      { x: 0, y: 0, curve: 'stepStart' },
      { x: 0.5, y: 1, curve: 'stepStart' },
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
 * Supports per-segment curve types for different interpolation styles
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
  let leftIndex = 0;
  
  for (let i = 0; i < nodes.length - 1; i++) {
    if (x >= nodes[i].x && x <= nodes[i + 1].x) {
      left = nodes[i];
      right = nodes[i + 1];
      leftIndex = i;
      break;
    }
  }
  
  // Handle edge cases
  if (x <= left.x) return left.y;
  if (x >= right.x) return right.y;
  
  // Get curve type and tension for this segment (stored on left node)
  const curveType = left.curve || 'linear';
  const tension = left.tension !== undefined ? left.tension : 0.5;
  const easingFn = easingFunctions[curveType] || easingFunctions.linear;
  
  // Calculate normalized position within segment (0-1)
  const t = (x - left.x) / (right.x - left.x);
  
  // Apply easing function with tension and interpolate
  const easedT = easingFn(t, tension);
  return left.y + easedT * (right.y - left.y);
};

/**
 * Find which segment index contains the given x position
 */
export const findSegmentAtX = (nodes, x) => {
  if (!nodes || nodes.length < 2) return -1;
  x = Math.max(0, Math.min(1, x));
  
  for (let i = 0; i < nodes.length - 1; i++) {
    if (x >= nodes[i].x && x <= nodes[i + 1].x) {
      return i;
    }
  }
  return nodes.length - 2; // Last segment
};

/**
 * BPM Envelope Editor Component
 */
const BPMEnvelopeEditor = ({ 
  envelope = DEFAULT_ENVELOPE, 
  onChange, 
  beatsPerBar = 4,
  width = '100%',
  height = 140,
  playheadPosition = null, // 0-1 value showing current position in envelope
}) => {
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(1);
  
  // Measure container width for responsive sizing
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    const updateWidth = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width > 0) {
        setContainerWidth(rect.width);
      }
    };
    
    updateWidth();
    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);
  
  // Use container width or explicit width
  const effectiveWidth = typeof width === 'number' ? width : containerWidth;
  const [draggingNode, setDraggingNode] = useState(null);
  const [draggingSegment, setDraggingSegment] = useState(null); // For dragging curve tension
  const [dragStartY, setDragStartY] = useState(null); // Y position when drag started
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [showCurveMenu, setShowCurveMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const [showPresets, setShowPresets] = useState(false);
  const [selectedSegment, setSelectedSegment] = useState(null); // Index of segment for curve type editing
  
  const [localEnvelope, setLocalEnvelope] = useState(envelope || DEFAULT_ENVELOPE);
  // Keep local envelope in sync with external changes
  useEffect(() => {
    setLocalEnvelope(envelope || DEFAULT_ENVELOPE);
  }, [envelope]);

  const nodes = localEnvelope?.nodes || DEFAULT_ENVELOPE.nodes;
  const [selectedNode, setSelectedNode] = useState(null);
  const [addNodeMode, setAddNodeMode] = useState(false);
  
  // Padding for the editor - more space for labels
  const padding = { top: 16, right: 16, bottom: 24, left: 16 };
  const innerWidth = Math.max(1, effectiveWidth - padding.left - padding.right);
  const innerHeight = Math.max(1, height - padding.top - padding.bottom);
  
  // Find segment at SVG coordinates
  const findSegmentAtSvgX = useCallback((svgX) => {
    const nodeX = (svgX - padding.left) / innerWidth;
    return findSegmentAtX(nodes, nodeX);
  }, [nodes, padding.left, innerWidth]);
  
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
  
  // Generate path for the curve with per-segment curve types
  const pathD = useMemo(() => {
    if (nodes.length === 0) return '';
    const pts = nodes.map(nodeToSvg);
    let d = `M ${pts[0].x} ${pts[0].y}`;
    
    for (let i = 0; i < nodes.length - 1; i++) {
      const curveType = nodes[i].curve || 'linear';
      const tension = nodes[i].tension !== undefined ? nodes[i].tension : 0.5;
      const p0 = pts[i];
      const p1 = pts[i + 1];
      
      if (curveType === 'linear') {
        d += ` L ${p1.x} ${p1.y}`;
      } else if (curveType === 'step') {
        // Step position controlled by tension (0-1)
        const stepX = p0.x + (p1.x - p0.x) * tension;
        d += ` L ${stepX} ${p0.y} L ${stepX} ${p1.y} L ${p1.x} ${p1.y}`;
      } else if (curveType === 'stepStart') {
        // Immediate step at start
        d += ` L ${p0.x} ${p1.y} L ${p1.x} ${p1.y}`;
      } else if (curveType === 'stepEnd') {
        // Step at end
        d += ` L ${p1.x} ${p0.y} L ${p1.x} ${p1.y}`;
      } else {
        // Bezier curves for easing - tension affects control point positions
        const dx = p1.x - p0.x;
        const dy = p1.y - p0.y;
        // tension 0 = gentle curve, 0.5 = default, 1 = steep curve
        const cpOffset = 0.1 + tension * 0.8; // 0.1 to 0.9
        let cp1x, cp1y, cp2x, cp2y;
        
        if (curveType === 'easeIn') {
          // Control points for ease-in (slow start)
          cp1x = p0.x + dx * cpOffset;
          cp1y = p0.y;
          cp2x = p0.x + dx * 1.0;
          cp2y = p1.y;
        } else if (curveType === 'easeOut') {
          // Control points for ease-out (slow end)
          cp1x = p0.x;
          cp1y = p1.y;
          cp2x = p0.x + dx * (1 - cpOffset);
          cp2y = p1.y;
        } else if (curveType === 'easeInOut') {
          // Control points for ease-in-out (S-curve)
          cp1x = p0.x + dx * cpOffset;
          cp1y = p0.y;
          cp2x = p0.x + dx * (1 - cpOffset);
          cp2y = p1.y;
        } else {
          // Fallback to linear
          d += ` L ${p1.x} ${p1.y}`;
          continue;
        }
        d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p1.x} ${p1.y}`;
      }
    }
    return d;
  }, [nodes, nodeToSvg]);
  
  // Handle mouse down on node
  const handleNodeMouseDown = (e, index) => {
    e.preventDefault();
    e.stopPropagation();
    
    console.debug('[Envelope] node mousedown', { index });
    setSelectedNode(index);
    setDraggingNode(index);
  };
  
  // Handle click on SVG background
  const handleSvgClick = (e) => {
    console.debug('[Envelope] svg click', { addNodeMode, target: e.target.tagName });
    if (addNodeMode) {
      addNodeAtPosition(e);
    } else if (e.target === svgRef.current) {
      setSelectedNode(null);
    }
  };
  
  // Delete selected node
  const deleteSelectedNode = () => {
    if (selectedNode === null) return;
    if (selectedNode === 0 || selectedNode === nodes.length - 1) return;
    if (nodes.length <= 2) return;
    
    const newNodes = nodes.filter((_, i) => i !== selectedNode);
    const next = { ...localEnvelope, nodes: newNodes, preset: null };
    setLocalEnvelope(next);
    onChange?.(next);
    setSelectedNode(null);
  };
  
  // Add node at click position (used when addNodeMode is true)
  const addNodeAtPosition = (e) => {
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
    console.debug('[Envelope] add node', { newPos, insertIndex, beforeCount: nodes.length, afterCount: newNodes.length });
    const next = { ...localEnvelope, nodes: newNodes, preset: null };
    setLocalEnvelope(next);
    onChange?.(next);
    setAddNodeMode(false);
  };
  
  // Handle mouse move for node dragging
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
      newNodes[draggingNode] = { ...nodes[draggingNode], x: 0, y: newPos.y };
    } else if (isLast) {
      newNodes[draggingNode] = { ...nodes[draggingNode], x: 1, y: newPos.y };
    } else {
      // Clamp x between neighbors
      const prevX = nodes[draggingNode - 1].x;
      const nextX = nodes[draggingNode + 1].x;
      const clampedX = Math.max(prevX + 0.01, Math.min(nextX - 0.01, newPos.x));
      newNodes[draggingNode] = { ...nodes[draggingNode], x: clampedX, y: newPos.y };
    }
    
    const next = { ...localEnvelope, nodes: newNodes, preset: null };
    setLocalEnvelope(next);
    onChange?.(next);
  }, [draggingNode, nodes, svgToNode, onChange, localEnvelope]);
  
  // Handle mouse move for segment tension dragging
  const handleSegmentMouseMove = useCallback((e) => {
    if (draggingSegment === null || dragStartY === null) return;
    
    const svg = svgRef.current;
    if (!svg) return;
    
    const rect = svg.getBoundingClientRect();
    const currentY = e.clientY - rect.top;
    
    // Calculate tension change based on vertical drag
    // Dragging up = more tension (steeper), dragging down = less tension (gentler)
    const deltaY = dragStartY - currentY;
    const tensionChange = deltaY / innerHeight; // Normalize by height
    
    const currentTension = nodes[draggingSegment].tension !== undefined ? nodes[draggingSegment].tension : 0.5;
    const newTension = Math.max(0, Math.min(1, currentTension + tensionChange * 2));
    
    // Update the node's tension
    const newNodes = nodes.map((node, i) => {
      if (i === draggingSegment) {
        return { ...node, tension: newTension };
      }
      return { ...node };
    });
    
    const next = { ...localEnvelope, nodes: newNodes, preset: null };
    setLocalEnvelope(next);
    onChange?.(next);
    
    // Update drag start for continuous dragging
    setDragStartY(currentY);
  }, [draggingSegment, dragStartY, nodes, innerHeight, onChange, localEnvelope]);
  
  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    setDraggingNode(null);
    setDraggingSegment(null);
    setDragStartY(null);
  }, []);
  
  // Start dragging segment tension (called on mousedown on curve)
  const handleCurveMouseDown = useCallback((e) => {
    // Don't start segment drag if we're in add mode or clicking a node
    if (addNodeMode) return;
    
    const svg = svgRef.current;
    if (!svg) return;
    
    const rect = svg.getBoundingClientRect();
    const svgX = e.clientX - rect.left;
    const svgY = e.clientY - rect.top;
    
    const segmentIndex = findSegmentAtSvgX(svgX);
    const curveType = nodes[segmentIndex]?.curve || 'linear';
    
    // Only allow tension dragging for non-linear curves
    if (curveType !== 'linear' && curveType !== 'stepStart' && curveType !== 'stepEnd') {
      e.preventDefault();
      e.stopPropagation();
      setDraggingSegment(segmentIndex);
      setDragStartY(svgY);
      setSelectedSegment(segmentIndex);
    }
  }, [addNodeMode, findSegmentAtSvgX, nodes]);
  
  // Add global mouse listeners when dragging node
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
  
  // Add global mouse listeners when dragging segment tension
  useEffect(() => {
    if (draggingSegment !== null) {
      window.addEventListener('mousemove', handleSegmentMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleSegmentMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [draggingSegment, handleSegmentMouseMove, handleMouseUp]);
  
  // Handle double-click to add node
  const handleDoubleClick = (e) => {
    const svg = svgRef.current;
    if (!svg) return;
    console.debug('[Envelope] svg double-click');
    
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
    const next = { ...localEnvelope, nodes: newNodes, preset: null };
    setLocalEnvelope(next);
    onChange?.(next);
  };
  
  // Handle node double-click to delete
  const handleNodeDoubleClick = (e, index) => {
    e.preventDefault();
    e.stopPropagation();
    console.debug('[Envelope] node double-click', { index });
    
    // Don't delete first or last node
    if (index === 0 || index === nodes.length - 1) return;
    if (nodes.length <= 2) return;
    
    const newNodes = nodes.filter((_, i) => i !== index);
    const next = { ...localEnvelope, nodes: newNodes, preset: null };
    setLocalEnvelope(next);
    onChange?.(next);
    setSelectedNode(null);
  };

  // Handle right-click on SVG background for curve type menu
  const handleContextMenu = (e) => {
    e.preventDefault();
    
    // Get SVG-relative coordinates
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const svgX = e.clientX - rect.left;
    
    // Find which segment was clicked
    const segmentIndex = findSegmentAtSvgX(svgX);
    console.debug('[Envelope] curve context menu', { segmentIndex, svgX });
    
    if (segmentIndex >= 0) {
      setSelectedSegment(segmentIndex);
      setContextMenuPos({ x: e.clientX, y: e.clientY });
      setShowCurveMenu(true);
      setShowContextMenu(false);
    }
  };
  
  // Handle node right-click to show node menu
  const handleNodeContextMenu = (e, index) => {
    e.preventDefault();
    e.stopPropagation();
    
    console.debug('[Envelope] node context menu', { index });
    setSelectedNode(index);
    setContextMenuPos({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
    setShowCurveMenu(false);
  };
  
  // Apply curve type to selected segment
  const applySegmentCurveType = (curveType) => {
    if (selectedSegment === null || selectedSegment < 0) return;
    console.debug('[Envelope] apply curve type', { selectedSegment, curveType });
    
    const newNodes = nodes.map((node, i) => {
      if (i === selectedSegment) {
        return { ...node, curve: curveType };
      }
      return { ...node };
    });
    
    const next = { ...localEnvelope, nodes: newNodes, preset: null };
    setLocalEnvelope(next);
    onChange?.(next);
    setShowCurveMenu(false);
    setSelectedSegment(null);
  };
  
  // Apply preset
  const applyPreset = (presetKey) => {
    console.debug('[Envelope] apply preset', { presetKey });
    const preset = ENVELOPE_PRESETS[presetKey];
    if (preset) {
      // Deep copy the nodes to prevent mutation of preset constant
      const newNodes = preset.nodes.map(node => ({ ...node }));
      const next = { nodes: newNodes, preset: presetKey };
      console.debug('[Envelope] preset applied', { next, onChange: !!onChange });
      setLocalEnvelope(next);
      onChange?.(next);
    }
    setShowContextMenu(false);
    setShowPresets(false);
  };
  
  // Close context menu on click outside - use a longer delay to allow menu clicks to register
  useEffect(() => {
    if (!showContextMenu && !showPresets && !showCurveMenu) return;

    const handleClick = (e) => {
      // Check if click is inside menu or on preset button
      const menu = e.target.closest('.bpm-context-menu');
      const presetButton = e.target.closest('button');
      const isPresetButton = presetButton && presetButton.textContent.includes('Presets');
      
      if (menu || isPresetButton) {
        console.debug('[Envelope] click inside menu or preset button, keeping open');
        return;
      }
      
      console.debug('[Envelope] click outside menu, closing');
      setShowContextMenu(false);
      setShowPresets(false);
      setShowCurveMenu(false);
      setSelectedSegment(null);
    };

    // Delay adding listener to avoid immediate close
    const timerId = setTimeout(() => {
      document.addEventListener('mousedown', handleClick);
    }, 100);

    return () => {
      clearTimeout(timerId);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [showContextMenu, showPresets, showCurveMenu]);
  
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
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <svg
        ref={svgRef}
        width={effectiveWidth}
        height={height}
        style={{ 
          background: 'rgba(0,0,0,0.5)', 
          borderRadius: 8,
          cursor: addNodeMode ? 'copy' : (draggingNode !== null ? 'grabbing' : (draggingSegment !== null ? 'ns-resize' : 'default')),
          display: 'block',
          border: addNodeMode ? '2px solid #4fc3f7' : '1px solid rgba(255,255,255,0.1)',
        }}
        onClick={handleSvgClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
      >
        {/* Background grid - capture clicks */}
        <rect
          x={padding.left}
          y={padding.top}
          width={innerWidth}
          height={innerHeight}
          fill="transparent"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="1"
          style={{ pointerEvents: 'all' }}
        />
        
        {/* Beat division lines - ignore clicks */}
        <g style={{ pointerEvents: 'none' }}>
          {beatLines}
        </g>
        
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
        
        {/* Segment highlight when selecting curve type */}
        {selectedSegment !== null && nodes.length > selectedSegment + 1 && (() => {
          const p0 = nodeToSvg(nodes[selectedSegment]);
          const p1 = nodeToSvg(nodes[selectedSegment + 1]);
          return (
            <line
              x1={p0.x}
              y1={p0.y}
              x2={p1.x}
              y2={p1.y}
              stroke="#ff5722"
              strokeWidth="6"
              strokeLinecap="round"
              opacity="0.5"
              style={{ pointerEvents: 'none' }}
            />
          );
        })()}
        
        {/* Invisible wider path for dragging curve tension */}
        <path
          d={pathD}
          fill="none"
          stroke="transparent"
          strokeWidth="16"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ 
            pointerEvents: 'stroke', 
            cursor: draggingSegment !== null ? 'ns-resize' : 'pointer',
          }}
          onMouseDown={handleCurveMouseDown}
        />
        
        {/* Visible curve path */}
        <path
          d={pathD}
          fill="none"
          stroke="#4fc3f7"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ pointerEvents: 'none' }}
        />
        
        {/* Filled area under curve - ignore clicks */}
        <path
          d={`${pathD} L ${padding.left + innerWidth} ${height - padding.bottom} L ${padding.left} ${height - padding.bottom} Z`}
          fill="rgba(79, 195, 247, 0.15)"
          style={{ pointerEvents: 'none' }}
        />

        {/* Playhead indicator */}
        {playheadPosition !== null && playheadPosition >= 0 && playheadPosition <= 1 && (
          <>
            <line
              x1={padding.left + playheadPosition * innerWidth}
              y1={padding.top}
              x2={padding.left + playheadPosition * innerWidth}
              y2={height - padding.bottom}
              stroke="#ff5722"
              strokeWidth="2"
              strokeLinecap="round"
              style={{ pointerEvents: 'none' }}
            />
            {/* Playhead dot on curve */}
            <circle
              cx={padding.left + playheadPosition * innerWidth}
              cy={padding.top + (1 - evaluateEnvelope(localEnvelope, playheadPosition)) * innerHeight}
              r={5}
              fill="#ff5722"
              stroke="#fff"
              strokeWidth="1.5"
              style={{ pointerEvents: 'none' }}
            />
          </>
        )}
        
        {/* Nodes - larger hit areas */}
        {nodes.map((node, i) => {
          const pos = nodeToSvg(node);
          const isEndpoint = i === 0 || i === nodes.length - 1;
          const isSelected = selectedNode === i;
          return (
            <g key={i}>
              {/* Invisible larger hit area */}
              <circle
                cx={pos.x}
                cy={pos.y}
                r={12}
                fill="transparent"
                style={{ cursor: 'grab', pointerEvents: 'all' }}
                onMouseDown={(e) => handleNodeMouseDown(e, i)}
                onContextMenu={(e) => handleNodeContextMenu(e, i)}
                onDoubleClick={(e) => handleNodeDoubleClick(e, i)}
              />
              {/* Visible node */}
              <circle
                cx={pos.x}
                cy={pos.y}
                r={isSelected ? 7 : (isEndpoint ? 6 : 5)}
                fill={isSelected ? '#ff5722' : (isEndpoint ? '#4fc3f7' : '#fff')}
                stroke={isSelected ? '#fff' : (isEndpoint ? '#fff' : '#4fc3f7')}
                strokeWidth="2"
                style={{ cursor: 'grab', pointerEvents: 'none' }}
              />
            </g>
          );
        })}
      </svg>
      
      {/* Control buttons */}
      <div style={{ 
        position: 'absolute', 
        top: 4, 
        right: 4, 
        display: 'flex',
        gap: '4px',
        zIndex: 10,
      }}>
        {/* Add node button */}
        <button
          type="button"
          className="btn-compact-secondary"
          style={{ 
            fontSize: '0.7rem', 
            padding: '3px 8px',
            background: addNodeMode ? 'rgba(79, 195, 247, 0.6)' : 'rgba(255,255,255,0.15)',
          }}
          onClick={(e) => {
            e.stopPropagation();
            setAddNodeMode(!addNodeMode);
          }}
          title="Click to enable, then click on curve to add node"
        >
          + Add
        </button>
        {/* Delete selected node button */}
        {selectedNode !== null && selectedNode !== 0 && selectedNode !== nodes.length - 1 && (
          <button
            type="button"
            className="btn-compact-secondary"
            style={{ 
              fontSize: '0.7rem', 
              padding: '3px 8px',
              background: 'rgba(244, 67, 54, 0.6)',
            }}
            onClick={(e) => {
              e.stopPropagation();
              deleteSelectedNode();
            }}
            title="Delete selected node"
          >
            Delete
          </button>
        )}
        {/* Preset dropdown button */}
        <button
          type="button"
          className="btn-compact-secondary"
          style={{ 
            fontSize: '0.7rem', 
            padding: '3px 8px',
            background: 'rgba(255,255,255,0.15)',
          }}
          onClick={(e) => {
            e.stopPropagation();
            setShowPresets(!showPresets);
          }}
          title="Envelope presets"
        >
          Presets ▼
        </button>
      </div>
      
      {/* Presets dropdown */}
      {showPresets && (
        <div
          className="bpm-context-menu"
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
      
      {/* Node context menu (right-click on node) */}
      {showContextMenu && (
        <div
          className="bpm-context-menu"
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
            Node Options
          </div>
          {selectedNode !== null && selectedNode !== 0 && selectedNode !== nodes.length - 1 && (
             <div
              style={{ 
                padding: '4px 8px', 
                fontSize: '0.7rem', 
                cursor: 'pointer',
                color: '#ff5722',
              }}
              onClick={() => {
                deleteSelectedNode();
                setShowContextMenu(false);
              }}
              onMouseEnter={(e) => e.target.style.background = 'rgba(244, 67, 54, 0.2)'}
              onMouseLeave={(e) => e.target.style.background = 'transparent'}
            >
              Delete Node
            </div>
          )}
          <div
            style={{ padding: '4px 8px', fontSize: '0.7rem', opacity: 0.6, borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: 4 }}
          >
            Tip: Double-click to add/delete
          </div>
        </div>
      )}
      
      {/* Curve type context menu (right-click on curve/background) */}
      {showCurveMenu && selectedSegment !== null && (
        <div
          className="bpm-context-menu"
          style={{
            position: 'fixed',
            left: contextMenuPos.x,
            top: contextMenuPos.y,
            background: 'rgba(30, 30, 40, 0.98)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 4,
            padding: '4px 0',
            zIndex: 1001,
            minWidth: 140,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{ padding: '4px 8px', fontSize: '0.7rem', opacity: 0.6, borderBottom: '1px solid rgba(255,255,255,0.1)' }}
          >
            Segment {selectedSegment + 1} Curve Type
          </div>
          {Object.entries(CURVE_TYPES).map(([key, curveInfo]) => {
            const currentCurve = nodes[selectedSegment]?.curve || 'linear';
            const isSelected = currentCurve === key;
            return (
              <div
                key={key}
                style={{
                  padding: '4px 8px',
                  cursor: 'pointer',
                  fontSize: '0.7rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: isSelected ? 'rgba(79, 195, 247, 0.3)' : 'transparent',
                }}
                onClick={() => applySegmentCurveType(key)}
                onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = isSelected ? 'rgba(79, 195, 247, 0.3)' : 'transparent'; }}
              >
                <span style={{ width: '14px', textAlign: 'center' }}>{curveInfo.icon}</span>
                <span>{curveInfo.name}</span>
                {isSelected && <span style={{ marginLeft: 'auto', opacity: 0.6 }}>✓</span>}
              </div>
            );
          })}
          {/* Tension indicator and tip */}
          {(() => {
            const curveType = nodes[selectedSegment]?.curve || 'linear';
            const tension = nodes[selectedSegment]?.tension !== undefined ? nodes[selectedSegment].tension : 0.5;
            const canAdjustTension = curveType !== 'linear' && curveType !== 'stepStart' && curveType !== 'stepEnd';
            if (!canAdjustTension) return null;
            return (
              <div style={{ padding: '4px 8px', fontSize: '0.65rem', opacity: 0.6, borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: 4 }}>
                <div>Tension: {Math.round(tension * 100)}%</div>
                <div style={{ marginTop: 2 }}>Drag curve up/down to adjust</div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};

export default BPMEnvelopeEditor;
