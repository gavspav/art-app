import React, { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import { useTimeline } from '../../context/TimelineContext.jsx';
import { useAppState } from '../../context/AppStateContext.jsx';
import TimelineWaveform from './TimelineWaveform.jsx';
import TimelineTrackRow from './TimelineTrackRow.jsx';
import TimelineTransport from './TimelineTransport.jsx';

/**
 * TimelinePanel - Main timeline UI component
 * 
 * Displays in the lower half of the screen when visible.
 * Contains:
 * - Transport controls (play, pause, stop, time display)
 * - Audio waveform display (optional)
 * - Track list with curve editors
 * - Scrollable timeline area
 */
const TimelinePanel = ({
  layers = [],
  onClose,
  isRecording = false,
  onStartRecording,
  onStopRecording,
}) => {
  const timeline = useTimeline();
  const { getCurrentAppState, loadAppState, setIsFrozen, isFrozen } = useAppState() || {};
  const containerRef = useRef(null);
  const tracksContainerRef = useRef(null);
  const fileInputRef = useRef(null);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [showWaveform, setShowWaveform] = useState(true);
  const {
    session,
    tracks,
    lengthSeconds,
    loop,
    audio,
    startPreset,
    setStartPreset,
    clearStartPreset,
    isPlaying,
    positionSeconds,
    visible,
    zoom,
    scrollLeft,
    play,
    pause,
    stop,
    togglePlay,
    seekTo,
    setLengthSeconds,
    setLoop,
    addTrack,
    updateTrack,
    removeTrack,
    addKeyframe,
    updateKeyframe,
    removeKeyframe,
    addShapeKeyframe,
    keyframeClipboard,
    copyKeyframe,
    pasteKeyframe,
    pasteKeyframeToTrack,
    setAudio,
    clearAudio,
    setZoom,
    setScrollLeft,
    setVisible,
    getPositionSeconds,
  } = timeline || {};

  const hasTimelinePreset = !!(startPreset && startPreset.appState);

  // Compute all shape tracks for paste menu
  const allShapeTracks = useMemo(() => {
    if (!Array.isArray(tracks)) return [];
    return tracks.filter(t => t.type === 'shape' || t.targetId?.endsWith(':shape'));
  }, [tracks]);

  // Get clipboard track type and source for paste menu logic
  const clipboardTrackType = keyframeClipboard?.trackType || null;
  const clipboardSourceTargetId = keyframeClipboard?.trackTargetId || null;

  // Calculate pixels per second based on container width and zoom
  const [containerWidth, setContainerWidth] = useState(800);
  
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

  // Pixels per second (zoom level)
  const pixelsPerSecond = useMemo(() => {
    // Base: fit entire timeline in view at zoom=1
    const basePixelsPerSecond = (containerWidth - 200) / Math.max(1, lengthSeconds);
    return basePixelsPerSecond * (zoom || 1);
  }, [containerWidth, lengthSeconds, zoom]);

  // Keep pixelsPerSecond in a ref for RAF access
  const pixelsPerSecondRef = useRef(pixelsPerSecond);
  useEffect(() => { pixelsPerSecondRef.current = pixelsPerSecond; }, [pixelsPerSecond]);

  // Auto-scroll to keep playhead visible during playback
  useEffect(() => {
    if (!isPlaying || !getPositionSeconds) return;
    
    let rafId;
    
    const autoScroll = () => {
      const pos = getPositionSeconds();
      const pps = pixelsPerSecondRef.current;
      const xAbsolute = pos * pps;
      
      // Auto-scroll to keep playhead visible during playback
      const container = tracksContainerRef.current;
      if (container) {
        const currentScroll = container.scrollLeft;
        const viewWidth = container.clientWidth - 200; // Subtract track labels width
        const playheadScreenX = xAbsolute - currentScroll;
        
        // Scroll when playhead reaches right 20% of view
        const scrollThreshold = viewWidth * 0.8;
        if (playheadScreenX > scrollThreshold) {
          // Scroll to put playhead at 20% from left
          const targetScroll = Math.max(0, xAbsolute - viewWidth * 0.2);
          container.scrollLeft = targetScroll;
        }
        // Also handle if playhead is before current view (e.g., after loop)
        else if (playheadScreenX < 0) {
          container.scrollLeft = Math.max(0, xAbsolute - viewWidth * 0.1);
        }
      }
      
      rafId = requestAnimationFrame(autoScroll);
    };
    
    rafId = requestAnimationFrame(autoScroll);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [isPlaying, getPositionSeconds]);

  // Scroll to show playhead when position changes significantly (e.g., stop/rewind)
  useEffect(() => {
    if (isPlaying) return; // Don't interfere with playback auto-scroll
    
    const xAbsolute = positionSeconds * pixelsPerSecond;
    const xScreen = xAbsolute - (scrollLeft || 0);
    const viewWidth = containerWidth - 200;
    
    // If playhead is off-screen, scroll to show it
    if (xScreen < 0 || xScreen > viewWidth) {
      // Center the playhead in view, or scroll to 0 if at start
      const newScroll = positionSeconds < 0.1 ? 0 : Math.max(0, xAbsolute - viewWidth / 2);
      if (setScrollLeft) {
        setScrollLeft(newScroll);
      }
      // Also scroll the DOM element
      if (tracksContainerRef.current) {
        tracksContainerRef.current.scrollLeft = newScroll;
      }
    }
  }, [positionSeconds, isPlaying, pixelsPerSecond, scrollLeft, containerWidth, setScrollLeft]);

  // Total timeline width in pixels
  const timelineWidth = useMemo(() => {
    return Math.max(containerWidth - 200, lengthSeconds * pixelsPerSecond);
  }, [containerWidth, lengthSeconds, pixelsPerSecond]);

  // Handle scroll to sync horizontal scroll between ruler, waveform, and tracks
  const handleScroll = useCallback((e) => {
    if (setScrollLeft) {
      setScrollLeft(e.target.scrollLeft);
    }
  }, [setScrollLeft]);
  
  // Keep scroll position in sync with persisted setting (e.g., after reload)
  useEffect(() => {
    const scroller = tracksContainerRef.current;
    if (!scroller) return;
    const target = scrollLeft || 0;
    if (Math.abs(scroller.scrollLeft - target) > 1) {
      scroller.scrollLeft = target;
    }
  }, [scrollLeft]);

  // Handle click on timeline to seek
  const handleTimelineClick = useCallback((e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + (scrollLeft || 0);
    const time = x / pixelsPerSecond;
    if (seekTo) {
      seekTo(Math.max(0, Math.min(lengthSeconds, time)));
    }
  }, [pixelsPerSecond, scrollLeft, seekTo, lengthSeconds]);

  // Handle zoom with mouse wheel
  const handleWheel = useCallback((e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      if (setZoom) {
        setZoom((zoom || 1) * delta);
      }
    }
  }, [zoom, setZoom]);

  // When starting playback from the beginning, always unfreeze the scene
  const handlePlay = useCallback(() => {
    if (!isPlaying && (positionSeconds ?? 0) <= 0.001 && setIsFrozen) {
      setIsFrozen(false);
    }
    if (play) play();
  }, [isPlaying, positionSeconds, play, setIsFrozen]);

  const handleTogglePlay = useCallback(() => {
    if (!isPlaying && (positionSeconds ?? 0) <= 0.001 && setIsFrozen) {
      setIsFrozen(false);
    }
    if (togglePlay) togglePlay();
  }, [isPlaying, positionSeconds, togglePlay, setIsFrozen]);

  // Global parameters - per user list
  const globalParameters = useMemo(() => [
    { id: 'globalSpeedMultiplier', label: 'Speed', range: { outputMin: 0, outputMax: 5 } },
    { id: 'globalPaletteIndex', label: 'Palette', range: { outputMin: 0, outputMax: 20 } },
    { id: 'globalBlendMode', label: 'Style', range: { outputMin: 0, outputMax: 1 } },
    { id: 'globalOpacity', label: 'Opacity', range: { outputMin: 0, outputMax: 1 } },
    { id: 'layersCount', label: 'Layers', range: { outputMin: 1, outputMax: 20 } },
    { id: 'variationPosition', label: 'Position Variation', range: { outputMin: 0, outputMax: 1 } },
    { id: 'variationShape', label: 'Shape Variation', range: { outputMin: 0, outputMax: 1 } },
    { id: 'variationAnim', label: 'Animation Variation', range: { outputMin: 0, outputMax: 1 } },
    { id: 'variationColor', label: 'Colour Variation', range: { outputMin: 0, outputMax: 1 } },
    { id: 'variationScale', label: 'Scale Variation', range: { outputMin: 0, outputMax: 1 } },
    { id: 'morphProgress', label: 'Morph Progress', range: { outputMin: 0, outputMax: 1 } },
  ], []);

  // Layer parameters - per user list
  const layerParameters = useMemo(() => [
    { id: 'shape', label: '⬡ Shape (nodes)', type: 'shape' }, // Shape track - no range
    { id: 'numSides', label: 'Sides', range: { outputMin: 3, outputMax: 24 } },
    { id: 'curviness', label: 'Curviness', range: { outputMin: 0, outputMax: 1 } },
    { id: 'radiusFactor', label: 'Size', range: { outputMin: 0, outputMax: 2 } },
    { id: 'radiusFactorX', label: 'Size X', range: { outputMin: 0, outputMax: 2 } },
    { id: 'radiusFactorY', label: 'Size Y', range: { outputMin: 0, outputMax: 2 } },
    { id: 'xOffset', label: 'X Offset', range: { outputMin: -1, outputMax: 1 } },
    { id: 'yOffset', label: 'Y Offset', range: { outputMin: -1, outputMax: 1 } },
    { id: 'rotation', label: 'Rotate', range: { outputMin: -180, outputMax: 180 } },
    { id: 'wobble', label: 'Wobble', range: { outputMin: 0, outputMax: 1 } },
    { id: 'noiseAmount', label: 'Noise', range: { outputMin: 0, outputMax: 1 } },
    // Movement style is treated as a discrete enum; timeline uses 0..4 to select styles
    { id: 'movementStyle', label: 'Movement Style', range: { outputMin: 0, outputMax: 4 } },
    { id: 'movementSpeed', label: 'Movement Speed', range: { outputMin: 0, outputMax: 5 } },
    { id: 'movementAngle', label: 'Angle', range: { outputMin: 0, outputMax: 360 } },
    { id: 'scaleSpeed', label: 'Z Speed', range: { outputMin: 0, outputMax: 1 } },
    { id: 'scaleMin', label: 'Z Min', range: { outputMin: 0, outputMax: 2 } },
    { id: 'scaleMax', label: 'Z Max', range: { outputMin: 0, outputMax: 3 } },
    { id: 'color', label: 'Layer Colour', type: 'color' },
  ], []);

  // Handle adding a new track
  const handleAddTrack = useCallback(() => {
    if (addTrack) {
      addTrack(`Track ${(tracks?.length || 0) + 1}`, '');
    }
  }, [addTrack, tracks?.length]);

  // Handle capturing a shape keyframe (extended to capture animation and color data)
  const handleCaptureShapeKeyframe = useCallback((trackId, layerIdOrName) => {
    if (!addShapeKeyframe || !layerIdOrName) return;
    
    // Find the layer to capture its current state
    // TimelineTrackRow now passes the layer NAME (e.g., 'Layer 2') for stable targeting,
    // so resolve by id OR name.
    const layer = layers.find(l => l?.id === layerIdOrName || l?.name === layerIdOrName);
    if (!layer) {
      console.warn('[Timeline] Cannot capture shape: layer not found', layerIdOrName);
      return;
    }
    
    // Find the track to check which categories are enabled
    const track = tracks?.find(t => t.id === trackId);
    const categories = track?.categories || { shape: true, animation: false, color: false };
    
    // Always capture shape data (nodes/subpaths) - this is the base requirement
    const { nodes, subpaths } = layer;
    if (!nodes && !subpaths) {
      console.warn('[Timeline] Cannot capture shape: layer has no nodes or subpaths', layerId);
      return;
    }
    
    // Deep clone the geometry to avoid reference issues
    const clonedNodes = nodes ? JSON.parse(JSON.stringify(nodes)) : null;
    const clonedSubpaths = subpaths ? JSON.parse(JSON.stringify(subpaths)) : null;
    
    // Build extras object based on enabled categories
    const extras = {};
    
    // Always capture position (for shape interpolation between screen positions)
    // Position includes x, y offsets and scale from layer.position
    extras.position = {
      x: layer.position?.x ?? 0.5,
      y: layer.position?.y ?? 0.5,
      scale: layer.position?.scale ?? 1,
      xOffset: layer.xOffset ?? 0,
      yOffset: layer.yOffset ?? 0,
    };
    
    // Always capture shape tab properties for tweening
    // These are the Layer Shape Tab controls: Sides, Curviness, Size, Size X, Size Y, Rotate
    extras.shapeParams = {
      numSides: layer.numSides ?? 6,
      curviness: layer.curviness ?? 1.0,
      radiusFactor: layer.radiusFactor ?? 0.125,
      radiusFactorX: layer.radiusFactorX ?? layer.radiusFactor ?? 0.125,
      radiusFactorY: layer.radiusFactorY ?? layer.radiusFactor ?? 0.125,
      rotation: layer.rotation ?? 0,
    };
    
    // Capture animation parameters if enabled
    if (categories.animation) {
      extras.animation = {
        movementStyle: layer.movementStyle ?? 'bounce',
        movementSpeed: layer.movementSpeed ?? 1,
        movementAngle: layer.movementAngle ?? 45,
        scaleSpeed: layer.scaleSpeed ?? 0.05,
        scaleMin: layer.scaleMin ?? 0,
        scaleMax: layer.scaleMax ?? 1.5,
        rotation: layer.rotation ?? 0,
        radiusFactor: layer.radiusFactor ?? 0.125,
      };
    }
    
    // Capture colors if enabled
    if (categories.color) {
      extras.colors = Array.isArray(layer.colors) 
        ? JSON.parse(JSON.stringify(layer.colors)) 
        : ['#0000FF'];
    }
    
    addShapeKeyframe(trackId, positionSeconds, clonedNodes, clonedSubpaths, '', extras);
  }, [addShapeKeyframe, layers, tracks, positionSeconds]);

  // Keyboard shortcut: 'c' to capture a shape keyframe for the active layer's shape track (if any)
  useEffect(() => {
    if (!visible) return;

    const handleKeyDown = (e) => {
      // Only plain 'c' (no modifiers) to avoid conflicts with copy, etc.
      if (e.key !== 'c' || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;

      const target = e.target;
      const isEditableTarget =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA');

      if (isEditableTarget) return;

      // Prevent default so it doesn't type into inputs if focus is on timeline
      e.preventDefault();

      if (!tracks || !tracks.length) return;
      if (!getCurrentAppState) return;

      const appState = getCurrentAppState();
      if (!appState) return;

      const selectedIndex = appState.selectedLayerIndex ?? 0;
      const activeLayer = layers?.[selectedIndex];
      if (!activeLayer) return;

      const layerName = activeLayer.name || `Layer ${selectedIndex + 1}`;

      // Find any shape tracks targeting this layer
      const shapeTracks = tracks.filter((track) => {
        if (!track.enabled || !track.targetId) return false;
        const isShape = track.type === 'shape' || track.targetId.endsWith(':shape');
        if (!isShape) return false;
        // targetId is of form 'layer:<Layer Name>:shape'
        return track.targetId.startsWith(`layer:${layerName}:`);
      });

      if (!shapeTracks.length) return;

      // Capture for each matching shape track at current playhead time
      shapeTracks.forEach((track) => {
        // Reuse the existing capture helper so extras (position, shapeParams, etc.) are included
        handleCaptureShapeKeyframe(track.id, layerName);
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    visible,
    tracks,
    layers,
    getCurrentAppState,
    handleCaptureShapeKeyframe,
  ]);

  // Handle timeline preset button click (save/recall/clear)
  const handleTimelinePresetClick = useCallback((event) => {
    if (!getCurrentAppState || !loadAppState || !setStartPreset) return;

    const hasPreset = !!(startPreset && startPreset.appState);

    // Alt+Click -> clear preset
    if (event.altKey) {
      clearStartPreset?.();
      return;
    }

    // Shift+Click or empty -> save current scene
    if (event.shiftKey || !hasPreset) {
      const snapshot = getCurrentAppState();
      if (!snapshot) return;
      const { isFrozen: _ignoredFreeze, ...rest } = snapshot;
      setStartPreset({ appState: rest, savedAt: Date.now() });
      return;
    }

    // Normal click with existing preset -> recall
    if (hasPreset && startPreset.appState) {
      const presetState = {
        ...startPreset.appState,
        // Always unfreeze when recalling a timeline preset so animation can run
        isFrozen: false,
      };
      loadAppState(presetState);
    }
  }, [
    startPreset,
    getCurrentAppState,
    loadAppState,
    setStartPreset,
    clearStartPreset,
  ]);

  // Handle audio file load
  const handleLoadAudio = useCallback(async (file) => {
    if (!file) return;
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      // Compute peaks for waveform display
      const channelData = audioBuffer.getChannelData(0);
      const sampleRate = audioBuffer.sampleRate;
      const duration = audioBuffer.duration;
      
      // Downsample to ~2000 peaks
      const peakCount = Math.min(2000, Math.floor(duration * 10));
      const samplesPerPeak = Math.floor(channelData.length / peakCount);
      const peaks = [];
      
      for (let i = 0; i < peakCount; i++) {
        const start = i * samplesPerPeak;
        const end = Math.min(start + samplesPerPeak, channelData.length);
        let max = 0;
        for (let j = start; j < end; j++) {
          const abs = Math.abs(channelData[j]);
          if (abs > max) max = abs;
        }
        peaks.push(max);
      }
      
      setAudio({
        src: URL.createObjectURL(file),
        durationSeconds: duration,
        peaks,
        offsetSeconds: 0,
        buffer: audioBuffer,
        fileName: file.name,
        fileType: file.type,
      });
      
      // Optionally adjust timeline length to match audio
      if (setLengthSeconds && duration > lengthSeconds) {
        setLengthSeconds(duration);
      }
      
      audioContext.close();
    } catch (error) {
      console.error('Failed to load audio file:', error);
      alert('Failed to load audio file. Please try a different file.');
    }
  }, [setAudio, setLengthSeconds, lengthSeconds]);

  if (!visible) return null;

  const contentWidth = useMemo(() => {
    const base = lengthSeconds * pixelsPerSecond;
    return Math.max(timelineWidth || 0, base, 800);
  }, [timelineWidth, lengthSeconds, pixelsPerSecond]);
  const WAVEFORM_HEIGHT = 80;

  return (
    <div
      ref={containerRef}
      className="timeline-panel"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 300,
        background: 'rgba(20, 20, 30, 0.98)',
        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
      onWheel={handleWheel}
    >
      {/* Header with transport controls */}
      <TimelineTransport
        isPlaying={isPlaying}
        positionSeconds={positionSeconds}
        lengthSeconds={lengthSeconds}
        loop={loop}
        onPlay={handlePlay}
        onPause={pause}
        onStop={stop}
        onTogglePlay={handleTogglePlay}
        onSeek={seekTo}
        onSetLength={setLengthSeconds}
        onSetLoop={setLoop}
        onLoadAudio={handleLoadAudio}
        onClearAudio={clearAudio}
        hasAudio={!!audio}
        zoom={zoom}
        onZoomChange={setZoom}
        onClose={onClose}
      />

      {/* Tracks + waveform area */}
      <div
        ref={tracksContainerRef}
        className="timeline-tracks-container"
        style={{
          flex: 1,
          overflowX: 'auto',
          overflowY: 'auto',
          position: 'relative',
        }}
        onScroll={handleScroll}
      >
        <div style={{ minWidth: contentWidth + 200, width: contentWidth + 200 }}>
          {/* Waveform row (acts like first track) */}
          {audio && showWaveform && (
            <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.05)', position: 'sticky', top: 0, zIndex: 12, background: 'rgba(20,20,30,0.98)' }}>
              <div style={{ width: 200, minWidth: 200, borderRight: '1px solid rgba(255,255,255,0.1)', padding: '6px 8px', fontSize: '0.7rem', color: 'rgba(255,255,255,0.7)', position: 'sticky', left: 0, background: 'rgba(30,30,40,0.98)', zIndex: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowWaveform(false)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'rgba(255,255,255,0.7)',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    padding: '2px 4px',
                  }}
                  title="Hide waveform"
                >
                  ◀
                </button>
                Audio
              </div>
              <div style={{ flex: 1, width: contentWidth }}>
                <TimelineWaveform
                  audio={audio}
                  lengthSeconds={lengthSeconds}
                  positionSeconds={positionSeconds}
                  pixelsPerSecond={pixelsPerSecond}
                  scrollLeft={0}
                  timelineWidth={contentWidth}
                  onSeek={seekTo}
                  loop={loop}
                  height={WAVEFORM_HEIGHT}
                />
              </div>
            </div>
          )}

          {!showWaveform && audio && (
            <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.05)', position: 'sticky', top: 0, zIndex: 12, background: 'rgba(20,20,30,0.98)' }}>
              <div style={{ width: 200, minWidth: 200, borderRight: '1px solid rgba(255,255,255,0.1)', padding: '6px 8px', fontSize: '0.7rem', color: 'rgba(255,255,255,0.7)', position: 'sticky', left: 0, background: 'rgba(30,30,40,0.98)', zIndex: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowWaveform(true)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'rgba(255,255,255,0.7)',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    padding: '2px 4px',
                  }}
                  title="Show waveform"
                >
                  ▶
                </button>
                Audio
              </div>
            </div>
          )}

          {/* Time ruler */}
          <div
            className="timeline-ruler"
            style={{
              position: 'sticky',
              top: showWaveform && audio ? WAVEFORM_HEIGHT : 0,
              left: 0,
              height: 24,
              background: 'rgba(30, 30, 40, 0.95)',
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
              zIndex: 10,
              display: 'flex',
            }}
          >
            {/* Track list header + timeline preset button */}
            <div style={{ width: 200, minWidth: 200, borderRight: '1px solid rgba(255, 255, 255, 0.1)', padding: '4px 8px', fontSize: '0.7rem', color: 'rgba(255, 255, 255, 0.5)', position: 'sticky', left: 0, background: 'rgba(30, 30, 40, 0.95)', zIndex: 5 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem' }}>
                <span>Tracks</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: '0.65rem', cursor: 'pointer', color: 'rgba(255, 255, 255, 0.7)' }}>
                    <input
                      type="checkbox"
                      checked={!!isFrozen}
                      onChange={(e) => setIsFrozen?.(!!e.target.checked)}
                      style={{ margin: 0, cursor: 'pointer' }}
                    />
                    <span>Freeze</span>
                  </label>
                  {/* Record button */}
                  <button
                    type="button"
                    onClick={isRecording ? onStopRecording : onStartRecording}
                    title={isRecording ? 'Stop Recording' : 'Start Recording'}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: '999px',
                      border: isRecording
                        ? '2px solid #f44336'
                        : '2px solid rgba(255, 255, 255, 0.35)',
                      background: isRecording
                        ? 'rgba(244, 67, 54, 0.3)'
                        : 'transparent',
                      color: isRecording ? '#f44336' : 'rgba(255, 255, 255, 0.7)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 600,
                      fontSize: '0.7rem',
                      padding: 0,
                      cursor: 'pointer',
                    }}
                  >
                    {isRecording ? '⏹' : '⏺'}
                  </button>
                  {/* Timeline preset button */}
                  <button
                    type="button"
                    onClick={handleTimelinePresetClick}
                    title={
                      hasTimelinePreset
                        ? 'Timeline Preset\nClick: Recall at t=0\nShift+Click: Save current scene\nAlt+Click: Clear preset'
                        : 'Timeline Preset\nClick or Shift+Click: Save current scene for t=0\nAlt+Click: Clear preset'
                    }
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: '999px',
                      border: hasTimelinePreset
                        ? '2px solid #4fc3f7'
                        : '2px dashed rgba(255, 255, 255, 0.35)',
                      background: hasTimelinePreset
                        ? 'rgba(79,195,247,0.18)'
                        : 'transparent',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 600,
                      fontSize: '0.65rem',
                      padding: 0,
                      cursor: 'pointer',
                    }}
                  >
                    TL
                  </button>
                </div>
              </div>
            </div>
            {/* Time markers */}
            <div style={{ flex: 1, position: 'relative', minWidth: contentWidth, width: contentWidth }}>
              <svg
                width={contentWidth}
                height={24}
                style={{ display: 'block' }}
              >
                {/* Second markers */}
                {Array.from({ length: Math.ceil(lengthSeconds) + 1 }, (_, i) => {
                  const x = i * pixelsPerSecond;
                  const isMinute = i % 60 === 0;
                  const is10Sec = i % 10 === 0;
                  return (
                    <g key={i}>
                      <line
                        x1={x}
                        y1={isMinute ? 0 : (is10Sec ? 8 : 14)}
                        x2={x}
                        y2={24}
                        stroke={isMinute ? 'rgba(255,255,255,0.4)' : (is10Sec ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)')}
                        strokeWidth={isMinute ? 2 : 1}
                      />
                      {(isMinute || is10Sec) && (
                        <text
                          x={x + 3}
                          y={10}
                          fill="rgba(255,255,255,0.5)"
                          fontSize="9"
                        >
                          {formatTime(i)}
                        </text>
                      )}
                    </g>
                  );
                })}
                {/* Playhead line in ruler */}
                <line
                  x1={positionSeconds * pixelsPerSecond}
                  y1={0}
                  x2={positionSeconds * pixelsPerSecond}
                  y2={24}
                  stroke="#ff5722"
                  strokeWidth={2}
                />
              </svg>
            </div>
          </div>

          {/* Track rows */}
          <div className="timeline-tracks" style={{ display: 'flex', flexDirection: 'column' }}>
            {tracks?.map((track, index) => (
              <TimelineTrackRow
                key={track.id}
                track={track}
                index={index}
                lengthSeconds={lengthSeconds}
                positionSeconds={positionSeconds}
                pixelsPerSecond={pixelsPerSecond}
                scrollLeft={0}
                timelineWidth={contentWidth}
                layers={layers}
                globalParameters={globalParameters}
                layerParameters={layerParameters}
                onUpdateTrack={(updates) => updateTrack(track.id, updates)}
                onRemoveTrack={() => removeTrack(track.id)}
                onAddKeyframe={(time, value, curve, tension) => addKeyframe(track.id, time, value, curve, tension)}
                onUpdateKeyframe={(kfId, updates) => updateKeyframe(track.id, kfId, updates)}
                onRemoveKeyframe={(kfId) => removeKeyframe(track.id, kfId)}
                onCaptureShapeKeyframe={handleCaptureShapeKeyframe}
                onCopyKeyframe={(kfId) => copyKeyframe?.(track.id, kfId)}
                onPasteKeyframe={(time) => pasteKeyframe?.(track.id, time)}
                onPasteKeyframeToTrack={(targetTrackId, time) => pasteKeyframeToTrack?.(targetTrackId, time)}
                hasClipboard={!!keyframeClipboard}
                clipboardTrackType={clipboardTrackType}
                clipboardSourceTargetId={clipboardSourceTargetId}
                allShapeTracks={allShapeTracks}
                onSeek={seekTo}
              />
            ))}
            
            {/* Add track button - header column sticky like other track rows */}
            <div
              style={{
                display: 'flex',
                borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
              }}
            >
              {/* Left fixed column */}
              <div
                style={{
                  width: 200,
                  minWidth: 200,
                  position: 'sticky',
                  left: 0,
                  zIndex: 6,
                  background: 'rgba(30, 30, 40, 0.95)',
                  padding: '8px',
                  borderRight: '1px solid rgba(255, 255, 255, 0.1)',
                }}
              >
                <button
                  type="button"
                  onClick={handleAddTrack}
                  style={{
                    background: 'rgba(79, 195, 247, 0.2)',
                    border: '1px dashed rgba(79, 195, 247, 0.5)',
                    borderRadius: 4,
                    padding: '6px 12px',
                    color: '#4fc3f7',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    width: '100%',
                  }}
                >
                  + Add Track
                </button>
              </div>

              {/* Right side (empty, matches track row layout so timeline continues) */}
              <div style={{ flex: 1 }} />
            </div>
          </div>

          {/* Playhead is now drawn by each component (waveform, ruler, tracks) for perfect alignment */}
        </div>
      </div>
    </div>
  );
};

/**
 * Format time as mm:ss or m:ss
 */
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default TimelinePanel;
