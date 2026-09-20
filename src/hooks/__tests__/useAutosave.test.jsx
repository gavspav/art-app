import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { useAutosave } from '../useAutosave.js';

const baseProps = () => ({
  isDirty: true,
  setIsDirty: vi.fn(),
  lastSavedAt: 0,
  setLastSavedAt: vi.fn(),
  getCurrentAppState: () => ({ layers: [{ id: 'layer-one' }], isFrozen: true }),
  parameters: [{ id: 'radiusFactor', value: 0.4 }],
  isFrozen: true,
  getAudioSnapshot: () => ({ mappings: {} }),
  getBPMSnapshot: () => ({ bpm: 120 }),
});

describe('useAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  test('saves dirty projects while animation is paused', () => {
    const props = baseProps();
    renderHook(() => useAutosave(props));
    act(() => vi.advanceTimersByTime(30000));
    expect(props.setIsDirty).toHaveBeenCalledWith(false);
    expect(JSON.parse(localStorage.getItem('artapp-studio-v1-autosave-0')).appState.isFrozen).toBe(true);
  });

  test('keeps the project dirty when storage rejects the save', () => {
    const props = baseProps();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    renderHook(() => useAutosave(props));
    act(() => vi.advanceTimersByTime(30000));
    expect(props.setIsDirty).not.toHaveBeenCalled();
    expect(props.setLastSavedAt).not.toHaveBeenCalled();
  });
});
