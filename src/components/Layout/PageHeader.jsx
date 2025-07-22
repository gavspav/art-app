/**
 * PageHeader Component
 * 
 * Header component for the application that includes the app title and actions.
 */

import React from 'react';
import PropTypes from 'prop-types';
import styles from './Layout.module.css';

/**
 * PageHeader component for displaying the application header
 * 
 * @param {Object} props - Component props
 * @param {string} props.title - The title to display in the header
 * @param {React.ReactNode} props.actions - Optional action buttons/controls to display in the header
 * @param {string} props.className - Optional additional CSS class
 * @returns {React.ReactElement} The rendered PageHeader component
 */
const PageHeader = ({ title, actions, className }) => {
  return (
    <div className={`${styles.pageHeader} ${className || ''}`}>
      <h1 className={styles.pageTitle}>{title}</h1>
      {actions && <div className={styles.headerActions}>{actions}</div>}
    </div>
  );
};

PageHeader.propTypes = {
  title: PropTypes.string.isRequired,
  actions: PropTypes.node,
  className: PropTypes.string
};

PageHeader.defaultProps = {
  actions: null,
  className: ''
};

export default PageHeader;