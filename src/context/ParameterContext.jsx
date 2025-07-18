import React, { createContext, useState, useContext, useEffect } from 'react';
import { PARAMETERS } from '../config/parameters';

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
        // Merge saved parameters with defaults to handle new parameters
        return PARAMETERS.map(defaultParam => {
          const savedParam = savedParams.find(p => p.id === defaultParam.id);
          return savedParam ? { ...defaultParam, ...savedParam } : defaultParam;
        });
      }
    } catch (error) {
      console.warn('Failed to load saved parameters:', error);
    }
    return PARAMETERS;
  });

  const updateParameter = (id, field, value) => {
    setParameters(prevParams => {
      const updatedParams = prevParams.map(p => {
        if (p.id === id) {
          // Ensure numeric values are stored as numbers
          const newValue = (field === 'min' || field === 'max' || field === 'step' || field === 'defaultValue') 
            ? parseFloat(value) 
            : value;
          return { ...p, [field]: newValue };
        }
        return p;
      });
      
      // Auto-save to localStorage
      try {
        localStorage.setItem('artapp-parameters', JSON.stringify(updatedParams));
      } catch (error) {
        console.warn('Failed to save parameters:', error);
      }
      
      return updatedParams;
    });
  };

  const saveParameters = (filename = 'default') => {
    try {
      const key = `artapp-config-${filename}`;
      const configData = {
        parameters,
        savedAt: new Date().toISOString(),
        version: '1.0'
      };
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

  const saveFullConfiguration = (filename = 'default', appState = null) => {
    try {
      const key = `artapp-config-${filename}`;
      const configData = {
        parameters,
        appState: appState || null,
        savedAt: new Date().toISOString(),
        version: '1.1'
      };
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
        
        // Merge with defaults to handle new parameters
        const mergedParams = PARAMETERS.map(defaultParam => {
          const savedParam = savedParams.find(p => p.id === defaultParam.id);
          return savedParam ? { ...defaultParam, ...savedParam } : defaultParam;
        });
        setParameters(mergedParams);
        return { success: true, message: `Configuration '${filename}' loaded successfully!` };
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
        
        // Merge with defaults to handle new parameters
        const mergedParams = PARAMETERS.map(defaultParam => {
          const savedParam = savedParams.find(p => p.id === defaultParam.id);
          return savedParam ? { ...defaultParam, ...savedParam } : defaultParam;
        });
        setParameters(mergedParams);
        
        // Return both parameters and app state
        return { 
          success: true, 
          message: `Configuration '${filename}' loaded successfully!`,
          appState: configData.appState || null
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
    setParameters(PARAMETERS);
    // Don't clear saved configurations, just reset current parameters
    return { success: true, message: 'Parameters reset to defaults' };
  };

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
  };

  return (
    <ParameterContext.Provider value={value}>
      {children}
    </ParameterContext.Provider>
  );
};
