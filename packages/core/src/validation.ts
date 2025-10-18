import { z } from 'zod';
import {
  parameterArraySchema,
  parameterSchema,
  layerSchema,
  appStateSchema,
  appSnapshotSchema,
  type Parameter,
  type Layer,
  type AppState,
  type AppSnapshot,
} from './schema.js';

export type ParameterValidationResult = {
  data: Parameter[];
  warnings: string[];
};

export const parseParameter = (input: unknown): Parameter => parameterSchema.parse(input);

export const parseParameters = (input: unknown): ParameterValidationResult => {
  const warnings: string[] = [];
  const data = parameterArraySchema.superRefine((params, ctx) => {
    const ids = new Set<string>();
    params.forEach((param, index) => {
      if (ids.has(param.id)) {
        warnings.push(`Duplicate parameter id '${param.id}' at index ${index}`);
      } else {
        ids.add(param.id);
      }
      if (param.type === 'slider') {
        const min = param.min ?? Number.NEGATIVE_INFINITY;
        const max = param.max ?? Number.POSITIVE_INFINITY;
        if (min >= max) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `slider '${param.id}' has min >= max`,
            path: [index, 'min'],
          });
        }
      }
    });
  }).parse(input);
  return { data, warnings };
};

export const parseLayer = (input: unknown): Layer => layerSchema.parse(input);
export const parseLayers = (input: unknown): Layer[] => z.array(layerSchema).parse(input);

export const parseAppState = (input: unknown): AppState => appStateSchema.parse(input);

export const parseSnapshot = (input: unknown): AppSnapshot => appSnapshotSchema.parse(input);

export const safeParseSnapshot = (input: unknown): { success: true; data: AppSnapshot } | { success: false; errors: z.ZodError } => {
  const parsed = appSnapshotSchema.safeParse(input);
  if (parsed.success) {
    return { success: true, data: parsed.data };
  }
  return { success: false, errors: parsed.error };
};
