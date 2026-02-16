import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
// NOTE: useAppState removed to prevent context subscription causing re-renders on every frame
// Morph-related values are now passed as props from BottomPanel
import { useParameters } from '../../context/ParameterContext.jsx';
import { useMidi } from '../../context/MidiContext.jsx';
import { useAudioReactive } from '../../context/AudioContext.jsx';
import { useBPM } from '../../context/BPMContext.jsx';
import { hexToRgb, rgbToHex } from '../../utils/colorUtils.js';
import BackgroundColorPicker from '../BackgroundColorPicker.jsx';
import PresetControls from './PresetControls.jsx';
import BufferedNumberInput from '../common/BufferedNumberInput.jsx';
import AutosaveRecovery from './AutosaveRecovery.jsx';
// Legacy (unused after Phase 4 extraction):
// import BPMEnvelopeEditor, { DEFAULT_ENVELOPE } from '../common/BPMEnvelopeEditor.jsx';
import { isSettingsDebugEnabled, throttledSettingsDebugLog } from '../../utils/settingsDebug.js';
import { getCanvasFps, setCanvasFps, subscribeCanvasFps } from '../../utils/canvasFps.js';
import { getOperationalMaxHint } from '../../utils/parameterOperationalHints.js';
import RangeSlider from '../common/RangeSlider.jsx';
import AudioModulationPresetsSection from './sections/AudioModulationPresetsSection.jsx';

const GLOBAL_SEED_MIN = 1;
const GLOBAL_SEED_MAX = 2147483646;

// Fixed slider bounds (wider than default randomisation ranges)
const SPEED_SLIDER_MIN = 0;
const SPEED_SLIDER_MAX = 10;
const OPACITY_SLIDER_MIN = 0;
const OPACITY_SLIDER_MAX = 1;
const LAYERS_SLIDER_MIN = 1;
const LAYERS_SLIDER_MAX = 400;
const VARIATION_SLIDER_MIN = 0;
const VARIATION_SLIDER_MAX = 5;
const VARIATION_SCALE_SLIDER_MIN = -5;
const VARIATION_SCALE_SLIDER_MAX = 5;
const AUTOSAVE_META_KEY = 'artapp-autosave-meta';
const AUTOSAVE_SLOT_PREFIX = 'artapp-autosave-';
const AUTOSAVE_SLOT_COUNT = 3;

import { AudioReactiveSection, AudioDemoPresetsSection, AudioSpawnSection, BPMSection, AudioControlRow, BPMControlRow } from './sections/GlobalAutomationSections.jsx';
// Legacy (unused directly here; retained in module export for reference):
// import { RangeMappingEditor } from './sections/GlobalAutomationSections.jsx';

// A full-featured Global Controls panel, mirroring the original inline UI
const GlobalControls = ({
  // Tab visibility for gating animations
  isActiveTab = true,
  timelineMode = false,
  // State and actions
  backgroundColor,
  setBackgroundColor,
  backgroundImage,
  setBackgroundImage,
  isFrozen,
  setIsFrozen,
  enableBreathing: _enableBreathing,
  setEnableBreathing: _setEnableBreathing,
  energyInfluence,
  setEnergyInfluence,
  audioSpawnEnabled,
  setAudioSpawnEnabled,
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
  zIgnore,
  setZIgnore,
  classicMode,
  setClassicMode,
  globalSeed,
  setGlobalSeed,
  globalSpeedMultiplier,
  setGlobalSpeedMultiplier,
  getIsRnd,
  setIsRnd,
  restoreIncludeRnd,
  // Fade while frozen
  colorFadeWhileFrozen,
  setColorFadeWhileFrozen,
  syncLayerColorsToFirst,
  setSyncLayerColorsToFirst,
  // MIDI
  midiSupported,
  beginLearn,
  clearMapping,
  midiMappings,
  mappingLabel,
  learnParamId,
  // Palettes/Blend
  palettes,
  globalPaletteIndex = 'custom',
  globalPaletteRef = null,
  setGlobalPaletteIndex = null,
  setGlobalPaletteRef = null,
  customPalettes = [],
  onSaveCustomPalette,
  blendModes,
  globalBlendMode,
  setGlobalBlendMode,
  parameterTargetMode: _parameterTargetMode,
  setParameterTargetMode: _setParameterTargetMode,
  // MIDI input
  midiInputs,
  midiInputId,
  setMidiInputId,
  // Layers + helpers
  layers,
  sampleColorsEven,
  assignOneColorPerLayer,
  setLayers,
  DEFAULT_LAYER,
  buildVariedLayerFrom,
  // Actions
  handleRandomizeAll,
  // UI options
  hidePresets = false,
  autosaveToggleToken = 0,
  // Morph props (passed from BottomPanel to avoid useAppState subscription)
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
  // Randomize colors per layer setting
  randomizeColorsPerLayer,
  setRandomizeColorsPerLayer,
  uniformColorCount,
  setUniformColorCount,
  hideAudioSections = false,
}) => {
  const layerSeedNonceRef = useRef(0);
  const generateLayerSeed = useCallback(() => {
    const MOD = 2147483646;
    let randomValue = 0;
    try {
      if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
        const arr = new Uint32Array(1);
        window.crypto.getRandomValues(arr);
        randomValue = arr[0] % MOD;
      }
    } catch {
      // noop — fallback to Math.random below
    }
    if (!randomValue) {
      randomValue = Math.floor(Math.random() * MOD);
    }
    if (randomValue === 0) randomValue = 1;
    layerSeedNonceRef.current = (layerSeedNonceRef.current + 1013904223) % MOD;
    let seed = (randomValue + layerSeedNonceRef.current) % MOD;
    if (seed <= 0) seed += MOD - 1;
    return seed;
  }, []);

  // Keep Canvas background image renderer in sync
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const enabled = !!(backgroundImage && backgroundImage.enabled);
        const src = backgroundImage?.src || null;
        const opacity = Math.max(0, Math.min(1, Number(backgroundImage?.opacity ?? 1)));
        const fit = backgroundImage?.fit || 'cover';
        window.__artapp_bgimg = { enabled, src, opacity, fit };
      }
    } catch { /* noop */ }
  }, [backgroundImage]);
  // Presets: these values are now passed as props to avoid useAppState() subscription
  // which causes re-renders on every animation frame
  const { loadFullConfiguration, applyParametersSnapshot, parameters, updateParameter } = useParameters() || {};
  const { registerParamHandler } = useMidi() || {};
  const audioContext = useAudioReactive();
  const applyAudioSnapshot = audioContext?.applyAudioSnapshot;
  const bpmContext = useBPM();
  const applyBPMSnapshot = bpmContext?.applyBPMSnapshot;

  const [canvasFps, setCanvasFpsState] = useState(() => getCanvasFps());
  useEffect(() => subscribeCanvasFps(setCanvasFpsState), []);

  const renderAutomationBadge = useCallback((paramId) => {
    const bpmEnabled = !!bpmContext?.mappings?.[paramId]?.enabled;
    const audioMapping = audioContext?.mappings?.[paramId];
    const audioEnabled = !!(audioMapping && audioMapping.band && audioMapping.band !== 'none');
    if (!bpmEnabled && !audioEnabled) return null;
    const bpmPlaying = !!bpmContext?.isPlaying;
    const audioActive = !!audioContext?.settings?.enabled;
    return (
      <span
        title={
          audioEnabled
            ? (audioActive ? 'Audio automation mapped' : 'Audio automation mapped (disabled)')
            : (bpmPlaying ? 'BPM automation mapped' : 'BPM automation mapped (paused)')
        }
        aria-label={audioEnabled ? 'Audio automation mapped' : 'BPM automation mapped'}
        style={{
          fontSize: '0.85rem',
          color: audioEnabled
            ? (audioActive ? '#4ade80' : 'rgba(74,222,128,0.6)')
            : (bpmPlaying ? '#4fc3f7' : 'rgba(79,195,247,0.6)'),
          lineHeight: 1,
          marginLeft: 6,
        }}
      >
        ♪
      </span>
    );
  }, [bpmContext, audioContext]);

  // Autosave recovery state
  const [showAutosaveRecovery, setShowAutosaveRecovery] = useState(false);
  const [autosaveSlots, setAutosaveSlots] = useState([]);
  const [autosaveMessage, setAutosaveMessage] = useState('');
  const [autosaveError, setAutosaveError] = useState('');

  const refreshAutosaveSlots = useCallback(() => {
    if (typeof window === 'undefined' || !window.localStorage) {
      setAutosaveSlots([]);
      setAutosaveError('Autosave storage is unavailable in this environment.');
      return;
    }
    try {
      const metaRaw = window.localStorage.getItem(AUTOSAVE_META_KEY);
      const meta = metaRaw ? JSON.parse(metaRaw) : {};
      const slotsMeta = Array.isArray(meta?.slots) ? meta.slots : [];
      const map = new Map();

      const ensureSlotEntry = (key, timestamp) => {
        if (!key) return;
        if (!map.has(key)) {
          map.set(key, { key, timestamp: timestamp || null, hasData: false });
        } else if (timestamp && !map.get(key).timestamp) {
          map.set(key, { ...map.get(key), timestamp });
        }
      };

      slotsMeta.forEach((slot, idx) => {
        const key = slot?.key || `${AUTOSAVE_SLOT_PREFIX}${idx}`;
        ensureSlotEntry(key, slot?.timestamp || null);
      });

      for (let i = 0; i < AUTOSAVE_SLOT_COUNT; i += 1) {
        const key = `${AUTOSAVE_SLOT_PREFIX}${i}`;
        ensureSlotEntry(key, null);
      }

      const entries = Array.from(map.values()).map((entry) => {
        let timestamp = entry.timestamp;
        let hasData = false;
        try {
          const raw = window.localStorage.getItem(entry.key);
          if (raw) {
            hasData = true;
            if (!timestamp) {
              const payload = JSON.parse(raw);
              if (payload?.savedAt) {
                timestamp = payload.savedAt;
              }
            }
          }
        } catch (error) {
          console.warn('[Autosave] Failed to inspect slot', entry.key, error);
        }
        return { key: entry.key, timestamp, hasData };
      }).filter((entry) => entry.hasData);

      entries.sort((a, b) => {
        const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return tb - ta;
      });

      setAutosaveSlots(entries);
      if (!entries.length) {
        setAutosaveMessage('');
      }
      setAutosaveError('');
    } catch (error) {
      console.warn('[Autosave] Failed to load autosave metadata', error);
      setAutosaveSlots([]);
      setAutosaveError('Failed to read autosave metadata.');
    }
  }, []);

  const handleRestoreAutosave = useCallback((slotKey) => {
    if (!slotKey) return;
    if (typeof window === 'undefined' || !window.localStorage) {
      setAutosaveError('Autosave storage is unavailable.');
      return;
    }
    try {
      const raw = window.localStorage.getItem(slotKey);
      if (!raw) {
        setAutosaveError('Selected autosave could not be found.');
        refreshAutosaveSlots();
        return;
      }
      const data = JSON.parse(raw);
      if (data?.parameters && applyParametersSnapshot) {
        applyParametersSnapshot(data.parameters);
      }
      if (data?.appState && loadAppState) {
        loadAppState(data.appState);
        // Restore randomization include checkboxes
        if (data.appState.includeRnd && typeof data.appState.includeRnd === 'object' && typeof restoreIncludeRnd === 'function') {
          restoreIncludeRnd(prev => ({ ...prev, ...data.appState.includeRnd }));
        }
      }
      // Restore audio config if present
      if (data?.audioConfig && applyAudioSnapshot) {
        applyAudioSnapshot(data.audioConfig);
      }
      // Restore BPM config if present
      if (data?.bpmConfig && applyBPMSnapshot) {
        applyBPMSnapshot(data.bpmConfig);
      }
      setAutosaveMessage('Autosave restored successfully.');
      setAutosaveError('');
    } catch (error) {
      console.warn('[Autosave] Failed to restore autosave', slotKey, error);
      setAutosaveError('Failed to restore autosave. Check console for details.');
    }
  }, [applyParametersSnapshot, loadAppState, refreshAutosaveSlots, applyAudioSnapshot, applyBPMSnapshot, restoreIncludeRnd]);

  const handleClearAutosaves = useCallback(() => {
    if (typeof window === 'undefined' || !window.localStorage) {
      setAutosaveError('Autosave storage is unavailable.');
      return;
    }
    if (!window.confirm('Clear all autosave snapshots? This cannot be undone.')) {
      return;
    }
    try {
      for (let i = 0; i < AUTOSAVE_SLOT_COUNT; i += 1) {
        window.localStorage.removeItem(`${AUTOSAVE_SLOT_PREFIX}${i}`);
      }
      window.localStorage.removeItem(AUTOSAVE_META_KEY);
      setAutosaveSlots([]);
      setAutosaveMessage('Autosaves cleared.');
      setAutosaveError('');
    } catch (error) {
      console.warn('[Autosave] Failed to clear autosaves', error);
      setAutosaveError('Failed to clear autosaves.');
    }
  }, []);

  const handleRefreshAutosaves = useCallback(() => {
    setAutosaveMessage('');
    refreshAutosaveSlots();
  }, [refreshAutosaveSlots]);

  const handleToggleAutosaveRecovery = useCallback(() => {
    setAutosaveMessage('');
    setAutosaveError('');
    setShowAutosaveRecovery((prev) => {
      const next = !prev;
      if (!prev && !next) {
        return next;
      }
      if (!prev && next) {
        refreshAutosaveSlots();
      }
      return next;
    });
  }, [refreshAutosaveSlots]);

  const handleCloseAutosaveRecovery = useCallback(() => {
    setShowAutosaveRecovery(false);
    setAutosaveMessage('');
    setAutosaveError('');
  }, []);

  useEffect(() => {
    if (showAutosaveRecovery) {
      refreshAutosaveSlots();
    }
  }, [showAutosaveRecovery, refreshAutosaveSlots]);

  const autosaveSignalRef = useRef(autosaveToggleToken);
  useEffect(() => {
    if (autosaveToggleToken !== autosaveSignalRef.current) {
      autosaveSignalRef.current = autosaveToggleToken;
      handleToggleAutosaveRecovery();
    }
  }, [autosaveToggleToken, handleToggleAutosaveRecovery]);

  const getExportMeta = useCallback(() => {
    if (typeof window === 'undefined') {
      return {
        version: '2.0',
        canvasWidth: 0,
        canvasHeight: 0,
        exportedAt: new Date().toISOString(),
      };
    }
    const meta = window.__artapp_canvasMeta || {};
    const width = Math.round(Number(meta.width ?? window.innerWidth ?? 0));
    const height = Math.round(Number(meta.height ?? window.innerHeight ?? 0));
    return {
      version: '2.0',
      canvasWidth: width,
      canvasHeight: height,
      exportedAt: new Date().toISOString(),
    };
  }, []);

  const paletteOptions = useMemo(() => {
    const list = Array.isArray(palettes) ? palettes : [];
    const builtins = [];
    const customs = [];
    list.forEach((p, idx) => {
      const source = p?.__source === 'custom' ? 'custom' : 'builtin';
      const colors = Array.isArray(p) ? p : p?.colors;
      if (!Array.isArray(colors) || !colors.length) return;
      if (source === 'custom' && p?.id) {
        customs.push({
          value: `custom:${p.id}`,
          label: p?.name || 'Custom Palette',
        });
      } else {
        const builtinIndex = Number.isFinite(p?.__index) ? p.__index : idx;
        builtins.push({
          value: `builtin:${builtinIndex}`,
          label: p?.name || `Palette ${builtinIndex + 1}`,
        });
      }
    });
    return { builtins, customs };
  }, [palettes]);

  const paletteValueMap = useMemo(() => {
    const list = Array.isArray(palettes) ? palettes : [];
    const map = new Map();
    list.forEach((p, idx) => {
      const source = p?.__source === 'custom' ? 'custom' : 'builtin';
      const colors = Array.isArray(p) ? p : p?.colors;
      if (!Array.isArray(colors) || !colors.length) return;
      if (source === 'custom' && p?.id) {
        map.set(`custom:${p.id}`, colors);
      } else {
        const builtinIndex = Number.isFinite(p?.__index) ? p.__index : idx;
        map.set(`builtin:${builtinIndex}`, colors);
      }
    });
    return map;
  }, [palettes]);

  const hasCustomPaletteRef = useMemo(() => (
    typeof globalPaletteRef === 'string'
      && (Array.isArray(customPalettes) ? customPalettes : []).some(p => p?.id === globalPaletteRef)
  ), [globalPaletteRef, customPalettes]);

  const paletteValue = useMemo(() => {
    try {
      const colorsNow = (layers || []).map(l => (Array.isArray(l?.colors) && l.colors[0]) ? l.colors[0].toLowerCase() : '#000000');
      const list = Array.isArray(palettes) ? palettes : [];
      for (let idx = 0; idx < list.length; idx += 1) {
        const p = list[idx];
        const source = p?.__source === 'custom' ? 'custom' : 'builtin';
        const src = Array.isArray(p) ? p : (p?.colors || []);
        const sampled = sampleColorsEven(src, Math.max(1, layers.length));
        const matches = sampled.length === colorsNow.length && sampled.every((c, i) => (c || '').toLowerCase() === (colorsNow[i] || ''));
        if (!matches) continue;
        if (source === 'custom' && p?.id) return `custom:${p.id}`;
        const builtinIndex = Number.isFinite(p?.__index) ? p.__index : idx;
        return `builtin:${builtinIndex}`;
      }
      return 'custom';
    } catch {
      return 'custom';
    }
  }, [palettes, layers, sampleColorsEven]);

  const selectedPaletteValue = useMemo(() => {
    if (hasCustomPaletteRef) {
      return `custom:${globalPaletteRef}`;
    }
    if (globalPaletteIndex !== 'custom') {
      return `builtin:${globalPaletteIndex}`;
    }
    return paletteValue;
  }, [globalPaletteIndex, globalPaletteRef, hasCustomPaletteRef, paletteValue]);

  // Back-compat: older scenes inferred the "selected palette" by matching current layer colors.
  // If the user hasn't explicitly chosen a palette yet, initialize it from the inferred paletteValue.
  useEffect(() => {
    if (globalPaletteRef && hasCustomPaletteRef) return;
    if (globalPaletteIndex !== 'custom') return;
    if (paletteValue === 'custom') return;
    if (paletteValue.startsWith('custom:')) {
      const id = paletteValue.slice('custom:'.length);
      if (id) setGlobalPaletteRef?.(id);
      return;
    }
    if (paletteValue.startsWith('builtin:')) {
      const idx = parseInt(paletteValue.slice('builtin:'.length), 10);
      if (!Number.isFinite(idx)) return;
      setGlobalPaletteIndex?.(idx);
    }
  }, [globalPaletteIndex, globalPaletteRef, hasCustomPaletteRef, paletteValue, setGlobalPaletteIndex, setGlobalPaletteRef]);

  const generationPaletteColors = useMemo(() => {
    try {
      if (globalPaletteIndex === 'custom' && typeof globalPaletteRef === 'string') {
        const pick = (Array.isArray(customPalettes) ? customPalettes : []).find(p => p?.id === globalPaletteRef);
        if (pick && Array.isArray(pick.colors) && pick.colors.length) {
          return pick.colors.filter(c => typeof c === 'string' && c.length > 0);
        }
      }

      const idx = (globalPaletteIndex === 'custom') ? null : Number(globalPaletteIndex);
      if (Number.isFinite(idx) && idx != null && palettes?.[idx]) {
        const pick = palettes[idx];
        const src = Array.isArray(pick) ? pick : (pick?.colors || []);
        return (Array.isArray(src) ? src : []).filter(c => typeof c === 'string' && c.length > 0);
      }

      const out = [];
      const seen = new Set();
      (Array.isArray(layers) ? layers : []).forEach(l => {
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
  }, [globalPaletteIndex, globalPaletteRef, customPalettes, palettes, layers]);

  const paletteColorsForVariation = useMemo(() => {
    if (!audioSpawnUseGlobalPalette) return generationPaletteColors;
    const direct = paletteValueMap.get(selectedPaletteValue);
    if (Array.isArray(direct) && direct.length > 0) return direct;
    if (Array.isArray(generationPaletteColors) && generationPaletteColors.length > 0) {
      return generationPaletteColors;
    }
    const inferred = paletteValueMap.get(paletteValue);
    return Array.isArray(inferred) ? inferred : [];
  }, [audioSpawnUseGlobalPalette, generationPaletteColors, paletteValueMap, paletteValue, selectedPaletteValue]);

  useEffect(() => {
    if (!audioSpawnUseGlobalPalette) return;
    if (Array.isArray(paletteColorsForVariation) && paletteColorsForVariation.length > 0) return;
    try {
      console.warn('[Palette Variation] Empty palette pool', {
        selectedPaletteValue,
        globalPaletteIndex,
        globalPaletteRef,
        paletteValue,
        generationPaletteColorsCount: Array.isArray(generationPaletteColors) ? generationPaletteColors.length : 0,
        paletteMapHasSelected: paletteValueMap.has(selectedPaletteValue),
      });
    } catch { /* noop */ }
  }, [
    audioSpawnUseGlobalPalette,
    paletteColorsForVariation,
    selectedPaletteValue,
    globalPaletteIndex,
    globalPaletteRef,
    paletteValue,
    generationPaletteColors,
    paletteValueMap,
  ]);


  const hasSelectedMidiDevice = !!(midiSupported && midiInputId);

  // Settings panel visibility toggles
  const [showSpeedSettings, setShowSpeedSettings] = useState(false);
  const [showPaletteSettings, setShowPaletteSettings] = useState(false);
  const [showBlendModeSettings, setShowBlendModeSettings] = useState(false);
  const [showOpacitySettings, setShowOpacitySettings] = useState(false);
  const [showLayersSettings, setShowLayersSettings] = useState(false);
  const [showFpsSettings, setShowFpsSettings] = useState(false);
  const [showVariationPositionSettings, setShowVariationPositionSettings] = useState(false);
  const [showVariationShapeSettings, setShowVariationShapeSettings] = useState(false);
  const [showVariationAnimSettings, setShowVariationAnimSettings] = useState(false);
  const [showVariationColorSettings, setShowVariationColorSettings] = useState(false);
  const [showVariationScaleSettings, setShowVariationScaleSettings] = useState(false);

  const numericSeed = Number(globalSeed);
  const seedValue = Number.isFinite(numericSeed)
    ? Math.max(GLOBAL_SEED_MIN, Math.min(GLOBAL_SEED_MAX, Math.floor(numericSeed)))
    : GLOBAL_SEED_MIN;

  const updateSeed = useCallback((value) => {
    if (!Number.isFinite(value)) return;
    const clamped = Math.max(GLOBAL_SEED_MIN, Math.min(GLOBAL_SEED_MAX, Math.floor(value)));
    if (clamped === seedValue) return;
    setGlobalSeed(clamped);
  }, [seedValue, setGlobalSeed]);

  const handleSeedSliderChange = useCallback((e) => {
    updateSeed(Number(e.target.value));
  }, [updateSeed]);

  // Numeric bounds (min/max/step) for sliders - initialized from parameter context with fallbacks
  const getParamRange = useCallback((paramId, fallbackMin, fallbackMax, fallbackStep) => {
    const param = parameters?.find(p => p.id === paramId);
    return {
      min: Number.isFinite(param?.randomMin) ? param.randomMin : fallbackMin,
      max: Number.isFinite(param?.randomMax) ? param.randomMax : fallbackMax,
      step: Number.isFinite(param?.step) ? param.step : fallbackStep,
    };
  }, [parameters]);

  // Sync range changes to parameter context for persistence
  const syncRangeToParam = useCallback((paramId, field, value) => {
    if (updateParameter) {
      updateParameter(paramId, field, value);
    }
  }, [updateParameter]);

  // Initialize from parameter context
  const speedRange = getParamRange('globalSpeedMultiplier', 0, 5, 0.01);
  const [speedMin, setSpeedMinState] = useState(speedRange.min);
  const [speedMax, setSpeedMaxState] = useState(speedRange.max);
  const [speedStep, setSpeedStep] = useState(speedRange.step);

  const opacityRange = getParamRange('globalOpacity', 0, 1, 0.01);
  const [opacityMin, setOpacityMinState] = useState(opacityRange.min);
  const [opacityMax, setOpacityMaxState] = useState(opacityRange.max);
  const [opacityStep, setOpacityStep] = useState(opacityRange.step);

  const layersRange = getParamRange('layersCount', 1, 1000, 1);
  const [layersMin, setLayersMinState] = useState(layersRange.min);
  const [layersMax, setLayersMaxState] = useState(layersRange.max);
  const [layersStep, setLayersStep] = useState(layersRange.step);
  const [layerCountDraft, setLayerCountDraft] = useState(() => layers.length);
  const layerCountDraggingRef = useRef(false);

  // Variation ranges
  const varPosRange = getParamRange('variationPosition', 0, 3, 0.01);
  const [variationPositionMin, setVariationPositionMinState] = useState(varPosRange.min);
  const [variationPositionMax, setVariationPositionMaxState] = useState(varPosRange.max);
  const [variationPositionStep, setVariationPositionStep] = useState(varPosRange.step);

  const varShapeRange = getParamRange('variationShape', 0, 3, 0.01);
  const [variationShapeMin, setVariationShapeMinState] = useState(varShapeRange.min);
  const [variationShapeMax, setVariationShapeMaxState] = useState(varShapeRange.max);
  const [variationShapeStep, setVariationShapeStep] = useState(varShapeRange.step);

  const varAnimRange = getParamRange('variationAnim', 0, 3, 0.01);
  const [variationAnimMin, setVariationAnimMinState] = useState(varAnimRange.min);
  const [variationAnimMax, setVariationAnimMaxState] = useState(varAnimRange.max);
  const [variationAnimStep, setVariationAnimStep] = useState(varAnimRange.step);

  const varColorRange = getParamRange('variationColor', 0, 3, 0.01);
  const [variationColorMin, setVariationColorMinState] = useState(varColorRange.min);
  const [variationColorMax, setVariationColorMaxState] = useState(varColorRange.max);
  const [variationColorStep, setVariationColorStep] = useState(varColorRange.step);

  const varScaleRange = getParamRange('variationScale', -3, 3, 0.01);
  const [variationScaleMin, setVariationScaleMinState] = useState(varScaleRange.min);
  const [variationScaleMax, setVariationScaleMaxState] = useState(varScaleRange.max);
  const [variationScaleStep, setVariationScaleStep] = useState(varScaleRange.step);

  // Wrapper functions that update both local state and parameter context
  const syncAudioMappingRangeToParam = useCallback((paramId, outputMin, outputMax) => {
    const setAudioMapping = audioContext?.setMapping;
    const mapping = audioContext?.mappings?.[paramId];
    if (typeof setAudioMapping !== 'function') return;
    if (!mapping || mapping.band === 'none') return;
    const nextMin = Number(outputMin);
    const nextMax = Number(outputMax);
    if (!Number.isFinite(nextMin) || !Number.isFinite(nextMax)) return;
    const curMin = Number(mapping?.range?.outputMin);
    const curMax = Number(mapping?.range?.outputMax);
    if (Number.isFinite(curMin) && Number.isFinite(curMax) && curMin === nextMin && curMax === nextMax) {
      return;
    }
    setAudioMapping(paramId, {
      band: mapping.band,
      range: { outputMin: nextMin, outputMax: nextMax },
      ...(Number.isFinite(Number(mapping?.gain)) ? { gain: Number(mapping.gain) } : {}),
      ...(mapping?.mode ? { mode: mapping.mode } : {}),
      ...(mapping?.modeSettings ? { modeSettings: mapping.modeSettings } : {}),
      ...(mapping?.trigger ? { trigger: mapping.trigger } : {}),
    });
  }, [audioContext]);

  const setSpeedMin = useCallback((v) => { setSpeedMinState(v); syncRangeToParam('globalSpeedMultiplier', 'randomMin', v); }, [syncRangeToParam]);
  const setSpeedMax = useCallback((v) => { setSpeedMaxState(v); syncRangeToParam('globalSpeedMultiplier', 'randomMax', v); }, [syncRangeToParam]);

  const setOpacityMin = useCallback((v) => { setOpacityMinState(v); syncRangeToParam('globalOpacity', 'randomMin', v); }, [syncRangeToParam]);
  const setOpacityMax = useCallback((v) => { setOpacityMaxState(v); syncRangeToParam('globalOpacity', 'randomMax', v); }, [syncRangeToParam]);

  const setLayersMin = useCallback((v) => {
    const next = Math.max(1, Math.round(Number(v) || 1));
    const pairedMax = Math.max(next, Math.round(Number(layersMax) || next));
    setLayersMinState(next);
    syncRangeToParam('layersCount', 'randomMin', next);
    syncAudioMappingRangeToParam('layersCount', next, pairedMax);
  }, [layersMax, syncAudioMappingRangeToParam, syncRangeToParam]);
  const setLayersMax = useCallback((v) => {
    const next = Math.max(1, Math.round(Number(v) || 1));
    const pairedMin = Math.min(next, Math.round(Number(layersMin) || next));
    setLayersMaxState(next);
    syncRangeToParam('layersCount', 'randomMax', next);
    syncAudioMappingRangeToParam('layersCount', pairedMin, next);
  }, [layersMin, syncAudioMappingRangeToParam, syncRangeToParam]);

  const setVariationPositionMin = useCallback((v) => { setVariationPositionMinState(v); syncRangeToParam('variationPosition', 'randomMin', v); }, [syncRangeToParam]);
  const setVariationPositionMax = useCallback((v) => { setVariationPositionMaxState(v); syncRangeToParam('variationPosition', 'randomMax', v); }, [syncRangeToParam]);

  const setVariationShapeMin = useCallback((v) => { setVariationShapeMinState(v); syncRangeToParam('variationShape', 'randomMin', v); }, [syncRangeToParam]);
  const setVariationShapeMax = useCallback((v) => { setVariationShapeMaxState(v); syncRangeToParam('variationShape', 'randomMax', v); }, [syncRangeToParam]);

  const setVariationAnimMin = useCallback((v) => { setVariationAnimMinState(v); syncRangeToParam('variationAnim', 'randomMin', v); }, [syncRangeToParam]);
  const setVariationAnimMax = useCallback((v) => { setVariationAnimMaxState(v); syncRangeToParam('variationAnim', 'randomMax', v); }, [syncRangeToParam]);

  const setVariationColorMin = useCallback((v) => { setVariationColorMinState(v); syncRangeToParam('variationColor', 'randomMin', v); }, [syncRangeToParam]);
  const setVariationColorMax = useCallback((v) => { setVariationColorMaxState(v); syncRangeToParam('variationColor', 'randomMax', v); }, [syncRangeToParam]);

  const setVariationScaleMin = useCallback((v) => { setVariationScaleMinState(v); syncRangeToParam('variationScale', 'randomMin', v); }, [syncRangeToParam]);
  const setVariationScaleMax = useCallback((v) => { setVariationScaleMaxState(v); syncRangeToParam('variationScale', 'randomMax', v); }, [syncRangeToParam]);

  useEffect(() => {
    if (layerCountDraggingRef.current) return;
    setLayerCountDraft(layers.length);
  }, [layers.length]);

  // Helper to set layer count uniformly from slider or number box
  const setLayerCount = useCallback((targetRaw) => {
    let target = Number(targetRaw);
    if (!Number.isFinite(target)) return;
    target = Math.round(target);
    target = Math.max(LAYERS_SLIDER_MIN, Math.min(LAYERS_SLIDER_MAX, target));
    setLayers(prev => {
      let next = prev;
      if (target > prev.length) {
        const addCount = target - prev.length;
        const baseVar = {
          shape: (typeof prev?.[0]?.variationShape === 'number') ? prev[0].variationShape : (typeof prev?.[0]?.variation === 'number' ? prev[0].variation : DEFAULT_LAYER.variationShape),
          anim: (typeof prev?.[0]?.variationAnim === 'number') ? prev[0].variationAnim : (typeof prev?.[0]?.variation === 'number' ? prev[0].variation : DEFAULT_LAYER.variationAnim),
          color: (typeof prev?.[0]?.variationColor === 'number') ? prev[0].variationColor : (typeof prev?.[0]?.variation === 'number' ? prev[0].variation : DEFAULT_LAYER.variationColor),
          position: (typeof prev?.[0]?.variationPosition === 'number') ? prev[0].variationPosition : (typeof prev?.[0]?.variation === 'number' ? prev[0].variation : DEFAULT_LAYER.variationPosition),
        };
        const additions = [];
        let prevLayerRef = prev[prev.length - 1] || DEFAULT_LAYER;
        for (let i = 0; i < addCount; i += 1) {
          const randomSeed = generateLayerSeed();
          const nameIndex = prev.length + additions.length + 1;
          const layer = buildVariedLayerFrom(prevLayerRef, nameIndex, baseVar, {
            randomSeed,
            constrainColorsToPalette: !!audioSpawnUseGlobalPalette,
            paletteColors: paletteColorsForVariation,
          });
          additions.push(layer);
          prevLayerRef = layer;
        }
        next = [...prev, ...additions];
      } else if (target < prev.length) {
        next = prev.slice(0, target).map((l, i) => ({ ...l, name: `Layer ${i + 1}` }));
        if (target === 1) {
          const [first] = next;
          const reseeded = {
            ...first,
            seed: generateLayerSeed(),
            noiseSeed: generateLayerSeed(),
          };
          next[0] = reseeded;
        }
      }
      return next;
    });
  }, [
    DEFAULT_LAYER,
    audioSpawnUseGlobalPalette,
    buildVariedLayerFrom,
    generateLayerSeed,
    paletteColorsForVariation,
    setLayers,
  ]);

  const commitLayerCountDraft = useCallback((nextValue) => {
    setLayerCount(nextValue);
    setLayerCountDraft(nextValue);
  }, [setLayerCount]);

  const applyVariationValue = useCallback((prop, rawValue) => {
    setLayers(prev => {
      if (!Array.isArray(prev) || !prev.length) return prev;

      let anyChange = false;
      const updated = prev.map((layer, idx) => {
        const shouldApply = applyVariationInstantly || idx === 0;
        const nextValue = shouldApply ? rawValue : layer?.[prop];
        if (layer?.[prop] === nextValue) return layer;
        anyChange = true;
        return { ...layer, [prop]: nextValue };
      });

      if (!anyChange) return prev;
      if (!applyVariationInstantly || updated.length <= 1) {
        return updated;
      }

      const firstLayer = updated[0];
      const baseVar = {
        shape: Number(firstLayer?.variationShape ?? DEFAULT_LAYER.variationShape),
        anim: Number(firstLayer?.variationAnim ?? DEFAULT_LAYER.variationAnim),
        color: Number(firstLayer?.variationColor ?? DEFAULT_LAYER.variationColor),
        position: Number(firstLayer?.variationPosition ?? DEFAULT_LAYER.variationPosition),
        scale: Number(firstLayer?.variationScale ?? DEFAULT_LAYER.variationScale ?? 0),
      };

      const rebuilt = [firstLayer];
      let prevLayer = firstLayer;
      const categoryMap = {
        variationPosition: ['position'],
        variationShape: ['shape'],
        variationAnim: ['anim'],
        variationColor: ['color'],
        variationScale: ['scale'],
      };
      const affectCategories = categoryMap[prop] || null;
      for (let i = 1; i < updated.length; i += 1) {
        const original = updated[i];
        const varied = buildVariedLayerFrom(prevLayer, i + 1, baseVar, {
          affectCategories,
          preserveSeeds: true,
          constrainColorsToPalette: !!audioSpawnUseGlobalPalette,
          paletteColors: paletteColorsForVariation,
        }) || original;
        const merged = {
          ...original,
          ...varied,
          id: original.id ?? varied.id,
          name: original.name || varied.name,
        };
        const categorySet = affectCategories ? new Set(affectCategories) : null;
        if (categorySet) {
          if (!categorySet.has('color')) {
            if (Array.isArray(original.colors)) {
              merged.colors = [...original.colors];
            } else {
              merged.colors = original.colors;
            }
            if (typeof original.numColors !== 'undefined') {
              merged.numColors = original.numColors;
            }
          }
          if (!categorySet.has('position') && !categorySet.has('scale')) {
            if (typeof original.xOffset !== 'undefined') merged.xOffset = original.xOffset;
            if (typeof original.yOffset !== 'undefined') merged.yOffset = original.yOffset;
            if (original.position && typeof original.position === 'object') {
              merged.position = { ...original.position };
            }
          }
          if (!categorySet.has('shape')) {
            const shapeFields = [
              'numSides',
              'curviness',
              'wobble',
              'noiseAmount',
              'width',
              'height',
              'radiusFactor',
              'radiusFactorX',
              'radiusFactorY',
              'nodes',
              'syncNodesToNumSides',
              'viewBoxMapped',
            ];
            shapeFields.forEach((field) => {
              if (field in original) {
                merged[field] = Array.isArray(original[field])
                  ? [...original[field]]
                  : (original[field] && typeof original[field] === 'object'
                    ? { ...original[field] }
                    : original[field]);
              }
            });
          }
          if (!categorySet.has('anim')) {
            const animFields = [
              'movementStyle',
              'movementSpeed',
              'movementAngle',
              'scaleSpeed',
              'scaleMin',
              'scaleMax',
              'imageBlur',
              'imageBrightness',
              'imageContrast',
              'imageHue',
              'imageSaturation',
              'imageDistortion',
              'vx',
              'vy',
              'orbitCenterX',
              'orbitCenterY',
              'orbitAngle',
              'orbitRadiusX',
              'orbitRadiusY',
            ];
            animFields.forEach((field) => {
              if (field in original) {
                merged[field] = original[field];
              }
            });
          }
          if (!categorySet.has('scale')) {
            if (typeof original.variationScale !== 'undefined') {
              merged.variationScale = original.variationScale;
            }
            if (original.position && typeof original.position === 'object') {
              const originalScale = original.position.scale;
              const originalScaleDirection = original.position.scaleDirection;
              merged.position = {
                ...(merged.position || {}),
                ...(original.position || {}),
                scale: originalScale,
                scaleDirection: originalScaleDirection,
              };
            }
          } else {
            // When scale IS in the category set, compute scale variation relative to ORIGINAL layer's scale
            // (not prevLayer's scale, which would cause cumulative scaling)
            const rawScaleVar = Number(baseVar.scale || 0);
            const originalScale = original.position?.scale ?? 1.0;
            
            if (rawScaleVar !== 0) {
              // Use seeded random based on layer index for consistent results
              const layerSeed = (firstLayer?.seed ?? 1) + (i * 1013904223);
              const rng = () => {
                const x = Math.sin(layerSeed * 9999) * 10000;
                return x - Math.floor(x);
              };
              
              const absWeight = Math.min(Math.abs(rawScaleVar) / 3, 1);
              const minScale = 0.05;
              const maxScale = 5;
              
              let newScale;
              if (rawScaleVar < 0) {
                // Negative variation shrinks relative to original scale
                const shrinkIntensity = 0.95 * absWeight;
                const ratio = Math.max(0.05, 1 - rng() * shrinkIntensity);
                newScale = Math.max(minScale, Math.min(maxScale, originalScale * ratio));
              } else {
                // Positive variation grows relative to original scale
                const growthIntensity = 1.2 * absWeight;
                const ratio = 1 + rng() * growthIntensity;
                newScale = Math.max(minScale, Math.min(maxScale, originalScale * ratio));
              }
              
              merged.position = {
                ...(original.position || {}),
                scale: newScale,
              };
            }
          }
        }
        rebuilt.push(merged);
        prevLayer = merged;
      }

      return rebuilt;
    });
  }, [
    applyVariationInstantly,
    buildVariedLayerFrom,
    DEFAULT_LAYER.variationAnim,
    DEFAULT_LAYER.variationColor,
    DEFAULT_LAYER.variationPosition,
    DEFAULT_LAYER.variationShape,
    DEFAULT_LAYER.variationScale,
    audioSpawnUseGlobalPalette,
    paletteColorsForVariation,
    setLayers,
  ]);

  // Presets: helpers
  const TEMP_PRESET_PREFIX = 'preset-slot-';

  const recallPreset = useCallback(async (slotId) => {
    const slot = getPresetSlot ? getPresetSlot(slotId) : null;
    if (!slot) return;
    try {
      if (!slot.payload) return;
      const preservedMorph = {
        enabled: !!morphEnabled,
        route: Array.isArray(morphRoute) ? [...morphRoute] : morphRoute,
        duration: morphDurationPerLeg,
        easing: morphEasing,
        loopMode: morphLoopMode,
        mode: morphMode,
      };
      const key = `${TEMP_PRESET_PREFIX}${slotId}`;
      const exportMeta = slot.payload?.exportMeta || getExportMeta();
      const saveObj = { parameters: slot.payload.parameters || [], appState: slot.payload.appState || null, savedAt: slot.payload.savedAt || new Date().toISOString(), version: '2.0', exportMeta };
      localStorage.setItem(`artapp-config-${key}`, JSON.stringify(saveObj));
      if (typeof loadFullConfiguration === 'function') {
        const res = await loadFullConfiguration(key);
        if (res && res.appState && typeof loadAppState === 'function') {
          const {
            morphEnabled: _me,
            morphRoute: _mr,
            morphDurationPerLeg: _md,
            morphEasing: _meas,
            morphLoopMode: _ml,
            morphMode: _mm,
            ...rest
          } = res.appState || {};
          loadAppState(rest);
          if (res.exportMeta && typeof window !== 'undefined') {
            window.__artapp_lastImportMeta = res.exportMeta;
          }
          setMorphEnabled?.(preservedMorph.enabled);
          const routeToRestore = Array.isArray(preservedMorph.route)
            ? preservedMorph.route
            : (Array.isArray(morphRoute) ? morphRoute : []);
          setMorphRoute?.(routeToRestore);
          if (typeof preservedMorph.duration !== 'undefined') {
            setMorphDurationPerLeg?.(preservedMorph.duration);
          }
          if (typeof preservedMorph.easing !== 'undefined') {
            setMorphEasing?.(preservedMorph.easing);
          }
          if (typeof preservedMorph.loopMode !== 'undefined') {
            setMorphLoopMode?.(preservedMorph.loopMode);
          }
          if (typeof preservedMorph.mode !== 'undefined') {
            setMorphMode?.(preservedMorph.mode);
          }
        }
      }
    } catch (e) {
      console.warn('[Presets] Failed to recall preset', slotId, e);
    }
  }, [
    getExportMeta,
    getPresetSlot,
    loadFullConfiguration,
    loadAppState,
    morphRoute,
    morphEnabled,
    morphDurationPerLeg,
    morphEasing,
    morphLoopMode,
    morphMode,
    setMorphEnabled,
    setMorphRoute,
    setMorphDurationPerLeg,
    setMorphEasing,
    setMorphLoopMode,
    setMorphMode,
  ]);

  // MIDI: learnable preset recall (maps 0..1 to buckets 1..8)
  useEffect(() => {
    if (!registerParamHandler) return;
    const unsub = registerParamHandler('global:presetRecall', ({ value01 }) => {
      const bucket = Math.max(1, Math.min(8, Math.floor(value01 * 8) + 1));
      recallPreset(bucket);
    });
    return () => { if (typeof unsub === 'function') unsub(); };
  }, [registerParamHandler, recallPreset]);

  // Morph UI controls
  const [morphStatus, setMorphStatus] = useState(null);
  const [morphError, setMorphError] = useState('');
  const [routeDraft, setRouteDraft] = useState(Array.isArray(morphRoute) ? morphRoute.join(',') : '');
  useEffect(() => {
    setRouteDraft(Array.isArray(morphRoute) ? morphRoute.join(',') : '');
  }, [morphRoute]);
  const applyRouteFromInput = useCallback(() => {
    const vals = (routeDraft || '')
      .split(',')
      .map(s => parseInt(s.trim(), 10))
      .filter(n => Number.isFinite(n) && n >= 1 && n <= 8);
    setMorphRoute && setMorphRoute(vals);
  }, [routeDraft, setMorphRoute]);
  const _renderMorphControls = () => {
    const route = Array.isArray(morphRoute) ? morphRoute : [];
    const missing = (route || []).filter(id => {
      const s = getPresetSlot ? getPresetSlot(id) : null;
      return !(s && s.payload && s.payload.appState);
    });
    return (
      <div className="control-card" style={{ marginTop: '0.5rem' }}>
        <div className="control-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontWeight: 600 }}>Preset Morph</span>
            <label className="compact-label" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <input
                type="checkbox"
                checked={!!morphEnabled}
                onChange={() => {
                  const next = !morphEnabled;
                  console.debug('[Morph] set enabled ->', next);
                  if (!next) {
                    setMorphEnabled && setMorphEnabled(false);
                    setMorphError('');
                    return;
                  }
                  let route = Array.isArray(morphRoute) ? morphRoute : [];
                  if (route.length < 2) {
                    const savedIds = (presetSlots || []).filter(s => s && s.payload).map(s => s.id);
                    if (savedIds.length >= 2 && setMorphRoute) {
                      route = [savedIds[0], savedIds[1]];
                      setMorphRoute(route);
                      setRouteDraft(route.join(','));
                    }
                  }
                  const missing = (route || []).filter(id => {
                    const s = getPresetSlot ? getPresetSlot(id) : null;
                    return !(s && s.payload && s.payload.appState);
                  });
                  if (missing.length > 0) {
                    console.warn('[Morph] Cannot enable; missing saved presets:', missing);
                    setMorphError(`Cannot enable: save presets ${missing.join(', ')} first (Shift+Click on circles).`);
                    // Do NOT enable
                    return;
                  }
                  setMorphEnabled && setMorphEnabled(true);
                  setMorphError('');
                }}
              />
              Enable
              <span style={{
                padding: '0.1rem 0.4rem',
                borderRadius: 999,
                background: morphEnabled ? 'rgba(76,175,80,0.25)' : 'rgba(255,255,255,0.08)',
                border: morphEnabled ? '1px solid #4caf50' : '1px solid rgba(255,255,255,0.15)',
                fontSize: '0.75rem',
                color: morphEnabled ? '#a5d6a7' : 'rgba(255,255,255,0.7)'
              }}>{morphEnabled ? 'On' : 'Off'}</span>
            </label>
          </div>
        </div>
        {missing.length > 0 && (
          <div style={{ marginTop: '0.4rem', color: '#ff9e80', fontSize: '0.85rem' }}>
            Save these presets first (Shift+Click on their circles): {missing.join(', ')}
          </div>
        )}
        {morphError && (
          <div style={{ marginTop: '0.35rem', color: '#ef5350', fontSize: '0.85rem' }}>{morphError}</div>
        )}
        <div className="compact-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.5rem' }}>
          <label className="compact-label" title="Route of presets to morph through, comma-separated (e.g., 1,3,5)">
            Route
            <input
              type="text"
              className="compact-input"
              value={routeDraft}
              onChange={(e) => setRouteDraft(e.target.value)}
              onBlur={applyRouteFromInput}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyRouteFromInput(); } }}
            />
          </label>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem' }}>
            <button type="button" className="btn-compact-secondary" onClick={applyRouteFromInput} title="Apply route">Apply</button>
          </div>
          <label className="compact-label" title="Seconds per leg">
            Duration
            <BufferedNumberInput
              value={Number.isFinite(morphDurationPerLeg) ? morphDurationPerLeg : 5}
              min={0.2}
              max={120}
              step={0.1}
              onCommit={(next) => setMorphDurationPerLeg?.(next)}
              className="compact-input"
              inputMode="decimal"
            />
          </label>
          <label className="compact-label" title="Easing">
            Easing
            <select className="compact-select" value={morphEasing || 'linear'} onChange={(e) => setMorphEasing && setMorphEasing(e.target.value)}>
              <option value="linear">linear</option>
            </select>
          </label>
          <label className="compact-label" title="Loop mode">
            Mode
            <select className="compact-select" value={morphLoopMode || 'loop'} onChange={(e) => setMorphLoopMode && setMorphLoopMode(e.target.value)}>
              <option value="loop">loop</option>
              <option value="pingpong">pingpong</option>
            </select>
          </label>
          <label className="compact-label" title="Morph algorithm">
            Morph
            <select className="compact-select" value={morphMode || 'tween'} onChange={(e) => setMorphMode && setMorphMode(e.target.value)}>
              <option value="tween">tween</option>
              <option value="fade">fade</option>
            </select>
          </label>
        </div>
        {morphEnabled && morphStatus && (
          <div style={{ marginTop: '0.35rem', fontSize: '0.85rem', opacity: 0.8 }}>
            Morph: {morphStatus.from} → {morphStatus.to} ({Math.round(morphStatus.t * 100)}%)
          </div>
        )}
      </div>
    );
  };

  // Refs to stabilize morph engine
  const rafRef = useRef(0);
  const routeRef = useRef([]);
  const durRef = useRef(5);
  const easingRef = useRef('linear');
  const loopModeRef = useRef('loop');
  const getPresetSlotRef = useRef(getPresetSlot);
  const loadAppStateRef = useRef(loadAppState);
  const fadePrepRef = useRef({ key: null, lenA: 0, lenB: 0, baseA: [], baseB: [] });
  const tweenPrepRef = useRef({ key: null, baseA: [], baseB: [] });

  // Sync current settings into refs
  useEffect(() => { routeRef.current = Array.isArray(morphRoute) ? [...morphRoute] : []; }, [morphRoute]);
  useEffect(() => { durRef.current = Number(morphDurationPerLeg || 5); }, [morphDurationPerLeg]);
  useEffect(() => { easingRef.current = morphEasing || 'linear'; }, [morphEasing]);
  useEffect(() => { loopModeRef.current = morphLoopMode || 'loop'; }, [morphLoopMode]);
  const modeRef = useRef('tween');
  useEffect(() => { modeRef.current = morphMode || 'tween'; }, [morphMode]);
  useEffect(() => { getPresetSlotRef.current = getPresetSlot; }, [getPresetSlot]);
  useEffect(() => { loadAppStateRef.current = loadAppState; }, [loadAppState]);

  // Morph engine: interpolate between consecutive presets' appState
  useEffect(() => {
    // Stop any existing loop
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (!morphEnabled) return;
    const route = routeRef.current;
    if (!Array.isArray(route) || route.length < 2) return;

    let legIndex = 0;
    let forward = true;
    let startTime = performance.now();

    const lerp = (a, b, t) => a + (b - a) * t;
    const sanitizeHex = (val) => (typeof val === 'string' && /^#([0-9a-fA-F]{6})$/.test(val) ? val : '#000000');
    const lerpColor = (ca, cb, t) => {
      const ra = hexToRgb(sanitizeHex(ca));
      const rb = hexToRgb(sanitizeHex(cb));
      return rgbToHex({ r: Math.round(lerp(ra.r, rb.r, t)), g: Math.round(lerp(ra.g, rb.g, t)), b: Math.round(lerp(ra.b, rb.b, t)) });
    };
    const stripMorphFields = (state) => {
      if (!state || typeof state !== 'object') return state;
      const { morphEnabled: _me, morphRoute: _mr, morphDurationPerLeg: _md, morphEasing: _meas, morphLoopMode: _ml, ...rest } = state;
      return rest;
    };

    // Do not hard-load the starting preset; keep live animation running.
    // We'll blend visuals in-place each frame instead.
    setMorphStatus && setMorphStatus({ from: route[0], to: route[1], t: 0 });

    const step = () => {
      const now = performance.now();
      const durMs = Math.max(200, Number(durRef.current || 5) * 1000);
      const tRaw = Math.min(1, (now - startTime) / durMs);
      let t = tRaw;
      if (easingRef.current === 'linear') {
        // no-op
      }

      const routeNow = routeRef.current;
      const fromId = routeNow[legIndex];
      const toId = routeNow[(legIndex + 1) % routeNow.length];
      const legKey = `${fromId}->${toId}`;
      const fromSlot = getPresetSlotRef.current ? getPresetSlotRef.current(fromId) : null;
      const toSlot = getPresetSlotRef.current ? getPresetSlotRef.current(toId) : null;
      const fromState = fromSlot?.payload?.appState;
      const toState = toSlot?.payload?.appState;
      setMorphStatus && setMorphStatus({ from: fromId, to: toId, t });
      if (fromState && toState) {
        try {
          const a = stripMorphFields(fromState);
          const b = stripMorphFields(toState);
          if (modeRef.current === 'fade') {
            // Prepare once per leg: construct A+B layer stack with baseline opacities
            if (fadePrepRef.current.key !== legKey) {
              const layersA = Array.isArray(a.layers) ? a.layers : [];
              const layersB = Array.isArray(b.layers) ? b.layers : [];
              fadePrepRef.current = {
                key: legKey,
                lenA: layersA.length,
                lenB: layersB.length,
                baseA: layersA.map(l => Number(l?.opacity ?? 1)),
                baseB: layersB.map(l => Number(l?.opacity ?? 1)),
              };
              // Initialize combined stack: A visible, B hidden
              setLayers(() => [
                ...layersA.map(l => ({ ...l, opacity: Number(l.opacity ?? 1) })),
                ...layersB.map(l => ({ ...l, opacity: 0 })),
              ]);
            }
            // Blend background and opacities in place using baseline values (no compounding)
            setBackgroundColor && setBackgroundColor(lerpColor(a.backgroundColor || '#000000', b.backgroundColor || '#000000', t));
            const { lenA, baseA, baseB } = fadePrepRef.current;
            setLayers(prev => prev.map((l, i) => {
              let nextOpacity = Number(l.opacity ?? 1);
              if (i < lenA) {
                const oa0 = Number(baseA[i] ?? 0);
                nextOpacity = Math.max(0, Math.min(1, oa0 * (1 - t)));
              } else {
                const j = i - lenA;
                const ob0 = Number(baseB[j] ?? 0);
                nextOpacity = Math.max(0, Math.min(1, ob0 * t));
              }
              return nextOpacity !== l.opacity ? { ...l, opacity: nextOpacity } : l;
            }));
          } else {
            // Tween mode (default): interpolate from cached leg endpoints to avoid accumulated drift
            if (tweenPrepRef.current.key !== legKey) {
              tweenPrepRef.current = {
                key: legKey,
                baseA: Array.isArray(a.layers) ? a.layers.map(l => ({ ...l })) : [],
                baseB: Array.isArray(b.layers) ? b.layers.map(l => ({ ...l })) : [],
              };
            }
            const baseA = tweenPrepRef.current.baseA || [];
            const baseB = tweenPrepRef.current.baseB || [];
            setBackgroundColor && setBackgroundColor(lerpColor(a.backgroundColor || '#000000', b.backgroundColor || '#000000', t));
            const maxLen = Math.max(baseA.length, baseB.length, 1);
            setLayers(() => {
              const out = [];
              for (let i = 0; i < maxLen; i++) {
                const la = baseA[i] || baseA[Math.max(0, baseA.length - 1)] || {};
                const lb = baseB[i] || baseB[Math.max(0, baseB.length - 1)] || {};
                const pa = la.position || { x: 0.5, y: 0.5, scale: 1 };
                const pb = lb.position || { x: 0.5, y: 0.5, scale: 1 };
                const colorsA = Array.isArray(la.colors) ? la.colors : [];
                const colorsB = Array.isArray(lb.colors) ? lb.colors : [];
                const colorCount = Math.max(colorsA.length, colorsB.length);
                const blendedColors = colorCount > 0
                  ? Array.from({ length: colorCount }, (_, idx) => {
                      const ca = colorsA[idx] || colorsA[Math.max(0, colorsA.length - 1)] || '#000000';
                      const cb = colorsB[idx] || colorsB[Math.max(0, colorsB.length - 1)] || '#000000';
                      return lerpColor(ca, cb, t);
                    })
                  : undefined;
                out.push({
                  ...lb,
                  opacity: lerp(Number(la.opacity || 1), Number(lb.opacity || 1), t),
                  rotation: lerp(Number(la.rotation || 0), Number(lb.rotation || 0), t),
                  radiusFactor: lerp(Number(la.radiusFactor || 0.125), Number(lb.radiusFactor || 0.125), t),
                  movementSpeed: lerp(Number(la.movementSpeed || 1), Number(lb.movementSpeed || 1), t),
                  colors: blendedColors || lb.colors,
                  numColors: blendedColors ? blendedColors.length : lb.numColors,
                  position: {
                    x: lerp(Number(pa.x || 0.5), Number(pb.x || 0.5), t),
                    y: lerp(Number(pa.y || 0.5), Number(pb.y || 0.5), t),
                    scale: lerp(Number(pa.scale || 1), Number(pb.scale || 1), t),
                    vx: 0,
                    vy: 0,
                    scaleDirection: 1,
                  },
                });
              }
              return out;
            });
          }
        } catch { /* noop */ }
      }

      if (tRaw >= 1) {
        // Snap to the exact target of the just-finished leg (avoids 1-frame lag and visible pauses)
        try {
          const snapSlot = getPresetSlotRef.current ? getPresetSlotRef.current(toId) : null;
          const snapState = snapSlot?.payload?.appState;
          const b2 = stripMorphFields(snapState || {});
          const bLayers2 = Array.isArray(b2.layers) ? b2.layers : [];
          setLayers(() => bLayers2.map(l => ({ ...l })));
          setBackgroundColor && setBackgroundColor(b2.backgroundColor || '#000000');
        } catch { /* noop */ }
        if (loopModeRef.current === 'pingpong') {
          if (forward) {
            if (legIndex + 1 >= routeNow.length - 1) {
              forward = false;
            } else {
              legIndex += 1;
            }
          } else {
            if (legIndex <= 0) {
              forward = true;
            } else {
              legIndex -= 1;
            }
          }
        } else {
          legIndex = (legIndex + 1) % routeNow.length;
        }
        startTime = now;
        // On leg boundary for fade mode: snap to target preset's layer list
        if (modeRef.current === 'fade') {
          const routeNow2 = routeRef.current;
          const toId2 = routeNow2[(legIndex) % routeNow2.length];
          const toSlot2 = getPresetSlotRef.current ? getPresetSlotRef.current(toId2) : null;
          const toState2 = toSlot2?.payload?.appState;
          const b2 = stripMorphFields(toState2 || {});
          const bLayers2 = Array.isArray(b2.layers) ? b2.layers : [];
          setLayers(() => bLayers2.map(l => ({ ...l })));
        }
        // Reset prep for next leg
        fadePrepRef.current = { key: null, lenA: 0, lenB: 0, baseA: [], baseB: [] };
        tweenPrepRef.current = { key: null, baseA: [], baseB: [] };
      }
      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [morphEnabled, setBackgroundColor, setLayers]);

  return (
    <div className="tab-section global-controls-panel">
      <div className="control-card">
        <details style={{ marginBottom: '0.4rem' }}>
          <summary style={{ cursor: 'pointer', userSelect: 'none', fontSize: '0.9em', opacity: 0.85, padding: '0.2rem 0' }}>Settings</summary>
          <div style={{ marginTop: '0.4rem' }}>
            <div className="control-row" style={{ justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap', gap: '0.3rem 0.6rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem 0.8rem', flexWrap: 'wrap', flex: '1 1 auto', justifyContent: 'flex-end' }}>
                <label className="compact-label"><input type="checkbox" checked={isFrozen} onChange={(e) => setIsFrozen(e.target.checked)} /> Freeze</label>
                <label className="compact-label" title="Continue palette colour fading while frozen"><input type="checkbox" checked={!!colorFadeWhileFrozen} onChange={(e) => setColorFadeWhileFrozen(!!e.target.checked)} /> Fade</label>
                <label className="compact-label" title="Ignore Z movement"><input type="checkbox" checked={!!zIgnore} onChange={(e) => setZIgnore(!!e.target.checked)} /> Z-Ign</label>
                <label className="compact-label"><input type="checkbox" checked={classicMode} onChange={(e) => setClassicMode(e.target.checked)} /> Classic</label>
                <button className="icon-btn" onClick={handleRandomizeAll} title="Randomise everything" aria-label="Randomise everything" style={{ padding: '0 0.4rem' }}>🎲</button>
                {hasSelectedMidiDevice && (
                  <>
                    <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); beginLearn && beginLearn('randomizeAll'); }} disabled={!midiSupported} title="MIDI Learn: Randomize All">Learn</button>
                    <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); clearMapping && clearMapping('randomizeAll'); }} disabled={!midiSupported || !midiMappings?.randomizeAll} title="Clear MIDI for Randomize All">Clear</button>
                  </>
                )}
              </div>
            </div>
            {/* Seed */}
            <div className="dc-wrap" style={{ marginTop: '0.4rem', marginBottom: '0.4rem' }}>
              <div className="dc-inner">
                <div className="dc-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><span>Seed:</span><BufferedNumberInput value={seedValue} min={GLOBAL_SEED_MIN} max={GLOBAL_SEED_MAX} step={1} precision={0} onCommit={(next) => handleSeedSliderChange({ target: { value: next } })} className="dc-value-input" inputMode="numeric" /></div>
                </div>
                <input className="dc-slider" type="range" min={GLOBAL_SEED_MIN} max={GLOBAL_SEED_MAX} step={1} value={seedValue} onChange={handleSeedSliderChange} />
              </div>
            </div>
          </div>
        </details>
          {/* Background */}
          <div style={{ marginBottom: '0.2rem' }}>
            <div className="dc-inner">
              <div className="dc-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>Background</span>
                  <BackgroundColorPicker compact inline hideLabel color={backgroundColor} onChange={setBackgroundColor} />
                </div>
                <div className="dc-actions" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <label className="compact-label" title="Include in Randomize All"><input type="checkbox" checked={Boolean(getIsRnd('backgroundColor'))} onChange={(e) => setIsRnd('backgroundColor', Boolean(e.target.checked))} /> Incl</label>
                  <label className="compact-label" title="Enable background image"><input type="checkbox" checked={!!backgroundImage?.enabled} onChange={(e) => setBackgroundImage(prev => ({ ...(prev || {}), enabled: !!e.target.checked }))} /> Img</label>
                  <button type="button" className="icon-btn" onClick={(e) => { e.stopPropagation(); setShowFpsSettings(s => !s); }} title="FPS settings" style={{ padding: '0 0.4rem' }}>⚙</button>
                </div>
              </div>
              {backgroundImage?.enabled && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
                  <input type="file" accept="image/png, image/jpeg" title="Set background image" onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = (ev) => { setBackgroundImage(prev => ({ ...(prev || {}), src: String(ev.target?.result || ''), enabled: true })); }; reader.readAsDataURL(file); e.target.value = ''; }} style={{ width: 24 }} />
                  <label className="compact-label" title="Background image opacity">Opac <input type="range" className="dc-slider" min={0} max={1} step={0.01} value={Math.max(0, Math.min(1, Number(backgroundImage?.opacity ?? 1)))} onChange={(e) => setBackgroundImage(prev => ({ ...(prev || {}), opacity: parseFloat(e.target.value) }))} style={{ width: 80, margin: 0 }} /></label>
                  <select className="compact-select" value={backgroundImage?.fit || 'cover'} onChange={(e) => setBackgroundImage(prev => ({ ...(prev || {}), fit: e.target.value }))} title="Background image fit"><option value="cover">cover</option><option value="contain">contain</option><option value="stretch">stretch</option><option value="center">center</option></select>
                  <button type="button" className="btn-compact-secondary" title="Clear background image" onClick={() => setBackgroundImage({ src: null, enabled: false, opacity: 1, fit: 'cover' })}>Clear</button>
                </div>
              )}
              {showFpsSettings && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.4rem' }}>
                  <label className="compact-label"><input type="checkbox" checked={canvasFps <= 30} onChange={(e) => setCanvasFps(e.target.checked ? 30 : 60)} /> 30fps limit</label>
                  <select className="compact-select" value={canvasFps} onChange={(e) => setCanvasFps(Number(e.target.value))} title="Canvas draw rate"><option value={15}>15 fps</option><option value={24}>24 fps</option><option value={30}>30 fps</option><option value={60}>60 fps</option></select>
                </div>
              )}
            </div>
          </div>
          {/* Global Speed */}
          <div className="dc-wrap" style={{ marginBottom: '0.2rem' }}>
            <div className="dc-inner">
              <div className="dc-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><span>Global Speed:</span><BufferedNumberInput value={globalSpeedMultiplier} min={SPEED_SLIDER_MIN} max={SPEED_SLIDER_MAX} step={speedStep} precision={2} onCommit={(next) => setGlobalSpeedMultiplier(next)} className="dc-value-input" />{renderAutomationBadge('globalSpeedMultiplier')}</div>
                <div className="dc-actions" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <label className="compact-label" title="Include Global Speed in Randomize All"><input type="checkbox" checked={!!getIsRnd('globalSpeedMultiplier')} onChange={(e) => setIsRnd('globalSpeedMultiplier', e.target.checked)} /> Incl</label>
                  <button type="button" className="icon-btn" onClick={(e) => { e.stopPropagation(); setShowSpeedSettings(s => !s); }} title="Global Speed settings" style={{ padding: '0 0.4rem' }}>⚙</button>
                </div>
              </div>
              <RangeSlider className="dc-slider" min={SPEED_SLIDER_MIN} max={SPEED_SLIDER_MAX} step={speedStep} value={globalSpeedMultiplier} onChange={(e) => setGlobalSpeedMultiplier(parseFloat(e.target.value))} rangeMin={speedMin} rangeMax={speedMax} onRangeMinChange={setSpeedMin} onRangeMaxChange={setSpeedMax} />
            {showSpeedSettings && (
              <div className="dc-settings" style={{ marginTop: '0.25rem', padding: '0.5rem', borderRadius: 6, background: 'rgba(255,255,255,0.05)' }}>
                <div className="compact-row" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                  <span className="compact-label" style={{ opacity: 0.8 }}>MIDI: {midiSupported ? (midiMappings?.globalSpeedMultiplier ? (mappingLabel ? mappingLabel(midiMappings.globalSpeedMultiplier) : 'Mapped') : 'Not mapped') : 'Not supported'}</span>
                  {learnParamId === 'globalSpeedMultiplier' && midiSupported && <span style={{ color: '#4fc3f7' }}>Listening…</span>}
                  <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); beginLearn && beginLearn('globalSpeedMultiplier'); }} disabled={!midiSupported}>Learn</button>
                  <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); clearMapping && clearMapping('globalSpeedMultiplier'); }} disabled={!midiSupported || !midiMappings?.globalSpeedMultiplier}>Clear</button>
                </div>
                <AudioControlRow paramId="globalSpeedMultiplier" />
                <BPMControlRow paramId="globalSpeedMultiplier" />
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 5rem auto 5rem auto 5rem', gap: '0.4rem', alignItems: 'center', marginTop: '0.5rem' }}>
                  <label className="compact-label">Rand Min</label>
                  <BufferedNumberInput
                    value={speedMin}
                    step={0.01}
                    min={SPEED_SLIDER_MIN}
                    max={speedMax}
                    onCommit={setSpeedMin}
                    className="compact-number"
                    style={{ width: '5rem' }}
                  />
                  <label className="compact-label">{`Rand Max${getOperationalMaxHint('globalSpeedMultiplier')}`}</label>
                  <BufferedNumberInput
                    value={speedMax}
                    step={0.01}
                    min={speedMin}
                    max={SPEED_SLIDER_MAX}
                    onCommit={setSpeedMax}
                    className="compact-number"
                    style={{ width: '5rem' }}
                  />
                  <label className="compact-label">Step</label>
                  <BufferedNumberInput
                    value={speedStep}
                    step={0.001}
                    min={0.001}
                    onCommit={(next) => setSpeedStep(next || 0.01)}
                    className="compact-number"
                    style={{ width: '5rem' }}
                  />
                </div>
              </div>
            )}
            </div>
          </div>
          {/* Palette */}
          <div style={{ marginBottom: '0.2rem' }}>
            <div className="dc-inner" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
              <span style={{ whiteSpace: 'nowrap' }}>Palette{renderAutomationBadge('globalPaletteIndex')}</span>
              <select className="compact-select" style={{ flex: '1 1 6rem', minWidth: '4rem' }} value={selectedPaletteValue} onChange={(e) => { const val = e.target.value; if (val === 'custom') { setGlobalPaletteIndex?.('custom'); setGlobalPaletteRef?.(null); return; } if (val.startsWith('custom:')) { const id = val.slice('custom:'.length); if (!id) return; setGlobalPaletteRef?.(id); } else if (val.startsWith('builtin:')) { const idx = parseInt(val.slice('builtin:'.length), 10); if (!Number.isFinite(idx) || !palettes[idx]) return; setGlobalPaletteRef?.(null); setGlobalPaletteIndex?.(idx); } const src = paletteValueMap.get(val) || []; const nextColors = sampleColorsEven(src, Math.max(1, layers.length)); assignOneColorPerLayer(nextColors); }}>
                <option value="custom">Custom</option>
                {paletteOptions.builtins.length > 0 && (<optgroup label="Built-in">{paletteOptions.builtins.map((p) => (<option key={p.value} value={p.value}>{p.label}</option>))}</optgroup>)}
                {paletteOptions.customs.length > 0 && (<optgroup label="Custom">{paletteOptions.customs.map((p) => (<option key={p.value} value={p.value}>{p.label}</option>))}</optgroup>)}
              </select>
              <label className="compact-label" title="Include Palette in Randomize All" style={{ flex: '0 0 auto' }}><input type="checkbox" checked={!!getIsRnd('globalPaletteIndex')} onChange={(e) => setIsRnd('globalPaletteIndex', e.target.checked)} /> Incl</label>
              <button type="button" className="icon-btn" onClick={(e) => { e.stopPropagation(); setShowPaletteSettings(s => !s); }} title="Palette settings" style={{ padding: '0 0.4rem', flex: '0 0 auto' }}>⚙</button>
              {showPaletteSettings && (
                <div className="dc-settings" style={{ flex: '0 0 100%', marginTop: '0.25rem', padding: '0.5rem', borderRadius: 6, background: 'rgba(255,255,255,0.05)' }}>
                  <div style={{ marginBottom: '0.5rem' }}>
                    <button type="button" className="btn-compact-secondary" onClick={() => { if (typeof onSaveCustomPalette !== 'function') return; const base = Array.isArray(generationPaletteColors) ? generationPaletteColors : []; const safe = base.filter(c => typeof c === 'string' && c.trim().length > 0); if (!safe.length) return; const name = (window.prompt('Name this custom palette:', 'Custom Palette') || '').trim(); if (!name) return; const created = onSaveCustomPalette({ name, colors: safe }); if (created?.id) setGlobalPaletteRef?.(created.id); }}>Save current colours as custom palette</button>
                  </div>
                  <div className="compact-row" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                    <span className="compact-label" style={{ opacity: 0.8 }}>MIDI: {midiSupported ? (midiMappings?.globalPaletteIndex ? (mappingLabel ? mappingLabel(midiMappings.globalPaletteIndex) : 'Mapped') : 'Not mapped') : 'Not supported'}</span>
                    {learnParamId === 'globalPaletteIndex' && midiSupported && <span style={{ color: '#4fc3f7' }}>Listening…</span>}
                    <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); beginLearn && beginLearn('globalPaletteIndex'); }} disabled={!midiSupported}>Learn</button>
                    <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); clearMapping && clearMapping('globalPaletteIndex'); }} disabled={!midiSupported || !midiMappings?.globalPaletteIndex}>Clear</button>
                  </div>
                  <AudioControlRow paramId="globalPaletteIndex" />
                  <BPMControlRow paramId="globalPaletteIndex" />
                </div>
              )}
            </div>
          </div>
          {/* Style */}
          <div style={{ marginBottom: '0.2rem' }}>
            <div className="dc-inner" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
              <span style={{ whiteSpace: 'nowrap' }}>Style{renderAutomationBadge('globalBlendMode')}</span>
              <select className="compact-select" style={{ flex: '1 1 6rem', minWidth: '4rem' }} value={globalBlendMode} onChange={(e) => setGlobalBlendMode(e.target.value)}>
                {blendModes.map(m => (<option key={m} value={m}>{m}</option>))}
              </select>
              <label className="compact-label" title="Include Style in Randomize All" style={{ flex: '0 0 auto' }}><input type="checkbox" checked={!!getIsRnd('globalBlendMode')} onChange={(e) => setIsRnd('globalBlendMode', e.target.checked)} /> Incl</label>
              <button type="button" className="icon-btn" onClick={(e) => { e.stopPropagation(); setShowBlendModeSettings(s => !s); }} title="Style settings" style={{ padding: '0 0.4rem', flex: '0 0 auto' }}>⚙</button>
              {showBlendModeSettings && (
                <div className="dc-settings" style={{ flex: '0 0 100%', marginTop: '0.25rem', padding: '0.5rem', borderRadius: 6, background: 'rgba(255,255,255,0.05)' }}>
                  <div className="compact-row" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                    <span className="compact-label" style={{ opacity: 0.8 }}>MIDI: {midiSupported ? (midiMappings?.globalBlendMode ? (mappingLabel ? mappingLabel(midiMappings.globalBlendMode) : 'Mapped') : 'Not mapped') : 'Not supported'}</span>
                    {learnParamId === 'globalBlendMode' && midiSupported && <span style={{ color: '#4fc3f7' }}>Listening…</span>}
                    <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); beginLearn && beginLearn('globalBlendMode'); }} disabled={!midiSupported}>Learn</button>
                    <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); clearMapping && clearMapping('globalBlendMode'); }} disabled={!midiSupported || !midiMappings?.globalBlendMode}>Clear</button>
                  </div>
                  <AudioControlRow paramId="globalBlendMode" />
                  <BPMControlRow paramId="globalBlendMode" />
                </div>
              )}
            </div>
          </div>
          {/* Global Opacity */}
          <div className="dc-wrap" style={{ marginBottom: '0.2rem' }}>
            <div className="dc-inner">
              <div className="dc-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><span>Global Opacity:</span><BufferedNumberInput value={Number.isFinite(layers?.[0]?.opacity) ? layers[0].opacity : 1} min={OPACITY_SLIDER_MIN} max={OPACITY_SLIDER_MAX} step={opacityStep} precision={2} onCommit={(next) => { const v = Math.max(0, Math.min(1, next)); setLayers(prev => prev.map(l => ({ ...l, opacity: v }))); }} className="dc-value-input" />{renderAutomationBadge('globalOpacity')}</div>
                <div className="dc-actions" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <label className="compact-label" title="Include Global Opacity in Randomize All"><input type="checkbox" checked={!!getIsRnd('globalOpacity')} onChange={(e) => setIsRnd('globalOpacity', e.target.checked)} /> Incl</label>
                  <button type="button" className="icon-btn" onClick={(e) => { e.stopPropagation(); setShowOpacitySettings(s => !s); }} title="Opacity settings" style={{ padding: '0 0.4rem' }}>⚙</button>
                </div>
              </div>
              <RangeSlider className="dc-slider" min={OPACITY_SLIDER_MIN} max={OPACITY_SLIDER_MAX} step={opacityStep} value={Number.isFinite(layers?.[0]?.opacity) ? layers[0].opacity : 1} onChange={(e) => { const v = Math.max(0, Math.min(1, parseFloat(e.target.value))); setLayers(prev => prev.map(l => ({ ...l, opacity: v }))); }} rangeMin={opacityMin} rangeMax={opacityMax} onRangeMinChange={setOpacityMin} onRangeMaxChange={setOpacityMax} />
              {showOpacitySettings && (
                <div className="dc-settings" style={{ marginTop: '0.25rem', padding: '0.5rem', borderRadius: 6, background: 'rgba(255,255,255,0.05)' }}>
                  <div className="compact-row" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                    <span className="compact-label" style={{ opacity: 0.8 }}>MIDI: {midiSupported ? (midiMappings?.globalOpacity ? (mappingLabel ? mappingLabel(midiMappings.globalOpacity) : 'Mapped') : 'Not mapped') : 'Not supported'}</span>
                    {learnParamId === 'globalOpacity' && midiSupported && <span style={{ color: '#4fc3f7' }}>Listening…</span>}
                    <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); beginLearn && beginLearn('globalOpacity'); }} disabled={!midiSupported}>Learn</button>
                    <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); clearMapping && clearMapping('globalOpacity'); }} disabled={!midiSupported || !midiMappings?.globalOpacity}>Clear</button>
                  </div>
                  <AudioControlRow paramId="globalOpacity" />
                  <BPMControlRow paramId="globalOpacity" />
                  <div style={{ display: 'grid', gridTemplateColumns: 'auto 5rem auto 5rem auto 5rem', gap: '0.4rem', alignItems: 'center', marginTop: '0.5rem' }}>
                    <label className="compact-label">Rand Min</label>
                    <BufferedNumberInput value={opacityMin} step={0.01} min={OPACITY_SLIDER_MIN} max={opacityMax} onCommit={setOpacityMin} className="compact-number" style={{ width: '5rem' }} />
                    <label className="compact-label">{`Rand Max${getOperationalMaxHint('globalOpacity')}`}</label>
                    <BufferedNumberInput value={opacityMax} step={0.01} min={opacityMin} max={OPACITY_SLIDER_MAX} onCommit={setOpacityMax} className="compact-number" style={{ width: '5rem' }} />
                    <label className="compact-label">Step</label>
                    <BufferedNumberInput value={opacityStep} step={0.001} min={0.001} onCommit={(next) => setOpacityStep(next || 0.01)} className="compact-number" style={{ width: '5rem' }} />
                  </div>
                </div>
              )}
            </div>
          </div>
          {/* Layers */}
          <div className="dc-wrap" style={{ marginBottom: '0.2rem' }}>
            <div className="dc-inner">
              <div className="dc-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><span>Layers:</span><BufferedNumberInput value={layerCountDraft} min={LAYERS_SLIDER_MIN} max={LAYERS_SLIDER_MAX} step={layersStep} precision={0} onCommit={(next) => commitLayerCountDraft(Math.max(LAYERS_SLIDER_MIN, Math.min(LAYERS_SLIDER_MAX, Math.round(next))))} className="dc-value-input" inputMode="numeric" />{renderAutomationBadge('layersCount')}</div>
                <div className="dc-actions" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <label className="compact-label" title="Include Layers in Randomize All"><input type="checkbox" checked={!!getIsRnd('layersCount')} onChange={(e) => setIsRnd('layersCount', e.target.checked)} /> Incl</label>
                  <button type="button" className="icon-btn" onClick={(e) => { e.stopPropagation(); setShowLayersSettings(s => !s); }} title="Layers settings" style={{ padding: '0 0.4rem' }}>⚙</button>
                </div>
              </div>
              <RangeSlider className="dc-slider" min={LAYERS_SLIDER_MIN} max={LAYERS_SLIDER_MAX} step={layersStep} value={layerCountDraft} onChange={(e) => { setLayerCountDraft(Number(e.target.value)); }} onPointerDown={() => { layerCountDraggingRef.current = true; }} onPointerUp={() => { layerCountDraggingRef.current = false; commitLayerCountDraft(layerCountDraft); }} onPointerCancel={() => { layerCountDraggingRef.current = false; commitLayerCountDraft(layerCountDraft); }} rangeMin={layersMin} rangeMax={layersMax} onRangeMinChange={(v) => setLayersMin(Math.max(1, Math.round(v)))} onRangeMaxChange={(v) => setLayersMax(Math.max(1, Math.round(v)))} />
              {showLayersSettings && (
                <div className="dc-settings" style={{ marginTop: '0.25rem', padding: '0.5rem', borderRadius: 6, background: 'rgba(255,255,255,0.05)' }}>
                  <div className="compact-row" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                    <span className="compact-label" style={{ opacity: 0.8 }}>MIDI: {midiSupported ? (midiMappings?.layersCount ? (mappingLabel ? mappingLabel(midiMappings.layersCount) : 'Mapped') : 'Not mapped') : 'Not supported'}</span>
                    {learnParamId === 'layersCount' && midiSupported && <span style={{ color: '#4fc3f7' }}>Listening…</span>}
                    <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); beginLearn && beginLearn('layersCount'); }} disabled={!midiSupported}>Learn</button>
                    <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); clearMapping && clearMapping('layersCount'); }} disabled={!midiSupported || !midiMappings?.layersCount}>Clear</button>
                  </div>
                  <AudioControlRow paramId="layersCount" />
                  <BPMControlRow paramId="layersCount" />
                  <div style={{ display: 'grid', gridTemplateColumns: 'auto 5rem auto 5rem auto 5rem', gap: '0.4rem', alignItems: 'center', marginTop: '0.5rem' }}>
                    <label className="compact-label">Rand Min</label>
                    <BufferedNumberInput value={layersMin} step={1} min={LAYERS_SLIDER_MIN} max={layersMax} onCommit={(next) => setLayersMin(Math.max(1, Math.round(next)))} className="compact-number" style={{ width: '5rem' }} inputMode="numeric" />
                    <label className="compact-label">{`Rand Max${getOperationalMaxHint('layersCount')}`}</label>
                    <BufferedNumberInput value={layersMax} step={1} min={layersMin} max={LAYERS_SLIDER_MAX} onCommit={(next) => setLayersMax(Math.max(layersMin, Math.round(next)))} className="compact-number" style={{ width: '5rem' }} inputMode="numeric" />
                    <label className="compact-label">Step</label>
                    <BufferedNumberInput value={layersStep} step={1} min={1} onCommit={(next) => setLayersStep(Math.max(1, Math.round(next)))} className="compact-number" style={{ width: '5rem' }} inputMode="numeric" />
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1rem', marginTop: '0.6rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                    <label className="compact-label" title="Every layer copies Layer 1 colours"><input type="checkbox" checked={!!syncLayerColorsToFirst} onChange={(e) => setSyncLayerColorsToFirst?.(e.target.checked)} /> Match colours to Layer 1</label>
                    <label className="compact-label" title="Apply variation sliders in real time"><input type="checkbox" checked={!!applyVariationInstantly} onChange={(e) => setApplyVariationInstantly?.(!!e.target.checked)} /> Instant variation</label>
                    <label className="compact-label" title="Each layer gets random colour count"><input type="checkbox" checked={!!randomizeColorsPerLayer} onChange={(e) => setRandomizeColorsPerLayer?.(e.target.checked)} /> Randomise colours per layer</label>
                    <label className="compact-label" title="Use global palette for generation"><input type="checkbox" checked={!!audioSpawnUseGlobalPalette} disabled={!setAudioSpawnUseGlobalPalette} onChange={(e) => setAudioSpawnUseGlobalPalette?.(!!e.target.checked)} /> Use global palette</label>
                    {!randomizeColorsPerLayer && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <span className="compact-label" style={{ opacity: 0.7 }}>Uniform count:</span>
                        <BufferedNumberInput value={uniformColorCount ?? 3} min={1} max={32} step={1} onCommit={(next) => setUniformColorCount?.(Math.max(1, Math.min(32, Math.round(next))))} className="compact-number" style={{ width: '3.5rem' }} inputMode="numeric" />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
      </div>
      {/* Variation card */}
      <div className="control-card">
        <div className="control-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 600 }}>Variation</div>
        </div>
        <div style={{ marginTop: '0.5rem' }}>
          {[
            { key: 'variationPosition', label: 'Position', value: layers?.[0]?.variationPosition ?? DEFAULT_LAYER.variationPosition, min: variationPositionMin, max: variationPositionMax, step: variationPositionStep, sliderMin: VARIATION_SLIDER_MIN, sliderMax: VARIATION_SLIDER_MAX, showSettings: showVariationPositionSettings, setShowSettings: setShowVariationPositionSettings, setMin: setVariationPositionMin, setMax: setVariationPositionMax, setStep: setVariationPositionStep },
            { key: 'variationShape', label: 'Shape', value: layers?.[0]?.variationShape ?? DEFAULT_LAYER.variationShape, min: variationShapeMin, max: variationShapeMax, step: variationShapeStep, sliderMin: VARIATION_SLIDER_MIN, sliderMax: VARIATION_SLIDER_MAX, showSettings: showVariationShapeSettings, setShowSettings: setShowVariationShapeSettings, setMin: setVariationShapeMin, setMax: setVariationShapeMax, setStep: setVariationShapeStep },
            { key: 'variationAnim', label: 'Animation', value: layers?.[0]?.variationAnim ?? DEFAULT_LAYER.variationAnim, min: variationAnimMin, max: variationAnimMax, step: variationAnimStep, sliderMin: VARIATION_SLIDER_MIN, sliderMax: VARIATION_SLIDER_MAX, showSettings: showVariationAnimSettings, setShowSettings: setShowVariationAnimSettings, setMin: setVariationAnimMin, setMax: setVariationAnimMax, setStep: setVariationAnimStep },
            { key: 'variationColor', label: 'Colour', value: layers?.[0]?.variationColor ?? DEFAULT_LAYER.variationColor, min: variationColorMin, max: variationColorMax, step: variationColorStep, sliderMin: VARIATION_SLIDER_MIN, sliderMax: VARIATION_SLIDER_MAX, showSettings: showVariationColorSettings, setShowSettings: setShowVariationColorSettings, setMin: setVariationColorMin, setMax: setVariationColorMax, setStep: setVariationColorStep },
            { key: 'variationScale', label: 'Scale', value: layers?.[0]?.variationScale ?? DEFAULT_LAYER.variationScale ?? 0, min: variationScaleMin, max: variationScaleMax, step: variationScaleStep, sliderMin: VARIATION_SCALE_SLIDER_MIN, sliderMax: VARIATION_SCALE_SLIDER_MAX, showSettings: showVariationScaleSettings, setShowSettings: setShowVariationScaleSettings, setMin: setVariationScaleMin, setMax: setVariationScaleMax, setStep: setVariationScaleStep },
          ].map(v => (
            <div key={v.key} className="dc-wrap" style={{ marginBottom: '0.4rem' }}>
              <div className="dc-inner">
                <div className="dc-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><span>{v.label}:</span><BufferedNumberInput value={Number(v.value)} min={v.sliderMin} max={v.sliderMax} step={v.step} precision={2} onCommit={(next) => applyVariationValue(v.key, next)} className="dc-value-input" />{renderAutomationBadge(v.key)}</div>
                  <div className="dc-actions" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <label className="compact-label" title={`Include ${v.label} Variation in Randomize All`}><input type="checkbox" checked={!!getIsRnd(v.key)} onChange={(e) => setIsRnd(v.key, e.target.checked)} /> Incl</label>
                    <button type="button" className="icon-btn" onClick={(e) => { e.stopPropagation(); v.setShowSettings(s => !s); }} title={`${v.label} settings`} style={{ padding: '0 0.4rem' }}>⚙</button>
                  </div>
                </div>
                <RangeSlider className="dc-slider" min={v.sliderMin} max={v.sliderMax} step={v.step} value={Number(v.value)} onChange={(e) => applyVariationValue(v.key, parseFloat(e.target.value))} rangeMin={v.min} rangeMax={v.max} onRangeMinChange={v.setMin} onRangeMaxChange={v.setMax} />
                {v.showSettings && (
                  <div className="dc-settings" style={{ marginTop: '0.25rem', padding: '0.5rem', borderRadius: 6, background: 'rgba(255,255,255,0.05)' }}>
                    <div className="compact-row" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                      <span className="compact-label" style={{ opacity: 0.8 }}>MIDI: {midiSupported ? (midiMappings?.[v.key] ? (mappingLabel ? mappingLabel(midiMappings[v.key]) : 'Mapped') : 'Not mapped') : 'Not supported'}</span>
                      {learnParamId === v.key && midiSupported && <span style={{ color: '#4fc3f7' }}>Listening…</span>}
                      <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); beginLearn && beginLearn(v.key); }} disabled={!midiSupported}>Learn</button>
                      <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); clearMapping && clearMapping(v.key); }} disabled={!midiSupported || !midiMappings?.[v.key]}>Clear</button>
                    </div>
                    <AudioControlRow paramId={v.key} />
                    <BPMControlRow paramId={v.key} />
                    <div style={{ display: 'grid', gridTemplateColumns: 'auto 5rem auto 5rem auto 5rem', gap: '0.4rem', alignItems: 'center', marginTop: '0.5rem' }}>
                      <label className="compact-label">Rand Min</label>
                      <BufferedNumberInput value={v.min} step={0.01} min={v.sliderMin} max={v.max} onCommit={v.setMin} className="compact-number" style={{ width: '5rem' }} />
                      <label className="compact-label">{`Rand Max${getOperationalMaxHint(v.key)}`}</label>
                      <BufferedNumberInput value={v.max} step={0.01} min={v.min} max={v.sliderMax} onCommit={v.setMax} className="compact-number" style={{ width: '5rem' }} />
                      <label className="compact-label">Step</label>
                      <BufferedNumberInput value={v.step} step={0.001} min={0.0001} onCommit={(next) => v.setStep(next || 0.01)} className="compact-number" style={{ width: '5rem' }} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Audio/MIDI card */}
      {!hideAudioSections && (
        <div className="control-card">
          <div className="control-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 600 }}>Audio &amp; MIDI</div>
          </div>
          <div style={{ marginTop: '0.5rem' }}>
            <div style={{ marginBottom: '0.4rem' }}>
              <div className="dc-inner">
                <div className="dc-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <div><span>MIDI Input</span></div>
                </div>
                {!midiSupported ? (
                  <div style={{ opacity: 0.7 }}>No Web MIDI</div>
                ) : (
                  <select className="compact-select" value={midiInputId || ''} onChange={(e) => setMidiInputId(e.target.value)}>
                    <option value="">None</option>
                    {(midiInputs || []).map(inp => (<option key={inp.id} value={inp.id}>{inp.name || inp.id}</option>))}
                  </select>
                )}
              </div>
            </div>
            <AudioReactiveSection isActiveTab={isActiveTab} />
            <AudioModulationPresetsSection
              timelineMode={timelineMode}
              layers={layers}
              setEnergyInfluence={setEnergyInfluence}
              setAudioSpawnEnabled={setAudioSpawnEnabled}
              setAudioSpawnUseGlobalPalette={setAudioSpawnUseGlobalPalette}
              setParameterTargetMode={_setParameterTargetMode}
              setLayers={setLayers}
              DEFAULT_LAYER={DEFAULT_LAYER}
              setGlobalSpeedMultiplier={setGlobalSpeedMultiplier}
              setGlobalBlendMode={setGlobalBlendMode}
              setGlobalPaletteIndex={setGlobalPaletteIndex}
              setGlobalPaletteRef={setGlobalPaletteRef}
            />
            <AudioDemoPresetsSection
              isActiveTab={isActiveTab}
              timelineMode={timelineMode}
              layers={layers}
              parameterTargetMode={_parameterTargetMode}
              setParameterTargetMode={_setParameterTargetMode}
              energyInfluence={energyInfluence}
              setEnergyInfluence={setEnergyInfluence}
              audioSpawnEnabled={audioSpawnEnabled}
              setAudioSpawnEnabled={setAudioSpawnEnabled}
              audioSpawnTriggerMode={audioSpawnTriggerMode}
              setAudioSpawnTriggerMode={setAudioSpawnTriggerMode}
              audioSpawnRepeatWhileAbove={audioSpawnRepeatWhileAbove}
              setAudioSpawnRepeatWhileAbove={setAudioSpawnRepeatWhileAbove}
              audioSpawnHysteresis={audioSpawnHysteresis}
              setAudioSpawnHysteresis={setAudioSpawnHysteresis}
              audioSpawnBand={audioSpawnBand}
              setAudioSpawnBand={setAudioSpawnBand}
              audioSpawnThreshold={audioSpawnThreshold}
              setAudioSpawnThreshold={setAudioSpawnThreshold}
              audioSpawnCooldownMs={audioSpawnCooldownMs}
              setAudioSpawnCooldownMs={setAudioSpawnCooldownMs}
              audioSpawnHalfLifeMs={audioSpawnHalfLifeMs}
              setAudioSpawnHalfLifeMs={setAudioSpawnHalfLifeMs}
              audioSpawnHalfLifeEnergyFactor={audioSpawnHalfLifeEnergyFactor}
              setAudioSpawnHalfLifeEnergyFactor={setAudioSpawnHalfLifeEnergyFactor}
              audioSpawnMaxLayers={audioSpawnMaxLayers}
              setAudioSpawnMaxLayers={setAudioSpawnMaxLayers}
              audioSpawnUseGlobalPalette={audioSpawnUseGlobalPalette}
              setAudioSpawnUseGlobalPalette={setAudioSpawnUseGlobalPalette}
            />
            <AudioSpawnSection
              isActiveTab={isActiveTab}
              timelineMode={timelineMode}
              energyInfluence={energyInfluence}
              setEnergyInfluence={setEnergyInfluence}
              audioSpawnEnabled={audioSpawnEnabled}
              setAudioSpawnEnabled={setAudioSpawnEnabled}
              audioSpawnTriggerMode={audioSpawnTriggerMode}
              setAudioSpawnTriggerMode={setAudioSpawnTriggerMode}
              audioSpawnRepeatWhileAbove={audioSpawnRepeatWhileAbove}
              setAudioSpawnRepeatWhileAbove={setAudioSpawnRepeatWhileAbove}
              audioSpawnHysteresis={audioSpawnHysteresis}
              setAudioSpawnHysteresis={setAudioSpawnHysteresis}
              audioSpawnBand={audioSpawnBand}
              setAudioSpawnBand={setAudioSpawnBand}
              audioSpawnThreshold={audioSpawnThreshold}
              setAudioSpawnThreshold={setAudioSpawnThreshold}
              audioSpawnCooldownMs={audioSpawnCooldownMs}
              setAudioSpawnCooldownMs={setAudioSpawnCooldownMs}
              audioSpawnHalfLifeMs={audioSpawnHalfLifeMs}
              setAudioSpawnHalfLifeMs={setAudioSpawnHalfLifeMs}
              audioSpawnHalfLifeEnergyFactor={audioSpawnHalfLifeEnergyFactor}
              setAudioSpawnHalfLifeEnergyFactor={setAudioSpawnHalfLifeEnergyFactor}
              audioSpawnMaxLayers={audioSpawnMaxLayers}
              setAudioSpawnMaxLayers={setAudioSpawnMaxLayers}
              audioSpawnUseGlobalPalette={audioSpawnUseGlobalPalette}
              setAudioSpawnUseGlobalPalette={setAudioSpawnUseGlobalPalette}
            />
            <BPMSection />
          </div>
        </div>
      )}
      {/* Presets & Morph Controls (optional) */}
      {!hidePresets && (
        <PresetControls
          setLayers={setLayers}
          setBackgroundColor={setBackgroundColor}
          setGlobalSpeedMultiplier={setGlobalSpeedMultiplier}
        />
      )}
      {showAutosaveRecovery && (
        <AutosaveRecovery
          slots={autosaveSlots}
          onRestore={handleRestoreAutosave}
          onClearAll={handleClearAutosaves}
          onRefresh={handleRefreshAutosaves}
          onClose={handleCloseAutosaveRecovery}
          message={autosaveMessage}
          error={autosaveError}
        />
      )}
    </div>
  );
};

const isLayerEqualForUI = (a, b) => {
  if (a === b) return true;
  if (!a || !b) return false;
  const ignoreTop = new Set(['position', 'movementAngle', 'orbitAngle', 'spinAngle']);
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  keys.forEach(k => { if (ignoreTop.has(k)) keys.delete(k); });
  for (const key of keys) {
    if (!Object.is(a[key], b[key])) return false;
  }
  const posA = a.position || {};
  const posB = b.position || {};
  const ignorePos = new Set(['x', 'y', 'vx', 'vy', 'scale', 'scaleDirection']);
  const posKeys = new Set([...Object.keys(posA), ...Object.keys(posB)]);
  posKeys.forEach(k => { if (ignorePos.has(k)) posKeys.delete(k); });
  for (const key of posKeys) {
    if (!Object.is(posA[key], posB[key])) return false;
  }
  const ignoreRotation = a.movementStyle === 'spin' || b.movementStyle === 'spin';
  if (!ignoreRotation && !Object.is(a.rotation, b.rotation)) return false;
  return true;
};

const areLayersEqualForUI = (prevLayers, nextLayers) => {
  if (prevLayers === nextLayers) return true;
  if (!Array.isArray(prevLayers) || !Array.isArray(nextLayers)) return false;
  if (prevLayers.length !== nextLayers.length) return false;
  for (let i = 0; i < prevLayers.length; i += 1) {
    if (!isLayerEqualForUI(prevLayers[i], nextLayers[i])) return false;
  }
  return true;
};

// Simple render profiler for the Global tab (opt-in via window.__artapp_debugSettings = true)
const useGlobalRenderDebug = (props) => {
  const debug = isSettingsDebugEnabled();
  const renderCountRef = useRef(0);
  const lastMarkRef = useRef(0);
  useEffect(() => {
    if (!debug) return;
    renderCountRef.current += 1;
    const now = performance.now ? performance.now() : Date.now();
    if (now - lastMarkRef.current > 1000) {
      lastMarkRef.current = now;
      const log = throttledSettingsDebugLog;
      log(`[global-debug] render #${renderCountRef.current}`, {
        layersLen: Array.isArray(props.layers) ? props.layers.length : 'n/a',
        isFrozen: props.isFrozen,
      });
    }
  });
};

const areGlobalPropsEqual = (prev, next) => {
  const debug = isSettingsDebugEnabled();
  const log = throttledSettingsDebugLog;
  const prevBGI = prev.backgroundImage || {};
  const nextBGI = next.backgroundImage || {};
  const diff = (reason) => {
    if (debug) {
      log(`[global-debug] re-render: ${reason}`);
    }
    return false;
  };

  // isActiveTab is only used for visibility, not for rendering content changes
  // Do NOT force re-render just because the tab is active - that causes stutter

  if (prev.backgroundColor !== next.backgroundColor) return diff('backgroundColor');
  if (prev.getIsRnd !== next.getIsRnd) return diff('getIsRnd changed');
  if (prevBGI.enabled !== nextBGI.enabled) return diff('backgroundImage.enabled');
  if (prevBGI.src !== nextBGI.src) return diff('backgroundImage.src');
  if (!Object.is(prevBGI.opacity, nextBGI.opacity)) return diff('backgroundImage.opacity');
  if (prevBGI.fit !== nextBGI.fit) return diff('backgroundImage.fit');
  if (prev.isFrozen !== next.isFrozen) return diff('isFrozen');
  if (!Object.is(prev.energyInfluence, next.energyInfluence)) return diff('energyInfluence');
  if (prev.zIgnore !== next.zIgnore) return diff('zIgnore');
  if (prev.colorFadeWhileFrozen !== next.colorFadeWhileFrozen) return diff('colorFadeWhileFrozen');
  if (prev.syncLayerColorsToFirst !== next.syncLayerColorsToFirst) return diff('syncLayerColorsToFirst');
  if (prev.classicMode !== next.classicMode) return diff('classicMode');
  if (!Object.is(prev.globalSeed, next.globalSeed)) return diff('globalSeed');
  if (!Object.is(prev.globalSpeedMultiplier, next.globalSpeedMultiplier)) return diff('globalSpeedMultiplier');
  if (prev.globalBlendMode !== next.globalBlendMode) return diff('globalBlendMode');
  if (!Object.is(prev.globalPaletteIndex, next.globalPaletteIndex)) return diff('globalPaletteIndex');
  if (prev.midiInputId !== next.midiInputId) return diff('midiInputId');
  if (prev.audioSpawnEnabled !== next.audioSpawnEnabled) return diff('audioSpawnEnabled');
  if (prev.audioSpawnTriggerMode !== next.audioSpawnTriggerMode) return diff('audioSpawnTriggerMode');
  if (prev.audioSpawnRepeatWhileAbove !== next.audioSpawnRepeatWhileAbove) return diff('audioSpawnRepeatWhileAbove');
  if (!Object.is(prev.audioSpawnHysteresis, next.audioSpawnHysteresis)) return diff('audioSpawnHysteresis');
  if (prev.audioSpawnUseGlobalPalette !== next.audioSpawnUseGlobalPalette) return diff('audioSpawnUseGlobalPalette');
  if (prev.audioSpawnBand !== next.audioSpawnBand) return diff('audioSpawnBand');
  if (!Object.is(prev.audioSpawnThreshold, next.audioSpawnThreshold)) return diff('audioSpawnThreshold');
  if (!Object.is(prev.audioSpawnCooldownMs, next.audioSpawnCooldownMs)) return diff('audioSpawnCooldownMs');
  if (!Object.is(prev.audioSpawnHalfLifeMs, next.audioSpawnHalfLifeMs)) return diff('audioSpawnHalfLifeMs');
  if (!Object.is(prev.audioSpawnHalfLifeEnergyFactor, next.audioSpawnHalfLifeEnergyFactor)) return diff('audioSpawnHalfLifeEnergyFactor');
  if (!Object.is(prev.audioSpawnMaxLayers, next.audioSpawnMaxLayers)) return diff('audioSpawnMaxLayers');
  if (prev.parameterTargetMode !== next.parameterTargetMode) return diff('parameterTargetMode');
  if (!areLayersEqualForUI(prev.layers, next.layers)) return diff('layers changed');

  return true;
};

export default React.memo((props) => {
  useGlobalRenderDebug(props);
  return <GlobalControls {...props} />;
}, areGlobalPropsEqual);
