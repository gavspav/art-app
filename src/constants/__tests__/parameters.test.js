/**
 * Tests for parameter constants
 */

import { describe, it, expect } from 'vitest';
import { PARAMETERS } from '../parameters.js';

describe('PARAMETERS constant', () => {
  it('should be an array', () => {
    expect(Array.isArray(PARAMETERS)).toBe(true);
    expect(PARAMETERS.length).toBeGreaterThan(0);
  });

  it('should have all required parameter properties', () => {
    PARAMETERS.forEach((param, index) => {
      expect(param).toHaveProperty('id', expect.any(String));
      expect(param).toHaveProperty('label', expect.any(String));
      expect(param).toHaveProperty('type', expect.any(String));
      expect(param).toHaveProperty('defaultValue');
      expect(param).toHaveProperty('isRandomizable', expect.any(Boolean));
      expect(param).toHaveProperty('showInOverlay', expect.any(Boolean));
      expect(param).toHaveProperty('group', expect.any(String));
      
      // Type-specific validations
      if (param.type === 'slider' || param.type === 'number') {
        expect(param).toHaveProperty('min', expect.any(Number));
        expect(param).toHaveProperty('max', expect.any(Number));
        expect(param).toHaveProperty('step', expect.any(Number));
      }
      
      if (param.type === 'dropdown') {
        expect(param).toHaveProperty('options', expect.any(Array));
        expect(param.options.length).toBeGreaterThan(0);
      }
    });
  });

  it('should have unique parameter IDs', () => {
    const ids = PARAMETERS.map(param => param.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('should have valid parameter types', () => {
    const validTypes = ['slider', 'dropdown', 'color', 'number'];
    PARAMETERS.forEach(param => {
      expect(validTypes).toContain(param.type);
    });
  });

  it('should have consistent group names', () => {
    const groups = [...new Set(PARAMETERS.map(param => param.group))];
    expect(groups.length).toBeGreaterThan(0);
    
    // All groups should be non-empty strings
    groups.forEach(group => {
      expect(typeof group).toBe('string');
      expect(group.length).toBeGreaterThan(0);
    });
  });

  it('should have valid default values for each parameter type', () => {
    PARAMETERS.forEach(param => {
      switch (param.type) {
        case 'slider':
        case 'number':
          expect(typeof param.defaultValue).toBe('number');
          expect(param.defaultValue).toBeGreaterThanOrEqual(param.min);
          expect(param.defaultValue).toBeLessThanOrEqual(param.max);
          break;
        case 'dropdown':
          expect(param.options).toContain(param.defaultValue);
          break;
        case 'color':
          expect(typeof param.defaultValue).toBe('string');
          expect(param.defaultValue).toMatch(/^#[0-9a-f]{6}$/i);
          break;
      }
    });
  });

  it('should have transform functions for parameters that need them', () => {
    const parametersWithTransforms = PARAMETERS.filter(param => param.transform);
    
    parametersWithTransforms.forEach(param => {
      expect(param.transform).toHaveProperty('toSlider', expect.any(Function));
      expect(param.transform).toHaveProperty('fromSlider', expect.any(Function));
    });
  });
});