import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ParameterProvider, useParameters } from './context/ParameterContext.jsx';
import { AppStateProvider, useAppState } from './context/AppStateContext.jsx';
import { MidiProvider, useMidi } from './context/MidiContext.jsx';
import { palettes } from './constants/palettes';
import { blendModes } from './constants/blendModes';
import { DEFAULTS, DEFAULT_LAYER } from './constants/defaults';
import { svgStringToNodes, samplePath, extractMergedNodesWithTransforms } from './utils/svgToNodes';
import { importSVGFiles, parseSVGForImport, createLayerFromSVG } from './utils/svgImportEnhanced';
import { useFullscreen } from './hooks/useFullscreen';
import { useAnimation } from './hooks/useAnimation.js';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js';
import { useMIDIHandlers } from './hooks/useMIDIHandlers.js';
import { useImportAdjust } from './hooks/useImportAdjust.js';
import { useLayerManagement } from './hooks/useLayerManagement.js';
import { useRandomization } from './hooks/useRandomization.js';
import './App.css';
import { sampleColorsEven as sampleColorsEvenUtil, distributeColorsAcrossLayers as distributeColorsAcrossLayersUtil, assignOneColorPerLayer as assignOneColorPerLayerPure, pickPaletteColors } from './utils/paletteUtils.js';
import { buildVariedLayerFrom as buildVariedLayerFromUtil } from './utils/layerVariation.js';

import Canvas, { drawShape, drawLayerWithWrap, drawImage } from './components/Canvas';
import Controls from './components/Controls';
import GlobalControls from './components/global/GlobalControls.jsx';
import ImportAdjustPanel from './components/global/ImportAdjustPanel.jsx';
import SidebarResizer from './components/global/SidebarResizer.jsx';
import FloatingActionButtons from './components/global/FloatingActionButtons.jsx';
import BottomPanel from './components/BottomPanel.jsx';
// LayerList removed; layer management moved to Controls header
// Settings page not used; quick export/import handled inline

// The MainApp component now contains all the core application logic
const MainApp = () => {
  const { parameters, updateParameter } = useParameters(); // Get parameters from context
  // Get app state from context
  const {
    isFrozen, setIsFrozen,
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
    parameterTargetMode, setParameterTargetMode,
    // Global: fade while frozen
    colorFadeWhileFrozen, setColorFadeWhileFrozen,
    showLayerOutlines, setShowLayerOutlines,
    clearSelection,
    setEditTarget,
  } = useAppState();

  // MIDI context
  const {
    supported: midiSupported,
    inputs: midiInputs,
    selectedInputId: midiInputId,
    setSelectedInputId: setMidiInputId,
    mappings: midiMappings,
    setMappingsFromExternal,
    registerParamHandler,
    beginLearn,
    clearMapping,
    mappingLabel,
    learnParamId,
  } = useMidi() || {};

  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const controlsRef = useRef(null);
  const configFileInputRef = React.useRef(null);
  const svgFileInputRef = React.useRef(null);
  // Removed Global Colours UI
  const [sidebarWidth, setSidebarWidth] = useState(350);
  const dragRef = useRef({ dragging: false, startX: 0, startW: 350 });
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(containerRef);
  // Global MIDI learn UI visibility
  const [showGlobalMidi, setShowGlobalMidi] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const recorderRef = useRef({ mediaRecorder: null, chunks: [], stream: null });
  const latestRecordingNameRef = useRef('art-recording');

  const cleanupRecorder = useCallback(() => {
    try {
      const { stream } = recorderRef.current || {};
      if (stream) {
        stream.getTracks()?.forEach(track => {
          try { track.stop(); } catch {}
        });
      }
    } catch {}
    recorderRef.current = { mediaRecorder: null, chunks: [], stream: null };
  }, []);

  const startRecording = useCallback(() => {
    if (isRecording) return;
    const canvasHandle = canvasRef.current;
    const canvasEl = canvasHandle?.canvas || canvasHandle;
    if (!canvasEl || typeof canvasEl.captureStream !== 'function') {
      window.alert('Recording is not supported in this browser (missing canvas.captureStream).');
      return;
    }

    let stream;
    try {
      stream = canvasEl.captureStream(60);
    } catch (err) {
      console.warn('Failed to capture canvas stream', err);
      window.alert('Unable to start recording: canvas capture stream failed.');
      return;
    }

    if (!stream) {
      window.alert('Unable to start recording: no stream produced.');
      return;
    }

    const chunks = [];
    // Prefer MP4 (H.264) when supported by the browser; fall back to WebM variants
    const typeCandidates = [
      'video/mp4;codecs=h264',
      'video/mp4',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ];

    const pickRecorderOptions = () => {
      if (typeof MediaRecorder === 'undefined') return null;
      for (const mimeType of typeCandidates) {
        try {
          if (!MediaRecorder.isTypeSupported || MediaRecorder.isTypeSupported(mimeType)) {
            return { mimeType };
          }
        } catch {}
      }
      return {};
    };

    const options = pickRecorderOptions();
    if (!options) {
      window.alert('MediaRecorder is not available in this browser.');
      stream.getTracks()?.forEach(track => { try { track.stop(); } catch {}; });
      return;
    }

    let mediaRecorder;
    try {
      mediaRecorder = new MediaRecorder(stream, options);
    } catch (err) {
      console.warn('Failed to create MediaRecorder with options', options, err);
      try {
        mediaRecorder = new MediaRecorder(stream);
      } catch (fallbackErr) {
        console.warn('Failed to create MediaRecorder without options', fallbackErr);
        window.alert('Unable to start recording: MediaRecorder could not be initialized.');
        stream.getTracks()?.forEach(track => { try { track.stop(); } catch {}; });
        return;
      }
    }

    mediaRecorder.ondataavailable = (event) => {
      if (event?.data && event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    mediaRecorder.onerror = (event) => {
      console.warn('MediaRecorder error', event?.error || event);
      window.alert('Recording encountered an error. Stopping recording.');
      try { mediaRecorder.stop(); } catch {}
    };

    mediaRecorder.onstop = () => {
      try {
        const mime = mediaRecorder.mimeType || 'video/webm';
        const blob = chunks.length ? new Blob(chunks, { type: mime }) : null;
        if (blob) {
          const nameInput = window.prompt('Save recording as (no extension needed):', latestRecordingNameRef.current || 'art-recording');
          const baseNameRaw = (nameInput || latestRecordingNameRef.current || 'art-recording').trim();
          const baseName = baseNameRaw.length ? baseNameRaw : 'art-recording';
          latestRecordingNameRef.current = baseName;
          const safeName = baseName.replace(/[^a-z0-9-_]+/gi, '-');
          // Pick extension based on actual recorder MIME
          const lower = (mime || '').toLowerCase();
          const ext = lower.includes('mp4') ? 'mp4' : 'webm';
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = `${safeName}.${ext}`;
          anchor.click();
          URL.revokeObjectURL(url);
        } else {
          window.alert('Recording stopped but produced no data.');
        }
      } catch (err) {
        console.warn('Failed to export recording', err);
        window.alert('Recording stopped but exporting failed. Check console for details.');
      } finally {
        cleanupRecorder();
        setIsRecording(false);
      }
    };

    recorderRef.current = { mediaRecorder, chunks, stream };

    try {
      mediaRecorder.start();
    } catch (err) {
      console.warn('MediaRecorder.start failed', err);
      window.alert('Unable to start recording: MediaRecorder start failed.');
      cleanupRecorder();
      setIsRecording(false);
      return;
    }

    setIsRecording(true);
  }, [canvasRef, cleanupRecorder, isRecording]);

  const stopRecording = useCallback(() => {
    const { mediaRecorder } = recorderRef.current || {};
    if (!mediaRecorder) {
      cleanupRecorder();
      setIsRecording(false);
      return;
    }
    setIsRecording(false);
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
  // Keep latest values accessible to hotkeys without re-binding listeners
  const hotkeyRef = useRef({ selectedIndex: 0, layersLen: 0, overlayVisible: true, nodeEditMode: false });
  useEffect(() => {
    hotkeyRef.current = {
      selectedIndex: Math.max(0, Math.min(selectedLayerIndex, Math.max(0, layers.length - 1))),
      layersLen: Array.isArray(layers) ? layers.length : 0,
      overlayVisible: !!isOverlayVisible,
      nodeEditMode: !!isNodeEditMode,
      zIgnore: !!zIgnore,
      parameterTargetMode,
      showLayerOutlines: !!showLayerOutlines,
    };
  }, [selectedLayerIndex, layers, isOverlayVisible, isNodeEditMode, zIgnore, parameterTargetMode, showLayerOutlines]);

  const layersRef = useRef(layers);
  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);

  // Diagnostics: log a concise snapshot when layers change to verify only targeted layers update
  useEffect(() => {
    try {
      const snapshot = (Array.isArray(layers) ? layers : []).map(l => ({
        id: l?.id,
        name: l?.name,
        numSides: l?.numSides,
        movementSpeed: l?.movementSpeed,
        rotation: l?.rotation,
      }));
      // console.debug('[App] layers changed:', snapshot);
    } catch {}
  }, [layers]);
  // Suppress animation briefly during direct user edits to avoid state races
  const [suppressAnimation, setSuppressAnimation] = useState(false);
  const suppressTimerRef = useRef(null);

  // Cleanup any pending suppression timer on unmount
  useEffect(() => {
    return () => {
      try {
        if (suppressTimerRef.current) {
          clearTimeout(suppressTimerRef.current);
          suppressTimerRef.current = null;
        }
      } catch {}
    };
  }, []);

  useEffect(() => {
    return () => {
      try {
        const { mediaRecorder } = recorderRef.current || {};
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
          mediaRecorder.stop();
        }
      } catch {}
      cleanupRecorder();
    };
  }, [cleanupRecorder]);

  // Global key handler for toggling shortcuts overlay
  useEffect(() => {
    const onKey = (e) => {
      // ignore inputs
      const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) return;
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
  const onSidebarMouseMove = useCallback((e) => {
    const st = dragRef.current || {};
    if (!st.dragging) return;
    const dx = (e.clientX || 0) - (st.startX || 0);
    const nextW = Math.max(240, Math.min(800, (st.startW || 350) + dx));
    setSidebarWidth(nextW);
  }, []);

  const onSidebarMouseUp = useCallback(() => {
    const st = dragRef.current || {};
    if (!st.dragging) return;
    dragRef.current = { ...st, dragging: false };
    window.removeEventListener('mousemove', onSidebarMouseMove);
    window.removeEventListener('mouseup', onSidebarMouseUp);
  }, [onSidebarMouseMove]);

  const startResize = useCallback((e) => {
    try { e.preventDefault(); } catch {}
    const sx = Number(e?.clientX) || 0;
    dragRef.current = { dragging: true, startX: sx, startW: sidebarWidth };
    window.addEventListener('mousemove', onSidebarMouseMove);
    window.addEventListener('mouseup', onSidebarMouseUp);
  }, [sidebarWidth, onSidebarMouseMove, onSidebarMouseUp]);

  useEffect(() => {
    // Cleanup listeners on unmount just in case
    return () => {
      try {
        window.removeEventListener('mousemove', onSidebarMouseMove);
        window.removeEventListener('mouseup', onSidebarMouseUp);
      } catch {}
    };
  }, [onSidebarMouseMove, onSidebarMouseUp]);

  // --- Import adjust panel state (moved to hook) ---
  const {
    showImportAdjust, setShowImportAdjust,
    importAdjust, setImportAdjust,
    importFitEnabled, setImportFitEnabled,
    importDebug, setImportDebug,
    importBaseRef, importRawRef,
    recomputeImportLayout, applyImportAdjust,
  } = useImportAdjust({ setLayers });

  // Start animation loop (position, bounce/drift, z-scale)
  useAnimation(setLayers, isFrozen, globalSpeedMultiplier, zIgnore);

  // Remember prior frozen state when entering node edit mode
  const prevFrozenRef = useRef(null);

  // Config save/load from contexts
  const {
    /* unused: saveParameters */
    loadParameters,
    /* unused: saveFullConfiguration */
    loadFullConfiguration,
    getSavedConfigList,
  } = useParameters();
  const { getCurrentAppState, loadAppState } = useAppState();

  // Randomize All include toggles (Global section) — store locally to control Randomize All behavior
  const [includeRnd, setIncludeRnd] = useState({
    backgroundColor: true,
    globalSpeedMultiplier: true,
    globalBlendMode: true,
    globalOpacity: true,
    layersCount: true,
    // Split variation include flags
    variationPosition: true,
    variationShape: true,
    variationAnim: true,
    variationColor: true,
    // legacy key kept for backward compat with saved states; not used by new UI
    variation: true,
  });
  const getIsRnd = React.useCallback((id) => !!includeRnd[id], [includeRnd]);
  const setIsRnd = React.useCallback((id, v) => setIncludeRnd(prev => ({ ...prev, [id]: !!v })), []);

  // No local popovers; inline checkboxes next to controls

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

  // Clamp selection and expose currentLayer for Controls
  const clampedSelectedIndex = Math.max(0, Math.min(selectedLayerIndex, Math.max(0, (layers?.length || 0) - 1)));
  const currentLayer = (Array.isArray(layers) && layers.length > 0)
    ? (layers[clampedSelectedIndex] || layers[0])
    : DEFAULT_LAYER;

  const handleQuickSave = useCallback(() => {
    const baseName = (window.prompt('Enter filename for export (no extension):', 'scene') || '').trim();
    if (!baseName) return;
    const includeState = window.confirm('Include app state (layers, background, animation)?');
    const payload = {
      parameters,
      appState: includeState ? getCurrentAppState() : null,
      midiMappings: midiMappings || {},
      savedAt: new Date().toISOString(),
      version: includeState ? '1.1' : '1.0',
    };
    downloadJson(`${baseName}.json`, payload);
  }, [parameters, getCurrentAppState, midiMappings, downloadJson]);

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

  // Helper to evenly sample colors from a palette to a desired count (with repeats allowed)
  // Memoized to provide a stable function identity to child components/hooks
  const sampleColorsEven = useCallback((base = [], count = 0) => sampleColorsEvenUtil(base, count), []);

  // Assign exactly ONE colour per layer (cycled) so Global palette preset can be detected reliably
  // Memoized to provide a stable function identity to child components/hooks
  const assignOneColorPerLayer = useCallback((colors) => {
    const src = Array.isArray(colors) ? colors : [];
    setLayers(prev => prev.map((l, i) => {
      const col = src.length ? src[i % src.length] : '#ffffff';
      return { ...l, colors: [col], numColors: 1, selectedColor: 0 };
    }));
  }, [setLayers]);

  // Build a new layer by varying from a previous layer using split variation weights
  const buildVariedLayerFrom = useCallback(
    (prev, nameIndex, baseVar) => buildVariedLayerFromUtil(prev, nameIndex, baseVar, { DEFAULT_LAYER, palettes }),
    [],
  );

  const handleImportFile = useCallback(async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      // Apply MIDI mappings immediately if present
      try { if (data && data.midiMappings && setMappingsFromExternal) setMappingsFromExternal(data.midiMappings); } catch (e) { /* ignore */ }
      // Save imported JSON into localStorage under a unique name, then load via existing loaders
      const base = file.name.replace(/\.json$/i, '') || 'imported';
      const existing = new Set(getSavedConfigList());
      let name = base;
      let i = 1;
      while (existing.has(name)) { name = `${base}-${i++}`; }
      const key = `artapp-config-${name}`;
      localStorage.setItem(key, JSON.stringify(data));
      // update list
      const list = getSavedConfigList();
      if (!list.includes(name)) {
        localStorage.setItem('artapp-config-list', JSON.stringify([...list, name]));
      }
      const loadState = window.confirm('Load app state if available?');
      const res = loadState ? loadFullConfiguration(name) : loadParameters(name);
      if (res?.success && loadState && res.appState) {
        loadAppState(res.appState);
      }
      alert(`Imported '${name}'`);
  } catch (err) {
      console.warn('Failed to import JSON', err);
      alert('Failed to import JSON');
    } finally {
      // reset input to allow re-selecting the same file later
      e.target.value = '';
    }
  }, [getSavedConfigList, loadAppState, loadFullConfiguration, loadParameters, setMappingsFromExternal]);

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
        distributePositions: fileList.length > 1,  // Auto-distribute multiple files
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
      setIsNodeEditMode(true);
      
      // Success log
      console.log(`Successfully imported ${newLayers.length} SVG layer(s) and appended to ${layers.length} existing layer(s)`);
    } catch (err) {
      console.warn('Failed to import SVG', err);
      alert('Failed to import SVG');
    } finally {
      e.target.value = '';
    }
  }, [applyImportAdjust, importBaseRef, importDebug, importFitEnabled, importRawRef, importSVGFiles, layers.length, layersRef, recomputeImportLayout, selectedLayerIndex, setImportAdjust, setImportDebug, setImportFitEnabled, setIsNodeEditMode, setLayers, setSelectedLayerIndex, setShowImportAdjust]);


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
    palettes,
    blendModes,
    layers,
    selectedLayerIndex,
    randomizePalette,
    randomizeNumColors,
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
    const baseColors = Array.isArray(layer.colors) ? layer.colors : [];
    // NOTE: This path intentionally uses true entropy for quick exploration
    // Deterministic flows are handled inside useRandomization via seeded RNG
    const srcPalette = randomizePalette
      ? pickPaletteColors(palettes, Math.random, baseColors)
      : baseColors;
    const cMin = Math.max(1, Math.floor(colorCountMin));
    const cMaxCap = Math.max(cMin, Math.floor(colorCountMax));
    let n = Number.isFinite(layer.numColors) ? layer.numColors : (baseColors.length || 1);
    if (randomizeNumColors) {
      const maxN = Math.min(cMaxCap, (srcPalette.length || cMaxCap));
      const minN = cMin;
      n = maxN > 0 ? Math.floor(Math.random() * (maxN - minN + 1)) + minN : 1;
    }
    let nextColors = sampleColorsEven(srcPalette, Math.max(1, n));
    // Fallbacks when both toggles are off: ensure a visible change
    if (!randomizePalette && !randomizeNumColors) {
      const same = Array.isArray(baseColors) && baseColors.length === nextColors.length && baseColors.every((c, i) => c === nextColors[i]);
      if (same) {
        if ((baseColors?.length || 0) <= 1) {
          // Single colour: pick a different colour from a palette
          const pool = pickPaletteColors(palettes, Math.random, baseColors.length ? baseColors : ['#ffffff']);
          if (pool.length) {
            // Try to pick a colour that's different
            let pick = pool[Math.floor(Math.random() * pool.length)];
            if (baseColors.length && pool.length > 1) {
              let guard = 0;
              while (pick === baseColors[0] && guard++ < 8) {
                pick = pool[Math.floor(Math.random() * pool.length)];
              }
            }
            nextColors = [pick];
            n = 1;
          }
        } else {
          // Multiple colours: rotate by a random offset to change order deterministically
          const arr = [...baseColors];
          const len = arr.length;
          const offset = Math.max(1, Math.floor(Math.random() * len));
          nextColors = Array.from({ length: len }, (_, i) => arr[(i + offset) % len]);
        }
      }
    }
    const updated = { ...layer, colors: nextColors, numColors: nextColors.length, selectedColor: 0 };
    setLayers(prev => prev.map((l, i) => (i === idx ? updated : l)));
  }, [colorCountMax, colorCountMin, palettes, randomizeNumColors, randomizePalette, sampleColorsEven, selectedLayerIndex, setLayers]);

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
    setShowGlobalMidi,
    setIsOverlayVisible,
    setIsNodeEditMode,
    setSelectedLayerIndex,
    hotkeyRef,
    setZIgnore,
    setEditTarget,
    clearSelection,
    setParameterTargetMode,
    setShowLayerOutlines,
  });

  // MIDI helper refs and handlers integration
  const rndAllPrevRef = useRef(0);
  const rndLayerPrevRef = useRef(0);

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
  });

  // randomizeScene provided by hook

  // Download helper – choose resolution, freeze time during export
  const downloadImage = useCallback(async () => {
    try {
      // 1. Freeze animation to capture exact frame
      const wasFrozen = isFrozen;
      if (!wasFrozen) setIsFrozen(true);
      // Wait one animation frame to ensure freeze applied and Canvas has repainted
      await new Promise(res => requestAnimationFrame(() => res()));

      const canvasHandle = canvasRef.current;
      if (!canvasHandle) return;
      const src = canvasHandle.canvas || canvasHandle;
      if (!src) return;

      const viewW = src.width || 1;
      const viewH = src.height || 1;
      // 2. Ask user for resolution choice
      const choiceRaw = (window.prompt('Export size (A4, A3, A2, VIEW):', 'A3') || '').trim().toUpperCase();
      const choice = ['A4','A3','A2','VIEW'].includes(choiceRaw) ? choiceRaw : 'A3';
      const MAX_DIM = (choice === 'VIEW') ? Math.max(viewW, viewH) : (choice === 'A4' ? 3508 : (choice === 'A2' ? 7016 : 4961));

      let targetW, targetH;
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

      // Fill background
      ctx.fillStyle = backgroundColor || '#ffffff';
      ctx.fillRect(0, 0, targetW, targetH);

      const animTime = (canvasHandle.getAnimationTime ? canvasHandle.getAnimationTime() : 0) || 0;
      // Render each layer exactly once at high resolution
      const snapshot = layersRef.current || [];
      snapshot.forEach(layer => {
        if (!layer?.visible) return;
        drawLayerWithWrap(ctx, layer, off, (c, l, cv) => {
          if (l.image && l.image.src) {
            drawImage(c, l, cv, globalBlendMode);
          } else {
            drawShape(c, l, cv, globalSeed, animTime, false, globalBlendMode);
          }
        });
      });

      off.toBlob(blob => {
        if (!blob) return;
        const link = document.createElement('a');
        link.download = `layered-shape-${choice.toLowerCase()}-${targetW}x${targetH}.png`;
        link.href = URL.createObjectURL(blob);
        link.click();
        URL.revokeObjectURL(link.href);
        // 4. Restore previous frozen state
        if (!wasFrozen) setIsFrozen(false);
      }, 'image/png');
    } catch (err) {
      console.warn('High-res export failed', err);
      try { if (!isFrozen) setIsFrozen(false); } catch {}
    }
  }, [backgroundColor, globalBlendMode, globalSeed, isFrozen, setIsFrozen]);

  return (
    <div className={`App ${isFullscreen ? 'fullscreen' : ''}`}>
      <main className="main-layout">
        {/* Keyboard Shortcuts Overlay */}
        {showShortcuts && (
          <div className="shortcuts-overlay" aria-live="polite" aria-modal="true" role="dialog">
            <div className="shortcuts-card">
              <div className="shortcuts-title">Keyboard Shortcuts</div>
              <div className="shortcuts-grid">
                <div><kbd>1</kbd><span>Global tab</span></div>
                <div><kbd>2</kbd><span>Layer Shape tab</span></div>
                <div><kbd>3</kbd><span>Layer Animation tab</span></div>
                <div><kbd>4</kbd><span>Layer Colour tab</span></div>
                <div><kbd>5</kbd><span>Presets tab</span></div>
                <div><kbd>F</kbd><span>Toggle Fullscreen</span></div>
                <div><kbd>G</kbd><span>Toggle target Individual / Global</span></div>
                <div><kbd>O</kbd><span>Show / Hide layer outlines</span></div>
                <div><kbd>L</kbd><span>Lock / Unlock control panel</span></div>
                <div><kbd>M</kbd><span>Toggle MIDI panel</span></div>
                <div><kbd>Space</kbd><span>Freeze / Unfreeze</span></div>
                <div><kbd>Shift</kbd> + <kbd>1</kbd>..<kbd>9</kbd><span>Activate Layers 1–9</span></div>
                <div><kbd>H</kbd><span>Hide / Show control panel</span></div>
                <div><kbd>K</kbd><span>Toggle this shortcuts panel</span></div>
                <div><kbd>Esc</kbd><span>Close dialogs/overlays</span></div>
              </div>
              <div className="shortcuts-hint">Press Esc or K to close</div>
            </div>
          </div>
        )}
        {/* Quick save/load buttons in top bar */}
        <div className="top-bar" style={{ 
          position: 'fixed', 
          top: 0, 
          left: 0, 
          right: 0, 
          height: '40px',
          background: 'linear-gradient(180deg, rgba(20, 20, 30, 0.9) 0%, transparent 100%)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          gap: '8px',
          zIndex: 100,
          pointerEvents: isFullscreen ? 'none' : 'auto',
          opacity: isFullscreen ? 0 : 1,
          transition: 'opacity 300ms ease'
        }}>
        </div>
        
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

        {/* Main Canvas Area - Full screen */}
        <div 
          className="canvas-container" 
          ref={containerRef}
          style={{ 
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100%',
            height: '100%'
          }}
        >
          <Canvas
            ref={canvasRef}
            layers={layers}
            isFrozen={isFrozen}
            colorFadeWhileFrozen={colorFadeWhileFrozen}
            backgroundColor={backgroundColor}
            globalSeed={globalSeed}
            globalBlendMode={globalBlendMode}
            isNodeEditMode={isNodeEditMode}
            selectedLayerIndex={selectedLayerIndex}
            setLayers={setLayers}
            setSelectedLayerIndex={setSelectedLayerIndex}
            classicMode={classicMode}
          />
          
          {/* Import Adjust Panel (multi-file SVG import) */}
          {showImportAdjust && (
            <div style={{ position: 'absolute', right: 16, bottom: 80, zIndex: 10 }}>
              <ImportAdjustPanel
                importAdjust={importAdjust}
                onChange={(adj)=> applyImportAdjust(adj)}
                fitEnabled={importFitEnabled}
                onToggleFit={()=> setImportFitEnabled(v=>!v)}
                debug={importDebug}
                onToggleDebug={()=> { const v = !importDebug; setImportDebug(v); window.__artapp_debug_import = v; }}
                onReset={()=> applyImportAdjust({ dx:0, dy:0, s:1 })}
                onClose={()=> setShowImportAdjust(false)}
              />
            </div>
          )}
          
          {/* Floating Action Buttons */}
          <FloatingActionButtons
            onDownload={downloadImage}
            onRandomize={randomizeScene}
            onToggleFullscreen={toggleFullscreen}
            isFullscreen={isFullscreen}
            onStartRecording={startRecording}
            onStopRecording={stopRecording}
            isRecording={isRecording}
            onToggleTargetMode={toggleParameterTargetMode}
            parameterTargetMode={parameterTargetMode}
          />
        </div>
        
        {/* Bottom Panel with tabs - Hidden in fullscreen */}
        {!isFullscreen && (
          <BottomPanel
            // GlobalControls props
            backgroundColor={backgroundColor}
            setBackgroundColor={setBackgroundColor}
            backgroundImage={backgroundImage}
            setBackgroundImage={setBackgroundImage}
            isFrozen={isFrozen}
            setIsFrozen={setIsFrozen}
            colorFadeWhileFrozen={colorFadeWhileFrozen}
            setColorFadeWhileFrozen={setColorFadeWhileFrozen}
            classicMode={classicMode}
            setClassicMode={setClassicMode}
            zIgnore={zIgnore}
            setZIgnore={setZIgnore}
            showGlobalMidi={showGlobalMidi}
            setShowGlobalMidi={setShowGlobalMidi}
            globalSeed={globalSeed}
            setGlobalSeed={setGlobalSeed}
            globalSpeedMultiplier={globalSpeedMultiplier}
            setGlobalSpeedMultiplier={setGlobalSpeedMultiplier}
            getIsRnd={getIsRnd}
            setIsRnd={setIsRnd}
            palettes={palettes}
            blendModes={blendModes}
            globalBlendMode={globalBlendMode}
            setGlobalBlendMode={setGlobalBlendMode}
            parameterTargetMode={parameterTargetMode}
            setParameterTargetMode={setParameterTargetMode}
            onQuickSave={handleQuickSave}
            onQuickLoad={handleQuickLoad}
            layers={layers}
            sampleColorsEven={sampleColorsEven}
            assignOneColorPerLayer={assignOneColorPerLayer}
            setLayers={setLayers}
            DEFAULT_LAYER={DEFAULT_LAYER}
            buildVariedLayerFrom={buildVariedLayerFrom}
            setSelectedLayerIndex={setSelectedLayerIndex}
            handleRandomizeAll={handleRandomizeAll}
            // Controls props
            currentLayer={currentLayer}
            updateCurrentLayer={updateCurrentLayer}
            randomizeCurrentLayer={randomizeCurrentLayer}
            randomizeAnimationForCurrentLayer={randomizeAnimationForCurrentLayer}
            randomizeCurrentLayerColors={randomizeCurrentLayerColors}
            baseColors={Array.isArray(layers?.[0]?.colors) ? layers[0].colors : []}
            baseNumColors={Number.isFinite(layers?.[0]?.numColors) ? layers[0].numColors : (Array.isArray(layers?.[0]?.colors) ? layers[0].colors.length : 1)}
            isNodeEditMode={isNodeEditMode}
            setIsNodeEditMode={setIsNodeEditMode}
            randomizePalette={randomizePalette}
            setRandomizePalette={setRandomizePalette}
            randomizeNumColors={randomizeNumColors}
            setRandomizeNumColors={setRandomizeNumColors}
            colorCountMin={colorCountMin}
            colorCountMax={colorCountMax}
            setColorCountMin={setColorCountMin}
            setColorCountMax={setColorCountMax}
            layerNames={(layers || []).map((l, i) => l?.name || `Layer ${i + 1}`)}
            selectedLayerIndex={clampedSelectedIndex}
            selectLayer={selectLayer}
            addNewLayer={addNewLayer}
            deleteLayer={deleteLayer}
            moveSelectedLayerUp={moveSelectedLayerUp}
            moveSelectedLayerDown={moveSelectedLayerDown}
            handleImportSVGClick={handleImportSVGClick}
          />
        )}
      </main>
    </div>
  );
};

// Root App (no router)
const App = () => (
  <AppStateProvider>
    <ParameterProvider>
      <MidiProvider>
        <MainApp />
      </MidiProvider>
    </ParameterProvider>
  </AppStateProvider>
);

export default App;
