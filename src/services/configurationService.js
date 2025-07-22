/**
 * Configuration Service - Handles save/load operations for app configurations
 * Based on the original CodePen implementation's configuration format
 */

import { getJSON, setJSON, removeItem, STORAGE_KEYS } from './storageService.js';

/**
 * Configuration data structure version
 */
const CONFIG_VERSION = '1.0';

/**
 * Get list of saved configuration names
 * @returns {string[]} Array of configuration names
 */
export const getSavedConfigList = () => {
  return getJSON(STORAGE_KEYS.CONFIG_LIST, []);
};

/**
 * Save application configuration
 * @param {string} filename - Configuration name
 * @param {Object} parameters - Parameter definitions
 * @param {Object} appState - Current application state
 * @returns {Object} Result object with success status and message
 */
export const saveConfiguration = (filename = 'default', parameters, appState) => {
  try {
    if (!filename || typeof filename !== 'string') {
      return { success: false, message: 'Invalid filename provided' };
    }

    const trimmedFilename = filename.trim();
    if (!trimmedFilename) {
      return { success: false, message: 'Filename cannot be empty' };
    }

    const key = `${STORAGE_KEYS.CONFIG_PREFIX}${trimmedFilename}`;
    const configData = {
      parameters: parameters || [],
      appState: appState || {},
      savedAt: new Date().toISOString(),
      version: CONFIG_VERSION
    };

    const success = setJSON(key, configData);
    if (!success) {
      return { success: false, message: 'Failed to save configuration to storage' };
    }

    // Update config list
    const configList = getSavedConfigList();
    if (!configList.includes(trimmedFilename)) {
      configList.push(trimmedFilename);
      const listSuccess = setJSON(STORAGE_KEYS.CONFIG_LIST, configList);
      if (!listSuccess) {
        // Try to clean up the config we just saved
        removeItem(key);
        return { success: false, message: 'Failed to update configuration list' };
      }
    }

    return { 
      success: true, 
      message: `Configuration '${trimmedFilename}' saved successfully!` 
    };
  } catch (error) {
    console.error('Failed to save configuration:', error);
    return { success: false, message: 'Failed to save configuration' };
  }
};

/**
 * Load application configuration
 * @param {string} filename - Configuration name to load
 * @returns {Object} Result object with success status, message, and data
 */
export const loadConfiguration = (filename = 'default') => {
  try {
    if (!filename || typeof filename !== 'string') {
      return { success: false, message: 'Invalid filename provided' };
    }

    const trimmedFilename = filename.trim();
    if (!trimmedFilename) {
      return { success: false, message: 'Filename cannot be empty' };
    }

    const key = `${STORAGE_KEYS.CONFIG_PREFIX}${trimmedFilename}`;
    const configData = getJSON(key);

    if (!configData) {
      return { 
        success: false, 
        message: `Configuration '${trimmedFilename}' not found` 
      };
    }

    // Validate configuration structure
    if (!configData.version) {
      console.warn('Loading configuration without version info');
    }

    return {
      success: true,
      message: `Configuration '${trimmedFilename}' loaded successfully!`,
      data: {
        parameters: configData.parameters || [],
        appState: configData.appState || {},
        savedAt: configData.savedAt,
        version: configData.version
      }
    };
  } catch (error) {
    console.error('Failed to load configuration:', error);
    return { success: false, message: 'Failed to load configuration' };
  }
};

/**
 * Delete application configuration
 * @param {string} filename - Configuration name to delete
 * @returns {Object} Result object with success status and message
 */
export const deleteConfiguration = (filename) => {
  try {
    if (!filename || typeof filename !== 'string') {
      return { success: false, message: 'Invalid filename provided' };
    }

    const trimmedFilename = filename.trim();
    if (!trimmedFilename) {
      return { success: false, message: 'Filename cannot be empty' };
    }

    const key = `${STORAGE_KEYS.CONFIG_PREFIX}${trimmedFilename}`;
    
    // Check if configuration exists
    const configData = getJSON(key);
    if (!configData) {
      return { 
        success: false, 
        message: `Configuration '${trimmedFilename}' not found` 
      };
    }

    // Remove the configuration
    const removeSuccess = removeItem(key);
    if (!removeSuccess) {
      return { success: false, message: 'Failed to delete configuration from storage' };
    }

    // Update config list
    const configList = getSavedConfigList();
    const updatedList = configList.filter(name => name !== trimmedFilename);
    const listSuccess = setJSON(STORAGE_KEYS.CONFIG_LIST, updatedList);
    
    if (!listSuccess) {
      console.warn('Failed to update configuration list after deletion');
    }

    return { 
      success: true, 
      message: `Configuration '${trimmedFilename}' deleted successfully!` 
    };
  } catch (error) {
    console.error('Failed to delete configuration:', error);
    return { success: false, message: 'Failed to delete configuration' };
  }
};

/**
 * Check if a configuration exists
 * @param {string} filename - Configuration name to check
 * @returns {boolean} True if configuration exists
 */
export const configurationExists = (filename) => {
  if (!filename || typeof filename !== 'string') {
    return false;
  }

  const trimmedFilename = filename.trim();
  if (!trimmedFilename) {
    return false;
  }

  const key = `${STORAGE_KEYS.CONFIG_PREFIX}${trimmedFilename}`;
  const configData = getJSON(key);
  return configData !== null;
};

/**
 * Get configuration metadata without loading full data
 * @param {string} filename - Configuration name
 * @returns {Object|null} Configuration metadata or null if not found
 */
export const getConfigurationMetadata = (filename) => {
  try {
    if (!filename || typeof filename !== 'string') {
      return null;
    }

    const trimmedFilename = filename.trim();
    if (!trimmedFilename) {
      return null;
    }

    const key = `${STORAGE_KEYS.CONFIG_PREFIX}${trimmedFilename}`;
    const configData = getJSON(key);

    if (!configData) {
      return null;
    }

    return {
      name: trimmedFilename,
      savedAt: configData.savedAt,
      version: configData.version,
      hasParameters: Array.isArray(configData.parameters) && configData.parameters.length > 0,
      hasAppState: configData.appState && Object.keys(configData.appState).length > 0
    };
  } catch (error) {
    console.error('Failed to get configuration metadata:', error);
    return null;
  }
};

/**
 * Export configuration as JSON string for backup/sharing
 * @param {string} filename - Configuration name to export
 * @returns {Object} Result object with success status and data
 */
export const exportConfiguration = (filename) => {
  const result = loadConfiguration(filename);
  if (!result.success) {
    return result;
  }

  try {
    const exportData = {
      ...result.data,
      exportedAt: new Date().toISOString(),
      exportedFrom: 'Art App'
    };

    return {
      success: true,
      message: `Configuration '${filename}' exported successfully`,
      data: JSON.stringify(exportData, null, 2)
    };
  } catch (error) {
    console.error('Failed to export configuration:', error);
    return { success: false, message: 'Failed to export configuration' };
  }
};

/**
 * Import configuration from JSON string
 * @param {string} filename - Name for the imported configuration
 * @param {string} jsonData - JSON string containing configuration data
 * @returns {Object} Result object with success status and message
 */
export const importConfiguration = (filename, jsonData) => {
  try {
    if (!filename || typeof filename !== 'string') {
      return { success: false, message: 'Invalid filename provided' };
    }

    if (!jsonData || typeof jsonData !== 'string') {
      return { success: false, message: 'Invalid JSON data provided' };
    }

    const configData = JSON.parse(jsonData);
    
    // Validate imported data structure
    if (!configData.parameters && !configData.appState) {
      return { success: false, message: 'Invalid configuration format' };
    }

    return saveConfiguration(filename, configData.parameters, configData.appState);
  } catch (error) {
    console.error('Failed to import configuration:', error);
    if (error instanceof SyntaxError) {
      return { success: false, message: 'Invalid JSON format' };
    }
    return { success: false, message: 'Failed to import configuration' };
  }
};