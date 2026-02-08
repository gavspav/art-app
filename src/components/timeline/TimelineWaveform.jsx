import React, { useRef, useEffect, useCallback } from 'react';

/**
 * TimelineWaveform - Audio waveform display component
 * 
 * Displays the audio waveform at the top of the timeline.
 * Allows clicking/dragging to scrub playback position.
 */
const TimelineWaveform = ({
  audio,
  lengthSeconds,
  positionSeconds,
  pixelsPerSecond,
  scrollLeft = 0,
  onSeek,
  loop,
  height = 80,
  timelineWidth,
  transients = [],
}) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const isDraggingRef = useRef(false);

  // Draw waveform
  // Key invariant: audio starts at x=0 and ends at x=(audioDuration * pixelsPerSecond)
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !audio?.peaks) return;

    const ctx = canvas.getContext('2d');
    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
    const canvasWidth = timelineWidth || container?.clientWidth || 800;
    const renderWidth = Math.max(1, canvasWidth);
    const renderHeight = height;

    // Size the backing buffer using DPR for crisp rendering
    canvas.width = renderWidth * dpr;
    canvas.height = renderHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const peaks = audio.peaks;
    const audioDuration = audio.durationSeconds || lengthSeconds;
    // Width in pixels that the audio waveform should occupy
    const audioWidthPx = audioDuration * pixelsPerSecond;

    // Clear canvas
    ctx.fillStyle = 'rgba(20, 20, 30, 1)';
    ctx.fillRect(0, 0, renderWidth, renderHeight);

    // Draw grid lines (every second) - aligned with ruler
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    for (let t = 0; t <= lengthSeconds; t++) {
      const x = t * pixelsPerSecond;
      if (x >= 0 && x <= renderWidth) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, renderHeight);
        ctx.stroke();
      }
    }

    // Draw loop region if enabled
    if (loop?.enabled) {
      const loopStartX = loop.startSeconds * pixelsPerSecond;
      const loopEndX = loop.endSeconds * pixelsPerSecond;
      ctx.fillStyle = 'rgba(79, 195, 247, 0.1)';
      ctx.fillRect(loopStartX, 0, loopEndX - loopStartX, renderHeight);
      
      // Loop markers
      ctx.strokeStyle = 'rgba(79, 195, 247, 0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(loopStartX, 0);
      ctx.lineTo(loopStartX, renderHeight);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(loopEndX, 0);
      ctx.lineTo(loopEndX, renderHeight);
      ctx.stroke();
    }

    // Draw waveform - from x=0 to x=audioWidthPx
    const centerY = renderHeight / 2;
    const waveformEndX = Math.min(audioWidthPx, renderWidth);

    ctx.fillStyle = 'rgba(79, 195, 247, 0.6)';
    ctx.beginPath();
    ctx.moveTo(0, centerY);

    // Top half of waveform (going right)
    for (let x = 0; x <= waveformEndX; x++) {
      // Convert pixel position to time, then to peak index
      const time = x / pixelsPerSecond;
      const peakIndex = Math.floor((time / audioDuration) * peaks.length);
      const peak = peaks[Math.min(peakIndex, peaks.length - 1)] || 0;
      const y = centerY - peak * (renderHeight / 2 - 4);
      ctx.lineTo(x, y);
    }

    // Bottom half of waveform (going left - mirror)
    for (let x = waveformEndX; x >= 0; x--) {
      const time = x / pixelsPerSecond;
      const peakIndex = Math.floor((time / audioDuration) * peaks.length);
      const peak = peaks[Math.min(peakIndex, peaks.length - 1)] || 0;
      const y = centerY + peak * (renderHeight / 2 - 4);
      ctx.lineTo(x, y);
    }

    ctx.closePath();
    ctx.fill();

    // Draw center line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(waveformEndX, centerY);
    ctx.stroke();

    // Draw transient markers
    // These are aligned with the waveform (x=0 is time=0)
    if (transients && transients.length > 0) {
      ctx.strokeStyle = '#ff9800';
      ctx.lineWidth = 1;
      
      // Find max strength for normalization
      let maxStrength = 0;
      for (const t of transients) {
        if (t.strength > maxStrength) maxStrength = t.strength;
      }
      
      for (const transient of transients) {
        const x = transient.time * pixelsPerSecond;
        if (x >= 0 && x <= renderWidth) {
          // Vary opacity based on strength (0.3 to 1.0)
          const normalizedStrength = maxStrength > 0 ? transient.strength / maxStrength : 1;
          const alpha = 0.3 + normalizedStrength * 0.7;
          ctx.strokeStyle = `rgba(255, 152, 0, ${alpha})`;
          
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, renderHeight);
          ctx.stroke();
        }
      }
    }

    // Draw playhead line
    const playheadX = positionSeconds * pixelsPerSecond;
    if (playheadX >= 0 && playheadX <= renderWidth) {
      ctx.strokeStyle = '#ff5722';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, renderHeight);
      ctx.stroke();
    }
  }, [audio, lengthSeconds, positionSeconds, pixelsPerSecond, loop, height, timelineWidth, transients]);

  // Handle click/drag to seek
  const handleMouseDown = useCallback((e) => {
    isDraggingRef.current = true;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !onSeek) return;

    const x = e.clientX - rect.left + scrollLeft;
    const time = x / pixelsPerSecond;
    onSeek(Math.max(0, Math.min(lengthSeconds, time)));
  }, [onSeek, pixelsPerSecond, lengthSeconds, scrollLeft]);

  const handleMouseMove = useCallback((e) => {
    if (!isDraggingRef.current) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !onSeek) return;

    const x = e.clientX - rect.left + (scrollLeft || 0);
    const time = x / pixelsPerSecond;
    onSeek(Math.max(0, Math.min(lengthSeconds, time)));
  }, [onSeek, pixelsPerSecond, lengthSeconds, scrollLeft]);

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  const handleWaveformKeyDown = useCallback((e) => {
    if (!onSeek) return;
    const current = Number.isFinite(positionSeconds) ? positionSeconds : 0;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const step = e.shiftKey ? 1 : 0.1;
      const next = e.key === 'ArrowLeft' ? current - step : current + step;
      onSeek(Math.max(0, Math.min(lengthSeconds, next)));
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
    }
  }, [lengthSeconds, onSeek, positionSeconds]);

  // Global mouse up listener
  useEffect(() => {
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseUp]);

  if (!audio) return null;

  return (
    <div
      ref={containerRef}
      className="timeline-waveform"
      style={{
        width: timelineWidth ? `${timelineWidth}px` : '100%',
        height,
        background: 'rgba(20, 20, 30, 1)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <canvas
        ref={canvasRef}
        tabIndex={0}
        role="slider"
        aria-label="Audio waveform seek bar"
        aria-valuemin={0}
        aria-valuemax={Math.max(0, lengthSeconds)}
        aria-valuenow={Math.max(0, Math.min(lengthSeconds, Number(positionSeconds) || 0))}
        style={{
          display: 'block',
          width: timelineWidth ? `${timelineWidth}px` : '100%',
          height: '100%',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onKeyDown={handleWaveformKeyDown}
      />
      {/* Audio info overlay */}
      <div
        style={{
          position: 'absolute',
          top: 4,
          left: 8,
          fontSize: '0.65rem',
          color: 'rgba(255, 255, 255, 0.4)',
          pointerEvents: 'none',
        }}
      >
        Audio: {audio.durationSeconds?.toFixed(1)}s
      </div>
    </div>
  );
};

export default TimelineWaveform;
