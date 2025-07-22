/**
 * Storage Service - Provides localStorage abstraction with error handling
 * Based on the original CodePen implementation's storage patterns
 */

import { handleStorageError } from '../utils/errorHandling.js';

/**
 * Storage keys used by the application
 */
export const STORAGE_KEYS = {
  PARAMETERS: 'artapp-parameters',
  CONFIG_LIST: 'artapp-config-list',
  CONFIG_PREFIX: 'artapp-config-'
};

/**
 * Check if localStorage is available and functional
 * @returns {boolean} True if localStorage is available
 */
export const isStorageAvailable = () => {
  try {
    const test = '__storage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch (error) {
    console.warn('localStorage is not available:', error);
    return false;
  }
};

/**
 * Get item from localStorage with error handling
 * @param {string} key - Storage key
 * @returns {string|null} Stored value or null if not found/error
 */
export const getItem = (key) => {
  if (!isStorageAvailable()) {
    return null;
  }

  try {
    return localStorage.getItem(key);
  } catch (error) {
    handleStorageError('load', key, error);
    return null;
  }
};

/**
 * Set item in localStorage with error handling
 * @param {string} key - Storage key
 * @param {string} value - Value to store
 * @returns {boolean} True if successful
 */
export const setItem = (key, value) => {
  if (!isStorageAvailable()) {
    return false;
  }

  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    handleStorageError('save', key, error);
    return false;
  }
};

/**
 * Remove item from localStorage with error handling
 * @param {string} key - Storage key
 * @returns {boolean} True if successful
 */
export const removeItem = (key) => {
  if (!isStorageAvailable()) {
    return false;
  }

  try {
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    handleStorageError('delete', key, error);
    return false;
  }
};

/**
 * Get parsed JSON from localStorage
 * @param {string} key - Storage key
 * @param {*} defaultValue - Default value if parsing fails
 * @returns {*} Parsed value or default
 */
export const getJSON = (key, defaultValue = null) => {
  const item = getItem(key);
  if (!item) {
    return defaultValue;
  }

  try {
    return JSON.parse(item);
  } catch (error) {
    handleStorageError('parse', key, error);
    return defaultValue;
  }
};

/**
 * Set JSON value in localStorage
 * @param {string} key - Storage key
 * @param {*} value - Value to stringify and store
 * @returns {boolean} True if successful
 */
export const setJSON = (key, value) => {
  try {
    const jsonString = JSON.stringify(value);
    return setItem(key, jsonString);
  } catch (error) {
    handleStorageError('stringify', key, error);
    return false;
  }
};

/**
 * Clear all application data from localStorage
 * @returns {boolean} True if successful
 */
export const clearAppData = () => {
  if (!isStorageAvailable()) {
    return false;
  }

  try {
    // Get all configuration keys
    const configList = getJSON(STORAGE_KEYS.CONFIG_LIST, []);
    
    // Remove all configurations
    configList.forEach(configName => {
      removeItem(`${STORAGE_KEYS.CONFIG_PREFIX}${configName}`);
    });

    // Remove main storage keys
    removeItem(STORAGE_KEYS.PARAMETERS);
    removeItem(STORAGE_KEYS.CONFIG_LIST);

    return true;
  } catch (error) {
    console.warn('Failed to clear app data:', error);
    return false;
  }
};

/**
 * Get storage usage information
 * @returns {Object} Storage usage stats
 */
export const getStorageInfo = () => {
  if (!isStorageAvailable()) {
    return {
      available: false,
      used: 0,
      total: 0,
      percentage: 0
    };
  }

  try {
    // Estimate storage usage by calculating total size of stored data
    let totalSize = 0;
    
    // Get all keys that start with 'artapp-'
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('artapp-')) {
        keys.push(key);
      }
    }
    
    // Calculate total size for our app's data
    keys.forEach(key => {
      const value = localStorage.getItem(key);
      if (value) {
        totalSize += value.length + key.length;
      }
    });

    // Most browsers have ~5-10MB localStorage limit
    const estimatedLimit = 5 * 1024 * 1024; // 5MB in bytes
    
    return {
      available: true,
      used: totalSize,
      total: estimatedLimit,
      percentage: Math.round((totalSize / estimatedLimit) * 100)
    };
  } catch (error) {
    console.warn('Failed to get storage info:', error);
    return {
      available: true,
      used: 0,
      total: 0,
      percentage: 0
    };
  }
};