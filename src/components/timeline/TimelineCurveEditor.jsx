import React, { useRef, useCallback, useState, useEffect, useMemo } from 'react';
import { evaluateTrackAtTime, CURVE_TYPES } from '../../utils/envelopes.js';

/**
 * TimelineCurveEditor - Curve editor for a single timeline track
 * 
 * Similar to BPMEnvelopeEditor but operates on seconds instead of normalized 0-1.
 * Features:
 * - Draggable keyframes
 * - Click to add keyframes
 * - Double-click to delete keyframes
 * - Right-click for curve type menu
 * - Playhead display
 */
const TimelineCurveEditor = ({
  track,
  lengthSeconds,
  positionSeconds,
  pixelsPerSecond,
  scrollLeft = 0,
  timelineWidth,
  height = 100,
  onAddKeyframe,
  onUpdateKeyframe,
  onRemoveKeyframe,
  onSeek,
  onSelectKeyframe,
  onCopyKeyframe,
  onPasteKeyframe,
  onPasteKeyframeToTrack,
  onRerollVariation,
  onRerollAllVariations,
  hasClipboard = false,
  clipboardTrackType = null,
  clipboardIsMultiSelection = false,
  clipboardSourceTargetId = null,
  allShapeTracks = [],
  collapsed = false,
  marqueeMode = false,
  selectedKeyframeIds = new Set(),
  pasteTimeSeconds = null,
}) => {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(timelineWidth || 800);
  const [draggingKeyframe, setDraggingKeyframe] = useState(null);
  const [selectedKeyframe, setSelectedKeyframe] = useState(null);
  const [showCurveMenu, setShowCurveMenu] = useState(false);
  const [curveMenuPos, setCurveMenuPos] = useState({ x: 0, y: 0 });
  const [curveMenuKeyframeId, setCurveMenuKeyframeId] = useState(null);

  const keyframes = useMemo(
    () => (Array.isArray(track?.keyframes) ? track.keyframes : []),
    [track?.keyframes],
  );
  const trackColor = track?.color || '#4fc3f7';
  const isShapeTrack = track?.type === 'shape' || track?.type === 'globalShape';
  const isColorTrack = track?.type === 'color';
  const isNumericTrack = !isShapeTrack && !isColorTrack;

  // Color picker state
  const [colorPickerKeyframeId, setColorPickerKeyframeId] = useState(null);
  const colorInputRef = useRef(null);
  
  // Edit panel state
  const [editingKeyframe, setEditingKeyframe] = useState(null);
  const [editTime, setEditTime] = useState('');
  const [editValue, setEditValue] = useState('');

  const selectedMenuKeyframe = useMemo(
    () => keyframes.find(k => k.id === curveMenuKeyframeId) || null,
    [keyframes, curveMenuKeyframeId],
  );
  const variationKeyframeCount = useMemo(
    () => keyframes.filter(k => !!k?.variation).length,
    [keyframes],
  );
  const externalSelection = useMemo(
    () => (selectedKeyframeIds instanceof Set ? selectedKeyframeIds : new Set(selectedKeyframeIds || [])),
    [selectedKeyframeIds],
  );
  const resolvedPasteTime = Number.isFinite(pasteTimeSeconds) ? pasteTimeSeconds : positionSeconds;

  // Padding (no left padding so time 0 aligns with ruler/waveform start)
  const padding = useMemo(() => ({ top: 8, right: 8, bottom: 8, left: 0 }), []);
  const innerHeight = Math.max(1, height - padding.top - padding.bottom);
  
  // For shape/color tracks, keyframes sit on a horizontal centerline
  const shapeCenterY = padding.top + innerHeight / 2;

  // Keep content width in sync with timeline width (fallback to measured container)
  useEffect(() => {
    if (timelineWidth) {
      setContainerWidth(timelineWidth);
      return;
    }
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
  }, [timelineWidth]);

  // Convert keyframe to SVG coordinates
  const keyframeToSvg = useCallback((kf) => ({
    x: kf.timeSeconds * pixelsPerSecond - scrollLeft + padding.left,
    y: padding.top + (1 - kf.value01) * innerHeight,
  }), [pixelsPerSecond, scrollLeft, padding, innerHeight]);

  // Convert SVG coordinates to keyframe values
  const svgToKeyframe = useCallback((svgX, svgY) => ({
    timeSeconds: Math.max(0, Math.min(lengthSeconds, (svgX - padding.left + scrollLeft) / pixelsPerSecond)),
    value01: Math.max(0, Math.min(1, 1 - (svgY - padding.top) / innerHeight)),
  }), [pixelsPerSecond, scrollLeft, padding, innerHeight, lengthSeconds]);

  // Generate SVG path for the curve
  const pathD = useMemo(() => {
    if (keyframes.length === 0) return '';
    
    const sortedKfs = [...keyframes].sort((a, b) => a.timeSeconds - b.timeSeconds);
    const pts = sortedKfs.map(keyframeToSvg);
    
    let d = `M ${pts[0].x} ${pts[0].y}`;
    
    for (let i = 0; i < sortedKfs.length - 1; i++) {
      const curveType = sortedKfs[i].curve || 'linear';
      const tension = sortedKfs[i].tension !== undefined ? sortedKfs[i].tension : 0.5;
      const p0 = pts[i];
      const p1 = pts[i + 1];
      
      if (curveType === 'linear') {
        d += ` L ${p1.x} ${p1.y}`;
      } else if (curveType === 'step') {
        const stepX = p0.x + (p1.x - p0.x) * tension;
        d += ` L ${stepX} ${p0.y} L ${stepX} ${p1.y} L ${p1.x} ${p1.y}`;
      } else if (curveType === 'stepStart') {
        d += ` L ${p0.x} ${p1.y} L ${p1.x} ${p1.y}`;
      } else if (curveType === 'stepEnd') {
        d += ` L ${p1.x} ${p0.y} L ${p1.x} ${p1.y}`;
      } else {
        // Bezier curves for easing
        const dx = p1.x - p0.x;
        const cpOffset = 0.1 + tension * 0.8;
        let cp1x, cp1y, cp2x, cp2y;
        
        if (curveType === 'easeIn') {
          cp1x = p0.x + dx * cpOffset;
          cp1y = p0.y;
          cp2x = p0.x + dx * 1.0;
          cp2y = p1.y;
        } else if (curveType === 'easeOut') {
          cp1x = p0.x;
          cp1y = p1.y;
          cp2x = p0.x + dx * (1 - cpOffset);
          cp2y = p1.y;
        } else if (curveType === 'easeInOut') {
          cp1x = p0.x + dx * cpOffset;
          cp1y = p0.y;
          cp2x = p0.x + dx * (1 - cpOffset);
          cp2y = p1.y;
        } else {
          d += ` L ${p1.x} ${p1.y}`;
          continue;
        }
        d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p1.x} ${p1.y}`;
      }
    }
    
    return d;
  }, [keyframes, keyframeToSvg]);

  // Handle mouse down on keyframe
  const handleKeyframeMouseDown = useCallback((e, kf) => {
    if (marqueeMode) return;
    e.preventDefault();
    e.stopPropagation();
    setSelectedKeyframe(kf.id);
    setDraggingKeyframe(kf.id);
  }, [marqueeMode]);

  // Handle mouse move for dragging
  const handleMouseMove = useCallback((e) => {
    if (!draggingKeyframe) return;
    
    const svg = svgRef.current;
    if (!svg) return;
    
    const rect = svg.getBoundingClientRect();
    const svgX = e.clientX - rect.left;
    const svgY = e.clientY - rect.top;
    const { timeSeconds, value01 } = svgToKeyframe(svgX, svgY);
    
    // Find the keyframe being dragged
    const kfIndex = keyframes.findIndex(kf => kf.id === draggingKeyframe);
    if (kfIndex === -1) return;
    
    // Clamp time between neighbors. Lock first/last only for numeric tracks.
    let clampedTime = timeSeconds;
    if (isNumericTrack && kfIndex === 0) {
      clampedTime = 0; // First keyframe locked to start
    } else if (isNumericTrack && kfIndex === keyframes.length - 1) {
      clampedTime = lengthSeconds; // Last keyframe locked to end
    } else {
      const prevTime = keyframes[kfIndex - 1]?.timeSeconds || 0;
      const nextTime = keyframes[kfIndex + 1]?.timeSeconds || lengthSeconds;
      clampedTime = Math.max(prevTime + 0.01, Math.min(nextTime - 0.01, timeSeconds));
    }
    
    onUpdateKeyframe?.(draggingKeyframe, {
      timeSeconds: clampedTime,
      value01,
    });
  }, [draggingKeyframe, isNumericTrack, keyframes, lengthSeconds, svgToKeyframe, onUpdateKeyframe]);

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    setDraggingKeyframe(null);
  }, []);

  // Global mouse listeners for dragging
  useEffect(() => {
    if (draggingKeyframe) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [draggingKeyframe, handleMouseMove, handleMouseUp]);

  // Handle double-click to add keyframe
  const handleDoubleClick = useCallback((e) => {
    if (marqueeMode) return;
    const svg = svgRef.current;
    if (!svg) return;
    
    const rect = svg.getBoundingClientRect();
    const svgX = e.clientX - rect.left;
    const svgY = e.clientY - rect.top;
    const { timeSeconds, value01 } = svgToKeyframe(svgX, svgY);
    
    // For color tracks, add a keyframe with a default color
    if (isColorTrack) {
      onAddKeyframe?.(timeSeconds, 0.5, 'linear', 0.5, { color: '#ffffff' });
    } else {
      onAddKeyframe?.(timeSeconds, value01, 'linear', 0.5);
    }
  }, [marqueeMode, svgToKeyframe, onAddKeyframe, isColorTrack]);

  // Handle click on background to seek playhead
  const handleBackgroundClick = useCallback((e) => {
    if (marqueeMode) return;
    if (!onSeek) return;
    // Ignore if a drag just finished (mousedown was on a keyframe)
    if (draggingKeyframe) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const svgX = e.clientX - rect.left;
    const clickTime = Math.max(0, Math.min(lengthSeconds, (svgX - padding.left + scrollLeft) / pixelsPerSecond));
    onSeek(clickTime);
  }, [marqueeMode, onSeek, draggingKeyframe, lengthSeconds, padding.left, scrollLeft, pixelsPerSecond]);

  // Handle keyframe double-click to delete
  const handleKeyframeDoubleClick = useCallback((e, kf) => {
    if (marqueeMode) return;
    e.preventDefault();
    e.stopPropagation();
    
    // Don't delete first or last keyframe
    const sortedKfs = [...keyframes].sort((a, b) => a.timeSeconds - b.timeSeconds);
    const kfIndex = sortedKfs.findIndex(k => k.id === kf.id);
    if (kfIndex === 0 || kfIndex === sortedKfs.length - 1) return;
    if (keyframes.length <= 2) return;
    
    onRemoveKeyframe?.(kf.id);
  }, [marqueeMode, keyframes, onRemoveKeyframe]);

  // Handle click on color keyframe to open color picker
  const handleColorKeyframeClick = useCallback((e, kf) => {
    if (marqueeMode) return;
    e.preventDefault();
    e.stopPropagation();
    setSelectedKeyframe(kf.id);
    setColorPickerKeyframeId(kf.id);
    // Trigger the hidden color input
    setTimeout(() => {
      if (colorInputRef.current) {
        colorInputRef.current.value = kf.color || '#ffffff';
        colorInputRef.current.click();
      }
    }, 0);
  }, [marqueeMode]);

  // Handle color change from picker
  const handleColorChange = useCallback((e) => {
    const newColor = e.target.value;
    if (colorPickerKeyframeId && onUpdateKeyframe) {
      onUpdateKeyframe(colorPickerKeyframeId, { color: newColor });
    }
  }, [colorPickerKeyframeId, onUpdateKeyframe]);

  // Handle right-click for curve menu (on keyframe)
  const handleKeyframeContextMenu = useCallback((e, kf) => {
    if (marqueeMode) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    
    setSelectedKeyframe(kf.id);
    setCurveMenuKeyframeId(kf.id);
    
    // Position menu above the click point to avoid going off screen
    const menuWidth = 160;
    const menuHeight = 280;
    let menuX = e.clientX - menuWidth / 2;
    let menuY = e.clientY - menuHeight - 10;
    
    if (menuY < 10) {
      menuY = e.clientY + 10;
    }
    if (menuX < 10) {
      menuX = 10;
    } else if (menuX + menuWidth > window.innerWidth - 10) {
      menuX = window.innerWidth - menuWidth - 10;
    }
    if (menuY + menuHeight > window.innerHeight - 10) {
      menuY = window.innerHeight - menuHeight - 10;
    }
    
    setCurveMenuPos({ x: menuX, y: menuY });
    setShowCurveMenu(true);
  }, [marqueeMode]);

  // Handle right-click on background - find nearest keyframe for curve editing
  const handleBackgroundContextMenu = useCallback((e) => {
    if (marqueeMode) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    // Always prevent the browser context menu in the timeline
    e.preventDefault();
    e.stopPropagation();
    
    // Get click position in timeline coordinates
    const rect = e.currentTarget.getBoundingClientRect();
    const svgX = e.clientX - rect.left;
    const clickTime = (svgX - padding.left + scrollLeft) / pixelsPerSecond;
    
    // Find the nearest keyframe to the click position (for applying curves)
    // Curves apply to the segment AFTER a keyframe, so prefer keyframes before click time
    let nearestKf = null;
    let minDist = Infinity;
    
    // First pass: find keyframes before or at click position
    for (const kf of keyframes) {
      if (kf.timeSeconds <= clickTime) {
        const dist = clickTime - kf.timeSeconds;
        if (dist < minDist) {
          minDist = dist;
          nearestKf = kf;
        }
      }
    }
    
    // If no keyframe before click, find the closest one overall
    if (!nearestKf && keyframes.length > 0) {
      for (const kf of keyframes) {
        const dist = Math.abs(kf.timeSeconds - clickTime);
        if (dist < minDist) {
          minDist = dist;
          nearestKf = kf;
        }
      }
    }
    
    // Always select the nearest keyframe if we have one
    if (nearestKf) {
      setSelectedKeyframe(nearestKf.id);
      setCurveMenuKeyframeId(nearestKf.id);
    } else {
      setCurveMenuKeyframeId(null);
    }
    
    // Position menu above the click point to avoid going off screen
    const menuWidth = 160;
    const menuHeight = 280;
    let menuX = e.clientX - menuWidth / 2; // Center horizontally on click
    let menuY = e.clientY - menuHeight - 10; // Position above click
    
    // If menu would go off top, position below click instead
    if (menuY < 10) {
      menuY = e.clientY + 10;
    }
    // Keep within horizontal bounds
    if (menuX < 10) {
      menuX = 10;
    } else if (menuX + menuWidth > window.innerWidth - 10) {
      menuX = window.innerWidth - menuWidth - 10;
    }
    // Final check for bottom edge
    if (menuY + menuHeight > window.innerHeight - 10) {
      menuY = window.innerHeight - menuHeight - 10;
    }
    
    setCurveMenuPos({ x: menuX, y: menuY });
    setShowCurveMenu(true);
  }, [marqueeMode, keyframes, padding.left, scrollLeft, pixelsPerSecond]);

  // Apply curve type
  const handleApplyCurveType = useCallback((curveType) => {
    if (curveMenuKeyframeId) {
      onUpdateKeyframe?.(curveMenuKeyframeId, { curve: curveType });
    }
    setShowCurveMenu(false);
    setCurveMenuKeyframeId(null);
  }, [curveMenuKeyframeId, onUpdateKeyframe]);

  // Open edit panel for a keyframe
  const handleOpenEditPanel = useCallback((kfId) => {
    const kf = keyframes.find(k => k.id === kfId);
    if (!kf) return;
    
    setEditingKeyframe(kfId);
    setEditTime(kf.timeSeconds.toFixed(3));
    setEditValue(kf.value01 !== undefined ? (kf.value01 * 100).toFixed(1) : '');
    setShowCurveMenu(false);
  }, [keyframes]);

  // Apply time/value edits
  const handleApplyEdit = useCallback(() => {
    if (!editingKeyframe) return;
    
    const updates = {};
    const newTime = parseFloat(editTime);
    if (!isNaN(newTime) && newTime >= 0 && newTime <= lengthSeconds) {
      updates.timeSeconds = newTime;
    }
    
    if (!isShapeTrack && !isColorTrack && editValue !== '') {
      const newValue = parseFloat(editValue) / 100;
      if (!isNaN(newValue)) {
        updates.value01 = Math.max(0, Math.min(1, newValue));
      }
    }
    
    if (Object.keys(updates).length > 0) {
      onUpdateKeyframe?.(editingKeyframe, updates);
    }
    
    setEditingKeyframe(null);
  }, [editingKeyframe, editTime, editValue, lengthSeconds, isShapeTrack, isColorTrack, onUpdateKeyframe]);

  // Close edit panel
  const handleCloseEditPanel = useCallback(() => {
    setEditingKeyframe(null);
  }, []);

  // Delete keyframe from edit panel
  const handleDeleteFromEdit = useCallback(() => {
    if (editingKeyframe && onRemoveKeyframe) {
      onRemoveKeyframe(editingKeyframe);
    }
    setEditingKeyframe(null);
  }, [editingKeyframe, onRemoveKeyframe]);

  // Delete all keyframes on this track
  const handleDeleteAllKeyframes = useCallback(() => {
    if (!onRemoveKeyframe || keyframes.length === 0) return;
    // For numeric tracks, keep first and last (range anchors); for shape/color, remove all
    if (isNumericTrack && keyframes.length > 2) {
      const sorted = [...keyframes].sort((a, b) => a.timeSeconds - b.timeSeconds);
      // Remove everything except first and last
      for (let i = 1; i < sorted.length - 1; i++) {
        onRemoveKeyframe(sorted[i].id);
      }
    } else {
      // Shape/color/globalShape: remove all
      for (const kf of keyframes) {
        onRemoveKeyframe(kf.id);
      }
    }
    setShowCurveMenu(false);
    setCurveMenuKeyframeId(null);
    setSelectedKeyframe(null);
  }, [keyframes, isNumericTrack, onRemoveKeyframe]);

  // Seek to keyframe
  const handleSeekToKeyframe = useCallback((kfId) => {
    const kf = keyframes.find(k => k.id === kfId);
    if (kf && onSeek) {
      onSeek(kf.timeSeconds);
    }
    onSelectKeyframe?.(track?.id, kfId);
    setShowCurveMenu(false);
  }, [keyframes, onSeek, onSelectKeyframe, track?.id]);

  // Close curve menu on click outside
  useEffect(() => {
    if (!showCurveMenu) return;
    
    const handleClick = () => {
      setShowCurveMenu(false);
      setCurveMenuKeyframeId(null);
    };
    
    setTimeout(() => {
      document.addEventListener('mousedown', handleClick);
    }, 100);
    
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showCurveMenu]);

  // Close edit panel on click outside
  useEffect(() => {
    if (!editingKeyframe) return;
    
    const handleClick = (e) => {
      // Don't close if clicking inside the edit panel
      if (e.target.closest('.keyframe-edit-panel')) return;
      setEditingKeyframe(null);
    };
    
    // Add the listener immediately and ensure it is removed on cleanup
    document.addEventListener('mousedown', handleClick);
    
    return () => document.removeEventListener('mousedown', handleClick);
  }, [editingKeyframe]);

  // Keyboard shortcuts for copy/paste (Ctrl/Cmd+C, Ctrl/Cmd+V)
  useEffect(() => {
    if (marqueeMode) return undefined;
    const handleKeyDown = (e) => {
      if (e.defaultPrevented || externalSelection.size > 0) return;
      // Only handle if this track's editor is focused or has a selected keyframe
      if (!selectedKeyframe && !curveMenuKeyframeId) return;
      
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modKey = isMac ? e.metaKey : e.ctrlKey;
      
      if (modKey && e.key === 'c') {
        // Copy selected keyframe
        const kfId = selectedKeyframe || curveMenuKeyframeId;
        if (kfId && onCopyKeyframe) {
          e.preventDefault();
          onCopyKeyframe(kfId);
        }
      } else if (modKey && e.key === 'v' && !clipboardIsMultiSelection) {
        // Paste at playhead - only if this track is the source track
        // This prevents multiple tracks from all trying to paste
        const isSourceTrack = clipboardSourceTargetId && track?.targetId === clipboardSourceTargetId;
        if (hasClipboard && onPasteKeyframe && isSourceTrack) {
          e.preventDefault();
          onPasteKeyframe(resolvedPasteTime);
        }
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [marqueeMode, externalSelection, selectedKeyframe, curveMenuKeyframeId, onCopyKeyframe, onPasteKeyframe, hasClipboard, clipboardIsMultiSelection, resolvedPasteTime, clipboardSourceTargetId, track?.targetId]);

  // Playhead position (align with global line; account for left padding)
  const playheadX = positionSeconds * pixelsPerSecond - scrollLeft;

  // Current value at playhead
  const currentValue = useMemo(() => {
    return evaluateTrackAtTime(track, positionSeconds);
  }, [track, positionSeconds]);

  const handleSvgKeyDown = useCallback((e) => {
    if (marqueeMode) return;
    if (!onSeek) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const step = e.shiftKey ? 1 : 0.1;
      const delta = e.key === 'ArrowLeft' ? -step : step;
      const next = Math.max(0, Math.min(lengthSeconds, (positionSeconds || 0) + delta));
      onSeek(next);
      return;
    }
    if (e.key === 'Home') {
      e.preventDefault();
      onSeek(0);
      return;
    }
    if (e.key === 'End') {
      e.preventDefault();
      onSeek(lengthSeconds);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (isColorTrack) {
        onAddKeyframe?.(positionSeconds, 0.5, 'linear', 0.5, { color: '#ffffff' });
      } else {
        const seed = Number.isFinite(currentValue) ? currentValue : 0.5;
        const min = track?.range?.outputMin ?? 0;
        const max = track?.range?.outputMax ?? 1;
        const denom = Math.max(0.0001, max - min);
        const value01 = Math.max(0, Math.min(1, (seed - min) / denom));
        onAddKeyframe?.(positionSeconds, value01, 'linear', 0.5);
      }
    }
  }, [marqueeMode, currentValue, isColorTrack, lengthSeconds, onAddKeyframe, onSeek, positionSeconds, track?.range?.outputMax, track?.range?.outputMin]);

  // Helper to map value -> Y using same scaling as path
  const valueToY = useCallback((value) => {
    const min = track?.range?.outputMin ?? 0;
    const max = track?.range?.outputMax ?? 1;
    const t = (value - min) / Math.max(0.0001, (max - min));
    return padding.top + (1 - t) * innerHeight;
  }, [track?.range?.outputMin, track?.range?.outputMax, innerHeight, padding.top]);

  if (collapsed) {
    // Collapsed view: just show a thin line
    return (
      <div
        ref={containerRef}
        style={{
          width: timelineWidth ? `${timelineWidth}px` : '100%',
          height,
          background: 'rgba(0, 0, 0, 0.2)',
          position: 'relative',
        }}
      >
        <svg
          width={containerWidth}
          height={height}
          style={{ display: 'block' }}
        >
          {/* Simple line representation */}
          <path
            d={pathD}
            fill="none"
            stroke={trackColor}
            strokeWidth={2}
            strokeOpacity={0.5}
          />
          {/* No playhead line in collapsed view - drawn globally */}
        </svg>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height,
        background: 'rgba(0, 0, 0, 0.2)',
        position: 'relative',
      }}
    >
      <svg
        ref={svgRef}
        width={containerWidth}
        height={height}
        tabIndex={0}
        role="application"
        aria-label="Timeline curve editor. Arrow keys move playhead, Enter adds keyframe."
        style={{
          display: 'block',
          cursor: draggingKeyframe ? 'grabbing' : 'crosshair',
        }}
        onClick={handleBackgroundClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleBackgroundContextMenu}
        onKeyDown={handleSvgKeyDown}
      >
        {/* Background grid */}
        <defs>
          <pattern id={`grid-${track?.id}`} width={pixelsPerSecond} height={innerHeight / 4} patternUnits="userSpaceOnUse">
            <line x1={0} y1={0} x2={0} y2={innerHeight / 4} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
            <line x1={0} y1={innerHeight / 4} x2={pixelsPerSecond} y2={innerHeight / 4} stroke="rgba(255,255,255,0.03)" strokeWidth={1} />
          </pattern>
        </defs>
        <rect
          x={padding.left}
          y={padding.top}
          width={containerWidth - padding.left - padding.right}
          height={innerHeight}
          fill={`url(#grid-${track?.id})`}
        />

        {/* Horizontal guide lines (0.25, 0.5, 0.75) */}
        {[0.25, 0.5, 0.75].map(v => (
          <line
            key={v}
            x1={padding.left}
            y1={padding.top + (1 - v) * innerHeight}
            x2={containerWidth - padding.right}
            y2={padding.top + (1 - v) * innerHeight}
            stroke="rgba(255,255,255,0.1)"
            strokeWidth={1}
            strokeDasharray={v === 0.5 ? 'none' : '2,4'}
          />
        ))}

        {/* Filled area under curve (numeric tracks only) */}
        {isNumericTrack && pathD && (
          <path
            d={`${pathD} L ${keyframes.length > 0 ? keyframeToSvg(keyframes[keyframes.length - 1]).x : padding.left} ${padding.top + innerHeight} L ${keyframes.length > 0 ? keyframeToSvg(keyframes[0]).x : padding.left} ${padding.top + innerHeight} Z`}
            fill={trackColor}
            fillOpacity={0.15}
          />
        )}

        {/* Curve path (all non-color tracks) */}
        {!isColorTrack && pathD && (
          <path
            d={pathD}
            fill="none"
            stroke={trackColor}
            strokeWidth={2}
            strokeOpacity={isShapeTrack ? 0.85 : 1}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Shape track centerline */}
        {isShapeTrack && (
          <line
            x1={-scrollLeft}
            y1={shapeCenterY}
            x2={containerWidth - scrollLeft}
            y2={shapeCenterY}
            stroke="rgba(255,255,255,0.1)"
            strokeWidth={1}
            strokeDasharray="4,4"
          />
        )}

        {/* Color track centerline */}
        {isColorTrack && (
          <line
            x1={-scrollLeft}
            y1={shapeCenterY}
            x2={containerWidth - scrollLeft}
            y2={shapeCenterY}
            stroke="rgba(255,255,255,0.1)"
            strokeWidth={1}
            strokeDasharray="4,4"
          />
        )}

        {/* Color track gradient preview between keyframes */}
        {isColorTrack && keyframes.length >= 2 && (
          <defs>
            <linearGradient id={`colorGradient-${track?.id}`} x1="0%" y1="0%" x2="100%" y2="0%">
              {keyframes.map((kf) => (
                <stop
                  key={kf.id}
                  offset={`${(kf.timeSeconds / lengthSeconds) * 100}%`}
                  stopColor={kf.color || '#ffffff'}
                />
              ))}
            </linearGradient>
          </defs>
        )}
        {isColorTrack && keyframes.length >= 2 && (
          <rect
            x={keyframes[0].timeSeconds * pixelsPerSecond - scrollLeft}
            y={shapeCenterY - 8}
            width={(keyframes[keyframes.length - 1].timeSeconds - keyframes[0].timeSeconds) * pixelsPerSecond}
            height={16}
            fill={`url(#colorGradient-${track?.id})`}
            rx={4}
            opacity={0.8}
          />
        )}

        {/* Keyframe nodes */}
        {keyframes.map((kf, i) => {
          // For shape/color tracks, use centerline Y; for numeric, use value-based Y
          const basePos = keyframeToSvg(kf);
          const pos = (isShapeTrack || isColorTrack)
            ? { x: basePos.x, y: shapeCenterY }
            : basePos;
          const isFirst = i === 0;
          const isLast = i === keyframes.length - 1;
          const isLocallySelected = selectedKeyframe === kf.id;
          const isExternallySelected = externalSelection.has(kf.id);
          const isSelected = isLocallySelected || isExternallySelected;
          const selectionFill = isLocallySelected ? '#ff5722' : '#ffd54f';
          const selectionStroke = isLocallySelected ? '#fff' : '#ffe082';
          
          // Skip if outside visible area
          if (pos.x < -20 || pos.x > containerWidth + 20) return null;
          
          // Shape track: render diamond markers
          if (isShapeTrack) {
            const size = isSelected ? 8 : 6;
            return (
              <g key={kf.id}>
                {/* Larger hit area */}
                <rect
                  x={pos.x - 12}
                  y={pos.y - 12}
                  width={24}
                  height={24}
                  fill="transparent"
                  style={{ cursor: 'grab' }}
                  data-timeline-keyframe="true"
                  data-track-id={track?.id || ''}
                  data-keyframe-id={kf.id}
                  onMouseDown={(e) => handleKeyframeMouseDown(e, kf)}
                  onDoubleClick={(e) => handleKeyframeDoubleClick(e, kf)}
                  onContextMenu={(e) => handleKeyframeContextMenu(e, kf)}
                />
                {/* Diamond shape */}
                <polygon
                  points={`${pos.x},${pos.y - size} ${pos.x + size},${pos.y} ${pos.x},${pos.y + size} ${pos.x - size},${pos.y}`}
                  fill={isSelected ? selectionFill : trackColor}
                  stroke={isSelected ? selectionStroke : '#fff'}
                  strokeWidth={1.5}
                  style={{ pointerEvents: 'none' }}
                />
                {/* Label if present */}
                {kf.label && (
                  <text
                    x={pos.x}
                    y={pos.y - size - 4}
                    fill="rgba(255,255,255,0.6)"
                    fontSize="8"
                    textAnchor="middle"
                  >
                    {kf.label}
                  </text>
                )}
              </g>
            );
          }
          
          // Color track: render colored circles
          if (isColorTrack) {
            const radius = isSelected ? 10 : 8;
            const kfColor = kf.color || '#ffffff';
            return (
              <g key={kf.id}>
                {/* Larger hit area */}
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={14}
                  fill="transparent"
                  style={{ cursor: 'pointer' }}
                  data-timeline-keyframe="true"
                  data-track-id={track?.id || ''}
                  data-keyframe-id={kf.id}
                  onClick={(e) => handleColorKeyframeClick(e, kf)}
                  onMouseDown={(e) => handleKeyframeMouseDown(e, kf)}
                  onDoubleClick={(e) => handleKeyframeDoubleClick(e, kf)}
                />
                {/* Colored circle */}
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={radius}
                  fill={kfColor}
                  stroke={isSelected ? selectionFill : '#fff'}
                  strokeWidth={isSelected ? 3 : 2}
                  style={{ pointerEvents: 'none' }}
                />
              </g>
            );
          }
          
          // Numeric track: render circles
          return (
            <g key={kf.id}>
              {/* Larger hit area */}
              <circle
                cx={pos.x}
                cy={pos.y}
                r={12}
                fill="transparent"
                style={{ cursor: 'grab' }}
                data-timeline-keyframe="true"
                data-track-id={track?.id || ''}
                data-keyframe-id={kf.id}
                onMouseDown={(e) => handleKeyframeMouseDown(e, kf)}
                onDoubleClick={(e) => handleKeyframeDoubleClick(e, kf)}
                onContextMenu={(e) => handleKeyframeContextMenu(e, kf)}
              />
              {/* Visible node */}
              <circle
                cx={pos.x}
                cy={pos.y}
                r={isSelected ? 7 : (isFirst || isLast ? 6 : 5)}
                fill={isSelected ? selectionFill : (isFirst || isLast ? trackColor : '#fff')}
                stroke={isSelected ? selectionStroke : (isFirst || isLast ? '#fff' : trackColor)}
                strokeWidth={2}
                style={{ pointerEvents: 'none' }}
              />
              {/* Curve type indicator */}
              {kf.curve && kf.curve !== 'linear' && (
                <text
                  x={pos.x}
                  y={pos.y - 12}
                  fill="rgba(255,255,255,0.5)"
                  fontSize="8"
                  textAnchor="middle"
                >
                  {CURVE_TYPES[kf.curve]?.icon || ''}
                </text>
              )}
            </g>
          );
        })}

        {/* Playhead line through this track */}
        {playheadX >= 0 && playheadX <= containerWidth && (
          <line
            x1={playheadX}
            y1={0}
            x2={playheadX}
            y2={height}
            stroke="#ff5722"
            strokeWidth={2}
            pointerEvents="none"
          />
        )}

        {/* Current value dot on playhead (numeric tracks only) */}
        {isNumericTrack && playheadX >= 0 && playheadX <= containerWidth && currentValue !== null && (
          <circle
            cx={playheadX}
            cy={valueToY(currentValue)}
            r={5}
            fill="#ff5722"
            stroke="#fff"
            strokeWidth={1.5}
          />
        )}

        {/* Value labels (numeric tracks only) */}
        {isNumericTrack && (
          <>
            <text x={padding.left + 2} y={padding.top + 10} fill="rgba(255,255,255,0.3)" fontSize="8">
              {track?.range?.outputMax?.toFixed(1) ?? '1'}
            </text>
            <text x={padding.left + 2} y={height - padding.bottom - 2} fill="rgba(255,255,255,0.3)" fontSize="8">
              {track?.range?.outputMin?.toFixed(1) ?? '0'}
            </text>
          </>
        )}

        {/* Shape track label */}
        {isShapeTrack && (
          <text x={padding.left + 2} y={padding.top + 10} fill="rgba(255,255,255,0.3)" fontSize="8">
            ⬡ Shape
          </text>
        )}
      </svg>

      {/* Keyframe context menu */}
      {showCurveMenu && (
        <div
          style={{
            position: 'fixed',
            left: curveMenuPos.x,
            top: curveMenuPos.y,
            background: 'rgba(30, 30, 40, 0.98)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: 4,
            padding: '4px 0',
            zIndex: 1000,
            minWidth: 160,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Keyframe actions (only when a keyframe is selected) */}
          {curveMenuKeyframeId && (
            <>
              {/* Enable/disable for shape tracks */}
              {isShapeTrack && selectedMenuKeyframe && (
                <button
                  type="button"
                  onClick={() => {
                    const nextEnabled = selectedMenuKeyframe.enabled === false;
                    onUpdateKeyframe?.(selectedMenuKeyframe.id, { enabled: nextEnabled });
                    setShowCurveMenu(false);
                    setCurveMenuKeyframeId(null);
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '6px 12px',
                    background: 'transparent',
                    border: 'none',
                    color: 'white',
                    fontSize: '0.7rem',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  {selectedMenuKeyframe.enabled === false ? '⚡ Enable Shape Track From Here' : '🔌 Disable Shape Track From Here'}
                </button>
              )}
              {/* Edit keyframe */}
              <button
                type="button"
                onClick={() => handleOpenEditPanel(curveMenuKeyframeId)}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '6px 12px',
                  background: 'transparent',
                  border: 'none',
                  color: 'white',
                  fontSize: '0.7rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                ✏️ Edit Keyframe
              </button>
              
              {/* Seek to keyframe */}
              <button
                type="button"
                onClick={() => handleSeekToKeyframe(curveMenuKeyframeId)}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '6px 12px',
                  background: 'transparent',
                  border: 'none',
                  color: 'white',
                  fontSize: '0.7rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                ⏱️ Seek to Keyframe
              </button>
              
              {/* Copy keyframe */}
              <button
                type="button"
                onClick={() => {
                  if (onCopyKeyframe) {
                    onCopyKeyframe(curveMenuKeyframeId);
                  }
                  setShowCurveMenu(false);
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '6px 12px',
                  background: 'transparent',
                  border: 'none',
                  color: 'white',
                  fontSize: '0.7rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                📋 Copy (⌘C)
              </button>
              
              {/* Reroll variation (only for keyframes with variation metadata) */}
              {isShapeTrack && selectedMenuKeyframe?.variation && onRerollVariation && (
                <button
                  type="button"
                  onClick={() => {
                    if (onRerollVariation) {
                      onRerollVariation(curveMenuKeyframeId);
                    }
                    setShowCurveMenu(false);
                    setCurveMenuKeyframeId(null);
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '6px 12px',
                    background: 'transparent',
                    border: 'none',
                    color: '#ff9800',
                    fontSize: '0.7rem',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  🎲 Reroll Variation
                </button>
              )}

              {/* Reroll all variation keyframes on this track */}
              {isShapeTrack && variationKeyframeCount > 1 && onRerollAllVariations && (
                <button
                  type="button"
                  onClick={() => {
                    onRerollAllVariations();
                    setShowCurveMenu(false);
                    setCurveMenuKeyframeId(null);
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '6px 12px',
                    background: 'transparent',
                    border: 'none',
                    color: '#ffb74d',
                    fontSize: '0.7rem',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  🎲🎲 Regenerate Sequence ({variationKeyframeCount})
                </button>
              )}
              
              {/* Delete keyframe */}
              <button
                type="button"
                onClick={() => {
                  if (onRemoveKeyframe) {
                    onRemoveKeyframe(curveMenuKeyframeId);
                  }
                  setShowCurveMenu(false);
                  setCurveMenuKeyframeId(null);
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '6px 12px',
                  background: 'transparent',
                  border: 'none',
                  color: '#f44336',
                  fontSize: '0.7rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                🗑️ Delete Keyframe
              </button>

              {/* Delete all keyframes */}
              {keyframes.length > 1 && (
                <button
                  type="button"
                  onClick={handleDeleteAllKeyframes}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '6px 12px',
                    background: 'transparent',
                    border: 'none',
                    color: '#f44336',
                    fontSize: '0.7rem',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  🗑️ Delete All Keyframes ({keyframes.length})
                </button>
              )}
              
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', margin: '4px 0' }} />
            </>
          )}
          
          {/* Paste option - for shape keyframes, show submenu with track options */}
          {!clipboardIsMultiSelection && clipboardTrackType === 'shape' && hasClipboard && allShapeTracks.length > 0 ? (
            <>
              <div
                style={{
                  padding: '4px 8px',
                  fontSize: '0.65rem',
                  color: 'rgba(255, 255, 255, 0.5)',
                  borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                }}
              >
                Paste Shape Keyframe to:
              </div>
              {allShapeTracks.map((shapeTrack) => {
                // Extract layer name from targetId (e.g., "layer:Layer 1:shape" -> "Layer 1")
                const parts = shapeTrack.targetId?.split(':') || [];
                const layerName = parts.length >= 2 ? parts[1] : shapeTrack.name;
                return (
                  <button
                    key={shapeTrack.id}
                    type="button"
                    onClick={() => {
                      if (onPasteKeyframeToTrack) {
                        onPasteKeyframeToTrack(shapeTrack.id, resolvedPasteTime);
                      }
                      setShowCurveMenu(false);
                    }}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '6px 12px',
                      background: 'transparent',
                      border: 'none',
                      color: 'white',
                      fontSize: '0.7rem',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    ⬡ {layerName}
                  </button>
                );
              })}
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (onPasteKeyframe) {
                  onPasteKeyframe(resolvedPasteTime);
                }
                setShowCurveMenu(false);
              }}
              disabled={!hasClipboard}
              style={{
                display: 'block',
                width: '100%',
                padding: '6px 12px',
                background: 'transparent',
                border: 'none',
                color: hasClipboard ? 'white' : 'rgba(255,255,255,0.3)',
                fontSize: '0.7rem',
                cursor: hasClipboard ? 'pointer' : 'not-allowed',
                textAlign: 'left',
              }}
            >
              📄 Paste at Playhead (⌘V)
            </button>
          )}
          
          {/* Delete all keyframes (always shown when track has keyframes) */}
          {!curveMenuKeyframeId && keyframes.length > 0 && (
            <button
              type="button"
              onClick={handleDeleteAllKeyframes}
              style={{
                display: 'block',
                width: '100%',
                padding: '6px 12px',
                background: 'transparent',
                border: 'none',
                color: '#f44336',
                fontSize: '0.7rem',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              🗑️ Delete All Keyframes ({keyframes.length})
            </button>
          )}

          {/* Curve type section (for all non-color tracks when there are keyframes) */}
          {!isColorTrack && keyframes.length > 0 && (
            <>
              <div
                style={{
                  padding: '4px 8px',
                  fontSize: '0.65rem',
                  color: 'rgba(255, 255, 255, 0.5)',
                  borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                  marginTop: 4,
                }}
              >
                {curveMenuKeyframeId ? 'Curve Type' : 'No keyframe selected'}
              </div>
              {curveMenuKeyframeId && Object.entries(CURVE_TYPES).map(([key, { name, icon }]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleApplyCurveType(key)}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '6px 12px',
                    background: 'transparent',
                    border: 'none',
                    color: 'white',
                    fontSize: '0.7rem',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  {icon} {name}
                </button>
              ))}
            </>
          )}
        </div>
      )}

      {/* Hidden color input for color picker */}
      {isColorTrack && (
        <input
          ref={colorInputRef}
          type="color"
          style={{
            position: 'absolute',
            opacity: 0,
            pointerEvents: 'none',
            width: 0,
            height: 0,
          }}
          onChange={handleColorChange}
        />
      )}

      {/* Keyframe edit panel */}
      {editingKeyframe && (
        <div
          className="keyframe-edit-panel"
          style={{
            position: 'fixed',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(30, 30, 40, 0.98)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: 8,
            padding: '16px',
            zIndex: 1001,
            minWidth: 240,
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ color: 'white', fontWeight: 600, fontSize: '0.85rem' }}>
              Edit Keyframe
            </span>
            <button
              type="button"
              onClick={handleCloseEditPanel}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgba(255,255,255,0.5)',
                fontSize: '1rem',
                cursor: 'pointer',
                padding: '2px 6px',
              }}
            >
              ✕
            </button>
          </div>

          {/* Time input */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', color: 'rgba(255,255,255,0.7)', fontSize: '0.7rem', marginBottom: 4 }}>
              Time (seconds)
            </label>
            <input
              type="number"
              value={editTime}
              onChange={(e) => setEditTime(e.target.value)}
              step="0.001"
              min="0"
              max={lengthSeconds}
              style={{
                width: '100%',
                padding: '6px 8px',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 4,
                color: 'white',
                fontSize: '0.8rem',
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleApplyEdit();
                if (e.key === 'Escape') handleCloseEditPanel();
              }}
            />
          </div>

          {/* Value input (numeric tracks only) */}
          {!isShapeTrack && !isColorTrack && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', color: 'rgba(255,255,255,0.7)', fontSize: '0.7rem', marginBottom: 4 }}>
                Value (0-100%)
              </label>
              <input
                type="number"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                step="0.1"
                min="0"
                max="100"
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: 4,
                  color: 'white',
                  fontSize: '0.8rem',
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleApplyEdit();
                  if (e.key === 'Escape') handleCloseEditPanel();
                }}
              />
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.65rem', marginTop: 2 }}>
                Maps to {track?.range?.outputMin?.toFixed(2) ?? '0'} – {track?.range?.outputMax?.toFixed(2) ?? '1'}
              </div>
            </div>
          )}

          {/* Shape track info */}
          {isShapeTrack && (
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', marginBottom: 12 }}>
              Shape keyframes store geometry snapshots. Use "⬡ Capture" to update.
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={handleApplyEdit}
              style={{
                flex: 1,
                padding: '8px 12px',
                background: '#4fc3f7',
                border: 'none',
                borderRadius: 4,
                color: '#000',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Apply
            </button>
            <button
              type="button"
              onClick={() => handleSeekToKeyframe(editingKeyframe)}
              style={{
                padding: '8px 12px',
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 4,
                color: 'white',
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
              title="Seek playhead to this keyframe"
            >
              ⏱️
            </button>
            <button
              type="button"
              onClick={handleDeleteFromEdit}
              style={{
                padding: '8px 12px',
                background: 'rgba(244, 67, 54, 0.2)',
                border: '1px solid rgba(244, 67, 54, 0.5)',
                borderRadius: 4,
                color: '#f44336',
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
              title="Delete keyframe"
            >
              🗑️
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TimelineCurveEditor;
