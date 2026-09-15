import { useEffect, useLayoutEffect, useRef } from 'react';
import { flushSync } from 'react-dom';

// Input arbitration only. Geometry and application state remain in the editor.
// A finished pinch consumes the remaining finger, so it cannot suddenly drag a node.
export function useNodeEditorPointers(options) {
  const callbacks = useRef(options);
  useLayoutEffect(() => { callbacks.current = options; });
  const session = useRef({ pointers: new Map(), mode: 'idle', timer: null, penUntil: 0 });

  const clearHold = () => {
    clearTimeout(session.current.timer);
    session.current.timer = null;
  };
  const cancel = () => {
    const state = session.current;
    clearHold();
    if (state.mode === 'pair') callbacks.current.onPairEnd?.();
    else if (state.mode === 'single') callbacks.current.onCancel?.();
    state.mode = 'idle';
    const pointers = [...state.pointers.values()];
    state.pointers.clear();
    pointers.forEach(pointer => {
      if (pointer.target?.hasPointerCapture?.(pointer.pointerId)) {
        pointer.target.releasePointerCapture(pointer.pointerId);
      }
    });
  };
  const cancelRef = useRef(cancel);
  useLayoutEffect(() => { cancelRef.current = cancel; });
  useEffect(() => {
    if (!options.enabled) cancelRef.current();
    const stop = () => cancelRef.current();
    const hide = () => { if (document.hidden) stop(); };
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', hide);
    return () => {
      stop();
      window.removeEventListener('blur', stop);
      document.removeEventListener('visibilitychange', hide);
    };
  }, [options.enabled]);

  const copyPointer = (event) => ({
    pointerId: event.pointerId,
    pointerType: event.pointerType || 'mouse',
    clientX: event.clientX,
    clientY: event.clientY,
    target: event.currentTarget,
  });
  const pair = () => session.current.pairIds.map(id => session.current.pointers.get(id));

  const onPointerDown = (event) => {
    if (!callbacks.current.enabled) return;
    if (event.pointerType === 'mouse' && event.button !== 0 && event.button !== 1) return;
    event.preventDefault();
    const state = session.current;
    const type = event.pointerType || 'mouse';
    if (type === 'touch' && (Date.now() < state.penUntil || [...state.pointers.values()].some(p => p.pointerType === 'pen'))) return;
    if (type === 'pen') {
      cancel();
      state.penUntil = Date.now() + 400;
    }
    const pointer = copyPointer(event);
    state.pointers.set(event.pointerId, pointer);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (state.mode === 'blocked' || state.mode === 'pair') return;
    const touches = [...state.pointers.values()].filter(p => p.pointerType === 'touch');
    if (touches.length === 2) {
      clearHold();
      if (state.mode === 'single') flushSync(() => callbacks.current.onCancel?.());
      state.mode = 'pair';
      state.pairIds = touches.map(p => p.pointerId);
      callbacks.current.onPairStart?.(pair());
      return;
    }
    if (state.pointers.size !== 1) return;
    if (type === 'touch' && callbacks.current.pencilOnly) return;
    state.mode = 'single';
    state.primaryId = event.pointerId;
    state.start = pointer;
    state.moved = false;
    callbacks.current.onStart?.(event);
    if (type !== 'mouse' && callbacks.current.canHold?.()) {
      state.timer = setTimeout(() => {
        state.timer = null;
        if (state.mode !== 'single' || state.moved) return;
        if (callbacks.current.onHold?.(state.start)) state.mode = 'blocked';
      }, 650);
    }
  };

  const onPointerMove = (event) => {
    const state = session.current;
    if (!state.pointers.has(event.pointerId)) {
      // Mouse hover is used when sizing a polygon before committing it.
      if (callbacks.current.enabled && event.pointerType === 'mouse' && state.mode === 'idle') callbacks.current.onHover?.(event);
      return;
    }
    event.preventDefault();
    state.pointers.set(event.pointerId, copyPointer(event));
    if (state.mode === 'pair') {
      callbacks.current.onPairMove?.(pair());
    } else if (state.mode === 'single' && state.primaryId === event.pointerId) {
      const distance = Math.hypot(event.clientX - state.start.clientX, event.clientY - state.start.clientY);
      if (distance >= (event.pointerType === 'touch' ? 6 : 1)) {
        state.moved = true;
        clearHold();
      }
      if (state.moved) callbacks.current.onMove?.(event);
    }
  };

  const finish = (event, cancelled = false) => {
    const state = session.current;
    if (!state.pointers.has(event.pointerId)) return;
    clearHold();
    if (state.mode === 'pair' && state.pairIds.includes(event.pointerId)) {
      if (!cancelled) {
        state.pointers.set(event.pointerId, copyPointer(event));
        flushSync(() => callbacks.current.onPairMove?.(pair()));
      }
      callbacks.current.onPairEnd?.();
      state.mode = 'blocked';
    } else if (state.mode === 'single' && state.primaryId === event.pointerId) {
      if (cancelled) callbacks.current.onCancel?.();
      else {
        if (state.moved) flushSync(() => callbacks.current.onFlush?.(event));
        callbacks.current.onEnd?.(event);
      }
      state.mode = 'blocked';
    }
    state.pointers.delete(event.pointerId);
    if (event.pointerType === 'pen') state.penUntil = Date.now() + 400;
    if (state.pointers.size === 0) state.mode = 'idle';
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: event => finish(event),
    onPointerCancel: event => finish(event, true),
    onLostPointerCapture: event => finish(event, true),
  };
}
