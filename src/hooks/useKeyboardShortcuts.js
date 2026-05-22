import { useEffect } from 'react';
import { shouldIgnoreGlobalKey } from '../utils/domUtils.js';
import { ARCADE_KEYBOARD_MIDI_CODES } from '../context/MidiContext.jsx';

const ARCADE_KEYBOARD_MIDI_CODE_SET = new Set(ARCADE_KEYBOARD_MIDI_CODES);

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
  saveQuickPresetToMemory,
  recallQuickPresetFromMemory,
  toggleBPM,
  toggleAudio,
  // Timeline controls
  toggleTimeline,
  toggleTimelinePlay,
  stopTimeline,
  timelineVisible,
  timelineIsPlaying,
  // Variation keyframe generation
  onGenerateVariationKeyframe,
  onGenerateRandomKeyframes,
  onFillKeyframesBetween,
  // Timeline global track capture
  overwriteSelectedTimelineKeyframe,
  onCaptureGlobalKeyframe,
  arcadeKeyboardMidiEnabled = false,
}) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      const key = (e.key || '').toLowerCase();
      
      // F key for fullscreen should ALWAYS work, even when inputs are focused
      // Use plain "f" only so Shift+F can be used for other actions (e.g. timeline fill)
      if (key === 'f' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        toggleFullscreen?.();
        return;
      }
      
      if (arcadeKeyboardMidiEnabled && !e.metaKey && !e.ctrlKey && !e.altKey && ARCADE_KEYBOARD_MIDI_CODE_SET.has(e.code)) {
        return;
      }

      if (shouldIgnoreGlobalKey(e)) return;
      // Spacebar -> toggle Freeze, and when timeline is visible also toggle timeline play/pause
      if (e.code === 'Space') {
        e.preventDefault();
        if (timelineVisible) {
          const willPlay = !timelineIsPlaying;
          // Keep global freeze in sync with timeline play/pause
          setIsFrozen?.(!willPlay);
          toggleTimelinePlay?.();
        } else {
          setIsFrozen?.(prev => !prev);
        }
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

      if (key === 'i') {
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

      if (!e.metaKey && !e.ctrlKey && !e.altKey && key === 's') {
        e.preventDefault();
        saveQuickPresetToMemory?.();
        return;
      }

      if (!e.metaKey && !e.ctrlKey && key === 'a' && e.shiftKey) {
        e.preventDefault();
        recallQuickPresetFromMemory?.();
        return;
      }

      // R -> Randomize All
      if (key === 'r' && !e.shiftKey) {
        e.preventDefault();
        handleRandomizeAll?.();
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

      // B -> Toggle BPM play/pause
      if (key === 'b') {
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

      // T -> Toggle Timeline visibility
      if (key === 't' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        toggleTimeline?.();
        return;
      }

      // P -> Toggle Timeline play/pause (when timeline is visible)
      if (key === 'p' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        const willPlay = !timelineIsPlaying;
        setIsFrozen?.(!willPlay);
        toggleTimelinePlay?.();
        return;
      }

      // Home -> Stop timeline and go to start
      if (key === 'home') {
        e.preventDefault();
        stopTimeline?.();
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

      // Shift+V -> Generate variation keyframe at current position (when timeline visible)
      if (e.shiftKey && key === 'v' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        onGenerateVariationKeyframe?.();
        return;
      }

      // Shift+R -> Generate random keyframes on active track (when timeline visible)
      if (e.shiftKey && key === 'r' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        onGenerateRandomKeyframes?.();
        return;
      }

      // Shift+F -> Fill keyframes between two selected keyframes (when timeline visible)
      if (e.shiftKey && key === 'f' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        onFillKeyframesBetween?.();
        return;
      }

      // Shift+C -> Capture current layers to global shape track (when present)
      if (e.shiftKey && key === 'c' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        if (overwriteSelectedTimelineKeyframe?.()) {
          return;
        }
        onCaptureGlobalKeyframe?.();
        return;
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
    saveQuickPresetToMemory,
    recallQuickPresetFromMemory,
    toggleBPM,
    toggleAudio,
    toggleTimeline,
    toggleTimelinePlay,
    stopTimeline,
    timelineVisible,
    timelineIsPlaying,
    onGenerateVariationKeyframe,
    onGenerateRandomKeyframes,
    onFillKeyframesBetween,
    overwriteSelectedTimelineKeyframe,
    onCaptureGlobalKeyframe,
    arcadeKeyboardMidiEnabled,
  ]);
}
