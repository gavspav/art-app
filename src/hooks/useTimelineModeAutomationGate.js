import { useEffect, useRef } from 'react';

export function useTimelineModeAutomationGate({
  timelineMode,
  setTimelineVisible,
  audioReactive,
  bpmForAnimation,
  modulationStore,
}) {
  useEffect(() => {
    if (typeof setTimelineVisible !== 'function') return;
    setTimelineVisible(!!timelineMode);
  }, [timelineMode, setTimelineVisible]);

  const automationRestoreRef = useRef({ audioEnabled: null, bpmWasPlaying: null });
  const lastTimelineModeRef = useRef(false);

  useEffect(() => {
    const was = lastTimelineModeRef.current;
    const now = !!timelineMode;
    if (was === now) return;
    lastTimelineModeRef.current = now;

    if (now) {
      automationRestoreRef.current = {
        audioEnabled: !!audioReactive?.settings?.enabled,
        bpmWasPlaying: !!bpmForAnimation?.isPlaying,
      };

      try { bpmForAnimation?.pause?.(); } catch { /* noop */ }
      try { audioReactive?.setAudioEnabled?.(false); } catch { /* noop */ }
      try { audioReactive?.stopAudio?.(); } catch { /* noop */ }
      try { audioReactive?.stopFilePlayback?.(); } catch { /* noop */ }

      try { modulationStore?.clearAllMods?.('bpm'); } catch { /* noop */ }
      try { modulationStore?.clearAllMods?.('audio'); } catch { /* noop */ }
      return;
    }

    const { audioEnabled, bpmWasPlaying } = automationRestoreRef.current || {};
    if (audioEnabled) {
      try { audioReactive?.setAudioEnabled?.(true); } catch { /* noop */ }
    }
    if (bpmWasPlaying) {
      try { bpmForAnimation?.play?.(); } catch { /* noop */ }
    }
  }, [timelineMode, audioReactive, bpmForAnimation, modulationStore]);

  useEffect(() => {
    if (!timelineMode) return;
    if (bpmForAnimation?.isPlaying) {
      try { bpmForAnimation?.pause?.(); } catch { /* noop */ }
    }
    if (audioReactive?.settings?.enabled) {
      try { audioReactive?.setAudioEnabled?.(false); } catch { /* noop */ }
      try { audioReactive?.stopAudio?.(); } catch { /* noop */ }
      try { audioReactive?.stopFilePlayback?.(); } catch { /* noop */ }
    }
  }, [timelineMode, bpmForAnimation?.isPlaying, audioReactive?.settings?.enabled, audioReactive, bpmForAnimation]);

  useEffect(() => {
    if (timelineMode) return;
    if (audioReactive?.settings?.enabled) return;
    try { modulationStore?.clearAllMods?.('audio'); } catch { /* noop */ }
  }, [timelineMode, audioReactive?.settings?.enabled, modulationStore]);
}
