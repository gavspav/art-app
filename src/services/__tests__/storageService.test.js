/**
 * Unit tests for storageService
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isStorageAvailable,
  getItem,
  setItem,
  removeItem,
  getJSON,
  setJSON,
  clearAppData,
  getStorageInfo,
  STORAGE_KEYS
} from '../storageService.js';

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: vi.fn((key) => store[key] || null),
    setItem: vi.fn((key, value) => {
      store[key] = value.toString();
    }),
    removeItem: vi.fn((key) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index) => Object.keys(store)[index] || null),
    // Add hasOwnProperty method for getStorageInfo function
    hasOwnProperty: (key) => store.hasOwnProperty(key),
    // Make store iterable for getStorageInfo
    [Symbol.iterator]: function* () {
      for (let key in store) {
        yield key;
      }
    },
    // Expose store for testing
    __getStore: () => store
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true
});

describe('storageService', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  describe('isStorageAvailable', () => {
    it('should return true when localStorage is available', () => {
      expect(isStorageAvailable()).toBe(true);
    });

    it('should return false when localStorage throws an error', () => {
      localStorageMock.setItem.mockImplementationOnce(() => {
        throw new Error('Storage not available');
      });
      
      expect(isStorageAvailable()).toBe(false);
    });
  });

  describe('getItem', () => {
    it('should return stored value', () => {
      localStorageMock.setItem('test-key', 'test-value');
      expect(getItem('test-key')).toBe('test-value');
    });

    it('should return null for non-existent key', () => {
      expect(getItem('non-existent')).toBe(null);
    });

    it('should return null when localStorage throws an error', () => {
      localStorageMock.getItem.mockImplementationOnce(() => {
        throw new Error('Storage error');
      });
      
      expect(getItem('test-key')).toBe(null);
    });
  });

  describe('setItem', () => {
    it('should store value successfully', () => {
      const result = setItem('test-key', 'test-value');
      expect(result).toBe(true);
      expect(localStorageMock.setItem).toHaveBeenCalledWith('test-key', 'test-value');
    });

    it('should return false when localStorage throws an error', () => {
      localStorageMock.setItem.mockImplementationOnce(() => {
        throw new Error('Storage error');
      });
      
      const result = setItem('test-key', 'test-value');
      expect(result).toBe(false);
    });
  });

  describe('removeItem', () => {
    it('should remove item successfully', () => {
      localStorageMock.setItem('test-key', 'test-value');
      const result = removeItem('test-key');
      
      expect(result).toBe(true);
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('test-key');
    });

    it('should return false when localStorage throws an error', () => {
      localStorageMock.removeItem.mockImplementationOnce(() => {
        throw new Error('Storage error');
      });
      
      const result = removeItem('test-key');
      expect(result).toBe(false);
    });
  });

  describe('getJSON', () => {
    it('should parse and return JSON value', () => {
      const testData = { key: 'value', number: 42 };
      localStorageMock.setItem('test-json', JSON.stringify(testData));
      
      const result = getJSON('test-json');
      expect(result).toEqual(testData);
    });

    it('should return default value for non-existent key', () => {
      const defaultValue = { default: true };
      const result = getJSON('non-existent', defaultValue);
      expect(result).toEqual(defaultValue);
    });

    it('should return default value for invalid JSON', () => {
      localStorageMock.setItem('invalid-json', 'invalid json string');
      const defaultValue = { default: true };
      
      const result = getJSON('invalid-json', defaultValue);
      expect(result).toEqual(defaultValue);
    });

    it('should return null as default when no default provided', () => {
      const result = getJSON('non-existent');
      expect(result).toBe(null);
    });
  });

  describe('setJSON', () => {
    it('should stringify and store JSON value', () => {
      const testData = { key: 'value', number: 42 };
      const result = setJSON('test-json', testData);
      
      expect(result).toBe(true);
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'test-json', 
        JSON.stringify(testData)
      );
    });

    it('should return false for unstringifiable values', () => {
      const circularRef = {};
      circularRef.self = circularRef;
      
      const result = setJSON('circular', circularRef);
      expect(result).toBe(false);
    });
  });

  describe('clearAppData', () => {
    it('should clear all app-related data', () => {
      // Set up test data
      localStorageMock.setItem(STORAGE_KEYS.PARAMETERS, '{}');
      localStorageMock.setItem(STORAGE_KEYS.CONFIG_LIST, '["config1", "config2"]');
      localStorageMock.setItem(`${STORAGE_KEYS.CONFIG_PREFIX}config1`, '{}');
      localStorageMock.setItem(`${STORAGE_KEYS.CONFIG_PREFIX}config2`, '{}');
      localStorageMock.setItem('other-app-data', 'should remain');
      
      const result = clearAppData();
      
      expect(result).toBe(true);
      expect(localStorageMock.removeItem).toHaveBeenCalledWith(STORAGE_KEYS.PARAMETERS);
      expect(localStorageMock.removeItem).toHaveBeenCalledWith(STORAGE_KEYS.CONFIG_LIST);
      expect(localStorageMock.removeItem).toHaveBeenCalledWith(`${STORAGE_KEYS.CONFIG_PREFIX}config1`);
      expect(localStorageMock.removeItem).toHaveBeenCalledWith(`${STORAGE_KEYS.CONFIG_PREFIX}config2`);
    });

    it('should handle empty config list gracefully', () => {
      localStorageMock.setItem(STORAGE_KEYS.CONFIG_LIST, '[]');
      
      const result = clearAppData();
      expect(result).toBe(true);
    });
  });

  describe('getStorageInfo', () => {
    it('should return storage usage information', () => {
      // Add some test data
      setItem('artapp-test1', 'test data 1');
      setItem('artapp-test2', 'test data 2');
      setItem('other-app', 'should not count');
      
      const info = getStorageInfo();
      
      expect(info.available).toBe(true);
      expect(info.used).toBeGreaterThan(0);
      expect(info.total).toBeGreaterThan(0);
      expect(info.percentage).toBeGreaterThanOrEqual(0);
      expect(info.percentage).toBeLessThanOrEqual(100);
    });

    it('should return unavailable info when storage is not available', () => {
      // Mock storage as unavailable
      localStorageMock.setItem.mockImplementationOnce(() => {
        throw new Error('Storage not available');
      });
      
      const info = getStorageInfo();
      
      expect(info.available).toBe(false);
      expect(info.used).toBe(0);
      expect(info.total).toBe(0);
      expect(info.percentage).toBe(0);
    });
  });

  describe('STORAGE_KEYS', () => {
    it('should have all required storage keys', () => {
      expect(STORAGE_KEYS.PARAMETERS).toBe('artapp-parameters');
      expect(STORAGE_KEYS.CONFIG_LIST).toBe('artapp-config-list');
      expect(STORAGE_KEYS.CONFIG_PREFIX).toBe('artapp-config-');
    });
  });
});