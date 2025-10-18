import { describe, expect, test } from 'vitest';
import { StateStore, createInitialAppState } from '../src/state.js';

describe('StateStore', () => {
  test('update adds undo history with metadata and bumps version', () => {
    const store = new StateStore({ initialState: createInitialAppState() });
    const originalVersion = store.getVersion();

    const nextSnapshot = store.update(
      (state) => ({
        ...state,
        globalSeed: 'seed-1',
      }),
      { tool: 'update', note: 'seed change' }
    );

    expect(nextSnapshot.version).toBe(originalVersion + 1);
    const history = store.history();
    expect(history.undo).toHaveLength(1);
    expect(history.undo[0].metadata?.tool).toBe('update');
    expect(history.undo[0].metadata?.note).toBe('seed change');
  });

  test('undo and redo cycle restores prior versions', () => {
    const store = new StateStore({ initialState: createInitialAppState() });

    const first = store.update((state) => ({
      ...state,
      globalSeed: 'seed-1',
    }));
    const second = store.update((state) => ({
      ...state,
      globalSeed: 'seed-2',
    }));

    expect(store.getVersion()).toBe(second.version);
    const undoSnapshot = store.undo({ tool: 'undo-test' });
    expect(undoSnapshot.version).toBe(first.version);
    expect(store.getVersion()).toBe(first.version);

    const redoSnapshot = store.redo({ tool: 'redo-test' });
    expect(redoSnapshot.version).toBe(second.version);
    expect(store.getVersion()).toBe(second.version);
  });

  test('history limit clamps stored undo entries', () => {
    const store = new StateStore({ initialState: createInitialAppState(), historyLimit: 2 });

    store.update((state) => ({ ...state, globalSeed: 'seed-1' }), { tool: 'one' });
    store.update((state) => ({ ...state, globalSeed: 'seed-2' }), { tool: 'two' });
    store.update((state) => ({ ...state, globalSeed: 'seed-3' }), { tool: 'three' });

    const history = store.history();
    expect(history.undo).toHaveLength(2);
    expect(history.undo[0].metadata?.tool).toBe('two');
    expect(history.undo[1].metadata?.tool).toBe('three');
  });
});
