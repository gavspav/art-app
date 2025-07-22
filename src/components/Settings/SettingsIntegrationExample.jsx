/**
 * SettingsIntegrationExample Component
 * Example of how to integrate the Settings components with the main application
 */

import React, { useState, useCallback } from 'react';
import { SettingsPanel } from './index.js';
import { PARAMETERS } from '../../constants/parameters.js';
import useParameters from '../../hooks/useParameters.js';

const SettingsIntegrationExample = () => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  // Use the parameters hook for state management
  const {
    parameters,
    values,
    updateParameter,
    randomizeParameters,
    resetParameters
  } = useParameters();

  // Handle opening settings
  const openSettings = useCallback(() => {
    setIsSettingsOpen(true);
  }, []);

  // Handle closing settings
  const closeSettings = useCallback(() => {
    setIsSettingsOpen(false);
  }, []);

  // Handle parameter value updates
  const handleValueUpdate = useCallback((parameterId, value) => {
    updateParameter(parameterId, value);
  }, [updateParameter]);

  // Handle parameter randomization
  const handleRandomizeParameter = useCallback((parameterId) => {
    randomizeParameters([parameterId]);
  }, [randomizeParameters]);

  // Handle parameter reset
  const handleResetParameter = useCallback((parameterId) => {
    resetParameters([parameterId]);
  }, [resetParameters]);

  // Handle configuration load
  const handleConfigurationLoad = useCallback((configData) => {
    if (configData.appState) {
      // Update application state with loaded configuration
      Object.entries(configData.appState).forEach(([key, value]) => {
        if (values[key] !== undefined) {
          updateParameter(key, value);
        }
      });
    }
  }, [updateParameter, values]);

  return (
    <div style={{ padding: '20px' }}>
      <h1>Settings Integration Example</h1>
      <p>This demonstrates how to integrate the Settings components with your application.</p>
      
      <button 
        onClick={openSettings}
        style={{
          background: '#4a9eff',
          color: 'white',
          border: 'none',
          padding: '10px 20px',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '16px'
        }}
      >
        Open Settings
      </button>

      <div style={{ marginTop: '20px' }}>
        <h2>Current Parameter Values:</h2>
        <pre style={{ 
          background: '#f5f5f5', 
          padding: '10px', 
          borderRadius: '4px',
          fontSize: '12px',
          overflow: 'auto',
          maxHeight: '300px'
        }}>
          {JSON.stringify(values, null, 2)}
        </pre>
      </div>

      <SettingsPanel
        isOpen={isSettingsOpen}
        onClose={closeSettings}
        parameters={PARAMETERS}
        values={values}
        onValueUpdate={handleValueUpdate}
        onRandomizeParameter={handleRandomizeParameter}
        onResetParameter={handleResetParameter}
        onConfigurationLoad={handleConfigurationLoad}
      />
    </div>
  );
};

export default SettingsIntegrationExample;