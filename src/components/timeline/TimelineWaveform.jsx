import React, { useRef, useEffect, useCallback, useMemo } from 'react';

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
  }, [audio, lengthSeconds, positionSeconds, pixelsPerSecond, loop, height, timelineWidth]);

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

  // Global mouse up listener
  useEffect(() => {
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseUp]);

  // Calculate canvas width
  const canvasWidth = useMemo(() => {
    if (timelineWidth) return timelineWidth;
    const container = containerRef.current;
    return container?.clientWidth || 800;
  }, [timelineWidth]);

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
        style={{
          display: 'block',
          width: timelineWidth ? `${timelineWidth}px` : '100%',
          height: '100%',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
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
