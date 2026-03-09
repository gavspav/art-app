import React, { useRef, useCallback, useState, useEffect } from 'react';

/**
 * TimelineTransport - Transport controls for the timeline
 * 
 * Contains play/pause/stop buttons, time display, loop controls,
 * audio file loading, zoom controls, and close button.
 */
const TimelineTransport = ({
  isPlaying,
  positionSeconds,
  lengthSeconds,
  loop,
  onPlay: _onPlay,
  onPause: _onPause,
  onStop,
  onTogglePlay,
  onSeek: _onSeek,
  onSetLength,
  onSetLoop,
  onLoadAudio,
  onClearAudio,
  hasAudio,
  zoom,
  onZoomChange,
  onClose,
}) => {
  const fileInputRef = useRef(null);
  const zoomSliderRef = useRef(null);
  const [isDraggingZoom, setIsDraggingZoom] = useState(false);
  const zoomStartRef = useRef({ x: 0, zoom: 1 });

  // Draggable zoom handler
  const handleZoomMouseDown = useCallback((e) => {
    e.preventDefault();
    setIsDraggingZoom(true);
    zoomStartRef.current = { x: e.clientX, zoom: zoom || 1 };
  }, [zoom]);

  const handleZoomMouseMove = useCallback((e) => {
    if (!isDraggingZoom) return;
    const dx = e.clientX - zoomStartRef.current.x;
    // 100px drag = 2x zoom change
    const factor = Math.pow(2, dx / 100);
    const newZoom = Math.max(0.1, Math.min(4000, zoomStartRef.current.zoom * factor));
    onZoomChange?.(newZoom);
  }, [isDraggingZoom, onZoomChange]);

  const handleZoomMouseUp = useCallback(() => {
    setIsDraggingZoom(false);
  }, []);

  useEffect(() => {
    if (isDraggingZoom) {
      window.addEventListener('mousemove', handleZoomMouseMove);
      window.addEventListener('mouseup', handleZoomMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleZoomMouseMove);
        window.removeEventListener('mouseup', handleZoomMouseUp);
      };
    }
  }, [isDraggingZoom, handleZoomMouseMove, handleZoomMouseUp]);

  const handleFileSelect = useCallback((e) => {
    const file = e.target.files?.[0];
    if (file && onLoadAudio) {
      onLoadAudio(file);
    }
    // Reset input to allow re-selecting same file
    e.target.value = '';
  }, [onLoadAudio]);

  const handleLoadAudioClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  return (
    <div
      className="timeline-transport"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '8px 12px',
        background: 'rgba(30, 30, 40, 0.95)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        flexWrap: 'wrap',
      }}
    >
      {/* Play/Pause/Stop buttons */}
      <div style={{ display: 'flex', gap: '4px' }}>
        <button
          type="button"
          onClick={onTogglePlay}
          aria-label={isPlaying ? 'Pause timeline' : 'Play timeline'}
          style={{
            background: isPlaying ? 'rgba(255, 152, 0, 0.3)' : 'rgba(79, 195, 247, 0.3)',
            border: `1px solid ${isPlaying ? 'rgba(255, 152, 0, 0.5)' : 'rgba(79, 195, 247, 0.5)'}`,
            borderRadius: 4,
            padding: '6px 12px',
            color: isPlaying ? '#ff9800' : '#4fc3f7',
            fontSize: '0.8rem',
            cursor: 'pointer',
            minWidth: 60,
          }}
          title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
        >
          {isPlaying ? '⏸ Pause' : '▶ Play'}
        </button>
        <button
          type="button"
          onClick={onStop}
          aria-label="Stop timeline"
          style={{
            background: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: 4,
            padding: '6px 12px',
            color: 'rgba(255, 255, 255, 0.7)',
            fontSize: '0.8rem',
            cursor: 'pointer',
          }}
          title="Stop (Home)"
        >
          ⏹ Stop
        </button>
      </div>

      {/* Time display */}
      <div
        style={{
          fontFamily: 'monospace',
          fontSize: '0.9rem',
          color: '#4fc3f7',
          background: 'rgba(0, 0, 0, 0.3)',
          padding: '4px 8px',
          borderRadius: 4,
          minWidth: 100,
          textAlign: 'center',
        }}
      >
        {formatTime(positionSeconds)} / {formatTime(lengthSeconds)}
      </div>

      {/* Length input */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <label style={{ fontSize: '0.7rem', color: 'rgba(255, 255, 255, 0.5)' }}>
          Length:
        </label>
        <input
          type="number"
          value={Number.isFinite(lengthSeconds) ? lengthSeconds : 60}
          onChange={(e) => onSetLength?.(Number(e.target.value) || 60)}
          min={1}
          max={3600}
          step={0.01}
          aria-label="Timeline length in seconds"
          style={{
            width: 60,
            background: 'rgba(0, 0, 0, 0.3)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: 4,
            padding: '4px 6px',
            color: 'white',
            fontSize: '0.75rem',
          }}
        />
        <span style={{ fontSize: '0.7rem', color: 'rgba(255, 255, 255, 0.5)' }}>s</span>
      </div>

      {/* Loop toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <label style={{ fontSize: '0.7rem', color: 'rgba(255, 255, 255, 0.5)' }}>
          Loop:
        </label>
        <input
          type="checkbox"
          checked={loop?.enabled || false}
          onChange={(e) => onSetLoop?.({ enabled: e.target.checked })}
          aria-label="Enable loop region"
          style={{ cursor: 'pointer' }}
        />
        {loop?.enabled && (
          <>
            <input
              type="number"
              value={Number.isFinite(loop.startSeconds) ? loop.startSeconds : 0}
              onChange={(e) => {
                const nextStart = Math.max(0, Number(e.target.value) || 0);
                const currentEnd = Number(loop?.endSeconds ?? lengthSeconds) || lengthSeconds;
                onSetLoop?.({ startSeconds: Math.min(nextStart, Math.max(0, currentEnd - 0.01)) });
              }}
              min={0}
              max={lengthSeconds - 1}
              step={0.01}
              aria-label="Loop start in seconds"
              style={{
                width: 50,
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: 4,
                padding: '2px 4px',
                color: 'white',
                fontSize: '0.7rem',
              }}
              title="Loop start (seconds)"
            />
            <span style={{ fontSize: '0.7rem', color: 'rgba(255, 255, 255, 0.3)' }}>→</span>
            <input
              type="number"
              value={Number.isFinite(loop.endSeconds) ? loop.endSeconds : lengthSeconds}
              onChange={(e) => {
                const currentStart = Number(loop?.startSeconds ?? 0) || 0;
                const nextEnd = Number(e.target.value);
                const safeEnd = Number.isFinite(nextEnd) ? nextEnd : lengthSeconds;
                onSetLoop?.({ endSeconds: Math.max(currentStart + 0.01, safeEnd) });
              }}
              min={1}
              max={lengthSeconds}
              step={0.01}
              aria-label="Loop end in seconds"
              style={{
                width: 50,
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: 4,
                padding: '2px 4px',
                color: 'white',
                fontSize: '0.7rem',
              }}
              title="Loop end (seconds)"
            />
          </>
        )}
      </div>

      {/* Zoom control - draggable */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <label style={{ fontSize: '0.7rem', color: 'rgba(255, 255, 255, 0.5)' }}>
          Zoom:
        </label>
        <button
          type="button"
          onClick={() => onZoomChange?.((zoom || 1) * 0.8)}
          aria-label="Zoom out timeline"
          style={{
            background: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: 4,
            padding: '2px 8px',
            color: 'white',
            fontSize: '0.8rem',
            cursor: 'pointer',
          }}
        >
          −
        </button>
        {/* Draggable zoom value */}
        <div
          ref={zoomSliderRef}
          onMouseDown={handleZoomMouseDown}
          role="slider"
          aria-label="Timeline zoom"
          aria-valuemin={10}
          aria-valuemax={400000}
          aria-valuenow={Math.round((zoom || 1) * 100)}
          style={{
            fontSize: '0.7rem',
            color: isDraggingZoom ? '#4fc3f7' : 'rgba(255, 255, 255, 0.7)',
            minWidth: 50,
            textAlign: 'center',
            cursor: 'ew-resize',
            userSelect: 'none',
            padding: '4px 8px',
            background: isDraggingZoom ? 'rgba(79, 195, 247, 0.2)' : 'rgba(0, 0, 0, 0.3)',
            borderRadius: 4,
            border: `1px solid ${isDraggingZoom ? 'rgba(79, 195, 247, 0.5)' : 'rgba(255, 255, 255, 0.2)'}`,
          }}
          title="Drag left/right to zoom"
        >
          {Math.round((zoom || 1) * 100)}%
        </div>
        <button
          type="button"
          onClick={() => onZoomChange?.((zoom || 1) * 1.25)}
          aria-label="Zoom in timeline"
          style={{
            background: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: 4,
            padding: '2px 8px',
            color: 'white',
            fontSize: '0.8rem',
            cursor: 'pointer',
          }}
        >
          +
        </button>
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Audio file controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
        <button
          type="button"
          onClick={handleLoadAudioClick}
          aria-label={hasAudio ? 'Replace audio file' : 'Load audio file'}
          style={{
            background: hasAudio ? 'rgba(129, 199, 132, 0.2)' : 'rgba(255, 255, 255, 0.1)',
            border: `1px solid ${hasAudio ? 'rgba(129, 199, 132, 0.5)' : 'rgba(255, 255, 255, 0.2)'}`,
            borderRadius: 4,
            padding: '4px 10px',
            color: hasAudio ? '#81c784' : 'rgba(255, 255, 255, 0.7)',
            fontSize: '0.75rem',
            cursor: 'pointer',
          }}
          title="Load audio file for waveform display"
        >
          {hasAudio ? '🎵 Audio Loaded' : '🎵 Load Audio'}
        </button>
        {hasAudio && (
          <button
            type="button"
            onClick={onClearAudio}
            aria-label="Remove audio file"
            style={{
              background: 'rgba(244, 67, 54, 0.2)',
              border: '1px solid rgba(244, 67, 54, 0.5)',
              borderRadius: 4,
              padding: '4px 8px',
              color: '#f44336',
              fontSize: '0.7rem',
              cursor: 'pointer',
            }}
            title="Remove audio"
          >
            ✕
          </button>
        )}
      </div>

      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close timeline panel"
        style={{
          background: 'rgba(255, 255, 255, 0.1)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: 4,
          padding: '4px 10px',
          color: 'rgba(255, 255, 255, 0.7)',
          fontSize: '0.75rem',
          cursor: 'pointer',
        }}
        title="Close timeline"
      >
        ✕ Close
      </button>
    </div>
  );
};

export default TimelineTransport;
