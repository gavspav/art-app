/**
 * Parameter Validation Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  validateParameter,
  validateParameters,
  validateParameterTransform,
  sanitizeParameters,
  getDefaultParameterValues,
  isParameterRandomizable,
  getValidationSummary,
  getParameterDefinition,
  createValidationError,
  VALIDATION_ERRORS
} from '../parameterValidation.js';

describe('Parameter Validation', () => {
  describe('getParameterDefinition', () => {
    it('should return parameter definition for valid ID', () => {
      const param = getParameterDefinition('speed');
      expect(param).toBeDefined();
      expect(param.id).toBe('speed');
      expect(param.type).toBe('slider');
    });

    it('should return null for invalid ID', () => {
      const param = getParameterDefinition('nonexistent');
      expect(param).toBeNull();
    });
  });

  describe('createValidationError', () => {
    it('should create validation error object', () => {
      const error = createValidationError(
        VALIDATION_ERRORS.OUT_OF_RANGE,
        'Value out of range',
        'speed',
        2.5,
        1.0
      );

      expect(error).toMatchObject({
        type: VALIDATION_ERRORS.OUT_OF_RANGE,
        message: 'Value out of range',
        parameterId: 'speed',
        value: 2.5,
        correctedValue: 1.0
      });
      expect(error.timestamp).toBeDefined();
    });
  });

  describe('validateParameter', () => {
    describe('numeric parameters', () => {
      it('should validate valid numeric values', () => {
        const result = validateParameter('speed', 0.5);
        
        expect(result.isValid).toBe(true);
        expect(result.error).toBeNull();
        expect(result.correctedValue).toBe(0.5);
      });

      it('should handle string numbers', () => {
        const result = validateParameter('speed', '0.5');
        
        expect(result.isValid).toBe(true);
        expect(result.correctedValue).toBe(0.5);
      });

      it('should reject non-numeric values', () => {
        const result = validateParameter('speed', 'not-a-number');
        
        expect(result.isValid).toBe(false);
        expect(result.error.type).toBe(VALIDATION_ERRORS.INVALID_TYPE);
        expect(result.correctedValue).toBe(0.002); // default value
      });

      it('should handle values below minimum', () => {
        const result = validateParameter('speed', -1, { strict: true });
        
        expect(result.isValid).toBe(false);
        expect(result.error.type).toBe(VALIDATION_ERRORS.OUT_OF_RANGE);
        expect(result.correctedValue).toBe(0); // min value
      });

      it('should handle values above maximum', () => {
        const result = validateParameter('speed', 2, { strict: true });
        
        expect(result.isValid).toBe(false);
        expect(result.error.type).toBe(VALIDATION_ERRORS.OUT_OF_RANGE);
        expect(result.correctedValue).toBe(1); // max value
      });

      it('should validate step constraints', () => {
        const result = validateParameter('numSides', 3.5, { strict: true }); // step is 1
        
        expect(result.isValid).toBe(false);
        expect(result.error.type).toBe(VALIDATION_ERRORS.OUT_OF_RANGE);
        expect(result.correctedValue).toBe(4); // rounded to nearest step
      });

      it('should use strict mode', () => {
        const result = validateParameter('speed', -1, { strict: true });
        
        expect(result.isValid).toBe(false);
        expect(result.error).toBeDefined();
      });

      it('should disable auto-correction', () => {
        const result = validateParameter('speed', -1, { autoCorrect: false });
        
        expect(result.correctedValue).toBeNull();
      });
    });

    describe('dropdown parameters', () => {
      it('should validate valid dropdown values', () => {
        const result = validateParameter('blendMode', 'multiply');
        
        expect(result.isValid).toBe(true);
        expect(result.error).toBeNull();
        expect(result.correctedValue).toBe('multiply');
      });

      it('should reject invalid dropdown values', () => {
        const result = validateParameter('blendMode', 'invalid-mode', { strict: true });
        
        expect(result.isValid).toBe(false);
        expect(result.error.type).toBe(VALIDATION_ERRORS.INVALID_OPTION);
        expect(result.correctedValue).toBe('source-over'); // default value
      });
    });

    describe('color parameters', () => {
      it('should validate valid hex colors', () => {
        const result = validateParameter('backgroundColor', '#FF0000');
        
        expect(result.isValid).toBe(true);
        expect(result.correctedValue).toBe('#FF0000');
      });

      it('should validate short hex colors', () => {
        const result = validateParameter('backgroundColor', '#F00');
        
        expect(result.isValid).toBe(true);
        expect(result.correctedValue).toBe('#F00');
      });

      it('should reject invalid color formats', () => {
        const result = validateParameter('backgroundColor', 'red', { strict: true });
        
        expect(result.isValid).toBe(false);
        expect(result.error.type).toBe(VALIDATION_ERRORS.INVALID_FORMAT);
        expect(result.correctedValue).toBe('#000000'); // default value
      });

      it('should reject non-string color values', () => {
        const result = validateParameter('backgroundColor', 123);
        
        expect(result.isValid).toBe(false);
        expect(result.error.type).toBe(VALIDATION_ERRORS.INVALID_TYPE);
      });
    });

    describe('null/undefined values', () => {
      it('should handle null values with auto-correction', () => {
        const result = validateParameter('speed', null);
        
        expect(result.isValid).toBe(true);
        expect(result.correctedValue).toBe(0.002); // default value
      });

      it('should handle undefined values with auto-correction', () => {
        const result = validateParameter('speed', undefined);
        
        expect(result.isValid).toBe(true);
        expect(result.correctedValue).toBe(0.002); // default value
      });

      it('should reject null values in strict mode', () => {
        const result = validateParameter('speed', null, { strict: true });
        
        expect(result.isValid).toBe(false);
        expect(result.error.type).toBe(VALIDATION_ERRORS.MISSING_REQUIRED);
      });
    });

    it('should handle unknown parameter IDs', () => {
      const result = validateParameter('unknown-param', 123);
      
      expect(result.isValid).toBe(false);
      expect(result.error.type).toBe(VALIDATION_ERRORS.MISSING_REQUIRED);
    });
  });

  describe('validateParameterTransform', () => {
    it('should transform values using parameter transform functions', () => {
      const result = validateParameterTransform('speed', 0.5, 'toSlider');
      
      expect(result.isValid).toBe(true);
      // toSlider transform: Math.pow(value / 0.1, 1/4) = Math.pow(0.5 / 0.1, 1/4) = Math.pow(5, 0.25)
      const expected = Math.pow(0.5 / 0.1, 1/4);
      expect(result.transformedValue).toBeCloseTo(expected, 3);
    });

    it('should handle parameters without transforms', () => {
      const result = validateParameterTransform('numSides', 6, 'toSlider');
      
      expect(result.isValid).toBe(true);
      expect(result.transformedValue).toBe(6); // no transform, return original
    });

    it('should handle transform errors', () => {
      // Mock a parameter with a broken transform
      const result = validateParameterTransform('nonexistent', 0.5, 'toSlider');
      
      expect(result.isValid).toBe(false);
      expect(result.error.type).toBe(VALIDATION_ERRORS.MISSING_REQUIRED);
    });
  });

  describe('validateParameters', () => {
    it('should validate multiple parameters', () => {
      const params = {
        speed: 0.5,
        numSides: 6,
        backgroundColor: '#FF0000'
      };
      
      const result = validateParameters(params);
      
      expect(result.isValid).toBe(false); // Missing required parameters
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.correctedValues).toBeDefined();
    });

    it('should detect missing required parameters', () => {
      const params = { speed: 0.5 }; // Missing many required parameters
      
      const result = validateParameters(params);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.type === VALIDATION_ERRORS.MISSING_REQUIRED)).toBe(true);
    });

    it('should provide corrected values for all parameters', () => {
      const params = {
        speed: -1, // Invalid, should be corrected
        numSides: 'invalid' // Invalid, should be corrected
      };
      
      const result = validateParameters(params);
      
      expect(result.correctedValues.speed).toBe(0); // corrected to min
      expect(result.correctedValues.numSides).toBe(6); // corrected to default
    });
  });

  describe('sanitizeParameters', () => {
    it('should return sanitized parameter values', () => {
      const params = {
        speed: -1, // Below min
        numSides: 25, // Above max
        backgroundColor: 'invalid', // Invalid format
        blendMode: 'invalid-mode' // Invalid option
      };
      
      const sanitized = sanitizeParameters(params);
      
      expect(sanitized.speed).toBe(0); // corrected to min
      expect(sanitized.numSides).toBe(20); // corrected to max
      expect(sanitized.backgroundColor).toBe('#000000'); // corrected to default
      expect(sanitized.blendMode).toBe('source-over'); // corrected to default
    });

    it('should include all required parameters with defaults', () => {
      const params = { speed: 0.5 }; // Only one parameter
      
      const sanitized = sanitizeParameters(params);
      
      // Should include all parameters from PARAMETERS array
      expect(Object.keys(sanitized).length).toBeGreaterThan(1);
      expect(sanitized.speed).toBe(0.5); // original valid value
      expect(sanitized.numSides).toBeDefined(); // filled with default
    });
  });

  describe('getDefaultParameterValues', () => {
    it('should return all default parameter values', () => {
      const defaults = getDefaultParameterValues();
      
      expect(defaults.speed).toBe(0.002);
      expect(defaults.numSides).toBe(6);
      expect(defaults.backgroundColor).toBe('#000000');
      expect(defaults.blendMode).toBe('source-over');
      
      // Should have all parameters
      expect(Object.keys(defaults).length).toBeGreaterThan(10);
    });
  });

  describe('isParameterRandomizable', () => {
    it('should return true for randomizable parameters', () => {
      expect(isParameterRandomizable('speed')).toBe(true);
      expect(isParameterRandomizable('numSides')).toBe(true);
    });

    it('should return false for unknown parameters', () => {
      expect(isParameterRandomizable('unknown')).toBe(false);
    });
  });

  describe('getValidationSummary', () => {
    it('should return success message for valid results', () => {
      const validResult = {
        isValid: true,
        errors: []
      };
      
      const summary = getValidationSummary(validResult);
      expect(summary).toBe('All parameters are valid');
    });

    it('should return error summary for invalid results', () => {
      const invalidResult = {
        isValid: false,
        errors: [
          createValidationError(VALIDATION_ERRORS.OUT_OF_RANGE, 'Error 1', 'param1', 1),
          createValidationError(VALIDATION_ERRORS.OUT_OF_RANGE, 'Error 2', 'param2', 2),
          createValidationError(VALIDATION_ERRORS.INVALID_TYPE, 'Error 3', 'param3', 3)
        ]
      };
      
      const summary = getValidationSummary(invalidResult);
      expect(summary).toContain('Validation failed');
      expect(summary).toContain('2 out of range errors');
      expect(summary).toContain('1 invalid type error');
    });
  });
});