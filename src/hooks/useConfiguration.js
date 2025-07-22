/**
 * useConfiguration Hook - Manages configuration save/load operations
 * Provides interface for configuration persistence and management
 */

import { useState, useCallback, useEffect } from 'react';
import {
  saveConfiguration,
  loadConfiguration,
  deleteConfiguration,
  getSavedConfigList,
  configurationExists,
  getConfigurationMetadata,
  exportConfiguration,
  importConfiguration
} from '../services/configurationService.js';

/**
 * Custom hook for managing configuration operations
 * @returns {Object} Configuration management interface
 */
export const useConfiguration = () => {
  const [savedConfigs, setSavedConfigs] = useState([]);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [lastOperation, setLastOperation] = useState(null);

  // Load saved configuration list on mount
  useEffect(() => {
    refreshConfigList();
  }, []);

  // Clear message after a delay
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => {
        setMessage('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  // Refresh the list of saved configurations
  const refreshConfigList = useCallback(async () => {
    try {
      setIsLoading(true);
      const configList = getSavedConfigList();
      
      // Get metadata for each configuration
      const configsWithMetadata = configList.map(name => {
        const metadata = getConfigurationMetadata(name);
        return metadata || { name, savedAt: null, version: null };
      }).filter(Boolean);
      
      setSavedConfigs(configsWithMetadata);
    } catch (error) {
      console.error('Failed to refresh config list:', error);
      setMessage('Failed to load configuration list');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Save current configuration
  const save = useCallback(async (filename, parameters, appState) => {
    if (!filename || !filename.trim()) {
      setMessage('Configuration name is required');
      return { success: false, message: 'Configuration name is required' };
    }

    try {
      setIsLoading(true);
      setLastOperation({ type: 'save', filename });
      
      const result = saveConfiguration(filename.trim(), parameters, appState);
      
      if (result.success) {
        await refreshConfigList();
        setMessage(result.message);
      } else {
        setMessage(result.message);
      }
      
      return result;
    } catch (error) {
      console.error('Failed to save configuration:', error);
      const errorMessage = 'Failed to save configuration';
      setMessage(errorMessage);
      return { success: false, message: errorMessage };
    } finally {
      setIsLoading(false);
    }
  }, [refreshConfigList]);

  // Load configuration
  const load = useCallback(async (filename) => {
    if (!filename || !filename.trim()) {
      setMessage('Configuration name is required');
      return { success: false, message: 'Configuration name is required' };
    }

    try {
      setIsLoading(true);
      setLastOperation({ type: 'load', filename });
      
      const result = loadConfiguration(filename.trim());
      
      if (result.success) {
        setMessage(result.message);
      } else {
        setMessage(result.message);
      }
      
      return result;
    } catch (error) {
      console.error('Failed to load configuration:', error);
      const errorMessage = 'Failed to load configuration';
      setMessage(errorMessage);
      return { success: false, message: errorMessage };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Delete configuration
  const deleteConfig = useCallback(async (filename) => {
    if (!filename || !filename.trim()) {
      setMessage('Configuration name is required');
      return { success: false, message: 'Configuration name is required' };
    }

    try {
      setIsLoading(true);
      setLastOperation({ type: 'delete', filename });
      
      const result = deleteConfiguration(filename.trim());
      
      if (result.success) {
        await refreshConfigList();
        setMessage(result.message);
      } else {
        setMessage(result.message);
      }
      
      return result;
    } catch (error) {
      console.error('Failed to delete configuration:', error);
      const errorMessage = 'Failed to delete configuration';
      setMessage(errorMessage);
      return { success: false, message: errorMessage };
    } finally {
      setIsLoading(false);
    }
  }, [refreshConfigList]);

  // Check if configuration exists
  const exists = useCallback((filename) => {
    if (!filename || !filename.trim()) {
      return false;
    }
    return configurationExists(filename.trim());
  }, []);

  // Get configuration metadata
  const getMetadata = useCallback((filename) => {
    if (!filename || !filename.trim()) {
      return null;
    }
    return getConfigurationMetadata(filename.trim());
  }, []);

  // Export configuration
  const exportConfig = useCallback(async (filename) => {
    if (!filename || !filename.trim()) {
      setMessage('Configuration name is required');
      return { success: false, message: 'Configuration name is required' };
    }

    try {
      setIsLoading(true);
      setLastOperation({ type: 'export', filename });
      
      const result = exportConfiguration(filename.trim());
      
      if (result.success) {
        setMessage(result.message);
      } else {
        setMessage(result.message);
      }
      
      return result;
    } catch (error) {
      console.error('Failed to export configuration:', error);
      const errorMessage = 'Failed to export configuration';
      setMessage(errorMessage);
      return { success: false, message: errorMessage };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Import configuration
  const importConfig = useCallback(async (filename, jsonData) => {
    if (!filename || !filename.trim()) {
      setMessage('Configuration name is required');
      return { success: false, message: 'Configuration name is required' };
    }

    if (!jsonData || !jsonData.trim()) {
      setMessage('Configuration data is required');
      return { success: false, message: 'Configuration data is required' };
    }

    try {
      setIsLoading(true);
      setLastOperation({ type: 'import', filename });
      
      const result = importConfiguration(filename.trim(), jsonData.trim());
      
      if (result.success) {
        await refreshConfigList();
        setMessage(result.message);
      } else {
        setMessage(result.message);
      }
      
      return result;
    } catch (error) {
      console.error('Failed to import configuration:', error);
      const errorMessage = 'Failed to import configuration';
      setMessage(errorMessage);
      return { success: false, message: errorMessage };
    } finally {
      setIsLoading(false);
    }
  }, [refreshConfigList]);

  // Clear message manually
  const clearMessage = useCallback(() => {
    setMessage('');
  }, []);

  // Get list of configuration names only
  const getConfigNames = useCallback(() => {
    return savedConfigs.map(config => config.name);
  }, [savedConfigs]);

  // Check if any operation is in progress
  const isBusy = isLoading;

  return {
    // Configuration list
    savedConfigs,
    configNames: getConfigNames(),
    
    // Operations
    save,
    load,
    delete: deleteConfig,
    exists,
    
    // Import/Export
    export: exportConfig,
    import: importConfig,
    
    // Utilities
    getMetadata,
    refreshConfigList,
    
    // State
    message,
    isLoading,
    isBusy,
    lastOperation,
    
    // Actions
    clearMessage
  };
};

export default useConfiguration;