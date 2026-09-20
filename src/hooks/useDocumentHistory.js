import { useCallback, useEffect, useRef, useState } from 'react';

const clone = value => {
  try {
    return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

const fingerprint = value => {
  try { return JSON.stringify(value); } catch { return ''; }
};

export function useDocumentHistory({ capture, restore, limit = 50 }) {
  const callbacksRef = useRef({ capture, restore });
  callbacksRef.current = { capture, restore };
  const historyRef = useRef({ undo: [], redo: [] });
  const pendingRef = useRef(null);
  const restoringRef = useRef(false);
  const [version, setVersion] = useState(0);

  const begin = useCallback(() => {
    if (restoringRef.current || pendingRef.current) return;
    const snapshot = callbacksRef.current.capture?.();
    if (!snapshot) return;
    pendingRef.current = { snapshot: clone(snapshot), fingerprint: fingerprint(snapshot) };
  }, []);

  const commit = useCallback(() => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (!pending || restoringRef.current) return;
    const current = callbacksRef.current.capture?.();
    if (!current || pending.fingerprint === fingerprint(current)) return;
    const history = historyRef.current;
    history.undo.push(pending.snapshot);
    if (history.undo.length > limit) history.undo.shift();
    history.redo = [];
    setVersion(value => value + 1);
  }, [limit]);

  useEffect(() => {
    const onPointerDown = () => begin();
    const onPointerUp = () => setTimeout(commit, 0);
    const onKeyDown = event => {
      if ((event.metaKey || event.ctrlKey) && ['z', 'y'].includes((event.key || '').toLowerCase())) return;
      begin();
    };
    const onKeyUp = () => setTimeout(commit, 0);
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('pointerup', onPointerUp, true);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('pointerup', onPointerUp, true);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
    };
  }, [begin, commit]);

  const undo = useCallback(() => {
    const history = historyRef.current;
    const previous = history.undo.pop();
    if (!previous) return;
    const current = callbacksRef.current.capture?.();
    if (current) history.redo.push(clone(current));
    restoringRef.current = true;
    callbacksRef.current.restore?.(clone(previous));
    queueMicrotask(() => { restoringRef.current = false; });
    setVersion(value => value + 1);
  }, []);

  const redo = useCallback(() => {
    const history = historyRef.current;
    const next = history.redo.pop();
    if (!next) return;
    const current = callbacksRef.current.capture?.();
    if (current) history.undo.push(clone(current));
    restoringRef.current = true;
    callbacksRef.current.restore?.(clone(next));
    queueMicrotask(() => { restoringRef.current = false; });
    setVersion(value => value + 1);
  }, []);

  const reset = useCallback(() => {
    pendingRef.current = null;
    historyRef.current = { undo: [], redo: [] };
    setVersion(value => value + 1);
  }, []);

  return {
    undo,
    redo,
    reset,
    canUndo: historyRef.current.undo.length > 0,
    canRedo: historyRef.current.redo.length > 0,
    version,
  };
}
