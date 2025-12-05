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
  collapsed = false,
}) => {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(800);
  const [draggingKeyframe, setDraggingKeyframe] = useState(null);
  const [selectedKeyframe, setSelectedKeyframe] = useState(null);
  const [showCurveMenu, setShowCurveMenu] = useState(false);
  const [curveMenuPos, setCurveMenuPos] = useState({ x: 0, y: 0 });
  const [curveMenuKeyframeId, setCurveMenuKeyframeId] = useState(null);

  const keyframes = track?.keyframes || [];
  const trackColor = track?.color || '#4fc3f7';

  // Padding (no left padding so time 0 aligns with ruler/waveform start)
  const padding = { top: 8, right: 8, bottom: 8, left: 0 };
  const innerHeight = Math.max(1, height - padding.top - padding.bottom);

  // Measure container
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
    e.preventDefault();
    e.stopPropagation();
    setSelectedKeyframe(kf.id);
    setDraggingKeyframe(kf.id);
  }, []);

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
    
    // Clamp time between neighbors (except for first/last)
    let clampedTime = timeSeconds;
    if (kfIndex === 0) {
      clampedTime = 0; // First keyframe locked to start
    } else if (kfIndex === keyframes.length - 1) {
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
  }, [draggingKeyframe, keyframes, lengthSeconds, svgToKeyframe, onUpdateKeyframe]);

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
    const svg = svgRef.current;
    if (!svg) return;
    
    const rect = svg.getBoundingClientRect();
    const svgX = e.clientX - rect.left;
    const svgY = e.clientY - rect.top;
    const { timeSeconds, value01 } = svgToKeyframe(svgX, svgY);
    
    onAddKeyframe?.(timeSeconds, value01, 'linear', 0.5);
  }, [svgToKeyframe, onAddKeyframe]);

  // Handle keyframe double-click to delete
  const handleKeyframeDoubleClick = useCallback((e, kf) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Don't delete first or last keyframe
    const sortedKfs = [...keyframes].sort((a, b) => a.timeSeconds - b.timeSeconds);
    const kfIndex = sortedKfs.findIndex(k => k.id === kf.id);
    if (kfIndex === 0 || kfIndex === sortedKfs.length - 1) return;
    if (keyframes.length <= 2) return;
    
    onRemoveKeyframe?.(kf.id);
  }, [keyframes, onRemoveKeyframe]);

  // Handle right-click for curve menu
  const handleKeyframeContextMenu = useCallback((e, kf) => {
    e.preventDefault();
    e.stopPropagation();
    
    setCurveMenuKeyframeId(kf.id);
    setCurveMenuPos({ x: e.clientX, y: e.clientY });
    setShowCurveMenu(true);
  }, []);

  // Apply curve type
  const handleApplyCurveType = useCallback((curveType) => {
    if (curveMenuKeyframeId) {
      onUpdateKeyframe?.(curveMenuKeyframeId, { curve: curveType });
    }
    setShowCurveMenu(false);
    setCurveMenuKeyframeId(null);
  }, [curveMenuKeyframeId, onUpdateKeyframe]);

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

  // Playhead position (align with global line; account for left padding)
  const playheadX = positionSeconds * pixelsPerSecond - scrollLeft;

  // Current value at playhead
  const currentValue = useMemo(() => {
    return evaluateTrackAtTime(track, positionSeconds);
  }, [track, positionSeconds]);

  // Helper to map value -> Y using same scaling as path
  const valueToY = useCallback((value) => {
    const min = track?.range?.outputMin ?? 0;
    const max = track?.range?.outputMax ?? 1;
    const t = (value - min) / Math.max(0.0001, (max - min));
    return padding.top + (1 - t) * innerHeight;
  }, [track?.range?.outputMin, track?.range?.outputMax, innerHeight]);

  if (collapsed) {
    // Collapsed view: just show a thin line
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
        style={{
          display: 'block',
          cursor: draggingKeyframe ? 'grabbing' : 'crosshair',
        }}
        onDoubleClick={handleDoubleClick}
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

        {/* Filled area under curve */}
        {pathD && (
          <path
            d={`${pathD} L ${keyframes.length > 0 ? keyframeToSvg(keyframes[keyframes.length - 1]).x : padding.left} ${padding.top + innerHeight} L ${keyframes.length > 0 ? keyframeToSvg(keyframes[0]).x : padding.left} ${padding.top + innerHeight} Z`}
            fill={trackColor}
            fillOpacity={0.15}
          />
        )}

        {/* Curve path */}
        <path
          d={pathD}
          fill="none"
          stroke={trackColor}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Keyframe nodes */}
        {keyframes.map((kf, i) => {
          const pos = keyframeToSvg(kf);
          const isFirst = i === 0;
          const isLast = i === keyframes.length - 1;
          const isSelected = selectedKeyframe === kf.id;
          
          // Skip if outside visible area
          if (pos.x < -20 || pos.x > containerWidth + 20) return null;
          
          return (
            <g key={kf.id}>
              {/* Larger hit area */}
              <circle
                cx={pos.x}
                cy={pos.y}
                r={12}
                fill="transparent"
                style={{ cursor: 'grab' }}
                onMouseDown={(e) => handleKeyframeMouseDown(e, kf)}
                onDoubleClick={(e) => handleKeyframeDoubleClick(e, kf)}
                onContextMenu={(e) => handleKeyframeContextMenu(e, kf)}
              />
              {/* Visible node */}
              <circle
                cx={pos.x}
                cy={pos.y}
                r={isSelected ? 7 : (isFirst || isLast ? 6 : 5)}
                fill={isSelected ? '#ff5722' : (isFirst || isLast ? trackColor : '#fff')}
                stroke={isSelected ? '#fff' : (isFirst || isLast ? '#fff' : trackColor)}
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

        {/* Current value dot on playhead (no line - that's drawn globally) */}
        {playheadX >= 0 && playheadX <= containerWidth && currentValue !== null && (
          <circle
            cx={playheadX}
            cy={valueToY(currentValue)}
            r={5}
            fill="#ff5722"
            stroke="#fff"
            strokeWidth={1.5}
          />
        )}

        {/* Value labels */}
        <text x={padding.left + 2} y={padding.top + 10} fill="rgba(255,255,255,0.3)" fontSize="8">
          {track?.range?.outputMax?.toFixed(1) ?? '1'}
        </text>
        <text x={padding.left + 2} y={height - padding.bottom - 2} fill="rgba(255,255,255,0.3)" fontSize="8">
          {track?.range?.outputMin?.toFixed(1) ?? '0'}
        </text>
      </svg>

      {/* Curve type context menu */}
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
            minWidth: 120,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div
            style={{
              padding: '4px 8px',
              fontSize: '0.65rem',
              color: 'rgba(255, 255, 255, 0.5)',
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            Curve Type
          </div>
          {Object.entries(CURVE_TYPES).map(([key, { name, icon }]) => (
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
        </div>
      )}
    </div>
  );
};

export default TimelineCurveEditor;
