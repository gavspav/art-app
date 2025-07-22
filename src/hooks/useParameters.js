/**
 * useParameters Hook - Manages parameter state and operations
 * Handles parameter values, validation, and randomization
 */

import { useState, useCallback, useMemo } from 'react';
import { PARAMETERS } from '../constants/parameters.js';
import { defaults } from '../constants/defaults.js';

/**
 * Custom hook for managing parameter state
 * @param {Object} initialValues - Initial parameter values
 * @returns {Object} Parameter management interface
 */
export const useParameters = (initialValues = {}) => {
  // Initialize parameter values with defaults
  const getInitialValues = useCallback(() => {
    const values = {};
    PARAMETERS.forEach(param => {
      if (initialValues[param.id] !== undefined) {
        values[param.id] = initialValues[param.id];
      } else if (defaults[param.id] !== undefined) {
        values[param.id] = typeof defaults[param.id] === 'function' 
          ? defaults[param.id]() 
          : defaults[param.id];
      } else {
        values[param.id] = param.defaultValue;
      }
    });
    return values;
  }, [initialValues]);

  const [values, setValues] = useState(getInitialValues);

  // Validate parameter value
  const validateValue = useCallback((parameter, value) => {
    if (value === null || value === undefined) {
      return parameter.defaultValue;
    }

    switch (parameter.type) {
      case 'slider':
      case 'number':
        const numValue = Number(value);
        if (isNaN(numValue)) {
          return parameter.defaultValue;
        }
        // Clamp to min/max if defined
        if (parameter.min !== undefined && numValue < parameter.min) {
          return parameter.min;
        }
        if (parameter.max !== undefined && numValue > parameter.max) {
          return parameter.max;
        }
        return numValue;

      case 'dropdown':
        if (parameter.options && parameter.options.includes(value)) {
          return value;
        }
        return parameter.defaultValue;

      case 'color':
        // Basic color validation (hex format)
        if (typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value)) {
          return value;
        }
        return parameter.defaultValue;

      default:
        return value;
    }
  }, []);

  // Update a single parameter value
  const updateParameter = useCallback((parameterId, value) => {
    const parameter = PARAMETERS.find(p => p.id === parameterId);
    if (!parameter) {
      console.warn(`Parameter ${parameterId} not found`);
      return;
    }

    const validatedValue = validateValue(parameter, value);
    
    setValues(prevValues => ({
      ...prevValues,
      [parameterId]: validatedValue
    }));
  }, [validateValue]);

  // Update multiple parameters at once
  const updateParameters = useCallback((newValues) => {
    setValues(prevValues => {
      const updatedValues = { ...prevValues };
      
      Object.entries(newValues).forEach(([parameterId, value]) => {
        const parameter = PARAMETERS.find(p => p.id === parameterId);
        if (parameter) {
          updatedValues[parameterId] = validateValue(parameter, value);
        }
      });
      
      return updatedValues;
    });
  }, [validateValue]);

  // Generate random value for a parameter
  const generateRandomValue = useCallback((parameter) => {
    switch (parameter.type) {
      case 'slider':
      case 'number':
        const min = parameter.min || 0;
        const max = parameter.max || 1;
        const step = parameter.step || 0.01;
        const range = max - min;
        const steps = Math.floor(range / step);
        const randomStep = Math.floor(Math.random() * (steps + 1));
        return min + (randomStep * step);

      case 'dropdown':
        if (parameter.options && parameter.options.length > 0) {
          const randomIndex = Math.floor(Math.random() * parameter.options.length);
          return parameter.options[randomIndex];
        }
        return parameter.defaultValue;

      case 'color':
        // Generate random hex color
        const randomColor = Math.floor(Math.random() * 16777215).toString(16);
        return `#${randomColor.padStart(6, '0')}`;

      default:
        return parameter.defaultValue;
    }
  }, []);

  // Randomize all randomizable parameters
  const randomizeAll = useCallback(() => {
    const randomValues = {};
    
    PARAMETERS.forEach(parameter => {
      if (parameter.isRandomizable) {
        randomValues[parameter.id] = generateRandomValue(parameter);
      }
    });
    
    updateParameters(randomValues);
  }, [generateRandomValue, updateParameters]);

  // Randomize specific parameters
  const randomizeParameters = useCallback((parameterIds) => {
    const randomValues = {};
    
    parameterIds.forEach(parameterId => {
      const parameter = PARAMETERS.find(p => p.id === parameterId);
      if (parameter && parameter.isRandomizable) {
        randomValues[parameterId] = generateRandomValue(parameter);
      }
    });
    
    updateParameters(randomValues);
  }, [generateRandomValue, updateParameters]);

  // Reset all parameters to defaults
  const resetToDefaults = useCallback(() => {
    setValues(getInitialValues());
  }, [getInitialValues]);

  // Reset specific parameters to defaults
  const resetParameters = useCallback((parameterIds) => {
    const resetValues = {};
    
    parameterIds.forEach(parameterId => {
      const parameter = PARAMETERS.find(p => p.id === parameterId);
      if (parameter) {
        if (defaults[parameterId] !== undefined) {
          resetValues[parameterId] = typeof defaults[parameterId] === 'function' 
            ? defaults[parameterId]() 
            : defaults[parameterId];
        } else {
          resetValues[parameterId] = parameter.defaultValue;
        }
      }
    });
    
    updateParameters(resetValues);
  }, [updateParameters]);

  // Get parameter definition by ID
  const getParameter = useCallback((parameterId) => {
    return PARAMETERS.find(p => p.id === parameterId);
  }, []);

  // Get parameters grouped by category
  const parametersByGroup = useMemo(() => {
    const groups = {};
    PARAMETERS.forEach(parameter => {
      const group = parameter.group || 'Other';
      if (!groups[group]) {
        groups[group] = [];
      }
      groups[group].push(parameter);
    });
    return groups;
  }, []);

  // Get only parameters that should show in overlay
  const overlayParameters = useMemo(() => {
    return PARAMETERS.filter(p => p.showInOverlay);
  }, []);

  // Get current values for specific parameters
  const getParameterValues = useCallback((parameterIds) => {
    const result = {};
    parameterIds.forEach(id => {
      if (values[id] !== undefined) {
        result[id] = values[id];
      }
    });
    return result;
  }, [values]);

  return {
    // Parameter definitions
    parameters: PARAMETERS,
    parametersByGroup,
    overlayParameters,
    
    // Current values
    values,
    
    // Value operations
    updateParameter,
    updateParameters,
    getParameterValues,
    
    // Randomization
    randomizeAll,
    randomizeParameters,
    generateRandomValue,
    
    // Reset operations
    resetToDefaults,
    resetParameters,
    
    // Utilities
    getParameter,
    validateValue
  };
};

export default useParameters;