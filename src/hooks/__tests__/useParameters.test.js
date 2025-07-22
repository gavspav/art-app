/**
 * Tests for useParameters hook
 */

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useParameters } from '../useParameters.js';
import { PARAMETERS } from '../../constants/parameters.js';
import { defaults } from '../../constants/defaults.js';

// Mock the constants
vi.mock('../../constants/parameters.js', () => ({
  PARAMETERS: [
    {
      id: 'speed',
      label: 'Speed',
      type: 'slider',
      min: 0,
      max: 1,
      step: 0.01,
      defaultValue: 0.002,
      isRandomizable: true,
      showInOverlay: true,
      group: 'Animation'
    },
    {
      id: 'numSides',
      label: 'Sides',
      type: 'slider',
      min: 3,
      max: 20,
      step: 1,
      defaultValue: 6,
      isRandomizable: true,
      showInOverlay: true,
      group: 'Shape'
    },
    {
      id: 'blendMode',
      label: 'Blend Mode',
      type: 'dropdown',
      options: ['source-over', 'multiply', 'screen'],
      defaultValue: 'source-over',
      isRandomizable: true,
      showInOverlay: true,
      group: 'Appearance'
    },
    {
      id: 'backgroundColor',
      label: 'Background',
      type: 'color',
      defaultValue: '#000000',
      isRandomizable: true,
      showInOverlay: true,
      group: 'Appearance'
    }
  ]
}));

vi.mock('../../constants/defaults.js', () => ({
  defaults: {
    speed: 0.002,
    numSides: 6,
    blendMode: 'source-over',
    backgroundColor: '#000000'
  }
}));

describe('useParameters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with default values', () => {
      const { result } = renderHook(() => useParameters());
      
      expect(result.current.values.speed).toBe(0.002);
      expect(result.current.values.numSides).toBe(6);
      expect(result.current.values.blendMode).toBe('source-over');
      expect(result.current.values.backgroundColor).toBe('#000000');
    });

    it('should initialize with provided initial values', () => {
      const initialValues = {
        speed: 0.5,
        numSides: 8
      };
      
      const { result } = renderHook(() => useParameters(initialValues));
      
      expect(result.current.values.speed).toBe(0.5);
      expect(result.current.values.numSides).toBe(8);
      expect(result.current.values.blendMode).toBe('source-over'); // default
    });

    it('should provide parameter definitions', () => {
      const { result } = renderHook(() => useParameters());
      
      expect(result.current.parameters).toEqual(PARAMETERS);
    });

    it('should group parameters by category', () => {
      const { result } = renderHook(() => useParameters());
      
      expect(result.current.parametersByGroup.Animation).toHaveLength(1);
      expect(result.current.parametersByGroup.Shape).toHaveLength(1);
      expect(result.current.parametersByGroup.Appearance).toHaveLength(2);
    });

    it('should filter overlay parameters', () => {
      const { result } = renderHook(() => useParameters());
      
      expect(result.current.overlayParameters).toHaveLength(4);
      expect(result.current.overlayParameters.every(p => p.showInOverlay)).toBe(true);
    });
  });

  describe('parameter updates', () => {
    it('should update single parameter', () => {
      const { result } = renderHook(() => useParameters());
      
      act(() => {
        result.current.updateParameter('speed', 0.8);
      });
      
      expect(result.current.values.speed).toBe(0.8);
    });

    it('should update multiple parameters', () => {
      const { result } = renderHook(() => useParameters());
      
      act(() => {
        result.current.updateParameters({
          speed: 0.7,
          numSides: 10
        });
      });
      
      expect(result.current.values.speed).toBe(0.7);
      expect(result.current.values.numSides).toBe(10);
    });

    it('should ignore invalid parameter IDs', () => {
      const { result } = renderHook(() => useParameters());
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      act(() => {
        result.current.updateParameter('invalidParam', 123);
      });
      
      expect(consoleSpy).toHaveBeenCalledWith('Parameter invalidParam not found');
      consoleSpy.mockRestore();
    });
  });

  describe('validation', () => {
    it('should validate slider values within range', () => {
      const { result } = renderHook(() => useParameters());
      
      act(() => {
        result.current.updateParameter('numSides', 25); // max is 20
      });
      
      expect(result.current.values.numSides).toBe(20);
      
      act(() => {
        result.current.updateParameter('numSides', 1); // min is 3
      });
      
      expect(result.current.values.numSides).toBe(3);
    });

    it('should validate dropdown values', () => {
      const { result } = renderHook(() => useParameters());
      
      act(() => {
        result.current.updateParameter('blendMode', 'invalid-mode');
      });
      
      expect(result.current.values.blendMode).toBe('source-over'); // default
      
      act(() => {
        result.current.updateParameter('blendMode', 'multiply');
      });
      
      expect(result.current.values.blendMode).toBe('multiply');
    });

    it('should validate color values', () => {
      const { result } = renderHook(() => useParameters());
      
      act(() => {
        result.current.updateParameter('backgroundColor', 'invalid-color');
      });
      
      expect(result.current.values.backgroundColor).toBe('#000000'); // default
      
      act(() => {
        result.current.updateParameter('backgroundColor', '#ff0000');
      });
      
      expect(result.current.values.backgroundColor).toBe('#ff0000');
    });

    it('should handle null/undefined values', () => {
      const { result } = renderHook(() => useParameters());
      
      act(() => {
        result.current.updateParameter('speed', null);
      });
      
      expect(result.current.values.speed).toBe(0.002); // default
    });
  });

  describe('randomization', () => {
    it('should randomize all randomizable parameters', () => {
      const { result } = renderHook(() => useParameters());
      const originalValues = { ...result.current.values };
      
      act(() => {
        result.current.randomizeAll();
      });
      
      // Values should be different (with high probability)
      const hasChanged = Object.keys(originalValues).some(key => {
        const param = PARAMETERS.find(p => p.id === key);
        return param?.isRandomizable && result.current.values[key] !== originalValues[key];
      });
      
      expect(hasChanged).toBe(true);
    });

    it('should randomize specific parameters', () => {
      const { result } = renderHook(() => useParameters());
      const originalSpeed = result.current.values.speed;
      
      act(() => {
        result.current.randomizeParameters(['speed']);
      });
      
      // Speed should likely be different, but numSides should remain the same
      expect(result.current.values.numSides).toBe(6); // unchanged
    });

    it('should generate valid random values for sliders', () => {
      const { result } = renderHook(() => useParameters());
      const speedParam = PARAMETERS.find(p => p.id === 'speed');
      
      for (let i = 0; i < 10; i++) {
        const randomValue = result.current.generateRandomValue(speedParam);
        expect(randomValue).toBeGreaterThanOrEqual(speedParam.min);
        expect(randomValue).toBeLessThanOrEqual(speedParam.max);
      }
    });

    it('should generate valid random values for dropdowns', () => {
      const { result } = renderHook(() => useParameters());
      const blendModeParam = PARAMETERS.find(p => p.id === 'blendMode');
      
      for (let i = 0; i < 10; i++) {
        const randomValue = result.current.generateRandomValue(blendModeParam);
        expect(blendModeParam.options).toContain(randomValue);
      }
    });

    it('should generate valid random colors', () => {
      const { result } = renderHook(() => useParameters());
      const colorParam = PARAMETERS.find(p => p.id === 'backgroundColor');
      
      for (let i = 0; i < 10; i++) {
        const randomValue = result.current.generateRandomValue(colorParam);
        expect(randomValue).toMatch(/^#[0-9a-f]{6}$/i);
      }
    });
  });

  describe('reset operations', () => {
    it('should reset all parameters to defaults', () => {
      const { result } = renderHook(() => useParameters());
      
      // Change some values
      act(() => {
        result.current.updateParameters({
          speed: 0.8,
          numSides: 15
        });
      });
      
      // Reset to defaults
      act(() => {
        result.current.resetToDefaults();
      });
      
      expect(result.current.values.speed).toBe(0.002);
      expect(result.current.values.numSides).toBe(6);
    });

    it('should reset specific parameters', () => {
      const { result } = renderHook(() => useParameters());
      
      // Change some values
      act(() => {
        result.current.updateParameters({
          speed: 0.8,
          numSides: 15
        });
      });
      
      // Reset only speed
      act(() => {
        result.current.resetParameters(['speed']);
      });
      
      expect(result.current.values.speed).toBe(0.002);
      expect(result.current.values.numSides).toBe(15); // unchanged
    });
  });

  describe('utility functions', () => {
    it('should get parameter by ID', () => {
      const { result } = renderHook(() => useParameters());
      
      const speedParam = result.current.getParameter('speed');
      expect(speedParam.id).toBe('speed');
      expect(speedParam.label).toBe('Speed');
      
      const invalidParam = result.current.getParameter('invalid');
      expect(invalidParam).toBeUndefined();
    });

    it('should get parameter values for specific IDs', () => {
      const { result } = renderHook(() => useParameters());
      
      const values = result.current.getParameterValues(['speed', 'numSides']);
      expect(values).toEqual({
        speed: 0.002,
        numSides: 6
      });
    });

    it('should validate parameter values', () => {
      const { result } = renderHook(() => useParameters());
      const speedParam = PARAMETERS.find(p => p.id === 'speed');
      
      expect(result.current.validateValue(speedParam, 0.5)).toBe(0.5);
      expect(result.current.validateValue(speedParam, 2)).toBe(1); // clamped to max
      expect(result.current.validateValue(speedParam, -1)).toBe(0); // clamped to min
      expect(result.current.validateValue(speedParam, 'invalid')).toBe(0.002); // default
    });
  });
});