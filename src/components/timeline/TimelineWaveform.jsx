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
  onSeek,
  loop,
  height = 80,
  timelineWidth,
}) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const isDraggingRef = useRef(false);

  // Draw waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !audio?.peaks) return;

    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    const peaks = audio.peaks;
    const audioDuration = audio.durationSeconds || lengthSeconds;

    // Clear canvas
    ctx.fillStyle = 'rgba(20, 20, 30, 1)';
    ctx.fillRect(0, 0, width, height);

    // Draw grid lines (every second)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    for (let t = 0; t <= lengthSeconds; t++) {
      const x = t * pixelsPerSecond;
      if (x >= 0 && x <= width) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
    }

    // Draw loop region if enabled
    if (loop?.enabled) {
      const loopStartX = loop.startSeconds * pixelsPerSecond;
      const loopEndX = loop.endSeconds * pixelsPerSecond;
      ctx.fillStyle = 'rgba(79, 195, 247, 0.1)';
      ctx.fillRect(loopStartX, 0, loopEndX - loopStartX, height);
      
      // Loop markers
      ctx.strokeStyle = 'rgba(79, 195, 247, 0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(loopStartX, 0);
      ctx.lineTo(loopStartX, height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(loopEndX, 0);
      ctx.lineTo(loopEndX, height);
      ctx.stroke();
    }

    // Draw waveform
    const peaksPerPixel = peaks.length / (audioDuration * pixelsPerSecond);
    const centerY = height / 2;

    ctx.fillStyle = 'rgba(79, 195, 247, 0.6)';
    ctx.beginPath();
    ctx.moveTo(0, centerY);

    for (let x = 0; x < width; x++) {
      const time = x / pixelsPerSecond;
      if (time > audioDuration) break;

      const peakIndex = Math.floor((time / audioDuration) * peaks.length);
      const peak = peaks[Math.min(peakIndex, peaks.length - 1)] || 0;
      const y = centerY - peak * (height / 2 - 4);
      ctx.lineTo(x, y);
    }

    // Mirror for bottom half
    for (let x = width - 1; x >= 0; x--) {
      const time = x / pixelsPerSecond;
      if (time > audioDuration) continue;

      const peakIndex = Math.floor((time / audioDuration) * peaks.length);
      const peak = peaks[Math.min(peakIndex, peaks.length - 1)] || 0;
      const y = centerY + peak * (height / 2 - 4);
      ctx.lineTo(x, y);
    }

    ctx.closePath();
    ctx.fill();

    // Draw center line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();

    // Playhead is drawn globally; omit here to avoid double lines
  }, [audio, lengthSeconds, positionSeconds, pixelsPerSecond, loop, height]);

  // Handle click/drag to seek
  const handleMouseDown = useCallback((e) => {
    isDraggingRef.current = true;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !onSeek) return;

    const x = e.clientX - rect.left;
    const time = x / pixelsPerSecond;
    onSeek(Math.max(0, Math.min(lengthSeconds, time)));
  }, [onSeek, pixelsPerSecond, lengthSeconds]);

  const handleMouseMove = useCallback((e) => {
    if (!isDraggingRef.current) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !onSeek) return;

    const x = e.clientX - rect.left;
    const time = x / pixelsPerSecond;
    onSeek(Math.max(0, Math.min(lengthSeconds, time)));
  }, [onSeek, pixelsPerSecond, lengthSeconds]);

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

  // Update canvas size on resize
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      canvas.width = timelineWidth || rect.width;
      canvas.height = height;
    };

    updateSize();
    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [height, timelineWidth]);

  if (!audio) return null;

  return (
    <div
      ref={containerRef}
      className="timeline-waveform"
      style={{
        width: '100%',
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
