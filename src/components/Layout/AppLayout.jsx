/**
 * AppLayout Component
 * 
 * Main layout component for the application that provides the overall structure
 * including header, main content area, and footer.
 */

import React from 'react';
import PropTypes from 'prop-types';
import styles from './Layout.module.css';

/**
 * AppLayout component provides the main layout structure for the application
 * 
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components to render in the main content area
 * @param {React.ReactNode} props.header - Optional header content
 * @param {React.ReactNode} props.footer - Optional footer content
 * @param {string} props.className - Optional additional CSS class
 * @returns {React.ReactElement} The rendered AppLayout component
 */
const AppLayout = ({ children, header, footer, className }) => {
  return (
    <div className={`${styles.appLayout} ${className || ''}`}>
      {header && <header className={styles.header}>{header}</header>}
      
      <main className={styles.mainContent}>
        {children}
      </main>
      
      {footer && <footer className={styles.footer}>{footer}</footer>}
    </div>
  );
};

AppLayout.propTypes = {
  children: PropTypes.node.isRequired,
  header: PropTypes.node,
  footer: PropTypes.node,
  className: PropTypes.string
};

AppLayout.defaultProps = {
  header: null,
  footer: null,
  className: ''
};

export default AppLayout;