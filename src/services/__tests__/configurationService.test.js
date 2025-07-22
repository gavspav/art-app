/**
 * Unit tests for configurationService
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getSavedConfigList,
  saveConfiguration,
  loadConfiguration,
  deleteConfiguration,
  configurationExists,
  getConfigurationMetadata,
  exportConfiguration,
  importConfiguration
} from '../configurationService.js';

// Mock the storage service
vi.mock('../storageService.js', () => {
  const mockStorage = {};
  
  return {
    getJSON: vi.fn((key, defaultValue = null) => {
      return mockStorage[key] !== undefined ? mockStorage[key] : defaultValue;
    }),
    setJSON: vi.fn((key, value) => {
      mockStorage[key] = value;
      return true;
    }),
    removeItem: vi.fn((key) => {
      delete mockStorage[key];
      return true;
    }),
    STORAGE_KEYS: {
      PARAMETERS: 'artapp-parameters',
      CONFIG_LIST: 'artapp-config-list',
      CONFIG_PREFIX: 'artapp-config-'
    },
    __mockStorage: mockStorage,
    __clearMockStorage: () => {
      Object.keys(mockStorage).forEach(key => delete mockStorage[key]);
    }
  };
});

import * as storageService from '../storageService.js';

describe('configurationService', () => {
  beforeEach(() => {
    storageService.__clearMockStorage();
    vi.clearAllMocks();
  });

  describe('getSavedConfigList', () => {
    it('should return empty array when no configs exist', () => {
      const result = getSavedConfigList();
      expect(result).toEqual([]);
    });

    it('should return saved config list', () => {
      const configList = ['config1', 'config2'];
      storageService.__mockStorage['artapp-config-list'] = configList;
      
      const result = getSavedConfigList();
      expect(result).toEqual(configList);
    });
  });

  describe('saveConfiguration', () => {
    const mockParameters = [{ id: 'speed', defaultValue: 0.002 }];
    const mockAppState = { speed: 0.005, numLayers: 3 };

    it('should save configuration successfully', () => {
      const result = saveConfiguration('test-config', mockParameters, mockAppState);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('saved successfully');
      expect(storageService.setJSON).toHaveBeenCalledWith(
        'artapp-config-test-config',
        expect.objectContaining({
          parameters: mockParameters,
          appState: mockAppState,
          version: '1.0'
        })
      );
    });

    it('should update config list when saving new configuration', () => {
      storageService.__mockStorage['artapp-config-list'] = ['existing-config'];
      
      saveConfiguration('new-config', mockParameters, mockAppState);
      
      expect(storageService.setJSON).toHaveBeenCalledWith(
        'artapp-config-list',
        ['existing-config', 'new-config']
      );
    });

    it('should not duplicate config names in list', () => {
      storageService.__mockStorage['artapp-config-list'] = ['existing-config'];
      
      saveConfiguration('existing-config', mockParameters, mockAppState);
      
      // Should save the config but not add duplicate to list
      expect(storageService.setJSON).toHaveBeenCalledWith(
        'artapp-config-existing-config',
        expect.objectContaining({
          parameters: mockParameters,
          appState: mockAppState,
          version: '1.0'
        })
      );
      // The list should not be updated since the config already exists
      expect(storageService.setJSON).not.toHaveBeenCalledWith(
        'artapp-config-list',
        expect.any(Array)
      );
    });

    it('should handle invalid filename', () => {
      const result = saveConfiguration('', mockParameters, mockAppState);
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid filename provided');
    });

    it('should handle null filename', () => {
      const result = saveConfiguration(null, mockParameters, mockAppState);
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid filename');
    });

    it('should trim whitespace from filename', () => {
      saveConfiguration('  test-config  ', mockParameters, mockAppState);
      
      expect(storageService.setJSON).toHaveBeenCalledWith(
        'artapp-config-test-config',
        expect.any(Object)
      );
    });

    it('should handle storage failure', () => {
      storageService.setJSON.mockReturnValueOnce(false);
      
      const result = saveConfiguration('test-config', mockParameters, mockAppState);
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed to save');
    });
  });

  describe('loadConfiguration', () => {
    const mockConfigData = {
      parameters: [{ id: 'speed', defaultValue: 0.002 }],
      appState: { speed: 0.005, numLayers: 3 },
      savedAt: '2023-01-01T00:00:00.000Z',
      version: '1.0'
    };

    it('should load configuration successfully', () => {
      storageService.__mockStorage['artapp-config-test-config'] = mockConfigData;
      
      const result = loadConfiguration('test-config');
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('loaded successfully');
      expect(result.data).toEqual(mockConfigData);
    });

    it('should handle non-existent configuration', () => {
      const result = loadConfiguration('non-existent');
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });

    it('should handle invalid filename', () => {
      const result = loadConfiguration('');
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid filename provided');
    });

    it('should handle configuration without version', () => {
      const configWithoutVersion = { ...mockConfigData };
      delete configWithoutVersion.version;
      storageService.__mockStorage['artapp-config-test-config'] = configWithoutVersion;
      
      const result = loadConfiguration('test-config');
      
      expect(result.success).toBe(true);
      expect(result.data.version).toBeUndefined();
    });

    it('should provide default values for missing data', () => {
      storageService.__mockStorage['artapp-config-test-config'] = {};
      
      const result = loadConfiguration('test-config');
      
      expect(result.success).toBe(true);
      expect(result.data.parameters).toEqual([]);
      expect(result.data.appState).toEqual({});
    });
  });

  describe('deleteConfiguration', () => {
    beforeEach(() => {
      storageService.__mockStorage['artapp-config-list'] = ['config1', 'config2'];
      storageService.__mockStorage['artapp-config-config1'] = { test: 'data' };
    });

    it('should delete configuration successfully', () => {
      const result = deleteConfiguration('config1');
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('deleted successfully');
      expect(storageService.removeItem).toHaveBeenCalledWith('artapp-config-config1');
    });

    it('should update config list after deletion', () => {
      deleteConfiguration('config1');
      
      expect(storageService.setJSON).toHaveBeenCalledWith(
        'artapp-config-list',
        ['config2']
      );
    });

    it('should handle non-existent configuration', () => {
      const result = deleteConfiguration('non-existent');
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });

    it('should handle invalid filename', () => {
      const result = deleteConfiguration('');
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid filename provided');
    });
  });

  describe('configurationExists', () => {
    it('should return true for existing configuration', () => {
      storageService.__mockStorage['artapp-config-test-config'] = { test: 'data' };
      
      const result = configurationExists('test-config');
      expect(result).toBe(true);
    });

    it('should return false for non-existent configuration', () => {
      const result = configurationExists('non-existent');
      expect(result).toBe(false);
    });

    it('should handle invalid filename', () => {
      const result = configurationExists('');
      expect(result).toBe(false);
    });
  });

  describe('getConfigurationMetadata', () => {
    const mockConfigData = {
      parameters: [{ id: 'speed' }],
      appState: { speed: 0.005 },
      savedAt: '2023-01-01T00:00:00.000Z',
      version: '1.0'
    };

    it('should return metadata for existing configuration', () => {
      storageService.__mockStorage['artapp-config-test-config'] = mockConfigData;
      
      const result = getConfigurationMetadata('test-config');
      
      expect(result).toEqual({
        name: 'test-config',
        savedAt: '2023-01-01T00:00:00.000Z',
        version: '1.0',
        hasParameters: true,
        hasAppState: true
      });
    });

    it('should return null for non-existent configuration', () => {
      const result = getConfigurationMetadata('non-existent');
      expect(result).toBe(null);
    });

    it('should handle configuration with empty data', () => {
      storageService.__mockStorage['artapp-config-empty'] = {
        parameters: [],
        appState: {},
        savedAt: '2023-01-01T00:00:00.000Z'
      };
      
      const result = getConfigurationMetadata('empty');
      
      expect(result.hasParameters).toBe(false);
      expect(result.hasAppState).toBe(false);
    });
  });

  describe('exportConfiguration', () => {
    const mockConfigData = {
      parameters: [{ id: 'speed' }],
      appState: { speed: 0.005 },
      savedAt: '2023-01-01T00:00:00.000Z',
      version: '1.0'
    };

    it('should export configuration as JSON string', () => {
      storageService.__mockStorage['artapp-config-test-config'] = mockConfigData;
      
      const result = exportConfiguration('test-config');
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('exported successfully');
      expect(typeof result.data).toBe('string');
      
      const exportedData = JSON.parse(result.data);
      expect(exportedData.parameters).toEqual(mockConfigData.parameters);
      expect(exportedData.appState).toEqual(mockConfigData.appState);
      expect(exportedData.exportedAt).toBeDefined();
      expect(exportedData.exportedFrom).toBe('Art App');
    });

    it('should handle non-existent configuration', () => {
      const result = exportConfiguration('non-existent');
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });
  });

  describe('importConfiguration', () => {
    const validConfigData = {
      parameters: [{ id: 'speed' }],
      appState: { speed: 0.005 }
    };

    it('should import configuration from JSON string', () => {
      const jsonData = JSON.stringify(validConfigData);
      
      const result = importConfiguration('imported-config', jsonData);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('saved successfully');
    });

    it('should handle invalid JSON', () => {
      const result = importConfiguration('test-config', 'invalid json');
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid JSON format');
    });

    it('should handle invalid configuration format', () => {
      const invalidData = { someOtherData: 'test' };
      const jsonData = JSON.stringify(invalidData);
      
      const result = importConfiguration('test-config', jsonData);
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid configuration format');
    });

    it('should handle invalid filename', () => {
      const jsonData = JSON.stringify(validConfigData);
      
      const result = importConfiguration('', jsonData);
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid filename');
    });

    it('should handle invalid JSON data parameter', () => {
      const result = importConfiguration('test-config', null);
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid JSON data');
    });
  });
});