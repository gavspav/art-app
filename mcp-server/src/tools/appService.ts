import {
  DEFAULT_APP_STATE,
  DEFAULT_PARAMETERS,
  StateStore,
  assignLayerIds,
  createInitialAppState,
  createLayerIdFactory,
  createSnapshot,
  generateSeed,
  importSnapshot,
  normalizeLayer,
  normalizeImportedAppState,
  type AppState,
  type Layer,
} from '@art-app/core';
import { z } from 'zod';
import { ToolError } from '../errors.js';

const setStateInputSchema = z.object({
  expectedVersion: z.number().int().positive().optional(),
  state: z.record(z.unknown()),
});

const expectedVersionSchema = z.object({
  expectedVersion: z.number().int().positive().optional(),
});

const layerIdentifierSchema = z.object({
  layerId: z.string().min(1).optional(),
  layerIndex: z.number().int().nonnegative().optional(),
});

const layerPayloadSchema = z.object({
  layerId: z.string().min(1).optional(),
  layerIndex: z.number().int().nonnegative().optional(),
  layer: z.record(z.unknown()),
  expectedVersion: z.number().int().positive().optional(),
});

const addLayerSchema = z.object({
  layer: z.record(z.unknown()).optional(),
  position: z.number().int().nonnegative().optional(),
  expectedVersion: z.number().int().positive().optional(),
});

const deleteLayerSchema = z.object({
  layerId: z.string().min(1).optional(),
  layerIndex: z.number().int().nonnegative().optional(),
  expectedVersion: z.number().int().positive().optional(),
});

const randomizeSchema = z.object({
  scope: z.enum(['all', 'layer', 'colors']).default('all'),
  layerId: z.string().min(1).optional(),
  expectedVersion: z.number().int().positive().optional(),
});

const toggleFreezeSchema = z.object({
  value: z.boolean().optional(),
  expectedVersion: z.number().int().positive().optional(),
});

const importStateSchema = z.object({
  snapshot: z.record(z.unknown()),
  expectedVersion: z.number().int().positive().optional(),
});

const historySchema = z.object({
  includeUndo: z.boolean().optional(),
  includeRedo: z.boolean().optional(),
}).optional();

export class AppService {
  private readonly store: StateStore;

  private readonly makeLayerId: () => string;

  private snapshotListener?: (snapshot: { version: number; state: AppState }) => void;

  constructor() {
    this.makeLayerId = createLayerIdFactory();
    const initial = createInitialAppState();
    this.store = new StateStore({ initialState: initial, makeLayerId: this.makeLayerId });
  }

  setSnapshotListener(listener: (snapshot: { version: number; state: AppState }) => void) {
    this.snapshotListener = listener;
  }

  private emitSnapshot(snapshot: { version: number; state: AppState }) {
    try {
      this.snapshotListener?.(snapshot);
    } catch (error) {
      console.warn('[AppService] Snapshot listener threw error', error);
    }
  }

  applySnapshot(snapshot: { version: number; state: AppState }) {
    const result = this.store.loadSnapshot(snapshot);
    this.emitSnapshot(result);
    return result;
  }
  private assertVersion(expected: number | undefined) {
    if (typeof expected === 'number' && expected !== this.store.getVersion()) {
      throw new ToolError('version_conflict', 'State version mismatch', {
        expected,
        actual: this.store.getVersion(),
      });
    }
  }

  private getLayerRef(identifier: z.infer<typeof layerIdentifierSchema>) {
    const { layerId, layerIndex } = identifier;
    const state = this.store.getState();
    if (typeof layerId === 'string') {
      const index = state.layers.findIndex((layer) => layer.id === layerId);
      if (index >= 0) {
        return { index, layer: state.layers[index] };
      }
      throw new ToolError('not_found', `Layer with id '${layerId}' not found.`);
    }

    if (typeof layerIndex === 'number') {
      const layer = state.layers[layerIndex];
      if (layer) {
        return { index: layerIndex, layer };
      }
      throw new ToolError('not_found', `Layer index ${layerIndex} is out of range.`);
    }

    throw new ToolError('invalid_request', 'Layer identifier must include layerId or layerIndex.');
  }

  getSchema() {
    return {
      parameters: DEFAULT_PARAMETERS,
      appState: DEFAULT_APP_STATE,
    };
  }

  getState() {
    return this.store.snapshot();
  }

  setState(input: unknown) {
    const payload = setStateInputSchema.parse(input);
    this.assertVersion(payload.expectedVersion);
    const normalized = normalizeImportedAppState(payload.state as Partial<AppState>, this.makeLayerId);
    const result = this.store.replaceState(normalized, { tool: 'set_state' });
    this.emitSnapshot(result);
    return { version: result.version };
  }

  getLayer(input: unknown) {
    const identifier = layerIdentifierSchema.parse(input ?? {});
    const { layer, index } = this.getLayerRef(identifier);
    return {
      version: this.store.getVersion(),
      layer,
      index,
    };
  }

  setLayer(input: unknown) {
    const payload = layerPayloadSchema.parse(input);
    this.assertVersion(payload.expectedVersion);
    const { index } = this.getLayerRef(payload);
    const snapshot = this.store.update((state) => {
      const layers = [...state.layers];
      const base = { ...layers[index], ...(payload.layer as Partial<Layer>) } as Partial<Layer>;
      const normalized = normalizeLayer(base, this.makeLayerId);
      layers[index] = normalized;
      return { ...state, layers };
    }, { tool: 'set_layer', argsHash: `${payload.layerId ?? payload.layerIndex}` });
    this.emitSnapshot(snapshot);

    return {
      version: snapshot.version,
      layer: snapshot.state.layers[index],
    };
  }

  addLayer(input: unknown) {
    const payload = addLayerSchema.parse(input ?? {});
    this.assertVersion(payload.expectedVersion);
    const normalized = normalizeLayer((payload.layer as Partial<Layer>) ?? {}, this.makeLayerId);
    const position = typeof payload.position === 'number' ? payload.position : undefined;

    const snapshot = this.store.update((state) => {
      const layers = [...state.layers];
      if (typeof position === 'number' && position >= 0 && position <= layers.length) {
        layers.splice(position, 0, normalized);
      } else {
        layers.push(normalized);
      }
      return { ...state, layers: assignLayerIds(layers, this.makeLayerId) };
    }, { tool: 'add_layer' });
    this.emitSnapshot(snapshot);

    return {
      version: snapshot.version,
      layers: snapshot.state.layers,
    };
  }

  deleteLayer(input: unknown) {
    const payload = deleteLayerSchema.parse(input ?? {});
    this.assertVersion(payload.expectedVersion);
    const { index } = this.getLayerRef(payload);

    const snapshot = this.store.update((state) => {
      const layers = state.layers.filter((_, idx) => idx !== index);
      return { ...state, layers };
    }, { tool: 'delete_layer' });
    this.emitSnapshot(snapshot);

    return {
      version: snapshot.version,
      removedIndex: index,
    };
  }

  randomize(input: unknown) {
    const payload = randomizeSchema.parse(input ?? {});
    this.assertVersion(payload.expectedVersion);
    const snapshot = this.store.update((state) => {
      const next: AppState = { ...state };
      if (payload.scope === 'all') {
        next.globalSeed = generateSeed();
      } else if (payload.scope === 'layer') {
        if (!payload.layerId) {
          throw new ToolError('invalid_request', 'Randomize scope "layer" requires layerId');
        }
        const target = this.getLayerRef({ layerId: payload.layerId }).index;
        const layers = [...state.layers];
        layers[target] = { ...layers[target], seed: generateSeed() } as Layer;
        next.layers = layers;
      } else if (payload.scope === 'colors') {
        next.randomizePalette = true;
        next.globalSeed = generateSeed();
      }
      return next;
    }, { tool: 'randomize', note: payload.scope });
    this.emitSnapshot(snapshot);

    return {
      version: snapshot.version,
    };
  }

  toggleFreeze(input: unknown) {
    const payload = toggleFreezeSchema.parse(input ?? {});
    this.assertVersion(payload.expectedVersion);
    const snapshot = this.store.update((state) => ({
      ...state,
      isFrozen: typeof payload.value === 'boolean' ? payload.value : !state.isFrozen,
    }), { tool: 'toggle_freeze' });
    this.emitSnapshot(snapshot);

    return {
      version: snapshot.version,
      isFrozen: snapshot.state.isFrozen,
    };
  }

  exportState() {
    const snapshot = createSnapshot(this.store.getState(), { includeParameters: true });
    return {
      snapshot,
      version: this.store.getVersion(),
    };
  }

  importState(input: unknown) {
    const payload = importStateSchema.parse(input);
    this.assertVersion(payload.expectedVersion);
    const imported = importSnapshot(payload.snapshot, { makeLayerId: this.makeLayerId });
    const result = this.store.replaceState(imported.state, { tool: 'import_state' });
    this.emitSnapshot(result);
    return {
      version: result.version,
    };
  }

  undo(input: unknown) {
    const payload = expectedVersionSchema.parse(input ?? {});
    this.assertVersion(payload.expectedVersion);
    try {
      const result = this.store.undo({ tool: 'undo' });
      this.emitSnapshot(result);
      return {
        version: result.version,
        state: result.state,
      };
    } catch (error) {
      if (error instanceof Error && error.message === 'Nothing to undo') {
        throw new ToolError('nothing_to_undo', 'There is no previous state to undo.');
      }
      throw error;
    }
  }

  redo(input: unknown) {
    const payload = expectedVersionSchema.parse(input ?? {});
    this.assertVersion(payload.expectedVersion);
    try {
      const result = this.store.redo({ tool: 'redo' });
      this.emitSnapshot(result);
      return {
        version: result.version,
        state: result.state,
      };
    } catch (error) {
      if (error instanceof Error && error.message === 'Nothing to redo') {
        throw new ToolError('nothing_to_redo', 'There is no future state to redo.');
      }
      throw error;
    }
  }

  getHistory(input: unknown) {
    historySchema.parse(input ?? {});
    return {
      version: this.store.getVersion(),
      history: this.store.history(),
    };
  }
}
