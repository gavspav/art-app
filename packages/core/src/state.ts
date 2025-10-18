import { DEFAULT_LAYER, DEFAULT_APP_STATE } from './data/defaults.js';
import type { AppState, Layer } from './schema.js';

const SEED_MIN = 1;
const SEED_MAX = 2147483646;

const deepClone = <T>(value: T): T => {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

export const generateSeed = (): number => Math.floor(Math.random() * (SEED_MAX - SEED_MIN + 1)) + SEED_MIN;

export const createLayerIdFactory = (seed = Math.floor(Math.random() * 1e6)): (() => string) => {
  let counter = 0;
  return () => {
    counter += 1;
    return `layer-${seed}-${Date.now().toString(36)}-${counter}`;
  };
};

export const ensureLayerId = (layer: Partial<Layer>, makeLayerId: () => string): Layer => {
  if (layer && typeof layer === 'object' && typeof layer.id === 'string' && layer.id.length > 0) {
    return layer as Layer;
  }
  const id = makeLayerId();
  return { ...(layer as Layer), id };
};

export const assignLayerIds = (layers: Partial<Layer>[] | undefined, makeLayerId: () => string): Layer[] => {
  const list = Array.isArray(layers) ? layers : [];
  const seen = new Set<string>();
  return list.map((layer) => {
    let out = ensureLayerId(layer, makeLayerId);
    let id = out.id as string;
    if (seen.has(id)) {
      const newId = makeLayerId();
      out = { ...out, id: newId };
      id = newId;
    }
    seen.add(id);
    return out;
  }) as Layer[];
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const normalizeAngle = (value: number) => ((Math.round(value) % 360) + 360) % 360;

const allowedMovementStyles = new Set(['bounce', 'drift', 'still', 'orbit', 'spin']);

export const normalizeLayer = (layerInput: Partial<Layer>, makeLayerId: () => string): Layer => {
  const base = { ...DEFAULT_LAYER, ...layerInput } as Layer;
  const pos = base.position && typeof base.position === 'object' ? base.position : DEFAULT_LAYER.position;
  const position = {
    centerX: Number.isFinite(pos.centerX) ? pos.centerX : DEFAULT_LAYER.position?.centerX ?? 0.5,
    centerY: Number.isFinite(pos.centerY) ? pos.centerY : DEFAULT_LAYER.position?.centerY ?? 0.5,
    x: Number.isFinite(pos.x) ? pos.x : DEFAULT_LAYER.position?.x ?? 0.5,
    y: Number.isFinite(pos.y) ? pos.y : DEFAULT_LAYER.position?.y ?? 0.5,
    vx: Number.isFinite(pos.vx) ? pos.vx : 0,
    vy: Number.isFinite(pos.vy) ? pos.vy : 0,
    scale: Number.isFinite(pos.scale) ? pos.scale : DEFAULT_LAYER.position?.scale ?? 1,
    scaleDirection: pos.scaleDirection === -1 || pos.scaleDirection === 1 ? pos.scaleDirection : 1,
  };

  position.x = clamp(position.x, -0.2, 1.2);
  position.y = clamp(position.y, -0.2, 1.2);
  position.scale = clamp(position.scale, 0.05, 5);

  const movementStyle = allowedMovementStyles.has(base.movementStyle as string)
    ? base.movementStyle
    : DEFAULT_LAYER.movementStyle;
  const movementSpeed = Number.isFinite(base.movementSpeed)
    ? clamp(base.movementSpeed as number, 0, 5)
    : DEFAULT_LAYER.movementSpeed;
  const movementAngle = Number.isFinite(base.movementAngle)
    ? normalizeAngle(base.movementAngle as number)
    : DEFAULT_LAYER.movementAngle;
  const scaleSpeed = Number.isFinite(base.scaleSpeed)
    ? clamp(base.scaleSpeed as number, 0, 0.2)
    : DEFAULT_LAYER.scaleSpeed;

  let radiusFactor = base.radiusFactor;
  if (!Number.isFinite(radiusFactor)) {
    const width = Number(base.width) || 0;
    const height = Number(base.height) || 0;
    if (width > 0 || height > 0) {
      const avg = (width + height) / 2;
      const baseRF = Number.isFinite(base.baseRadiusFactor) ? (base.baseRadiusFactor as number) : 0.4;
      const assumedMinWH = 640;
      const legacyRadiusPx = avg * baseRF;
      const rfEst = legacyRadiusPx / (assumedMinWH * 0.4);
      radiusFactor = clamp(rfEst || DEFAULT_LAYER.radiusFactor, 0.02, 0.9);
    } else {
      radiusFactor = DEFAULT_LAYER.radiusFactor;
    }
  }

  const layerOut: Layer = {
    ...DEFAULT_LAYER,
    ...base,
    id: typeof base.id === 'string' && base.id.length > 0 ? base.id : makeLayerId(),
    position,
    movementStyle,
    movementSpeed,
    movementAngle,
    scaleSpeed,
    radiusFactor,
  } as Layer;

  if (!Array.isArray(layerOut.colors)) {
    layerOut.colors = [...(DEFAULT_LAYER.colors || ['#ffffff'])];
  }
  if (layerOut.nodes && (!Array.isArray(layerOut.nodes) || layerOut.nodes.length < 3)) {
    layerOut.nodes = null;
  }

  delete (layerOut as unknown as { width?: number }).width;
  delete (layerOut as unknown as { height?: number }).height;

  return layerOut;
};

export const normalizeImportedAppState = (input: Partial<AppState>, makeLayerId: () => string): AppState => {
  const base = deepClone(DEFAULT_APP_STATE);
  const merged: Partial<AppState> = { ...base, ...input };
  const layers = Array.isArray(input.layers) && input.layers.length > 0
    ? input.layers.map((layer) => normalizeLayer(layer, makeLayerId))
    : base.layers.map((layer) => normalizeLayer(layer, makeLayerId));

  const state: AppState = {
    ...base,
    ...merged,
    globalSeed: Number.isFinite(input.globalSeed) ? (input.globalSeed as number) : generateSeed(),
    layers,
    syncLayerColorsToFirst: typeof input.syncLayerColorsToFirst === 'boolean'
      ? input.syncLayerColorsToFirst
      : !!base.syncLayerColorsToFirst,
    backgroundImage: {
      src: null,
      opacity: 1,
      fit: 'cover',
      enabled: false,
      ...(input.backgroundImage || {}),
    },
  } as AppState;

  state.layers = assignLayerIds(state.layers, makeLayerId);

  return state;
};

export const createInitialAppState = (): AppState => {
  const makeLayerId = createLayerIdFactory();
  const base = deepClone(DEFAULT_APP_STATE);
  base.layers = base.layers.map((layer) => normalizeLayer(layer, makeLayerId));
  base.layers = assignLayerIds(base.layers, makeLayerId);
  base.globalSeed = generateSeed();
  return base;
};

export interface StateHistoryMeta {
  tool?: string;
  note?: string;
  argsHash?: string;
  timestamp?: string;
}

export interface StateHistoryEntry {
  version: number;
  state: AppState;
  metadata?: StateHistoryMeta;
}

const DEFAULT_HISTORY_LIMIT = 20;

const withTimestamp = (meta: StateHistoryMeta | undefined): StateHistoryMeta => ({
  timestamp: new Date().toISOString(),
  ...(meta ?? {}),
});

const clampHistory = (stack: StateHistoryEntry[], limit: number) => {
  if (stack.length > limit) {
    stack.splice(0, stack.length - limit);
  }
};

export class StateStore {
  private current: AppState;

  private version: number;

  private readonly undoStack: StateHistoryEntry[] = [];

  private readonly redoStack: StateHistoryEntry[] = [];

  private readonly historyLimit: number;

  private readonly makeLayerId: () => string;

  constructor(options: {
    initialState?: AppState;
    historyLimit?: number;
    makeLayerId?: () => string;
  } = {}) {
    this.makeLayerId = options.makeLayerId ?? createLayerIdFactory();
    const initial = options.initialState ? normalizeImportedAppState(options.initialState, this.makeLayerId) : createInitialAppState();
    this.current = deepClone(initial);
    this.version = 1;
    this.historyLimit = Math.max(1, options.historyLimit ?? DEFAULT_HISTORY_LIMIT);
  }

  snapshot(): { version: number; state: AppState } {
    return {
      version: this.version,
      state: deepClone(this.current),
    };
  }

  getState(): AppState {
    return deepClone(this.current);
  }

  getVersion(): number {
    return this.version;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  history() {
    return {
      undo: [...this.undoStack],
      redo: [...this.redoStack],
    };
  }

  replaceState(state: AppState, metadata?: StateHistoryMeta) {
    this.pushUndo(metadata);
    this.current = normalizeImportedAppState(state, this.makeLayerId);
    this.version += 1;
    this.redoStack.length = 0;
    return this.snapshot();
  }

  update(updateFn: (state: AppState) => AppState, metadata?: StateHistoryMeta) {
    const next = updateFn(this.getState());
    return this.replaceState(next, metadata);
  }

  undo(metadata?: StateHistoryMeta) {
    if (!this.canUndo()) {
      throw new Error('Nothing to undo');
    }
    const previous = this.undoStack.pop()!;
    this.pushRedo(metadata);
    this.current = deepClone(previous.state);
    this.version = previous.version;
    return this.snapshot();
  }

  redo(metadata?: StateHistoryMeta) {
    if (!this.canRedo()) {
      throw new Error('Nothing to redo');
    }
    const next = this.redoStack.pop()!;
    this.pushUndo(metadata);
    this.current = deepClone(next.state);
    this.version = next.version;
    return this.snapshot();
  }

  clearHistory() {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  private pushUndo(metadata?: StateHistoryMeta) {
    this.undoStack.push({
      version: this.version,
      state: this.getState(),
      metadata: withTimestamp(metadata),
    });
    clampHistory(this.undoStack, this.historyLimit);
  }

  private pushRedo(metadata?: StateHistoryMeta) {
    this.redoStack.push({
      version: this.version,
      state: this.getState(),
      metadata: withTimestamp(metadata),
    });
    clampHistory(this.redoStack, this.historyLimit);
  }
}
