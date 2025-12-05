import React, { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import { useTimeline } from '../../context/TimelineContext.jsx';
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
}) => {
  const timeline = useTimeline();
  const containerRef = useRef(null);
  const tracksContainerRef = useRef(null);
  
  const {
    session,
    tracks,
    lengthSeconds,
    loop,
    audio,
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
    setAudio,
    clearAudio,
    setZoom,
    setScrollLeft,
    setVisible,
  } = timeline || {};

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

  // Total timeline width in pixels
  const timelineWidth = useMemo(() => {
    return Math.max(containerWidth - 200, lengthSeconds * pixelsPerSecond);
  }, [containerWidth, lengthSeconds, pixelsPerSecond]);

  // Handle scroll sync between waveform and tracks
  const handleScroll = useCallback((e) => {
    if (setScrollLeft) {
      setScrollLeft(e.target.scrollLeft);
    }
  }, [setScrollLeft]);

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
  ], []);

  // Layer parameters - per user list
  const layerParameters = useMemo(() => [
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
    { id: 'movementStyle', label: 'Movement Style', range: { outputMin: 0, outputMax: 3 } },
    { id: 'movementSpeed', label: 'Movement Speed', range: { outputMin: 0, outputMax: 5 } },
    { id: 'movementAngle', label: 'Angle', range: { outputMin: 0, outputMax: 360 } },
    { id: 'scaleSpeed', label: 'Z Speed', range: { outputMin: 0, outputMax: 1 } },
    { id: 'scaleMin', label: 'Z Min', range: { outputMin: 0, outputMax: 2 } },
    { id: 'scaleMax', label: 'Z Max', range: { outputMin: 0, outputMax: 3 } },
    { id: 'colorR', label: 'Layer Colour R', range: { outputMin: 0, outputMax: 1 } },
    { id: 'colorG', label: 'Layer Colour G', range: { outputMin: 0, outputMax: 1 } },
    { id: 'colorB', label: 'Layer Colour B', range: { outputMin: 0, outputMax: 1 } },
  ], []);

  // Handle adding a new track
  const handleAddTrack = useCallback(() => {
    if (addTrack) {
      addTrack(`Track ${(tracks?.length || 0) + 1}`, '');
    }
  }, [addTrack, tracks?.length]);

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
        onPlay={play}
        onPause={pause}
        onStop={stop}
        onTogglePlay={togglePlay}
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

      {/* Waveform display (if audio loaded) */}
      {audio && (
        <TimelineWaveform
          audio={audio}
          lengthSeconds={lengthSeconds}
          positionSeconds={positionSeconds}
          pixelsPerSecond={pixelsPerSecond}
          scrollLeft={scrollLeft}
          timelineWidth={timelineWidth}
          onSeek={seekTo}
          loop={loop}
        />
      )}

      {/* Tracks area */}
      <div
        ref={tracksContainerRef}
        className="timeline-tracks-container"
        style={{
          flex: 1,
          overflow: 'auto',
          position: 'relative',
        }}
        onScroll={handleScroll}
      >
        {/* Time ruler */}
        <div
          className="timeline-ruler"
          style={{
            position: 'sticky',
            top: 0,
            left: 0,
            height: 24,
            background: 'rgba(30, 30, 40, 0.95)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            zIndex: 10,
            display: 'flex',
          }}
        >
          {/* Track list header */}
          <div style={{ width: 200, minWidth: 200, borderRight: '1px solid rgba(255, 255, 255, 0.1)', padding: '4px 8px', fontSize: '0.7rem', color: 'rgba(255, 255, 255, 0.5)' }}>
            Tracks
          </div>
          {/* Time markers */}
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            <svg
              width={timelineWidth}
              height={24}
              style={{ display: 'block', marginLeft: -scrollLeft }}
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
              {/* Playhead */}
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
              scrollLeft={scrollLeft}
              timelineWidth={timelineWidth}
              layers={layers}
              globalParameters={globalParameters}
              layerParameters={layerParameters}
              onUpdateTrack={(updates) => updateTrack(track.id, updates)}
              onRemoveTrack={() => removeTrack(track.id)}
              onAddKeyframe={(time, value, curve, tension) => addKeyframe(track.id, time, value, curve, tension)}
              onUpdateKeyframe={(kfId, updates) => updateKeyframe(track.id, kfId, updates)}
              onRemoveKeyframe={(kfId) => removeKeyframe(track.id, kfId)}
              onSeek={seekTo}
            />
          ))}
          
          {/* Add track button */}
          <div
            style={{
              display: 'flex',
              padding: '8px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
            }}
          >
            <div style={{ width: 200, minWidth: 200 }}>
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
          </div>
        </div>

        {/* Playhead line (spans all tracks) */}
        <div
          style={{
            position: 'absolute',
            top: 24,
            left: 200 + positionSeconds * pixelsPerSecond - scrollLeft,
            width: 2,
            height: 'calc(100% - 24px)',
            background: '#ff5722',
            pointerEvents: 'none',
            zIndex: 5,
          }}
        />
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
