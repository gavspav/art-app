import React, { useCallback, useState, useMemo } from 'react';
import { Camera, ChevronDown, ChevronRight, Sparkles, Trash2 } from 'lucide-react';
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
  index: _index,
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
  onCaptureGlobalShapeKeyframe,
  onGenerateGlobalVariationKeyframe,
  onRerollGlobalShapeKeyframe,
  onCopyKeyframe,
  onPasteKeyframe,
  onPasteKeyframeToTrack,
  onRerollVariation,
  onRerollAllVariations,
  onRerollAllGlobalShapeKeyframes,
  hasClipboard = false,
  clipboardTrackType = null,
  clipboardIsMultiSelection = false,
  clipboardSourceTargetId = null,
  allShapeTracks = [],
  onSeek,
  onSelectKeyframe,
  height = 100,
  marqueeMode = false,
  selectedKeyframeIds = new Set(),
  pasteTimeSeconds = null,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const isShapeTrack = track?.type === 'shape' || track?.targetId?.endsWith(':shape');
  const isGlobalShapeTrack = track?.type === 'globalShape';
  const isColorTrack = track?.type === 'color';
  const isNumericTrack = !isShapeTrack && !isColorTrack && !isGlobalShapeTrack;

  // Count stored parameters with keyframes (excluding the currently active one)
  const storedParamCount = useMemo(() => {
    if (!track.paramKeyframes) return 0;
    return Object.entries(track.paramKeyframes).filter(
      ([tid, stored]) => tid !== track.targetId && stored?.keyframes?.length > 0
    ).length;
  }, [track.paramKeyframes, track.targetId]);

  // Parse current target to get layer and parameter
  // Note: layerId here is actually the layer NAME (for stable targeting across layer recreation)
  const { targetType, layerId, paramId } = useMemo(() => {
    if (!track.targetId) return { targetType: null, layerId: null, paramId: null };
    
    if (track.targetId.startsWith('global:')) {
      return { targetType: 'global', layerId: null, paramId: track.targetId.replace('global:', '') };
    }
    if (track.targetId.startsWith('layer:')) {
      const parts = track.targetId.split(':');
      // parts[1] is the layer name (e.g., "Layer 1") for stable targeting
      return { targetType: 'layer', layerId: parts[1], paramId: parts[2] };
    }
    return { targetType: null, layerId: null, paramId: null };
  }, [track.targetId]);

  // Handle layer selection - uses layer NAME for stable targeting
  const handleLayerChange = useCallback((newLayerName) => {
    // Save current keyframes before switching
    const currentTargetId = track.targetId;
    const savedParamKeyframes = { ...(track.paramKeyframes || {}) };
    if (currentTargetId && track.keyframes?.length > 0) {
      savedParamKeyframes[currentTargetId] = {
        keyframes: [...track.keyframes],
        range: track.range ? { ...track.range } : null,
        type: track.type,
      };
    }

    if (newLayerName === 'global') {
      const firstGlobal = globalParameters[0];
      const newTargetId = firstGlobal ? `global:${firstGlobal.id}` : '';
      const stored = savedParamKeyframes[newTargetId];
      onUpdateTrack?.({
        targetId: newTargetId,
        range: stored?.range || firstGlobal?.range || { outputMin: 0, outputMax: 1 },
        keyframes: stored?.keyframes || [],
        type: stored?.type || (firstGlobal?.type || 'numeric'),
        paramKeyframes: savedParamKeyframes,
      });
    } else {
      const currentParam = layerParameters.find(p => p.id === paramId);
      const param = currentParam || layerParameters[0];
      const newTargetId = param ? `layer:${newLayerName}:${param.id}` : '';
      const stored = savedParamKeyframes[newTargetId];
      onUpdateTrack?.({
        targetId: newTargetId,
        range: stored?.range || param?.range || { outputMin: 0, outputMax: 1 },
        keyframes: stored?.keyframes || [],
        type: stored?.type || (param?.type || 'numeric'),
        paramKeyframes: savedParamKeyframes,
      });
    }
  }, [globalParameters, layerParameters, paramId, onUpdateTrack, track.targetId, track.keyframes, track.range, track.type, track.paramKeyframes]);

  // Handle parameter selection
  // Saves current keyframes to paramKeyframes and restores stored keyframes for the new parameter
  const handleParamChange = useCallback((newParamId) => {
    // Save current keyframes before switching
    const currentTargetId = track.targetId;
    const savedParamKeyframes = { ...(track.paramKeyframes || {}) };
    if (currentTargetId && track.keyframes?.length > 0) {
      savedParamKeyframes[currentTargetId] = {
        keyframes: [...track.keyframes],
        range: track.range ? { ...track.range } : null,
        type: track.type,
      };
    }

    if (targetType === 'global') {
      const param = globalParameters.find(p => p.id === newParamId);
      const isColor = param?.type === 'color';
      const newTargetId = `global:${newParamId}`;
      const stored = savedParamKeyframes[newTargetId];
      onUpdateTrack?.({
        targetId: newTargetId,
        range: stored?.range ?? (isColor ? null : (param?.range || { outputMin: 0, outputMax: 1 })),
        type: stored?.type || (isColor ? 'color' : (param?.type || 'numeric')),
        keyframes: stored?.keyframes || [],
        paramKeyframes: savedParamKeyframes,
      });
    } else if (targetType === 'layer' && layerId) {
      const param = layerParameters.find(p => p.id === newParamId);
      const isShape = param?.type === 'shape' || newParamId === 'shape';
      const isColor = param?.type === 'color' || newParamId === 'color';
      const newTargetId = `layer:${layerId}:${newParamId}`;
      const stored = savedParamKeyframes[newTargetId];
      onUpdateTrack?.({
        targetId: newTargetId,
        range: stored?.range ?? ((isShape || isColor) ? null : (param?.range || { outputMin: 0, outputMax: 1 })),
        type: stored?.type || (isShape ? 'shape' : (isColor ? 'color' : 'numeric')),
        keyframes: stored?.keyframes || [],
        paramKeyframes: savedParamKeyframes,
      });
    }
  }, [targetType, layerId, globalParameters, layerParameters, onUpdateTrack, track.targetId, track.keyframes, track.range, track.type, track.paramKeyframes]);

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
      className={`timeline-track-row ${track.enabled ? '' : 'is-disabled'}`}
      style={{
        background: track.enabled ? 'transparent' : 'rgba(0, 0, 0, 0.2)',
        opacity: track.enabled ? 1 : 0.6,
      }}
    >
      {/* Track header */}
      <div
        className="timeline-track-header"
        style={{
          width: 232,
          minWidth: 232,
        }}
      >
        {/* Track name and controls */}
        <div className="timeline-track-header__main">
          {/* Color indicator */}
          <button
            type="button"
            className="timeline-track-header__color"
            style={{
              background: track.color || '#4fc3f7',
            }}
            onClick={() => {
              // Cycle through colors
              const colors = ['#4fc3f7', '#81c784', '#ffb74d', '#f06292', '#ba68c8', '#4db6ac', '#fff176', '#ff8a65'];
              const currentIndex = colors.indexOf(track.color);
              const nextColor = colors[(currentIndex + 1) % colors.length];
              onUpdateTrack?.({ color: nextColor });
            }}
            title="Click to change color"
            aria-label={`Change color for ${track?.name || 'track'}`}
          />
          
          {/* Enable toggle */}
          <input
            type="checkbox"
            checked={track.enabled}
            onChange={handleToggleEnabled}
            style={{ cursor: 'pointer' }}
            title={track.enabled ? 'Disable track' : 'Enable track'}
            aria-label={track.enabled ? 'Disable track' : 'Enable track'}
          />
          
          {/* Track name */}
          <input
            type="text"
            value={track.name || ''}
            onChange={handleNameChange}
            aria-label="Track name"
            className="timeline-track-header__name"
            style={{ border: 'none' }}
            placeholder="Track name"
          />
          
          {/* Expand/collapse */}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="timeline-track-header__toggle"
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
          
          {/* Delete button */}
          <button
            type="button"
            onClick={onRemoveTrack}
            className="timeline-track-header__icon timeline-track-header__icon--danger"
            title="Delete track"
          >
            <Trash2 size={15} />
          </button>
        </div>

        {/* Layer/Global selector */}
        {isExpanded && (
          <div className="timeline-track-header__row">
            <select
              value={targetType === 'global' ? 'global' : (layerId || '')}
              onChange={(e) => handleLayerChange(e.target.value)}
              aria-label="Track target"
              className="timeline-track-header__select"
              style={{ flex: 1 }}
            >
              <option value="">Select target...</option>
              <option value="global">Global</option>
              {/* Use layer NAME as value for stable targeting across layer recreation */}
              {layers.map((layer, i) => {
                const layerName = layer.name || `Layer ${i + 1}`;
                return (
                  <option key={layer.id || i} value={layerName}>
                    {layerName}
                  </option>
                );
              })}
            </select>
          </div>
        )}

        {/* Parameter selector */}
        {isExpanded && (targetType === 'global' || layerId) && (
          <div className="timeline-track-header__row">
            <select
              value={paramId || ''}
              onChange={(e) => handleParamChange(e.target.value)}
              aria-label="Track parameter"
              className="timeline-track-header__select"
              style={{ flex: 1 }}
            >
              <option value="">Select parameter...</option>
              {(targetType === 'global' ? globalParameters : layerParameters).map((param) => {
                const paramTargetId = targetType === 'global'
                  ? `global:${param.id}`
                  : `layer:${layerId}:${param.id}`;
                const hasStored = track.paramKeyframes?.[paramTargetId]?.keyframes?.length > 0;
                return (
                  <option key={param.id} value={param.id}>
                    {hasStored ? '\u2022 ' : ''}{param.label}
                  </option>
                );
              })}
            </select>
            {storedParamCount > 0 && (
              <span
                title={`${storedParamCount} other param${storedParamCount > 1 ? 's' : ''} with keyframes`}
                className="timeline-track-header__badge"
              >
                +{storedParamCount}
              </span>
            )}
          </div>
        )}

        {/* Range controls (hidden for shape tracks) */}
        {isExpanded && track.targetId && isNumericTrack && (
          <div className="timeline-track-header__row" style={{ fontSize: '0.6rem' }}>
            <span className="timeline-track-header__range-label">Range:</span>
            <input
              type="number"
              value={track.range?.outputMin ?? 0}
              onChange={(e) => handleRangeChange('outputMin', e.target.value)}
              step="0.1"
              aria-label="Track minimum output"
              className="timeline-track-header__range-input"
              style={{ width: 52 }}
            />
            <span className="timeline-track-header__meta">→</span>
            <input
              type="number"
              value={track.range?.outputMax ?? 1}
              onChange={(e) => handleRangeChange('outputMax', e.target.value)}
              step="0.1"
              aria-label="Track maximum output"
              className="timeline-track-header__range-input"
              style={{ width: 52 }}
            />
          </div>
        )}
        {/* Energy band selector */}
        {isExpanded && track.targetId && (
          <div className="timeline-track-header__row" style={{ fontSize: '0.6rem' }}>
            <span className="timeline-track-header__range-label">Energy:</span>
            <select
              value={track.energyBand || 'total'}
              onChange={(e) => onUpdateTrack?.({ energyBand: e.target.value })}
              aria-label="Energy band"
              className="timeline-track-header__select"
              style={{ flex: 1 }}
            >
              <option value="total">Total</option>
              <option value="low">Low (bass)</option>
              <option value="mid">Mid (vocals)</option>
              <option value="high">High (cymbals)</option>
            </select>
          </div>
        )}
        {/* Shape track info and capture button */}
        {isExpanded && isShapeTrack && !isGlobalShapeTrack && (
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
                <Camera size={12} style={{ marginRight: 4 }} />
                Capture
              </button>
              <span style={{ color: 'rgba(255, 255, 255, 0.5)', fontStyle: 'italic' }}>
                {track.keyframes?.length || 0} kf
              </span>
              {track.keyframes?.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (track.keyframes && onRemoveKeyframe) {
                      for (const kf of track.keyframes) {
                        onRemoveKeyframe(kf.id);
                      }
                    }
                  }}
                  style={{
                    background: 'rgba(244, 67, 54, 0.15)',
                    border: '1px solid rgba(244, 67, 54, 0.35)',
                    borderRadius: 3,
                    padding: '2px 5px',
                    color: '#ef9a9a',
                    fontSize: '0.55rem',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                  title="Delete all keyframes on this track"
                >
                  Clear All
                </button>
              )}
            </div>
            {/* Category toggles for shape tracks */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.55rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '2px', color: 'rgba(255, 255, 255, 0.7)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={track.categories?.shape !== false}
                  onChange={(e) => onUpdateTrack?.({
                    categories: { ...({ shape: true, animation: false, color: true, ...(track.categories || {}) }), shape: e.target.checked, color: true }
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
                    categories: { ...({ shape: true, animation: false, color: true, ...(track.categories || {}) }), animation: e.target.checked, color: true }
                  })}
                  style={{ width: 10, height: 10, cursor: 'pointer' }}
                />
                Anim
              </label>
            </div>
          </div>
        )}
        {/* Global Shape track controls */}
        {isExpanded && isGlobalShapeTrack && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.6rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => onCaptureGlobalShapeKeyframe?.(track.id)}
                style={{
                  background: 'rgba(76, 175, 80, 0.3)',
                  border: '1px solid rgba(76, 175, 80, 0.5)',
                  borderRadius: 3,
                  padding: '3px 6px',
                  color: '#a5d6a7',
                  fontSize: '0.55rem',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
                title="Capture current state of all layers at playhead"
              >
                <Camera size={12} style={{ marginRight: 4 }} />
                Capture
              </button>
              <button
                type="button"
                onClick={() => onGenerateGlobalVariationKeyframe?.(track.id)}
                style={{
                  background: 'rgba(33, 150, 243, 0.3)',
                  border: '1px solid rgba(33, 150, 243, 0.5)',
                  borderRadius: 3,
                  padding: '3px 6px',
                  color: '#90caf9',
                  fontSize: '0.55rem',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
                title="Generate new variation of all layers using variation sliders"
              >
                <Sparkles size={12} style={{ marginRight: 4 }} />
                Generate
              </button>
              <span style={{ color: 'rgba(255, 255, 255, 0.5)', fontStyle: 'italic', fontSize: '0.55rem' }}>
                {track.keyframes?.length || 0} kf · {layers.length} layers
              </span>
              {track.keyframes?.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (track.keyframes && onRemoveKeyframe) {
                      for (const kf of track.keyframes) {
                        onRemoveKeyframe(kf.id);
                      }
                    }
                  }}
                  style={{
                    background: 'rgba(244, 67, 54, 0.15)',
                    border: '1px solid rgba(244, 67, 54, 0.35)',
                    borderRadius: 3,
                    padding: '2px 5px',
                    color: '#ef9a9a',
                    fontSize: '0.55rem',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                  title="Delete all keyframes on this track"
                >
                  Clear All
                </button>
              )}
            </div>
            {/* Category toggles for global shape tracks */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.55rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '2px', color: 'rgba(255, 255, 255, 0.7)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={track.categories?.shape !== false}
                  onChange={(e) => onUpdateTrack?.({
                    categories: { ...({ shape: true, animation: false, color: true, ...(track.categories || {}) }), shape: e.target.checked, color: true }
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
                    categories: { ...({ shape: true, animation: false, color: true, ...(track.categories || {}) }), animation: e.target.checked, color: true }
                  })}
                  style={{ width: 10, height: 10, cursor: 'pointer' }}
                />
                Anim
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
          onPasteKeyframeToTrack={onPasteKeyframeToTrack}
          onRerollVariation={(keyframeId) => {
            if (isGlobalShapeTrack) {
              onRerollGlobalShapeKeyframe?.(track.id, keyframeId);
            } else {
              onRerollVariation?.(keyframeId);
            }
          }}
          onRerollAllVariations={() => {
            if (isGlobalShapeTrack) {
              onRerollAllGlobalShapeKeyframes?.(track.id);
            } else {
              onRerollAllVariations?.(track.id);
            }
          }}
          hasClipboard={hasClipboard}
          clipboardTrackType={clipboardTrackType}
          clipboardIsMultiSelection={clipboardIsMultiSelection}
          clipboardSourceTargetId={clipboardSourceTargetId}
          allShapeTracks={allShapeTracks}
          onSeek={onSeek}
          onSelectKeyframe={onSelectKeyframe}
          collapsed={!isExpanded}
          marqueeMode={marqueeMode}
          selectedKeyframeIds={selectedKeyframeIds}
          pasteTimeSeconds={pasteTimeSeconds}
        />
      </div>
    </div>
  );
};

export default TimelineTrackRow;
