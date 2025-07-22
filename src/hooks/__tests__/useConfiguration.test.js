/**
 * Tests for useConfiguration hook
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useConfiguration } from '../useConfiguration.js';
import * as configService from '../../services/configurationService.js';

// Mock the configuration service
vi.mock('../../services/configurationService.js', () => ({
  saveConfiguration: vi.fn(),
  loadConfiguration: vi.fn(),
  deleteConfiguration: vi.fn(),
  getSavedConfigList: vi.fn(),
  configurationExists: vi.fn(),
  getConfigurationMetadata: vi.fn(),
  exportConfiguration: vi.fn(),
  importConfiguration: vi.fn()
}));

describe('useConfiguration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default mock implementations
    configService.getSavedConfigList.mockReturnValue(['config1', 'config2']);
    configService.getConfigurationMetadata.mockImplementation((name) => ({
      name,
      savedAt: '2023-01-01T00:00:00.000Z',
      version: '1.0',
      hasParameters: true,
      hasAppState: true
    }));
  });

  describe('initialization', () => {
    it('should load saved configurations on mount', async () => {
      const { result } = renderHook(() => useConfiguration());
      
      await waitFor(() => {
        expect(result.current.savedConfigs).toHaveLength(2);
      });
      
      expect(configService.getSavedConfigList).toHaveBeenCalled();
      expect(configService.getConfigurationMetadata).toHaveBeenCalledWith('config1');
      expect(configService.getConfigurationMetadata).toHaveBeenCalledWith('config2');
    });

    it('should provide config names', async () => {
      const { result } = renderHook(() => useConfiguration());
      
      await waitFor(() => {
        expect(result.current.configNames).toEqual(['config1', 'config2']);
      });
    });

    it('should handle empty config list', async () => {
      configService.getSavedConfigList.mockReturnValue([]);
      
      const { result } = renderHook(() => useConfiguration());
      
      await waitFor(() => {
        expect(result.current.savedConfigs).toHaveLength(0);
      });
    });
  });

  describe('save operation', () => {
    it('should save configuration successfully', async () => {
      configService.saveConfiguration.mockReturnValue({
        success: true,
        message: 'Configuration saved successfully!'
      });
      
      const { result } = renderHook(() => useConfiguration());
      let saveResult;
      
      await act(async () => {
        saveResult = await result.current.save('test-config', [], {});
      });
      
      expect(saveResult.success).toBe(true);
      expect(result.current.message).toBe('Configuration saved successfully!');
      expect(configService.saveConfiguration).toHaveBeenCalledWith('test-config', [], {});
    });

    it('should handle save failure', async () => {
      configService.saveConfiguration.mockReturnValue({
        success: false,
        message: 'Save failed'
      });
      
      const { result } = renderHook(() => useConfiguration());
      let saveResult;
      
      await act(async () => {
        saveResult = await result.current.save('test-config', [], {});
      });
      
      expect(saveResult.success).toBe(false);
      expect(result.current.message).toBe('Save failed');
    });

    it('should validate filename', async () => {
      const { result } = renderHook(() => useConfiguration());
      let saveResult;
      
      await act(async () => {
        saveResult = await result.current.save('', [], {});
      });
      
      expect(saveResult.success).toBe(false);
      expect(result.current.message).toBe('Configuration name is required');
      expect(configService.saveConfiguration).not.toHaveBeenCalled();
    });

    it('should trim filename', async () => {
      configService.saveConfiguration.mockReturnValue({
        success: true,
        message: 'Configuration saved successfully!'
      });
      
      const { result } = renderHook(() => useConfiguration());
      
      await act(async () => {
        await result.current.save('  test-config  ', [], {});
      });
      
      expect(configService.saveConfiguration).toHaveBeenCalledWith('test-config', [], {});
    });

    it('should set loading state during save', async () => {
      configService.saveConfiguration.mockImplementation(() => {
        return Promise.resolve({ success: true, message: 'Saved' });
      });
      
      const { result } = renderHook(() => useConfiguration());
      
      let savePromise;
      act(() => {
        savePromise = result.current.save('test-config', [], {});
      });
      
      expect(result.current.isLoading).toBe(true);
      
      await act(async () => {
        await savePromise;
      });
      
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('load operation', () => {
    it('should load configuration successfully', async () => {
      const mockData = {
        parameters: [],
        appState: { speed: 0.5 },
        savedAt: '2023-01-01T00:00:00.000Z',
        version: '1.0'
      };
      
      configService.loadConfiguration.mockReturnValue({
        success: true,
        message: 'Configuration loaded successfully!',
        data: mockData
      });
      
      const { result } = renderHook(() => useConfiguration());
      let loadResult;
      
      await act(async () => {
        loadResult = await result.current.load('test-config');
      });
      
      expect(loadResult.success).toBe(true);
      expect(loadResult.data).toEqual(mockData);
      expect(result.current.message).toBe('Configuration loaded successfully!');
    });

    it('should handle load failure', async () => {
      configService.loadConfiguration.mockReturnValue({
        success: false,
        message: 'Configuration not found'
      });
      
      const { result } = renderHook(() => useConfiguration());
      let loadResult;
      
      await act(async () => {
        loadResult = await result.current.load('nonexistent');
      });
      
      expect(loadResult.success).toBe(false);
      expect(result.current.message).toBe('Configuration not found');
    });

    it('should validate filename for load', async () => {
      const { result } = renderHook(() => useConfiguration());
      let loadResult;
      
      await act(async () => {
        loadResult = await result.current.load('');
      });
      
      expect(loadResult.success).toBe(false);
      expect(result.current.message).toBe('Configuration name is required');
    });
  });

  describe('delete operation', () => {
    it('should delete configuration successfully', async () => {
      configService.deleteConfiguration.mockReturnValue({
        success: true,
        message: 'Configuration deleted successfully!'
      });
      
      const { result } = renderHook(() => useConfiguration());
      let deleteResult;
      
      await act(async () => {
        deleteResult = await result.current.delete('test-config');
      });
      
      expect(deleteResult.success).toBe(true);
      expect(result.current.message).toBe('Configuration deleted successfully!');
      expect(configService.deleteConfiguration).toHaveBeenCalledWith('test-config');
    });

    it('should handle delete failure', async () => {
      configService.deleteConfiguration.mockReturnValue({
        success: false,
        message: 'Configuration not found'
      });
      
      const { result } = renderHook(() => useConfiguration());
      let deleteResult;
      
      await act(async () => {
        deleteResult = await result.current.delete('nonexistent');
      });
      
      expect(deleteResult.success).toBe(false);
      expect(result.current.message).toBe('Configuration not found');
    });
  });

  describe('utility functions', () => {
    it('should check if configuration exists', () => {
      configService.configurationExists.mockReturnValue(true);
      
      const { result } = renderHook(() => useConfiguration());
      
      const exists = result.current.exists('test-config');
      expect(exists).toBe(true);
      expect(configService.configurationExists).toHaveBeenCalledWith('test-config');
    });

    it('should get configuration metadata', () => {
      const mockMetadata = {
        name: 'test-config',
        savedAt: '2023-01-01T00:00:00.000Z',
        version: '1.0'
      };
      
      configService.getConfigurationMetadata.mockReturnValue(mockMetadata);
      
      const { result } = renderHook(() => useConfiguration());
      
      const metadata = result.current.getMetadata('test-config');
      expect(metadata).toEqual(mockMetadata);
    });

    it('should refresh config list', async () => {
      const { result } = renderHook(() => useConfiguration());
      
      // Wait for initial load
      await waitFor(() => {
        expect(result.current.configNames).toEqual(['config1', 'config2']);
      });
      
      configService.getSavedConfigList.mockReturnValue(['new-config']);
      configService.getConfigurationMetadata.mockImplementation((name) => ({
        name,
        savedAt: '2023-01-01T00:00:00.000Z',
        version: '1.0',
        hasParameters: true,
        hasAppState: true
      }));
      
      await act(async () => {
        await result.current.refreshConfigList();
      });
      
      expect(result.current.configNames).toEqual(['new-config']);
    });
  });

  describe('import/export operations', () => {
    it('should export configuration successfully', async () => {
      const mockExportData = '{"parameters":[],"appState":{}}';
      
      configService.exportConfiguration.mockReturnValue({
        success: true,
        message: 'Configuration exported successfully',
        data: mockExportData
      });
      
      const { result } = renderHook(() => useConfiguration());
      let exportResult;
      
      await act(async () => {
        exportResult = await result.current.export('test-config');
      });
      
      expect(exportResult.success).toBe(true);
      expect(exportResult.data).toBe(mockExportData);
    });

    it('should import configuration successfully', async () => {
      configService.importConfiguration.mockReturnValue({
        success: true,
        message: 'Configuration imported successfully!'
      });
      
      const { result } = renderHook(() => useConfiguration());
      let importResult;
      
      const jsonData = '{"parameters":[],"appState":{}}';
      
      await act(async () => {
        importResult = await result.current.import('imported-config', jsonData);
      });
      
      expect(importResult.success).toBe(true);
      expect(configService.importConfiguration).toHaveBeenCalledWith('imported-config', jsonData);
    });

    it('should validate import data', async () => {
      const { result } = renderHook(() => useConfiguration());
      let importResult;
      
      await act(async () => {
        importResult = await result.current.import('test-config', '');
      });
      
      expect(importResult.success).toBe(false);
      expect(result.current.message).toBe('Configuration data is required');
    });
  });

  describe('message handling', () => {
    it('should clear message after timeout', async () => {
      vi.useFakeTimers();
      
      configService.saveConfiguration.mockReturnValue({
        success: true,
        message: 'Configuration saved successfully!'
      });
      
      const { result } = renderHook(() => useConfiguration());
      
      await act(async () => {
        await result.current.save('test-config', [], {});
      });
      
      expect(result.current.message).toBe('Configuration saved successfully!');
      
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      
      expect(result.current.message).toBe('');
      
      vi.useRealTimers();
    });

    it('should clear message manually', async () => {
      configService.saveConfiguration.mockReturnValue({
        success: true,
        message: 'Configuration saved successfully!'
      });
      
      const { result } = renderHook(() => useConfiguration());
      
      await act(async () => {
        await result.current.save('test-config', [], {});
      });
      
      expect(result.current.message).toBe('Configuration saved successfully!');
      
      act(() => {
        result.current.clearMessage();
      });
      
      expect(result.current.message).toBe('');
    });
  });

  describe('loading state', () => {
    it('should track loading state correctly', async () => {
      vi.useFakeTimers();
      
      configService.saveConfiguration.mockImplementation(() => {
        return new Promise(resolve => {
          setTimeout(() => resolve({ success: true, message: 'Saved' }), 100);
        });
      });
      
      const { result } = renderHook(() => useConfiguration());
      
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isBusy).toBe(false);
      
      let savePromise;
      act(() => {
        savePromise = result.current.save('test-config', [], {});
      });
      
      expect(result.current.isLoading).toBe(true);
      expect(result.current.isBusy).toBe(true);
      
      await act(async () => {
        vi.advanceTimersByTime(100);
        await savePromise;
      });
      
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isBusy).toBe(false);
      
      vi.useRealTimers();
    });

    it('should track last operation', async () => {
      configService.saveConfiguration.mockReturnValue({
        success: true,
        message: 'Saved'
      });
      
      const { result } = renderHook(() => useConfiguration());
      
      await act(async () => {
        await result.current.save('test-config', [], {});
      });
      
      expect(result.current.lastOperation).toEqual({
        type: 'save',
        filename: 'test-config'
      });
    });
  });
});