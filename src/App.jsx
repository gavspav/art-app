import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ParameterProvider, useParameters } from './context/ParameterContext.jsx';
import { AppStateProvider, useAppState } from './context/AppStateContext.jsx';
import { MidiProvider, useMidi } from './context/MidiContext.jsx';
import { palettes } from './constants/palettes';
import { blendModes } from './constants/blendModes';
import { DEFAULTS, DEFAULT_LAYER } from './constants/defaults';
import { svgStringToNodes, samplePath, extractMergedNodesWithTransforms } from './utils/svgToNodes';
import { createSeededRandom } from './utils/random';
import { useFullscreen } from './hooks/useFullscreen';
import { useAnimation } from './hooks/useAnimation.js';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js';
import { useMIDIHandlers } from './hooks/useMIDIHandlers.js';
import { useImportAdjust } from './hooks/useImportAdjust.js';
import { useLayerManagement } from './hooks/useLayerManagement.js';
import { useRandomization } from './hooks/useRandomization.js';
import './App.css';
import { sampleColorsEven as sampleColorsEvenUtil, distributeColorsAcrossLayers as distributeColorsAcrossLayersUtil, assignOneColorPerLayer as assignOneColorPerLayerPure, pickPaletteColors } from './utils/paletteUtils.js';
import { clamp as clampUtil, mixRandom as mixRandomUtil } from './utils/mathUtils.js';

import Canvas from './components/Canvas';
import Controls from './components/Controls';
import GlobalControls from './components/global/GlobalControls.jsx';
import ImportAdjustPanel from './components/global/ImportAdjustPanel.jsx';
import SidebarResizer from './components/global/SidebarResizer.jsx';
import FloatingActionButtons from './components/global/FloatingActionButtons.jsx';
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
    globalSeed,
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
    rotationVaryAcrossLayers, setRotationVaryAcrossLayers,
    // Global: fade while frozen
    colorFadeWhileFrozen, setColorFadeWhileFrozen,
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
  // Simple recording state (placeholder)
  const [isRecording, setIsRecording] = useState(false);
  const startRecording = useCallback(() => setIsRecording(true), []);
  const stopRecording = useCallback(() => setIsRecording(false), []);
  // Keep latest values accessible to hotkeys without re-binding listeners
  const hotkeyRef = useRef({ selectedIndex: 0, layersLen: 0, overlayVisible: true, nodeEditMode: false });
  useEffect(() => {
    hotkeyRef.current = {
      selectedIndex: Math.max(0, Math.min(selectedLayerIndex, Math.max(0, layers.length - 1))),
      layersLen: Array.isArray(layers) ? layers.length : 0,
      overlayVisible: !!isOverlayVisible,
      nodeEditMode: !!isNodeEditMode,
      zIgnore: !!zIgnore,
    };
  }, [selectedLayerIndex, layers, isOverlayVisible, isNodeEditMode, zIgnore]);
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
  const downloadJson = (filename, obj) => {
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
  };

  // Clamp selection and expose currentLayer for Controls
  const clampedSelectedIndex = Math.max(0, Math.min(selectedLayerIndex, Math.max(0, (layers?.length || 0) - 1)));
  const currentLayer = (Array.isArray(layers) && layers.length > 0)
    ? (layers[clampedSelectedIndex] || layers[0])
    : DEFAULT_LAYER;

  const handleQuickSave = () => {
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
  };

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
  const buildVariedLayerFrom = (prev, nameIndex, baseVar) => {
    const clamp = clampUtil;
    const mix = (prevVal, min, max, w, integer = false) => mixRandomUtil(prevVal, min, max, w, integer);
    // Resolve separate variation intensities (0..3)
    const vShapeBase = Number(prev?.variationShape ?? prev?.variation ?? DEFAULT_LAYER.variationShape ?? 0.2);
    const vAnimBase = Number(prev?.variationAnim ?? prev?.variation ?? DEFAULT_LAYER.variationAnim ?? 0.2);
    const vColorBase = Number(prev?.variationColor ?? prev?.variation ?? DEFAULT_LAYER.variationColor ?? 0.2);
    const v = (baseVar && typeof baseVar === 'object')
      ? { shape: Number(baseVar.shape ?? vShapeBase), anim: Number(baseVar.anim ?? vAnimBase), color: Number(baseVar.color ?? vColorBase) }
      : { shape: Number(baseVar ?? vShapeBase), anim: Number(baseVar ?? vAnimBase), color: Number(baseVar ?? vColorBase) };
    const wShape = clamp((v.shape || 0) / 3, 0, 1);
    const wAnim = clamp((v.anim || 0) / 3, 0, 1);
    const boostAboveOne = (x) => {
      let z = Number(x) || 0;
      if (z > 1) z = 1 + (z - 1) * 1.4;
      if (z < 0) z = 0; if (z > 3) z = 3;
      return z;
    };
    const wColor = clamp(boostAboveOne(v.color || 0) / 3, 0, 1);

    const varyFlags = (prev?.vary || DEFAULT_LAYER.vary || {});

    const rand = createSeededRandom(Math.random());
    const newSeed = rand();

    const varied = { ...(prev || DEFAULT_LAYER) };
    varied.name = `Layer ${nameIndex}`;
    varied.seed = newSeed;
    varied.noiseSeed = newSeed;
    varied.vary = { ...(prev?.vary || DEFAULT_LAYER.vary || {}) };
    // Preserve legacy and split variations
    varied.variation = Number(prev?.variation ?? DEFAULT_LAYER.variation);
    varied.variationShape = Number(v.shape);
    varied.variationAnim = Number(v.anim);
    varied.variationColor = Number(v.color);

    // Shape and appearance (use wShape)
    const mixShape = (pv, mn, mx, integer = false) => mix(pv, mn, mx, wShape, integer);
    if (varyFlags.numSides) varied.numSides = Math.max(3, Math.round(mixShape(prev.numSides ?? 6, 3, 20, true)));
    if (varyFlags.curviness) varied.curviness = Number(mixShape(prev.curviness ?? 1.0, 0.0, 1.0).toFixed(3));
    if (varyFlags.wobble) varied.wobble = Number(mixShape(prev.wobble ?? 0.5, 0.0, 1.0).toFixed(3));
    if (varyFlags.noiseAmount) varied.noiseAmount = Number(mixShape(prev.noiseAmount ?? 0.5, 0, 8).toFixed(2));
    if (varyFlags.width) varied.width = Math.max(10, Math.round(mixShape(prev.width ?? 250, 10, 900, true)));
    if (varyFlags.height) varied.height = Math.max(10, Math.round(mixShape(prev.height ?? 250, 10, 900, true)));
    if (varyFlags.radiusFactor) {
      const baseRF = Number(prev.radiusFactor ?? DEFAULT_LAYER.radiusFactor ?? 0.125);
      varied.radiusFactor = Number(mixShape(baseRF, 0.02, 0.9).toFixed(3));
    }
    if (varyFlags.radiusFactorX) {
      const baseRFX = Number(prev.radiusFactorX ?? prev.radiusFactor ?? DEFAULT_LAYER.radiusFactor ?? 0.125);
      varied.radiusFactorX = Number(mixShape(baseRFX, 0.02, 0.9).toFixed(3));
    }
    if (varyFlags.radiusFactorY) {
      const baseRFY = Number(prev.radiusFactorY ?? prev.radiusFactor ?? DEFAULT_LAYER.radiusFactor ?? 0.125);
      varied.radiusFactorY = Number(mixShape(baseRFY, 0.02, 0.9).toFixed(3));
    }

    // Movement (use wAnim)
    const mixAnim = (pv, mn, mx, integer = false) => mix(pv, mn, mx, wAnim, integer);
    if (varyFlags.movementStyle && wAnim > 0.7 && Math.random() < wAnim) {
      const styles = ['bounce', 'drift', 'still'];
      const cur = prev.movementStyle ?? DEFAULT_LAYER.movementStyle;
      const others = styles.filter(s => s !== cur);
      varied.movementStyle = (others[Math.floor(Math.random() * others.length)] || cur);
    }
    if (varyFlags.movementSpeed) varied.movementSpeed = Number(mixAnim(prev.movementSpeed ?? 1, 0, 5).toFixed(3));
    if (varyFlags.movementAngle) {
      const nextA = mixAnim(prev.movementAngle ?? 45, 0, 360, true);
      varied.movementAngle = ((nextA % 360) + 360) % 360;
    }
    if (varyFlags.scaleSpeed) varied.scaleSpeed = Number(mixAnim(prev.scaleSpeed ?? 0.05, 0, 0.2).toFixed(3));
    let nextScaleMin = prev.scaleMin ?? 0.2;
    let nextScaleMax = prev.scaleMax ?? 1.5;
    if (varyFlags.scaleMin) nextScaleMin = mixAnim(prev.scaleMin ?? 0.2, 0.1, 2);
    if (varyFlags.scaleMax) nextScaleMax = mixAnim(prev.scaleMax ?? 1.5, 0.5, 3);
    varied.scaleMin = Math.min(nextScaleMin, nextScaleMax);
    varied.scaleMax = Math.max(nextScaleMin, nextScaleMax);

    // Image effects (treat as animation/appearance; use wAnim)
    if (varyFlags.imageBlur) varied.imageBlur = Number(mixAnim(prev.imageBlur ?? 0, 0, 20).toFixed(2));
    if (varyFlags.imageBrightness) varied.imageBrightness = Math.round(mixAnim(prev.imageBrightness ?? 100, 0, 200, true));
    if (varyFlags.imageContrast) varied.imageContrast = Math.round(mixAnim(prev.imageContrast ?? 100, 0, 200, true));
    if (varyFlags.imageHue) {
      const nextHue = mixAnim(prev.imageHue ?? 0, 0, 360, true);
      varied.imageHue = ((nextHue % 360) + 360) % 360;
    }
    if (varyFlags.imageSaturation) varied.imageSaturation = Math.round(mixAnim(prev.imageSaturation ?? 100, 0, 200, true));
    if (varyFlags.imageDistortion) varied.imageDistortion = Number(mixAnim(prev.imageDistortion ?? 0, 0, 50).toFixed(2));

    // Position jitter (use wAnim)
    const baseX = prev.position?.x ?? 0.5;
    const baseY = prev.position?.y ?? 0.5;
    const jitter = 0.15 * wAnim;
    const jx = (Math.random() * 2 - 1) * jitter;
    const jy = (Math.random() * 2 - 1) * jitter;
    const nx = clamp(baseX + jx, 0.0, 1.0);
    const ny = clamp(baseY + jy, 0.0, 1.0);
    varied.position = {
      ...(prev.position || DEFAULT_LAYER.position),
      x: nx,
      y: ny,
      scale: prev.position?.scale ?? 1.0,
      scaleDirection: prev.position?.scaleDirection ?? 1,
    };

    // Recompute velocity from angle/speed
    {
      const angleRad = (varied.movementAngle ?? prev.movementAngle ?? 0) * (Math.PI / 180);
      const spd = (varied.movementSpeed ?? prev.movementSpeed ?? 0) * 0.001;
      varied.vx = Math.cos(angleRad) * spd;
      varied.vy = Math.sin(angleRad) * spd;
    }

    // Colors (use wColor) — unified thresholds like Randomize All
    if (Array.isArray(prev.colors) && prev.colors.length) {
      if (varyFlags.colors) {
        if (wColor <= 0) {
          varied.colors = [...prev.colors];
          varied.numColors = prev.numColors ?? prev.colors.length;
        } else if (wColor >= 0.6) {
          const nextPalette = pickPaletteColors(palettes, Math.random, prev.colors) || prev.colors;
          varied.colors = Array.isArray(nextPalette) && nextPalette.length ? [...nextPalette] : [...prev.colors];
          varied.numColors = varied.colors.length;
        } else if (wColor >= 0.15) {
          const uniqueCount = (() => { try { return new Set(prev.colors.map(c => (c || '').toLowerCase())).size; } catch { return prev.colors.length; } })();
          if (uniqueCount <= 1) {
            const amt = Math.max(0.02, wColor);
            const hueMax = 1 + 24 * (amt * amt);
            const satMax = 1 + 18 * (amt * amt);
            const lightMax = 1 + 18 * (amt * amt);
            const perturbed = (prev.colors || []).map(hex => {
              const toHsl = (h) => {
                const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(h || '');
                let R=0,G=0,B=0; if (m) { R=parseInt(m[1],16); G=parseInt(m[2],16); B=parseInt(m[3],16); }
                const r1=R/255,g1=G/255,b1=B/255;
                const max=Math.max(r1,g1,b1),min=Math.min(r1,g1,b1);
                let hh=0, ss=0; const ll=(max+min)/2;
                if (max!==min){const d=max-min; ss= ll>0.5? d/(2-max-min): d/(max-min); switch(max){case r1: hh=(g1-b1)/d+(g1<b1?6:0); break; case g1: hh=(b1-r1)/d+2; break; case b1: hh=(r1-g1)/d+4; break;} hh/=6;}
                return { h: hh*360, s: ss*100, l: ll*100 };
              };
              const fromHsl = (h,s,l) => {
                const s1=s/100,l1=l/100; const c=(1-Math.abs(2*l1-1))*(s1);
                const x=c*(1-Math.abs(((h/60)%2)-1)); const m=l1-c/2; let r=0,g=0,b=0;
                if (h<60){r=c;g=x;b=0;} else if (h<120){r=x;g=c;b=0;} else if (h<180){r=0;g=c;b=x;} else if (h<240){r=0;g=x;b=c;} else if (h<300){r=x;g=0;b=c;} else {r=c;g=0;b=x;}
                const toHex=(v)=>Math.round((v+m)*255).toString(16).padStart(2,'0');
                return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
              };
              const { h, s, l } = toHsl(hex);
              const h2 = ((h + (Math.random()*2-1)*hueMax)%360 + 360)%360;
              const s2 = Math.max(0, Math.min(100, s + (Math.random()*2-1)*satMax));
              const l2 = Math.max(0, Math.min(100, l + (Math.random()*2-1)*lightMax));
              return fromHsl(h2, s2, l2);
            });
            varied.colors = perturbed;
            varied.numColors = perturbed.length;
          } else {
            const arr = [...prev.colors];
            for (let i = arr.length - 1; i > 0; i--) {
              if (Math.random() < 0.5 * wColor) {
                const j = Math.floor(Math.random() * (i + 1));
                [arr[i], arr[j]] = [arr[j], arr[i]];
              }
            }
            const same = arr.length === prev.colors.length && arr.every((c, i) => c === prev.colors[i]);
            varied.colors = same ? [...arr.slice(1), arr[0]] : [...arr];
            varied.numColors = arr.length;
          }
        } else if (wColor > 0) {
          // Subtle HSL perturbation for perceptual similarity
          const amt = Math.max(0.05, wColor);
          const hueMax = 2 + 8 * amt;
          const satMax = 2 + 6 * amt;
          const lightMax = 2 + 6 * amt;
          const perturbed = (prev.colors || []).map(hex => {
            const toHsl = (h) => {
              const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(h || '');
              let R=0,G=0,B=0; if (m) { R=parseInt(m[1],16); G=parseInt(m[2],16); B=parseInt(m[3],16); }
              const r=R/255,g=B/255,b=G/255; // order fixed below; compute properly via rgb->hsl
              // Use simple conversion inline to avoid circular imports
              const r1=R/255,g1=G/255,b1=B/255;
              const max=Math.max(r1,g1,b1),min=Math.min(r1,g1,b1);
              let hh=0, ss=0; const ll=(max+min)/2;
              if (max!==min){const d=max-min; ss= ll>0.5? d/(2-max-min): d/(max-min); switch(max){case r1: hh=(g1-b1)/d+(g1<b1?6:0); break; case g1: hh=(b1-r1)/d+2; break; case b1: hh=(r1-g1)/d+4; break;} hh/=6;}
              return { h: hh*360, s: ss*100, l: ll*100 };
            };
            const fromHsl = (h,s,l) => {
              // reuse existing hslToHex indirectly via manual conversion to avoid extra import context
              const s1=s/100,l1=l/100; const c=(1-Math.abs(2*l1-1))* (s1);
              const x=c*(1-Math.abs(((h/60)%2)-1)); const m=l1-c/2; let r=0,g=0,b=0;
              if (h<60){r=c;g=x;b=0;} else if (h<120){r=x;g=c;b=0;} else if (h<180){r=0;g=c;b=x;} else if (h<240){r=0;g=x;b=c;} else if (h<300){r=x;g=0;b=c;} else {r=c;g=0;b=x;}
              const toHex=(v)=>Math.round((v+m)*255).toString(16).padStart(2,'0');
              return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
            };
            const { h, s, l } = toHsl(hex);
            const h2 = ((h + (Math.random()*2-1)*hueMax)%360 + 360)%360;
            const s2 = Math.max(0, Math.min(100, s + (Math.random()*2-1)*satMax));
            const l2 = Math.max(0, Math.min(100, l + (Math.random()*2-1)*lightMax));
            return fromHsl(h2, s2, l2);
          });
          varied.colors = perturbed;
          varied.numColors = perturbed.length;
        } else {
          varied.colors = [...prev.colors];
          varied.numColors = prev.numColors ?? prev.colors.length;
        }
      } else {
        varied.colors = [...prev.colors];
        varied.numColors = prev.numColors ?? prev.colors.length;
      }
    }

    // If previous layer has edited nodes, vary shape from those nodes
    try {
      const prevNodes = Array.isArray(prev.nodes) ? prev.nodes : null;
      const desired = Math.max(3, Number(varied.numSides ?? prev.numSides ?? 6));
      if (prevNodes && prevNodes.length >= 3) {
        let nodes = prevNodes.map(n => ({ x: Number(n?.x) || 0, y: Number(n?.y) || 0 }));
        // Resize
        if (nodes.length !== desired) {
          if (nodes.length > desired) {
            nodes = nodes.slice(0, desired);
          } else {
            while (nodes.length < desired) {
              const N = nodes.length;
              const k = Math.floor(Math.random() * N);
              const next = (k + 1) % N;
              nodes.splice(next, 0, { x: (nodes[k].x + nodes[next].x) / 2, y: (nodes[k].y + nodes[next].y) / 2 });
            }
          }
        }
        const jitterAmt = 0.12 * wShape;
        varied.nodes = nodes.map(n => ({ x: Math.max(-1, Math.min(1, n.x + (Math.random() * 2 - 1) * jitterAmt)), y: Math.max(-1, Math.min(1, n.y + (Math.random() * 2 - 1) * jitterAmt)) }));
        varied.syncNodesToNumSides = prev.syncNodesToNumSides;
      } else {
        varied.nodes = null;
      }
    } catch {
      varied.nodes = null;
    }

    return varied;
  };

  const handleImportFile = async (e) => {
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
  };

  const handleQuickLoad = () => {
    configFileInputRef.current?.click();
  };

  // --- SVG Import: create a new layer from an SVG file ---
  const handleImportSVGClick = () => {
    svgFileInputRef.current?.click();
  };

  const handleImportSVGFile = async (e) => {
    const fileList = Array.from(e.target.files || []);
    if (!fileList.length) return;
    try {
      // Build new layers from all selected SVG files
      const newLayers = [];
      const refs = [];
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const text = await file.text();
        // Prefer merged multi-path extraction with transforms for each file
        const merged = extractMergedNodesWithTransforms(text);
        if (merged && Array.isArray(merged.nodes) && merged.nodes.length > 2) {
          const { nodes, subpaths, center, ref } = merged;
          refs.push(ref || null);
          const refMinX = Number(ref?.minX) || 0;
          const refMinY = Number(ref?.minY) || 0;
          const refW = Number(ref?.width) || 1;
          const refH = Number(ref?.height) || 1;
          const pos = { x: (center.x - refMinX) / refW, y: (center.y - refMinY) / refH };
          const base = { ...DEFAULT_LAYER };
          // Filter out background-like subpaths that span most of the normalized area (likely <rect> backgrounds)
          const filteredSubpaths = Array.isArray(subpaths) && subpaths.length ? subpaths.filter(sp => {
            try {
              if (!Array.isArray(sp) || sp.length < 3) return false;
              let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
              for (const p of sp) { const x = Number(p.x)||0, y = Number(p.y)||0; if (x<minX) minX=x; if (y<minY) minY=y; if (x>maxX) maxX=x; if (y>maxY) maxY=y; }
              const w = Math.abs(maxX - minX);
              const h = Math.abs(maxY - minY);
              // In our normalized mapping, typical shapes fit within [-1,1]. If a subpath spans ~full range, treat it as background
              return !(w >= 1.8 && h >= 1.8);
            } catch { return true; }
          }) : undefined;
          newLayers.push({
            ...base,
            name: (file.name ? file.name.replace(/\.[^/.]+$/, '') : `Layer ${i + 1}`),
            layerType: 'shape',
            // Prefer subpaths when available (use filtered to drop background rectangles)
            nodes: (filteredSubpaths && filteredSubpaths.length) ? null : nodes,
            subpaths: (filteredSubpaths && filteredSubpaths.length) ? filteredSubpaths : (Array.isArray(subpaths) && subpaths.length ? subpaths : undefined),
            syncNodesToNumSides: false,
            viewBoxMapped: true,
            curviness: 0,
            noiseAmount: 0,
            wobble: 0,
            numSides: nodes.length,
            position: { ...base.position, x: pos.x, y: pos.y, scale: 0.15 },
            visible: true,
          });
          continue;
        }
      // Parse SVG to get viewBox and single path data as fallback
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'image/svg+xml');
      const svgEl = doc.querySelector('svg');
      const pathEl = doc.querySelector('path');
      const d = pathEl?.getAttribute('d') || '';
      // Fallback to utility if parsing fails
      if (!d) {
        const nodes = svgStringToNodes(text);
        if (!Array.isArray(nodes) || nodes.length < 3) {
          // Skip files that do not contain a parsable path
          continue;
        }
        // Default position center
        const pos = { x: 0.5, y: 0.5 };
        const base = { ...DEFAULT_LAYER };
        newLayers.push({
          ...base,
          name: (file.name ? file.name.replace(/\.[^/.]+$/, '') : `Layer ${i + 1}`),
          layerType: 'shape',
          nodes,
          syncNodesToNumSides: false,
          curviness: 0,
          noiseAmount: 0,
          wobble: 0,
          numSides: nodes.length,
          position: { ...base.position, x: pos.x, y: pos.y },
          visible: true,
        });
        continue;
      }

      // Sample raw points from path
      const pts = samplePath(d);
      if (!Array.isArray(pts) || pts.length < 3) {
        // Skip if sampling fails
        continue;
      }

      // Compute path bbox center in SVG coords
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of pts) { if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y; if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y; }
      const pcx = (minX + maxX) / 2;
      const pcy = (minY + maxY) / 2;

      // Determine reference box from viewBox if present
      let refW = maxX - minX; let refH = maxY - minY; let refMinX = minX; let refMinY = minY;
      const vb = svgEl?.getAttribute('viewBox')?.split(/\s+|,/) || null;
      if (vb && vb.length >= 4) {
        refMinX = parseFloat(vb[0]);
        refMinY = parseFloat(vb[1]);
        refW = parseFloat(vb[2]);
        refH = parseFloat(vb[3]);
      }
      const s = Math.max(refW, refH) / 2 || 1;
      const nodes = pts.map(p => ({ x: (p.x - pcx) / s, y: (p.y - pcy) / s }));
      const pos = {
        x: (pcx - refMinX) / (refW || 1),
        y: (pcy - refMinY) / (refH || 1),
      };
      if (Array.isArray(nodes) && nodes.length >= 3) {
        const base = { ...DEFAULT_LAYER };
        newLayers.push({
          ...base,
          name: (file.name ? file.name.replace(/\.[^/.]+$/, '') : `Layer ${i + 1}`),
          layerType: 'shape',
          nodes,
          // Preserve imported polygon samples; avoid autosync to numSides
          syncNodesToNumSides: false,
          viewBoxMapped: true,
          curviness: 0,
          noiseAmount: 0,
          wobble: 0,
          numSides: nodes.length,
          position: { ...base.position, x: pos.x, y: pos.y, scale: 0.3 },
          visible: true,
        });
      }
      // loop continues building newLayers
      }
      // Preserve original positions from SVG coordinates; ensure visible
      newLayers.forEach(l => { l.visible = true; if (!l.position?.scale) l.position.scale = 1; });

      // Detect viewBox mismatches across files (positions may be wrong)
      try {
        const key = (r) => r && Number.isFinite(r.width) && Number.isFinite(r.height) ? `${r.minX},${r.minY},${r.width},${r.height}` : 'none';
        const uniq = Array.from(new Set(refs.map(key)));
        if (newLayers.length > 1 && uniq.length > 1) {
          console.warn('SVG import: files have different viewBox/size. Relative positions may be incorrect. Unique refs:', uniq);
        }
      } catch (e) { /* ignore */ }

      // Debug summary in console
      try {
        const summary = newLayers.map((l, i) => ({
          idx: i,
          name: l.name,
          x: +(l.position?.x ?? 0.5).toFixed(3),
          y: +(l.position?.y ?? 0.5).toFixed(3),
          scale: +(l.position?.scale ?? 1).toFixed(3),
          viewBoxMapped: !!l.viewBoxMapped,
          nodes: Array.isArray(l.nodes) ? l.nodes.length : 0,
        }));
        console.table(summary);
      } catch (e) { /* ignore */ }

      // Store RAW baseline before any fit
      importRawRef.current = newLayers.map(l => ({
        x: Number(l?.position?.x) || 0.5,
        y: Number(l?.position?.y) || 0.5,
        s: Number(l?.position?.scale) || 1,
      }));

      // Optional: shrink-to-fit to keep everything on screen while preserving relative layout
      if (newLayers.length > 1 && importFitEnabled && !window.__artapp_disable_import_fit) {
        const margin = 0.02; // 2% margins
        const layersMeta = newLayers.map(l => {
          const nodes = Array.isArray(l.nodes) ? l.nodes : [];
          const s = Number(l.position?.scale) || 1;
          let maxAbsX = 0, maxAbsY = 0;
          nodes.forEach(n => { const ax = Math.abs(n.x) || 0; const ay = Math.abs(n.y) || 0; if (ax > maxAbsX) maxAbsX = ax; if (ay > maxAbsY) maxAbsY = ay; });
          const px = Number(l.position?.x) || 0.5;
          const py = Number(l.position?.y) || 0.5;
          return { px, py, s, maxAbsX, maxAbsY };
        });
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
        // Recompute center and recenter to 0.5,0.5
        const bounds2 = layersMeta.reduce((acc, m) => {
          const s2 = m.s * sFit;
          const halfW = (m.maxAbsX || 1) * 0.5 * s2;
          const halfH = (m.maxAbsY || 1) * 0.5 * s2;
          const minX = m.px - halfW; const maxX = m.px + halfW;
          const minY = m.py - halfH; const maxY = m.py + halfH;
          if (minX < acc.minX) acc.minX = minX;
          if (maxX > acc.maxX) acc.maxX = maxX;
          if (minY < acc.minY) acc.minY = minY;
          if (maxY > acc.maxY) acc.maxY = maxY;
          return acc;
        }, { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
        const cx = (bounds2.minX + bounds2.maxX) / 2;
        const cy = (bounds2.minY + bounds2.maxY) / 2;
        const dx = 0.5 - cx;
        const dy = 0.5 - cy;
        newLayers.forEach(l => {
          const px = Number(l.position.x) || 0.5;
          const py = Number(l.position.y) || 0.5;
          l.position.x = Math.min(1, Math.max(0, px + dx));
          l.position.y = Math.min(1, Math.max(0, py + dy));
        });
      }

      setLayers(newLayers);
      // Store base positions/scales for interactive adjustment if multiple files
      if (newLayers.length > 1) {
        // Start adjust baseline from RAW (so Fit toggle can reflow deterministically)
        importBaseRef.current = importRawRef.current.map(b => ({ ...b }));
        setImportAdjust({ dx: 0, dy: 0, s: 1 });
        setImportFitEnabled(true);
        setImportDebug(false);
        setShowImportAdjust(true);
      } else {
        importBaseRef.current = [];
        setShowImportAdjust(false);
      }
      setSelectedLayerIndex(Math.max(0, newLayers.length - 1));
      setIsNodeEditMode(true);
    } catch (err) {
      console.warn('Failed to import SVG', err);
      alert('Failed to import SVG');
    } finally {
      e.target.value = '';
    }
  };


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

  const randomizeCurrentLayer = (randomizePalette = false) => {
    const idx = Math.max(0, Math.min(selectedLayerIndex, Math.max(0, layers.length - 1)));
    const updated = randomizeLayer(idx, randomizePalette);
    setLayers(prev => prev.map((l, i) => (i === idx ? updated : l)));
  };

  // randomizeAnimationOnly provided by hook

  const randomizeAnimationForCurrentLayer = () => {
    const idx = Math.max(0, Math.min(selectedLayerIndex, Math.max(0, layers.length - 1)));
    const updated = randomizeAnimationOnly(idx);
    if (!updated) return;
    setLayers(prev => prev.map((l, i) => (i === idx ? updated : l)));
  };

  // Randomize only colors for the current layer according to toggles and min/max
  const randomizeCurrentLayerColors = () => {
    const idx = Math.max(0, Math.min(selectedLayerIndex, Math.max(0, layers.length - 1)));
    const layer = layers[idx];
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
  };

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

  // Download helper for exporting image
  const downloadImage = () => {
    const canvas = canvasRef.current;
    const link = document.createElement('a');
    link.download = 'layered-shape.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className={`App ${isFullscreen ? 'fullscreen' : ''}`}>
      <main className="main-layout">
        {/* Left Sidebar - Hidden in fullscreen */}
        <aside
          className={`sidebar ${isFullscreen ? 'hidden' : ''} ${isOverlayVisible ? '' : 'collapsed'}`}
          style={(isFullscreen || !isOverlayVisible) ? undefined : { width: `${sidebarWidth}px` }}
        >
          <div className="sidebar-header">
            <button
              className="collapse-btn"
              onClick={() => setIsOverlayVisible(prev => !prev)}
              title={isOverlayVisible ? 'Hide controls' : 'Show controls'}
            >
              {isOverlayVisible ? '←' : '→'}
            </button>
            <div style={{ display: 'flex', gap: '0.4rem', marginLeft: '0.5rem' }}>
              <button className="icon-btn" title="Save configuration" onClick={handleQuickSave}>💾</button>
              <button className="icon-btn" title="Load configuration" onClick={handleQuickLoad}>📂</button>
              {/* Hidden input used by import handler */}
              <input
                ref={configFileInputRef}
                type="file"
                accept="application/json,.json"
                style={{ display: 'none' }}
                onChange={handleImportFile}
              />
            </div>
          </div>
          <div className="sidebar-content">
            {/* Global controls extracted */}
            {/* Global controls now rendered by component */}
            <GlobalControls
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
              globalSpeedMultiplier={globalSpeedMultiplier}
              setGlobalSpeedMultiplier={setGlobalSpeedMultiplier}
              getIsRnd={getIsRnd}
              setIsRnd={setIsRnd}
              midiSupported={midiSupported}
              beginLearn={beginLearn}
              clearMapping={clearMapping}
              midiMappings={midiMappings}
              mappingLabel={mappingLabel}
              learnParamId={learnParamId}
              palettes={palettes}
              blendModes={blendModes}
              globalBlendMode={globalBlendMode}
              setGlobalBlendMode={setGlobalBlendMode}
              midiInputs={midiInputs}
              midiInputId={midiInputId}
              setMidiInputId={setMidiInputId}
              layers={layers}
              sampleColorsEven={sampleColorsEven}
              assignOneColorPerLayer={assignOneColorPerLayer}
              setLayers={setLayers}
              DEFAULT_LAYER={DEFAULT_LAYER}
              buildVariedLayerFrom={buildVariedLayerFrom}
              setSelectedLayerIndex={setSelectedLayerIndex}
              handleRandomizeAll={handleRandomizeAll}
            />
            

            <Controls
              ref={controlsRef}
              currentLayer={currentLayer}
              updateLayer={updateCurrentLayer}
              randomizeCurrentLayer={randomizeCurrentLayer}
              randomizeAnimationOnly={randomizeAnimationForCurrentLayer}
              randomizeAll={handleRandomizeAll}
              isFrozen={isFrozen}
              setIsFrozen={setIsFrozen}
              globalSpeedMultiplier={globalSpeedMultiplier}
              setGlobalSpeedMultiplier={setGlobalSpeedMultiplier}
              setLayers={setLayers}
              baseColors={Array.isArray(layers?.[0]?.colors) ? layers[0].colors : []}
              baseNumColors={Number.isFinite(layers?.[0]?.numColors) ? layers[0].numColors : (Array.isArray(layers?.[0]?.colors) ? layers[0].colors.length : 1)}
              isNodeEditMode={isNodeEditMode}
              showMidi={showGlobalMidi}
              setIsNodeEditMode={setIsNodeEditMode}
              classicMode={classicMode}
              setClassicMode={setClassicMode}
              randomizePalette={randomizePalette}
              setRandomizePalette={setRandomizePalette}
              randomizeNumColors={randomizeNumColors}
              setRandomizeNumColors={setRandomizeNumColors}
              colorCountMin={colorCountMin}
              colorCountMax={colorCountMax}
              setColorCountMin={setColorCountMin}
              setColorCountMax={setColorCountMax}
              onRandomizeLayerColors={randomizeCurrentLayerColors}
              rotationVaryAcrossLayers={rotationVaryAcrossLayers}
              setRotationVaryAcrossLayers={setRotationVaryAcrossLayers}
              getIsRnd={getIsRnd}
              setIsRnd={setIsRnd}
              layerNames={(layers || []).map((l, i) => l?.name || `Layer ${i + 1}`)}
              selectedLayerIndex={clampedSelectedIndex}
              onSelectLayer={selectLayer}
              onAddLayer={addNewLayer}
              onDeleteLayer={deleteLayer}
              onMoveLayerUp={moveSelectedLayerUp}
              onMoveLayerDown={moveSelectedLayerDown}
              onImportSVG={handleImportSVGClick}
            />
            {/* Layer list removed; use header controls in <Controls /> */}
          </div>
        </aside>

        {/* Draggable divider between sidebar and canvas */}
        {(!isFullscreen && isOverlayVisible) && (
          <SidebarResizer onStartResize={startResize} />
        )}
        
        {/* Hidden file inputs */}
        <input
          ref={svgFileInputRef}
          type="file"
          accept=".svg,image/svg+xml"
          multiple
          style={{ display: 'none' }}
          onChange={handleImportSVGFile}
        />

        {/* Main Canvas Area */}
        <div 
          className="canvas-container" 
          ref={containerRef}
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
          />
        </div>
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
