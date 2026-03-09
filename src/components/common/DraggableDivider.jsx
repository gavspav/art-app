import React, { useRef, useCallback, useEffect, useState } from 'react';

/**
 * DraggableDivider - A resizable divider between two panels
 *
 * @param {string} direction - 'horizontal' (left/right) or 'vertical' (top/bottom)
 * @param {function} onResize - Callback with new size ratio (0-1)
 * @param {number} initialRatio - Initial size ratio (0-1)
 * @param {number} minRatio - Minimum size ratio
 * @param {number} maxRatio - Maximum size ratio
 */
const DraggableDivider = ({
  direction = 'horizontal',
  onResize,
  initialRatio: _initialRatio = 0.5,
  minRatio = 0.1,
  maxRatio = 0.9,
  style = {},
}) => {
  const dividerRef = useRef(null);
  const isDraggingRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

  const updateRatio = useCallback((clientX, clientY) => {
    const parent = dividerRef.current?.parentElement;
    if (!parent) return;

    const rect = parent.getBoundingClientRect();
    const rawRatio = direction === 'horizontal'
      ? (clientX - rect.left) / rect.width
      : (clientY - rect.top) / rect.height;

    const ratio = Math.max(minRatio, Math.min(maxRatio, rawRatio));
    onResize?.(ratio);
  }, [direction, maxRatio, minRatio, onResize]);

  const startDrag = useCallback((event) => {
    event.preventDefault();
    isDraggingRef.current = true;
    setIsDragging(true);
  }, []);

  const handleMouseDown = useCallback((event) => {
    startDrag(event);
  }, [startDrag]);

  const handleTouchStart = useCallback((event) => {
    startDrag(event);
    const touch = event.touches?.[0];
    if (touch) {
      updateRatio(touch.clientX, touch.clientY);
    }
  }, [startDrag, updateRatio]);

  const handleMouseMove = useCallback((event) => {
    if (!isDraggingRef.current) return;
    updateRatio(event.clientX, event.clientY);
  }, [updateRatio]);

  const handleTouchMove = useCallback((event) => {
    if (!isDraggingRef.current) return;
    const touch = event.touches?.[0];
    if (!touch) return;
    event.preventDefault();
    updateRatio(touch.clientX, touch.clientY);
  }, [updateRatio]);

  const stopDrag = useCallback(() => {
    isDraggingRef.current = false;
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (!isDragging) return undefined;

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', stopDrag);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', stopDrag);
    window.addEventListener('touchcancel', stopDrag);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', stopDrag);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', stopDrag);
      window.removeEventListener('touchcancel', stopDrag);
    };
  }, [handleMouseMove, handleTouchMove, isDragging, stopDrag]);

  const isHorizontal = direction === 'horizontal';

  return (
    <div
      ref={dividerRef}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      role="separator"
      aria-orientation={isHorizontal ? 'vertical' : 'horizontal'}
      style={{
        position: 'relative',
        background: isDragging ? 'rgba(79, 195, 247, 0.22)' : 'rgba(255, 255, 255, 0.06)',
        cursor: isHorizontal ? 'col-resize' : 'row-resize',
        flexShrink: 0,
        zIndex: 10,
        transition: isDragging ? 'none' : 'background 0.2s',
        touchAction: 'none',
        ...(isHorizontal ? {
          width: 10,
          height: '100%',
        } : {
          width: '100%',
          height: 10,
        }),
        ...style,
      }}
    >
      <div
        style={{
          position: 'absolute',
          ...(isHorizontal ? {
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 2,
            height: 34,
          } : {
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 34,
            height: 2,
          }),
          background: isDragging ? 'rgba(79, 195, 247, 0.9)' : 'rgba(255, 255, 255, 0.34)',
          borderRadius: 999,
        }}
      />
    </div>
  );
};

export default DraggableDivider;
