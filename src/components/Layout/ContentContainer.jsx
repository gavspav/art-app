/**
 * ContentContainer Component
 * 
 * A container component that provides consistent padding and styling for content areas.
 */

import React from 'react';
import PropTypes from 'prop-types';
import styles from './Layout.module.css';

/**
 * ContentContainer provides consistent padding and styling for content areas
 * 
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components to render
 * @param {string} props.className - Optional additional CSS class
 * @param {boolean} props.noPadding - If true, removes default padding
 * @returns {React.ReactElement} The rendered ContentContainer component
 */
const ContentContainer = ({ children, className, noPadding }) => {
  const containerClass = `${styles.contentContainer} ${noPadding ? styles.noPadding : ''} ${className || ''}`;
  
  return (
    <div className={containerClass}>
      {children}
    </div>
  );
};

ContentContainer.propTypes = {
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
  noPadding: PropTypes.bool
};

ContentContainer.defaultProps = {
  className: '',
  noPadding: false
};

export default ContentContainer;