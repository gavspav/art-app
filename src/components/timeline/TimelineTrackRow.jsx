import React, { useRef, useCallback, useState, useMemo } from 'react';
import TimelineCurveEditor from './TimelineCurveEditor.jsx';

/**
 * TimelineTrackRow - A single track row in the timeline
 * 
 * Contains:
 * - Track header (name, layer selector, parameter selector, enable toggle, delete)
 * - Curve editor for keyframes
 */
const TimelineTrackRow = ({
  track,
  index,
  lengthSeconds,
  positionSeconds,
  pixelsPerSecond,
  scrollLeft = 0,
  timelineWidth,
  layers = [],
  globalParameters = [],
  layerParameters = [],
  onUpdateTrack,
  onRemoveTrack,
  onAddKeyframe,
  onUpdateKeyframe,
  onRemoveKeyframe,
  onCaptureShapeKeyframe,
  onCopyKeyframe,
  onPasteKeyframe,
  hasClipboard = false,
  onSeek,
  height = 100,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const isShapeTrack = track?.type === 'shape' || track?.targetId?.endsWith(':shape');

  // Parse current target to get layer and parameter
  const { targetType, layerId, paramId } = useMemo(() => {
    if (!track.targetId) return { targetType: null, layerId: null, paramId: null };
    
    if (track.targetId.startsWith('global:')) {
      return { targetType: 'global', layerId: null, paramId: track.targetId.replace('global:', '') };
    }
    if (track.targetId.startsWith('layer:')) {
      const parts = track.targetId.split(':');
      return { targetType: 'layer', layerId: parts[1], paramId: parts[2] };
    }
    return { targetType: null, layerId: null, paramId: null };
  }, [track.targetId]);

  // Handle layer selection
  const handleLayerChange = useCallback((newLayerId) => {
    if (newLayerId === 'global') {
      // Switch to global - pick first global param
      const firstGlobal = globalParameters[0];
      onUpdateTrack?.({
        targetId: firstGlobal ? `global:${firstGlobal.id}` : '',
        range: firstGlobal?.range || { outputMin: 0, outputMax: 1 },
      });
    } else {
      // Switch to layer - keep current param or pick first
      const currentParam = layerParameters.find(p => p.id === paramId);
      const param = currentParam || layerParameters[0];
      onUpdateTrack?.({
        targetId: param ? `layer:${newLayerId}:${param.id}` : '',
        range: param?.range || { outputMin: 0, outputMax: 1 },
      });
    }
  }, [globalParameters, layerParameters, paramId, onUpdateTrack]);

  // Handle parameter selection
  const handleParamChange = useCallback((newParamId) => {
    if (targetType === 'global') {
      const param = globalParameters.find(p => p.id === newParamId);
      onUpdateTrack?.({
        targetId: `global:${newParamId}`,
        range: param?.range || { outputMin: 0, outputMax: 1 },
        type: param?.type || 'numeric',
        // Clear keyframes when changing parameter type to avoid incompatible data
        keyframes: [],
      });
    } else if (targetType === 'layer' && layerId) {
      const param = layerParameters.find(p => p.id === newParamId);
      const isShape = param?.type === 'shape' || newParamId === 'shape';
      const isColor = param?.type === 'color' || newParamId === 'color';
      onUpdateTrack?.({
        targetId: `layer:${layerId}:${newParamId}`,
        range: (isShape || isColor) ? null : (param?.range || { outputMin: 0, outputMax: 1 }),
        type: isShape ? 'shape' : (isColor ? 'color' : 'numeric'),
        // Always clear keyframes when changing parameter to avoid incompatible data
        keyframes: [],
      });
    }
  }, [targetType, layerId, globalParameters, layerParameters, onUpdateTrack]);

  // Handle name change
  const handleNameChange = useCallback((e) => {
    onUpdateTrack?.({ name: e.target.value });
  }, [onUpdateTrack]);

  // Handle enable toggle
  const handleToggleEnabled = useCallback(() => {
    onUpdateTrack?.({ enabled: !track.enabled });
  }, [track.enabled, onUpdateTrack]);

  // Handle range change
  const handleRangeChange = useCallback((field, value) => {
    onUpdateTrack?.({
      range: {
        ...track.range,
        [field]: Number(value) || 0,
      },
    });
  }, [track.range, onUpdateTrack]);

  return (
    <div
      className="timeline-track-row"
      style={{
        display: 'flex',
        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
        background: track.enabled ? 'transparent' : 'rgba(0, 0, 0, 0.2)',
        opacity: track.enabled ? 1 : 0.6,
      }}
    >
      {/* Track header */}
      <div
        className="timeline-track-header"
        style={{
          width: 200,
          minWidth: 200,
          position: 'sticky',
          left: 0,
          zIndex: 6,
          background: 'rgba(30, 30, 40, 0.95)',
          padding: '8px',
          borderRight: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}
      >
        {/* Track name and controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {/* Color indicator */}
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: 2,
              background: track.color || '#4fc3f7',
              cursor: 'pointer',
            }}
            onClick={() => {
              // Cycle through colors
              const colors = ['#4fc3f7', '#81c784', '#ffb74d', '#f06292', '#ba68c8', '#4db6ac', '#fff176', '#ff8a65'];
              const currentIndex = colors.indexOf(track.color);
              const nextColor = colors[(currentIndex + 1) % colors.length];
              onUpdateTrack?.({ color: nextColor });
            }}
            title="Click to change color"
          />
          
          {/* Enable toggle */}
          <input
            type="checkbox"
            checked={track.enabled}
            onChange={handleToggleEnabled}
            style={{ cursor: 'pointer' }}
            title={track.enabled ? 'Disable track' : 'Enable track'}
          />
          
          {/* Track name */}
          <input
            type="text"
            value={track.name || ''}
            onChange={handleNameChange}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              color: 'white',
              fontSize: '0.75rem',
              fontWeight: 500,
              padding: '2px 4px',
              minWidth: 0,
            }}
            placeholder="Track name"
          />
          
          {/* Expand/collapse */}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.5)',
              fontSize: '0.7rem',
              cursor: 'pointer',
              padding: '2px',
            }}
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? '▼' : '▶'}
          </button>
          
          {/* Delete button */}
          <button
            type="button"
            onClick={onRemoveTrack}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(244, 67, 54, 0.7)',
              fontSize: '0.7rem',
              cursor: 'pointer',
              padding: '2px',
            }}
            title="Delete track"
          >
            ✕
          </button>
        </div>

        {/* Layer/Global selector */}
        {isExpanded && (
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <select
              value={targetType === 'global' ? 'global' : (layerId || '')}
              onChange={(e) => handleLayerChange(e.target.value)}
              style={{
                flex: 1,
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: 3,
                padding: '3px 4px',
                color: 'white',
                fontSize: '0.65rem',
                cursor: 'pointer',
              }}
            >
              <option value="">Select target...</option>
              <option value="global">🌐 Global</option>
              {layers.map((layer, i) => (
                <option key={layer.id || i} value={layer.id || i}>
                  {layer.name || `Layer ${i + 1}`}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Parameter selector */}
        {isExpanded && (targetType === 'global' || layerId) && (
          <select
            value={paramId || ''}
            onChange={(e) => handleParamChange(e.target.value)}
            style={{
              width: '100%',
              background: 'rgba(0, 0, 0, 0.3)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: 3,
              padding: '3px 4px',
              color: 'white',
              fontSize: '0.65rem',
              cursor: 'pointer',
            }}
          >
            <option value="">Select parameter...</option>
            {(targetType === 'global' ? globalParameters : layerParameters).map((param) => (
              <option key={param.id} value={param.id}>
                {param.label}
              </option>
            ))}
          </select>
        )}

        {/* Range controls (hidden for shape tracks) */}
        {isExpanded && track.targetId && !isShapeTrack && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.6rem' }}>
            <span style={{ color: 'rgba(255, 255, 255, 0.4)' }}>Range:</span>
            <input
              type="number"
              value={track.range?.outputMin ?? 0}
              onChange={(e) => handleRangeChange('outputMin', e.target.value)}
              step="0.1"
              style={{
                width: 45,
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: 3,
                padding: '2px 4px',
                color: 'white',
                fontSize: '0.6rem',
              }}
            />
            <span style={{ color: 'rgba(255, 255, 255, 0.3)' }}>→</span>
            <input
              type="number"
              value={track.range?.outputMax ?? 1}
              onChange={(e) => handleRangeChange('outputMax', e.target.value)}
              step="0.1"
              style={{
                width: 45,
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: 3,
                padding: '2px 4px',
                color: 'white',
                fontSize: '0.6rem',
              }}
            />
          </div>
        )}
        {/* Shape track info and capture button */}
        {isExpanded && isShapeTrack && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.6rem' }}>
              <button
                type="button"
                onClick={() => onCaptureShapeKeyframe?.(track.id, layerId)}
                style={{
                  background: 'rgba(76, 175, 80, 0.3)',
                  border: '1px solid rgba(76, 175, 80, 0.5)',
                  borderRadius: 3,
                  padding: '3px 6px',
                  color: '#a5d6a7',
                  fontSize: '0.6rem',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
                title="Capture current shape at playhead position (K)"
              >
                ⬡ Capture
              </button>
              <span style={{ color: 'rgba(255, 255, 255, 0.5)', fontStyle: 'italic' }}>
                {track.keyframes?.length || 0} keyframe{(track.keyframes?.length || 0) !== 1 ? 's' : ''}
              </span>
            </div>
            {/* Category toggles for shape tracks */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.55rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '2px', color: 'rgba(255, 255, 255, 0.7)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={track.categories?.shape !== false}
                  onChange={(e) => onUpdateTrack?.({
                    categories: { ...(track.categories || {}), shape: e.target.checked }
                  })}
                  style={{ width: 10, height: 10, cursor: 'pointer' }}
                />
                Shape
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '2px', color: 'rgba(255, 255, 255, 0.7)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={track.categories?.animation === true}
                  onChange={(e) => onUpdateTrack?.({
                    categories: { ...(track.categories || {}), animation: e.target.checked }
                  })}
                  style={{ width: 10, height: 10, cursor: 'pointer' }}
                />
                Anim
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '2px', color: 'rgba(255, 255, 255, 0.7)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={track.categories?.color === true}
                  onChange={(e) => onUpdateTrack?.({
                    categories: { ...(track.categories || {}), color: e.target.checked }
                  })}
                  style={{ width: 10, height: 10, cursor: 'pointer' }}
                />
                Color
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Curve editor */}
      <div
        className="timeline-track-curve"
        style={{
          flex: 1,
          height: isExpanded ? height : 30,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <TimelineCurveEditor
          track={track}
          lengthSeconds={lengthSeconds}
          positionSeconds={positionSeconds}
          pixelsPerSecond={pixelsPerSecond}
          scrollLeft={scrollLeft}
          timelineWidth={timelineWidth}
          height={isExpanded ? height : 30}
          onAddKeyframe={onAddKeyframe}
          onUpdateKeyframe={onUpdateKeyframe}
          onRemoveKeyframe={onRemoveKeyframe}
          onCopyKeyframe={onCopyKeyframe}
          onPasteKeyframe={onPasteKeyframe}
          hasClipboard={hasClipboard}
          onSeek={onSeek}
          collapsed={!isExpanded}
        />
      </div>
    </div>
  );
};

export default TimelineTrackRow;
