/**
 * SplitLayout Component
 * 
 * A layout component that splits the screen into two panels (left and right or top and bottom).
 */

import React, { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import styles from './Layout.module.css';

/**
 * SplitLayout divides the screen into two panels with a draggable divider
 * 
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.left - Content for the left/top panel
 * @param {React.ReactNode} props.right - Content for the right/bottom panel
 * @param {boolean} props.vertical - If true, splits vertically (top/bottom) instead of horizontally
 * @param {string} props.className - Optional additional CSS class
 * @param {number} props.defaultSize - Default size of the left/top panel in pixels
 * @param {number} props.minSize - Minimum size of the left/top panel in pixels
 * @param {number} props.maxSize - Maximum size of the left/top panel in pixels
 * @returns {React.ReactElement} The rendered SplitLayout component
 */
const SplitLayout = ({ left, right, vertical, className, defaultSize, minSize, maxSize }) => {
  const [panelSize, setPanelSize] = useState(defaultSize || 300);
  const [isDragging, setIsDragging] = useState(false);
  const splitLayoutRef = useRef(null);
  
  console.log('SplitLayout props:', { defaultSize, minSize, maxSize });
  
  const layoutClass = `${styles.splitLayout} ${vertical ? styles.verticalSplit : ''} ${className || ''}`;
  
  // Handle mouse down on divider
  const handleMouseDown = (e) => {
    console.log('Divider mouse down event triggered');
    e.preventDefault();
    setIsDragging(true);
  };
  
  // Handle mouse move for resizing
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging || !splitLayoutRef.current) return;
      
      const containerRect = splitLayoutRef.current.getBoundingClientRect();
      let newSize;
      
      if (vertical) {
        newSize = e.clientY - containerRect.top;
      } else {
        newSize = e.clientX - containerRect.left;
      }
      
      // Constrain size between min and max
      const constrainedSize = Math.max(minSize, Math.min(maxSize, newSize));
      setPanelSize(constrainedSize);
    };
    
    const handleMouseUp = () => {
      setIsDragging(false);
    };
    
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, vertical, minSize, maxSize]);
  
  const panelStyle = vertical 
    ? { height: `${panelSize}px` }
    : { width: `${panelSize}px` };
    
  const dividerStyle = vertical
    ? { top: `${panelSize}px` }
    : { left: `${panelSize}px` };
    
  console.log('Panel size:', panelSize, 'Divider style:', dividerStyle);
  
  return (
    <div ref={splitLayoutRef} className={layoutClass}>
      <div 
        className={styles.leftPanel} 
        style={panelStyle}
      >
        {left}
      </div>
      
      {/* Draggable divider */}
      <div 
        className={`${styles.divider} ${vertical ? styles.verticalDivider : styles.horizontalDivider} ${isDragging ? styles.dragging : ''}`}
        style={dividerStyle}
        onMouseDown={handleMouseDown}
      />
      
      <div className={styles.rightPanel}>
        {right}
      </div>
    </div>
  );
};

SplitLayout.propTypes = {
  left: PropTypes.node.isRequired,
  right: PropTypes.node.isRequired,
  vertical: PropTypes.bool,
  className: PropTypes.string,
  defaultSize: PropTypes.number,
  minSize: PropTypes.number,
  maxSize: PropTypes.number
};

SplitLayout.defaultProps = {
  vertical: false,
  className: '',
  defaultSize: 300,
  minSize: 200,
  maxSize: 600
};

export default SplitLayout;