import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useParameters } from './context/ParameterContext.jsx';
import { useAppState } from './context/AppStateContext.jsx';
import { useMidi } from './context/MidiContext.jsx';
import { useAudioReactive } from './context/AudioContext.jsx';
import { useBPM } from './context/BPMContext.jsx';
import { useTimeline } from './context/TimelineContext.jsx';
import { palettes } from './constants/palettes';
import { blendModes } from './constants/blendModes';
import { DEFAULTS, DEFAULT_LAYER } from './constants/defaults';
import { importSVGFiles } from './utils/svgImportEnhanced';
import { useFullscreen } from './hooks/useFullscreen';
import { useAnimation } from './hooks/useAnimation.js';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js';
import { useMIDIHandlers } from './hooks/useMIDIHandlers.js';
import { useAudioHandlers } from './hooks/useAudioHandlers.js';
import { useAudioLayerHandlers } from './hooks/useAudioLayerHandlers.js';
import { useAudioSpawnLayers } from './hooks/useAudioSpawnLayers.js';
import { useBPMHandlers } from './hooks/useBPMHandlers.js';
import { useBPMLayerHandlers } from './hooks/useBPMLayerHandlers.js';
import { useModulationStore } from './hooks/useModulationStore.js';
import { useImportAdjust } from './hooks/useImportAdjust.js';
import { useLayerManagement } from './hooks/useLayerManagement.js';
import { useRandomization } from './hooks/useRandomization.js';
import { useAutosave } from './hooks/useAutosave.js';
import './App.css';
import { sampleColorsEven as sampleColorsEvenUtil, distributeColorsAcrossLayers as distributeColorsAcrossLayersUtil, pickPaletteColors } from './utils/paletteUtils.js';
import { buildVariedLayerFrom as buildVariedLayerFromUtil } from './utils/layerVariation.js';
import { shouldIgnoreGlobalKey } from './utils/domUtils.js';
import { createCustomPaletteEntry, loadCustomPalettes, mergeCustomPalettes, saveCustomPalettes } from './utils/customPalettes.js';
import { createSeededRandom } from './utils/randomUtils.js';
import KeyboardShortcutsOverlay from './components/global/KeyboardShortcutsOverlay.jsx';
import AppProviders from './components/app/AppProviders.jsx';
import WorkspaceRouter from './components/workspaces/WorkspaceRouter.jsx';
import { useTimelineModulation } from './hooks/useTimelineModulation.js';
// LayerList removed; layer management moved to Controls header
// Settings page not used; quick export/import handled inline

const pickBestRecorderMime = () => {
  if (typeof MediaRecorder === 'undefined') {
    return 'video/webm';
  }
  const candidates = [
    'video/mp4;codecs=h264',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  for (const candidate of candidates) {
    try {
      if (!MediaRecorder.isTypeSupported || MediaRecorder.isTypeSupported(candidate)) {
        return candidate;
      }
    } catch {
      /* noop */
    }
  }
  return 'video/webm';
};

const DEFAULT_INCLUDE_RND = Object.freeze({
  backgroundColor: true,
  globalSpeedMultiplier: true,
  globalBlendMode: true,
  globalOpacity: true,
  globalPaletteIndex: true,
  layersCount: true,
  rotation: true,
  // Split variation include flags
  variationPosition: true,
  variationShape: true,
  variationAnim: true,
  variationColor: true,
  variationScale: true,
  // legacy key kept for backward compat with saved states; not used by new UI
  variation: true,
});

// The MainApp component now contains all the core application logic
const MainApp = () => {
  const parametersCtx = useParameters();
  const { parameters, applyParametersSnapshot } = parametersCtx;
  const layersCountParam = useMemo(
    () => parameters?.find?.((param) => param.id === 'layersCount'),
    [parameters],
  );
  // Get app state from context
  const appStateCtx = useAppState();
  const {
    isFrozen, setIsFrozen,
	    enableBreathing, setEnableBreathing,
	    enableEnergyScaling,
	    energyInfluence,
	    setEnergyInfluence,
	    audioSpawnEnabled,
	    audioSpawnTriggerMode,
	    audioSpawnRepeatWhileAbove,
	    audioSpawnHysteresis,
	    audioSpawnUseGlobalPalette,
	    audioSpawnBand,
	    audioSpawnThreshold,
	    audioSpawnCooldownMs,
	    audioSpawnHalfLifeMs,
	    audioSpawnHalfLifeEnergyFactor,
	    audioSpawnMaxLayers,
	    audioSpawnPresetActive,
	    audioSpawnMicReactive,
	    milkdropInfluence,
	    milkdropFeedbackEnabled,
	    setAudioSpawnEnabled,
	    setAudioSpawnPresetActive,
	    setAudioSpawnTriggerMode,
	    setAudioSpawnRepeatWhileAbove,
	    setAudioSpawnHysteresis,
	    setAudioSpawnUseGlobalPalette,
	    setAudioSpawnBand,
	    setAudioSpawnThreshold,
	    setAudioSpawnCooldownMs,
	    setAudioSpawnHalfLifeMs,
	    setAudioSpawnHalfLifeEnergyFactor,
	    setAudioSpawnMaxLayers,
	    setAudioSpawnMicReactive,
	    setMilkdropInfluence,
	    setMilkdropFeedbackEnabled,
	    backgroundColor, setBackgroundColor,
	    backgroundImage, setBackgroundImage,
	    globalSeed, setGlobalSeed,
    globalSpeedMultiplier, setGlobalSpeedMultiplier,
    globalBlendMode, setGlobalBlendMode,
    layers, setLayers,
    selectedLayerIndex, setSelectedLayerIndex,
    isOverlayVisible, setIsOverlayVisible,
    isNodeEditMode, setIsNodeEditMode,
    classicMode, setClassicMode,
	    zIgnore, setZIgnore,
	    // Color randomization toggles
      randomizePalette, setRandomizePalette,
      randomizeNumColors, setRandomizeNumColors,
      globalPaletteIndex,
      setGlobalPaletteIndex,
      globalPaletteRef,
      setGlobalPaletteRef,
      randomizeColorsPerLayer,
	    setRandomizeColorsPerLayer,
	    uniformColorCount,
	    setUniformColorCount,
    syncLayerColorsToFirst, setSyncLayerColorsToFirst,
    parameterTargetMode, setParameterTargetMode,
    // Global: fade while frozen
    colorFadeWhileFrozen, setColorFadeWhileFrozen,
    showLayerOutlines, setShowLayerOutlines,
    isolateMode, setIsolateMode,
    getActiveTargetLayerIds,
    clearSelection,
    setEditTarget,
    // Group and selection state
    editTarget,
    layerGroups,
    selectedLayerIds,
    toggleLayerSelection,
    quickPreset,
    setQuickPresetSnapshot,
    getCurrentAppState,
    loadAppState,
    isDirty,
    setIsDirty,
    lastSavedAt,
    setLastSavedAt,
    // Preset/morph state for GlobalControls
    presetSlots,
    getPresetSlot,
    morphEnabled,
    morphRoute,
    morphDurationPerLeg,
    morphEasing,
    morphLoopMode,
    setMorphEnabled,
    setMorphRoute,
    setMorphDurationPerLeg,
    setMorphEasing,
    setMorphLoopMode,
    morphMode,
    setMorphMode,
    morphNodes,
    applyVariationInstantly,
    setApplyVariationInstantly,
  } = appStateCtx;

  // MIDI context
  const {
    mappings: midiMappings,
    setMappingsFromExternal,
    registerParamHandler,
  } = useMidi() || {};

  // Timeline context (must be initialized before hooks that capture it, e.g., startRecording)
  const timelineContext = useTimeline();
  const timelineContextRef = useRef(timelineContext);
  useEffect(() => { timelineContextRef.current = timelineContext; }, [timelineContext]);

  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const includeRndRef = useRef(DEFAULT_INCLUDE_RND);
  const colorRandomCallRef = useRef(0);
  const configFileInputRef = React.useRef(null);
  const svgFileInputRef = React.useRef(null);
  // Shape track updates ref - shared between useTimelineModulation and useAnimation
  const shapeTrackUpdatesRef = useRef(new Map());
  const variationBaseRef = useRef(new Map());
  // Removed Global Colours UI
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(containerRef);
  const [isRecording, setIsRecording] = useState(false);
  const [suppressEphemeralOverlays, setSuppressEphemeralOverlays] = useState(false);
  const recorderRef = useRef({ mediaRecorder: null, stream: null });
  const recordedChunksRef = useRef([]);
  const latestRecordingNameRef = useRef('art-recording');

  const cleanupRecorder = useCallback(() => {
    try {
      const { stream } = recorderRef.current || {};
      if (stream) {
        stream.getTracks()?.forEach(track => {
          try { track.stop(); } catch { /* noop */ }
        });
      }
    } catch { /* noop */ }
	    recorderRef.current = { mediaRecorder: null, stream: null };
	    recordedChunksRef.current = [];
	    setIsRecording(false);
	    setSuppressEphemeralOverlays(false);
	  }, []);

	  const startRecording = useCallback(async () => {
	    if (isRecording) {
	      return;
	    }

	    // Exclude ephemeral overlays from the captured canvas stream.
	    const wasSuppressing = suppressEphemeralOverlays;
	    if (!wasSuppressing) {
	      setSuppressEphemeralOverlays(true);
	    }
	    await new Promise(resolve => requestAnimationFrame(resolve));

	    // Resolve the underlying canvas element (forwardRef exposes a handle with .canvas)
	    let canvasHandle = canvasRef.current;
	    let canvasEl = canvasHandle?.canvas || canvasHandle;

    // If the canvas has not been sized yet (0x0), wait one frame for layout to settle
    if (canvasEl && (!canvasEl.width || !canvasEl.height)) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      canvasHandle = canvasRef.current || canvasHandle;
      canvasEl = canvasHandle?.canvas || canvasHandle;
    }

	    if (!canvasEl || typeof canvasEl.captureStream !== 'function') {
	      window.alert('Recording is not supported in this browser (missing canvas.captureStream).');
	      if (!wasSuppressing) setSuppressEphemeralOverlays(false);
	      return;
	    }

    // Final safety: avoid recording from a 0x0 canvas, which would produce a blank video
	    if (!canvasEl.width || !canvasEl.height) {
	      console.warn('Recording aborted: canvas has zero size', { width: canvasEl.width, height: canvasEl.height });
	      window.alert('Unable to start recording: canvas is not visible or has zero size.');
	      if (!wasSuppressing) setSuppressEphemeralOverlays(false);
	      return;
	    }

    let videoStream;
    try {
      // Let the browser pick an appropriate frame rate; 60 can be too aggressive on some setups
      videoStream = canvasEl.captureStream();
	    } catch (error) {
	      console.warn('Failed to capture canvas stream', error);
	      window.alert('Unable to start recording: canvas capture stream failed.');
	      if (!wasSuppressing) setSuppressEphemeralOverlays(false);
	      return;
	    }

	    if (!videoStream) {
	      window.alert('Unable to start recording: no stream produced.');
	      if (!wasSuppressing) setSuppressEphemeralOverlays(false);
	      return;
	    }

    // Try to get audio stream from timeline (if audio is loaded and playing)
    let combinedStream = videoStream;
    const audioStream = timelineContext?.getAudioStream?.();
    if (audioStream && audioStream.getAudioTracks().length > 0) {
      try {
        // Combine video and audio tracks into a single stream
        const videoTracks = videoStream.getVideoTracks();
        const audioTracks = audioStream.getAudioTracks();
        combinedStream = new MediaStream([...videoTracks, ...audioTracks]);
        console.log('Recording with audio: video tracks:', videoTracks.length, 'audio tracks:', audioTracks.length);
      } catch (error) {
        console.warn('Failed to combine audio stream, recording video only:', error);
        combinedStream = videoStream;
      }
    } else {
      console.log('Recording video only (no usable timeline audio stream available)');
    }

    const preferredMime = pickBestRecorderMime();
    const options = { mimeType: preferredMime, videoBitsPerSecond: 20_000_000, audioBitsPerSecond: 128_000 };
    let mediaRecorder;
    try {
      mediaRecorder = new MediaRecorder(combinedStream, options);
    } catch (error) {
      console.warn('Failed to create MediaRecorder with options', options, error);
	      try {
	        mediaRecorder = new MediaRecorder(combinedStream);
	      } catch (fallbackError) {
	        console.warn('Failed to create MediaRecorder without options', fallbackError);
	        window.alert('Unable to start recording: MediaRecorder could not be initialized.');
	        combinedStream.getTracks()?.forEach(track => { try { track.stop(); } catch { /* noop */ }; });
	        if (!wasSuppressing) setSuppressEphemeralOverlays(false);
	        return;
	      }
	    }

    recordedChunksRef.current = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event?.data && event.data.size > 0) {
        recordedChunksRef.current.push(event.data);
      }
    };

    mediaRecorder.onerror = (event) => {
      console.warn('MediaRecorder error', event?.error || event);
      window.alert('Recording encountered an error. Stopping recording.');
      try { mediaRecorder.stop(); } catch { /* noop */ }
    };

    mediaRecorder.onstop = () => {
      try {
        const chunks = recordedChunksRef.current;
        if (!chunks.length) {
          window.alert('Recording stopped but produced no data.');
          return;
        }
        const finalMime = mediaRecorder.mimeType || preferredMime || 'video/webm';
        const blob = new Blob(chunks, { type: finalMime });
        const nameInput = window.prompt('Save recording as (no extension needed):', latestRecordingNameRef.current || 'art-recording');
        const baseNameRaw = (nameInput || latestRecordingNameRef.current || 'art-recording').trim();
        const baseName = baseNameRaw.length ? baseNameRaw : 'art-recording';
        latestRecordingNameRef.current = baseName;
        const safeName = baseName.replace(/[^a-z0-9-_]+/gi, '-');
        const fileExtension = finalMime.toLowerCase().includes('mp4') ? 'mp4' : 'webm';
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${safeName}.${fileExtension}`;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      } catch (error) {
        console.warn('Failed to export recording', error);
        window.alert('Recording stopped but exporting failed. Check console for details.');
      } finally {
        combinedStream.getTracks()?.forEach(track => { try { track.stop(); } catch { /* noop */ }; });
        cleanupRecorder();
      }
    };

    recorderRef.current = { mediaRecorder, stream: combinedStream };

	    try {
	      mediaRecorder.start(1000);
	    } catch (error) {
	      console.warn('MediaRecorder.start failed', error);
	      window.alert('Unable to start recording: MediaRecorder start failed.');
	      combinedStream.getTracks()?.forEach(track => { try { track.stop(); } catch { /* noop */ }; });
	      cleanupRecorder();
	      if (!wasSuppressing) setSuppressEphemeralOverlays(false);
	      return;
	    }

	    setIsRecording(true);
	  }, [cleanupRecorder, isRecording, suppressEphemeralOverlays, timelineContext]);

  const stopRecording = useCallback(() => {
    const { mediaRecorder } = recorderRef.current || {};
    if (!mediaRecorder) {
      cleanupRecorder();
      return;
    }
    if (mediaRecorder.state !== 'inactive') {
      try {
        mediaRecorder.stop();
      } catch (err) {
        console.warn('MediaRecorder.stop failed', err);
        window.alert('Unable to stop recording cleanly; discarding capture.');
        cleanupRecorder();
      }
    } else {
      cleanupRecorder();
    }
  }, [cleanupRecorder]);

  const toggleParameterTargetMode = useCallback(() => {
    const next = parameterTargetMode === 'global' ? 'individual' : 'global';
    setParameterTargetMode(next);
  }, [parameterTargetMode, setParameterTargetMode]);

  // Keyboard Shortcuts overlay
  const [showShortcuts, setShowShortcuts] = useState(false);
  
  // Panel layout sizes (persisted to localStorage)
  const [leftPanelRatio, setLeftPanelRatio] = useState(() => {
    try {
      const saved = localStorage.getItem('artapp-left-panel-ratio');
      const parsed = saved ? parseFloat(saved) : 0.25;
      return Number.isFinite(parsed) ? Math.min(0.5, Math.max(0.15, parsed)) : 0.25;
    } catch { return 0.25; }
  });
  const [topPanelRatio, setTopPanelRatio] = useState(() => {
    try {
      const saved = localStorage.getItem('artapp-top-panel-ratio');
      const parsed = saved ? parseFloat(saved) : 0.5;
      return Number.isFinite(parsed) ? Math.min(0.8, Math.max(0.2, parsed)) : 0.5;
    } catch { return 0.5; }
  });
  const TOP_BAR_HEIGHT = 0;
  const availableHeightExpr = `calc(100vh - ${TOP_BAR_HEIGHT}px)`; // exclude fixed top bar
  const topPanelHeightExpr = `calc(${availableHeightExpr} * ${topPanelRatio})`;
  const timelineHeightExpr = `calc(${availableHeightExpr} * ${1 - topPanelRatio})`;
  
  // Persist panel ratios
  useEffect(() => {
    try { localStorage.setItem('artapp-left-panel-ratio', String(leftPanelRatio)); } catch { /* noop */ }
  }, [leftPanelRatio]);
  useEffect(() => {
    try { localStorage.setItem('artapp-top-panel-ratio', String(topPanelRatio)); } catch { /* noop */ }
  }, [topPanelRatio]);
  // Keep latest values accessible to hotkeys without re-binding listeners
  const hotkeyRef = useRef({ selectedIndex: 0, layersLen: 0, overlayVisible: true, nodeEditMode: false, isolateMode: false });
  useEffect(() => {
    hotkeyRef.current = {
      selectedIndex: Math.max(0, Math.min(selectedLayerIndex, Math.max(0, layers.length - 1))),
      layersLen: Array.isArray(layers) ? layers.length : 0,
      overlayVisible: !!isOverlayVisible,
      nodeEditMode: !!isNodeEditMode,
      zIgnore: !!zIgnore,
      parameterTargetMode,
      showLayerOutlines: !!showLayerOutlines,
      isolateMode: !!isolateMode,
    };
  }, [selectedLayerIndex, layers, isOverlayVisible, isNodeEditMode, zIgnore, parameterTargetMode, showLayerOutlines, isolateMode]);

  const layersRef = useRef(layers);
  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);

  // Animated layers are produced by useAnimation without touching React state (prevents UI re-render thrash).
  const animatedLayersRef = useRef(layers);
  // Throttled snapshot of layers for UI (avoid re-rendering Global tab every animation frame)
  const [uiLayers, setUiLayers] = useState(layers);
  const lastUiLayersUpdateRef = useRef(0);
  useEffect(() => {
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (now - lastUiLayersUpdateRef.current > 120) {
      lastUiLayersUpdateRef.current = now;
      setUiLayers(layers);
    }
  }, [layers]);
  const selectedLayerIndexRef = useRef(selectedLayerIndex);
  useEffect(() => {
    selectedLayerIndexRef.current = selectedLayerIndex;
  }, [selectedLayerIndex]);

  // Suppress animation briefly during direct user edits to avoid state races
  const [, setSuppressAnimation] = useState(false);
  const suppressTimerRef = useRef(null);

  // Cleanup any pending suppression timer on unmount
  useEffect(() => {
    return () => {
      try {
        if (suppressTimerRef.current) {
          clearTimeout(suppressTimerRef.current);
          suppressTimerRef.current = null;
        }
      } catch { /* noop */ }
    };
  }, []);

  useEffect(() => {
    return () => {
      try {
        const { mediaRecorder } = recorderRef.current || {};
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
          mediaRecorder.stop();
        }
      } catch { /* noop */ }
      cleanupRecorder();
    };
  }, [cleanupRecorder]);

  // Global key handler for toggling shortcuts overlay
  useEffect(() => {
    const onKey = (e) => {
      if (shouldIgnoreGlobalKey(e)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return; // allow Shift-k as well
      const key = (e.key || '').toLowerCase();
      if (key === 'k') {
        e.preventDefault();
        setShowShortcuts(s => !s);
      }
      if (key === 'escape' && showShortcuts) {
        setShowShortcuts(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showShortcuts]);

  // Sidebar resize handlers
  // --- Import adjust panel state (moved to hook) ---
  const {
    showImportAdjust, setShowImportAdjust,
    importAdjust, setImportAdjust,
    importFitEnabled, setImportFitEnabled,
    importDebug, setImportDebug,
    importBaseRef, importRawRef,
    applyImportAdjust,
  } = useImportAdjust({ setLayers });

  // Audio reactive context (for useAudioHandlers)
  const audioReactive = useAudioReactive();
  const { getAudioSnapshot, applyAudioSnapshot } = audioReactive || {};
  
  // BPM context
  const bpmForAnimation = useBPM();
  const { getBPMSnapshot, applyBPMSnapshot } = bpmForAnimation || {};

  // Timeline context helpers
  const {
    getTimelineSnapshot,
    applyTimelineSnapshot,
    visible: timelineVisible,
    setVisible: setTimelineVisible,
    isPlaying: timelineIsPlaying,
    positionSeconds: timelinePositionSeconds,
    startPreset: timelineStartPreset,
  } = timelineContext || {};

  // Modulation store - centralizes Audio/BPM/Timeline modulations so they can be applied
  // in a single setLayers call per frame (instead of multiple calls causing UI clogging)
  const modulationStore = useModulationStore();

  const { timelineMode, setTimelineMode } = appStateCtx;

  // Helper to evenly sample colors from a palette to a desired count (with repeats allowed)
  // Memoized to provide a stable function identity to child components/hooks
  const sampleColorsEven = useCallback((base = [], count = 0) => sampleColorsEvenUtil(base, count), []);

  const [customPalettes, setCustomPalettes] = useState(() => loadCustomPalettes());
  useEffect(() => {
    saveCustomPalettes(customPalettes);
  }, [customPalettes]);

  const addCustomPalette = useCallback(({ name, colors }) => {
    const entry = createCustomPaletteEntry({ name, colors });
    if (!entry) return null;
    setCustomPalettes(prev => [...prev, entry]);
    return entry;
  }, []);

  const mergeCustomPaletteList = useCallback((incoming) => {
    if (!incoming) return;
    setCustomPalettes(prev => mergeCustomPalettes(prev, incoming));
  }, []);

  const palettesWithCustom = useMemo(() => {
    const builtinList = Array.isArray(palettes) ? palettes : [];
    const builtins = builtinList.map((p, idx) => ({ ...p, __source: 'builtin', __index: idx }));
    const customs = (Array.isArray(customPalettes) ? customPalettes : []).map(p => ({ ...p, __source: 'custom' }));
    return [...builtins, ...customs];
  }, [customPalettes]);

  const generationPaletteColors = useMemo(() => {
    try {
      const snapshot = Array.isArray(layersRef?.current) ? layersRef.current : (Array.isArray(layers) ? layers : []);
      if (!snapshot.length) return [];

      if (globalPaletteIndex === 'custom' && typeof globalPaletteRef === 'string') {
        const pick = (Array.isArray(customPalettes) ? customPalettes : []).find(p => p?.id === globalPaletteRef);
        if (pick && Array.isArray(pick.colors) && pick.colors.length) {
          return pick.colors.filter(c => typeof c === 'string' && c.length > 0);
        }
      }

      const idx = (globalPaletteIndex === 'custom') ? null : Number(globalPaletteIndex);
      if (Number.isFinite(idx) && idx != null && (palettes || [])[idx]) {
        const pick = (palettes || [])[idx];
        const src = Array.isArray(pick) ? pick : (pick?.colors || []);
        return (Array.isArray(src) ? src : []).filter(c => typeof c === 'string' && c.length > 0);
      }

      const out = [];
      const seen = new Set();
      snapshot.forEach(l => {
        (Array.isArray(l?.colors) ? l.colors : []).forEach(c => {
          if (typeof c !== 'string' || !c) return;
          const k = c.toLowerCase();
          if (seen.has(k)) return;
          seen.add(k);
          out.push(c);
        });
      });
      return out;
    } catch {
      return [];
    }
  }, [layers, layersRef, globalPaletteIndex, globalPaletteRef, customPalettes]);


	  const {
	    overlayLayersRef: audioSpawnOverlayLayersRef,
	    triggerAudioSpawn,
	  } = useAudioSpawnLayers({
	    enabled: !!audioSpawnEnabled && !timelineMode,
	    paused: !!suppressEphemeralOverlays || !!isRecording,
      zIgnore: !!zIgnore,
      getIsRnd: (id) => !!includeRndRef.current?.[id],
	    layers,
	    selectedLayerIndex,
	    energyInfluence,
	    useGlobalPalette: !!audioSpawnUseGlobalPalette,
	    paletteColors: generationPaletteColors,
	    triggerMode: audioSpawnTriggerMode,
	    band: audioSpawnBand,
	    threshold: audioSpawnThreshold,
	    cooldownMs: audioSpawnCooldownMs,
	    halfLifeMs: audioSpawnHalfLifeMs,
	    halfLifeEnergyFactor: audioSpawnHalfLifeEnergyFactor,
	    maxLayers: audioSpawnMaxLayers,
	    repeatWhileAbove: audioSpawnRepeatWhileAbove,
	    hysteresis: audioSpawnHysteresis,
	    micReactive: audioSpawnMicReactive,
	    milkdropInfluence,
	  });

  // Two-mode switch: keep timeline panel visibility in sync with the chosen authority.
  useEffect(() => {
    if (typeof setTimelineVisible !== 'function') return;
    setTimelineVisible(!!timelineMode);
  }, [timelineMode, setTimelineVisible]);

  // When Timeline mode is active, disable competing automation sources (BPM + Audio),
  // and restore previous runtime state when switching back to Free mode.
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

    // Restoring Free mode
    const { audioEnabled, bpmWasPlaying } = automationRestoreRef.current || {};
    if (audioEnabled) {
      try { audioReactive?.setAudioEnabled?.(true); } catch { /* noop */ }
    }
    if (bpmWasPlaying) {
      try { bpmForAnimation?.play?.(); } catch { /* noop */ }
    }
  }, [timelineMode, audioReactive, bpmForAnimation, modulationStore]);

  // Enforce "Timeline mode disables BPM + Audio" even if the user toggles them on.
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

  // When audio is disabled in Free mode, clear audio mod state so layers don't keep stale values.
  useEffect(() => {
    if (timelineMode) return;
    if (audioReactive?.settings?.enabled) return;
    try { modulationStore?.clearAllMods?.('audio'); } catch { /* noop */ }
  }, [timelineMode, audioReactive?.settings?.enabled, modulationStore]);

  // When timeline playback starts from t=0 and a timeline start preset exists,
  // recall that preset app state before timeline automation is applied.
  const lastTimelinePlayingRef = useRef(false);
  useEffect(() => {
    if (!timelineStartPreset || !timelineStartPreset.appState || !loadAppState) {
      lastTimelinePlayingRef.current = !!timelineIsPlaying;
      return;
    }

    const wasPlaying = lastTimelinePlayingRef.current;
    const nowPlaying = !!timelineIsPlaying;
    const pos = typeof timelinePositionSeconds === 'number' ? timelinePositionSeconds : 0;

    // Rising edge of play while at (or very near) t=0
    if (!wasPlaying && nowPlaying && pos <= 0.001) {
      loadAppState(timelineStartPreset.appState);
    }

    lastTimelinePlayingRef.current = nowPlaying;
  }, [
    timelineIsPlaying,
    timelinePositionSeconds,
    timelineStartPreset,
    loadAppState,
  ]);

  // Wrapper for setIsNodeEditMode that sets context with layer info and timeline position
  // When entering node edit mode, first sync animated positions to React state so Canvas
  // (which switches to using `layers` in node edit mode) shows the correct positions
  const handleSetNodeEditMode = useCallback((value, options = {}) => {
    if (value) {
      // CRITICAL: Sync the currently-rendered (animated) snapshot into React state before entering node edit mode.
      // Canvas uses `layers` (React state) in node edit mode, but `animatedLayersRef` in normal mode.
      // Without this sync, entering node edit mode causes a visual jump (often to a timeline-evaluated shape).
      const animatedLayers = animatedLayersRef.current;
      const requestedIndex = Number.isFinite(options?.selectedIndex) ? Math.floor(options.selectedIndex) : null;
      const selectedIndex = requestedIndex != null
        ? Math.max(0, requestedIndex)
        : (selectedLayerIndexRef.current || 0);
      if (Array.isArray(animatedLayers) && animatedLayers.length > 0) {
        setLayers(prev => {
          if (!Array.isArray(prev)) return prev;
          return prev.map((layer, i) => {
            const animated = animatedLayers[i];
            if (!animated || !animated.position) return layer;
            const next = {
              ...layer,
              position: {
                ...layer.position,
                x: animated.position.x ?? layer.position?.x ?? 0.5,
                y: animated.position.y ?? layer.position?.y ?? 0.5,
                scale: animated.position.scale ?? layer.position?.scale ?? 1,
              },
              // Also sync orbit/spin angles if present
              orbitAngle: animated.orbitAngle ?? layer.orbitAngle,
              spinAngle: animated.spinAngle ?? layer.spinAngle,
            };

            // Also sync the currently-rendered geometry + key shape params for the active layer
            // so entering node edit mode does not snap to a different evaluated timeline shape.
            if (i === selectedIndex) {
              // Geometry (nodes OR subpaths)
              if (Array.isArray(animated.subpaths) && animated.subpaths.length > 0) {
                next.subpaths = JSON.parse(JSON.stringify(animated.subpaths));
                next.nodes = undefined;
              } else if (Array.isArray(animated.nodes) && animated.nodes.length >= 3) {
                next.nodes = animated.nodes.map(n => ({ ...n }));
                next.subpaths = undefined;
                next.syncNodesToNumSides = false;
              }

              // Shape tab params (keep what the user is currently seeing)
              if (typeof animated.numSides !== 'undefined') next.numSides = animated.numSides;
              if (typeof animated.curviness !== 'undefined') next.curviness = animated.curviness;
              if (typeof animated.radiusFactor !== 'undefined') next.radiusFactor = animated.radiusFactor;
              if (typeof animated.radiusFactorX !== 'undefined') next.radiusFactorX = animated.radiusFactorX;
              if (typeof animated.radiusFactorY !== 'undefined') next.radiusFactorY = animated.radiusFactorY;
              if (typeof animated.rotation !== 'undefined') next.rotation = animated.rotation;

              // Offsets + colors (optional but helps prevent visible snapping)
              if (typeof animated.xOffset !== 'undefined') next.xOffset = animated.xOffset;
              if (typeof animated.yOffset !== 'undefined') next.yOffset = animated.yOffset;
              if (Array.isArray(animated.colors)) next.colors = [...animated.colors];
              if (typeof animated.numColors !== 'undefined') next.numColors = animated.numColors;
            }

            return next;
          });
        });
      }

      const layersNow = animatedLayersRef.current || layersRef.current || [];
      const timelineNow = timelineContextRef.current;

      // Entering node edit mode - capture context
      const layer = layersNow[selectedIndex];
      
      // Use getPositionSeconds() if available to get the most up-to-date time from the ref
      // This avoids using stale state which updates less frequently
      const positionSeconds = timelineNow?.getPositionSeconds?.() ?? timelineNow?.positionSeconds ?? 0;
      
      const context = {
        layerId: layer?.id || null,
        layerName: layer?.name || null,
        timelinePosition: positionSeconds,
      };

      setIsNodeEditMode(true, context);
    } else {
      // Exiting node edit mode - clear context
      setIsNodeEditMode(false);
    }
  }, [setIsNodeEditMode, setLayers]);

  // Start animation loop (position, bounce/drift, z-scale)
  // Modulations are now read from the store and applied in a single pass
  // Shape track updates are evaluated directly during playback for frame-accurate interpolation
  useAnimation(null, isFrozen, globalSpeedMultiplier, zIgnore, modulationStore, shapeTrackUpdatesRef, layersRef, animatedLayersRef, timelineContext);

  // Config save/load from contexts
  const {
    /* unused: saveParameters */
    loadParameters,
    /* unused: saveFullConfiguration */
    loadFullConfiguration,
    getSavedConfigList,
  } = parametersCtx;

	  // Randomize All include toggles (Global section) — store locally to control Randomize All behavior
	  const [includeRnd, setIncludeRnd] = useState(() => {
      try {
        const stored = window.localStorage.getItem('artapp-includeRnd');
        if (stored) return { ...DEFAULT_INCLUDE_RND, ...JSON.parse(stored) };
      } catch { /* ignore */ }
      return DEFAULT_INCLUDE_RND;
    });
    useEffect(() => {
      includeRndRef.current = includeRnd;
      try { window.localStorage.setItem('artapp-includeRnd', JSON.stringify(includeRnd)); } catch { /* ignore */ }
    }, [includeRnd]);
	  const getIsRnd = React.useCallback((id) => !!includeRnd[id], [includeRnd]);
	  const setIsRnd = React.useCallback((id, v) => setIncludeRnd(prev => ({ ...prev, [id]: !!v })), []);

  // No local popovers; inline checkboxes next to controls

  // Keep frequently-changing data in refs so handlers stay stable
  const parametersRef = useRef(parameters);
  const midiMappingsRef = useRef(midiMappings);
  useEffect(() => { parametersRef.current = parameters; }, [parameters]);
  useEffect(() => { midiMappingsRef.current = midiMappings; }, [midiMappings]);

  // Download helper for exporting JSON
  const downloadJson = useCallback((filename, obj) => {
    try {
      const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.warn('Failed to export JSON', e);
    }
  }, []);

  // Clamps selection and expose currentLayer for Controls (use throttled UI snapshot)
  // When a group is selected, show the first layer in that group
  const clampedSelectedIndex = Math.max(0, Math.min(selectedLayerIndex, Math.max(0, (layers?.length || 0) - 1)));
  const currentLayer = useMemo(() => {
    const layerSource = (Array.isArray(uiLayers) && uiLayers.length > 0)
      ? uiLayers
      : layers;
    if (!Array.isArray(layerSource) || layerSource.length === 0) return DEFAULT_LAYER;

    // If a group is selected, find the first layer in that group (match by id from snapshot)
    if (editTarget?.type === 'group' && editTarget.groupId) {
      const group = (layerGroups || []).find(g => g.id === editTarget.groupId);
      if (group && Array.isArray(group.memberIds) && group.memberIds.length > 0) {
        const firstLayerId = group.memberIds[0];
        const firstLayer = layerSource.find(l => l?.id === firstLayerId);
        if (firstLayer) return firstLayer;
      }
    }

    // Default: use the selected layer index
    return layerSource[clampedSelectedIndex] || layerSource[0];
  }, [uiLayers, layers, clampedSelectedIndex, editTarget, layerGroups]);

  const baseColors = useMemo(() => (
    Array.isArray(uiLayers?.[0]?.colors) ? uiLayers[0].colors : []
  ), [uiLayers]);

  const baseNumColors = useMemo(() => {
    const first = uiLayers?.[0];
    if (Number.isFinite(first?.numColors)) return first.numColors;
    if (Array.isArray(first?.colors)) return first.colors.length;
    return 1;
  }, [uiLayers]);

  const uiLayerNames = useMemo(() => (
    (Array.isArray(uiLayers) ? uiLayers : []).map((l, i) => l?.name || `Layer ${i + 1}`)
  ), [uiLayers]);

  const getExportMeta = useCallback(() => {
    const handle = canvasRef.current;
    const canvasEl = handle?.canvas || handle || null;
    const globalMeta = (typeof window !== 'undefined' && window.__artapp_canvasMeta) || {};
    let width = canvasEl?.width ?? globalMeta.width ?? (typeof window !== 'undefined' ? window.innerWidth : 0);
    let height = canvasEl?.height ?? globalMeta.height ?? (typeof window !== 'undefined' ? window.innerHeight : 0);
    width = Math.round(Number(width) || 0);
    height = Math.round(Number(height) || 0);
    return {
      version: '2.0',
      canvasWidth: width,
      canvasHeight: height,
      exportedAt: new Date().toISOString(),
    };
  }, []);

  // Wrap getCurrentAppState to persist includeRnd checkboxes alongside app state
  const getFullAppState = useCallback(() => {
    const base = typeof getCurrentAppState === 'function' ? getCurrentAppState() : {};
    return { ...base, includeRnd };
  }, [getCurrentAppState, includeRnd]);

  const getCurrentAppStateRef = useRef(getFullAppState);
  useEffect(() => { getCurrentAppStateRef.current = getFullAppState; }, [getFullAppState]);

  const handleQuickSave = useCallback(() => {
    const baseName = (window.prompt('Enter filename for export (no extension):', 'scene') || '').trim();
    if (!baseName) return;
    const includeState = window.confirm('Include app state (layers, background, animation)?');
    const exportMeta = getExportMeta();
    const payload = {
      parameters: parametersRef.current,
      appState: includeState ? (getCurrentAppStateRef.current ? getCurrentAppStateRef.current() : null) : null,
      customPalettes: Array.isArray(customPalettes) ? customPalettes : [],
      midiMappings: midiMappingsRef.current || {},
      audioConfig: getAudioSnapshot ? getAudioSnapshot() : null,
      bpmConfig: getBPMSnapshot ? getBPMSnapshot() : null,
      timelineConfig: getTimelineSnapshot ? getTimelineSnapshot() : null,
      savedAt: new Date().toISOString(),
      version: '2.2',
      exportMeta,
    };
    downloadJson(`${baseName}.json`, payload);
  }, [downloadJson, getExportMeta, getAudioSnapshot, getBPMSnapshot, getTimelineSnapshot, customPalettes]);

  const handleRamPresetSave = useCallback(() => {
    if (typeof setQuickPresetSnapshot !== 'function') return;
    try {
      const snapshot = {
        parameters: Array.isArray(parameters) ? parameters : [],
        appState: typeof getFullAppState === 'function' ? getFullAppState() : null,
        audioConfig: getAudioSnapshot ? getAudioSnapshot() : null,
        bpmConfig: getBPMSnapshot ? getBPMSnapshot() : null,
        timelineConfig: getTimelineSnapshot ? getTimelineSnapshot() : null,
        exportMeta: getExportMeta(),
        savedAt: new Date().toISOString(),
      };
      setQuickPresetSnapshot(snapshot);
    } catch (error) {
      console.warn('[RAM Preset] Failed to capture snapshot', error);
    }
  }, [getFullAppState, getExportMeta, parameters, setQuickPresetSnapshot, getAudioSnapshot, getBPMSnapshot, getTimelineSnapshot]);

  const handleRamPresetRecall = useCallback(() => {
    if (!quickPreset) {
      console.info('[RAM Preset] No snapshot stored yet');
      return;
    }
    try {
      if (Array.isArray(quickPreset.parameters) && typeof applyParametersSnapshot === 'function') {
        applyParametersSnapshot(quickPreset.parameters);
      }
      if (quickPreset.appState && typeof loadAppState === 'function') {
        loadAppState(quickPreset.appState);
        // Restore randomization include checkboxes
        if (quickPreset.appState.includeRnd && typeof quickPreset.appState.includeRnd === 'object') {
          setIncludeRnd({ ...DEFAULT_INCLUDE_RND, ...quickPreset.appState.includeRnd });
        }
      }
      if (quickPreset.exportMeta && typeof window !== 'undefined') {
        window.__artapp_lastImportMeta = quickPreset.exportMeta;
      }
      // Apply audio config if present
      if (quickPreset.audioConfig && applyAudioSnapshot) {
        applyAudioSnapshot(quickPreset.audioConfig);
      }
      // Apply BPM config if present
      if (quickPreset.bpmConfig && applyBPMSnapshot) {
        applyBPMSnapshot(quickPreset.bpmConfig);
      }
      // Apply Timeline config if present
      if (quickPreset.timelineConfig && applyTimelineSnapshot) {
        applyTimelineSnapshot(quickPreset.timelineConfig);
      }
    } catch (error) {
      console.warn('[RAM Preset] Failed to recall snapshot', error);
    }
  }, [applyParametersSnapshot, loadAppState, quickPreset, applyAudioSnapshot, applyBPMSnapshot, applyTimelineSnapshot]);

  // Distribute a color array across N layers as evenly as possible (round-robin)
  const distributeColorsAcrossLayers = (colors = [], layerCount = 0) => {
    return distributeColorsAcrossLayersUtil(colors, layerCount);
  };

  /* eslint-disable no-unused-vars */
  const applyDistributedColors = (colors) => {
    setLayers(prev => {
      const parts = distributeColorsAcrossLayers(colors, prev.length);
      return prev.map((l, i) => {
        const chunk = parts[i] || [];
        return { ...l, colors: chunk, numColors: chunk.length, selectedColor: 0 };
      });
    });
  };
  /* eslint-enable no-unused-vars */

  // Timeline modulation - applies timeline track values to the modulation store
  // Uses shapeTrackUpdatesRef for animation loop to consume shape track data
  useTimelineModulation({
    modulationStore,
    layers,
    bpmContext: bpmForAnimation,
    audioContext: audioReactive,
    midiContext: useMidi(),
    setGlobalSpeedMultiplier,
    setGlobalOpacity: undefined,
    setBackgroundColor,
    setGlobalBlendMode,
    blendModes,
    palettes,
    sampleColorsEven,
    setLayers,
    getPresetSlot,
    morphRoute,
    morphNodes,
    shapeTrackUpdatesRef, // Pass ref for shape track updates
  });

  // Assign exactly ONE colour per layer (cycled) so Global palette preset can be detected reliably
  // Memoized to provide a stable function identity to child components/hooks
  const assignOneColorPerLayer = useCallback((colors) => {
    const src = Array.isArray(colors) ? colors : [];
    setLayers(prev => prev.map((l, i) => {
      const col = src.length ? src[i % src.length] : '#ffffff';
      return { ...l, colors: [col], numColors: 1, selectedColor: 0 };
    }));
  }, [setLayers]);

  // Parameter-level "Include in Randomize All" toggles live on ParameterContext parameters (`param.isRandomizable`).
  // Use current render values (not a post-render effect) so generation immediately respects changes.
  const randomizableParamMap = useMemo(() => {
    const map = new Map();
    (Array.isArray(parameters) ? parameters : []).forEach((p) => {
      if (p && p.id) map.set(p.id, !!p.isRandomizable);
    });
    return map;
  }, [parameters]);
  const isParamRandomizable = useCallback((id) => {
    if (randomizableParamMap.has(id)) return randomizableParamMap.get(id);
    return undefined;
  }, [randomizableParamMap]);

  // Build a new layer by varying from a previous layer using split variation weights
  const buildVariedLayerFrom = useCallback(
    (prev, nameIndex, baseVar, options = {}) => buildVariedLayerFromUtil(prev, nameIndex, baseVar, {
      DEFAULT_LAYER,
      palettes: palettesWithCustom,
      isParamRandomizable,
      randomizeColorsPerLayer,
      uniformColorCount,
      ...options,
    }),
    [palettesWithCustom, isParamRandomizable, randomizeColorsPerLayer, uniformColorCount],
  );

  const handleImportFile = useCallback(async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data?.customPalettes) {
        mergeCustomPaletteList(data.customPalettes);
      }
      // Apply MIDI mappings immediately if present
      try {
        if (data && data.midiMappings && setMappingsFromExternal) setMappingsFromExternal(data.midiMappings);
      } catch { /* noop */ }

      // Apply audio config if present
      try {
        if (data && data.audioConfig && applyAudioSnapshot) applyAudioSnapshot(data.audioConfig);
      } catch { /* noop */ }

      // Apply BPM config if present
      try {
        if (data && data.bpmConfig && applyBPMSnapshot) applyBPMSnapshot(data.bpmConfig);
      } catch { /* noop */ }

      // Apply Timeline config if present
      try {
        if (data && data.timelineConfig && applyTimelineSnapshot) applyTimelineSnapshot(data.timelineConfig);
      } catch { /* noop */ }

      // Build a unique name for this import
      const base = file.name.replace(/\.json$/i, '') || 'imported';
      const existing = new Set(getSavedConfigList());
      let name = base;
      let i = 1;
      while (existing.has(name)) { name = `${base}-${i++}`; }

      // Try to persist to localStorage, but treat quota errors as non-fatal
      let persistedName = null;
      try {
        const key = `artapp-config-${name}`;
        localStorage.setItem(key, JSON.stringify(data));
        const list = getSavedConfigList();
        if (!list.includes(name)) {
          localStorage.setItem('artapp-config-list', JSON.stringify([...list, name]));
        }
        persistedName = name;
      } catch (storageError) {
        // QuotaExceededError or similar: log and continue without saving to localStorage
        console.warn('[Import] Failed to persist config to localStorage; proceeding without saving', storageError);
      }

      const loadState = window.confirm('Load app state if available?');
      let res = null;

      if (persistedName) {
        // Normal path: use existing loaders
        res = loadState ? loadFullConfiguration(persistedName) : loadParameters(persistedName);
        if (res?.success && loadState && res.appState && typeof loadAppState === 'function') {
          loadAppState(res.appState);
          // Restore randomization include checkboxes
          if (res.appState.includeRnd && typeof res.appState.includeRnd === 'object') {
            setIncludeRnd({ ...DEFAULT_INCLUDE_RND, ...res.appState.includeRnd });
          }
        }
      } else {
        // Fallback path: apply directly from the imported JSON without persisting
        if (loadState) {
          if (Array.isArray(data?.parameters) && typeof applyParametersSnapshot === 'function') {
            try { applyParametersSnapshot(data.parameters); } catch { /* noop */ }
          }
          if (data?.appState && typeof loadAppState === 'function') {
            try { loadAppState(data.appState); } catch { /* noop */ }
          }
        } else if (Array.isArray(data?.parameters) && typeof applyParametersSnapshot === 'function') {
          try { applyParametersSnapshot(data.parameters); } catch { /* noop */ }
        }

        // Synthesize minimal result object so exportMeta can still be propagated
        res = { success: true, exportMeta: data?.exportMeta, appState: data?.appState };
      }

      // Restore randomization include checkboxes from loaded state
      const loadedAppState = res?.appState || data?.appState;
      if (loadState && loadedAppState?.includeRnd && typeof loadedAppState.includeRnd === 'object') {
        setIncludeRnd({ ...DEFAULT_INCLUDE_RND, ...loadedAppState.includeRnd });
      }

      if (res?.exportMeta && typeof window !== 'undefined') {
        window.__artapp_lastImportMeta = res.exportMeta;
      }

      if (persistedName) {
        alert(`Imported '${persistedName}'`);
      } else {
        alert('Imported (local save skipped: storage is full)');
      }
    } catch (err) {
      console.warn('Failed to import JSON', err);
      alert('Failed to import JSON');
    } finally {
      // reset input to allow re-selecting the same file later
      e.target.value = '';
    }
  }, [applyParametersSnapshot, getSavedConfigList, loadAppState, loadFullConfiguration, loadParameters, setMappingsFromExternal, applyAudioSnapshot, applyBPMSnapshot, applyTimelineSnapshot, mergeCustomPaletteList]);

  const handleQuickLoad = useCallback(() => {
    configFileInputRef.current?.click();
  }, []);

  // --- SVG Import: create a new layer from an SVG file ---
  const handleImportSVGClick = useCallback(() => {
    svgFileInputRef.current?.click();
  }, []);

  const handleImportSVGFile = useCallback(async (e) => {
    const fileList = Array.from(e.target.files || []);
    if (!fileList.length) return;

    try {
      const layersSnapshot = layersRef.current || [];
      // Use enhanced SVG import
      const { layers: newLayers, errors } = await importSVGFiles(fileList, {
        targetScale: 0.4,  // Sensible default scale (40% of canvas)
        // Preserve original relative positions for multi-file imports
        distributePositions: false,
        applyAnimation: false,  // Let user apply animation after import
        extractColors: true  // Extract and apply colors from SVG
      });
      
      // Report any errors
      if (errors.length > 0) {
        console.warn('SVG import errors:', errors);
        if (errors.length === fileList.length) {
          alert('Failed to import any SVG files. Check console for details.');
          return;
        } else if (errors.length > 0) {
          alert(`Imported ${newLayers.length} of ${fileList.length} files. Some files had errors.`);
        }
      }
      
      if (newLayers.length === 0) {
        alert('No valid SVG shapes found in the selected files.');
        return;
      }
      
      // Apply current layer parameters to imported layers if desired
      const applyCurrentParams = fileList.length === 1 && layersSnapshot.length > 0;
      if (applyCurrentParams) {
        const currentLayer = layersSnapshot[selectedLayerIndex] || layersSnapshot[0];
        newLayers.forEach(layer => {
          // Apply animation parameters from current layer
          layer.movementStyle = currentLayer.movementStyle || 'drift';
          layer.movementSpeed = currentLayer.movementSpeed || 1;
          layer.movementAngle = currentLayer.movementAngle || 45;
          layer.scaleSpeed = currentLayer.scaleSpeed || 0.05;
          layer.scaleMin = currentLayer.scaleMin || 0.2;
          layer.scaleMax = currentLayer.scaleMax || 1.5;
          
          // Apply blend mode and opacity
          layer.blendMode = currentLayer.blendMode || 'normal';
          layer.opacity = currentLayer.opacity || 100;
          
          // Apply image effects if desired
          layer.imageBlur = currentLayer.imageBlur || 0;
          layer.imageBrightness = currentLayer.imageBrightness || 100;
          layer.imageContrast = currentLayer.imageContrast || 100;
          layer.imageHue = currentLayer.imageHue || 0;
          layer.imageSaturation = currentLayer.imageSaturation || 100;
          
          // If no colors were extracted, use current layer colors
          if (!layer.colors || layer.colors.length === 0) {
            layer.colors = currentLayer.colors || DEFAULT_LAYER.colors;
            layer.numColors = currentLayer.numColors || DEFAULT_LAYER.numColors;
          }
        });
      }
      
      // Store RAW baseline for adjustment panel
      importRawRef.current = newLayers.map(l => ({
        x: Number(l?.position?.x) || 0.5,
        y: Number(l?.position?.y) || 0.5,
        s: Number(l?.position?.scale) || 1,
      }));
      
      // For multiple files, show import adjust panel
      if (newLayers.length > 1) {
        const margin = 0.02; // 2% margins
        const layersMeta = newLayers.map(l => {
          const nodes = Array.isArray(l.nodes) ? l.nodes : [];
          const subpaths = Array.isArray(l.subpaths) ? l.subpaths : [];
          const allNodes = subpaths.length > 0 ? subpaths.flat() : nodes;
          const s = Number(l.position?.scale) || 1;
          let maxAbsX = 0, maxAbsY = 0;
          allNodes.forEach(n => { const ax = Math.abs(n.x) || 0; const ay = Math.abs(n.y) || 0; if (ax > maxAbsX) maxAbsX = ax; if (ay > maxAbsY) maxAbsY = ay; });
          const px = Number(l.position?.x) || 0.5;
          const py = Number(l.position?.y) || 0.5;
          return { px, py, s, maxAbsX, maxAbsY };
        });
        
        // Check if auto-fit is needed
        if (importFitEnabled && !window.__artapp_disable_import_fit) {
          // Current overall bounds in [0..1] fractions
          const bounds = layersMeta.reduce((acc, m) => {
            const halfW = (m.maxAbsX || 1) * 0.5 * m.s;
            const halfH = (m.maxAbsY || 1) * 0.5 * m.s;
            const minX = m.px - halfW; const maxX = m.px + halfW;
            const minY = m.py - halfH; const maxY = m.py + halfH;
            if (minX < acc.minX) acc.minX = minX;
            if (maxX > acc.maxX) acc.maxX = maxX;
            if (minY < acc.minY) acc.minY = minY;
            if (maxY > acc.maxY) acc.maxY = maxY;
            return acc;
          }, { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
          
          const widthFrac = Math.max(0.0001, bounds.maxX - bounds.minX);
          const heightFrac = Math.max(0.0001, bounds.maxY - bounds.minY);
          const fitX = (1 - 2 * margin) / widthFrac;
          const fitY = (1 - 2 * margin) / heightFrac;
          const sFit = Math.min(1, fitX, fitY); // only shrink to fit; don't upscale
          
          if (sFit < 1) {
            newLayers.forEach(l => { l.position.scale = (Number(l.position.scale) || 1) * sFit; });
          }
        }
        
        // Store base positions/scales for interactive adjustment
        importBaseRef.current = importRawRef.current.map(b => ({ ...b }));
        setImportAdjust({ dx: 0, dy: 0, s: 1 });
        setImportFitEnabled(true);
        setImportDebug(false);
        setShowImportAdjust(true);
      } else {
        importBaseRef.current = [];
        setShowImportAdjust(false);
      }
      
      // Always append imported layers to existing ones
      setLayers(prev => [...prev, ...newLayers]);

      // Select the first of the newly added layers
      setSelectedLayerIndex(layersSnapshot.length);
      handleSetNodeEditMode(true, { selectedIndex: layersSnapshot.length });
      
      // Success log
      console.log(`Successfully imported ${newLayers.length} SVG layer(s) and appended to ${layers.length} existing layer(s)`);
    } catch (err) {
      console.warn('Failed to import SVG', err);
      alert('Failed to import SVG');
    } finally {
      e.target.value = '';
    }
  }, [
    importBaseRef,
    importFitEnabled,
    importRawRef,
    layers.length,
    selectedLayerIndex,
    setImportAdjust,
    setImportDebug,
    setImportFitEnabled,
    handleSetNodeEditMode,
    setLayers,
    setSelectedLayerIndex,
    setShowImportAdjust,
  ]);


  // (Removed invalid useEffect block accidentally inserted earlier)

  // Layer management via hook
  const {
    updateCurrentLayer,
    addNewLayer,
    deleteLayer,
    selectLayer,
    moveSelectedLayerUp,
    moveSelectedLayerDown,
  } = useLayerManagement({
    layers,
    layersRef,
    selectedLayerIndexRef,
    setLayers,
    selectedLayerIndex,
    setSelectedLayerIndex,
    DEFAULT_LAYER,
    buildVariedLayerFrom,
    isNodeEditMode,
    setSuppressAnimation,
    suppressTimerRef,
  });

  // Colour randomization settings (min/max count)
  const [colorCountMin, setColorCountMin] = useState(1);
  const [colorCountMax, setColorCountMax] = useState(8);

  const rotationVaryAcrossLayers = parameterTargetMode === 'global';

  // Randomization suite via hook
  const {
    modernRandomizeAll,
    classicRandomizeAll,
    randomizeLayer,
    randomizeAnimationOnly,
    randomizeScene,
  } = useRandomization({
    parameters,
    DEFAULT_LAYER,
    palettes: palettesWithCustom,
    blendModes,
    layers,
    selectedLayerIndex,
    randomizePalette,
    randomizeNumColors,
    randomizeColorsPerLayer,
    uniformColorCount,
    colorCountMin,
    colorCountMax,
    classicMode,
    seed: globalSeed,
    sampleColorsEven,
    assignOneColorPerLayer,
    rotationVaryAcrossLayers,
    getIsRnd,
    setLayers,
    setSelectedLayerIndex,
    setBackgroundColor,
    setGlobalBlendMode,
    setGlobalSpeedMultiplier,
    setGlobalPaletteIndex,
    setGlobalPaletteRef,
  });

  useAutosave({
    isDirty,
    setIsDirty,
    lastSavedAt,
    setLastSavedAt,
    getCurrentAppState: getFullAppState,
    parameters,
    isFrozen,
    getAudioSnapshot,
    getBPMSnapshot,
  });

  const randomizeCurrentLayer = useCallback((randomizePaletteFlag = false) => {
    const snapshot = layersRef.current || [];
    const idx = Math.max(0, Math.min(selectedLayerIndex, Math.max(0, snapshot.length - 1)));
    const updated = randomizeLayer(idx, randomizePaletteFlag);
    if (!updated) return;
    setLayers(prev => prev.map((l, i) => (i === idx ? updated : l)));
  }, [randomizeLayer, selectedLayerIndex, setLayers]);

  // randomizeAnimationOnly provided by hook

  const randomizeAnimationForCurrentLayer = useCallback(() => {
    const snapshot = layersRef.current || [];
    const idx = Math.max(0, Math.min(selectedLayerIndex, Math.max(0, snapshot.length - 1)));
    const updated = randomizeAnimationOnly(idx);
    if (!updated) return;
    setLayers(prev => prev.map((l, i) => (i === idx ? updated : l)));
  }, [randomizeAnimationOnly, selectedLayerIndex, setLayers]);

  // Randomize only colors for the current layer according to toggles and min/max
  const randomizeCurrentLayerColors = useCallback(() => {
    const snapshot = layersRef.current || [];
    const idx = Math.max(0, Math.min(selectedLayerIndex, Math.max(0, snapshot.length - 1)));
    const layer = snapshot[idx];
    if (!layer) return;
    const normalizeSeed = (value) => {
      const n = Math.abs(Number.isFinite(value) ? Math.floor(value) : 1);
      const mod = n % 2147483646;
      return mod === 0 ? 1 : mod;
    };
    colorRandomCallRef.current += 1;
    const seedBase = normalizeSeed(
      (globalSeed || 1) + (idx + 1) * 1009 + (layer.seed || 0) + colorRandomCallRef.current * 131071,
    );
    const rand = createSeededRandom(seedBase);
    const baseColors = Array.isArray(layer.colors) ? layer.colors : [];
    const srcPalette = randomizePalette
      ? pickPaletteColors(palettesWithCustom, rand, baseColors)
      : baseColors;
    const cMin = Math.max(1, Math.floor(colorCountMin));
    const cMaxCap = Math.max(cMin, Math.floor(colorCountMax));
    let n = Number.isFinite(layer.numColors) ? layer.numColors : (baseColors.length || 1);
    if (randomizeNumColors) {
      const maxN = Math.min(cMaxCap, (srcPalette.length || cMaxCap));
      const minN = cMin;
      n = maxN > 0 ? Math.floor(rand() * (maxN - minN + 1)) + minN : 1;
    }
    let nextColors = sampleColorsEven(srcPalette, Math.max(1, n));
    // Fallbacks when both toggles are off: ensure a visible change
    if (!randomizePalette && !randomizeNumColors) {
      const same = Array.isArray(baseColors) && baseColors.length === nextColors.length && baseColors.every((c, i) => c === nextColors[i]);
      if (same) {
        if ((baseColors?.length || 0) <= 1) {
          // Single colour: pick a different colour from a palette
          const pool = pickPaletteColors(palettesWithCustom, rand, baseColors.length ? baseColors : ['#ffffff']);
          if (pool.length) {
            // Try to pick a colour that's different
            let pick = pool[Math.floor(rand() * pool.length)];
            if (baseColors.length && pool.length > 1) {
              let guard = 0;
              while (pick === baseColors[0] && guard++ < 8) {
                pick = pool[Math.floor(rand() * pool.length)];
              }
            }
            nextColors = [pick];
            n = 1;
          }
        } else {
          // Multiple colours: rotate by a random offset to change order deterministically
          const arr = [...baseColors];
          const len = arr.length;
          const offset = Math.max(1, Math.floor(rand() * len));
          nextColors = Array.from({ length: len }, (_, i) => arr[(i + offset) % len]);
        }
      }
    }
    const updated = { ...layer, colors: nextColors, numColors: nextColors.length, selectedColor: 0 };
    setLayers(prev => prev.map((l, i) => (i === idx ? updated : l)));
  }, [colorCountMax, colorCountMin, globalSeed, randomizeNumColors, randomizePalette, palettesWithCustom, sampleColorsEven, selectedLayerIndex, setLayers]);

  // randomizeBackgroundColor handled within useRandomization

  const handleRandomizeAll = useCallback(() => {
    if (classicMode) classicRandomizeAll();
    else modernRandomizeAll();
  }, [classicMode, classicRandomizeAll, modernRandomizeAll]);

  useEffect(() => {
    variationBaseRef.current.clear();
  }, [selectedLayerIndex]);

  const findShapeTrackForLayer = useCallback((layer) => {
    if (!layer || !timelineContext?.tracks) return null;
    const layerName = layer.name;
    const layerId = layer.id;
    const shapeTracks = timelineContext.tracks.filter((t) => {
      if (t?.type !== 'shape') return false;
      const parts = String(t.targetId || '').split(':');
      return parts.length >= 3 && parts[0] === 'layer' && parts[2] === 'shape';
    });
    if (!shapeTracks.length) return null;

    // Prefer name-targeted tracks first; IDs can be stale if duplicates were normalized.
    if (layerName) {
      const byName = shapeTracks.find((t) => String(t.targetId || '').split(':')[1] === layerName);
      if (byName) return byName;
    }
    if (layerId) {
      return shapeTracks.find((t) => String(t.targetId || '').split(':')[1] === layerId) || null;
    }
    return null;
  }, [timelineContext?.tracks]);

  // --- Variation Keyframe Generation Handlers ---

  // Generate a single variation keyframe at current playhead position
  // Supports both single-layer shape tracks and global shape tracks
  const handleGenerateVariationKeyframe = useCallback(() => {
    if (!timelineContext?.visible) return;

    let layer = layers[selectedLayerIndex];
    let shapeTrack = findShapeTrackForLayer(layer);
    let autoCreatedShapeTrackId = null;


    // Auto-create a shape track for the selected layer if none exists
    if (!shapeTrack && layer && timelineContext.addTrack) {
      const layerName = layer.name || `Layer ${selectedLayerIndex + 1}`;
      const newTrackId = timelineContext.addTrack(
        `${layerName} Shape`,
        `layer:${layerName}:shape`,
        null, null, 'shape'
      );
      if (newTrackId) {
        // Build a minimal track object so generateVariationKeyframe can find it
        // (the real track is in React state which updates async, but addTrack returns the ID)
        shapeTrack = { id: newTrackId, type: 'shape', targetId: `layer:${layerName}:shape`, categories: { shape: true, animation: false, color: true } };
        autoCreatedShapeTrackId = newTrackId;
        console.log(`Auto-created shape track for ${layerName}:`, newTrackId);
      }
    }

    if (shapeTrack && layer) {
      const baseKey = layer.id || layer.name;
      let baseLayer = variationBaseRef.current.get(baseKey);
      if (!baseLayer) {
        baseLayer = JSON.parse(JSON.stringify(layer));
        variationBaseRef.current.set(baseKey, baseLayer);
      }

      const variationWeights = {
        shape: layer.variationShape ?? layer.variation ?? 0.2,
        anim: layer.variationAnim ?? layer.variation ?? 0.2,
        color: layer.variationColor ?? layer.variation ?? 0.2,
        position: layer.variationPosition ?? layer.variation ?? 0.2,
        scale: layer.variationScale ?? 0,
      };

      const variationOptions = {
        variationWeights,
        isParamRandomizable,
        constrainColorsToPalette: !!audioSpawnUseGlobalPalette,
        paletteColors: generationPaletteColors,
      };

      // Newly auto-created tracks are added via async React state update.
      // Defer generation one frame so TimelineContext can find the track.
      if (autoCreatedShapeTrackId) {
        requestAnimationFrame(() => {
          const deferredKeyframeId = timelineContext.generateVariationKeyframe?.(
            autoCreatedShapeTrackId,
            baseLayer,
            variationOptions,
          );
          if (deferredKeyframeId) {
            console.log('Generated variation keyframe:', deferredKeyframeId);
          }
        });
        return;
      }

      const keyframeId = timelineContext.generateVariationKeyframe?.(shapeTrack.id, baseLayer, variationOptions);
      if (keyframeId) {
        console.log('Generated variation keyframe:', keyframeId);
      }
      return;
    }

    // Fallback: global shape track
    const globalShapeTrack = timelineContext.tracks?.find(t => t.type === 'globalShape');
    
    if (globalShapeTrack) {
      // Global shape track: generate variation for ALL layers
      const firstLayer = layers[0];
      const variationWeights = {
        shape: firstLayer?.variationShape ?? firstLayer?.variation ?? 0.2,
        anim: firstLayer?.variationAnim ?? firstLayer?.variation ?? 0.2,
        color: firstLayer?.variationColor ?? firstLayer?.variation ?? 0.2,
        position: firstLayer?.variationPosition ?? firstLayer?.variation ?? 0.2,
        scale: firstLayer?.variationScale ?? 0,
      };

      const time = timelineContext.generateGlobalVariationKeyframe?.(globalShapeTrack.id, layers, {
        variationWeights,
        isParamRandomizable,
        constrainColorsToPalette: !!audioSpawnUseGlobalPalette,
        paletteColors: generationPaletteColors,
      });
      if (time != null) {
        console.log('Generated global variation keyframe at', time);
      }
      return;
    }

    console.warn('No shape track found for selected layer, and no global shape track found');
}, [timelineContext, layers, selectedLayerIndex, findShapeTrackForLayer, isParamRandomizable, audioSpawnUseGlobalPalette, generationPaletteColors]);

  // Ref that TimelinePanel populates with its settings-aware random handler
  // so the keyboard shortcut (Shift+R) uses the panel's Random N, transients, etc.
  const panelGenerateRandomRef = useRef(null);

  // Generate random keyframes (option-driven, no modal prompts)
  // Supports both single-layer shape tracks and global shape tracks
  const handleGenerateRandomKeyframes = useCallback((options = {}) => {
    if (!timelineContext?.visible) return;

    let layer = layers[selectedLayerIndex];
    const allTracks = timelineContext.tracks || [];
    const requestedTrackId = typeof options.targetTrackId === 'string' ? options.targetTrackId : null;
    const requestedTrack = requestedTrackId
      ? allTracks.find(t => t.id === requestedTrackId)
      : null;
    const requestedIsShape = !!(requestedTrack && (requestedTrack.type === 'shape' || requestedTrack.targetId?.endsWith(':shape')));
    const requestedIsGlobal = requestedTrack?.type === 'globalShape';
    if (requestedIsShape && requestedTrack?.targetId) {
      const parts = String(requestedTrack.targetId).split(':');
      const targetLayerIdOrName = parts.length >= 2 ? parts[1] : null;
      const targetLayer = layers.find(l => l?.name === targetLayerIdOrName || l?.id === targetLayerIdOrName);
      if (targetLayer) {
        layer = targetLayer;
      }
    }
    const selectedShapeTrack = requestedTrack
      ? (requestedIsShape ? requestedTrack : null)
      : findShapeTrackForLayer(layer);

    // Prefer selected-layer shape track when available unless an explicit track is requested.
    const globalShapeTrack = requestedIsGlobal
      ? requestedTrack
      : allTracks.find(t => t.type === 'globalShape');
    const isGlobal = requestedTrack
      ? requestedIsGlobal
      : (!selectedShapeTrack && !!globalShapeTrack);

    // For single-layer mode, get the selected layer's track
    let shapeTrack = requestedTrack
      ? ((requestedIsShape || requestedIsGlobal) ? requestedTrack : null)
      : (isGlobal ? globalShapeTrack : selectedShapeTrack);
    let autoCreatedShapeTrackId = null;
    const regenerateExistingSequence = options.regenerateExistingSequence === true;

    if (requestedTrack && !shapeTrack) {
      console.warn('Requested track is not a shape/global-shape track:', requestedTrackId);
      return;
    }
    if (requestedTrack && requestedIsShape && !layer) {
      console.warn('Cannot resolve base layer for requested shape track:', requestedTrackId);
      return;
    }

    if (!isGlobal) {
      if (!layer) return;
      if (!shapeTrack) {
        // No shape track — look for numeric/color tracks targeting this layer
        const layerName = layer.name || `Layer ${selectedLayerIndex + 1}`;
        const layerId = layer.id;
        const numericTracks = (timelineContext.tracks || []).filter(t => {
          if (t.type === 'shape' || t.type === 'globalShape') return false;
          const tid = String(t.targetId || '');
          if (!tid.startsWith('layer:')) return false;
          const parts = tid.split(':');
          return parts[1] === layerName || parts[1] === layerId;
        });

        if (numericTracks.length > 0) {
          // Compute timing
          const rawCount = Number(options.count);
          const count = Number.isFinite(rawCount) && rawCount >= 1
            ? Math.max(1, Math.floor(rawCount))
            : (options.useTransients ? undefined : 5);

          const playheadSec = timelineContext?.getPositionSeconds?.()
            ?? timelineContext?.positionSeconds
            ?? timelinePositionSeconds
            ?? 0;
          const defStart = Number.isFinite(playheadSec) ? Math.max(0, playheadSec) : 0;
          const tlEnd = timelineContext?.audio?.durationSeconds ?? timelineContext?.lengthSeconds ?? 0;

          const startTime = Number.isFinite(Number(options.startTime)) ? Number(options.startTime) : defStart;
          const endTime = Number.isFinite(Number(options.endTime)) ? Number(options.endTime) : (Number.isFinite(tlEnd) ? tlEnd : 0);

          if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || startTime >= endTime) {
            console.warn('Invalid time range for random keyframe generation');
            return;
          }

          let totalAdded = 0;
          for (const nt of numericTracks) {
            const added = timelineContext.generateRandomNumericKeyframes?.(nt.id, count, {
              useTransients: !!options.useTransients && (timelineContext.transients?.length > 0),
              startTime,
              endTime,
              replaceExistingKeyframes: !!options.replaceTrackKeyframes,
            });
            totalAdded += (added || 0);
          }
          if (totalAdded > 0) {
            console.log('Generated', totalAdded, 'random numeric keyframes across', numericTracks.length, 'track(s)');
          }
          return;
        }

        // Auto-create a shape track for the selected layer
        if (timelineContext.addTrack) {
          const newTrackId = timelineContext.addTrack(
            `${layerName} Shape`,
            `layer:${layerName}:shape`,
            null, null, 'shape'
          );
          if (newTrackId) {
            shapeTrack = { id: newTrackId, type: 'shape', targetId: `layer:${layerName}:shape`, categories: { shape: true, animation: false, color: true } };
            autoCreatedShapeTrackId = newTrackId;
            console.log(`Auto-created shape track for ${layerName}:`, newTrackId);
            // Fall through to the shape track generation path below
          } else {
            console.warn('No shape or numeric track found for selected layer');
            return;
          }
        } else {
          console.warn('No shape or numeric track found for selected layer');
          return;
        }
      }
    }

    // For single-layer, cache base layer
    let baseLayer = layer;
    if (!isGlobal && layer) {
      const baseKey = layer.id || layer.name;
      baseLayer = variationBaseRef.current.get(baseKey);
      if (!baseLayer) {
        baseLayer = JSON.parse(JSON.stringify(layer));
        variationBaseRef.current.set(baseKey, baseLayer);
      }
    }

    // Get variation weights from first layer (for global) or selected layer
    const refLayer = isGlobal ? layers[0] : layer;
    const variationWeights = {
      shape: refLayer?.variationShape ?? refLayer?.variation ?? 0.2,
      anim: refLayer?.variationAnim ?? refLayer?.variation ?? 0.2,
      color: refLayer?.variationColor ?? refLayer?.variation ?? 0.2,
      position: refLayer?.variationPosition ?? refLayer?.variation ?? 0.2,
      scale: refLayer?.variationScale ?? 0,
    };

    // Node modulation only for single-layer tracks (not global)
    let nodeMod = null;
    if (!isGlobal && enableBreathing && !!options.nodeModEnabled) {
      const amount = Number(options.nodeModAmount);
      const cycles = Number(options.nodeModCycles);
      nodeMod = {
        enabled: true,
        mode: 'sineRadial',
        amount: Number.isFinite(amount) ? Math.max(0.01, Math.min(0.5, amount)) : 0.15,
        cycles: Number.isFinite(cycles) ? Math.max(0.25, cycles) : 1,
        mask: 'all',
        phaseSpread: 0.5,
      };
    }

    let energyInfluenceValue = Number.isFinite(Number(options.energyInfluence))
      ? Math.max(0, Math.min(2, Number(options.energyInfluence)))
      : 0;
    if (!Number.isFinite(Number(options.energyInfluence)) && enableEnergyScaling && timelineContext.energyMap?.total?.length > 0) {
      energyInfluenceValue = Number.isFinite(energyInfluence)
        ? Math.max(0, Math.min(2, energyInfluence))
        : 0.5;
    }

    if (regenerateExistingSequence) {
      const keyframes = Array.isArray(shapeTrack?.keyframes) ? shapeTrack.keyframes : [];
      const variationKeyframes = keyframes.filter(kf => !!kf?.variation);
      if (!variationKeyframes.length) {
        console.warn('No variation keyframes found to regenerate on track');
        return;
      }

      const regenTimes = variationKeyframes
        .map(kf => kf?.timeSeconds)
        .filter(Number.isFinite)
        .sort((a, b) => a - b);
      const temporalReferenceTimes = keyframes
        .filter(kf => !kf?.variation)
        .map(kf => kf?.timeSeconds)
        .filter(Number.isFinite);

      if (isGlobal) {
        const keyframeIds = timelineContext.generateGlobalVariationKeyframesAtTimes?.(
          shapeTrack.id,
          layers,
          regenTimes,
          {
            variationWeights,
            energyInfluence: energyInfluenceValue,
            isParamRandomizable,
            constrainColorsToPalette: !!audioSpawnUseGlobalPalette,
            paletteColors: generationPaletteColors,
            temporalReferenceTimes,
            baseSeed: Date.now(),
          },
        );
        if (keyframeIds?.length) {
          console.log('Regenerated', keyframeIds.length, 'global variation keyframes (sequence reroll)');
        }
      } else {
        const keyframeIds = timelineContext.generateVariationKeyframesAtTimes?.(
          shapeTrack.id,
          baseLayer,
          regenTimes,
          {
            evaluateAtTime: false,
            nodeMod,
            energyInfluence: energyInfluenceValue,
            variationWeights,
            isParamRandomizable,
            constrainColorsToPalette: !!audioSpawnUseGlobalPalette,
            paletteColors: generationPaletteColors,
            temporalReferenceTimes,
            baseSeed: Date.now(),
          },
        );
        if (keyframeIds?.length) {
          console.log('Regenerated', keyframeIds.length, 'variation keyframes (sequence reroll)');
        }
      }
      return;
    }

    const rawCount = Number(options.count);
    const count = Number.isFinite(rawCount) && rawCount >= 1
      ? Math.max(1, Math.floor(rawCount))
      : (options.useTransients ? undefined : 5);

    const playheadSeconds = timelineContext?.getPositionSeconds?.()
      ?? timelineContext?.positionSeconds
      ?? timelinePositionSeconds
      ?? 0;
    const defaultStartTime = Number.isFinite(playheadSeconds) ? Math.max(0, playheadSeconds) : 0;

    const sortedKeyframes = Array.isArray(shapeTrack.keyframes)
      ? [...shapeTrack.keyframes].sort((a, b) => a.timeSeconds - b.timeSeconds)
      : [];
    const TIME_EPSILON = 0.01;
    const nextKeyframe = sortedKeyframes.find(kf => Number.isFinite(kf?.timeSeconds) && kf.timeSeconds > defaultStartTime + TIME_EPSILON);
    const timelineEndSeconds =
      timelineContext?.audio?.durationSeconds
      ?? timelineContext?.lengthSeconds
      ?? 0;
    const defaultEndTime = nextKeyframe?.timeSeconds
      ?? (Number.isFinite(timelineEndSeconds) ? timelineEndSeconds : 0);

    const startTime = Number.isFinite(Number(options.startTime))
      ? Number(options.startTime)
      : defaultStartTime;
    const endTime = Number.isFinite(Number(options.endTime))
      ? Number(options.endTime)
      : defaultEndTime;

    if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || startTime >= endTime) {
      console.warn('Invalid time range for random keyframe generation');
      return;
    }

    const useTransients = !!options.useTransients && (timelineContext.transients?.length > 0);

    let keyframeIds;
    if (isGlobal) {
      // Global shape track: generate for all layers
      keyframeIds = timelineContext.generateGlobalRandomKeyframes?.(globalShapeTrack.id, layers, count, {
        useTransients,
        startTime,
        endTime,
        energyInfluence: energyInfluenceValue,
        variationWeights,
        replaceExistingKeyframes: !!options.replaceTrackKeyframes,
        isParamRandomizable,
        constrainColorsToPalette: !!audioSpawnUseGlobalPalette,
        paletteColors: generationPaletteColors,
      });
    } else {
      const shapeRandomOptions = {
        useTransients,
        startTime,
        endTime,
        nodeMod,
        energyInfluence: energyInfluenceValue,
        variationWeights,
        replaceExistingKeyframes: !!options.replaceTrackKeyframes,
        isParamRandomizable,
        constrainColorsToPalette: !!audioSpawnUseGlobalPalette,
        paletteColors: generationPaletteColors,
      };

      // Newly auto-created tracks are added via async React state update.
      // Defer generation one frame so TimelineContext can see the new track.
      if (autoCreatedShapeTrackId) {
        requestAnimationFrame(() => {
          const deferredKeyframeIds = timelineContext.generateRandomKeyframes?.(
            autoCreatedShapeTrackId,
            baseLayer,
            count,
            shapeRandomOptions,
          );
          if (deferredKeyframeIds?.length) {
            console.log('Generated', deferredKeyframeIds.length, 'random keyframes',
              nodeMod ? 'with node modulation' : '',
              energyInfluenceValue > 0 ? `with energy influence ${energyInfluenceValue}` : '');
          }
        });
        return;
      }

      // Single-layer shape track
      keyframeIds = timelineContext.generateRandomKeyframes?.(shapeTrack.id, baseLayer, count, shapeRandomOptions);
    }

    if (keyframeIds?.length) {
      console.log('Generated', keyframeIds.length, isGlobal ? 'global' : '', 'random keyframes',
        nodeMod ? 'with node modulation' : '',
        energyInfluenceValue > 0 ? `with energy influence ${energyInfluenceValue}` : '');
    }
}, [timelineContext, layers, selectedLayerIndex, findShapeTrackForLayer, isParamRandomizable, timelinePositionSeconds, enableBreathing, enableEnergyScaling, energyInfluence, audioSpawnUseGlobalPalette, generationPaletteColors]);

  // Fill keyframes between nearest keyframes around playhead (option-driven, no modal prompts)
  // Supports both single-layer shape tracks and global shape tracks
  const handleFillKeyframesBetween = useCallback((options = {}) => {
    if (!timelineContext?.visible) return;

    const layer = layers[selectedLayerIndex];
    const selectedShapeTrack = findShapeTrackForLayer(layer);

    // Prefer selected-layer shape track when available.
    const globalShapeTrack = timelineContext.tracks?.find(t => t.type === 'globalShape');
    const isGlobal = !selectedShapeTrack && !!globalShapeTrack;
    
    // For single-layer mode, get the selected layer's track
    let shapeTrack = isGlobal ? globalShapeTrack : selectedShapeTrack;
    
    if (!isGlobal) {
      if (!layer) return;
      if (!shapeTrack || !shapeTrack.keyframes?.length) {
        console.warn('No shape track or keyframes found for selected layer');
        return;
      }
    }

    if (!shapeTrack?.keyframes?.length) {
      console.warn('No keyframes found on track');
      return;
    }

    const sorted = [...shapeTrack.keyframes].sort((a, b) => a.timeSeconds - b.timeSeconds);
    if (sorted.length < 2) {
      console.warn('Need at least 2 keyframes to fill between');
      return;
    }

    const playheadSeconds = timelineContext?.getPositionSeconds?.()
      ?? timelineContext?.positionSeconds
      ?? timelinePositionSeconds
      ?? 0;
    const pos = Number.isFinite(playheadSeconds) ? playheadSeconds : 0;
    const TIME_EPSILON = 0.01;

    const left = [...sorted].reverse().find(kf => Number.isFinite(kf?.timeSeconds) && kf.timeSeconds < pos - TIME_EPSILON);
    const right = sorted.find(kf => Number.isFinite(kf?.timeSeconds) && kf.timeSeconds > pos + TIME_EPSILON);

    if (!left || !right) {
      console.warn('Need a keyframe on both sides of the playhead to fill between');
      return;
    }

    const startTime = left.timeSeconds;
    const endTime = right.timeSeconds;

    const count = Math.max(1, Math.floor(Number(options.count) || 3));
    if (!Number.isFinite(count) || count < 1) return;

    // Get variation weights from first layer (for global) or selected layer
    const refLayer = isGlobal ? layers[0] : layer;
    const variationWeights = {
      shape: refLayer?.variationShape ?? refLayer?.variation ?? 0.2,
      anim: refLayer?.variationAnim ?? refLayer?.variation ?? 0.2,
      color: refLayer?.variationColor ?? refLayer?.variation ?? 0.2,
      position: refLayer?.variationPosition ?? refLayer?.variation ?? 0.2,
      scale: refLayer?.variationScale ?? 0,
    };

    // Node modulation only for single-layer tracks (not global)
    let nodeMod = null;
    if (!isGlobal && enableBreathing && !!options.nodeModEnabled) {
      const amount = Number(options.nodeModAmount);
      const cycles = Number(options.nodeModCycles);
      nodeMod = {
        enabled: true,
        mode: 'sineRadial',
        amount: Number.isFinite(amount) ? Math.max(0.01, Math.min(0.5, amount)) : 0.15,
        cycles: Number.isFinite(cycles) ? Math.max(0.25, cycles) : 1,
        mask: 'all',
        phaseSpread: 0.5,
      };
    }

    let energyInfluenceValue = Number.isFinite(Number(options.energyInfluence))
      ? Math.max(0, Math.min(2, Number(options.energyInfluence)))
      : 0;
    if (!Number.isFinite(Number(options.energyInfluence)) && enableEnergyScaling && timelineContext.energyMap?.total?.length > 0) {
      energyInfluenceValue = Number.isFinite(energyInfluence)
        ? Math.max(0, Math.min(2, energyInfluence))
        : 0.5;
    }

    let keyframeIds;
    if (isGlobal) {
      // Global shape track: generate for all layers
      keyframeIds = timelineContext.generateGlobalKeyframesBetween?.(
        globalShapeTrack.id,
        layers,
        startTime,
        endTime,
        count,
        {
          energyInfluence: energyInfluenceValue,
          variationWeights,
          isParamRandomizable,
          constrainColorsToPalette: !!audioSpawnUseGlobalPalette,
          paletteColors: generationPaletteColors,
        }
      );
    } else {
      // Single-layer shape track
      keyframeIds = timelineContext.generateKeyframesBetween?.(
        shapeTrack.id,
        layer,
        startTime,
        endTime,
        count,
        {
          nodeMod,
          energyInfluence: energyInfluenceValue,
          variationWeights,
          isParamRandomizable,
          constrainColorsToPalette: !!audioSpawnUseGlobalPalette,
          paletteColors: generationPaletteColors,
        }
      );
    }

    if (keyframeIds?.length) {
      console.log('Generated', keyframeIds.length, isGlobal ? 'global' : '', 'keyframes between', startTime, 'and', endTime,
        nodeMod ? 'with node modulation' : '',
        energyInfluenceValue > 0 ? `with energy influence ${energyInfluenceValue}` : '');
    }
}, [timelineContext, layers, selectedLayerIndex, findShapeTrackForLayer, timelinePositionSeconds, isParamRandomizable, enableBreathing, enableEnergyScaling, energyInfluence, audioSpawnUseGlobalPalette, generationPaletteColors]);

  // Shift+C: capture current layers to a global shape keyframe (if global track exists)
  const handleCaptureGlobalKeyframe = useCallback(() => {
    if (!timelineContext?.visible) return;
    const globalShapeTrack = timelineContext.tracks?.find(t => t.type === 'globalShape');
    if (!globalShapeTrack) return;
    const time = timelineContext.captureGlobalShapeKeyframe?.(globalShapeTrack.id, layers, {});
    if (time != null) {
      console.log('Captured global shape keyframe at', time);
    }
  }, [timelineContext, layers]);

  // Keyboard shortcuts
		  useKeyboardShortcuts({
    setIsFrozen,
    toggleFullscreen,
    handleRandomizeAll,
    setIsOverlayVisible,
    setIsNodeEditMode: handleSetNodeEditMode,
    setSelectedLayerIndex,
    hotkeyRef,
    setZIgnore,
    setEditTarget,
    clearSelection,
    setParameterTargetMode,
    setShowLayerOutlines,
    setIsolateMode,
    deleteLayer,
    saveQuickPresetToMemory: handleRamPresetSave,
    recallQuickPresetFromMemory: handleRamPresetRecall,
    toggleBPM: bpmForAnimation?.togglePlay,
	    toggleAudio: audioReactive?.toggleAudio,
	    // Timeline controls
	    toggleTimeline: () => setTimelineMode?.((v) => !v),
	    toggleTimelinePlay: timelineContext?.togglePlay,
	    stopTimeline: timelineContext?.stop,
	    timelineVisible: timelineContext?.visible,
	    timelineIsPlaying: timelineContext?.isPlaying,
    // Variation keyframe generation
	    onGenerateVariationKeyframe: handleGenerateVariationKeyframe,
	    onGenerateRandomKeyframes: () => {
        const timelineEnd = timelineContext?.audio?.durationSeconds ?? timelineContext?.lengthSeconds;
	      if (panelGenerateRandomRef.current) {
	        panelGenerateRandomRef.current({
            replaceTrackKeyframes: true,
            regenerateExistingSequence: false,
            useTransients: true,
            count: undefined,
            startTime: 0,
            endTime: Number.isFinite(Number(timelineEnd)) ? Number(timelineEnd) : undefined,
          });
	      } else {
	        handleGenerateRandomKeyframes({
            replaceTrackKeyframes: true,
            regenerateExistingSequence: false,
            useTransients: true,
            count: undefined,
            startTime: 0,
            endTime: Number.isFinite(Number(timelineEnd)) ? Number(timelineEnd) : undefined,
          });
	      }
	    },
	    onFillKeyframesBetween: handleFillKeyframesBetween,
      onCaptureGlobalKeyframe: handleCaptureGlobalKeyframe,
	  });

  // MIDI helper refs and handlers integration
  const rndAllPrevRef = useRef(0);

  // Centralize all MIDI handlers
  const selectedIdxForMidi = Math.max(0, Math.min(selectedLayerIndex, Math.max(0, layers.length - 1)));
  useMIDIHandlers({
    registerParamHandler,
    setGlobalSpeedMultiplier,
    setGlobalBlendMode,
    blendModes,
    layers,
    setLayers,
    DEFAULT_LAYER,
    buildVariedLayerFrom,
    setSelectedLayerIndex,
    palettes,
    sampleColorsEven,
    assignOneColorPerLayer,
    backgroundColor,
    setBackgroundColor,
    rndAllPrevRef,
    handleRandomizeAll,
    clampedSelectedIndex: selectedIdxForMidi,
    layersCountParam,
  });

  // Centralize all Audio handlers (mirrors MIDI pattern)
  const audioRndAllPrevRef = useRef(0);
  const { registerAudioHandler } = audioReactive || {};
  useAudioHandlers({
    registerAudioHandler,
    setGlobalSpeedMultiplier,
    setGlobalBlendMode,
    blendModes,
    layers,
    setLayers,
    DEFAULT_LAYER,
    buildVariedLayerFrom,
    setSelectedLayerIndex,
    palettes,
    sampleColorsEven,
    backgroundColor,
    setBackgroundColor,
    rndAllPrevRef: audioRndAllPrevRef,
    handleRandomizeAll,
    clampedSelectedIndex: selectedIdxForMidi,
    globalPaletteIndex,
    setGlobalPaletteIndex,
    triggerAudioSpawn,
    audioMappings: audioReactive?.mappings,
    parameters,
  });

  // Register Audio handlers for individual layer parameters
  // NEW: Handlers write to modulation store instead of calling setLayers directly
  useAudioLayerHandlers({
    registerAudioHandler,
    layers,
    modulationStore,
    palettes,
    parameterTargetMode,
    audioMappings: audioReactive?.mappings,
    parameters,
  });

  // Centralize all BPM handlers (mirrors MIDI/Audio pattern)
  const bpmContext = useBPM();
  const bpmRndAllPrevRef = useRef(0);
  const { registerBPMHandler } = bpmContext || {};
  useBPMHandlers({
    registerBPMHandler,
    setGlobalSpeedMultiplier,
    setGlobalBlendMode,
    blendModes,
    layers,
    setLayers,
    DEFAULT_LAYER,
    buildVariedLayerFrom,
    setSelectedLayerIndex,
    palettes,
    sampleColorsEven,
    backgroundColor,
    setBackgroundColor,
    rndAllPrevRef: bpmRndAllPrevRef,
    handleRandomizeAll,
    clampedSelectedIndex: selectedIdxForMidi,
  });

  // Register BPM handlers for individual layer parameters
  // NEW: Handlers write to modulation store instead of calling setLayers directly
  useBPMLayerHandlers({
    registerBPMHandler,
    layers,
    modulationStore,
    palettes,
    parameterTargetMode,
  });

  // When switching from global to individual mode, clear modulations for non-selected layers
  const prevTargetModeRef = useRef(parameterTargetMode);
  useEffect(() => {
    const prevMode = prevTargetModeRef.current;
    prevTargetModeRef.current = parameterTargetMode;
    
    if (prevMode === 'global' && parameterTargetMode === 'individual') {
      // Get the currently selected layer's ID
      const selectedLayer = layers[selectedLayerIndex];
      const keepIds = selectedLayer?.id ? [selectedLayer.id] : [];
      
      // Clear modulations for all other layers
      if (modulationStore?.clearModsExcept) {
        modulationStore.clearModsExcept('audio', keepIds);
        modulationStore.clearModsExcept('bpm', keepIds);
      }
    }
  }, [parameterTargetMode, layers, selectedLayerIndex, modulationStore]);

  // Remove orphaned modulations when layers are deleted or replaced
  useEffect(() => {
    if (!modulationStore?.pruneLayerMods) return;
    const ids = Array.isArray(layers) ? layers.map(layer => layer?.id).filter(Boolean) : [];
    modulationStore.pruneLayerMods(ids);
  }, [layers, modulationStore]);

  // randomizeScene provided by hook

  useEffect(() => {
    if (!syncLayerColorsToFirst) return;
    if (!Array.isArray(layers) || layers.length <= 1) return;

    const baseLayer = layers[0] || {};
    const baseColors = Array.isArray(baseLayer.colors) ? baseLayer.colors : [];
    const baseNumColors = Number.isFinite(baseLayer.numColors) ? baseLayer.numColors : baseColors.length;
    const baseSelectedRaw = Number.isFinite(baseLayer.selectedColor) ? baseLayer.selectedColor : 0;
    const desiredSelected = baseColors.length > 0
      ? Math.max(0, Math.min(baseSelectedRaw, baseColors.length - 1))
      : 0;

    const allMatch = layers.slice(1).every(layer => {
      if (!layer) return false;
      const layerColors = Array.isArray(layer.colors) ? layer.colors : [];
      const colorsMatch = layerColors.length === baseColors.length && layerColors.every((c, i) => c === baseColors[i]);
      const numMatch = Number(layer.numColors) === baseNumColors;
      const layerSelectedRaw = Number.isFinite(layer.selectedColor) ? layer.selectedColor : 0;
      const layerSelected = baseColors.length > 0
        ? Math.max(0, Math.min(layerSelectedRaw, baseColors.length - 1))
        : 0;
      return colorsMatch && numMatch && layerSelected === desiredSelected;
    });

    if (allMatch) return;

    setLayers(prev => {
      if (!Array.isArray(prev) || prev.length <= 1) return prev;
      return prev.map((layer, idx) => {
        if (idx === 0) return layer;
        const layerColors = Array.isArray(layer?.colors) ? layer.colors : [];
        const colorsMatch = layerColors.length === baseColors.length && layerColors.every((c, i) => c === baseColors[i]);
        const numMatch = Number(layer?.numColors) === baseNumColors;
        const layerSelectedRaw = Number.isFinite(layer?.selectedColor) ? layer.selectedColor : 0;
        const layerSelected = baseColors.length > 0
          ? Math.max(0, Math.min(layerSelectedRaw, baseColors.length - 1))
          : 0;
        if (colorsMatch && numMatch && layerSelected === desiredSelected) return layer;
        return {
          ...layer,
          colors: [...baseColors],
          numColors: baseNumColors,
          selectedColor: desiredSelected,
        };
      });
    });
  }, [layers, setLayers, syncLayerColorsToFirst]);

  // Download helper – choose resolution, freeze time during export
  const downloadImage = useCallback(async () => {
    const wasFrozen = isFrozen;
    const wasSuppressing = suppressEphemeralOverlays;
    try {
      if (!wasSuppressing) {
        setSuppressEphemeralOverlays(true);
      }
      if (!wasFrozen) {
        setIsFrozen(true);
      }

      // Wait one frame so the freeze is reflected in the canvas output
      await new Promise(resolve => requestAnimationFrame(resolve));

      const canvasHandle = canvasRef.current;
      if (!canvasHandle) return;
      const src = canvasHandle.canvas || canvasHandle;
      if (!src) return;

      const viewW = src.width || 1;
      const viewH = src.height || 1;

      const choiceRaw = (window.prompt('Export size (A4, A3, A2, VIEW):', 'A3') || '').trim().toUpperCase();
      const choice = ['A4', 'A3', 'A2', 'VIEW'].includes(choiceRaw) ? choiceRaw : 'A3';
      const MAX_DIM = choice === 'VIEW'
        ? Math.max(viewW, viewH)
        : (choice === 'A4' ? 3508 : (choice === 'A2' ? 7016 : 4961));

      let targetW;
      let targetH;
      if (viewW >= viewH) {
        targetW = MAX_DIM;
        targetH = Math.round(MAX_DIM * viewH / viewW);
      } else {
        targetH = MAX_DIM;
        targetW = Math.round(MAX_DIM * viewW / viewH);
      }

      const off = document.createElement('canvas');
      off.width = targetW;
      off.height = targetH;
      const ctx = off.getContext('2d');
      if (!ctx) return;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(src, 0, 0, targetW, targetH);

      const blob = await new Promise(resolve => off.toBlob(resolve, 'image/png'));
      if (!blob) return;

      const link = document.createElement('a');
      link.download = `layered-shape-${choice.toLowerCase()}-${targetW}x${targetH}.png`;
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) {
      console.warn('High-res export failed', err);
    } finally {
      if (!wasFrozen) {
        try {
          setIsFrozen(false);
        } catch {
          /* noop */
        }
      }
      if (!wasSuppressing) {
        try {
          setSuppressEphemeralOverlays(false);
        } catch {
          /* noop */
        }
      }
    }
  }, [isFrozen, setIsFrozen, suppressEphemeralOverlays]);

  const canvasProps = {
    layers,
    layersRef: animatedLayersRef,
    overlayLayersRef: audioSpawnOverlayLayersRef,
    renderOverlayLayers: !suppressEphemeralOverlays,
    hideBaseLayers: audioSpawnPresetActive && audioSpawnEnabled && !timelineMode,
    hideLayerIndex: audioSpawnEnabled && !timelineMode ? selectedLayerIndex : -1,
    hideLayerId: audioSpawnEnabled && !timelineMode ? (layers?.[selectedLayerIndex]?.id || null) : null,
    isFrozen,
    colorFadeWhileFrozen,
    backgroundColor,
    globalSeed,
    globalBlendMode,
    isNodeEditMode,
    selectedLayerIndex,
    setLayers,
    setSelectedLayerIndex,
    classicMode,
    isolateMode,
    getActiveTargetLayerIds,
    feedbackTrailEnabled: !!milkdropFeedbackEnabled,
    feedbackTrailAmount: Math.max(0, Math.min(0.4, (Number(milkdropInfluence) || 0) / 260)),
  };

  const importAdjustProps = {
    showImportAdjust,
    importAdjust,
    applyImportAdjust,
    importFitEnabled,
    setImportFitEnabled,
    importDebug,
    setImportDebug,
    setShowImportAdjust,
  };

  const floatingActionProps = {
    onDownload: downloadImage,
    onRandomize: randomizeScene,
    onToggleFullscreen: toggleFullscreen,
    isFullscreen,
    onStartRecording: startRecording,
    onStopRecording: stopRecording,
    isRecording,
    onToggleTargetMode: toggleParameterTargetMode,
    parameterTargetMode,
  };

  const bottomPanelProps = {
    backgroundColor,
    setBackgroundColor,
    backgroundImage,
    setBackgroundImage,
    isFrozen,
    setIsFrozen,
    enableBreathing,
    setEnableBreathing,
    colorFadeWhileFrozen,
    setColorFadeWhileFrozen,
    classicMode,
    setClassicMode,
    zIgnore,
    setZIgnore,
    globalSeed,
    setGlobalSeed,
    globalSpeedMultiplier,
    setGlobalSpeedMultiplier,
    getIsRnd,
    setIsRnd,
    restoreIncludeRnd: setIncludeRnd,
    palettes: palettesWithCustom,
    automationPalettes: palettes,
    globalPaletteIndex,
    globalPaletteRef,
    setGlobalPaletteIndex,
    setGlobalPaletteRef,
    customPalettes,
    onSaveCustomPalette: addCustomPalette,
    blendModes,
    globalBlendMode,
    setGlobalBlendMode,
    parameterTargetMode,
    setParameterTargetMode,
    onQuickSave: handleQuickSave,
    onQuickLoad: handleQuickLoad,
    energyInfluence,
    setEnergyInfluence,
    audioSpawnEnabled,
    audioSpawnPresetActive,
    setAudioSpawnEnabled,
    setAudioSpawnPresetActive,
    audioSpawnTriggerMode,
    setAudioSpawnTriggerMode,
    audioSpawnRepeatWhileAbove,
    setAudioSpawnRepeatWhileAbove,
    audioSpawnHysteresis,
    setAudioSpawnHysteresis,
    audioSpawnUseGlobalPalette,
    setAudioSpawnUseGlobalPalette,
    audioSpawnBand,
    setAudioSpawnBand,
    audioSpawnThreshold,
    setAudioSpawnThreshold,
    audioSpawnCooldownMs,
    setAudioSpawnCooldownMs,
    audioSpawnHalfLifeMs,
    setAudioSpawnHalfLifeMs,
    audioSpawnHalfLifeEnergyFactor,
    setAudioSpawnHalfLifeEnergyFactor,
    audioSpawnMaxLayers,
    setAudioSpawnMaxLayers,
    audioSpawnMicReactive,
    setAudioSpawnMicReactive,
    milkdropInfluence,
    setMilkdropInfluence,
    milkdropFeedbackEnabled,
    setMilkdropFeedbackEnabled,
    timelineMode,
    setTimelineMode,
    layers: uiLayers,
    selectedLayerIds,
    toggleLayerSelection,
    clearSelection,
    layerGroups,
    editTarget,
    setEditTarget,
    getActiveTargetLayerIds,
    sampleColorsEven,
    assignOneColorPerLayer,
    setLayers,
    DEFAULT_LAYER,
    buildVariedLayerFrom,
    setSelectedLayerIndex,
    handleRandomizeAll,
    currentLayer,
    updateCurrentLayer,
    randomizeCurrentLayer,
    randomizeAnimationForCurrentLayer,
    randomizeCurrentLayerColors,
    baseColors,
    baseNumColors,
    isNodeEditMode,
    setIsNodeEditMode: handleSetNodeEditMode,
    randomizePalette,
    setRandomizePalette,
    randomizeNumColors,
    setRandomizeNumColors,
    syncLayerColorsToFirst,
    setSyncLayerColorsToFirst,
    colorCountMin,
    colorCountMax,
    setColorCountMin,
    setColorCountMax,
    layerNames: uiLayerNames,
    selectedLayerIndex: clampedSelectedIndex,
    selectLayer,
    addNewLayer,
    deleteLayer,
    moveSelectedLayerUp,
    moveSelectedLayerDown,
    handleImportSVGClick,
    presetSlots,
    getPresetSlot,
    loadAppState,
    morphEnabled,
    morphRoute,
    morphDurationPerLeg,
    morphEasing,
    morphLoopMode,
    setMorphEnabled,
    setMorphRoute,
    setMorphDurationPerLeg,
    setMorphEasing,
    setMorphLoopMode,
    morphMode,
    setMorphMode,
    applyVariationInstantly,
    setApplyVariationInstantly,
    randomizeColorsPerLayer,
    setRandomizeColorsPerLayer,
    uniformColorCount,
    setUniformColorCount,
  };

  const timelinePanelProps = {
    layers,
    animatedLayersRef,
    onClose: () => setTimelineMode?.(false),
    isRecording,
    onStartRecording: startRecording,
    onStopRecording: stopRecording,
    onGenerateVariationKeyframe: handleGenerateVariationKeyframe,
    onGenerateRandomKeyframes: handleGenerateRandomKeyframes,
    onFillKeyframesBetween: handleFillKeyframesBetween,
    onCaptureGlobalKeyframe: handleCaptureGlobalKeyframe,
    panelGenerateRandomRef,
  };

  return (
    <div ref={containerRef} className={`App ${isFullscreen ? 'fullscreen' : ''}`}>
      <main className="main-layout">
        <KeyboardShortcutsOverlay
          visible={showShortcuts}
          onClose={() => setShowShortcuts(false)}
        />
        
        {/* Hidden file inputs */}
        <input
          ref={svgFileInputRef}
          type="file"
          accept=".svg,image/svg+xml"
          multiple
          style={{ display: 'none' }}
          onChange={handleImportSVGFile}
        />
        {/* Hidden input used by JSON import handler */}
        <input
          ref={configFileInputRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={handleImportFile}
        />

        <WorkspaceRouter
          isFullscreen={isFullscreen}
          timelineMode={timelineMode}
          timelineVisible={timelineVisible}
          fullscreenWorkspaceProps={{
            canvasRef,
            canvasProps,
            floatingActionProps,
          }}
          freeWorkspaceProps={{
            canvasRef,
            canvasProps,
            importAdjustProps,
            floatingActionProps,
            onToggleTimelineMode: () => setTimelineMode?.((v) => !v),
            bottomPanelProps,
          }}
          timelineWorkspaceProps={{
            topBarHeight: TOP_BAR_HEIGHT,
            topPanelHeightExpr,
            timelineHeightExpr,
            leftPanelRatio,
            setLeftPanelRatio,
            topPanelRatio,
            setTopPanelRatio,
            canvasRef,
            canvasProps,
            importAdjustProps,
            floatingActionProps,
            onToggleTimelineMode: () => setTimelineMode?.((v) => !v),
            bottomPanelProps,
            timelinePanelProps,
          }}
        />
      </main>
    </div>
  );
};

// Root App (no router)
const App = () => (
  <AppProviders>
    <MainApp />
  </AppProviders>
);

export default App;
