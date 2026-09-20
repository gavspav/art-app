import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { useDocumentHistory } from '../useDocumentHistory.js';

describe('useDocumentHistory', () => {
  test('groups a pointer gesture into one undoable document transaction', async () => {
    let documentState = { layers: [{ id: 'one' }], audio: {} };
    const { result } = renderHook(() => useDocumentHistory({
      capture: () => documentState,
      restore: snapshot => { documentState = snapshot; },
    }));

    act(() => {
      window.dispatchEvent(new Event('pointerdown'));
      documentState = { layers: [{ id: 'one' }, { id: 'two' }], audio: { bass: 'size' } };
      window.dispatchEvent(new Event('pointerup'));
    });
    await waitFor(() => expect(result.current.canUndo).toBe(true));

    act(() => result.current.undo());
    expect(documentState).toEqual({ layers: [{ id: 'one' }], audio: {} });
    expect(result.current.canRedo).toBe(true);

    act(() => result.current.redo());
    expect(documentState).toEqual({ layers: [{ id: 'one' }, { id: 'two' }], audio: { bass: 'size' } });
  });
});
