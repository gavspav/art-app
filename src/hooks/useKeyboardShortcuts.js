import { useEffect } from 'react';
import { shouldIgnoreGlobalKey } from '../utils/domUtils.js';

// useKeyboardShortcuts: centralizes global keyboard handling
// Expects stable setters/functions; uses hotkeyRef for dynamic state reads without re-binding
export function useKeyboardShortcuts({
  setIsFrozen,
  toggleFullscreen,
  handleRandomizeAll,
  setIsOverlayVisible,
  setIsNodeEditMode,
  setSelectedLayerIndex,
  setZIgnore,
  setEditTarget,
  clearSelection,
  hotkeyRef,
  setParameterTargetMode,
  setShowLayerOutlines,
  setIsolateMode,
  deleteLayer,
  nodeEditDeleteHandlerRef,
  toggleBPM,
  toggleAudio,
}) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      const key = (e.key || '').toLowerCase();

      // Native controls and editable fields always keep their normal keyboard
      // behaviour. Workspace commands are handled only when focus is on the canvas.
      if (shouldIgnoreGlobalKey(e)) return;
      
      // Use plain "f" only so modified browser/editor commands remain available.
      if (key === 'f' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        toggleFullscreen?.();
        return;
      }
      
      // Spacebar toggles the live procedural animation.
      if (e.code === 'Space') {
        e.preventDefault();
        setIsFrozen?.(prev => !prev);
        return;
      }

      if (key === 'o' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setShowLayerOutlines?.(prev => !prev);
        return;
      }

      if (key === 'g' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        // The streamlined workspace owns this command through the shared
        // registry. Keep the legacy handler for the older workspace shell.
        if (typeof document !== 'undefined' && document.querySelector('.studio-workspace')) return;
        e.preventDefault();
        const cur = (hotkeyRef?.current?.parameterTargetMode === 'global') ? 'global' : 'individual';
        const next = cur === 'global' ? 'individual' : 'global';
        setParameterTargetMode?.(next);
        return;
      }

      if (key === 'i' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        const cur = !!hotkeyRef?.current?.isolateMode;
        try {
          console.debug('[useKeyboardShortcuts] Toggling isolate mode via hotkey', { previous: cur, next: !cur });
        } catch { /* noop */ }
        setIsolateMode?.(!cur);
        return;
      }

      // H previously toggled overlay; handled by BottomPanel now (minimize). No action here.

      // F -> toggle fullscreen (handled above, before shouldIgnoreGlobalKey check)

      // R -> Randomize All
      if (key === 'r' && !e.shiftKey) {
        e.preventDefault();
        handleRandomizeAll?.();
        return;
      }


      // N -> Toggle Node Edit mode
      if (key === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        const cur = !!hotkeyRef?.current?.nodeEditMode;
        setIsNodeEditMode?.(!cur);
        return;
      }

      // Z -> Toggle Z-Ignore (disable Z scaling movement)
      if (key === 'z' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        const cur = !!hotkeyRef?.current?.zIgnore;
        setZIgnore?.(!cur);
        return;
      }

      // B -> Toggle BPM play/pause
      if (key === 'b' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        toggleBPM?.();
        return;
      }

      // A -> Toggle Audio on/off (non-shift)
      if (key === 'a' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        toggleAudio?.();
        return;
      }

      if (key === 'delete' || key === 'backspace') {
        const nodeMode = !!hotkeyRef?.current?.nodeEditMode;
        const len = Number(hotkeyRef?.current?.layersLen) || 0;
        if (nodeMode) {
          if (nodeEditDeleteHandlerRef?.current?.()) {
            e.preventDefault();
            return;
          }
        }
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

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [
    setIsFrozen,
    toggleFullscreen,
    handleRandomizeAll,
    setIsOverlayVisible,
    setIsNodeEditMode,
    setSelectedLayerIndex,
    setZIgnore,
    setEditTarget,
    clearSelection,
    hotkeyRef,
    setParameterTargetMode,
    setShowLayerOutlines,
    setIsolateMode,
    deleteLayer,
    nodeEditDeleteHandlerRef,
    toggleBPM,
    toggleAudio,
  ]);
}
