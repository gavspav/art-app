import { useEffect } from 'react';

// useKeyboardShortcuts: centralizes global keyboard handling
// Expects stable setters/functions; uses hotkeyRef for dynamic state reads without re-binding
export function useKeyboardShortcuts({
  setIsFrozen,
  toggleFullscreen,
  handleRandomizeAll,
  setShowGlobalMidi,
  setIsOverlayVisible,
  setIsNodeEditMode,
  setSelectedLayerIndex,
  setZIgnore,
  setEditTarget,
  clearSelection,
  hotkeyRef,
  setParameterTargetMode,
  setShowLayerOutlines,
  deleteLayer,
}) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore when focus is on inputs, selects, textareas, or contenteditable
      const tag = (e.target?.tagName || '').toLowerCase();
      const isTypingTarget = tag === 'input' || tag === 'select' || tag === 'textarea' || (e.target?.isContentEditable === true);
      if (isTypingTarget) return;

      const key = (e.key || '').toLowerCase();
      // Spacebar -> toggle Freeze
      if (e.code === 'Space') {
        e.preventDefault();
        setIsFrozen?.(prev => !prev);
        return;
      }

      if (key === 'o') {
        e.preventDefault();
        setShowLayerOutlines?.(prev => !prev);
        return;
      }

      if (key === 'g') {
        e.preventDefault();
        const cur = (hotkeyRef?.current?.parameterTargetMode === 'global') ? 'global' : 'individual';
        const next = cur === 'global' ? 'individual' : 'global';
        setParameterTargetMode?.(next);
        return;
      }

      // H previously toggled overlay; handled by BottomPanel now (minimize). No action here.

      // F -> toggle fullscreen
      if (key === 'f') {
        e.preventDefault();
        toggleFullscreen?.();
        return;
      }

      // R -> Randomize All
      if (key === 'r') {
        e.preventDefault();
        handleRandomizeAll?.();
        return;
      }

      // M -> Toggle MIDI Learn visibility (global controls section)
      if (key === 'm') {
        e.preventDefault();
        setShowGlobalMidi?.(v => !v);
        return;
      }

      // N -> Toggle Node Edit mode
      if (key === 'n') {
        e.preventDefault();
        const cur = !!hotkeyRef?.current?.nodeEditMode;
        setIsNodeEditMode?.(!cur);
        return;
      }

      // Z -> Toggle Z-Ignore (disable Z scaling movement)
      if (key === 'z') {
        e.preventDefault();
        const cur = !!hotkeyRef?.current?.zIgnore;
        setZIgnore?.(!cur);
        return;
      }

      if (key === 'delete' || key === 'backspace') {
        const nodeMode = !!hotkeyRef?.current?.nodeEditMode;
        const len = Number(hotkeyRef?.current?.layersLen) || 0;
        if (nodeMode && len > 1) {
          e.preventDefault();
          const idx = Math.max(0, Math.min(len - 1, Number(hotkeyRef?.current?.selectedIndex) || 0));
          deleteLayer?.(idx);
        }
        return;
      }

      // [ or ] -> Select previous/next layer
      if (key === '[' || key === ']') {
        e.preventDefault();
        const idx = Number(hotkeyRef?.current?.selectedIndex) || 0;
        const len = Number(hotkeyRef?.current?.layersLen) || 0;
        if (len <= 0) return;
        const next = key === '[' ? Math.max(0, idx - 1) : Math.min(len - 1, idx + 1);
        clearSelection?.();
        setEditTarget?.({ type: 'single' });
        setSelectedLayerIndex?.(next);
        return;
      }

      // Shift+1..9 -> Select corresponding layer (1-based)
      // Use e.code (Digit1..Digit9) so Shift doesn't turn '1' into '!'
      if (e.shiftKey && typeof e.code === 'string' && e.code.startsWith('Digit')) {
        const digit = parseInt(e.code.replace('Digit', ''), 10);
        if (Number.isFinite(digit) && digit >= 1 && digit <= 9) {
          e.preventDefault();
          const len = Number(hotkeyRef?.current?.layersLen) || 0;
          const target = Math.max(0, Math.min(len - 1, digit - 1));
          clearSelection?.();
          setEditTarget?.({ type: 'single' });
          setSelectedLayerIndex?.(target);
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    setIsFrozen,
    toggleFullscreen,
    handleRandomizeAll,
    setShowGlobalMidi,
    setIsOverlayVisible,
    setIsNodeEditMode,
    setSelectedLayerIndex,
    setZIgnore,
    setEditTarget,
    clearSelection,
    hotkeyRef,
    setParameterTargetMode,
    setShowLayerOutlines,
    deleteLayer,
  ]);
}
