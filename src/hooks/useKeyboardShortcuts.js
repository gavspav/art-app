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
  hotkeyRef,
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

      // H -> toggle controls overlay
      if (key === 'h') {
        e.preventDefault();
        const cur = !!hotkeyRef?.current?.overlayVisible;
        setIsOverlayVisible?.(!cur);
        return;
      }

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

      // [ or ] -> Select previous/next layer
      if (key === '[' || key === ']') {
        e.preventDefault();
        const idx = Number(hotkeyRef?.current?.selectedIndex) || 0;
        const len = Number(hotkeyRef?.current?.layersLen) || 0;
        if (len <= 0) return;
        const next = key === '[' ? Math.max(0, idx - 1) : Math.min(len - 1, idx + 1);
        setSelectedLayerIndex?.(next);
        return;
      }

      // 1..9 -> Select corresponding layer (1-based)
      if (key >= '1' && key <= '9') {
        e.preventDefault();
        const digit = parseInt(key, 10);
        const len = Number(hotkeyRef?.current?.layersLen) || 0;
        const target = Math.max(0, Math.min(len - 1, digit - 1));
        setSelectedLayerIndex?.(target);
        return;
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
    hotkeyRef,
  ]);
}
