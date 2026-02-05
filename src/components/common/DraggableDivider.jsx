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

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    isDraggingRef.current = true;
    setIsDragging(true);
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (!isDraggingRef.current) return;
    
    const parent = dividerRef.current?.parentElement;
    if (!parent) return;
    
    const rect = parent.getBoundingClientRect();
    let ratio;
    
    if (direction === 'horizontal') {
      ratio = (e.clientX - rect.left) / rect.width;
    } else {
      ratio = (e.clientY - rect.top) / rect.height;
    }
    
    // Clamp to min/max
    ratio = Math.max(minRatio, Math.min(maxRatio, ratio));
    
    onResize?.(ratio);
  }, [direction, minRatio, maxRatio, onResize]);

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const isHorizontal = direction === 'horizontal';

  return (
    <div
      ref={dividerRef}
      onMouseDown={handleMouseDown}
      style={{
        position: 'relative',
        background: isDragging ? 'rgba(79, 195, 247, 0.5)' : 'rgba(255, 255, 255, 0.1)',
        cursor: isHorizontal ? 'col-resize' : 'row-resize',
        flexShrink: 0,
        zIndex: 10,
        transition: isDragging ? 'none' : 'background 0.2s',
        ...(isHorizontal ? {
          width: 6,
          height: '100%',
        } : {
          width: '100%',
          height: 6,
        }),
        ...style,
      }}
    >
      {/* Visual handle indicator */}
      <div
        style={{
          position: 'absolute',
          ...(isHorizontal ? {
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 2,
            height: 30,
          } : {
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 30,
            height: 2,
          }),
          background: isDragging ? 'rgba(79, 195, 247, 0.8)' : 'rgba(255, 255, 255, 0.3)',
          borderRadius: 1,
        }}
      />
    </div>
  );
};

export default DraggableDivider;
