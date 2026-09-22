import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useParameters } from './context/ParameterContext.jsx';
import { useAppState } from './context/AppStateContext.jsx';
import { useMidi } from './context/MidiContext.jsx';
import { useAudioReactive } from './context/AudioContext.jsx';
import { useBPM } from './context/BPMContext.jsx';
import { palettes } from './constants/palettes';
import { blendModes } from './constants/blendModes';
import { DEFAULTS, DEFAULT_LAYER } from './constants/defaults';
import { useFullscreen } from './hooks/useFullscreen';
import { useAnimation } from './hooks/useAnimation.js';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js';
import { useMIDIHandlers } from './hooks/useMIDIHandlers.js';
import { useMIDILayerParamHandlers } from './hooks/useMIDILayerParamHandlers.js';
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
import { useDocumentHistory } from './hooks/useDocumentHistory.js';
import { useSceneSnapshots } from './hooks/useSceneSnapshots.js';
import { useSvgImport } from './hooks/useSvgImport.js';
import './App.css';
import { sampleColorsEven as sampleColorsEvenUtil, distributeColorsAcrossLayers as distributeColorsAcrossLayersUtil, pickPaletteColors } from './utils/paletteUtils.js';
import { buildVariedLayerFrom as buildVariedLayerFromUtil } from './utils/layerVariation.js';
import { shouldBlurActiveTextInputOnPointerDown } from './utils/domUtils.js';
import { createCustomPaletteEntry, loadCustomPalettes, mergeCustomPalettes, saveCustomPalettes } from './utils/customPalettes.js';
import { createSeededRandom } from './utils/randomUtils.js';
import AppProviders from './components/app/AppProviders.jsx';
import WorkspaceRouter from './components/workspaces/WorkspaceRouter.jsx';
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
	    audioSpawnMicReactiveAmount,
	    audioSpawnForceContourMode,
	    audioSpawnDirectionMode,
	    audioSpawnDirectionSpread,
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
	    setAudioSpawnMicReactiveAmount,
	    setAudioSpawnForceContourMode,
	    setAudioSpawnDirectionMode,
	    setAudioSpawnDirectionSpread,
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
    editTarget,
    selectedLayerIds,
    toggleLayerSelection,
    getCurrentAppState,
    loadAppState,
    isDirty,
    setIsDirty,
    lastSavedAt,
    setLastSavedAt,
    applyVariationInstantly,
    setApplyVariationInstantly,
  } = appStateCtx;

  // MIDI context
  const {
    mappings: midiMappings,
    setMappingsFromExternal,
    registerParamHandler,
  } = useMidi() || {};
  const audioReactive = useAudioReactive();
  const bpmForAnimation = useBPM();

  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const includeRndRef = useRef(DEFAULT_INCLUDE_RND);
  const colorRandomCallRef = useRef(0);
  const configFileInputRef = React.useRef(null);
  const svgFileInputRef = React.useRef(null);
  const nodeEditDeleteHandlerRef = useRef(null);
  // Removed Global Colours UI
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(containerRef);
  const [isRecording, setIsRecording] = useState(false);
  const [includeRecordingAudio, setIncludeRecordingAudio] = useState(false);
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
	    try { audioReactive?.releaseRecordingStream?.(); } catch { /* noop */ }
	    recorderRef.current = { mediaRecorder: null, stream: null };
	    recordedChunksRef.current = [];
	    setIsRecording(false);
	    setSuppressEphemeralOverlays(false);
	  }, [audioReactive]);

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

    // Source audio is opt-in. The audio engine returns recording-only tracks,
    // so cleanup never stops microphone listening or file playback.
    let combinedStream = videoStream;
    const audioStream = includeRecordingAudio ? audioReactive?.getRecordingStream?.() : null;
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
      console.log('Recording video only');
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
	  }, [audioReactive, cleanupRecorder, includeRecordingAudio, isRecording, suppressEphemeralOverlays]);

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
  const { getAudioSnapshot, applyAudioSnapshot } = audioReactive || {};
  
  // BPM context
  const { getBPMSnapshot, applyBPMSnapshot } = bpmForAnimation || {};

  // Modulation store centralizes Audio and BPM modulation.
  // in a single setLayers call per frame (instead of multiple calls causing UI clogging)
  const modulationStore = useModulationStore();

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
	    enabled: !!audioSpawnEnabled,
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
	    micReactiveAmount: audioSpawnMicReactiveAmount,
	    forceContourMode: audioSpawnForceContourMode,
	    directionMode: audioSpawnDirectionMode,
	    directionSpreadDeg: audioSpawnDirectionSpread,
	  });

  // Enter node editing without a visual jump by committing the currently rendered
  // procedural position and geometry to the authored layer first.
  const handleSetNodeEditMode = useCallback((value, options = {}) => {
    if (value) {
      // CRITICAL: Sync the currently-rendered (animated) snapshot into React state before entering node edit mode.
      // Canvas uses `layers` (React state) in node edit mode, but `animatedLayersRef` in normal mode.
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

            // Also sync the currently-rendered geometry and key shape parameters.
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
      const layer = layersNow[selectedIndex];
      const context = {
        layerId: layer?.id || null,
        layerName: layer?.name || null,
      };

      setIsNodeEditMode(true, context);
    } else {
      // Exiting node edit mode - clear context
      setIsNodeEditMode(false);
    }
  }, [setIsNodeEditMode, setLayers]);

  // Start animation loop (position, bounce/drift, z-scale)
  // Modulations are now read from the store and applied in a single pass
  const pauseForNodeEditing = isNodeEditMode;
  useAnimation(null, isFrozen || pauseForNodeEditing, globalSpeedMultiplier, zIgnore, modulationStore, null, layersRef, animatedLayersRef, null);

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
        const stored = window.localStorage.getItem('artapp-studio-v1-includeRnd');
        if (stored) return { ...DEFAULT_INCLUDE_RND, ...JSON.parse(stored) };
      } catch { /* ignore */ }
      return DEFAULT_INCLUDE_RND;
    });
    useEffect(() => {
      includeRndRef.current = includeRnd;
      try { window.localStorage.setItem('artapp-studio-v1-includeRnd', JSON.stringify(includeRnd)); } catch { /* ignore */ }
    }, [includeRnd]);
	  const getIsRnd = React.useCallback((id) => !!includeRnd[id], [includeRnd]);
	  const setIsRnd = React.useCallback((id, v) => setIncludeRnd(prev => ({ ...prev, [id]: !!v })), []);

  // No local popovers; inline checkboxes next to controls

  // Clamps selection and expose currentLayer for Controls.
  // Controls should edit persisted layer state, not the throttled animated UI snapshot,
  // otherwise booleans like visibility can appear to snap back.
  // When a group is selected, show the first layer in that group.
  const clampedSelectedIndex = Math.max(0, Math.min(selectedLayerIndex, Math.max(0, (layers?.length || 0) - 1)));
  const currentLayer = useMemo(() => {
    const layerSource = (Array.isArray(layers) && layers.length > 0)
      ? layers
      : uiLayers;
    if (!Array.isArray(layerSource) || layerSource.length === 0) return DEFAULT_LAYER;

    // Default: use the selected layer index
    return layerSource[clampedSelectedIndex] || layerSource[0];
  }, [layers, uiLayers, clampedSelectedIndex]);

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

  const documentHistory = useDocumentHistory({
    capture: () => ({
      parameters,
      appState: { ...getCurrentAppState(), includeRnd },
      audioConfig: getAudioSnapshot?.() || null,
      bpmConfig: getBPMSnapshot?.() || null,
      midiMappings: midiMappings || {},
    }),
    restore: snapshot => {
      if (Array.isArray(snapshot?.parameters)) applyParametersSnapshot?.(snapshot.parameters);
      if (snapshot?.appState) {
        loadAppState?.(snapshot.appState);
        if (snapshot.appState.includeRnd) setIncludeRnd({ ...DEFAULT_INCLUDE_RND, ...snapshot.appState.includeRnd });
      }
      if (snapshot?.audioConfig) applyAudioSnapshot?.(snapshot.audioConfig);
      if (snapshot?.bpmConfig) applyBPMSnapshot?.(snapshot.bpmConfig);
      if (snapshot?.midiMappings) setMappingsFromExternal?.(snapshot.midiMappings);
    },
  });

  const {
    getFullAppState,
    handleQuickSave,
    handleQuickLoad,
    handleImportFile,
  } = useSceneSnapshots({
    canvasRef,
    configFileInputRef,
    parameters,
    getCurrentAppState,
    includeRnd,
    setIncludeRnd,
    defaultIncludeRnd: DEFAULT_INCLUDE_RND,
    customPalettes,
    midiMappings,
    getAudioSnapshot,
    applyAudioSnapshot,
    getBPMSnapshot,
    applyBPMSnapshot,
    applyParametersSnapshot,
    loadAppState,
    getSavedConfigList,
    loadFullConfiguration,
    loadParameters,
    setMappingsFromExternal,
    mergeCustomPaletteList,
    resetDocumentHistory: documentHistory.reset,
  });

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
  const parameterConfigMap = useMemo(() => {
    const map = new Map();
    (Array.isArray(parameters) ? parameters : []).forEach((p) => {
      if (p && p.id) map.set(p.id, p);
    });
    return map;
  }, [parameters]);
  const isParamRandomizable = useCallback((id) => {
    if (randomizableParamMap.has(id)) return randomizableParamMap.get(id);
    return undefined;
  }, [randomizableParamMap]);
  const getParamConfig = useCallback((id) => {
    if (parameterConfigMap.has(id)) return parameterConfigMap.get(id);
    return null;
  }, [parameterConfigMap]);

  // Build a new layer by varying from a previous layer using split variation weights
  const buildVariedLayerFrom = useCallback(
    (prev, nameIndex, baseVar, options = {}) => buildVariedLayerFromUtil(prev, nameIndex, baseVar, {
      DEFAULT_LAYER,
      palettes: palettesWithCustom,
      isParamRandomizable,
      getParamConfig,
      randomizeColorsPerLayer,
      uniformColorCount,
      ...options,
    }),
    [getParamConfig, isParamRandomizable, palettesWithCustom, randomizeColorsPerLayer, uniformColorCount],
  );

  const {
    handleImportSVGClick,
    handleImportSVGFile,
  } = useSvgImport({
    svgFileInputRef,
    layersRef,
    selectedLayerIndex,
    setLayers,
    setSelectedLayerIndex,
    handleSetNodeEditMode,
    importBaseRef,
    importRawRef,
    importFitEnabled,
    setImportAdjust,
    setImportFitEnabled,
    setImportDebug,
    setShowImportAdjust,
    defaultLayer: DEFAULT_LAYER,
  });


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
    nodeEditDeleteHandlerRef,
    toggleBPM: bpmForAnimation?.togglePlay,
	    toggleAudio: audioReactive?.toggleAudio,
	  });

  // MIDI helper refs and handlers integration
  const rndAllPrevRef = useRef(0);

  // Centralize all MIDI handlers
  const selectedIdxForMidi = Math.max(0, Math.min(selectedLayerIndex, Math.max(0, layers.length - 1)));
  useMIDIHandlers({
    registerParamHandler,
    setGlobalSpeedMultiplier,
    setGlobalBlendMode,
    setGlobalPaletteIndex,
    setGlobalPaletteRef,
    globalPaletteIndex,
    blendModes,
    parameters,
    applyVariationInstantly,
    audioSpawnUseGlobalPalette,
    paletteColorsForVariation: generationPaletteColors,
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
    randomizeCurrentLayer,
    randomizeAnimationForCurrentLayer,
    randomizeCurrentLayerColors,
    clampedSelectedIndex: selectedIdxForMidi,
    layersCountParam,
  });

  useMIDILayerParamHandlers({
    registerParamHandler,
    parameters,
    layers,
    setLayers,
    selectedLayerIndex,
    parameterTargetMode,
    getActiveTargetLayerIds,
    palettes,
    sampleColors: sampleColorsEven,
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
    hideBaseLayers: audioSpawnPresetActive && audioSpawnEnabled,
    hideLayerIndex: audioSpawnEnabled ? selectedLayerIndex : -1,
    hideLayerId: audioSpawnEnabled ? (layers?.[selectedLayerIndex]?.id || null) : null,
    isFrozen: isFrozen || pauseForNodeEditing,
    colorFadeWhileFrozen,
    backgroundColor,
    globalSeed,
    globalBlendMode,
    isNodeEditMode,
    selectedLayerIndex,
    setIsNodeEditMode: handleSetNodeEditMode,
    setLayers,
    setSelectedLayerIndex,
    nodeEditDeleteHandlerRef,
    classicMode,
    isolateMode,
    getActiveTargetLayerIds,
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
    includeRecordingAudio,
    setIncludeRecordingAudio,
    onToggleTargetMode: toggleParameterTargetMode,
    parameterTargetMode,
  };

  const bottomPanelProps = {
    canUndo: documentHistory.canUndo,
    canRedo: documentHistory.canRedo,
    undo: documentHistory.undo,
    redo: documentHistory.redo,
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
    toggleParameterTargetMode,
    toggleOutlines: () => setShowLayerOutlines(value => !value),
    toggleIsolate: () => setIsolateMode(value => !value),
    toggleZIgnore: () => setZIgnore(value => !value),
    toggleBPM: bpmForAnimation?.togglePlay,
    toggleAudio: audioReactive?.toggleAudio,
    previousLayer: () => setSelectedLayerIndex(value => Math.max(0, Number(value || 0) - 1)),
    nextLayer: () => setSelectedLayerIndex(value => Math.min(Math.max(0, uiLayers.length - 1), Number(value || 0) + 1)),
    selectLayerNumber: key => {
      const index = Math.max(0, Math.min(Math.max(0, uiLayers.length - 1), Number(key) - 1));
      setSelectedLayerIndex(index);
    },
    deleteSelection: () => deleteLayer?.(clampedSelectedIndex),
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
    audioSpawnMicReactiveAmount,
    setAudioSpawnMicReactiveAmount,
    audioSpawnForceContourMode,
    setAudioSpawnForceContourMode,
    audioSpawnDirectionMode,
    setAudioSpawnDirectionMode,
    audioSpawnDirectionSpread,
    setAudioSpawnDirectionSpread,
    layers: uiLayers,
    selectedLayerIds,
    toggleLayerSelection,
    clearSelection,
    editTarget,
    setEditTarget,
    getActiveTargetLayerIds,
    sampleColorsEven,
    assignOneColorPerLayer,
    setLayers,
    DEFAULT_LAYER,
    buildVariedLayerFrom,
    paletteColorsForVariation: generationPaletteColors,
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
    applyVariationInstantly,
    setApplyVariationInstantly,
    randomizeColorsPerLayer,
    setRandomizeColorsPerLayer,
    uniformColorCount,
    setUniformColorCount,
  };

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;

    const handlePointerDown = (event) => {
      const activeElement = document.activeElement;
      if (!shouldBlurActiveTextInputOnPointerDown(activeElement, event.target)) return;

      try {
        activeElement.blur?.();
      } catch {
        return;
      }

      try {
        containerRef.current?.focus?.({ preventScroll: true });
      } catch {
        containerRef.current?.focus?.();
      }
    };

    window.addEventListener('pointerdown', handlePointerDown, true);
    return () => window.removeEventListener('pointerdown', handlePointerDown, true);
  }, []);

  return (
    <div
      ref={containerRef}
      className={`App ${isFullscreen ? 'fullscreen' : ''}`}
      tabIndex={-1}
    >
      <main className="main-layout">
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
          freeWorkspaceProps={{
            canvasRef,
            canvasProps,
            importAdjustProps,
            floatingActionProps,
            bottomPanelProps,
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
