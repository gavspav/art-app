/**
 * SettingsPanel Component
 * Main settings modal that contains parameter editing and configuration management
 */

import React, { useState, useCallback, useEffect } from 'react';
import ParameterEditor from './ParameterEditor.jsx';
import ConfigurationManager from './ConfigurationManager.jsx';
import styles from './Settings.module.css';

const SettingsPanel = ({ 
  isOpen, 
  onClose, 
  parameters, 
  values,
  onParameterUpdate,
  onValueUpdate,
  onRandomizeParameter,
  onResetParameter,
  onConfigurationLoad
}) => {
  const [activeTab, setActiveTab] = useState('parameters');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('info');

  // Handle escape key to close modal
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  // Handle overlay click to close modal
  const handleOverlayClick = useCallback((event) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }, [onClose]);

  // Handle message display
  const handleMessage = useCallback((msg, type = 'info') => {
    setMessage(msg);
    setMessageType(type);
    
    // Auto-clear message after 5 seconds
    setTimeout(() => {
      setMessage('');
    }, 5000);
  }, []);

  // Handle configuration load
  const handleConfigurationLoad = useCallback((configData) => {
    if (onConfigurationLoad) {
      onConfigurationLoad(configData);
      handleMessage('Configuration loaded successfully!', 'success');
    }
  }, [onConfigurationLoad, handleMessage]);

  // Handle parameter randomization
  const handleRandomizeParameter = useCallback((parameterId) => {
    if (onRandomizeParameter) {
      onRandomizeParameter(parameterId);
      handleMessage(`Randomized ${parameterId}`, 'info');
    }
  }, [onRandomizeParameter, handleMessage]);

  // Handle parameter reset
  const handleResetParameter = useCallback((parameterId) => {
    if (onResetParameter) {
      onResetParameter(parameterId);
      handleMessage(`Reset ${parameterId} to default`, 'info');
    }
  }, [onResetParameter, handleMessage]);

  // Clear message
  const clearMessage = useCallback(() => {
    setMessage('');
  }, []);

  // Don't render if not open
  if (!isOpen) {
    return null;
  }

  return (
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.panel}>
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.title}>Settings</h2>
          <button 
            onClick={onClose}
            className={styles.closeButton}
            aria-label="Close settings"
          >
            ×
          </button>
        </div>

        {/* Tab Navigation */}
        <div className={styles.tabs}>
          <button
            onClick={() => setActiveTab('parameters')}
            className={`${styles.tab} ${activeTab === 'parameters' ? styles.active : ''}`}
          >
            Parameters
          </button>
          <button
            onClick={() => setActiveTab('configurations')}
            className={`${styles.tab} ${activeTab === 'configurations' ? styles.active : ''}`}
          >
            Configurations
          </button>
        </div>

        {/* Content */}
        <div className={styles.content}>
          {/* Message Display */}
          {message && (
            <div className={`${styles.message} ${styles[messageType]}`}>
              {message}
              <button
                onClick={clearMessage}
                style={{
                  float: 'right',
                  background: 'none',
                  border: 'none',
                  color: 'inherit',
                  cursor: 'pointer',
                  fontSize: '1.2rem',
                  lineHeight: 1,
                  padding: 0,
                  marginLeft: '10px'
                }}
              >
                ×
              </button>
            </div>
          )}

          {/* Tab Content */}
          <div className={styles.tabContent}>
            {activeTab === 'parameters' && (
              <ParameterEditor
                parameters={parameters}
                values={values}
                onParameterUpdate={onParameterUpdate}
                onValueUpdate={onValueUpdate}
                onRandomizeParameter={handleRandomizeParameter}
                onResetParameter={handleResetParameter}
              />
            )}

            {activeTab === 'configurations' && (
              <ConfigurationManager
                parameters={parameters}
                values={values}
                onConfigurationLoad={handleConfigurationLoad}
                onMessage={handleMessage}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;