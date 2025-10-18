import type { Parameter } from './schema.js';
import { parameters } from './data/parameters.js';

const NUMERIC_FIELDS = new Set(['min', 'max', 'step', 'defaultValue', 'randomMin', 'randomMax']);
const FORCE_DEFAULTS = new Set(['width', 'height', 'movementSpeed', 'wobble', 'noiseAmount', 'scaleSpeed', 'scaleMin', 'scaleMax']);
const MOVEMENT_STYLE_OPTIONS = ['bounce', 'drift', 'still', 'orbit', 'spin'] as const;

const defaultById = new Map(parameters.map((param) => [param.id, param]));

const sanitizeSlider = (param: Parameter): Parameter => {
  if (param.type !== 'slider') return param;
  const min = Number.isFinite(param.min) ? (param.min as number) : defaultById.get(param.id)?.min;
  const max = Number.isFinite(param.max) ? (param.max as number) : defaultById.get(param.id)?.max;
  const step = Number.isFinite(param.step) ? (param.step as number) : defaultById.get(param.id)?.step;
  const defaultValue = Number.isFinite(param.defaultValue) ? Number(param.defaultValue) : defaultById.get(param.id)?.defaultValue;

  const resolvedMin = typeof min === 'number' ? min : 0;
  const resolvedMax = typeof max === 'number' ? max : resolvedMin + 1;
  const resolvedStep = typeof step === 'number' && step > 0 ? step : 1;
  const boundedDefault = typeof defaultValue === 'number'
    ? Math.min(resolvedMax, Math.max(resolvedMin, defaultValue))
    : resolvedMin;

  return {
    ...param,
    min: resolvedMin,
    max: resolvedMax > resolvedMin ? resolvedMax : resolvedMin + resolvedStep,
    step: resolvedStep,
    defaultValue: boundedDefault,
  };
};

const sanitizeParameter = (param: Parameter): Parameter => {
  let merged = { ...param };
  if (FORCE_DEFAULTS.has(merged.id)) {
    const authoritative = defaultById.get(merged.id);
    if (authoritative) {
      merged = {
        ...merged,
        label: authoritative.label,
        min: authoritative.min,
        max: authoritative.max,
        step: authoritative.step,
        defaultValue: authoritative.defaultValue,
        group: authoritative.group,
      };
    }
  }
  if (merged.id === 'movementStyle') {
    merged = { ...merged, options: [...MOVEMENT_STYLE_OPTIONS] };
  }
  merged = sanitizeSlider(merged);
  return merged;
};

export const DEFAULT_PARAMETERS = parameters;

export const getParameterDefault = (id: string): Parameter | undefined => defaultById.get(id);

export const mergeParametersWithDefaults = (savedParams?: Parameter[]): Parameter[] => {
  const saved = Array.isArray(savedParams) ? savedParams : [];
  return DEFAULT_PARAMETERS.map((defaultParam) => {
    const savedParam = saved.find((param) => param.id === defaultParam.id);
    const merged = savedParam ? { ...defaultParam, ...savedParam } : { ...defaultParam };
    return sanitizeParameter(merged as Parameter);
  });
};

export const applyParameterUpdate = (
  parametersList: Parameter[],
  id: string,
  field: string,
  value: unknown,
): Parameter[] => {
  const numeric = NUMERIC_FIELDS.has(field);
  const coercedValue = numeric ? Number(value) : value;
  let found = false;
  const next = parametersList.map((param) => {
    if (param.id !== id) return param;
    found = true;
    return sanitizeParameter({ ...param, [field]: coercedValue } as Parameter);
  });

  if (!found) {
    const defaults = getParameterDefault(id) ?? ({ id, label: id, type: 'global' } as Parameter);
    next.push(sanitizeParameter({ ...defaults, [field]: coercedValue } as Parameter));
  }

  return next;
};
