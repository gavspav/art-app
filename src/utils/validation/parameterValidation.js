/**
 * Parameter Validation Utilities
 * Provides comprehensive validation for application parameters
 */

import { PARAMETERS } from '../../constants/parameters.js';

/**
 * Validation error types
 */
export const VALIDATION_ERRORS = {
  INVALID_TYPE: 'INVALID_TYPE',
  OUT_OF_RANGE: 'OUT_OF_RANGE',
  INVALID_OPTION: 'INVALID_OPTION',
  MISSING_REQUIRED: 'MISSING_REQUIRED',
  INVALID_FORMAT: 'INVALID_FORMAT',
  TRANSFORM_ERROR: 'TRANSFORM_ERROR'
};

/**
 * Create a validation error object
 * @param {string} type - Error type from VALIDATION_ERRORS
 * @param {string} message - Human-readable error message
 * @param {string} parameterId - Parameter ID that failed validation
 * @param {*} value - The invalid value
 * @param {*} correctedValue - The corrected value (if applicable)
 * @returns {Object} Validation error object
 */
export const createValidationError = (type, message, parameterId, value, correctedValue = null) => ({
  type,
  message,
  parameterId,
  value,
  correctedValue,
  timestamp: new Date().toISOString()
});

/**
 * Get parameter definition by ID
 * @param {string} parameterId - Parameter ID
 * @returns {Object|null} Parameter definition or null if not found
 */
export const getParameterDefinition = (parameterId) => {
  return PARAMETERS.find(param => param.id === parameterId) || null;
};

/**
 * Validate a single parameter value
 * @param {string} parameterId - Parameter ID
 * @param {*} value - Value to validate
 * @param {Object} options - Validation options
 * @param {boolean} options.strict - Whether to use strict validation
 * @param {boolean} options.autoCorrect - Whether to auto-correct invalid values
 * @returns {Object} Validation result
 */
export const validateParameter = (parameterId, value, options = {}) => {
  const { strict = false, autoCorrect = true } = options;
  const parameter = getParameterDefinition(parameterId);
  
  if (!parameter) {
    return {
      isValid: false,
      error: createValidationError(
        VALIDATION_ERRORS.MISSING_REQUIRED,
        `Parameter '${parameterId}' not found in parameter definitions`,
        parameterId,
        value
      ),
      correctedValue: null
    };
  }

  // Check for null/undefined values
  if (value === null || value === undefined) {
    const correctedValue = autoCorrect ? parameter.defaultValue : null;
    return {
      isValid: !strict,
      error: strict ? createValidationError(
        VALIDATION_ERRORS.MISSING_REQUIRED,
        `Parameter '${parameterId}' cannot be null or undefined`,
        parameterId,
        value,
        correctedValue
      ) : null,
      correctedValue
    };
  }

  // Type-specific validation
  switch (parameter.type) {
    case 'slider':
    case 'number':
      return validateNumericParameter(parameter, value, { strict, autoCorrect });
    
    case 'dropdown':
      return validateDropdownParameter(parameter, value, { strict, autoCorrect });
    
    case 'color':
      return validateColorParameter(parameter, value, { strict, autoCorrect });
    
    default:
      return validateGenericParameter(parameter, value, { strict, autoCorrect });
  }
};

/**
 * Validate numeric parameter (slider/number)
 * @param {Object} parameter - Parameter definition
 * @param {*} value - Value to validate
 * @param {Object} options - Validation options
 * @returns {Object} Validation result
 */
const validateNumericParameter = (parameter, value, { strict, autoCorrect }) => {
  // Convert to number if possible
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  
  if (isNaN(numValue) || typeof numValue !== 'number') {
    const correctedValue = autoCorrect ? parameter.defaultValue : null;
    return {
      isValid: false,
      error: createValidationError(
        VALIDATION_ERRORS.INVALID_TYPE,
        `Parameter '${parameter.id}' must be a number, got ${typeof value}`,
        parameter.id,
        value,
        correctedValue
      ),
      correctedValue
    };
  }

  // Check range constraints
  if (parameter.min !== undefined && numValue < parameter.min) {
    const correctedValue = autoCorrect ? parameter.min : null;
    return {
      isValid: !strict,
      error: createValidationError(
        VALIDATION_ERRORS.OUT_OF_RANGE,
        `Parameter '${parameter.id}' value ${numValue} is below minimum ${parameter.min}`,
        parameter.id,
        value,
        correctedValue
      ),
      correctedValue
    };
  }

  if (parameter.max !== undefined && numValue > parameter.max) {
    const correctedValue = autoCorrect ? parameter.max : null;
    return {
      isValid: !strict,
      error: createValidationError(
        VALIDATION_ERRORS.OUT_OF_RANGE,
        `Parameter '${parameter.id}' value ${numValue} is above maximum ${parameter.max}`,
        parameter.id,
        value,
        correctedValue
      ),
      correctedValue
    };
  }

  // Check step constraint
  if (parameter.step !== undefined && parameter.step > 0) {
    const remainder = (numValue - (parameter.min || 0)) % parameter.step;
    const isValidStep = Math.abs(remainder) < 1e-10 || Math.abs(remainder - parameter.step) < 1e-10;
    if (!isValidStep) { // Account for floating point precision
      const correctedValue = autoCorrect ? 
        Math.round((numValue - (parameter.min || 0)) / parameter.step) * parameter.step + (parameter.min || 0) :
        null;
      return {
        isValid: !strict,
        error: createValidationError(
          VALIDATION_ERRORS.OUT_OF_RANGE,
          `Parameter '${parameter.id}' value ${numValue} does not match step constraint ${parameter.step}`,
          parameter.id,
          value,
          correctedValue
        ),
        correctedValue
      };
    }
  }

  return {
    isValid: true,
    error: null,
    correctedValue: numValue
  };
};

/**
 * Validate dropdown parameter
 * @param {Object} parameter - Parameter definition
 * @param {*} value - Value to validate
 * @param {Object} options - Validation options
 * @returns {Object} Validation result
 */
const validateDropdownParameter = (parameter, value, { strict, autoCorrect }) => {
  if (!parameter.options || !Array.isArray(parameter.options)) {
    return {
      isValid: false,
      error: createValidationError(
        VALIDATION_ERRORS.INVALID_FORMAT,
        `Parameter '${parameter.id}' has invalid options definition`,
        parameter.id,
        value
      ),
      correctedValue: null
    };
  }

  if (!parameter.options.includes(value)) {
    const correctedValue = autoCorrect ? parameter.defaultValue : null;
    return {
      isValid: !strict,
      error: createValidationError(
        VALIDATION_ERRORS.INVALID_OPTION,
        `Parameter '${parameter.id}' value '${value}' is not in allowed options: [${parameter.options.join(', ')}]`,
        parameter.id,
        value,
        correctedValue
      ),
      correctedValue
    };
  }

  return {
    isValid: true,
    error: null,
    correctedValue: value
  };
};

/**
 * Validate color parameter
 * @param {Object} parameter - Parameter definition
 * @param {*} value - Value to validate
 * @param {Object} options - Validation options
 * @returns {Object} Validation result
 */
const validateColorParameter = (parameter, value, { strict, autoCorrect }) => {
  if (typeof value !== 'string') {
    const correctedValue = autoCorrect ? parameter.defaultValue : null;
    return {
      isValid: false,
      error: createValidationError(
        VALIDATION_ERRORS.INVALID_TYPE,
        `Parameter '${parameter.id}' must be a string, got ${typeof value}`,
        parameter.id,
        value,
        correctedValue
      ),
      correctedValue
    };
  }

  // Validate hex color format
  const hexColorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
  if (!hexColorRegex.test(value)) {
    const correctedValue = autoCorrect ? parameter.defaultValue : null;
    return {
      isValid: !strict,
      error: createValidationError(
        VALIDATION_ERRORS.INVALID_FORMAT,
        `Parameter '${parameter.id}' must be a valid hex color (e.g., #FF0000), got '${value}'`,
        parameter.id,
        value,
        correctedValue
      ),
      correctedValue
    };
  }

  return {
    isValid: true,
    error: null,
    correctedValue: value
  };
};

/**
 * Validate generic parameter (fallback)
 * @param {Object} parameter - Parameter definition
 * @param {*} value - Value to validate
 * @param {Object} options - Validation options
 * @returns {Object} Validation result
 */
const validateGenericParameter = (parameter, value, { strict, autoCorrect }) => {
  // For unknown types, just ensure the value is not null/undefined
  if (value === null || value === undefined) {
    const correctedValue = autoCorrect ? parameter.defaultValue : null;
    return {
      isValid: !strict,
      error: createValidationError(
        VALIDATION_ERRORS.MISSING_REQUIRED,
        `Parameter '${parameter.id}' cannot be null or undefined`,
        parameter.id,
        value,
        correctedValue
      ),
      correctedValue
    };
  }

  return {
    isValid: true,
    error: null,
    correctedValue: value
  };
};

/**
 * Validate parameter transformation
 * @param {string} parameterId - Parameter ID
 * @param {*} value - Value to transform
 * @param {string} direction - Transform direction ('toSlider' or 'fromSlider')
 * @returns {Object} Validation result with transformed value
 */
export const validateParameterTransform = (parameterId, value, direction) => {
  const parameter = getParameterDefinition(parameterId);
  
  if (!parameter) {
    return {
      isValid: false,
      error: createValidationError(
        VALIDATION_ERRORS.MISSING_REQUIRED,
        `Parameter '${parameterId}' not found`,
        parameterId,
        value
      ),
      transformedValue: null
    };
  }

  if (!parameter.transform || typeof parameter.transform[direction] !== 'function') {
    // No transform needed, return original value
    return {
      isValid: true,
      error: null,
      transformedValue: value
    };
  }

  try {
    const transformedValue = parameter.transform[direction](value);
    
    if (isNaN(transformedValue) || typeof transformedValue !== 'number') {
      return {
        isValid: false,
        error: createValidationError(
          VALIDATION_ERRORS.TRANSFORM_ERROR,
          `Transform '${direction}' for parameter '${parameterId}' produced invalid result`,
          parameterId,
          value
        ),
        transformedValue: null
      };
    }

    return {
      isValid: true,
      error: null,
      transformedValue
    };
  } catch (error) {
    return {
      isValid: false,
      error: createValidationError(
        VALIDATION_ERRORS.TRANSFORM_ERROR,
        `Transform '${direction}' for parameter '${parameterId}' failed: ${error.message}`,
        parameterId,
        value
      ),
      transformedValue: null
    };
  }
};

/**
 * Validate multiple parameters at once
 * @param {Object} parameterValues - Object with parameter IDs as keys and values
 * @param {Object} options - Validation options
 * @returns {Object} Validation result with all errors and corrected values
 */
export const validateParameters = (parameterValues, options = {}) => {
  const { strict = false, autoCorrect = true } = options;
  const results = {};
  const errors = [];
  const correctedValues = {};
  let isValid = true;

  // Validate each parameter
  Object.entries(parameterValues).forEach(([parameterId, value]) => {
    const result = validateParameter(parameterId, value, { strict, autoCorrect });
    results[parameterId] = result;
    
    if (!result.isValid) {
      isValid = false;
      if (result.error) {
        errors.push(result.error);
      }
    }
    
    if (result.correctedValue !== null) {
      correctedValues[parameterId] = result.correctedValue;
    }
  });

  // Check for missing required parameters
  PARAMETERS.forEach(parameter => {
    if (!(parameter.id in parameterValues)) {
      const error = createValidationError(
        VALIDATION_ERRORS.MISSING_REQUIRED,
        `Required parameter '${parameter.id}' is missing`,
        parameter.id,
        undefined,
        parameter.defaultValue
      );
      errors.push(error);
      isValid = false;
      
      if (autoCorrect) {
        correctedValues[parameter.id] = parameter.defaultValue;
      }
    }
  });

  return {
    isValid,
    errors,
    correctedValues,
    results
  };
};

/**
 * Sanitize parameter values by applying validation and correction
 * @param {Object} parameterValues - Object with parameter values
 * @param {Object} options - Sanitization options
 * @returns {Object} Sanitized parameter values
 */
export const sanitizeParameters = (parameterValues, options = {}) => {
  const { strict = false } = options;
  const validation = validateParameters(parameterValues, { strict, autoCorrect: true });
  
  // Start with corrected values
  const sanitized = { ...validation.correctedValues };
  
  // Add valid original values
  Object.entries(validation.results).forEach(([parameterId, result]) => {
    if (result.isValid && result.correctedValue !== null) {
      sanitized[parameterId] = result.correctedValue;
    }
  });

  return sanitized;
};

/**
 * Get default parameter values
 * @returns {Object} Object with all parameter IDs and their default values
 */
export const getDefaultParameterValues = () => {
  const defaults = {};
  PARAMETERS.forEach(parameter => {
    defaults[parameter.id] = parameter.defaultValue;
  });
  return defaults;
};

/**
 * Check if a parameter is randomizable
 * @param {string} parameterId - Parameter ID
 * @returns {boolean} True if parameter can be randomized
 */
export const isParameterRandomizable = (parameterId) => {
  const parameter = getParameterDefinition(parameterId);
  return parameter ? parameter.isRandomizable === true : false;
};

/**
 * Get validation summary for debugging
 * @param {Object} validationResult - Result from validateParameters
 * @returns {string} Human-readable validation summary
 */
export const getValidationSummary = (validationResult) => {
  if (validationResult.isValid) {
    return 'All parameters are valid';
  }

  const errorCounts = {};
  validationResult.errors.forEach(error => {
    errorCounts[error.type] = (errorCounts[error.type] || 0) + 1;
  });

  const summary = Object.entries(errorCounts)
    .map(([type, count]) => `${count} ${type.toLowerCase().replace(/_/g, ' ')} error${count > 1 ? 's' : ''}`)
    .join(', ');

  return `Validation failed: ${summary}`;
};