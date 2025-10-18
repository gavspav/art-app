import React, { createContext, useState, useContext } from 'react';
import {
  DEFAULT_PARAMETERS,
  mergeParametersWithDefaults,
  applyParameterUpdate,
} from '@art-app/core';

const mergeWithDefaults = (savedParams) => {
  try {
    return mergeParametersWithDefaults(savedParams);
  } catch (e) {
    console.warn('Failed to merge parameters with defaults, falling back to defaults', e);
    return DEFAULT_PARAMETERS.map(param => ({ ...param }));
  }
};

// Create the context
const ParameterContext = createContext();

// Create a custom hook for easy access to the context
export const useParameters = () => useContext(ParameterContext);

// Create the provider component
export const ParameterProvider = ({ children }) => {
  const [parameters, setParameters] = useState(() => {
    // Try to load saved parameters from localStorage
    try {
      const saved = localStorage.getItem('artapp-parameters');
      if (saved) {
        const savedParams = JSON.parse(saved);
        return mergeWithDefaults(savedParams);
      }
    } catch (error) {
      console.warn('Failed to load saved parameters:', error);
    }
    return DEFAULT_PARAMETERS.map(param => ({ ...param }));
  });

  const updateParameter = (id, field, value) => {
    setParameters(prevParams => {
      let nextParams = applyParameterUpdate(prevParams, id, field, value);

      // Auto-save to localStorage
      try {
        localStorage.setItem('artapp-parameters', JSON.stringify(nextParams));
      } catch (error) {
        console.warn('Failed to save parameters:', error);
      }
      
      return nextParams;
    });
  };

  const saveParameters = (filename = 'default') => {
    try {
      const key = `artapp-config-${filename}`;
      const configData = {
        parameters,
        savedAt: new Date().toISOString(),
        version: '2.0'
      };
      configData.exportMeta = buildExportMeta();
      localStorage.setItem(key, JSON.stringify(configData));
      
      // Also update the list of saved configurations
      const configList = getSavedConfigList();
      if (!configList.includes(filename)) {
        configList.push(filename);
        localStorage.setItem('artapp-config-list', JSON.stringify(configList));
      }
      
      return { success: true, message: `Configuration '${filename}' saved successfully!` };
    } catch (error) {
      console.error('Failed to save parameters:', error);
      return { success: false, message: 'Failed to save configuration' };
    }
  };

  const saveFullConfiguration = (filename = 'default', appState = null, exportMetaArg = null) => {
    try {
      const key = `artapp-config-${filename}`;
      const configData = {
        parameters,
        appState: appState || null,
        savedAt: new Date().toISOString(),
        version: '2.0'
      };
      const meta = exportMetaArg || buildExportMeta();
      configData.exportMeta = meta;
      localStorage.setItem(key, JSON.stringify(configData));
      
      // Also update the list of saved configurations
      const configList = getSavedConfigList();
      if (!configList.includes(filename)) {
        configList.push(filename);
        localStorage.setItem('artapp-config-list', JSON.stringify(configList));
      }
      
      const stateMsg = appState ? ' (including app state)' : '';
      return { success: true, message: `Configuration '${filename}' saved successfully${stateMsg}!` };
    } catch (error) {
      console.error('Failed to save full configuration:', error);
      return { success: false, message: 'Failed to save configuration' };
    }
  };

  const loadParameters = (filename = 'default') => {
    try {
      const key = `artapp-config-${filename}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        const configData = JSON.parse(saved);
        const savedParams = configData.parameters || configData; // Handle both old and new format
        const mergedParams = mergeWithDefaults(savedParams);
        setParameters(mergedParams);
        return {
          success: true,
          message: `Configuration '${filename}' loaded successfully!`,
          exportMeta: configData.exportMeta || null,
        };
      } else {
        return { success: false, message: `Configuration '${filename}' not found` };
      }
    } catch (error) {
      console.error('Failed to load parameters:', error);
      return { success: false, message: 'Failed to load configuration' };
    }
  };

  const loadFullConfiguration = (filename = 'default') => {
    try {
      const key = `artapp-config-${filename}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        const configData = JSON.parse(saved);
        const savedParams = configData.parameters || configData; // Handle both old and new format
        const mergedParams = mergeWithDefaults(savedParams);
        setParameters(mergedParams);

        // Return both parameters and app state
        return { 
          success: true, 
          message: `Configuration '${filename}' loaded successfully!`,
          appState: configData.appState || null,
          exportMeta: configData.exportMeta || null,
        };
      } else {
        return { success: false, message: `Configuration '${filename}' not found` };
      }
    } catch (error) {
      console.error('Failed to load full configuration:', error);
      return { success: false, message: 'Failed to load configuration' };
    }
  };

  const deleteConfiguration = (filename) => {
    try {
      const key = `artapp-config-${filename}`;
      localStorage.removeItem(key);
      
      // Update the list of saved configurations
      const configList = getSavedConfigList().filter(name => name !== filename);
      localStorage.setItem('artapp-config-list', JSON.stringify(configList));
      
      return { success: true, message: `Configuration '${filename}' deleted successfully!` };
    } catch (error) {
      console.error('Failed to delete configuration:', error);
      return { success: false, message: 'Failed to delete configuration' };
    }
  };

  const getSavedConfigList = () => {
    try {
      const saved = localStorage.getItem('artapp-config-list');
      return saved ? JSON.parse(saved) : [];
    } catch (error) {
      console.warn('Failed to get config list:', error);
      return [];
    }
  };

  const resetToDefaults = () => {
    setParameters(DEFAULT_PARAMETERS.map(param => ({ ...param })));
    // Don't clear saved configurations, just reset current parameters
    return { success: true, message: 'Parameters reset to defaults' };
  };

  const applyParametersSnapshot = React.useCallback((snapshot) => {
    try {
      const merged = mergeParametersWithDefaults(snapshot);
      setParameters(merged);
      return true;
    } catch (error) {
      console.warn('Failed to apply parameter snapshot:', error);
      return false;
    }
  }, []);

  const value = {
    parameters,
    updateParameter,
    saveParameters,
    loadParameters,
    saveFullConfiguration,
    loadFullConfiguration,
    deleteConfiguration,
    getSavedConfigList,
    resetToDefaults,
    applyParametersSnapshot,
  };

  return (
    <ParameterContext.Provider value={value}>
      {children}
    </ParameterContext.Provider>
  );
};
const buildExportMeta = () => {
  if (typeof window === 'undefined') {
    return {
      version: '2.0',
      canvasWidth: 0,
      canvasHeight: 0,
      exportedAt: new Date().toISOString(),
    };
  }
  const meta = window.__artapp_canvasMeta || {};
  const width = Math.round(Number(meta.width ?? window.innerWidth ?? 0));
  const height = Math.round(Number(meta.height ?? window.innerHeight ?? 0));
  return {
    version: '2.0',
    canvasWidth: width,
    canvasHeight: height,
    exportedAt: new Date().toISOString(),
  };
};
