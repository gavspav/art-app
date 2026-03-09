import React, { useRef, useCallback, useState, useEffect } from 'react';
import { Minus, Music4, Pause, Play, Plus, Square, X } from 'lucide-react';

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
  const [isDraggingZoom, setIsDraggingZoom] = useState(false);
  const zoomStartRef = useRef({ x: 0, zoom: 1 });

  const handleZoomMouseDown = useCallback((event) => {
    event.preventDefault();
    setIsDraggingZoom(true);
    zoomStartRef.current = { x: event.clientX, zoom: zoom || 1 };
  }, [zoom]);

  const handleZoomMouseMove = useCallback((event) => {
    if (!isDraggingZoom) return;
    const dx = event.clientX - zoomStartRef.current.x;
    const factor = Math.pow(2, dx / 100);
    const newZoom = Math.max(0.1, Math.min(4000, zoomStartRef.current.zoom * factor));
    onZoomChange?.(newZoom);
  }, [isDraggingZoom, onZoomChange]);

  const handleZoomMouseUp = useCallback(() => {
    setIsDraggingZoom(false);
  }, []);

  useEffect(() => {
    if (!isDraggingZoom) return undefined;

    window.addEventListener('mousemove', handleZoomMouseMove);
    window.addEventListener('mouseup', handleZoomMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleZoomMouseMove);
      window.removeEventListener('mouseup', handleZoomMouseUp);
    };
  }, [handleZoomMouseMove, handleZoomMouseUp, isDraggingZoom]);

  const handleFileSelect = useCallback((event) => {
    const file = event.target.files?.[0];
    if (file && onLoadAudio) {
      onLoadAudio(file);
    }
    event.target.value = '';
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
    <div className="timeline-transport">
      <div className="timeline-transport__group">
        <button
          type="button"
          className={`timeline-transport__button ${isPlaying ? 'timeline-transport__button--playing' : 'timeline-transport__button--primary'}`}
          onClick={onTogglePlay}
          aria-label={isPlaying ? 'Pause timeline' : 'Play timeline'}
          title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
        >
          {isPlaying ? <Pause size={16} /> : <Play size={16} />}
          <span>{isPlaying ? 'Pause' : 'Play'}</span>
        </button>
        <button
          type="button"
          className="timeline-transport__button"
          onClick={onStop}
          aria-label="Stop timeline"
          title="Stop (Home)"
        >
          <Square size={16} />
          <span>Stop</span>
        </button>
      </div>

      <div className="timeline-transport__time">
        {formatTime(positionSeconds)} / {formatTime(lengthSeconds)}
      </div>

      <div className="timeline-transport__group">
        <label className="timeline-transport__field">
          <span>Length</span>
          <input
            type="number"
            value={Number.isFinite(lengthSeconds) ? lengthSeconds : 60}
            onChange={(event) => onSetLength?.(Number(event.target.value) || 60)}
            min={1}
            max={3600}
            step={0.01}
            aria-label="Timeline length in seconds"
          />
          <span>s</span>
        </label>
      </div>

      <div className="timeline-transport__group">
        <label className="timeline-transport__field">
          <span>Loop</span>
          <input
            type="checkbox"
            checked={loop?.enabled || false}
            onChange={(event) => onSetLoop?.({ enabled: event.target.checked })}
            aria-label="Enable loop region"
          />
        </label>
        {loop?.enabled && (
          <>
            <label className="timeline-transport__field">
              <span>Start</span>
              <input
                type="number"
                value={Number.isFinite(loop.startSeconds) ? loop.startSeconds : 0}
                onChange={(event) => {
                  const nextStart = Math.max(0, Number(event.target.value) || 0);
                  const currentEnd = Number(loop?.endSeconds ?? lengthSeconds) || lengthSeconds;
                  onSetLoop?.({ startSeconds: Math.min(nextStart, Math.max(0, currentEnd - 0.01)) });
                }}
                min={0}
                max={lengthSeconds - 1}
                step={0.01}
                aria-label="Loop start in seconds"
                title="Loop start (seconds)"
              />
            </label>
            <label className="timeline-transport__field">
              <span>End</span>
              <input
                type="number"
                value={Number.isFinite(loop.endSeconds) ? loop.endSeconds : lengthSeconds}
                onChange={(event) => {
                  const currentStart = Number(loop?.startSeconds ?? 0) || 0;
                  const nextEnd = Number(event.target.value);
                  const safeEnd = Number.isFinite(nextEnd) ? nextEnd : lengthSeconds;
                  onSetLoop?.({ endSeconds: Math.max(currentStart + 0.01, safeEnd) });
                }}
                min={1}
                max={lengthSeconds}
                step={0.01}
                aria-label="Loop end in seconds"
                title="Loop end (seconds)"
              />
            </label>
          </>
        )}
      </div>

      <div className="timeline-transport__group">
        <span className="timeline-transport__field">Zoom</span>
        <button
          type="button"
          className="timeline-transport__icon-btn"
          onClick={() => onZoomChange?.((zoom || 1) * 0.8)}
          aria-label="Zoom out timeline"
        >
          <Minus size={16} />
        </button>
        <div
          onMouseDown={handleZoomMouseDown}
          role="slider"
          aria-label="Timeline zoom"
          aria-valuemin={10}
          aria-valuemax={400000}
          aria-valuenow={Math.round((zoom || 1) * 100)}
          className={`timeline-transport__zoom-value ${isDraggingZoom ? 'is-dragging' : ''}`}
          title="Drag left/right to zoom"
        >
          {Math.round((zoom || 1) * 100)}%
        </div>
        <button
          type="button"
          className="timeline-transport__icon-btn"
          onClick={() => onZoomChange?.((zoom || 1) * 1.25)}
          aria-label="Zoom in timeline"
        >
          <Plus size={16} />
        </button>
      </div>

      <div className="timeline-transport__spacer" />

      <div className="timeline-transport__group">
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
        <button
          type="button"
          className={`timeline-transport__button ${hasAudio ? 'timeline-transport__button--primary' : ''}`}
          onClick={handleLoadAudioClick}
          aria-label={hasAudio ? 'Replace audio file' : 'Load audio file'}
          title="Load audio file for waveform display"
        >
          <Music4 size={16} />
          <span>{hasAudio ? 'Audio Loaded' : 'Load Audio'}</span>
        </button>
        {hasAudio && (
          <button
            type="button"
            className="timeline-transport__icon-btn timeline-transport__button--danger"
            onClick={onClearAudio}
            aria-label="Remove audio file"
            title="Remove audio"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <button
        type="button"
        className="timeline-transport__button"
        onClick={onClose}
        aria-label="Close timeline panel"
        title="Close timeline"
      >
        <X size={16} />
        <span>Close</span>
      </button>
    </div>
  );
};

export default TimelineTransport;
