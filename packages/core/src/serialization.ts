import type { AppSnapshot, AppState } from './schema.js';
import { appSnapshotSchema } from './schema.js';
import { StateStore, normalizeImportedAppState, createLayerIdFactory } from './state.js';
import { DEFAULT_PARAMETERS } from './parameters.js';
import { CORE_VERSION } from './data/defaults.js';

export interface SnapshotOptions {
  savedAt?: string;
  version?: string;
  includeParameters?: boolean;
  parametersOverride?: AppSnapshot['parameters'];
  midiMappings?: AppSnapshot['midiMappings'];
  exportMeta?: AppSnapshot['exportMeta'];
}

export const createSnapshot = (
  state: AppState,
  options: SnapshotOptions = {}
): AppSnapshot => {
  const snapshot: AppSnapshot = {
    parameters: options.includeParameters === false
      ? []
      : options.parametersOverride ?? DEFAULT_PARAMETERS,
    appState: state,
    midiMappings: options.midiMappings,
    exportMeta: {
      version: CORE_VERSION,
      exportedAt: new Date().toISOString(),
      ...(options.exportMeta ?? {}),
    },
    savedAt: options.savedAt ?? new Date().toISOString(),
    version: options.version ?? CORE_VERSION,
  };

  return appSnapshotSchema.parse(snapshot);
};

export interface ExportOptions extends SnapshotOptions {
  includeHistory?: boolean;
}

export const exportStateStore = (
  store: StateStore,
  options: ExportOptions = {}
) => {
  const baseSnapshot = createSnapshot(store.getState(), options);
  if (!options.includeHistory) {
    return baseSnapshot;
  }

  return {
    ...baseSnapshot,
    _history: store.history(),
  } as AppSnapshot & { _history: ReturnType<StateStore['history']> };
};

export interface ImportOptions {
  makeLayerId?: () => string;
}

export const importSnapshot = (
  snapshot: unknown,
  options: ImportOptions = {}
) => {
  const parsed = appSnapshotSchema.parse(snapshot);
  const makeLayerId = options.makeLayerId ?? createLayerIdFactory();
  const normalized = normalizeImportedAppState(parsed.appState, makeLayerId);

  return {
    snapshot: parsed,
    state: normalized,
    parameters: parsed.parameters,
    midiMappings: parsed.midiMappings,
  };
};

export const loadStateStoreFromSnapshot = (
  snapshot: unknown,
  options: ImportOptions & { historyLimit?: number } = {}
) => {
  const { state } = importSnapshot(snapshot, options);
  return new StateStore({ initialState: state, historyLimit: options.historyLimit, makeLayerId: options.makeLayerId });
};
