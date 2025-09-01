import React, { useEffect, useRef, useState } from 'react';
import { ParameterProvider, useParameters } from './context/ParameterContext.jsx';
import { AppStateProvider, useAppState } from './context/AppStateContext.jsx';
import { MidiProvider, useMidi } from './context/MidiContext.jsx';
import { palettes } from './constants/palettes';
import { blendModes } from './constants/blendModes';
import { DEFAULTS, DEFAULT_LAYER } from './constants/defaults';
import { createSeededRandom } from './utils/random';
import { useFullscreen } from './hooks/useFullscreen';
import { useAnimation } from './hooks/useAnimation.js';
import './App.css';

import Canvas from './components/Canvas';
import Controls from './components/Controls';
import BackgroundColorPicker from './components/BackgroundColorPicker';
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
    // Color randomization toggles
    randomizePalette, setRandomizePalette,
    randomizeNumColors, setRandomizeNumColors,
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
  // Removed Global Colours UI
  const [sidebarWidth, setSidebarWidth] = useState(350);
  const dragRef = useRef({ dragging: false, startX: 0, startW: 350 });
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(containerRef);
  // Global MIDI learn UI visibility
  const [showGlobalMidi, setShowGlobalMidi] = useState(false);

  // Remember prior frozen state when entering node edit mode
  const prevFrozenRef = useRef(null);

  // Config save/load from contexts
  const {
    saveParameters,
    loadParameters,
    saveFullConfiguration,
    loadFullConfiguration,
    getSavedConfigList,
  } = useParameters();
  const { getCurrentAppState, loadAppState } = useAppState();

  // Helpers for ParameterContext metadata
  const getParam = (id) => parameters.find(p => p.id === id) || {};
  const getIsRnd = (id) => !!getParam(id).isRandomizable;
  const setIsRnd = (id, v) => updateParameter && updateParameter(id, 'isRandomizable', !!v);

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
    const L = Math.max(0, Math.floor(layerCount));
    const out = Array.from({ length: L }, () => []);
    const src = Array.isArray(colors) ? colors : [];
    if (L === 0 || src.length === 0) return out;
    // Ensure at least one color per layer by cycling if needed
    for (let i = 0; i < Math.max(src.length, L); i++) {
      const col = src[i % src.length];
      out[i % L].push(col);
    }
    // If there are remaining colors beyond L, continue round-robin assignment
    for (let i = L; i < src.length; i++) {
      out[i % L].push(src[i]);
    }
    return out;
  };

  const applyDistributedColors = (colors) => {
    setLayers(prev => {
      const parts = distributeColorsAcrossLayers(colors, prev.length);
      return prev.map((l, i) => {
        const chunk = parts[i] || [];
        return { ...l, colors: chunk, numColors: chunk.length, selectedColor: 0 };
      });
    });
  };

  // Helper to evenly sample colors from a palette to a desired count (with repeats allowed)
  const sampleColorsEven = (base = [], count = 0) => {
    const n = Math.max(0, Math.floor(count));
    if (!Array.isArray(base) || base.length === 0 || n === 0) return [];
    if (n === 1) return [base[0]];
    const out = [];
    for (let i = 0; i < n; i++) {
      const t = (n === 1) ? 0 : (i / (n - 1));
      const idx = Math.round(t * (base.length - 1));
      out.push(base[idx]);
    }
    return out;
  };

  // Assign exactly one colour per layer from a palette or list, cycling if needed
  const assignOneColorPerLayer = (colors) => {
    const src = Array.isArray(colors) ? colors : [];
    setLayers(prev => prev.map((l, i) => {
      const col = src.length ? src[i % src.length] : '#000000';
      return { ...l, colors: [col], numColors: 1, selectedColor: 0 };
    }));
  };

  // Removed Global Colours state and helpers

  const handleImportFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      // Apply MIDI mappings immediately if present
      try { if (data && data.midiMappings && setMappingsFromExternal) setMappingsFromExternal(data.midiMappings); } catch {}
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

  // --- MIDI handlers for global controls ---
  // Global Speed (0..5)
  useEffect(() => {
    if (!registerParamHandler) return;
    const unregister = registerParamHandler('globalSpeedMultiplier', ({ value01 }) => {
      const v = Math.max(0, Math.min(1, value01));
      const scaled = +(v * 5).toFixed(2);
      setGlobalSpeedMultiplier(scaled);
    });
    return unregister;
  }, [registerParamHandler, setGlobalSpeedMultiplier]);

  // Global Blend Mode (dropdown over blendModes)
  useEffect(() => {
    if (!registerParamHandler) return;
    const unregister = registerParamHandler('globalBlendMode', ({ value01 }) => {
      const opts = Array.isArray(blendModes) ? blendModes : [];
      if (!opts.length) return;
      const idx = Math.max(0, Math.min(opts.length - 1, Math.floor(value01 * opts.length)));
      setGlobalBlendMode(opts[idx]);
    });
    return unregister;
  }, [registerParamHandler, setGlobalBlendMode]);

  // Global Opacity for all layers (0..1)
  useEffect(() => {
    if (!registerParamHandler) return;
    const unregister = registerParamHandler('globalOpacity', ({ value01 }) => {
      const v = Math.max(0, Math.min(1, value01));
      setLayers(prev => prev.map(l => ({ ...l, opacity: v })));
    });
    return unregister;
  }, [registerParamHandler, setLayers]);

  // Layers Count (1..20)
  useEffect(() => {
    if (!registerParamHandler) return;
    const unregister = registerParamHandler('layersCount', ({ value01 }) => {
      const target = Math.max(1, Math.min(20, Math.round(1 + value01 * 19)));
      setLayers(prev => {
        let next = prev;
        if (target > prev.length) {
          const addCount = target - prev.length;
          const baseVar = (typeof prev?.[0]?.variation === 'number') ? prev[0].variation : DEFAULT_LAYER.variation;
          let last = prev[prev.length - 1] || DEFAULT_LAYER;
          const additions = Array.from({ length: addCount }, (_, i) => {
            const nextIdx = prev.length + i + 1;
            const nl = buildVariedLayerFrom(last, nextIdx, baseVar);
            last = nl;
            return nl;
          });
          next = [...prev, ...additions];
        } else if (target < prev.length) {
          next = prev.slice(0, target);
        }
        return next.map((l, i) => ({ ...l, name: `Layer ${i + 1}` }));
      });
      setSelectedLayerIndex((idx) => Math.min(idx, Math.max(0, target - 1)));
    });
    return unregister;
  }, [registerParamHandler, setLayers, setSelectedLayerIndex]);

  // Global Palette Index -> assign one colour per layer
  useEffect(() => {
    if (!registerParamHandler) return;
    const unregister = registerParamHandler('globalPaletteIndex', ({ value01 }) => {
      const list = Array.isArray(palettes) ? palettes : [];
      if (!list.length) return;
      const idx = Math.max(0, Math.min(list.length - 1, Math.floor(value01 * list.length)));
      const chosen = list[idx];
      const colors = Array.isArray(chosen) ? chosen : (chosen?.colors || []);
      const count = Math.max(1, layers.length);
      const nextColors = sampleColorsEven(colors, count);
      assignOneColorPerLayer(nextColors);
    });
    return unregister;
  }, [registerParamHandler, layers.length]);

  // --- Global per-layer MIDI Position handlers (work in background) ---
  useEffect(() => {
    if (!registerParamHandler) return;
    const unsubs = [];

    const clamp01 = (v) => Math.max(0, Math.min(1, v));

    layers.forEach((layer, index) => {
      const layerKey = (layer?.name || `Layer ${index + 1}`).toString();
      const idX = `layer:${layerKey}:posX`;
      const idY = `layer:${layerKey}:posY`;
      const idZ = `layer:${layerKey}:posZ`;

      // X
      unsubs.push(registerParamHandler(idX, ({ value01 }) => {
        if (!layer?.manualMidiPositionEnabled) return;
        const r = layer?.midiPosRangeX || { min: 0, max: 1 };
        const mapped = (r.min ?? 0) + value01 * ((r.max ?? 1) - (r.min ?? 0));
        const v = clamp01(mapped);
        setLayers(prev => prev.map((l, i) => (
          i === index ? { ...l, position: { ...(l.position || {}), x: v } } : l
        )));
      }));

      // Y
      unsubs.push(registerParamHandler(idY, ({ value01 }) => {
        if (!layer?.manualMidiPositionEnabled) return;
        const r = layer?.midiPosRangeY || { min: 0, max: 1 };
        const mapped = (r.min ?? 0) + value01 * ((r.max ?? 1) - (r.min ?? 0));
        const v = clamp01(mapped);
        setLayers(prev => prev.map((l, i) => (
          i === index ? { ...l, position: { ...(l.position || {}), y: v } } : l
        )));
      }));

      // Z (scale)
      unsubs.push(registerParamHandler(idZ, ({ value01 }) => {
        if (!layer?.manualMidiPositionEnabled) return;
        const scaleMin = Number.isFinite(layer?.scaleMin) ? layer.scaleMin : 0.2;
        const scaleMax = Number.isFinite(layer?.scaleMax) ? layer.scaleMax : 1.5;
        const r = layer?.midiPosRangeZ || { min: scaleMin, max: scaleMax };
        const outMin = Number.isFinite(r.min) ? r.min : scaleMin;
        const outMax = Number.isFinite(r.max) ? r.max : scaleMax;
        const mapped = outMin + value01 * (outMax - outMin);
        const v = Math.max(scaleMin, Math.min(scaleMax, mapped));
        setLayers(prev => prev.map((l, i) => (
          i === index ? { ...l, position: { ...(l.position || {}), scale: v } } : l
        )));
      }));
    });

    return () => { unsubs.forEach(u => { if (typeof u === 'function') u(); }); };
    // Re-register if layer list, names, ranges, or enable flags change
  }, [registerParamHandler, setLayers, layers]);

  // --- MIDI handlers for Background Color (RGB) ---
  useEffect(() => {
    if (!registerParamHandler) return;
    const hexToRgb = (hex) => {
      const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || '');
      if (!m) return { r: 0, g: 0, b: 0 };
      return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
    };
    const rgbToHex = ({ r, g, b }) => {
      const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
      return `#${c(r)}${c(g)}${c(b)}`;
    };

    const idR = 'backgroundColorR';
    const idG = 'backgroundColorG';
    const idB = 'backgroundColorB';

    const setChannel = (channel) => ({ value01 }) => {
      const cur = hexToRgb(backgroundColor || '#000000');
      const v255 = Math.max(0, Math.min(255, Math.round(value01 * 255)));
      const next = { ...cur, [channel]: v255 };
      setBackgroundColor(rgbToHex(next));
    };

    const u1 = registerParamHandler(idR, setChannel('r'));
    const u2 = registerParamHandler(idG, setChannel('g'));
    const u3 = registerParamHandler(idB, setChannel('b'));
    return () => { if (typeof u1 === 'function') u1(); if (typeof u2 === 'function') u2(); if (typeof u3 === 'function') u3(); };
  }, [registerParamHandler, backgroundColor, setBackgroundColor]);

  // --- Global per-layer MIDI Colour handlers (RGBA) ---
  useEffect(() => {
    if (!registerParamHandler) return;
    const unsubs = [];

    const hexToRgb = (hex) => {
      const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || '');
      if (!m) return { r: 0, g: 0, b: 0 };
      return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
    };
    const rgbToHex = ({ r, g, b }) => {
      const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
      return `#${c(r)}${c(g)}${c(b)}`;
    };

    layers.forEach((layer, index) => {
      const layerKey = (layer?.name || `Layer ${index + 1}`).toString();
      const idR = `layer:${layerKey}:colorR`;
      const idG = `layer:${layerKey}:colorG`;
      const idB = `layer:${layerKey}:colorB`;
      const idA = `layer:${layerKey}:colorA`;

      const updateChannel = (channel, value01) => {
        if (!layer?.manualMidiColorEnabled) return;
        const selIdx = Number.isFinite(layer?.selectedColor) ? layer.selectedColor : 0;
        const colors = Array.isArray(layer?.colors) ? layer.colors : [];
        const curHex = colors[selIdx] || '#000000';
        const cur = hexToRgb(curHex);
        const v255 = Math.max(0, Math.min(255, Math.round(value01 * 255)));
        const next = { ...cur, [channel]: v255 };
        const nextHex = rgbToHex(next);
        setLayers(prev => prev.map((l, i) => {
          if (i !== index) return l;
          const arr = Array.isArray(l.colors) ? [...l.colors] : [];
          const si = Number.isFinite(l.selectedColor) ? l.selectedColor : 0;
          arr[si] = nextHex;
          return { ...l, colors: arr };
        }));
      };

      // R
      unsubs.push(registerParamHandler(idR, ({ value01 }) => {
        updateChannel('r', value01);
      }));
      // G
      unsubs.push(registerParamHandler(idG, ({ value01 }) => {
        updateChannel('g', value01);
      }));
      // B
      unsubs.push(registerParamHandler(idB, ({ value01 }) => {
        updateChannel('b', value01);
      }));
      // A (opacity)
      unsubs.push(registerParamHandler(idA, ({ value01 }) => {
        if (!layer?.manualMidiColorEnabled) return;
        const v = Math.max(0, Math.min(1, value01));
        setLayers(prev => prev.map((l, i) => (i === index ? { ...l, opacity: v } : l)));
      }));
    });

    return () => { unsubs.forEach(u => { if (typeof u === 'function') u(); }); };
  }, [registerParamHandler, setLayers, layers]);

  useEffect(() => {
    setLayers(prevLayers => 
      prevLayers.map(layer => {
        if (layer.vx === 0 && layer.vy === 0) {
          const angleRad = layer.movementAngle * (Math.PI / 180);
          return {
            ...layer,
            // Map UI movementSpeed (0..5) to engine units
            vx: Math.cos(angleRad) * (layer.movementSpeed * 0.001) * 1.0,
            vy: Math.sin(angleRad) * (layer.movementSpeed * 0.001) * 1.0,
          };
        }
        return layer;
      })
    );
  }, []);

  // Keep Canvas in sync with background image via a global bridge (read by Canvas.jsx)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__artapp_bgimg = backgroundImage || { src: null, enabled: false, opacity: 1, fit: 'cover' };
    }
  }, [backgroundImage]);

  // Normalize any persisted out-of-range values (e.g., curviness) once on load
  useEffect(() => {
    setLayers(prevLayers =>
      prevLayers.map(layer => ({
        ...layer,
        curviness: Math.min(1, Math.max(0, typeof layer.curviness === 'number' ? layer.curviness : 1)),
      }))
    );
  }, []);

  // One-time migration: scale legacy movementSpeed values (<= 0.02) to new 0–5 UI scale
  useEffect(() => {
    setLayers(prevLayers =>
      prevLayers.map(layer => {
        const ms = layer.movementSpeed;
        if (typeof ms === 'number' && ms <= 0.02) {
          const scaled = Math.min(5, Math.max(0, ms * 1000));
          const angleRad = layer.movementAngle * (Math.PI / 180);
          return {
            ...layer,
            movementSpeed: scaled,
            vx: Math.cos(angleRad) * (scaled * 0.001) * 1.0,
            vy: Math.sin(angleRad) * (scaled * 0.001) * 1.0,
          };
        }
        return layer;
      })
    );
  }, []);

  // Keyboard shortcut for hiding the overlay
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger if user is typing in an input
      if (e.code === 'Space' && e.target.tagName.toLowerCase() !== 'input' && e.target.tagName.toLowerCase() !== 'select') {
        e.preventDefault();
        setIsOverlayVisible(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useAnimation(setLayers, isFrozen, globalSpeedMultiplier);

  // Sidebar resizing handlers
  useEffect(() => {
    const onMove = (e) => {
      if (!dragRef.current.dragging) return;
      const dx = e.clientX - dragRef.current.startX;
      const next = Math.max(220, Math.min(600, dragRef.current.startW + dx));
      setSidebarWidth(next);
      e.preventDefault();
    };
    const onUp = () => {
      if (dragRef.current.dragging) dragRef.current.dragging = false;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const startResize = (e) => {
    dragRef.current = { dragging: true, startX: e.clientX, startW: sidebarWidth };
    e.preventDefault();
  };

  // Auto-freeze while in Node Edit mode; restore previous state on exit
  useEffect(() => {
    if (isNodeEditMode) {
      if (prevFrozenRef.current === null) prevFrozenRef.current = isFrozen;
      if (!isFrozen) setIsFrozen(true);
    } else {
      if (prevFrozenRef.current !== null && isFrozen !== prevFrozenRef.current) {
        setIsFrozen(prevFrozenRef.current);
      }
      prevFrozenRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNodeEditMode, isFrozen]);

  // Clamp selection to available layers to avoid transient undefined during updates
  const clampedSelectedIndex = Math.max(0, Math.min(selectedLayerIndex, Math.max(0, layers.length - 1)));
  const currentLayer = (layers.length > 0)
    ? (layers[clampedSelectedIndex] || layers[0])
    : DEFAULT_LAYER;

  

  // Helper: build a new layer by varying from a previous layer using base variation
  const buildVariedLayerFrom = (prev, nameIndex, baseVar) => {
    const v = typeof baseVar === 'number' ? baseVar : (typeof prev?.variation === 'number' ? prev.variation : (DEFAULT_LAYER.variation ?? 0.2));
    const w = Math.max(0, Math.min(1, v / 3)); // normalize 0..3 -> 0..1
    const varyFlags = (prev?.vary || DEFAULT_LAYER.vary || {});

    const mixRandom = (prevVal, min, max, integer = false) => {
      const rnd = min + Math.random() * (max - min);
      let next = prevVal * (1 - w) + rnd * w;
      next = Math.min(max, Math.max(min, next));
      if (integer) next = Math.round(next);
      return next;
    };

    const clamp = (val, min, max) => Math.min(max, Math.max(min, val));

    const random = createSeededRandom(Math.random());
    const newSeed = random();

    const varied = { ...(prev || DEFAULT_LAYER) };
    varied.name = `Layer ${nameIndex}`;
    varied.seed = newSeed;
    varied.noiseSeed = newSeed;
    varied.vary = { ...(prev?.vary || DEFAULT_LAYER.vary || {}) };
    varied.variation = v;

    // Geometry and style (respect vary flags)
    if (varyFlags.numSides) varied.numSides = mixRandom(prev.numSides, 3, 20, true);
    if (varyFlags.curviness) varied.curviness = mixRandom(prev.curviness ?? 1.0, 0.0, 1.0);
    if (varyFlags.wobble) varied.wobble = mixRandom(prev.wobble ?? 0.5, 0.0, 1.0);
    if (varyFlags.noiseAmount) varied.noiseAmount = mixRandom(prev.noiseAmount ?? 0.5, 0, 8);
    if (varyFlags.width) varied.width = mixRandom(prev.width ?? 250, 10, 900, true);
    if (varyFlags.height) varied.height = mixRandom(prev.height ?? 250, 10, 900, true);

    // Movement
    if (varyFlags.movementStyle && w > 0.7 && Math.random() < w) {
      varied.movementStyle = prev.movementStyle === 'bounce' ? 'drift' : 'bounce';
    }
    if (varyFlags.movementSpeed) varied.movementSpeed = mixRandom(prev.movementSpeed ?? 1, 0, 5);
    if (varyFlags.movementAngle) {
      const nextAngle = mixRandom(prev.movementAngle ?? 45, 0, 360, true);
      varied.movementAngle = ((nextAngle % 360) + 360) % 360;
    }

    // Z scaling
    if (varyFlags.scaleSpeed) varied.scaleSpeed = mixRandom(prev.scaleSpeed ?? 0.05, 0, 0.2);
    let nextScaleMin = prev.scaleMin ?? 0.2;
    let nextScaleMax = prev.scaleMax ?? 1.5;
    if (varyFlags.scaleMin) nextScaleMin = mixRandom(prev.scaleMin ?? 0.2, 0.1, 2);
    if (varyFlags.scaleMax) nextScaleMax = mixRandom(prev.scaleMax ?? 1.5, 0.5, 3);
    varied.scaleMin = Math.min(nextScaleMin, nextScaleMax);
    varied.scaleMax = Math.max(nextScaleMin, nextScaleMax);

    // Image Effects
    if (varyFlags.imageBlur) varied.imageBlur = mixRandom(prev.imageBlur ?? 0, 0, 20);
    if (varyFlags.imageBrightness) varied.imageBrightness = mixRandom(prev.imageBrightness ?? 100, 0, 200, true);
    if (varyFlags.imageContrast) varied.imageContrast = mixRandom(prev.imageContrast ?? 100, 0, 200, true);
    if (varyFlags.imageHue) {
      const nextHue = mixRandom(prev.imageHue ?? 0, 0, 360, true);
      varied.imageHue = ((nextHue % 360) + 360) % 360;
    }
    if (varyFlags.imageSaturation) varied.imageSaturation = mixRandom(prev.imageSaturation ?? 100, 0, 200, true);
    if (varyFlags.imageDistortion) varied.imageDistortion = mixRandom(prev.imageDistortion ?? 0, 0, 50);

    // Position
    const baseX = prev.position?.x ?? 0.5;
    const baseY = prev.position?.y ?? 0.5;
    const jitter = 0.15 * w;
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

    // Velocity
    const angleRad = (varied.movementAngle ?? prev.movementAngle ?? 0) * (Math.PI / 180);
    varied.vx = Math.cos(angleRad) * ((varied.movementSpeed ?? prev.movementSpeed ?? 1) * 0.001) * 1.0;
    varied.vy = Math.sin(angleRad) * ((varied.movementSpeed ?? prev.movementSpeed ?? 1) * 0.001) * 1.0;

    // Colors: keep similar for small variation, may change for higher
    if (Array.isArray(prev.colors) && prev.colors.length) {
      if (w >= 0.75) {
        const currentKey = JSON.stringify(prev.colors);
        const candidates = palettes.filter(p => JSON.stringify(p) !== currentKey);
        const chosen = (candidates.length ? candidates : palettes)[Math.floor(Math.random() * (candidates.length ? candidates.length : palettes.length))];
        varied.colors = Array.isArray(chosen) ? chosen : (chosen.colors || prev.colors);
        varied.numColors = varied.colors.length;
      } else if (w >= 0.4) {
        const arr = [...prev.colors];
        for (let i = arr.length - 1; i > 0; i--) {
          if (Math.random() < 0.5 * w) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
          }
        }
        varied.colors = arr;
        varied.numColors = arr.length;
      } else {
        varied.colors = [...prev.colors];
        varied.numColors = prev.numColors ?? prev.colors.length;
      }
    }

    return { ...DEFAULT_LAYER, ...varied };
  };

  const updateCurrentLayer = (newProps) => {
    setLayers(prevLayers => {
      const updatedLayers = [...prevLayers];
      const idx = Math.max(0, Math.min(selectedLayerIndex, Math.max(0, updatedLayers.length - 1)));
      const currentLayer = updatedLayers[idx];
      const updatedLayer = { ...currentLayer, ...newProps };

      if (newProps.movementAngle !== undefined || newProps.movementSpeed !== undefined) {
        const angleRad = updatedLayer.movementAngle * (Math.PI / 180);
        // Map UI movementSpeed (0..5) to engine units
        updatedLayer.vx = Math.cos(angleRad) * (updatedLayer.movementSpeed * 0.001) * 1.0;
        updatedLayer.vy = Math.sin(angleRad) * (updatedLayer.movementSpeed * 0.001) * 1.0;
      }

      const clampedIndex = Math.max(0, Math.min(selectedLayerIndex, updatedLayers.length - 1));
      updatedLayers[clampedIndex] = updatedLayer;
      return updatedLayers;
    });
  };

  const addNewLayer = () => {
    const baseVar = (typeof layers?.[0]?.variation === 'number') ? layers[0].variation : DEFAULT_LAYER.variation;
    const prev = layers[layers.length - 1] || DEFAULT_LAYER;
    const nextLayer = buildVariedLayerFrom(prev, layers.length + 1, baseVar);
    setLayers([...layers, nextLayer]);
    setSelectedLayerIndex(layers.length);
  };

  const deleteLayer = (index) => {
    if (layers.length <= 1) return;
    const newLayers = layers
      .filter((_, i) => i !== index)
      .map((l, i) => ({ ...l, name: `Layer ${i + 1}` }));
    setLayers(newLayers);
    if (selectedLayerIndex >= index) {
      setSelectedLayerIndex(Math.max(0, selectedLayerIndex - 1));
    }
  };

  const selectLayer = (index) => {
    setSelectedLayerIndex(index);
  };

  const randomizeLayer = (index, _forcePalette = false) => {
    const randomizableParams = parameters.filter(p => p.isRandomizable);
    const layer = layers[index];

    const newProps = {};
    randomizableParams.forEach(param => {
        // Do not randomize per-layer opacity; global opacity is controlled elsewhere
        if (param.id === 'opacity') return;
        if (layer.layerType === 'image' && param.group === 'Shape') {
            return; // Skip shape params for image layers
        }
        switch (param.type) {
            case 'slider': {
                // Respect optional per-parameter random range overrides
                const rmin = Number.isFinite(param.randomMin) ? param.randomMin : param.min;
                const rmax = Number.isFinite(param.randomMax) ? param.randomMax : param.max;
                const low = Math.min(rmin ?? param.min, rmax ?? param.max);
                const high = Math.max(rmin ?? param.min, rmax ?? param.max);
                let rawValue = low + Math.random() * (high - low);
                // Clamp to authoritative slider bounds
                rawValue = Math.min(param.max, Math.max(param.min, rawValue));
                const finalValue = param.step === 1 ? Math.round(rawValue) : rawValue;
                newProps[param.id] = finalValue;
                
                // Debug logging for numSides
                if (param.id === 'numSides') {
                  console.log(`Randomizing numSides (randomizeLayer): min=${param.min}, max=${param.max}, rawRange=[${rmin}, ${rmax}], final=${finalValue}`);
                }
                break;
            }
            default:
                if (param.type === 'dropdown' && param.options) {
                    newProps[param.id] = param.options[Math.floor(Math.random() * param.options.length)];
                }
        }
    });

    // Color randomization gated by global toggles
    const doPalette = !!randomizePalette;
    const doCount = !!randomizeNumColors;
    if (doPalette || doCount) {
      const baseColors = Array.isArray(layer.colors) ? layer.colors : [];
      const currentN = Number.isFinite(layer.numColors) ? layer.numColors : (baseColors.length || 0);

      let nextPalette = baseColors;
      if (doPalette) {
        const pick = palettes[Math.floor(Math.random() * palettes.length)];
        nextPalette = Array.isArray(pick) ? pick : (pick.colors || baseColors);
      }

      let nextN = currentN;
      if (doCount) {
        const maxN = Math.min(5, (nextPalette.length || 5));
        const minN = Math.min(3, maxN);
        nextN = Math.max(1, Math.floor(Math.random() * (maxN - minN + 1)) + minN);
      }

      const nextColors = sampleColorsEven(nextPalette.length ? nextPalette : baseColors, nextN || currentN || 1);
      newProps.colors = nextColors;
      newProps.numColors = nextColors.length;
      newProps.selectedColor = 0;
    }

    const updatedLayer = { ...layers[index], ...newProps };

    if (newProps.movementAngle !== undefined || newProps.movementSpeed !== undefined) {
        const angleRad = updatedLayer.movementAngle * (Math.PI / 180);
        // Map UI movementSpeed (0..5) to engine units
        updatedLayer.vx = Math.cos(angleRad) * (updatedLayer.movementSpeed * 0.001) * 1.0;
        updatedLayer.vy = Math.sin(angleRad) * (updatedLayer.movementSpeed * 0.001) * 1.0;
    }

    return updatedLayer;
  };

  const randomizeCurrentLayer = (randomizePalette = false) => {
    const idx = Math.max(0, Math.min(selectedLayerIndex, Math.max(0, layers.length - 1)));
    const updated = randomizeLayer(idx, randomizePalette);
    setLayers(prev => prev.map((l, i) => (i === idx ? updated : l)));
  };

  // Randomize only animation-related settings for a single layer
  const randomizeAnimationOnly = (index) => {
    const layer = layers[index];
    if (!layer) return layer;

    const getParam = (id) => parameters.find(p => p.id === id);
    const sampleSlider = (id) => {
      const p = getParam(id);
      if (!p || p.type !== 'slider' || p.isRandomizable === false) return undefined;
      const rmin = Number.isFinite(p.randomMin) ? p.randomMin : p.min;
      const rmax = Number.isFinite(p.randomMax) ? p.randomMax : p.max;
      const low = Math.min(rmin ?? p.min, rmax ?? p.max);
      const high = Math.max(rmin ?? p.min, rmax ?? p.max);
      let v = low + Math.random() * (high - low);
      v = Math.min(p.max, Math.max(p.min, v));
      return p.step === 1 ? Math.round(v) : v;
    };
    const sampleDropdown = (id) => {
      const p = getParam(id);
      if (!p || p.type !== 'dropdown' || p.isRandomizable === false || !Array.isArray(p.options) || p.options.length === 0) return undefined;
      return p.options[Math.floor(Math.random() * p.options.length)];
    };

    const newProps = {};
    const ms = sampleDropdown('movementStyle'); if (ms !== undefined) newProps.movementStyle = ms;
    const spd = sampleSlider('movementSpeed'); if (spd !== undefined) newProps.movementSpeed = spd;
    const ang = sampleSlider('movementAngle'); if (ang !== undefined) newProps.movementAngle = ((Math.round(ang) % 360) + 360) % 360;
    const sspd = sampleSlider('scaleSpeed'); if (sspd !== undefined) newProps.scaleSpeed = sspd;

    const updated = { ...layer, ...newProps };
    if (newProps.movementAngle !== undefined || newProps.movementSpeed !== undefined) {
      const angleRad = updated.movementAngle * (Math.PI / 180);
      updated.vx = Math.cos(angleRad) * (updated.movementSpeed * 0.001) * 1.0;
      updated.vy = Math.sin(angleRad) * (updated.movementSpeed * 0.001) * 1.0;
    }
    return updated;
  };

  const randomizeAnimationForCurrentLayer = () => {
    const idx = Math.max(0, Math.min(selectedLayerIndex, Math.max(0, layers.length - 1)));
    const updated = randomizeAnimationOnly(idx);
    if (!updated) return;
    setLayers(prev => prev.map((l, i) => (i === idx ? updated : l)));
  };

  // --- Modern randomizer (existing) ---
  const modernRandomizeAll = () => {
    // Global gating flags
    const incBG = getIsRnd('backgroundColor');
    const incSpeed = getIsRnd('globalSpeedMultiplier');
    const incBlend = getIsRnd('globalBlendMode');
    const incOpacity = getIsRnd('globalOpacity');
    const incLayers = getIsRnd('layersCount');

    // Helper utilities
    const clamp = (val, min, max) => Math.min(max, Math.max(min, val));
    const mixRandom = (baseVal, min, max, w, integer = false) => {
      const rnd = min + Math.random() * Math.max(0, (max - min));
      let next = baseVal * (1 - w) + rnd * w;
      next = clamp(next, min, max);
      if (integer) next = Math.round(next);
      return next;
    };

    // Parameter helpers
    const getParam = (id) => parameters.find(p => p.id === id);
    const sampleSlider = (id) => {
      const p = getParam(id);
      if (!p || p.type !== 'slider' || p.isRandomizable === false) return undefined;
      const rmin = Number.isFinite(p.randomMin) ? p.randomMin : p.min;
      const rmax = Number.isFinite(p.randomMax) ? p.randomMax : p.max;
      const low = Math.min(rmin ?? p.min, rmax ?? p.max);
      const high = Math.max(rmin ?? p.min, rmax ?? p.max);
      let v = low + Math.random() * (high - low);
      v = clamp(v, p.min, p.max);
      return p.step === 1 ? Math.round(v) : v;
    };
    const sampleDropdown = (id) => {
      const p = getParam(id);
      if (!p || p.type !== 'dropdown' || p.isRandomizable === false || !Array.isArray(p.options) || p.options.length === 0) return undefined;
      return p.options[Math.floor(Math.random() * p.options.length)];
    };

    // Decide number of layers (gated by layersCount)
    const layersParam = parameters.find(p => p.id === 'layersCount');
    const defMinL = Number.isFinite(layersParam?.min) ? layersParam.min : 1;
    const defMaxL = Number.isFinite(layersParam?.max) ? layersParam.max : 8;
    const layerCount = incLayers
      ? Math.floor(Math.random() * (defMaxL - defMinL + 1)) + defMinL
      : layers.length;

    // Choose a base scene palette/size with gating
    let scenePreset = palettes[Math.floor(Math.random() * palettes.length)];
    let sceneColors = Array.isArray(scenePreset) ? scenePreset : (scenePreset.colors || []);
    const currentBase = Array.isArray(layers?.[0]?.colors) ? layers[0].colors : [];
    const currentN = Number.isFinite(layers?.[0]?.numColors) ? layers[0].numColors : (currentBase.length || 3);
    if (!randomizePalette) {
      sceneColors = currentBase.length ? currentBase : (sceneColors || []);
    }
    const sceneMaxN = Math.min(5, (sceneColors.length || currentN || 5));
    const sceneMinN = Math.min(3, sceneMaxN);
    const sceneN = randomizeNumColors
      ? (sceneMaxN > 0 ? Math.floor(Math.random() * (sceneMaxN - sceneMinN + 1)) + sceneMinN : currentN)
      : currentN;
    const baseColors = (sceneColors.length || currentBase.length)
      ? sampleColorsEven(sceneColors.length ? sceneColors : currentBase, Math.max(1, sceneN))
      : ["#FFC300", "#FF5733", "#C70039"]; // fallback
    const basePaletteName = (Array.isArray(scenePreset) ? undefined : scenePreset?.name);

    // Base variation from parameter metadata when available
    const baseVariation = (() => {
      const p = getParam('variation');
      if (!p || p.type !== 'slider' || p.isRandomizable === false) return DEFAULT_LAYER.variation ?? 0.2;
      return sampleSlider('variation');
    })();
    const w = clamp((baseVariation ?? 0) / 3, 0, 1);

    const varyFlags = (currentLayer?.vary || DEFAULT_LAYER.vary || {});

    const currentOpacity = Number(layers?.[0]?.opacity ?? DEFAULT_LAYER.opacity);
    const base = {
      ...DEFAULT_LAYER,
      name: 'Layer 1',
      seed: Math.random(),
      noiseSeed: Math.random(),
      variation: Number(baseVariation?.toFixed ? baseVariation.toFixed(2) : baseVariation),
      numSides: sampleSlider('numSides') ?? DEFAULT_LAYER.numSides,
      curviness: sampleSlider('curviness') ?? DEFAULT_LAYER.curviness,
      wobble: sampleSlider('wobble') ?? DEFAULT_LAYER.wobble,
      noiseAmount: sampleSlider('noiseAmount') ?? DEFAULT_LAYER.noiseAmount,
      width: sampleSlider('width') ?? DEFAULT_LAYER.width,
      height: sampleSlider('height') ?? DEFAULT_LAYER.height,
      // Opacity: keep existing unless globally randomized later
      opacity: currentOpacity,
      movementStyle: sampleDropdown('movementStyle') ?? DEFAULT_LAYER.movementStyle,
      movementSpeed: sampleSlider('movementSpeed') ?? DEFAULT_LAYER.movementSpeed,
      movementAngle: sampleSlider('movementAngle') ?? DEFAULT_LAYER.movementAngle,
      scaleSpeed: sampleSlider('scaleSpeed') ?? DEFAULT_LAYER.scaleSpeed,
      // Respect non-randomizable scale bounds
      scaleMin: DEFAULT_LAYER.scaleMin,
      scaleMax: DEFAULT_LAYER.scaleMax,
      colors: baseColors,
      numColors: baseColors.length,
      selectedColor: 0,
      position: {
        ...DEFAULT_LAYER.position,
        x: Math.random(),
        y: Math.random(),
      },
      vary: { ...varyFlags },
    };

    // Compute velocity
    {
      const angleRad = base.movementAngle * (Math.PI / 180);
      base.vx = Math.cos(angleRad) * (base.movementSpeed * 0.001) * 1.0;
      base.vy = Math.sin(angleRad) * (base.movementSpeed * 0.001) * 1.0;
    }

    // Create remaining layers by varying from the base using its variation and param ranges
    const layersOut = [base];
    for (let i = 1; i < layerCount; i++) {
      const varied = { ...base };
      varied.name = `Layer ${i + 1}`;
      // new seeds
      varied.seed = Math.random();
      varied.noiseSeed = Math.random();
      // ensure vary flags are not shared by reference across layers
      varied.vary = { ...varyFlags };

      // Vary geometry and style relative to base via parameter metadata
      {
        const p = getParam('numSides'); if (p?.isRandomizable && varyFlags.numSides) varied.numSides = mixRandom(base.numSides, p.randomMin ?? p.min, p.randomMax ?? p.max, w, p.step === 1);
      }
      {
        const p = getParam('curviness'); if (p?.isRandomizable && varyFlags.curviness) varied.curviness = mixRandom(base.curviness, p.randomMin ?? p.min, p.randomMax ?? p.max, w);
      }
      {
        const p = getParam('wobble'); if (p?.isRandomizable && varyFlags.wobble) varied.wobble = mixRandom(base.wobble, p.randomMin ?? p.min, p.randomMax ?? p.max, w);
      }
      {
        const p = getParam('noiseAmount'); if (p?.isRandomizable && varyFlags.noiseAmount) varied.noiseAmount = mixRandom(base.noiseAmount, p.randomMin ?? p.min, p.randomMax ?? p.max, w);
      }
      {
        const p = getParam('width'); if (p?.isRandomizable && varyFlags.width) varied.width = mixRandom(base.width, p.randomMin ?? p.min, p.randomMax ?? p.max, w, p.step === 1);
      }
      {
        const p = getParam('height'); if (p?.isRandomizable && varyFlags.height) varied.height = mixRandom(base.height, p.randomMin ?? p.min, p.randomMax ?? p.max, w, p.step === 1);
      }

      // Image Effects (gated by per-layer vary flags)
      {
        const p = getParam('imageBlur'); if (p?.isRandomizable && varyFlags.imageBlur) varied.imageBlur = mixRandom(base.imageBlur, p.randomMin ?? p.min, p.randomMax ?? p.max, w);
      }
      {
        const p = getParam('imageBrightness'); if (p?.isRandomizable && varyFlags.imageBrightness) varied.imageBrightness = mixRandom(base.imageBrightness, p.randomMin ?? p.min, p.randomMax ?? p.max, w, p.step === 1);
      }
      {
        const p = getParam('imageContrast'); if (p?.isRandomizable && varyFlags.imageContrast) varied.imageContrast = mixRandom(base.imageContrast, p.randomMin ?? p.min, p.randomMax ?? p.max, w, p.step === 1);
      }
      {
        const p = getParam('imageHue'); if (p?.isRandomizable && varyFlags.imageHue) {
          const nextHue = mixRandom(base.imageHue, p.randomMin ?? p.min, p.randomMax ?? p.max, w, true);
          varied.imageHue = ((nextHue % 360) + 360) % 360;
        }
      }
      {
        const p = getParam('imageSaturation'); if (p?.isRandomizable && varyFlags.imageSaturation) varied.imageSaturation = mixRandom(base.imageSaturation, p.randomMin ?? p.min, p.randomMax ?? p.max, w, p.step === 1);
      }
      {
        const p = getParam('imageDistortion'); if (p?.isRandomizable && varyFlags.imageDistortion) varied.imageDistortion = mixRandom(base.imageDistortion, p.randomMin ?? p.min, p.randomMax ?? p.max, w);
      }

      // Opacity: keep constant to avoid per-layer randomization
      varied.opacity = base.opacity;

      // Movement
      {
        const p = getParam('movementStyle');
        if (p?.isRandomizable && varyFlags.movementStyle && w > 0.7 && Math.random() < w) {
          varied.movementStyle = base.movementStyle === 'bounce' ? 'drift' : 'bounce';
        }
      }
      {
        const p = getParam('movementSpeed'); if (p?.isRandomizable && varyFlags.movementSpeed) varied.movementSpeed = mixRandom(base.movementSpeed, p.randomMin ?? p.min, p.randomMax ?? p.max, w);
      }
      {
        const p = getParam('movementAngle'); if (p?.isRandomizable && varyFlags.movementAngle) {
          const nextAngle = mixRandom(base.movementAngle, p.randomMin ?? p.min, p.randomMax ?? p.max, w, true);
          varied.movementAngle = ((nextAngle % 360) + 360) % 360;
        }
      }
      {
        const p = getParam('scaleSpeed'); if (p?.isRandomizable && varyFlags.scaleSpeed) varied.scaleSpeed = mixRandom(base.scaleSpeed, p.randomMin ?? p.min, p.randomMax ?? p.max, w);
      }

      // Position jitter
      const jitter = 0.15 * w;
      const jx = (Math.random() * 2 - 1) * jitter;
      const jy = (Math.random() * 2 - 1) * jitter;
      const nx = clamp(base.position.x + jx, 0.0, 1.0);
      const ny = clamp(base.position.y + jy, 0.0, 1.0);
      varied.position = { ...base.position, x: nx, y: ny };

        // Colors: gate palette/count randomization
      if (!randomizePalette && !randomizeNumColors) {
        varied.colors = [...base.colors];
        varied.numColors = base.numColors;
      } else {
        if (baseVariation > 2 && randomizePalette) {
          const candidates = palettes.filter(p => p.name !== basePaletteName);
          const picked = (candidates.length ? candidates : palettes)[Math.floor(Math.random() * (candidates.length || palettes.length))];
          const newCols = sampleColorsEven((picked?.colors || []), base.numColors || base.colors.length || 3);
          varied.colors = newCols.length ? newCols : [...base.colors];
          varied.numColors = varied.colors.length;
        } else if (baseVariation > 1 && randomizePalette) {
          const candidates = palettes.filter(p => p.name !== basePaletteName);
          const picked = (candidates.length ? candidates : palettes)[Math.floor(Math.random() * (candidates.length || palettes.length))];
          const n = base.numColors || base.colors.length || 3;
          const keepCount = Math.max(1, Math.round(n * (2 - baseVariation)));
          const newCount = Math.max(0, n - keepCount);
          const fromBase = [...base.colors].sort(() => Math.random() - 0.5).slice(0, keepCount);
          const fromPicked = sampleColorsEven((picked?.colors || []), newCount);
          const mixed = [...fromBase, ...fromPicked];
          // Shuffle mixed result slightly
          for (let k = mixed.length - 1; k > 0; k--) {
            if (Math.random() < 0.5) {
              const j = Math.floor(Math.random() * (k + 1));
              [mixed[k], mixed[j]] = [mixed[j], mixed[k]];
            }
          }
          varied.colors = mixed.length ? mixed : [...base.colors];
          varied.numColors = varied.colors.length;
        } else {
          // Variation <= 1: optional shuffles only if palette randomization allowed
          if (randomizePalette && w >= 0.75) {
            const arr = [...base.colors];
            for (let k = arr.length - 1; k > 0; k--) {
              if (Math.random() < 0.8) {
                const j = Math.floor(Math.random() * (k + 1));
                [arr[k], arr[j]] = [arr[j], arr[k]];
              }
            }
            varied.colors = arr;
            varied.numColors = arr.length;
          } else if (randomizePalette && w >= 0.4) {
            const arr = [...base.colors];
            for (let k = arr.length - 1; k > 0; k--) {
              if (Math.random() < 0.4) {
                const j = Math.floor(Math.random() * (k + 1));
                [arr[k], arr[j]] = [arr[j], arr[k]];
              }
            }
            varied.colors = arr;
            varied.numColors = arr.length;
          } else {
            varied.colors = [...base.colors];
            varied.numColors = base.numColors;
          }
        }
      }

      // Recompute velocity
      {
        const angleRad = varied.movementAngle * (Math.PI / 180);
        varied.vx = Math.cos(angleRad) * (varied.movementSpeed * 0.001) * 1.0;
        varied.vy = Math.sin(angleRad) * (varied.movementSpeed * 0.001) * 1.0;
      }

      layersOut.push(varied);
    }

    // Apply one colour per layer by spreading the scene palette across layers
    try {
      const singleColours = sampleColorsEven(baseColors, Math.max(1, layerCount));
      for (let i = 0; i < layersOut.length; i++) {
        const c = singleColours[i % singleColours.length];
        layersOut[i].colors = [c];
        layersOut[i].numColors = 1;
        layersOut[i].selectedColor = 0;
      }
    } catch {}

    // Apply global opacity randomization if enabled
    if (incOpacity) {
      const p = getParam('globalOpacity');
      const omin = Number.isFinite(p?.min) ? p.min : 0;
      const omax = Number.isFinite(p?.max) ? p.max : 1;
      const oval = omin + Math.random() * Math.max(0, omax - omin);
      layersOut.forEach(l => { l.opacity = Number(oval.toFixed(2)); });
    }

    setLayers(layersOut.map((l, idx) => ({ ...l, name: `Layer ${idx + 1}` })));
    setSelectedLayerIndex(0);

    // Background color (gated) - choose independent colour, not from palette
    if (incBG) {
      const h = Math.floor(Math.random() * 360);
      const s = Math.floor(40 + Math.random() * 40);
      const l = Math.floor(25 + Math.random() * 55);
      const hslToHex = (hh, ss, ll) => {
        const s1 = ss / 100, l1 = ll / 100;
        const c = (1 - Math.abs(2 * l1 - 1)) * s1;
        const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
        const m = l1 - c / 2;
        let r=0,g=0,b=0;
        if (hh < 60) { r = c; g = x; }
        else if (hh < 120) { r = x; g = c; }
        else if (hh < 180) { g = c; b = x; }
        else if (hh < 240) { g = x; b = c; }
        else if (hh < 300) { r = x; b = c; }
        else { r = c; b = x; }
        const toHex = v => Math.round((v + m) * 255).toString(16).padStart(2, '0');
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
      };
      setBackgroundColor(hslToHex(h, s, l));
    }
    // Global blend mode (gated)
    if (incBlend) {
      setGlobalBlendMode(blendModes[Math.floor(Math.random() * blendModes.length)]);
    }
    // Global speed (gated)
    if (incSpeed) {
      const p = getParam('globalSpeedMultiplier');
      const smin = Number.isFinite(p?.min) ? p.min : 0;
      const smax = Number.isFinite(p?.max) ? p.max : 5;
      const sval = smin + Math.random() * Math.max(0, smax - smin);
      setGlobalSpeedMultiplier(Number(sval.toFixed(2)));
    }
  };

  // --- Classic randomizer (CodePen-like) ---
  const classicRandomizeAll = () => {
    const rnd = Math.random;

    // Global gating flags
    const incBG = getIsRnd('backgroundColor');
    const incSpeed = getIsRnd('globalSpeedMultiplier');
    const incBlend = getIsRnd('globalBlendMode');
    const incOpacity = getIsRnd('globalOpacity');
    const incLayers = getIsRnd('layersCount');

    // 1. Choose scene palette once (gated)
    let scenePreset = palettes[Math.floor(rnd() * palettes.length)];
    let sceneColors = Array.isArray(scenePreset) ? scenePreset : (scenePreset.colors || []);
    const currentBase = Array.isArray(layers?.[0]?.colors) ? layers[0].colors : [];
    const currentN = Number.isFinite(layers?.[0]?.numColors) ? layers[0].numColors : (currentBase.length || 3);
    if (!randomizePalette) {
      sceneColors = currentBase.length ? currentBase : sceneColors;
    }
    let baseColors = sceneColors.length ? sceneColors : ['#FF5733', '#C70039', '#900C3F'];
    if (randomizeNumColors) {
      const maxN = Math.min(5, baseColors.length || 5);
      const minN = Math.min(3, maxN);
      const n = Math.floor(rnd() * (maxN - minN + 1)) + minN;
      baseColors = sampleColorsEven(baseColors, n);
    } else {
      baseColors = sampleColorsEven(baseColors, Math.max(1, currentN));
    }

    // 2. Number of layers (gated)
    const layersParam = parameters.find(p => p.id === 'layersCount');
    const defMinL = Number.isFinite(layersParam?.min) ? layersParam.min : 1;
    const defMaxL = Number.isFinite(layersParam?.max) ? layersParam.max : 20;
    const layerCount = incLayers ? (Math.floor(rnd() * (defMaxL - defMinL + 1)) + defMinL) : layers.length;

    const buildLayer = (idx) => {
      const layer = { ...DEFAULT_LAYER };
      layer.name = `Layer ${idx + 1}`;
      layer.layerType = 'shape';
      layer.seed = rnd();
      layer.noiseSeed = rnd();

      // Geometry
      layer.numSides = Math.floor(3 + rnd() * 17); // 3..20
      layer.curviness = Number((0.3 + rnd() * 1.2).toFixed(3)); // 0.3..1.5
      layer.wobble = rnd();
      layer.noiseAmount = Number((rnd() * 8).toFixed(2));
      layer.width = Math.floor(10 + rnd() * 890);
      layer.height = Math.floor(10 + rnd() * 890);

      // Appearance
      layer.colors = baseColors;
      layer.numColors = baseColors.length;
      // Global opacity target: keep current unless gated randomization is on (applied after creation)
      layer.opacity = Number(layers?.[0]?.opacity ?? 0.8);

      // Movement (bounce only)
      layer.movementStyle = 'bounce';
      layer.movementAngle = Math.floor(rnd() * 360);
      layer.movementSpeed = Number((Math.pow(rnd(), 4) * 5).toFixed(3)); // quartic scaling mapped to 0..5 UI scale
      const angleRad = layer.movementAngle * (Math.PI / 180);
      layer.vx = Math.cos(angleRad) * (layer.movementSpeed * 0.001);
      layer.vy = Math.sin(angleRad) * (layer.movementSpeed * 0.001);

      // Scale / Z
      layer.scaleMin = 0.2;
      layer.scaleMax = 1.5;
      layer.scaleSpeed = 0.05;

      // Position centreish
      layer.position = { ...DEFAULT_LAYER.position, x: rnd(), y: rnd(), scale: 1, scaleDirection: 1 };

      return layer;
    };

    const newLayers = Array.from({ length: layerCount }, (_, idx) => buildLayer(idx));

    // One colour per layer: spread baseColors across layers
    try {
      const singleColours = sampleColorsEven(baseColors, Math.max(1, layerCount));
      for (let i = 0; i < newLayers.length; i++) {
        const c = singleColours[i % singleColours.length];
        newLayers[i].colors = [c];
        newLayers[i].numColors = 1;
        newLayers[i].selectedColor = 0;
      }
    } catch {}

    // 3. Commit state
    // Apply global opacity randomization if enabled
    if (incOpacity) {
      const p = parameters.find(pp => pp.id === 'globalOpacity');
      const omin = Number.isFinite(p?.min) ? p.min : 0;
      const omax = Number.isFinite(p?.max) ? p.max : 1;
      const oval = omin + rnd() * Math.max(0, omax - omin);
      newLayers.forEach(l => { l.opacity = Number(oval.toFixed(2)); });
    }

    setLayers(newLayers);
    setSelectedLayerIndex(0);

    // 4. Global settings (gated)
    if (incBG) {
      // independent background colour
      const h = Math.floor(rnd() * 360);
      const s = Math.floor(40 + rnd() * 40);
      const l = Math.floor(25 + rnd() * 55);
      const hslToHex = (hh, ss, ll) => {
        const s1 = ss / 100, l1 = ll / 100;
        const c = (1 - Math.abs(2 * l1 - 1)) * s1;
        const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
        const m = l1 - c / 2;
        let r=0,g=0,b=0;
        if (hh < 60) { r = c; g = x; }
        else if (hh < 120) { r = x; g = c; }
        else if (hh < 180) { g = c; b = x; }
        else if (hh < 240) { g = x; b = c; }
        else if (hh < 300) { r = x; b = c; }
        else { r = c; b = x; }
        const toHex = v => Math.round((v + m) * 255).toString(16).padStart(2, '0');
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
      };
      setBackgroundColor(hslToHex(h, s, l));
    }
    if (incBlend) {
      setGlobalBlendMode('source-over');
    }
    if (incSpeed) {
      const p = parameters.find(pp => pp.id === 'globalSpeedMultiplier');
      const smin = Number.isFinite(p?.min) ? p.min : 0;
      const smax = Number.isFinite(p?.max) ? p.max : 5;
      const sval = smin + rnd() * Math.max(0, smax - smin);
      setGlobalSpeedMultiplier(Number(sval.toFixed(2)));
    }

    // Ensure blur will be applied via classicMode flag, and opacity unified
  };

  // Wrapper that chooses algorithm based on classicMode flag
  // Generate a visually pleasant random color independent of layer palettes
  const randomBackgroundColor = () => {
    // Use HSL for wide gamut; avoid extremes for nicer backgrounds
    const h = Math.floor(Math.random() * 360);
    const s = Math.floor(40 + Math.random() * 40); // 40%..80%
    const l = Math.floor(25 + Math.random() * 55); // 25%..80%
    // Convert to hex for consistency with the rest of the app
    const hslToHex = (hh, ss, ll) => {
      const s1 = ss / 100;
      const l1 = ll / 100;
      const c = (1 - Math.abs(2 * l1 - 1)) * s1;
      const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
      const m = l1 - c / 2;
      let r = 0, g = 0, b = 0;
      if (hh < 60) { r = c; g = x; b = 0; }
      else if (hh < 120) { r = x; g = c; b = 0; }
      else if (hh < 180) { r = 0; g = c; b = x; }
      else if (hh < 240) { r = 0; g = x; b = c; }
      else if (hh < 300) { r = x; g = 0; b = c; }
      else { r = c; g = 0; b = x; }
      const toHex = (v) => {
        const n = Math.round((v + m) * 255);
        return n.toString(16).padStart(2, '0');
      };
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    };
    return hslToHex(h, s, l);
  };

  const handleRandomizeAll = () => {
    if (classicMode) classicRandomizeAll();
    else modernRandomizeAll();
  };

  const randomizeScene = () => {
    if (classicMode) return classicRandomizeAll();

    // fallback to modern variant of per-layer randomization
    const newLayers = layers.map((layer, index) => randomizeLayer(index));
    setLayers(newLayers);
    // Pick an entirely independent background colour
    setBackgroundColor(randomBackgroundColor());
  };

  // Randomize only the colors (and optionally color count) per layer based on global toggles
  const randomizeColorsOnly = () => {
    // Choose a palette (if enabled) and assign exactly one colour per layer
    if (randomizePalette) {
      const picked = palettes[Math.floor(Math.random() * palettes.length)];
      const paletteColors = Array.isArray(picked) ? picked : (picked.colors || []);
      const nextColors = paletteColors.length ? paletteColors : ['#ffffff', '#000000'];
      assignOneColorPerLayer(nextColors);
    } else {
      // If not changing palette, pick a single colour from current base and apply per layer
      const base = Array.isArray(layers?.[0]?.colors) ? layers[0].colors : ['#ffffff'];
      const colour = base.length ? base[Math.floor(Math.random() * base.length)] : '#ffffff';
      assignOneColorPerLayer([colour]);
    }
  };

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
            {/* Global controls section */}
            <div className="control-card">
              <h3 style={{ marginTop: 0, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>Global</span>
                <button className="icon-btn sm" onClick={handleRandomizeAll} title="Randomise everything" aria-label="Randomise everything">🎲</button>
              </h3>
              <div className="control-group" style={{ margin: 0 }}>
                {/* Background Color with inline include toggle */}
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.25rem', gap: '0.5rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: '1 1 auto', minWidth: 0, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600 }}>Background</span>
                  <BackgroundColorPicker compact inline hideLabel showMidi={showGlobalMidi} color={backgroundColor} onChange={setBackgroundColor} />
                  <label className="compact-label" title="Enable background image">
                    <input
                      type="checkbox"
                      checked={!!backgroundImage?.enabled}
                      onChange={(e) => setBackgroundImage(prev => ({ ...(prev || {}), enabled: !!e.target.checked }))}
                    />
                    Img
                  </label>
                  {backgroundImage?.enabled && (
                    <>
                      {/* Background Image mini controls */}
                      <input
                        type="file"
                        accept="image/png, image/jpeg"
                        title="Set background image"
                        aria-label="Set background image"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = (ev) => {
                            const src = String(ev.target?.result || '');
                            setBackgroundImage(prev => ({ ...(prev || {}), src, enabled: true }));
                          };
                          reader.readAsDataURL(file);
                          // allow selecting same file again later
                          e.target.value = '';
                        }}
                        style={{ width: 24 }}
                      />
                      <label className="compact-label" title="Background image opacity">
                        Opac
                        <input
                          type="range"
                          className="compact-range"
                          min={0}
                          max={1}
                          step={0.01}
                          value={Math.max(0, Math.min(1, Number(backgroundImage?.opacity ?? 1)))}
                          onChange={(e) => setBackgroundImage(prev => ({ ...(prev || {}), opacity: parseFloat(e.target.value) }))}
                          style={{ width: 80 }}
                        />
                      </label>
                      <select
                        className="compact-select"
                        value={backgroundImage?.fit || 'cover'}
                        onChange={(e) => setBackgroundImage(prev => ({ ...(prev || {}), fit: e.target.value }))}
                        title="Background image fit"
                        aria-label="Background image fit"
                      >
                        <option value="cover">cover</option>
                        <option value="contain">contain</option>
                        <option value="stretch">stretch</option>
                        <option value="center">center</option>
                      </select>
                      <button
                        type="button"
                        className="btn-compact-secondary"
                        title="Clear background image"
                        onClick={() => setBackgroundImage({ src: null, enabled: false, opacity: 1, fit: 'cover' })}
                      >
                        Clear
                      </button>
                    </>
                  )}
                </div>
                <label className="compact-label" title="Include Background Color in Randomize All" style={{ marginLeft: 'auto' }}>
                  <input type="checkbox" checked={getIsRnd('backgroundColor')} onChange={(e) => setIsRnd('backgroundColor', e.target.checked)} />
                  Include
                </label>
              </div>

                <div className="global-compact-row">
                  <label className="compact-label">
                    <input
                      type="checkbox"
                      checked={isFrozen}
                      onChange={(e) => setIsFrozen(e.target.checked)}
                    />
                    Freeze
                  </label>

                  <label className="compact-label">
                    <input
                      type="checkbox"
                      checked={classicMode}
                      onChange={(e) => setClassicMode(e.target.checked)}
                    />
                    Classic Mode
                  </label>

                  <label className="compact-label" title="Show/Hide MIDI Learn controls in this section">
                    <input type="checkbox" checked={showGlobalMidi} onChange={(e) => setShowGlobalMidi(!!e.target.checked)} />
                    MIDI Learn
                  </label>

                  <div className="compact-field">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span className="compact-label">Global Speed: {globalSpeedMultiplier.toFixed(2)}</span>
                      <label className="compact-label" title="Include Global Speed in Randomize All">
                        <input type="checkbox" checked={getIsRnd('globalSpeedMultiplier')} onChange={(e) => setIsRnd('globalSpeedMultiplier', e.target.checked)} />
                        Include
                      </label>
                    </div>
                    <input
                      className="compact-range"
                      type="range"
                      min={0}
                      max={5}
                      step={0.01}
                      value={globalSpeedMultiplier}
                      onChange={(e) => setGlobalSpeedMultiplier(parseFloat(e.target.value))}
                    />
                    {showGlobalMidi && (
                      <div className="compact-row" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.25rem' }}>
                        <span className="compact-label" style={{ opacity: 0.8 }}>MIDI: {midiSupported ? (midiMappings?.globalSpeedMultiplier ? (mappingLabel ? mappingLabel(midiMappings.globalSpeedMultiplier) : 'Mapped') : 'Not mapped') : 'Not supported'}</span>
                        {learnParamId === 'globalSpeedMultiplier' && midiSupported && <span style={{ color: '#4fc3f7' }}>Listening…</span>}
                        <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); beginLearn && beginLearn('globalSpeedMultiplier'); }} disabled={!midiSupported}>Learn</button>
                        <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); clearMapping && clearMapping('globalSpeedMultiplier'); }} disabled={!midiSupported || !midiMappings?.globalSpeedMultiplier}>Clear</button>
                      </div>
                    )}
                  </div>

                  <div className="compact-field">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <label className="compact-label">Palette</label>
                      <label className="compact-label" title="Allow Randomize All to change the palette">
                        <input type="checkbox" checked={!!randomizePalette} onChange={(e) => { e.stopPropagation(); setRandomizePalette(!!e.target.checked); }} />
                        Include
                      </label>
                    </div>
                    <select
                      className="compact-select"
                      value={(() => {
                        const colorsNow = (layers || []).map(l => (Array.isArray(l?.colors) && l.colors[0]) ? l.colors[0].toLowerCase() : '#000000');
                        const idx = palettes.findIndex(p => {
                          const src = Array.isArray(p) ? p : (p?.colors || []);
                          const sampled = sampleColorsEven(src, Math.max(1, layers.length));
                          return sampled.length === colorsNow.length && sampled.every((c, i) => (c || '').toLowerCase() === (colorsNow[i] || '')); 
                        });
                        return idx === -1 ? 'custom' : String(idx);
                      })()}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === 'custom') return;
                        const idx = parseInt(val, 10);
                        if (!Number.isFinite(idx) || !palettes[idx]) return;
                        const pick = palettes[idx];
                        const src = Array.isArray(pick) ? pick : (pick?.colors || []);
                        const nextColors = sampleColorsEven(src, Math.max(1, layers.length));
                        assignOneColorPerLayer(nextColors);
                      }}
                    >
                      <option value="custom">Custom</option>
                      {palettes.map((p, i) => (
                        <option key={i} value={i}>{p.name || `Palette ${i+1}`}</option>
                      ))}
                    </select>
                  </div>

                  <div className="compact-field">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <label className="compact-label">Style</label>
                      <label className="compact-label" title="Include Style in Randomize All">
                        <input type="checkbox" checked={getIsRnd('globalBlendMode')} onChange={(e) => setIsRnd('globalBlendMode', e.target.checked)} />
                        Include
                      </label>
                    </div>
                    <select
                      className="compact-select"
                      value={globalBlendMode}
                      onChange={(e) => setGlobalBlendMode(e.target.value)}
                    >
                      {blendModes.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                    {showGlobalMidi && (
                      <div className="compact-row" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.25rem' }}>
                        <span className="compact-label" style={{ opacity: 0.8 }}>MIDI: {midiSupported ? (midiMappings?.globalBlendMode ? (mappingLabel ? mappingLabel(midiMappings.globalBlendMode) : 'Mapped') : 'Not mapped') : 'Not supported'}</span>
                        {learnParamId === 'globalBlendMode' && midiSupported && <span style={{ color: '#4fc3f7' }}>Listening…</span>}
                        <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); beginLearn && beginLearn('globalBlendMode'); }} disabled={!midiSupported}>Learn</button>
                        <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); clearMapping && clearMapping('globalBlendMode'); }} disabled={!midiSupported || !midiMappings?.globalBlendMode}>Clear</button>
                      </div>
                    )}
                  </div>

                  <div className="compact-field">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span className="compact-label">MIDI Input</span>
                    </div>
                    {!midiSupported ? (
                      <div className="compact-label" style={{ opacity: 0.7 }}>Not supported</div>
                    ) : (
                      <select
                        className="compact-select"
                        value={midiInputId || ''}
                        onChange={(e) => setMidiInputId && setMidiInputId(e.target.value)}
                      >
                        <option value="">— None —</option>
                        {(midiInputs || []).map(inp => (
                          <option key={inp.id} value={inp.id}>{inp.name || 'Input'}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div className="compact-field">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span className="compact-label">Opacity: {Number(layers?.[0]?.opacity ?? 1).toFixed(2)}</span>
                      <label className="compact-label" title="Include Opacity in Randomize All">
                        <input type="checkbox" checked={getIsRnd('globalOpacity')} onChange={(e) => setIsRnd('globalOpacity', e.target.checked)} />
                        Include
                      </label>
                    </div>
                    <input
                      className="compact-range"
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={Number(layers?.[0]?.opacity ?? 1)}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setLayers(prev => prev.map(l => ({ ...l, opacity: v })));
                      }}
                    />
                    {showGlobalMidi && (
                      <div className="compact-row" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.25rem' }}>
                        <span className="compact-label" style={{ opacity: 0.8 }}>MIDI: {midiSupported ? (midiMappings?.globalOpacity ? (mappingLabel ? mappingLabel(midiMappings.globalOpacity) : 'Mapped') : 'Not mapped') : 'Not supported'}</span>
                        {learnParamId === 'globalOpacity' && midiSupported && <span style={{ color: '#4fc3f7' }}>Listening…</span>}
                        <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); beginLearn && beginLearn('globalOpacity'); }} disabled={!midiSupported}>Learn</button>
                        <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); clearMapping && clearMapping('globalOpacity'); }} disabled={!midiSupported || !midiMappings?.globalOpacity}>Clear</button>
                      </div>
                    )}
                  </div>

                  <div className="compact-field">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span className="compact-label">Layers</span>
                      <label className="compact-label" title="Include Layer Count in Randomize All">
                        <input type="checkbox" checked={getIsRnd('layersCount')} onChange={(e) => setIsRnd('layersCount', e.target.checked)} />
                        Include
                      </label>
                    </div>
                    <input
                      className="compact-range"
                      type="range"
                      min={1}
                      max={20}
                      step={1}
                      value={layers.length}
                      onChange={(e) => {
                        const target = parseInt(e.target.value, 10);
                        setLayers(prev => {
                          let next = prev;
                          if (target > prev.length) {
                            const addCount = target - prev.length;
                            const baseVar = (typeof prev[0]?.variation === 'number') ? prev[0].variation : DEFAULT_LAYER.variation;
                            let last = prev[prev.length - 1] || DEFAULT_LAYER;
                            const additions = Array.from({ length: addCount }, (_, i) => {
                              const nextIdx = prev.length + i + 1;
                              const nextLayer = buildVariedLayerFrom(last, nextIdx, baseVar);
                              last = nextLayer;
                              return nextLayer;
                            });
                            next = [...prev, ...additions];
                          } else if (target < prev.length) {
                            next = prev.slice(0, target);
                          }
                          return next.map((l, i) => ({ ...l, name: `Layer ${i + 1}` }));
                        });
                        // Always select the last available layer after resizing count
                        setSelectedLayerIndex(() => Math.max(0, target - 1));
                      }}
                    />
                    <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>{layers.length}</span>
                    {showGlobalMidi && (
                      <div className="compact-row" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.25rem' }}>
                        <span className="compact-label" style={{ opacity: 0.8 }}>MIDI: {midiSupported ? (midiMappings?.layersCount ? (mappingLabel ? mappingLabel(midiMappings.layersCount) : 'Mapped') : 'Not mapped') : 'Not supported'}</span>
                        {learnParamId === 'layersCount' && midiSupported && <span style={{ color: '#4fc3f7' }}>Listening…</span>}
                        <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); beginLearn && beginLearn('layersCount'); }} disabled={!midiSupported}>Learn</button>
                        <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); clearMapping && clearMapping('layersCount'); }} disabled={!midiSupported || !midiMappings?.layersCount}>Clear</button>
                      </div>
                    )}
                  </div>

                  <div className="compact-field">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span className="compact-label">Layer Variation: {Number(layers?.[0]?.variation ?? DEFAULT_LAYER.variation).toFixed(2)}</span>
                      <label className="compact-label" title="Include Layer Variation in Randomize All">
                        <input type="checkbox" checked={getIsRnd('variation')} onChange={(e) => setIsRnd('variation', e.target.checked)} />
                        Include
                      </label>
                    </div>
                    <input
                      className="compact-range"
                      type="range"
                      min={0}
                      max={3}
                      step={0.01}
                      value={Number(layers?.[0]?.variation ?? DEFAULT_LAYER.variation)}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setLayers(prev => prev.map((l, i) => (i === 0 ? { ...l, variation: v } : l)));
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
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
              setIsNodeEditMode={setIsNodeEditMode}
              classicMode={classicMode}
              setClassicMode={setClassicMode}
              randomizePalette={randomizePalette}
              setRandomizePalette={setRandomizePalette}
              randomizeNumColors={randomizeNumColors}
              setRandomizeNumColors={setRandomizeNumColors}
              layerNames={(layers || []).map((l, i) => l?.name || `Layer ${i + 1}`)}
              selectedLayerIndex={clampedSelectedIndex}
              onSelectLayer={selectLayer}
              onAddLayer={addNewLayer}
              onDeleteLayer={deleteLayer}
            />
            {/* Layer list removed; use header controls in <Controls /> */}
          </div>
        </aside>

        {/* Draggable divider between sidebar and canvas */}
        {(!isFullscreen && isOverlayVisible) && (
          <div
            className="sidebar-resizer"
            onMouseDown={startResize}
            title="Drag to resize controls"
            aria-label="Resize sidebar"
          />
        )}
        
        {/* Main Canvas Area */}
        <div 
          className="canvas-container" 
          ref={containerRef}
        >
          <Canvas
            ref={canvasRef}
            layers={layers}
            isFrozen={isFrozen}
            backgroundColor={backgroundColor}
            globalSeed={globalSeed}
            globalBlendMode={globalBlendMode}
            isNodeEditMode={isNodeEditMode}
            selectedLayerIndex={selectedLayerIndex}
            setLayers={setLayers}
            classicMode={classicMode}
          />
          
          {/* Floating Action Buttons */}
          <div className="floating-actions" style={{ pointerEvents: 'auto' }}>
            <button onClick={downloadImage} className="fab" title="Download PNG">
              ⬇
            </button>
            <button onClick={randomizeScene} className="fab" title="Randomize Scene">
              🎲
            </button>
            <button onClick={toggleFullscreen} className="fab" title={isFullscreen ? 'Exit Fullscreen' : 'Go Fullscreen'}>
              {isFullscreen ? '⤓' : '⤢'}
            </button>
          </div>
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