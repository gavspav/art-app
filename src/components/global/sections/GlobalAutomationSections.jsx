import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useMidi } from '../../../context/MidiContext.jsx';
import { useAudioReactive } from '../../../context/AudioContext.jsx';
import { useBPM } from '../../../context/BPMContext.jsx';
import BufferedNumberInput from '../../common/BufferedNumberInput.jsx';
import BPMEnvelopeEditor, { DEFAULT_ENVELOPE } from '../../common/BPMEnvelopeEditor.jsx';
import { AUDIO_MAPPING_MODES, DEFAULT_MODE_SETTINGS } from '../../../utils/audioMappingModes.js';
import {
  MODULATION_PRESETS,
  DEFAULT_MOD_PRESET_ID,
  RESPONSE_PROFILES,
  applyModulationDemoPreset,
} from './AudioModulationPresetsSection.jsx';

const RangeMappingEditor = ({ label, range, band, onRangeChange, onBandChange }) => {
  const [expanded, setExpanded] = useState(false);
  const bands = ['rms', 'bass', 'mids', 'highs', 'pitch', 'transient', 'beat', 'waveformEnergy'];
  
  return (
    <div style={{ marginBottom: '0.5rem', padding: '0.25rem', borderRadius: 4, background: 'rgba(255,255,255,0.03)' }}>
      <div 
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
        onClick={() => setExpanded(e => !e)}
      >
        <span className="compact-label" style={{ fontSize: '0.75rem' }}>{label}</span>
        <span style={{ fontSize: '0.7rem', opacity: 0.6 }}>{expanded ? '▼' : '▶'}</span>
      </div>
      {expanded && (
        <div style={{ marginTop: '0.25rem', paddingLeft: '0.25rem' }}>
          {/* Band selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '0.7rem', opacity: 0.7, width: '2.5rem' }}>Band:</span>
            <select
              className="compact-select"
              style={{ fontSize: '0.7rem', padding: '2px 4px', flex: 1 }}
              value={band}
              onChange={(e) => onBandChange(e.target.value)}
            >
              {bands.map((b) => {
                const label = (
                  b === 'rms' ? 'LEVEL'
                    : b === 'waveformEnergy' ? 'WAVE ENERGY'
                    : b.toUpperCase()
                );
                return <option key={b} value={b}>{label}</option>;
              })}
            </select>
          </div>
          {/* Input range (audio level threshold) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '0.7rem', opacity: 0.7, width: '2.5rem' }}>In:</span>
            <input
              type="number"
              step="0.05"
              min="0"
              max="1"
              value={range.inputMin}
              onChange={(e) => onRangeChange({ inputMin: parseFloat(e.target.value) || 0 })}
              style={{ width: '3rem', fontSize: '0.7rem', padding: '2px 4px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 3, color: 'white' }}
            />
            <span style={{ fontSize: '0.7rem', opacity: 0.5 }}>→</span>
            <input
              type="number"
              step="0.05"
              min="0"
              max="1"
              value={range.inputMax}
              onChange={(e) => onRangeChange({ inputMax: parseFloat(e.target.value) || 1 })}
              style={{ width: '3rem', fontSize: '0.7rem', padding: '2px 4px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 3, color: 'white' }}
            />
          </div>
          {/* Output range (parameter value) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.7rem', opacity: 0.7, width: '2.5rem' }}>Out:</span>
            <input
              type="number"
              step="0.1"
              value={range.outputMin}
              onChange={(e) => onRangeChange({ outputMin: parseFloat(e.target.value) || 0 })}
              style={{ width: '3rem', fontSize: '0.7rem', padding: '2px 4px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 3, color: 'white' }}
            />
            <span style={{ fontSize: '0.7rem', opacity: 0.5 }}>→</span>
            <input
              type="number"
              step="0.1"
              value={range.outputMax}
              onChange={(e) => onRangeChange({ outputMax: parseFloat(e.target.value) || 1 })}
              style={{ width: '3rem', fontSize: '0.7rem', padding: '2px 4px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 3, color: 'white' }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

const createMapping = (band, outputMin, outputMax, mode = 'direct', modeSettings = null) => {
  const mapping = {
    band,
    range: { outputMin, outputMax },
  };
  if (mode && mode !== 'direct') mapping.mode = mode;
  if (modeSettings && typeof modeSettings === 'object') mapping.modeSettings = modeSettings;
  return mapping;
};

const clampValue = (value, min, max) => Math.max(min, Math.min(max, value));

const DEFAULT_MATRIX_TRIGGER = {
  enabled: false,
  source: 'processed',
  mode: 'crossUp',
  riseThreshold: 0.65,
  fallThreshold: 0.55,
  cooldownMs: 250,
  reverseOnFall: false,
  action: 'modulate',
};

const normalizeMatrixTrigger = (trigger, defaults = DEFAULT_MATRIX_TRIGGER) => {
  const base = {
    ...DEFAULT_MATRIX_TRIGGER,
    ...(defaults && typeof defaults === 'object' ? defaults : {}),
  };
  if (!trigger || typeof trigger !== 'object') return base;
  const rise = clampValue(Number.isFinite(Number(trigger.riseThreshold)) ? Number(trigger.riseThreshold) : base.riseThreshold, 0, 1);
  const fallCandidate = Number.isFinite(Number(trigger.fallThreshold)) ? Number(trigger.fallThreshold) : base.fallThreshold;
  const VALID_ACTIONS = ['modulate', 'addLayer', 'randomize', 'increase', 'decrease'];
  return {
    enabled: !!trigger.enabled,
    source: (trigger.source === 'raw' || trigger.source === 'processed') ? trigger.source : base.source,
    mode: ['crossUp', 'crossDown', 'both', 'whileAbove'].includes(trigger.mode) ? trigger.mode : base.mode,
    riseThreshold: rise,
    fallThreshold: clampValue(fallCandidate, 0, rise),
    cooldownMs: Math.max(0, Number.isFinite(Number(trigger.cooldownMs)) ? Number(trigger.cooldownMs) : base.cooldownMs),
    reverseOnFall: !!trigger.reverseOnFall,
    action: VALID_ACTIONS.includes(trigger.action) ? trigger.action : (base.action || 'modulate'),
  };
};

const createTriggerConfig = (overrides = {}) => normalizeMatrixTrigger({
  ...DEFAULT_MATRIX_TRIGGER,
  enabled: true,
  ...(overrides && typeof overrides === 'object' ? overrides : {}),
});

const createTriggerMapping = (
  band,
  outputMin,
  outputMax,
  trigger,
  mode = 'direct',
  modeSettings = null,
) => ({
  ...createMapping(band, outputMin, outputMax, mode, modeSettings),
  trigger: createTriggerConfig(trigger),
});

const DEMO_PUNCH_NO_RANGE_SCALE_PARAM_IDS = new Set([
  'globalBlendMode',
  'globalPaletteIndex',
  'randomizeAll',
  'triggerPaletteStep',
  'triggerSpawnLayer',
]);

const scaleIfFinite = (value, mapper) => (
  Number.isFinite(Number(value)) ? mapper(Number(value)) : value
);

const scaleMappingRangeForDemo = (paramId, range, multiplier = 1.32) => {
  if (!range || typeof range !== 'object') return range;
  const rawMin = Number(range.outputMin);
  const rawMax = Number(range.outputMax);
  if (!Number.isFinite(rawMin) || !Number.isFinite(rawMax) || rawMin === rawMax) {
    return { ...range };
  }

  if (DEMO_PUNCH_NO_RANGE_SCALE_PARAM_IDS.has(paramId)) {
    return { ...range, outputMin: rawMin, outputMax: rawMax };
  }

  const center = (rawMin + rawMax) / 2;
  const halfSpan = Math.max(1e-3, ((rawMax - rawMin) / 2) * multiplier);
  let outputMin = center - halfSpan;
  let outputMax = center + halfSpan;

  switch (paramId) {
    case 'globalOpacity':
      outputMin = clampValue(outputMin, 0.15, 1);
      outputMax = clampValue(outputMax, 0.2, 1);
      break;
    case 'layersCount':
      outputMin = clampValue(outputMin, 1, 36);
      outputMax = clampValue(outputMax, 2, 40);
      break;
    case 'globalSpeedMultiplier':
      outputMin = clampValue(outputMin, 0.25, 4);
      outputMax = clampValue(outputMax, 0.4, 4.2);
      break;
    case 'variationScale':
      outputMin = clampValue(outputMin, -1.2, 4);
      outputMax = clampValue(outputMax, -0.1, 4.2);
      break;
    case 'variationShape':
    case 'variationAnim':
    case 'variationColor':
    case 'variationPosition':
      outputMin = clampValue(outputMin, -0.2, 3.6);
      outputMax = clampValue(outputMax, 0.2, 4.2);
      break;
    case 'triggerMovementPulse':
      outputMin = clampValue(outputMin, 0.75, 4);
      outputMax = clampValue(outputMax, 1.1, 4.8);
      break;
    default:
      break;
  }

  if (outputMin >= outputMax) {
    const mid = (outputMin + outputMax) / 2;
    outputMin = mid - 0.001;
    outputMax = mid + 0.001;
  }

  return {
    ...range,
    outputMin,
    outputMax,
  };
};

const tuneModeSettingsForDemo = (mode, modeSettings) => {
  if (!modeSettings || typeof modeSettings !== 'object') return modeSettings;
  const tuned = { ...modeSettings };

  if (mode === 'runningAvg') {
    if (Number.isFinite(Number(tuned.windowSeconds))) {
      tuned.windowSeconds = clampValue(Number(tuned.windowSeconds) * 0.72, 0.35, 12);
    }
  } else if (mode === 'leaky') {
    if (Number.isFinite(Number(tuned.rate))) {
      tuned.rate = clampValue(Number(tuned.rate) * 1.35, 0.005, 0.25);
    }
    if (Number.isFinite(Number(tuned.decay))) {
      tuned.decay = clampValue(Number(tuned.decay) - 0.003, 0.94, 0.9995);
    }
  } else if (mode === 'onsetDrift') {
    if (Number.isFinite(Number(tuned.threshold))) {
      tuned.threshold = clampValue(Number(tuned.threshold) * 0.93, 1.05, 2.4);
    }
    if (Number.isFinite(Number(tuned.driftSpeed))) {
      tuned.driftSpeed = clampValue(Number(tuned.driftSpeed) * 1.22, 0.02, 0.4);
    }
  } else if (mode === 'hysteresis') {
    if (Number.isFinite(Number(tuned.lerpSpeed))) {
      tuned.lerpSpeed = clampValue(Number(tuned.lerpSpeed) * 1.35, 0.01, 0.25);
    }
  }

  return tuned;
};

const buildPunchierDemoPreset = (preset) => {
  if (!preset || typeof preset !== 'object') return preset;

  const audioSettings = (preset.audioSettings && typeof preset.audioSettings === 'object')
    ? { ...preset.audioSettings }
    : {};

  const tunedAudioSettings = {
    ...audioSettings,
    sensitivity: scaleIfFinite(audioSettings.sensitivity, (value) => clampValue(value * 1.18, 0.35, 3)),
    bassSensitivity: scaleIfFinite(audioSettings.bassSensitivity, (value) => clampValue(value * 1.18, 0.35, 3)),
    midsSensitivity: scaleIfFinite(audioSettings.midsSensitivity, (value) => clampValue(value * 1.2, 0.35, 3)),
    highsSensitivity: scaleIfFinite(audioSettings.highsSensitivity, (value) => clampValue(value * 1.22, 0.35, 3)),
    smoothing: scaleIfFinite(audioSettings.smoothing, (value) => clampValue(value - 0.1, 0.45, 0.9)),
    release: scaleIfFinite(audioSettings.release, (value) => clampValue(value - 0.08, 0.55, 0.97)),
  };

  const spawn = (preset.spawn && typeof preset.spawn === 'object')
    ? { ...preset.spawn }
    : {};

  const tunedSpawn = {
    ...spawn,
    threshold: scaleIfFinite(spawn.threshold, (value) => clampValue(value * 0.84, 0.08, 0.75)),
    cooldownMs: scaleIfFinite(spawn.cooldownMs, (value) => Math.round(clampValue(value * 0.78, 90, 2000))),
    halfLifeMs: scaleIfFinite(spawn.halfLifeMs, (value) => Math.round(clampValue(value * 0.82, 900, 9000))),
    halfLifeEnergyFactor: scaleIfFinite(spawn.halfLifeEnergyFactor, (value) => clampValue(value * 1.2, 0.6, 3.2)),
    hysteresis: scaleIfFinite(spawn.hysteresis, (value) => clampValue(value * 0.85, 0.03, 0.22)),
    maxLayers: scaleIfFinite(spawn.maxLayers, (value) => Math.round(clampValue(value * 1.18, 12, 42))),
  };

  const sourceMappings = (preset.mappings && typeof preset.mappings === 'object') ? preset.mappings : {};
  const tunedMappings = Object.entries(sourceMappings).reduce((acc, [paramId, mapping]) => {
    if (!mapping || typeof mapping !== 'object') return acc;
    const mode = mapping.mode || 'direct';
    const nextRange = scaleMappingRangeForDemo(paramId, mapping.range, 1.32);
    acc[paramId] = {
      ...mapping,
      ...(nextRange ? { range: nextRange } : {}),
      ...(mapping.modeSettings && typeof mapping.modeSettings === 'object'
        ? { modeSettings: tuneModeSettingsForDemo(mode, mapping.modeSettings) }
        : {}),
    };
    return acc;
  }, {});

  return {
    ...preset,
    audioSettings: tunedAudioSettings,
    spawn: tunedSpawn,
    energyInfluence: Number.isFinite(Number(preset.energyInfluence))
      ? clampValue(Number(preset.energyInfluence) * 1.18, 0.2, 3)
      : preset.energyInfluence,
    mappings: tunedMappings,
  };
};

const quantile = (values, q) => {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = clampValue((sorted.length - 1) * q, 0, sorted.length - 1);
  const base = Math.floor(pos);
  const rest = pos - base;
  const lower = sorted[base];
  const upper = sorted[Math.min(base + 1, sorted.length - 1)];
  return lower + (upper - lower) * rest;
};

const PITCH_NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const pitchToNoteLabel = (hz) => {
  const frequency = Number(hz);
  if (!Number.isFinite(frequency) || frequency <= 0) return 'No stable pitch';
  const midi = 69 + (12 * Math.log2(frequency / 440));
  const rounded = Math.round(midi);
  const noteName = PITCH_NOTE_NAMES[((rounded % 12) + 12) % 12];
  const octave = Math.floor(rounded / 12) - 1;
  const cents = Math.round((midi - rounded) * 100);
  const centsLabel = `${cents >= 0 ? '+' : ''}${cents}c`;
  return `${noteName}${octave} (${centsLabel})`;
};

const AUDIO_DEMO_PRESETS = [
  {
    id: 'cinematic-slow-bloom',
    name: 'Cinematic Slow Bloom',
    summary: 'Very slow, overlap-friendly evolution with soft long-memory response and minimal jitter.',
    recommendedInput: 'Ambient, drones, neo-classical, cinematic underscoring.',
    audioSettings: {
      sensitivity: 1.05,
      bassSensitivity: 0.95,
      midsSensitivity: 1.0,
      highsSensitivity: 0.6,
      smoothing: 0.9,
      release: 0.97,
    },
    energyInfluence: 0.55,
    spawn: {
      enabled: true,
      triggerMode: 'level',
      repeatWhileAbove: true,
      hysteresis: 0.16,
      band: 'rms',
      threshold: 0.5,
      cooldownMs: 1200,
      halfLifeMs: 8200,
      halfLifeEnergyFactor: 0.7,
      maxLayers: 22,
      useGlobalPalette: true,
    },
    mappings: {
      globalSpeedMultiplier: createMapping('rms', 0.45, 1.05, 'runningAvg', { windowSeconds: 12 }),
      variationShape: createMapping('mids', 0.05, 1.4, 'runningAvg', { windowSeconds: 9 }),
      variationColor: createMapping('highs', 0.08, 1.2, 'runningAvg', { windowSeconds: 11 }),
      variationAnim: createMapping('mids', 0.08, 1.1, 'leaky', { rate: 0.01, decay: 0.999, restValue: 0.2 }),
      variationScale: createMapping('bass', -0.05, 0.6, 'runningAvg', { windowSeconds: 9 }),
      layersCount: createMapping('rms', 4, 11, 'runningAvg', { windowSeconds: 10 }),
    },
  },
  {
    id: 'ambient-bloom',
    name: 'Ambient Bloom',
    summary: 'Slow cinematic growth with long-memory motion and gentle colour drift.',
    recommendedInput: 'Ambient music, pads, drones, soft voice.',
    audioSettings: { sensitivity: 1.1, smoothing: 0.86, release: 0.93 },
    energyInfluence: 0.75,
    spawn: {
      enabled: true,
      triggerMode: 'level',
      repeatWhileAbove: true,
      hysteresis: 0.1,
      band: 'mids',
      threshold: 0.38,
      cooldownMs: 900,
      halfLifeMs: 4200,
      halfLifeEnergyFactor: 1.8,
      maxLayers: 18,
      useGlobalPalette: true,
    },
    mappings: {
      globalSpeedMultiplier: createMapping('rms', 0.55, 1.4, 'runningAvg', { windowSeconds: 7 }),
      globalOpacity: createMapping('rms', 0.45, 0.95, 'runningAvg', { windowSeconds: 4 }),
      variationShape: createMapping('mids', 0.1, 1.8, 'runningAvg', { windowSeconds: 6 }),
      variationColor: createMapping('highs', 0.2, 2.4, 'leaky', { rate: 0.03, decay: 0.997, restValue: 0.35 }),
      layersCount: createMapping('rms', 3, 12, 'runningAvg', { windowSeconds: 8 }),
    },
  },
  {
    id: 'percussive-geometry',
    name: 'Percussive Geometry',
    summary: 'Tight rhythmic response for drums and transient-heavy tracks.',
    recommendedInput: 'Drums, breakbeats, percussive loops.',
    audioSettings: { sensitivity: 1.45, smoothing: 0.65, release: 0.72 },
    energyInfluence: 1.35,
    spawn: {
      enabled: true,
      triggerMode: 'transient',
      repeatWhileAbove: false,
      hysteresis: 0.08,
      band: 'bass',
      threshold: 0.24,
      cooldownMs: 140,
      halfLifeMs: 1700,
      halfLifeEnergyFactor: 1.4,
      maxLayers: 26,
      useGlobalPalette: false,
    },
    mappings: {
      globalSpeedMultiplier: createMapping('mids', 0.8, 2.8),
      variationShape: createMapping('bass', 0.6, 3),
      variationAnim: createMapping('highs', 0.2, 3, 'onsetDrift', { threshold: 1.4, minLevel: 0.12, driftSpeed: 0.09 }),
      variationScale: createMapping('bass', -0.4, 3),
      globalBlendMode: createMapping('highs', 0, 1, 'runningAvg', { windowSeconds: 5.5 }),
    },
  },
  {
    id: 'bass-reactor',
    name: 'Bass Reactor',
    summary: 'Low-end energy drives scale, speed, density, and heavy pulse behavior.',
    recommendedInput: 'Bass-heavy electronic, hip-hop, sub-focused tracks.',
    audioSettings: { sensitivity: 1.35, smoothing: 0.75, release: 0.88 },
    energyInfluence: 1.2,
    spawn: {
      enabled: true,
      triggerMode: 'level',
      repeatWhileAbove: true,
      hysteresis: 0.12,
      band: 'bass',
      threshold: 0.46,
      cooldownMs: 220,
      halfLifeMs: 2400,
      halfLifeEnergyFactor: 2,
      maxLayers: 22,
      useGlobalPalette: true,
    },
    mappings: {
      globalSpeedMultiplier: createMapping('bass', 0.5, 2.2, 'leaky', { rate: 0.06, decay: 0.992, restValue: 0.3 }),
      globalOpacity: createMapping('bass', 0.35, 1),
      variationScale: createMapping('bass', -0.5, 3),
      variationAnim: createMapping('mids', 0.2, 2.4, 'leaky', { rate: 0.04, decay: 0.996, restValue: 0.25 }),
      layersCount: createMapping('bass', 2, 15, 'runningAvg', { windowSeconds: 3.5 }),
    },
  },
  {
    id: 'band-weave',
    name: 'Band Weave',
    summary: 'Cross-band interactions create woven motion and evolving spectral texture.',
    recommendedInput: 'Layered synths, busy mid/high content, textured sound design.',
    audioSettings: { sensitivity: 1.2, smoothing: 0.8, release: 0.86 },
    energyInfluence: 1,
    spawn: {
      enabled: true,
      triggerMode: 'level',
      repeatWhileAbove: true,
      hysteresis: 0.09,
      band: 'highs',
      threshold: 0.34,
      cooldownMs: 320,
      halfLifeMs: 2100,
      halfLifeEnergyFactor: 1.1,
      maxLayers: 16,
      useGlobalPalette: false,
    },
    mappings: {
      globalSpeedMultiplier: createMapping('rms', 0.6, 2, 'runningAvg', { windowSeconds: 4 }),
      variationPosition: createMapping('mids', 0.2, 3, 'bandRatio', { numerator: 'mids', denominator: 'highs', scale: 2.2 }),
      variationColor: createMapping('highs', 0, 3, 'accumulate', { rate: 0.035, wrap: true }),
      variationAnim: createMapping('mids', 0.4, 2.8, 'leaky', { rate: 0.05, decay: 0.996, restValue: 0.4 }),
      globalPaletteIndex: createMapping('highs', 0, 1, 'runningAvg', { windowSeconds: 5 }),
    },
  },
  {
    id: 'vocal-nebula',
    name: 'Vocal Nebula',
    summary: 'Voice-responsive clouds with articulation-driven colour and animation drift.',
    recommendedInput: 'Microphone speech, vocals, spoken word.',
    audioSettings: { sensitivity: 1.7, smoothing: 0.72, release: 0.9 },
    energyInfluence: 1.45,
    spawn: {
      enabled: true,
      triggerMode: 'transient',
      repeatWhileAbove: false,
      hysteresis: 0.06,
      band: 'highs',
      threshold: 0.18,
      cooldownMs: 180,
      halfLifeMs: 1800,
      halfLifeEnergyFactor: 1.3,
      maxLayers: 24,
      useGlobalPalette: true,
    },
    mappings: {
      globalSpeedMultiplier: createMapping('rms', 0.6, 1.8, 'runningAvg', { windowSeconds: 2 }),
      globalOpacity: createMapping('rms', 0.4, 1, 'hysteresis', {
        quietToMed: 0.18,
        medToLoud: 0.45,
        loudToMed: 0.3,
        medToQuiet: 0.1,
        lerpSpeed: 0.02,
        quietValue: 0.45,
        medValue: 0.75,
        loudValue: 1,
      }),
      variationShape: createMapping('mids', 0.1, 2.6, 'onsetDrift', { threshold: 1.35, minLevel: 0.09, driftSpeed: 0.06 }),
      variationColor: createMapping('highs', 0.5, 3, 'leaky', { rate: 0.045, decay: 0.995, restValue: 0.25 }),
      layersCount: createMapping('rms', 2, 14, 'runningAvg', { windowSeconds: 3 }),
    },
  },
  {
    id: 'mic-waveform-stream',
    name: 'Mic Waveform Stream',
    summary: 'Level-gated mic stream where waveform contours bend geometry and pitch paints colour.',
    recommendedInput: 'Close mic speech/singing, beatboxing, breath/noise textures.',
    audioSettings: {
      sensitivity: 2.0,
      bassSensitivity: 1.0,
      midsSensitivity: 1.45,
      highsSensitivity: 1.3,
      smoothing: 0.7,
      release: 0.86,
    },
    energyInfluence: 1.4,
    spawn: {
      enabled: true,
      triggerMode: 'level',
      repeatWhileAbove: true,
      hysteresis: 0.06,
      band: 'rms',
      threshold: 0.2,
      cooldownMs: 90,
      halfLifeMs: 2400,
      halfLifeEnergyFactor: 1.4,
      maxLayers: 32,
      useGlobalPalette: false,
      micReactive: true,
    },
    mappings: {
      globalSpeedMultiplier: createMapping('rms', 0.5, 1.9, 'runningAvg', { windowSeconds: 1.8 }),
      variationShape: createMapping('mids', 0.15, 2.6, 'runningAvg', { windowSeconds: 2.2 }),
      variationAnim: createMapping('highs', 0.18, 2.8, 'onsetDrift', { threshold: 1.28, minLevel: 0.08, driftSpeed: 0.085 }),
      variationScale: createMapping('rms', -0.2, 2.5, 'leaky', { rate: 0.04, decay: 0.995, restValue: 0.2 }),
      layersCount: createMapping('rms', 2, 16, 'runningAvg', { windowSeconds: 2.6 }),
    },
  },
  {
    id: 'mic-pitch-tunnel',
    name: 'Mic Pitch Tunnel',
    summary: 'Pitch-coloured waveform shards drift toward a vanishing point while decaying like depth trails.',
    recommendedInput: 'Sustained vowels, humming, monophonic singing, whistle tones.',
    audioSettings: {
      sensitivity: 1.85,
      bassSensitivity: 0.95,
      midsSensitivity: 1.55,
      highsSensitivity: 1.25,
      smoothing: 0.76,
      release: 0.9,
    },
    energyInfluence: 1.2,
    spawn: {
      enabled: true,
      triggerMode: 'level',
      repeatWhileAbove: true,
      hysteresis: 0.07,
      band: 'mids',
      threshold: 0.24,
      cooldownMs: 120,
      halfLifeMs: 3000,
      halfLifeEnergyFactor: 1.25,
      maxLayers: 28,
      useGlobalPalette: false,
      micReactive: true,
    },
    mappings: {
      globalOpacity: createMapping('rms', 0.35, 1, 'runningAvg', { windowSeconds: 2.4 }),
      globalSpeedMultiplier: createMapping('mids', 0.45, 1.7, 'leaky', { rate: 0.03, decay: 0.996, restValue: 0.3 }),
      variationColor: createMapping('highs', 0.25, 2.8, 'runningAvg', { windowSeconds: 1.9 }),
      variationPosition: createMapping('mids', 0.1, 2.3, 'runningAvg', { windowSeconds: 2.8 }),
      layersCount: createMapping('rms', 2, 12, 'hysteresis', {
        quietToMed: 0.12,
        medToLoud: 0.32,
        loudToMed: 0.22,
        medToQuiet: 0.08,
        lerpSpeed: 0.03,
        quietValue: 0.15,
        medValue: 0.5,
        loudValue: 1,
      }),
    },
  },
  {
    id: 'mic-consonant-bursts',
    name: 'Mic Consonant Bursts',
    summary: 'Consonant spikes (t/k/s/ch/f) fire dense transient bursts with fast-decay depth trails.',
    recommendedInput: 'Speech consonants, beatbox clicks, whispered plosives, fast spoken phrases.',
    audioSettings: {
      sensitivity: 2.3,
      bassSensitivity: 0.95,
      midsSensitivity: 1.85,
      highsSensitivity: 2.35,
      smoothing: 0.54,
      release: 0.68,
    },
    energyInfluence: 1.75,
    spawn: {
      enabled: true,
      triggerMode: 'transient',
      repeatWhileAbove: false,
      hysteresis: 0.05,
      band: 'highs',
      threshold: 0.08,
      cooldownMs: 85,
      halfLifeMs: 1250,
      halfLifeEnergyFactor: 1.55,
      maxLayers: 38,
      useGlobalPalette: false,
      micReactive: true,
    },
    mappings: {
      globalSpeedMultiplier: createMapping('highs', 0.75, 2.85, 'onsetDrift', {
        threshold: 1.12,
        minLevel: 0.04,
        driftSpeed: 0.16,
      }),
      variationAnim: createMapping('highs', 0.28, 3, 'onsetDrift', {
        threshold: 1.08,
        minLevel: 0.04,
        driftSpeed: 0.18,
      }),
      variationShape: createMapping('mids', 0.2, 2.8, 'leaky', {
        rate: 0.08,
        decay: 0.989,
        restValue: 0.16,
      }),
      variationScale: createMapping('rms', -0.45, 3),
      layersCount: createMapping('highs', 2, 18, 'hysteresis', {
        quietToMed: 0.08,
        medToLoud: 0.24,
        loudToMed: 0.18,
        medToQuiet: 0.06,
        lerpSpeed: 0.05,
        quietValue: 0.12,
        medValue: 0.5,
        loudValue: 1,
      }),
    },
  },
  {
    id: 'clap-trigger-fx',
    name: 'Clap Trigger FX',
    summary: 'Transient gating with occasional scene jolts for live performance moments.',
    recommendedInput: 'Claps, snaps, taps, staccato vocal sounds.',
    audioSettings: { sensitivity: 2.2, smoothing: 0.55, release: 0.6 },
    energyInfluence: 1.6,
    spawn: {
      enabled: true,
      triggerMode: 'transient',
      repeatWhileAbove: false,
      hysteresis: 0.06,
      band: 'highs',
      threshold: 0.12,
      cooldownMs: 420,
      halfLifeMs: 1400,
      halfLifeEnergyFactor: 1.6,
      maxLayers: 28,
      useGlobalPalette: false,
    },
    mappings: {
      globalSpeedMultiplier: createMapping('rms', 0.7, 2.4),
      variationAnim: createMapping('bass', 0, 3),
      variationColor: createMapping('highs', 0.2, 3),
      globalBlendMode: createMapping('highs', 0, 1, 'runningAvg', { windowSeconds: 5.5 }),
      randomizeAll: createMapping('highs', 0, 1, 'hysteresis', {
        quietToMed: 0.32,
        medToLoud: 0.62,
        loudToMed: 0.48,
        medToQuiet: 0.2,
        lerpSpeed: 0.08,
        quietValue: 0,
        medValue: 0.35,
        loudValue: 1,
      }),
    },
  },
  {
    id: 'whisper-to-storm',
    name: 'Whisper to Storm',
    summary: 'Quiet passages stay sparse, loud passages rapidly build visual complexity.',
    recommendedInput: 'Dynamic songs, distance-to-mic demos, whispers/shouts.',
    audioSettings: { sensitivity: 1.8, smoothing: 0.68, release: 0.93 },
    energyInfluence: 1.8,
    spawn: {
      enabled: true,
      triggerMode: 'level',
      repeatWhileAbove: true,
      hysteresis: 0.05,
      band: 'rms',
      threshold: 0.26,
      cooldownMs: 180,
      halfLifeMs: 1500,
      halfLifeEnergyFactor: 1.8,
      maxLayers: 30,
      useGlobalPalette: true,
    },
    mappings: {
      globalSpeedMultiplier: createMapping('rms', 0.5, 3.2, 'leaky', { rate: 0.04, decay: 0.996, restValue: 0.25 }),
      globalOpacity: createMapping('rms', 0.25, 1),
      layersCount: createMapping('rms', 2, 20, 'hysteresis', {
        quietToMed: 0.12,
        medToLoud: 0.35,
        loudToMed: 0.25,
        medToQuiet: 0.08,
        lerpSpeed: 0.02,
        quietValue: 0.05,
        medValue: 0.45,
        loudValue: 1,
      }),
      variationScale: createMapping('rms', -0.4, 3),
      variationColor: createMapping('highs', 0.2, 3),
    },
  },
  {
    id: 'echo-memory-trails',
    name: 'Echo Memory Trails',
    summary: 'Long-window averaging creates delayed echoes and layered temporal memory.',
    recommendedInput: 'Slowly changing tracks, evolving textures, cinematic passages.',
    audioSettings: { sensitivity: 1.25, smoothing: 0.78, release: 0.95 },
    energyInfluence: 0.9,
    spawn: {
      enabled: true,
      triggerMode: 'level',
      repeatWhileAbove: true,
      hysteresis: 0.1,
      band: 'mids',
      threshold: 0.3,
      cooldownMs: 650,
      halfLifeMs: 5200,
      halfLifeEnergyFactor: 2.4,
      maxLayers: 34,
      useGlobalPalette: true,
    },
    mappings: {
      globalSpeedMultiplier: createMapping('rms', 0.45, 1.35, 'runningAvg', { windowSeconds: 10 }),
      globalOpacity: createMapping('rms', 0.3, 0.95, 'leaky', { rate: 0.02, decay: 0.999, restValue: 0.45 }),
      variationPosition: createMapping('mids', 0.2, 3, 'runningAvg', { windowSeconds: 8 }),
      variationAnim: createMapping('highs', 0.3, 2.8, 'runningAvg', { windowSeconds: 6 }),
      variationColor: createMapping('highs', 0.2, 2.6, 'leaky', { rate: 0.02, decay: 0.9985, restValue: 0.3 }),
    },
  },
  {
    id: 'harmonic-rings',
    name: 'Harmonic Rings',
    summary: 'Spectral-ratio motion that feels tonal and ring-like without pitch tracking.',
    recommendedInput: 'Melodic material, chords, sustained harmonics.',
    audioSettings: { sensitivity: 1.4, smoothing: 0.82, release: 0.9 },
    energyInfluence: 1.1,
    spawn: {
      enabled: true,
      triggerMode: 'transient',
      repeatWhileAbove: false,
      hysteresis: 0.08,
      band: 'mids',
      threshold: 0.22,
      cooldownMs: 260,
      halfLifeMs: 2200,
      halfLifeEnergyFactor: 1.2,
      maxLayers: 18,
      useGlobalPalette: false,
    },
    mappings: {
      globalSpeedMultiplier: createMapping('rms', 0.7, 2, 'runningAvg', { windowSeconds: 3 }),
      variationShape: createMapping('bass', 0.2, 3, 'bandRatio', { numerator: 'bass', denominator: 'mids', scale: 2.8 }),
      variationPosition: createMapping('highs', 0.2, 3, 'bandRatio', { numerator: 'highs', denominator: 'bass', scale: 2.6 }),
      variationColor: createMapping('highs', 0.3, 3, 'onsetDrift', { threshold: 1.25, minLevel: 0.08, driftSpeed: 0.045 }),
      layersCount: createMapping('mids', 3, 14, 'runningAvg', { windowSeconds: 4 }),
    },
  },
  {
    id: 'silence-rebirth',
    name: 'Silence Rebirth',
    summary: 'Calm idle behavior with gradual regrowth, then stronger re-entry on new onsets.',
    recommendedInput: 'Installations, speech pauses, tracks with clear breaks.',
    audioSettings: { sensitivity: 1.1, smoothing: 0.9, release: 0.97 },
    energyInfluence: 0.45,
    spawn: {
      enabled: true,
      triggerMode: 'transient',
      repeatWhileAbove: false,
      hysteresis: 0.14,
      band: 'rms',
      threshold: 0.35,
      cooldownMs: 900,
      halfLifeMs: 6500,
      halfLifeEnergyFactor: 0.8,
      maxLayers: 12,
      useGlobalPalette: true,
    },
    mappings: {
      globalSpeedMultiplier: createMapping('rms', 0.35, 1.8, 'hysteresis', {
        quietToMed: 0.16,
        medToLoud: 0.4,
        loudToMed: 0.28,
        medToQuiet: 0.1,
        lerpSpeed: 0.012,
        quietValue: 0.08,
        medValue: 0.45,
        loudValue: 0.9,
      }),
      globalOpacity: createMapping('rms', 0.35, 1, 'hysteresis', {
        quietToMed: 0.15,
        medToLoud: 0.38,
        loudToMed: 0.27,
        medToQuiet: 0.1,
        lerpSpeed: 0.012,
        quietValue: 1,
        medValue: 0.7,
        loudValue: 0.45,
      }),
      variationAnim: createMapping('mids', 0.1, 2.2, 'leaky', { rate: 0.025, decay: 0.999, restValue: 0.2 }),
      variationColor: createMapping('highs', 0.1, 2.2, 'runningAvg', { windowSeconds: 9 }),
      layersCount: createMapping('rms', 2, 10, 'runningAvg', { windowSeconds: 8 }),
    },
  },
  {
    id: 'threshold-palette-pulse',
    name: 'Threshold Palette Pulse',
    summary: 'High crossings step palettes, spawn bursts, and hit movement pulses with reversible releases.',
    recommendedInput: 'Drums, claps, bright percussion, fast transient material.',
    audioSettings: {
      sensitivity: 1.9,
      bassSensitivity: 1.2,
      midsSensitivity: 1.35,
      highsSensitivity: 2.0,
      smoothing: 0.64,
      release: 0.76,
    },
    energyInfluence: 1.55,
    spawn: {
      enabled: true,
      triggerMode: 'transient',
      repeatWhileAbove: false,
      hysteresis: 0.06,
      band: 'highs',
      threshold: 0.16,
      cooldownMs: 150,
      halfLifeMs: 1700,
      halfLifeEnergyFactor: 1.55,
      maxLayers: 28,
      useGlobalPalette: true,
    },
    mappings: {
      globalSpeedMultiplier: createMapping('rms', 0.72, 2.55, 'runningAvg', { windowSeconds: 2.1 }),
      variationAnim: createMapping('mids', 0.24, 2.7, 'onsetDrift', { threshold: 1.28, minLevel: 0.09, driftSpeed: 0.09 }),
      variationColor: createMapping('highs', 0.35, 3),
      triggerPaletteStep: createTriggerMapping('highs', 0, 1, {
        source: 'raw',
        mode: 'both',
        riseThreshold: 0.7,
        fallThreshold: 0.54,
        cooldownMs: 190,
        reverseOnFall: false,
      }),
      triggerSpawnLayer: createTriggerMapping('highs', 0, 1, {
        source: 'raw',
        mode: 'both',
        riseThreshold: 0.72,
        fallThreshold: 0.52,
        cooldownMs: 150,
        reverseOnFall: true,
      }),
      triggerMovementPulse: createTriggerMapping(
        'bass',
        0.95,
        3.2,
        {
          source: 'processed',
          mode: 'both',
          riseThreshold: 0.58,
          fallThreshold: 0.4,
          cooldownMs: 180,
          reverseOnFall: true,
        },
        'runningAvg',
        { windowSeconds: 0.9 },
      ),
    },
  },
  {
    id: 'bass-rebound-driver',
    name: 'Bass Rebound Driver',
    summary: 'Kick peaks drive hard movement pulses and spawn; down-crossings rewind palette and restore speed.',
    recommendedInput: 'Bass-heavy club tracks, hip-hop, halftime drums.',
    audioSettings: {
      sensitivity: 1.55,
      bassSensitivity: 1.5,
      midsSensitivity: 1.15,
      highsSensitivity: 1.0,
      smoothing: 0.7,
      release: 0.82,
    },
    energyInfluence: 1.4,
    spawn: {
      enabled: true,
      triggerMode: 'level',
      repeatWhileAbove: true,
      hysteresis: 0.1,
      band: 'bass',
      threshold: 0.44,
      cooldownMs: 210,
      halfLifeMs: 2400,
      halfLifeEnergyFactor: 1.65,
      maxLayers: 24,
      useGlobalPalette: true,
    },
    mappings: {
      globalSpeedMultiplier: createMapping('bass', 0.62, 2.85, 'leaky', { rate: 0.06, decay: 0.992, restValue: 0.24 }),
      globalOpacity: createMapping('rms', 0.34, 1),
      variationScale: createMapping('bass', -0.3, 3),
      triggerMovementPulse: createTriggerMapping('bass', 1.08, 3.8, {
        source: 'processed',
        mode: 'both',
        riseThreshold: 0.62,
        fallThreshold: 0.44,
        cooldownMs: 220,
        reverseOnFall: true,
      }),
      triggerSpawnLayer: createTriggerMapping('bass', 0, 1, {
        source: 'raw',
        mode: 'both',
        riseThreshold: 0.66,
        fallThreshold: 0.46,
        cooldownMs: 220,
        reverseOnFall: true,
      }),
      triggerPaletteStep: createTriggerMapping('mids', 0, 1, {
        source: 'processed',
        mode: 'crossDown',
        riseThreshold: 0.56,
        fallThreshold: 0.42,
        cooldownMs: 300,
        reverseOnFall: false,
      }),
    },
  },
  {
    id: 'vocal-threshold-choreography',
    name: 'Vocal Threshold Choreography',
    summary: 'Voice articulation triggers palette choreography and expressive movement pulses with controlled reversals.',
    recommendedInput: 'Live mic vocals, spoken word, call-and-response performance.',
    audioSettings: {
      sensitivity: 1.85,
      bassSensitivity: 1.05,
      midsSensitivity: 1.65,
      highsSensitivity: 1.5,
      smoothing: 0.72,
      release: 0.88,
    },
    energyInfluence: 1.3,
    spawn: {
      enabled: true,
      triggerMode: 'transient',
      repeatWhileAbove: false,
      hysteresis: 0.08,
      band: 'mids',
      threshold: 0.2,
      cooldownMs: 180,
      halfLifeMs: 2100,
      halfLifeEnergyFactor: 1.3,
      maxLayers: 20,
      useGlobalPalette: true,
    },
    mappings: {
      globalSpeedMultiplier: createMapping('rms', 0.58, 2.05, 'runningAvg', { windowSeconds: 2.6 }),
      variationShape: createMapping('mids', 0.2, 2.8, 'onsetDrift', { threshold: 1.3, minLevel: 0.08, driftSpeed: 0.08 }),
      variationColor: createMapping('highs', 0.2, 2.8, 'leaky', { rate: 0.04, decay: 0.996, restValue: 0.2 }),
      triggerPaletteStep: createTriggerMapping('mids', 0, 1, {
        source: 'processed',
        mode: 'both',
        riseThreshold: 0.63,
        fallThreshold: 0.5,
        cooldownMs: 220,
        reverseOnFall: false,
      }),
      triggerSpawnLayer: createTriggerMapping('mids', 0, 1, {
        source: 'raw',
        mode: 'crossUp',
        riseThreshold: 0.68,
        fallThreshold: 0.48,
        cooldownMs: 190,
        reverseOnFall: false,
      }),
      triggerMovementPulse: createTriggerMapping(
        'mids',
        0.92,
        2.9,
        {
          source: 'processed',
          mode: 'both',
          riseThreshold: 0.6,
          fallThreshold: 0.46,
          cooldownMs: 200,
          reverseOnFall: true,
        },
        'runningAvg',
        { windowSeconds: 0.7 },
      ),
    },
  },
];

const DEFAULT_DEMO_PRESET_ID = AUDIO_DEMO_PRESETS?.[0]?.id || '';
const AUDIO_PRESET_SLOTS_KEY = 'artapp-audio-preset-slots-v1';
const AUDIO_PRESET_SLOT_COUNT = 10;
const AUDIO_PRESET_VERSION = '1.0';
const AUDIO_DEMO_UI_STATE_KEY = 'artapp-audio-demo-ui-v2';
const DEMO_PRESET_KIND_MOD = 'mod';
const DEMO_PRESET_KIND_SPAWN = 'spawn';
const DEFAULT_COMBINED_PRESET_KEY = DEFAULT_DEMO_PRESET_ID
  ? `${DEMO_PRESET_KIND_SPAWN}:${DEFAULT_DEMO_PRESET_ID}`
  : `${DEMO_PRESET_KIND_MOD}:${DEFAULT_MOD_PRESET_ID || ''}`;

const buildDefaultAudioPresetSlots = () => (
  Array.from({ length: AUDIO_PRESET_SLOT_COUNT }, (_, index) => ({
    id: index + 1,
    name: `A${index + 1}`,
    savedAt: null,
    payload: null,
    version: AUDIO_PRESET_VERSION,
  }))
);

const normalizeAudioPresetSlot = (rawSlot, index) => {
  const fallback = {
    id: index + 1,
    name: `A${index + 1}`,
    savedAt: null,
    payload: null,
    version: AUDIO_PRESET_VERSION,
  };
  if (!rawSlot || typeof rawSlot !== 'object') return fallback;
  const payload = (rawSlot.payload && typeof rawSlot.payload === 'object') ? rawSlot.payload : null;
  const maybeSavedAt = (
    typeof rawSlot.savedAt === 'string' && rawSlot.savedAt.length > 0
      ? rawSlot.savedAt
      : (typeof payload?.savedAt === 'string' ? payload.savedAt : null)
  );
  return {
    id: fallback.id,
    name: (typeof rawSlot.name === 'string' && rawSlot.name.trim().length > 0)
      ? rawSlot.name.trim().slice(0, 18)
      : fallback.name,
    savedAt: payload ? maybeSavedAt : null,
    payload,
    version: typeof rawSlot.version === 'string' ? rawSlot.version : AUDIO_PRESET_VERSION,
  };
};

const loadAudioPresetSlots = () => {
  const defaults = buildDefaultAudioPresetSlots();
  if (typeof window === 'undefined' || !window.localStorage) return defaults;
  try {
    const raw = window.localStorage.getItem(AUDIO_PRESET_SLOTS_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaults;
    return defaults.map((slot, index) => normalizeAudioPresetSlot(parsed[index] || slot, index));
  } catch {
    return defaults;
  }
};

const loadAudioDemoUiState = () => {
  const defaults = {
    selectedPresetKey: DEFAULT_COMBINED_PRESET_KEY,
    lastAppliedPresetKey: null,
    replaceMappings: true,
    enableAudioOnApply: true,
    usePunchierApply: true,
    responseProfile: 'balanced',
    targetMode: 'tri-band',
    applySceneSetup: true,
    disableSpawnOnApply: true,
    includeGlobalEffects: true,
    presetsExpanded: true,
  };
  if (typeof window === 'undefined' || !window.localStorage) return defaults;
  try {
    const raw = window.localStorage.getItem(AUDIO_DEMO_UI_STATE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return defaults;
    return {
      ...defaults,
      selectedPresetKey: typeof parsed.selectedPresetKey === 'string' && parsed.selectedPresetKey.length > 0
        ? parsed.selectedPresetKey
        : defaults.selectedPresetKey,
      lastAppliedPresetKey: typeof parsed.lastAppliedPresetKey === 'string' && parsed.lastAppliedPresetKey.length > 0
        ? parsed.lastAppliedPresetKey
        : null,
      replaceMappings: !!parsed.replaceMappings,
      enableAudioOnApply: !!parsed.enableAudioOnApply,
      usePunchierApply: (typeof parsed.usePunchierApply === 'boolean') ? parsed.usePunchierApply : defaults.usePunchierApply,
      responseProfile: (typeof parsed.responseProfile === 'string' && RESPONSE_PROFILES[parsed.responseProfile])
        ? parsed.responseProfile
        : defaults.responseProfile,
      targetMode: parsed.targetMode === 'global' ? 'global' : defaults.targetMode,
      applySceneSetup: (typeof parsed.applySceneSetup === 'boolean') ? parsed.applySceneSetup : defaults.applySceneSetup,
      disableSpawnOnApply: (typeof parsed.disableSpawnOnApply === 'boolean') ? parsed.disableSpawnOnApply : defaults.disableSpawnOnApply,
      includeGlobalEffects: (typeof parsed.includeGlobalEffects === 'boolean') ? parsed.includeGlobalEffects : defaults.includeGlobalEffects,
      presetsExpanded: (typeof parsed.presetsExpanded === 'boolean') ? parsed.presetsExpanded : defaults.presetsExpanded,
    };
  } catch {
    return defaults;
  }
};

const PATCH_MATRIX_PARAM_CATALOG = [
  // Global
  { id: 'globalSpeedMultiplier', label: 'Global Speed', group: 'Global' },
  { id: 'globalOpacity', label: 'Global Opacity', group: 'Global' },
  { id: 'globalBlendMode', label: 'Blend Mode', group: 'Global' },
  { id: 'globalPaletteIndex', label: 'Palette Index', group: 'Global' },
  { id: 'layersCount', label: 'Layers Count', group: 'Global' },
  // Background
  { id: 'backgroundColorR', label: 'Background Red', group: 'Background' },
  { id: 'backgroundColorG', label: 'Background Green', group: 'Background' },
  { id: 'backgroundColorB', label: 'Background Blue', group: 'Background' },
  // Variation (base layer)
  { id: 'variationShape', label: 'Variation Shape', group: 'Variation' },
  { id: 'variationAnim', label: 'Variation Anim', group: 'Variation' },
  { id: 'variationColor', label: 'Variation Color', group: 'Variation' },
  { id: 'variationScale', label: 'Variation Scale', group: 'Variation' },
  { id: 'variationPosition', label: 'Variation Position', group: 'Variation' },
  { id: 'variation', label: 'Variation (All)', group: 'Variation' },
  // Triggers
  { id: 'randomizeAll', label: 'Randomize Trigger', group: 'Triggers' },
  { id: 'triggerPaletteStep', label: 'Palette Step', group: 'Triggers' },
  { id: 'triggerSpawnLayer', label: 'Spawn Layer (Half-Life)', group: 'Triggers' },
  { id: 'triggerMovementPulse', label: 'Movement Pulse', group: 'Triggers' },
  // Layer Shape (per-layer)
  { id: 'numSides', label: 'Sides', group: 'Layer Shape', perLayer: true },
  { id: 'curviness', label: 'Curviness', group: 'Layer Shape', perLayer: true },
  { id: 'radiusFactor', label: 'Radius', group: 'Layer Shape', perLayer: true },
  { id: 'radiusFactorX', label: 'Radius X', group: 'Layer Shape', perLayer: true },
  { id: 'radiusFactorY', label: 'Radius Y', group: 'Layer Shape', perLayer: true },
  { id: 'rotation', label: 'Rotation', group: 'Layer Shape', perLayer: true },
  { id: 'width', label: 'Width', group: 'Layer Shape', perLayer: true },
  { id: 'height', label: 'Height', group: 'Layer Shape', perLayer: true },
  // Layer Animation (per-layer)
  { id: 'movementSpeed', label: 'Movement Speed', group: 'Layer Animation', perLayer: true },
  { id: 'movementAngle', label: 'Movement Angle', group: 'Layer Animation', perLayer: true },
  { id: 'wobble', label: 'Wobble', group: 'Layer Animation', perLayer: true },
  { id: 'noiseAmount', label: 'Noise Amount', group: 'Layer Animation', perLayer: true },
  { id: 'noiseScale', label: 'Noise Scale', group: 'Layer Animation', perLayer: true },
  { id: 'wobbleSpeed', label: 'Wobble Speed', group: 'Layer Animation', perLayer: true },
  { id: 'symmetry', label: 'Noise Symmetry', group: 'Layer Animation', perLayer: true },
  { id: 'freqJitter', label: 'Frequency Jitter', group: 'Layer Animation', perLayer: true },
  { id: 'scaleSpeed', label: 'Scale Speed', group: 'Layer Animation', perLayer: true },
  { id: 'scaleMin', label: 'Scale Min', group: 'Layer Animation', perLayer: true },
  { id: 'scaleMax', label: 'Scale Max', group: 'Layer Animation', perLayer: true },
  { id: 'orbitRadiusX', label: 'Orbit Radius X', group: 'Layer Animation', perLayer: true },
  { id: 'orbitRadiusY', label: 'Orbit Radius Y', group: 'Layer Animation', perLayer: true },
  { id: 'freq1', label: 'Frequency 1', group: 'Layer Animation', perLayer: true },
  { id: 'freq2', label: 'Frequency 2', group: 'Layer Animation', perLayer: true },
  { id: 'freq3', label: 'Frequency 3', group: 'Layer Animation', perLayer: true },
  // Layer Colour (per-layer)
  { id: 'opacity', label: 'Opacity', group: 'Layer Colour', perLayer: true },
  { id: 'colorFadeSpeed', label: 'Color Fade Speed', group: 'Layer Colour', perLayer: true },
  { id: 'paletteIndex', label: 'Palette Index', group: 'Layer Colour', perLayer: true },
];

const PATCH_MATRIX_PARAM_GROUPS = [
  'Global', 'Background', 'Variation', 'Triggers',
  'Layer Shape', 'Layer Animation', 'Layer Colour',
];

const isPerLayerParamId = (paramId) => {
  return typeof paramId === 'string' && paramId.startsWith('layer:');
};

const parsePerLayerParamId = (paramId) => {
  if (!isPerLayerParamId(paramId)) return null;
  const parts = paramId.split(':');
  if (parts.length < 3) return null;
  return { target: parts[1], param: parts.slice(2).join(':') };
};

const buildPerLayerParamId = (baseParam, target) => {
  return `layer:${target || 'all'}:${baseParam}`;
};

const VARIATION_PARAM_IDS = new Set([
  'variation',
  'variationShape',
  'variationAnim',
  'variationColor',
  'variationScale',
  'variationPosition',
]);

const isVariationParamId = (paramId) => {
  if (typeof paramId !== 'string' || !paramId.length) return false;
  if (VARIATION_PARAM_IDS.has(paramId)) return true;
  const parsed = parsePerLayerParamId(paramId);
  return !!(parsed && VARIATION_PARAM_IDS.has(parsed.param));
};

const stripVariationMappings = (mappings) => {
  if (!mappings || typeof mappings !== 'object') return {};
  return Object.fromEntries(
    Object.entries(mappings).filter(([paramId]) => !isVariationParamId(paramId)),
  );
};

const PATCH_MATRIX_TRIGGER_ACTION_OPTIONS = [
  { id: 'modulate', label: 'Modulate (continuous)' },
  { id: 'addLayer', label: 'Add Layer' },
  { id: 'randomize', label: 'Randomize Value' },
  { id: 'increase', label: 'Increase Value' },
  { id: 'decrease', label: 'Decrease Value' },
];

const PATCH_MATRIX_BANDS = [
  { id: 'none', label: 'Off' },
  { id: 'rms', label: 'Level' },
  { id: 'bass', label: 'Bass' },
  { id: 'mids', label: 'Mids' },
  { id: 'highs', label: 'Highs' },
  { id: 'pitch', label: 'Pitch' },
  { id: 'transient', label: 'Transient' },
  { id: 'beat', label: 'Beat' },
  { id: 'waveformEnergy', label: 'Wave Energy' },
];

const PATCH_MATRIX_TRIGGER_MODE_OPTIONS = [
  { id: 'crossUp', label: 'Cross Up' },
  { id: 'crossDown', label: 'Cross Down' },
  { id: 'both', label: 'Both Directions' },
  { id: 'whileAbove', label: 'While Above' },
];

const PER_LAYER_PARAM_RANGES = {
  numSides: { outputMin: 3, outputMax: 12 },
  curviness: { outputMin: 0, outputMax: 1 },
  radiusFactor: { outputMin: 0.1, outputMax: 2 },
  radiusFactorX: { outputMin: 0.1, outputMax: 2 },
  radiusFactorY: { outputMin: 0.1, outputMax: 2 },
  rotation: { outputMin: 0, outputMax: 360 },
  width: { outputMin: 10, outputMax: 800 },
  height: { outputMin: 10, outputMax: 800 },
  movementSpeed: { outputMin: 0, outputMax: 3 },
  movementAngle: { outputMin: 0, outputMax: 360 },
  wobble: { outputMin: 0, outputMax: 1 },
  noiseAmount: { outputMin: 0, outputMax: 1 },
  noiseScale: { outputMin: 0, outputMax: 2 },
  wobbleSpeed: { outputMin: 0, outputMax: 2 },
  symmetry: { outputMin: 0, outputMax: 1 },
  freqJitter: { outputMin: 0, outputMax: 1 },
  scaleSpeed: { outputMin: 0, outputMax: 2 },
  scaleMin: { outputMin: 0.1, outputMax: 1 },
  scaleMax: { outputMin: 0.5, outputMax: 2 },
  orbitRadiusX: { outputMin: 0, outputMax: 400 },
  orbitRadiusY: { outputMin: 0, outputMax: 400 },
  freq1: { outputMin: 0, outputMax: 5 },
  freq2: { outputMin: 0, outputMax: 5 },
  freq3: { outputMin: 0, outputMax: 5 },
  opacity: { outputMin: 0.1, outputMax: 1 },
  colorFadeSpeed: { outputMin: 0, outputMax: 2 },
  paletteIndex: { outputMin: 0, outputMax: 1 },
};

const defaultRangeForParam = (paramId = '') => {
  const parsed = parsePerLayerParamId(paramId);
  if (parsed && PER_LAYER_PARAM_RANGES[parsed.param]) {
    return { ...PER_LAYER_PARAM_RANGES[parsed.param] };
  }
  switch (paramId) {
    case 'globalSpeedMultiplier':
      return { outputMin: 0.5, outputMax: 1.4 };
    case 'globalOpacity':
      return { outputMin: 0.4, outputMax: 1 };
    case 'layersCount':
      return { outputMin: 3, outputMax: 14 };
    case 'variationScale':
      return { outputMin: -0.4, outputMax: 1.2 };
    case 'variationShape':
    case 'variationAnim':
    case 'variationColor':
    case 'variationPosition':
    case 'variation':
      return { outputMin: 0.1, outputMax: 2.2 };
    case 'randomizeAll':
    case 'triggerPaletteStep':
    case 'triggerSpawnLayer':
      return { outputMin: 0, outputMax: 1 };
    case 'triggerMovementPulse':
      return { outputMin: 0.9, outputMax: 2.2 };
    case 'backgroundColorR':
    case 'backgroundColorG':
    case 'backgroundColorB':
      return { outputMin: 0, outputMax: 1 };
    case 'globalBlendMode':
    case 'globalPaletteIndex':
      return { outputMin: 0, outputMax: 1 };
    default:
      return { outputMin: 0, outputMax: 1 };
  }
};

const prettyParamLabel = (paramId = '') => {
  if (!paramId) return 'Unknown';
  const catalogHit = PATCH_MATRIX_PARAM_CATALOG.find(item => item.id === paramId);
  if (catalogHit) return catalogHit.label;
  const parsed = parsePerLayerParamId(paramId);
  if (parsed) {
    const baseCatalog = PATCH_MATRIX_PARAM_CATALOG.find(item => item.id === parsed.param && item.perLayer);
    const paramLabel = baseCatalog ? baseCatalog.label : parsed.param
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/^./, (c) => c.toUpperCase());
    const targetLabel = parsed.target === 'all' ? 'All' : `L${parsed.target}`;
    return `${paramLabel} [${targetLabel}]`;
  }
  return paramId
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (char) => char.toUpperCase());
};

const AudioDemoPresetsSection = ({
  isActiveTab = true,
  timelineMode = false,
  layers = [],
  parameterTargetMode = 'individual',
  setParameterTargetMode = null,
  setLayers = null,
  DEFAULT_LAYER = null,
  setSelectedLayerIndex = null,
  setGlobalSpeedMultiplier = null,
  setGlobalBlendMode = null,
  setGlobalPaletteIndex = null,
  setGlobalPaletteRef = null,
  energyInfluence = 0.5,
  setEnergyInfluence = null,
  audioSpawnEnabled = false,
  audioSpawnPresetActive = false,
  setAudioSpawnEnabled = null,
  setAudioSpawnPresetActive = null,
  audioSpawnTriggerMode = 'level',
  setAudioSpawnTriggerMode = null,
  audioSpawnRepeatWhileAbove = true,
  setAudioSpawnRepeatWhileAbove = null,
  audioSpawnHysteresis = 0.08,
  setAudioSpawnHysteresis = null,
  audioSpawnBand = 'rms',
  setAudioSpawnBand = null,
  audioSpawnThreshold = 0.6,
  setAudioSpawnThreshold = null,
  audioSpawnCooldownMs = 250,
  setAudioSpawnCooldownMs = null,
  audioSpawnHalfLifeMs = 1500,
  setAudioSpawnHalfLifeMs = null,
  audioSpawnHalfLifeEnergyFactor = 1.0,
  setAudioSpawnHalfLifeEnergyFactor = null,
  audioSpawnMaxLayers = 12,
  setAudioSpawnMaxLayers = null,
  audioSpawnMicReactive = false,
  setAudioSpawnMicReactive = null,
  audioSpawnMicReactiveAmount = 100,
  setAudioSpawnMicReactiveAmount = null,
  audioSpawnForceContourMode = false,
  setAudioSpawnForceContourMode = null,
  audioSpawnUseGlobalPalette = false,
  setAudioSpawnUseGlobalPalette = null,
  milkdropInfluence = 0,
  setMilkdropInfluence = null,
  milkdropFeedbackEnabled = true,
  setMilkdropFeedbackEnabled = null,
} = {}) => {
  const audio = useAudioReactive();
  const initialUiState = useMemo(() => loadAudioDemoUiState(), []);
  const [selectedPresetKey, setSelectedPresetKey] = useState(() => (
    initialUiState.selectedPresetKey || DEFAULT_COMBINED_PRESET_KEY
  ));
  const [lastAppliedPresetKey, setLastAppliedPresetKey] = useState(() => (
    initialUiState.lastAppliedPresetKey || null
  ));
  const [replaceMappings, setReplaceMappings] = useState(() => !!initialUiState.replaceMappings);
  const [enableAudioOnApply, setEnableAudioOnApply] = useState(() => !!initialUiState.enableAudioOnApply);
  const [usePunchierApply, setUsePunchierApply] = useState(() => !!initialUiState.usePunchierApply);
  const [responseProfile, setResponseProfile] = useState(() => (
    RESPONSE_PROFILES[initialUiState.responseProfile] ? initialUiState.responseProfile : 'balanced'
  ));
  const [targetMode, setTargetMode] = useState(() => (
    initialUiState.targetMode === 'global' ? 'global' : 'tri-band'
  ));
  const [applySceneSetup, setApplySceneSetup] = useState(() => !!initialUiState.applySceneSetup);
  const [disableSpawnOnApply, setDisableSpawnOnApply] = useState(() => !!initialUiState.disableSpawnOnApply);
  const [includeGlobalEffects, setIncludeGlobalEffects] = useState(() => !!initialUiState.includeGlobalEffects);
  const [presetsExpanded, setPresetsExpanded] = useState(() => !!initialUiState.presetsExpanded);

  const combinedPresetOptions = useMemo(() => ([
    ...MODULATION_PRESETS.map((preset, index) => ({
      kind: DEMO_PRESET_KIND_MOD,
      key: `${DEMO_PRESET_KIND_MOD}:${preset.id}`,
      id: preset.id,
      label: `${index + 1}. ${preset.name}`,
      preset,
    })),
    ...AUDIO_DEMO_PRESETS.map((preset, index) => ({
      kind: DEMO_PRESET_KIND_SPAWN,
      key: `${DEMO_PRESET_KIND_SPAWN}:${preset.id}`,
      id: preset.id,
      label: `${index + 1}. ${preset.name}`,
      preset,
    })),
  ]), []);

  const selectedPresetEntry = useMemo(() => (
    combinedPresetOptions.find((entry) => entry.key === selectedPresetKey)
    || combinedPresetOptions[0]
    || null
  ), [combinedPresetOptions, selectedPresetKey]);

  const selectedPreset = selectedPresetEntry?.preset || null;
  const selectedPresetKind = selectedPresetEntry?.kind || DEMO_PRESET_KIND_SPAWN;

  const selectedSpawnPresetToApply = useMemo(() => {
    if (selectedPresetKind !== DEMO_PRESET_KIND_SPAWN || !selectedPreset) return null;
    return usePunchierApply ? buildPunchierDemoPreset(selectedPreset) : selectedPreset;
  }, [selectedPresetKind, selectedPreset, usePunchierApply]);

  const lastAppliedPresetEntry = useMemo(() => (
    combinedPresetOptions.find((entry) => entry.key === lastAppliedPresetKey) || null
  ), [combinedPresetOptions, lastAppliedPresetKey]);

  useEffect(() => {
    if (selectedPresetEntry || !combinedPresetOptions.length) return;
    setSelectedPresetKey(combinedPresetOptions[0].key);
  }, [selectedPresetEntry, combinedPresetOptions]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(AUDIO_DEMO_UI_STATE_KEY, JSON.stringify({
        selectedPresetKey: selectedPresetEntry?.key || selectedPresetKey || DEFAULT_COMBINED_PRESET_KEY,
        lastAppliedPresetKey: lastAppliedPresetEntry?.key || null,
        replaceMappings,
        enableAudioOnApply,
        usePunchierApply,
        responseProfile,
        targetMode,
        applySceneSetup,
        disableSpawnOnApply,
        includeGlobalEffects,
        presetsExpanded,
      }));
    } catch {
      // noop
    }
  }, [
    selectedPresetEntry,
    selectedPresetKey,
    lastAppliedPresetEntry,
    replaceMappings,
    enableAudioOnApply,
    usePunchierApply,
    responseProfile,
    targetMode,
    applySceneSetup,
    disableSpawnOnApply,
    includeGlobalEffects,
    presetsExpanded,
  ]);

  const applyPreset = useCallback(() => {
    if (!audio || !selectedPresetEntry || !selectedPreset) return;

    if (selectedPresetKind === DEMO_PRESET_KIND_MOD) {
      const applied = applyModulationDemoPreset({
        audio,
        preset: selectedPreset,
        enableAudioOnApply,
        responseProfile,
        replaceMappings,
        applySceneSetup,
        includeGlobalEffects,
        disableSpawnOnApply,
        targetMode,
        layers,
        setEnergyInfluence,
        setAudioSpawnEnabled,
        setAudioSpawnUseGlobalPalette,
        setParameterTargetMode,
        setLayers,
        DEFAULT_LAYER,
        setSelectedLayerIndex,
        setGlobalSpeedMultiplier,
        setGlobalBlendMode,
        setGlobalPaletteIndex,
        setGlobalPaletteRef,
      });
      if (applied) {
        setAudioSpawnPresetActive?.(false);
        setLastAppliedPresetKey(selectedPresetEntry.key);
      }
      return;
    }

    const presetToApply = selectedSpawnPresetToApply || selectedPreset;
    const {
      setAudioEnabled = null,
      setSensitivity = null,
      setBassSensitivity = null,
      setMidsSensitivity = null,
      setHighsSensitivity = null,
      setSmoothing = null,
      setRelease = null,
      setMapping = null,
      clearAllMappings = null,
      clearMapping = null,
      mappings: currentMappings = null,
    } = audio;

    if (enableAudioOnApply) {
      setAudioEnabled?.(true);
    }

    const audioSettings = presetToApply.audioSettings || {};
    if (Number.isFinite(audioSettings.sensitivity)) setSensitivity?.(audioSettings.sensitivity);
    if (Number.isFinite(audioSettings.bassSensitivity)) setBassSensitivity?.(audioSettings.bassSensitivity);
    if (Number.isFinite(audioSettings.midsSensitivity)) setMidsSensitivity?.(audioSettings.midsSensitivity);
    if (Number.isFinite(audioSettings.highsSensitivity)) setHighsSensitivity?.(audioSettings.highsSensitivity);
    if (Number.isFinite(audioSettings.smoothing)) setSmoothing?.(audioSettings.smoothing);
    if (Number.isFinite(audioSettings.release)) setRelease?.(audioSettings.release);

    if (replaceMappings) {
      clearAllMappings?.();
    } else {
      const mappingEntries = (currentMappings && typeof currentMappings === 'object')
        ? Object.keys(currentMappings)
        : [];
      mappingEntries.forEach((paramId) => {
        if (isVariationParamId(paramId)) {
          clearMapping?.(paramId);
        }
      });
    }

    const mappings = stripVariationMappings(presetToApply.mappings || {});
    Object.entries(mappings).forEach(([paramId, mapping]) => {
      setMapping?.(paramId, mapping);
    });

    const spawn = presetToApply.spawn || {};
    setParameterTargetMode?.('global');
    setAudioSpawnEnabled?.(typeof spawn.enabled === 'boolean' ? spawn.enabled : true);
    setAudioSpawnPresetActive?.(true);
    setAudioSpawnTriggerMode?.(spawn.triggerMode || 'level');
    setAudioSpawnRepeatWhileAbove?.(typeof spawn.repeatWhileAbove === 'boolean' ? spawn.repeatWhileAbove : true);
    setAudioSpawnHysteresis?.(Number.isFinite(spawn.hysteresis) ? spawn.hysteresis : 0.08);
    setAudioSpawnBand?.(spawn.band || 'rms');
    setAudioSpawnThreshold?.(Number.isFinite(spawn.threshold) ? spawn.threshold : 0.6);
    setAudioSpawnCooldownMs?.(Number.isFinite(spawn.cooldownMs) ? spawn.cooldownMs : 250);
    setAudioSpawnHalfLifeMs?.(Number.isFinite(spawn.halfLifeMs) ? spawn.halfLifeMs : 1500);
    setAudioSpawnHalfLifeEnergyFactor?.(Number.isFinite(spawn.halfLifeEnergyFactor) ? spawn.halfLifeEnergyFactor : 1);
    setAudioSpawnMaxLayers?.(Number.isFinite(spawn.maxLayers) ? spawn.maxLayers : 12);
    setAudioSpawnMicReactive?.(typeof spawn.micReactive === 'boolean' ? spawn.micReactive : false);
    if (Number.isFinite(spawn.micReactiveAmount)) {
      setAudioSpawnMicReactiveAmount?.(Math.max(0, Math.min(100, Number(spawn.micReactiveAmount))));
    } else if (typeof spawn.micReactive === 'boolean') {
      setAudioSpawnMicReactiveAmount?.(spawn.micReactive ? 100 : 0);
    }
    setAudioSpawnForceContourMode?.(typeof spawn.forceContourMode === 'boolean' ? spawn.forceContourMode : false);
    if (typeof spawn.useGlobalPalette === 'boolean') {
      setAudioSpawnUseGlobalPalette?.(spawn.useGlobalPalette);
    }

    if (Number.isFinite(presetToApply.energyInfluence)) {
      setEnergyInfluence?.(presetToApply.energyInfluence);
    }

    setLastAppliedPresetKey(selectedPresetEntry.key);
  }, [
    audio,
    selectedPresetEntry,
    selectedPreset,
    selectedPresetKind,
    selectedSpawnPresetToApply,
    enableAudioOnApply,
    responseProfile,
    replaceMappings,
    applySceneSetup,
    includeGlobalEffects,
    disableSpawnOnApply,
    targetMode,
    layers,
    setEnergyInfluence,
    setAudioSpawnEnabled,
    setAudioSpawnPresetActive,
    setAudioSpawnUseGlobalPalette,
    setParameterTargetMode,
    setLayers,
    DEFAULT_LAYER,
    setSelectedLayerIndex,
    setGlobalSpeedMultiplier,
    setGlobalBlendMode,
    setGlobalPaletteIndex,
    setGlobalPaletteRef,
    setAudioSpawnTriggerMode,
    setAudioSpawnRepeatWhileAbove,
    setAudioSpawnHysteresis,
    setAudioSpawnBand,
    setAudioSpawnThreshold,
    setAudioSpawnCooldownMs,
    setAudioSpawnHalfLifeMs,
    setAudioSpawnHalfLifeEnergyFactor,
    setAudioSpawnMaxLayers,
    setAudioSpawnMicReactive,
    setAudioSpawnMicReactiveAmount,
    setAudioSpawnForceContourMode,
  ]);

  if (!audio) return null;

  return (
    <div
      className="compact-field"
      style={{
        borderTop: '1px solid rgba(255,255,255,0.1)',
        paddingTop: '0.5rem',
        marginTop: '0.5rem',
        display: 'block',
        width: '100%',
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
        <button
          type="button"
          className="btn-compact-secondary"
          style={{ fontSize: '0.72rem', padding: '2px 8px' }}
          onClick={() => setPresetsExpanded(v => !v)}
          title={presetsExpanded ? 'Collapse audio demo presets' : 'Expand audio demo presets'}
        >
          {presetsExpanded ? '▾' : '▸'} Audio Demo Presets
        </button>
        <button
          type="button"
          className="btn-compact-secondary"
          style={{ fontSize: '0.72rem', padding: '2px 8px' }}
          onClick={applyPreset}
          disabled={!selectedPresetEntry}
          title="Apply selected audio demo preset"
        >
          Apply
        </button>
      </div>

      {presetsExpanded && (
        <>
          <div style={{ marginTop: '0.35rem' }}>
            <select
              className="compact-select"
              style={{ width: '100%' }}
              value={selectedPresetEntry?.key || ''}
              onChange={(e) => setSelectedPresetKey(e.target.value)}
            >
              <optgroup label="Modulation Demo Modes (No Spawn)">
                {MODULATION_PRESETS.map((preset, index) => (
                  <option key={`${DEMO_PRESET_KIND_MOD}:${preset.id}`} value={`${DEMO_PRESET_KIND_MOD}:${preset.id}`}>
                    {`${index + 1}. ${preset.name}`}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Spawn Demo Presets">
                {AUDIO_DEMO_PRESETS.map((preset, index) => (
                  <option key={`${DEMO_PRESET_KIND_SPAWN}:${preset.id}`} value={`${DEMO_PRESET_KIND_SPAWN}:${preset.id}`}>
                    {`${index + 1}. ${preset.name}`}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          {selectedPreset && (
            <div style={{ marginTop: '0.35rem' }}>
              <div style={{ fontSize: '0.72rem', opacity: 0.85 }}>{selectedPreset.summary}</div>
              <div style={{ fontSize: '0.68rem', opacity: 0.65, marginTop: '0.2rem' }}>
                Best with: {selectedPreset.recommendedInput}
              </div>
            </div>
          )}

          {selectedPresetKind === DEMO_PRESET_KIND_MOD && (
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.35rem 0.5rem', alignItems: 'center', marginTop: '0.4rem' }}>
              <span className="compact-label" style={{ opacity: 0.75 }}>Response</span>
              <select
                className="compact-select"
                style={{ fontSize: '0.72rem' }}
                value={responseProfile}
                onChange={(e) => setResponseProfile(e.target.value)}
              >
                {Object.entries(RESPONSE_PROFILES).map(([value, profile]) => (
                  <option key={value} value={value}>{profile.label}</option>
                ))}
              </select>

              <span className="compact-label" style={{ opacity: 0.75 }}>Target</span>
              <select
                className="compact-select"
                style={{ fontSize: '0.72rem' }}
                value={targetMode}
                onChange={(e) => setTargetMode(e.target.value)}
                title="Tri-band maps by layer role; Global broadcasts mapped params to all layers"
              >
                <option value="tri-band">Tri-band (layer roles)</option>
                <option value="global">Global (all layers)</option>
              </select>
            </div>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem 1rem', marginTop: '0.45rem' }}>
            <label className="compact-label" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }} title="Clear existing audio mappings before loading this demo">
              <input
                type="checkbox"
                checked={replaceMappings}
                onChange={(e) => setReplaceMappings(!!e.target.checked)}
              />
              Replace mappings
            </label>
            <label className="compact-label" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }} title="Automatically enable Audio Input when applying a preset">
              <input
                type="checkbox"
                checked={enableAudioOnApply}
                onChange={(e) => setEnableAudioOnApply(!!e.target.checked)}
              />
              Enable audio
            </label>
            {selectedPresetKind === DEMO_PRESET_KIND_SPAWN && (
              <label className="compact-label" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }} title="Boost sensitivity, mapping range, and spawn response for stronger visual impact">
                <input
                  type="checkbox"
                  checked={usePunchierApply}
                  onChange={(e) => setUsePunchierApply(!!e.target.checked)}
                />
                Punchier apply
              </label>
            )}
            {selectedPresetKind === DEMO_PRESET_KIND_MOD && (
              <label className="compact-label" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }} title="Create/update a 3-layer demo scene (size, style, colours)">
                <input
                  type="checkbox"
                  checked={applySceneSetup}
                  onChange={(e) => setApplySceneSetup(!!e.target.checked)}
                />
                Apply scene setup
              </label>
            )}
            {selectedPresetKind === DEMO_PRESET_KIND_MOD && (
              <label className="compact-label" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }} title="Turn off Audio Spawn so this mode stays strictly non-spawn">
                <input
                  type="checkbox"
                  checked={disableSpawnOnApply}
                  onChange={(e) => setDisableSpawnOnApply(!!e.target.checked)}
                />
                Disable spawn
              </label>
            )}
            {selectedPresetKind === DEMO_PRESET_KIND_MOD && (
              <label className="compact-label" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }} title="Add always-on global audio mappings (speed/opacity) so the whole scene responds clearly">
                <input
                  type="checkbox"
                  checked={includeGlobalEffects}
                  onChange={(e) => setIncludeGlobalEffects(!!e.target.checked)}
                />
                Add global effects
              </label>
            )}
          </div>

          {selectedPresetKind === DEMO_PRESET_KIND_MOD && (
            <div style={{ marginTop: '0.35rem', fontSize: '0.68rem', opacity: 0.65 }}>
              Tip: if only one layer reacts, either enable <strong>Apply scene setup</strong> or switch target to <strong>Global</strong>.
            </div>
          )}

          {lastAppliedPresetEntry && (
            <div style={{ marginTop: '0.35rem', fontSize: '0.7rem', color: '#6bcb77' }}>
              Applied: {lastAppliedPresetEntry.preset?.name || 'Preset'}
            </div>
          )}

          <AudioPatchMatrixSection
            isActiveTab={isActiveTab}
            timelineMode={timelineMode}
            layers={layers}
          />

          <AudioPresetSlotsSection
            timelineMode={timelineMode}
            parameterTargetMode={parameterTargetMode}
            setParameterTargetMode={setParameterTargetMode}
            energyInfluence={energyInfluence}
            setEnergyInfluence={setEnergyInfluence}
            audioSpawnEnabled={audioSpawnEnabled}
            audioSpawnPresetActive={audioSpawnPresetActive}
            setAudioSpawnEnabled={setAudioSpawnEnabled}
            setAudioSpawnPresetActive={setAudioSpawnPresetActive}
            audioSpawnTriggerMode={audioSpawnTriggerMode}
            setAudioSpawnTriggerMode={setAudioSpawnTriggerMode}
            audioSpawnRepeatWhileAbove={audioSpawnRepeatWhileAbove}
            setAudioSpawnRepeatWhileAbove={setAudioSpawnRepeatWhileAbove}
            audioSpawnHysteresis={audioSpawnHysteresis}
            setAudioSpawnHysteresis={setAudioSpawnHysteresis}
            audioSpawnUseGlobalPalette={audioSpawnUseGlobalPalette}
            setAudioSpawnUseGlobalPalette={setAudioSpawnUseGlobalPalette}
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
            audioSpawnMicReactive={audioSpawnMicReactive}
            setAudioSpawnMicReactive={setAudioSpawnMicReactive}
            audioSpawnMicReactiveAmount={audioSpawnMicReactiveAmount}
            setAudioSpawnMicReactiveAmount={setAudioSpawnMicReactiveAmount}
            audioSpawnForceContourMode={audioSpawnForceContourMode}
            setAudioSpawnForceContourMode={setAudioSpawnForceContourMode}
            milkdropInfluence={milkdropInfluence}
            setMilkdropInfluence={setMilkdropInfluence}
            milkdropFeedbackEnabled={milkdropFeedbackEnabled}
            setMilkdropFeedbackEnabled={setMilkdropFeedbackEnabled}
          />

          {timelineMode && (
            <div style={{ marginTop: '0.35rem', fontSize: '0.7rem', opacity: 0.65 }}>
              Timeline mode mutes live Audio + BPM automation; preset values are still saved and will run after leaving Timeline mode.
            </div>
          )}
        </>
      )}
    </div>
  );
};

const AudioPresetSlotsSection = ({
  timelineMode = false,
  parameterTargetMode = 'individual',
  setParameterTargetMode = null,
  energyInfluence = 0.5,
  setEnergyInfluence = null,
  audioSpawnEnabled = false,
  audioSpawnPresetActive = false,
  setAudioSpawnEnabled = null,
  setAudioSpawnPresetActive = null,
  audioSpawnTriggerMode = 'level',
  setAudioSpawnTriggerMode = null,
  audioSpawnRepeatWhileAbove = true,
  setAudioSpawnRepeatWhileAbove = null,
  audioSpawnHysteresis = 0.08,
  setAudioSpawnHysteresis = null,
  audioSpawnUseGlobalPalette = false,
  setAudioSpawnUseGlobalPalette = null,
  audioSpawnBand = 'rms',
  setAudioSpawnBand = null,
  audioSpawnThreshold = 0.6,
  setAudioSpawnThreshold = null,
  audioSpawnCooldownMs = 250,
  setAudioSpawnCooldownMs = null,
  audioSpawnHalfLifeMs = 1500,
  setAudioSpawnHalfLifeMs = null,
  audioSpawnHalfLifeEnergyFactor = 1.0,
  setAudioSpawnHalfLifeEnergyFactor = null,
  audioSpawnMaxLayers = 12,
  setAudioSpawnMaxLayers = null,
  audioSpawnMicReactive = false,
  setAudioSpawnMicReactive = null,
  audioSpawnMicReactiveAmount = 100,
  setAudioSpawnMicReactiveAmount = null,
  audioSpawnForceContourMode = false,
  setAudioSpawnForceContourMode = null,
  milkdropInfluence = 0,
  setMilkdropInfluence = null,
  milkdropFeedbackEnabled = true,
  setMilkdropFeedbackEnabled = null,
} = {}) => {
  const audio = useAudioReactive();
  const [slots, setSlots] = useState(() => loadAudioPresetSlots());
  const [selectedSlotId, setSelectedSlotId] = useState(1);
  const [enableAudioOnLoad, setEnableAudioOnLoad] = useState(true);
  const [status, setStatus] = useState({ text: '', error: false });
  const [slotsExpanded, setSlotsExpanded] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(AUDIO_PRESET_SLOTS_KEY, JSON.stringify(slots));
    } catch (error) {
      console.warn('[Audio Presets] Failed to persist audio preset slots', error);
    }
  }, [slots]);

  const updateSlot = useCallback((slotId, updater) => {
    setSlots(prev => prev.map(slot => {
      if (slot.id !== slotId) return slot;
      if (typeof updater === 'function') return updater(slot);
      return { ...slot, ...updater };
    }));
  }, []);

  const selectedSlot = useMemo(() => (
    slots.find(slot => slot.id === selectedSlotId) || slots[0] || null
  ), [slots, selectedSlotId]);

  const normalizedAppState = useMemo(() => ({
    parameterTargetMode: (typeof parameterTargetMode === 'string' && parameterTargetMode.length > 0)
      ? parameterTargetMode
      : 'individual',
    energyInfluence: Number.isFinite(energyInfluence) ? energyInfluence : 0.5,
    audioSpawnEnabled: !!audioSpawnEnabled,
    audioSpawnPresetActive: !!audioSpawnPresetActive,
    audioSpawnTriggerMode: (audioSpawnTriggerMode === 'transient') ? 'transient' : 'level',
    audioSpawnRepeatWhileAbove: !!audioSpawnRepeatWhileAbove,
    audioSpawnHysteresis: Number.isFinite(audioSpawnHysteresis) ? audioSpawnHysteresis : 0.08,
    audioSpawnUseGlobalPalette: !!audioSpawnUseGlobalPalette,
    audioSpawnBand: (typeof audioSpawnBand === 'string' && audioSpawnBand.length > 0) ? audioSpawnBand : 'rms',
    audioSpawnThreshold: Number.isFinite(audioSpawnThreshold) ? audioSpawnThreshold : 0.6,
    audioSpawnCooldownMs: Number.isFinite(audioSpawnCooldownMs) ? audioSpawnCooldownMs : 250,
    audioSpawnHalfLifeMs: Number.isFinite(audioSpawnHalfLifeMs) ? audioSpawnHalfLifeMs : 1500,
    audioSpawnHalfLifeEnergyFactor: Number.isFinite(audioSpawnHalfLifeEnergyFactor) ? audioSpawnHalfLifeEnergyFactor : 1.0,
    audioSpawnMaxLayers: Number.isFinite(audioSpawnMaxLayers) ? audioSpawnMaxLayers : 12,
    audioSpawnMicReactive: !!audioSpawnMicReactive,
    audioSpawnMicReactiveAmount: Number.isFinite(audioSpawnMicReactiveAmount)
      ? Math.max(0, Math.min(100, Number(audioSpawnMicReactiveAmount)))
      : (audioSpawnMicReactive ? 100 : 0),
    audioSpawnForceContourMode: !!audioSpawnForceContourMode,
    milkdropInfluence: Number.isFinite(milkdropInfluence) ? Math.max(0, Math.min(100, milkdropInfluence)) : 0,
    milkdropFeedbackEnabled: !!milkdropFeedbackEnabled,
  }), [
    parameterTargetMode,
    energyInfluence,
    audioSpawnEnabled,
    audioSpawnPresetActive,
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
    audioSpawnMicReactive,
    audioSpawnMicReactiveAmount,
    audioSpawnForceContourMode,
    milkdropInfluence,
    milkdropFeedbackEnabled,
  ]);

  const applyPayload = useCallback((payload) => {
    if (!payload || typeof payload !== 'object') return false;
    const audioConfig = (
      payload.audioConfig && typeof payload.audioConfig === 'object'
        ? payload.audioConfig
        : ((payload.settings && payload.mappings) ? payload : null)
    );
    if (audioConfig && typeof audio?.applyAudioSnapshot === 'function') {
      audio.applyAudioSnapshot(audioConfig);
    }

    const state = (payload.appState && typeof payload.appState === 'object')
      ? payload.appState
      : {};
    if (typeof state.parameterTargetMode === 'string' && state.parameterTargetMode.length > 0) {
      setParameterTargetMode?.(state.parameterTargetMode);
    }
    if (Number.isFinite(state.energyInfluence)) setEnergyInfluence?.(state.energyInfluence);
    if (typeof state.audioSpawnEnabled === 'boolean') setAudioSpawnEnabled?.(state.audioSpawnEnabled);
    if (typeof state.audioSpawnPresetActive === 'boolean') {
      setAudioSpawnPresetActive?.(state.audioSpawnPresetActive);
    } else {
      setAudioSpawnPresetActive?.(false);
    }
    if (typeof state.audioSpawnTriggerMode === 'string') setAudioSpawnTriggerMode?.(state.audioSpawnTriggerMode);
    if (typeof state.audioSpawnRepeatWhileAbove === 'boolean') setAudioSpawnRepeatWhileAbove?.(state.audioSpawnRepeatWhileAbove);
    if (Number.isFinite(state.audioSpawnHysteresis)) setAudioSpawnHysteresis?.(state.audioSpawnHysteresis);
    if (typeof state.audioSpawnUseGlobalPalette === 'boolean') setAudioSpawnUseGlobalPalette?.(state.audioSpawnUseGlobalPalette);
    if (typeof state.audioSpawnBand === 'string') setAudioSpawnBand?.(state.audioSpawnBand);
    if (Number.isFinite(state.audioSpawnThreshold)) setAudioSpawnThreshold?.(state.audioSpawnThreshold);
    if (Number.isFinite(state.audioSpawnCooldownMs)) setAudioSpawnCooldownMs?.(state.audioSpawnCooldownMs);
    if (Number.isFinite(state.audioSpawnHalfLifeMs)) setAudioSpawnHalfLifeMs?.(state.audioSpawnHalfLifeMs);
    if (Number.isFinite(state.audioSpawnHalfLifeEnergyFactor)) setAudioSpawnHalfLifeEnergyFactor?.(state.audioSpawnHalfLifeEnergyFactor);
    if (Number.isFinite(state.audioSpawnMaxLayers)) setAudioSpawnMaxLayers?.(state.audioSpawnMaxLayers);
    if (typeof state.audioSpawnMicReactive === 'boolean') setAudioSpawnMicReactive?.(state.audioSpawnMicReactive);
    if (Number.isFinite(state.audioSpawnMicReactiveAmount)) {
      setAudioSpawnMicReactiveAmount?.(state.audioSpawnMicReactiveAmount);
    } else if (typeof state.audioSpawnMicReactive === 'boolean') {
      setAudioSpawnMicReactiveAmount?.(state.audioSpawnMicReactive ? 100 : 0);
    }
    if (typeof state.audioSpawnForceContourMode === 'boolean') {
      setAudioSpawnForceContourMode?.(state.audioSpawnForceContourMode);
    }
    if (Number.isFinite(state.milkdropInfluence)) setMilkdropInfluence?.(state.milkdropInfluence);
    if (typeof state.milkdropFeedbackEnabled === 'boolean') {
      setMilkdropFeedbackEnabled?.(state.milkdropFeedbackEnabled);
    }

    if (enableAudioOnLoad) {
      audio?.setAudioEnabled?.(true);
    }

    return !!audioConfig || Object.keys(state).length > 0;
  }, [
    audio,
    enableAudioOnLoad,
    setParameterTargetMode,
    setEnergyInfluence,
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
    setMilkdropInfluence,
    setMilkdropFeedbackEnabled,
  ]);

  const saveSelectedSlot = useCallback(() => {
    if (!selectedSlot) return;
    const getAudioSnapshot = audio?.getAudioSnapshot;
    if (typeof getAudioSnapshot !== 'function') {
      setStatus({ text: 'Audio engine unavailable.', error: true });
      return;
    }

    const now = new Date().toISOString();
    const payload = {
      version: AUDIO_PRESET_VERSION,
      savedAt: now,
      audioConfig: getAudioSnapshot() || null,
      appState: { ...normalizedAppState },
    };
    updateSlot(selectedSlot.id, prev => ({ ...prev, payload, savedAt: now }));
    setStatus({ text: `Saved ${selectedSlot.name || `A${selectedSlot.id}`}.`, error: false });
  }, [audio, normalizedAppState, selectedSlot, updateSlot]);

  const loadSelectedSlot = useCallback(() => {
    if (!selectedSlot) return;
    if (!selectedSlot.payload) {
      setStatus({ text: 'Selected slot is empty.', error: true });
      return;
    }
    const applied = applyPayload(selectedSlot.payload);
    if (!applied) {
      setStatus({ text: `Could not load ${selectedSlot.name || `A${selectedSlot.id}`}.`, error: true });
      return;
    }
    setStatus({ text: `Loaded ${selectedSlot.name || `A${selectedSlot.id}`}.`, error: false });
  }, [applyPayload, selectedSlot]);

  const clearSelectedSlot = useCallback(() => {
    if (!selectedSlot) return;
    updateSlot(selectedSlot.id, prev => ({ ...prev, payload: null, savedAt: null }));
    setStatus({ text: `Cleared ${selectedSlot.name || `A${selectedSlot.id}`}.`, error: false });
  }, [selectedSlot, updateSlot]);

  const updateSelectedSlotName = useCallback((rawName, finalize = false) => {
    if (!selectedSlot) return;
    const truncated = String(rawName || '').slice(0, 18);
    const nextName = finalize
      ? (truncated.trim().length > 0 ? truncated.trim() : `A${selectedSlot.id}`)
      : truncated;
    updateSlot(selectedSlot.id, { name: nextName });
  }, [selectedSlot, updateSlot]);

  if (!audio) return null;

  return (
    <div
      className="compact-field"
      style={{
        borderTop: '1px solid rgba(255,255,255,0.1)',
        paddingTop: '0.5rem',
        marginTop: '0.5rem',
        display: 'block',
        width: '100%',
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
        <button
          type="button"
          className="btn-compact-secondary"
          style={{ fontSize: '0.72rem', padding: '2px 8px' }}
          onClick={() => setSlotsExpanded(v => !v)}
          title={slotsExpanded ? 'Collapse audio preset slots' : 'Expand audio preset slots'}
        >
          {slotsExpanded ? '▾' : '▸'} Audio Preset Slots
        </button>
        {slotsExpanded && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <button
              type="button"
              className="btn-compact-secondary"
              style={{ fontSize: '0.72rem', padding: '2px 8px' }}
              onClick={saveSelectedSlot}
              title="Save current audio + spawn setup into selected slot"
            >
              Save
            </button>
            <button
              type="button"
              className="btn-compact-secondary"
              style={{ fontSize: '0.72rem', padding: '2px 8px' }}
              onClick={loadSelectedSlot}
              disabled={!selectedSlot?.payload}
              title="Load selected audio preset slot"
            >
              Load
            </button>
          </div>
        )}
      </div>

      {slotsExpanded && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.4rem', marginTop: '0.4rem' }}>
            <select
              className="compact-select"
              value={selectedSlot?.id || 1}
              onChange={(e) => setSelectedSlotId(Number(e.target.value))}
            >
              {slots.map(slot => (
                <option key={slot.id} value={slot.id}>
                  {`Slot ${slot.id}: ${slot.name || `A${slot.id}`}${slot.payload ? ' (saved)' : ''}`}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn-compact-secondary"
              style={{ fontSize: '0.72rem', padding: '2px 8px' }}
              onClick={clearSelectedSlot}
              disabled={!selectedSlot?.payload}
              title="Clear selected slot"
            >
              Clear
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.35rem' }}>
            <span className="compact-label" style={{ minWidth: 40 }}>Name</span>
            <input
              type="text"
              value={selectedSlot?.name || ''}
              maxLength={18}
              onChange={(e) => updateSelectedSlotName(e.target.value, false)}
              onBlur={(e) => updateSelectedSlotName(e.target.value, true)}
              style={{
                flex: 1,
                fontSize: '0.72rem',
                padding: '2px 6px',
                borderRadius: 4,
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'rgba(255,255,255,0.08)',
                color: '#fff',
              }}
            />
          </div>

          <div style={{ marginTop: '0.35rem' }}>
            <label className="compact-label" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }} title="Automatically enable audio input when loading a slot">
              <input
                type="checkbox"
                checked={enableAudioOnLoad}
                onChange={(e) => setEnableAudioOnLoad(!!e.target.checked)}
              />
              Enable audio on load
            </label>
          </div>

          <div style={{ marginTop: '0.35rem', fontSize: '0.68rem', opacity: 0.72 }}>
            Saves sensitivity/band sensitivity, smoothing/release, mappings + modes, spawn settings, energy influence, and parameter target mode.
          </div>

          {selectedSlot?.savedAt ? (
            <div style={{ marginTop: '0.25rem', fontSize: '0.68rem', opacity: 0.68 }}>
              Saved: {new Date(selectedSlot.savedAt).toLocaleString()}
            </div>
          ) : (
            <div style={{ marginTop: '0.25rem', fontSize: '0.68rem', opacity: 0.58 }}>
              Slot is empty.
            </div>
          )}

          {status.text && (
            <div style={{ marginTop: '0.25rem', fontSize: '0.7rem', color: status.error ? '#ff8a80' : '#6bcb77' }}>
              {status.text}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: '0.25rem', marginTop: '0.45rem' }}>
            {slots.map(slot => {
              const isSelected = slot.id === selectedSlotId;
              const hasPayload = !!slot.payload;
              return (
                <button
                  key={slot.id}
                  type="button"
                  className="btn-compact-secondary"
                  onClick={() => setSelectedSlotId(slot.id)}
                  title={`${slot.name || `A${slot.id}`}${hasPayload ? ' • saved' : ' • empty'}`}
                  style={{
                    fontSize: '0.66rem',
                    padding: '2px 4px',
                    borderColor: hasPayload ? 'rgba(79,195,247,0.6)' : 'rgba(255,255,255,0.2)',
                    background: isSelected
                      ? (hasPayload ? 'rgba(79,195,247,0.25)' : 'rgba(255,255,255,0.12)')
                      : undefined,
                  }}
                >
                  {slot.name || `A${slot.id}`}
                </button>
              );
            })}
          </div>

          {timelineMode && (
            <div style={{ marginTop: '0.35rem', fontSize: '0.7rem', opacity: 0.65 }}>
              Timeline mode mutes live Audio + BPM automation; slot values are still saved and will run after leaving Timeline mode.
            </div>
          )}
        </>
      )}
    </div>
  );
};

// Audio Reactive Section Component - Global audio settings only
// Per-parameter audio mappings are shown alongside MIDI controls on each parameter
const AudioReactiveSection = () => {
  const audio = useAudioReactive();
  const [showSettings, setShowSettings] = useState(false);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [calibrationNote, setCalibrationNote] = useState('');
  const calibrationTimersRef = useRef({ intervalId: null, timeoutId: null });

  // Destructure with defaults to avoid conditional hook issues
  const {
    isActive = false,
    error = null,
    getFeatures = null,
    settings = { enabled: false, sensitivity: 1, bassSensitivity: 1, midsSensitivity: 1, highsSensitivity: 1, smoothing: 0.7, release: 0.85 },
    availableDevices = [],
    currentDeviceId = null,
    toggleAudio = null,
    setSensitivity = null,
    setBassSensitivity = null,
    setMidsSensitivity = null,
    setHighsSensitivity = null,
    setSmoothing = null,
    setRelease = null,
    setDeviceId = null,
    // File playback
    isFileMode = false,
    isFilePlaying = false,
    fileInfo = null,
    fileProgress = 0,
    hasStoredFile = false,
    loadAudioFile = null,
    toggleFilePlayback = null,
    seekFile = null,
    stopFilePlayback = null,
  } = audio || {};

  const clearCalibrationTimers = useCallback(() => {
    const timers = calibrationTimersRef.current;
    if (timers.intervalId) clearInterval(timers.intervalId);
    if (timers.timeoutId) clearTimeout(timers.timeoutId);
    calibrationTimersRef.current = { intervalId: null, timeoutId: null };
  }, []);
  
  // File input ref
  const fileInputRef = useRef(null);
  
  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (file && loadAudioFile) {
      await loadAudioFile(file);
    }
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  const formatTime = (seconds) => {
    if (!seconds || !Number.isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  useEffect(() => (
    () => { clearCalibrationTimers(); }
  ), [clearCalibrationTimers]);

  const runAutoCalibration = useCallback(() => {
    if (isCalibrating) {
      clearCalibrationTimers();
      setIsCalibrating(false);
      setCalibrationProgress(0);
      setCalibrationNote('Calibration stopped.');
      return;
    }

    if (!settings.enabled || !isActive || typeof getFeatures !== 'function') {
      setCalibrationNote('Enable audio and make sure input is active, then run calibration.');
      return;
    }

    const durationMs = 8000;
    const intervalMs = 50;
    const startTime = performance.now();
    const rmsSamples = [];
    const bassSamples = [];
    const midsSamples = [];
    const highsSamples = [];

    setIsCalibrating(true);
    setCalibrationProgress(0);
    setCalibrationNote('Calibrating... play representative audio now.');

    calibrationTimersRef.current.intervalId = setInterval(() => {
      const current = getFeatures() || {};
      const rms = Number.isFinite(current.rms) ? current.rms : 0;
      const bass = Number.isFinite(current.bass) ? current.bass : 0;
      const mids = Number.isFinite(current.mids) ? current.mids : 0;
      const highs = Number.isFinite(current.highs) ? current.highs : 0;
      rmsSamples.push(clampValue(rms, 0, 1));
      bassSamples.push(clampValue(bass, 0, 1));
      midsSamples.push(clampValue(mids, 0, 1));
      highsSamples.push(clampValue(highs, 0, 1));
      const elapsed = performance.now() - startTime;
      setCalibrationProgress(clampValue(elapsed / durationMs, 0, 1));
    }, intervalMs);

    calibrationTimersRef.current.timeoutId = setTimeout(() => {
      clearCalibrationTimers();
      setIsCalibrating(false);
      setCalibrationProgress(1);

      if (rmsSamples.length < 20) {
        setCalibrationNote('Calibration failed: not enough audio samples.');
        return;
      }

      const p90 = quantile(rmsSamples, 0.9);
      const p50 = quantile(rmsSamples, 0.5);
      const p10 = quantile(rmsSamples, 0.1);
      const bassP90 = quantile(bassSamples, 0.9);
      const midsP90 = quantile(midsSamples, 0.9);
      const highsP90 = quantile(highsSamples, 0.9);
      const dynamicRange = Math.max(0, p90 - p10);

      if (!Number.isFinite(p90) || p90 < 0.03) {
        setCalibrationNote('Calibration found very low signal. Raise volume or mic gain and try again.');
        return;
      }

      const targetP90 = 0.72;
      const sensitivityMultiplier = targetP90 / Math.max(0.05, p90);
      const nextSensitivity = clampValue((settings.sensitivity || 1) * sensitivityMultiplier, 0.2, 3);
      const masterRatio = nextSensitivity / Math.max(0.05, settings.sensitivity || 1);
      const targetBandP90 = 0.62;
      const nextBassSensitivity = clampValue(
        (settings.bassSensitivity || 1) * (targetBandP90 / Math.max(0.05, bassP90 * masterRatio)),
        0.2,
        3
      );
      const nextMidsSensitivity = clampValue(
        (settings.midsSensitivity || 1) * (targetBandP90 / Math.max(0.05, midsP90 * masterRatio)),
        0.2,
        3
      );
      const nextHighsSensitivity = clampValue(
        (settings.highsSensitivity || 1) * (targetBandP90 / Math.max(0.05, highsP90 * masterRatio)),
        0.2,
        3
      );

      // More transient material gets faster attack/release; sustained gets smoother/longer.
      const transientness = clampValue(dynamicRange, 0, 1);
      const nextSmoothing = clampValue(0.88 - transientness * 0.3, 0.05, 1);
      const nextRelease = clampValue(0.94 - transientness * 0.22, 0.05, 0.98);

      setSensitivity?.(nextSensitivity);
      setBassSensitivity?.(nextBassSensitivity);
      setMidsSensitivity?.(nextMidsSensitivity);
      setHighsSensitivity?.(nextHighsSensitivity);
      setSmoothing?.(nextSmoothing);
      setRelease?.(nextRelease);

      const profileLabel = transientness > 0.22 ? 'punchy' : 'smooth';
      setCalibrationNote(
        `Calibrated (${profileLabel}): master ${nextSensitivity.toFixed(2)}, bass ${nextBassSensitivity.toFixed(2)}, mids ${nextMidsSensitivity.toFixed(2)}, highs ${nextHighsSensitivity.toFixed(2)}, attack ${nextSmoothing.toFixed(2)}, release ${nextRelease.toFixed(2)} (RMS p50=${p50.toFixed(2)}, p90=${p90.toFixed(2)}).`
      );
    }, durationMs);
  }, [
    isCalibrating,
    clearCalibrationTimers,
    settings.enabled,
    settings.sensitivity,
    settings.bassSensitivity,
    settings.midsSensitivity,
    settings.highsSensitivity,
    isActive,
    getFeatures,
    setSensitivity,
    setBassSensitivity,
    setMidsSensitivity,
    setHighsSensitivity,
    setSmoothing,
    setRelease,
  ]);

  if (!audio) {
    return null;
  }

  return (
    <div
      className="compact-field"
      style={{
        borderTop: '1px solid rgba(255,255,255,0.1)',
        paddingTop: '0.5rem',
        marginTop: '0.5rem',
        display: 'block',
        width: '100%',
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="compact-label" style={{ fontWeight: 600 }}>🎵 Audio Input</span>
        <button
          type="button"
          className="icon-btn sm"
          title="Audio settings"
          aria-label="Audio settings"
          onClick={(e) => { e.stopPropagation(); setShowSettings(s => !s); }}
        >⚙</button>
      </div>

      {/* Enable/Disable toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
        <label className="compact-label" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={() => toggleAudio()}
          />
          {settings.enabled 
            ? (isActive ? (isFileMode ? 'Playing File' : 'Listening') : 'Starting...') 
            : (hasStoredFile ? 'Enable Audio (file saved)' : 'Enable Audio')}
        </label>
        {error && <span style={{ color: '#ff6b6b', fontSize: '0.75rem' }}>{error}</span>}
      </div>

      {/* Device selector (shown when enabled and not in file mode) */}
      {settings.enabled && !isFileMode && (
        <div style={{ marginTop: '0.25rem' }}>
          <select
            className="compact-select"
            style={{ fontSize: '0.75rem', width: '100%' }}
            value={currentDeviceId || ''}
            onChange={(e) => setDeviceId(e.target.value || null)}
          >
            <option value="">Default Input Device</option>
            {availableDevices.map(device => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Device ${device.deviceId.slice(0, 8)}`}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* File playback controls */}
      {isFileMode && fileInfo && (
        <div style={{ marginTop: '0.5rem', padding: '0.5rem', borderRadius: 6, background: 'rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>🎵</span>
            <span style={{ fontSize: '0.75rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {fileInfo.name}
            </span>
            <button
              type="button"
              className="btn-compact-secondary"
              style={{ fontSize: '0.7rem', padding: '2px 6px' }}
              onClick={stopFilePlayback}
              title="Close file and return to mic input"
            >
              ✕
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn-compact-secondary"
              style={{ fontSize: '0.8rem', padding: '4px 8px', minWidth: '2rem' }}
              onClick={toggleFilePlayback}
              title={isFilePlaying ? 'Pause' : 'Play'}
            >
              {isFilePlaying ? '⏸' : '▶'}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.001}
              value={fileProgress}
              onChange={(e) => seekFile(parseFloat(e.target.value))}
              style={{ flex: 1, height: 4 }}
              className="compact-range"
            />
            <span style={{ fontSize: '0.7rem', opacity: 0.7, minWidth: '3rem', textAlign: 'right' }}>
              {formatTime(fileProgress * fileInfo.duration)} / {formatTime(fileInfo.duration)}
            </span>
          </div>
        </div>
      )}

      {/* Load file button (shown when enabled) */}
      {settings.enabled && (
        <div style={{ marginTop: '0.25rem' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            className="btn-compact-secondary"
            style={{ fontSize: '0.75rem', width: '100%' }}
            onClick={() => fileInputRef.current?.click()}
          >
            {isFileMode ? '🎵 Load Different File' : '📁 Play from File'}
          </button>
        </div>
      )}

      {/* Settings panel */}
      {showSettings && (
        <div style={{ marginTop: '0.5rem', padding: '0.5rem', borderRadius: 6, background: 'rgba(255,255,255,0.05)' }}>
          {/* Sensitivity slider */}
          <div style={{ marginBottom: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
              <span className="compact-label">Sensitivity</span>
              <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>{settings.sensitivity.toFixed(2)}</span>
            </div>
            <input
              className="compact-range"
              type="range"
              min={0}
              max={3}
              step={0.05}
              value={settings.sensitivity}
              onChange={(e) => setSensitivity(parseFloat(e.target.value))}
            />
          </div>

          <div style={{ marginBottom: '0.5rem', padding: '0.4rem', borderRadius: 6, background: 'rgba(255,255,255,0.04)' }}>
            <div style={{ fontSize: '0.72rem', opacity: 0.8, marginBottom: '0.3rem' }}>Band Sensitivity</div>

            <div style={{ marginBottom: '0.35rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                <span className="compact-label">Bass</span>
                <span style={{ fontSize: '0.72rem', opacity: 0.7 }}>{Number(settings.bassSensitivity ?? 1).toFixed(2)}</span>
              </div>
              <input
                className="compact-range"
                type="range"
                min={0}
                max={3}
                step={0.05}
                value={Number.isFinite(settings.bassSensitivity) ? settings.bassSensitivity : 1}
                onChange={(e) => setBassSensitivity?.(parseFloat(e.target.value))}
              />
            </div>

            <div style={{ marginBottom: '0.35rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                <span className="compact-label">Mids</span>
                <span style={{ fontSize: '0.72rem', opacity: 0.7 }}>{Number(settings.midsSensitivity ?? 1).toFixed(2)}</span>
              </div>
              <input
                className="compact-range"
                type="range"
                min={0}
                max={3}
                step={0.05}
                value={Number.isFinite(settings.midsSensitivity) ? settings.midsSensitivity : 1}
                onChange={(e) => setMidsSensitivity?.(parseFloat(e.target.value))}
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                <span className="compact-label">Highs</span>
                <span style={{ fontSize: '0.72rem', opacity: 0.7 }}>{Number(settings.highsSensitivity ?? 1).toFixed(2)}</span>
              </div>
              <input
                className="compact-range"
                type="range"
                min={0}
                max={3}
                step={0.05}
                value={Number.isFinite(settings.highsSensitivity) ? settings.highsSensitivity : 1}
                onChange={(e) => setHighsSensitivity?.(parseFloat(e.target.value))}
              />
            </div>
          </div>

          {/* Smoothing slider */}
          <div style={{ marginBottom: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
              <span className="compact-label">Smoothing (Attack)</span>
              <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>{settings.smoothing.toFixed(2)}</span>
            </div>
            <input
              className="compact-range"
              type="range"
              min={0.05}
              max={1}
              step={0.05}
              value={settings.smoothing}
              onChange={(e) => setSmoothing(parseFloat(e.target.value))}
            />
          </div>

          {/* Release slider */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
              <span className="compact-label">Release (Falloff)</span>
              <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>{settings.release.toFixed(2)}</span>
            </div>
            <input
              className="compact-range"
              type="range"
              min={0.05}
              max={0.98}
              step={0.05}
              value={settings.release}
              onChange={(e) => setRelease(parseFloat(e.target.value))}
            />
          </div>

          <div style={{ marginTop: '0.55rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.12)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn-compact-secondary"
                style={{ fontSize: '0.74rem', flex: 1 }}
                onClick={runAutoCalibration}
              >
                {isCalibrating ? 'Stop Calibration' : 'Auto Calibrate (8s)'}
              </button>
            </div>

            {isCalibrating && (
              <div style={{ marginTop: '0.35rem' }}>
                <div style={{ height: 5, background: 'rgba(255,255,255,0.12)', borderRadius: 3, overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${(calibrationProgress * 100).toFixed(1)}%`,
                      background: '#4fc3f7',
                      transition: 'width 0.08s linear',
                    }}
                  />
                </div>
              </div>
            )}

            {calibrationNote && (
              <div style={{ marginTop: '0.35rem', fontSize: '0.7rem', opacity: 0.75 }}>
                {calibrationNote}
              </div>
            )}
          </div>

          <div style={{ marginTop: '0.5rem', fontSize: '0.7rem', opacity: 0.6 }}>
            Higher smoothing = faster response. Higher release = slower decay. Map audio to parameters using the Audio dropdown on each control.
          </div>
        </div>
      )}
    </div>
  );
};

const PatchMappingCard = ({
  paramId,
  mapping,
  debugValue,
  liveFeatures,
  setMapping,
  clearMapping,
  disabledByTimeline,
  triggerDefaults,
  triggerSourceOptions,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [showModeSettings, setShowModeSettings] = useState(false);

  const band = mapping?.band || 'none';
  const range = mapping?.range || defaultRangeForParam(paramId);
  const gain = Number.isFinite(Number(mapping?.gain)) ? Number(mapping.gain) : 1;
  const mode = mapping?.mode || 'direct';
  const modeSettings = useMemo(() => (
    (mapping?.modeSettings && typeof mapping.modeSettings === 'object')
      ? mapping.modeSettings
      : (DEFAULT_MODE_SETTINGS[mode] || {})
  ), [mapping, mode]);
  const trigger = useMemo(() => (
    normalizeMatrixTrigger(mapping?.trigger, triggerDefaults)
  ), [mapping, triggerDefaults]);

  const debug = debugValue || null;
  const fallbackInput = Number.isFinite(liveFeatures[band]) ? liveFeatures[band] : 0;
  const input = Number.isFinite(debug?.raw) ? debug.raw : fallbackInput;
  const processed = Number.isFinite(debug?.processed) ? debug.processed : input;
  const output = Number.isFinite(debug?.mapped) ? debug.mapped : null;

  const updateMapping = useCallback((patch) => {
    if (!paramId || typeof setMapping !== 'function') return;
    setMapping(paramId, {
      band,
      range,
      gain,
      mode,
      modeSettings,
      trigger,
      ...patch,
    });
  }, [paramId, setMapping, band, range, gain, mode, modeSettings, trigger]);

  const updateTrigger = useCallback((patch) => {
    const merged = normalizeMatrixTrigger({ ...trigger, ...(patch || {}) }, triggerDefaults);
    updateMapping({ trigger: merged });
  }, [trigger, triggerDefaults, updateMapping]);

  const bandColor = { rms: '#4fc3f7', bass: '#ff6b6b', mids: '#ffd93d', highs: '#6bcb77' }[band] || '#888';

  return (
    <div style={{
      borderRadius: 6,
      border: `1px solid ${band !== 'none' ? bandColor + '44' : 'rgba(255,255,255,0.1)'}`,
      background: band !== 'none' ? bandColor + '0a' : 'rgba(255,255,255,0.02)',
      overflow: 'hidden',
    }}>
      {/* Header row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto auto auto',
        gap: '0.3rem',
        padding: '0.35rem 0.45rem',
        alignItems: 'center',
      }}>
        <button
          type="button"
          className="btn-compact-secondary"
          onClick={() => setExpanded(v => !v)}
          style={{
            fontSize: '0.7rem',
            padding: '2px 6px',
            textAlign: 'left',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            minWidth: 0,
            borderColor: 'transparent',
            background: 'transparent',
            color: '#fff',
            fontWeight: 500,
          }}
          title={`${paramId} — click to ${expanded ? 'collapse' : 'expand'}`}
        >
          <span style={{ opacity: 0.5, marginRight: '0.3rem' }}>{expanded ? '▾' : '▸'}</span>
          {prettyParamLabel(paramId)}
        </button>

        <select
          className="compact-select"
          value={band}
          disabled={disabledByTimeline}
          onChange={(e) => updateMapping({ band: e.target.value })}
          style={{ minWidth: 0, fontSize: '0.66rem', height: 24, width: 62 }}
        >
          {PATCH_MATRIX_BANDS.map((b) => (
            <option key={b.id} value={b.id}>{b.label}</option>
          ))}
        </select>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', minWidth: 72 }} title={`Gain: ${gain.toFixed(2)}`}>
          <span style={{ fontSize: '0.58rem', opacity: 0.6 }}>G</span>
          <input
            type="range"
            min={0}
            max={4}
            step={0.05}
            value={gain}
            disabled={disabledByTimeline || band === 'none'}
            onChange={(e) => updateMapping({ gain: parseFloat(e.target.value) })}
            style={{ width: 52, height: 14, accentColor: bandColor }}
          />
          <span style={{ fontSize: '0.58rem', opacity: 0.7, minWidth: 22 }}>{gain.toFixed(1)}</span>
        </div>

        <button
          type="button"
          className="btn-compact-secondary"
          onClick={() => clearMapping?.(paramId)}
          disabled={disabledByTimeline}
          title="Remove mapping"
          style={{ fontSize: '0.62rem', padding: '2px 5px', lineHeight: 1, color: '#ff8a80' }}
        >
          ✕
        </button>
      </div>

      {/* Live mini-meter */}
      {band !== 'none' && (
        <div style={{ padding: '0 0.45rem 0.25rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <div style={{ flex: 1, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${clampValue((processed || 0) * 100, 0, 100)}%`, background: bandColor, transition: 'width 0.08s' }} />
          </div>
          <span style={{ fontSize: '0.58rem', opacity: 0.65, minWidth: 52 }}>
            {Number.isFinite(output) ? output.toFixed(2) : '—'}
            {trigger.enabled && debug?.trigger?.triggered ? (debug.trigger.direction === 'up' ? ' ↑' : ' ↓') : ''}
          </span>
        </div>
      )}

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: '0.3rem 0.45rem 0.45rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {/* Range + Mode row */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.62rem', opacity: 0.6, width: 34 }}>Range</span>
            <BufferedNumberInput
              value={Number.isFinite(range.outputMin) ? range.outputMin : 0}
              step={0.05}
              onCommit={(next) => updateMapping({ range: { ...range, outputMin: next } })}
              className="compact-number"
              style={{ width: '4.5rem' }}
              disabled={disabledByTimeline}
            />
            <span style={{ fontSize: '0.62rem', opacity: 0.5 }}>→</span>
            <BufferedNumberInput
              value={Number.isFinite(range.outputMax) ? range.outputMax : 1}
              step={0.05}
              onCommit={(next) => updateMapping({ range: { ...range, outputMax: next } })}
              className="compact-number"
              style={{ width: '4.5rem' }}
              disabled={disabledByTimeline}
            />
            <select
              className="compact-select"
              value={mode}
              disabled={band === 'none' || disabledByTimeline}
              onChange={(e) => {
                const nextMode = e.target.value;
                const fallback = DEFAULT_MODE_SETTINGS[nextMode] || {};
                updateMapping({ mode: nextMode, modeSettings: fallback });
                if (nextMode !== 'direct') setShowModeSettings(true);
              }}
              style={{ minWidth: 0, fontSize: '0.64rem', flex: '1 1 auto', maxWidth: 110 }}
            >
              {AUDIO_MAPPING_MODES.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Mode settings */}
          {band !== 'none' && mode !== 'direct' && (
            <div style={{ marginTop: '0.3rem' }}>
              <button
                type="button"
                className="btn-compact-secondary"
                style={{ fontSize: '0.62rem', padding: '1px 5px' }}
                onClick={() => setShowModeSettings(v => !v)}
              >
                {showModeSettings ? 'Hide Mode Settings' : 'Mode Settings'}
              </button>
              {showModeSettings && (
                <div style={{ marginTop: '0.25rem', padding: '0.25rem', borderRadius: 4, background: 'rgba(167, 139, 250, 0.08)' }}>
                  <AudioModeSettings
                    mode={mode}
                    modeSettings={modeSettings}
                    onSettingsChange={(next) => updateMapping({ modeSettings: next })}
                  />
                </div>
              )}
            </div>
          )}

          {/* Trigger section */}
          {band !== 'none' && (
            <div style={{ marginTop: '0.35rem', padding: '0.3rem', borderRadius: 4, background: 'rgba(79,195,247,0.06)' }}>
              <label className="compact-label" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.66rem' }}>
                <input
                  type="checkbox"
                  checked={!!trigger.enabled}
                  disabled={disabledByTimeline}
                  onChange={(e) => updateTrigger({ enabled: !!e.target.checked })}
                />
                Threshold Trigger
              </label>

              {trigger.enabled && (
                <div style={{ marginTop: '0.3rem', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.25rem' }}>
                  <div>
                    <div style={{ fontSize: '0.56rem', opacity: 0.55, marginBottom: 1 }}>Action</div>
                    <select
                      className="compact-select"
                      value={trigger.action || 'modulate'}
                      disabled={disabledByTimeline}
                      onChange={(e) => updateTrigger({ action: e.target.value })}
                      style={{ width: '100%', fontSize: '0.64rem' }}
                    >
                      {PATCH_MATRIX_TRIGGER_ACTION_OPTIONS.map((opt) => (
                        <option key={opt.id} value={opt.id}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.56rem', opacity: 0.55, marginBottom: 1 }}>Fire When</div>
                    <select
                      className="compact-select"
                      value={trigger.mode}
                      disabled={disabledByTimeline}
                      onChange={(e) => updateTrigger({ mode: e.target.value })}
                      style={{ width: '100%', fontSize: '0.64rem' }}
                    >
                      {PATCH_MATRIX_TRIGGER_MODE_OPTIONS.map((opt) => (
                        <option key={opt.id} value={opt.id}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.56rem', opacity: 0.55, marginBottom: 1 }}>Source</div>
                    <select
                      className="compact-select"
                      value={trigger.source}
                      disabled={disabledByTimeline}
                      onChange={(e) => updateTrigger({ source: e.target.value })}
                      style={{ width: '100%', fontSize: '0.64rem' }}
                    >
                      {triggerSourceOptions.map((source) => (
                        <option key={source} value={source}>{source === 'raw' ? 'Raw' : 'Processed'}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.56rem', opacity: 0.55, marginBottom: 1 }}>Cooldown (ms)</div>
                    <BufferedNumberInput
                      value={Number.isFinite(trigger.cooldownMs) ? trigger.cooldownMs : 250}
                      step={10}
                      onCommit={(next) => updateTrigger({ cooldownMs: Math.max(0, next) })}
                      className="compact-number"
                      style={{ width: '100%' }}
                      disabled={disabledByTimeline}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.56rem', opacity: 0.55, marginBottom: 1 }}>Rise Threshold</div>
                    <BufferedNumberInput
                      value={Number.isFinite(trigger.riseThreshold) ? trigger.riseThreshold : 0.65}
                      step={0.01}
                      onCommit={(next) => updateTrigger({ riseThreshold: clampValue(next, 0, 1) })}
                      className="compact-number"
                      style={{ width: '100%' }}
                      disabled={disabledByTimeline}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.56rem', opacity: 0.55, marginBottom: 1 }}>Fall Threshold</div>
                    <BufferedNumberInput
                      value={Number.isFinite(trigger.fallThreshold) ? trigger.fallThreshold : 0.55}
                      step={0.01}
                      onCommit={(next) => updateTrigger({ fallThreshold: clampValue(next, 0, trigger.riseThreshold) })}
                      className="compact-number"
                      style={{ width: '100%' }}
                      disabled={disabledByTimeline}
                    />
                  </div>
                  <label className="compact-label" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.62rem', gridColumn: 'span 2' }}>
                    <input
                      type="checkbox"
                      checked={!!trigger.reverseOnFall}
                      disabled={disabledByTimeline}
                      onChange={(e) => updateTrigger({ reverseOnFall: !!e.target.checked })}
                    />
                    Reverse on down-cross
                  </label>
                </div>
              )}
            </div>
          )}

          {/* Debug values */}
          {band !== 'none' && (
            <div style={{ marginTop: '0.25rem', display: 'flex', gap: '0.5rem', fontSize: '0.6rem', opacity: 0.65 }}>
              <span>In {input.toFixed(2)}</span>
              <span>Proc {processed.toFixed(2)}</span>
              <span>Out {Number.isFinite(output) ? output.toFixed(2) : '—'}</span>
              {gain !== 1 && <span>×{gain.toFixed(1)}</span>}
              {trigger.enabled && debug?.trigger && (
                <span>
                  Trig {Number.isFinite(debug.trigger.sourceValue) ? debug.trigger.sourceValue.toFixed(2) : '—'}
                  {debug.trigger.active ? ' ▲' : ''}
                  {debug.trigger.triggered ? ` ${debug.trigger.direction === 'down' ? '↓' : '↑'}` : ''}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const AudioPatchMatrixSection = ({ isActiveTab = true, timelineMode = false, layers = [] } = {}) => {
  const audio = useAudioReactive();
  const [liveFeatures, setLiveFeatures] = useState({
    rms: 0,
    bass: 0,
    mids: 0,
    highs: 0,
    pitch: 0,
    transient: 0,
    beat: 0,
    waveformEnergy: 0,
  });
  const [debugValues, setDebugValues] = useState({});
  const [addParamId, setAddParamId] = useState('');
  const [addLayerTarget, setAddLayerTarget] = useState('all');

  const rawMappings = audio?.mappings;
  const mappings = useMemo(() => (
    rawMappings && typeof rawMappings === 'object' ? rawMappings : {}
  ), [rawMappings]);
  const setMapping = audio?.setMapping;
  const clearMappingFn = audio?.clearMapping;
  const getFeatures = audio?.getFeatures;
  const getAllMappingDebug = audio?.getAllMappingDebug;
  const enabled = !!audio?.settings?.enabled;
  const disabledByTimeline = !!timelineMode;
  const triggerSourceOptions = audio?.AUDIO_TRIGGER_SOURCES || ['processed', 'raw'];
  const triggerDefaults = useMemo(
    () => normalizeMatrixTrigger(audio?.DEFAULT_TRIGGER || DEFAULT_MATRIX_TRIGGER),
    [audio?.DEFAULT_TRIGGER],
  );

  const layerCount = Array.isArray(layers) ? layers.length : 0;

  // Check if selected param from catalog is per-layer
  const selectedCatalogItem = useMemo(() => (
    PATCH_MATRIX_PARAM_CATALOG.find(item => item.id === addParamId) || null
  ), [addParamId]);
  const isSelectedPerLayer = !!selectedCatalogItem?.perLayer;

  // Active mappings: params with a band that isn't 'none'
  const activeMappingIds = useMemo(() => (
    Object.entries(mappings)
      .filter(([, m]) => m && m.band && m.band !== 'none')
      .map(([id]) => id)
      .sort((a, b) => prettyParamLabel(a).localeCompare(prettyParamLabel(b)))
  ), [mappings]);

  // Available params for "Add" dropdown
  // Global params: hide if already active. Per-layer params: always show (can add multiple targets).
  const availableParams = useMemo(() => {
    const activeSet = new Set(activeMappingIds);
    const grouped = {};
    PATCH_MATRIX_PARAM_GROUPS.forEach(g => { grouped[g] = []; });
    PATCH_MATRIX_PARAM_CATALOG.forEach(item => {
      if (item.perLayer) {
        const g = item.group || 'Other';
        if (!grouped[g]) grouped[g] = [];
        grouped[g].push(item);
      } else if (!activeSet.has(item.id)) {
        const g = item.group || 'Other';
        if (!grouped[g]) grouped[g] = [];
        grouped[g].push(item);
      }
    });
    return grouped;
  }, [activeMappingIds]);

  const mappedCount = activeMappingIds.length;

  // Poll features + debug
  useEffect(() => {
    if (!isActiveTab) return undefined;
    const tick = () => {
      const features = (typeof getFeatures === 'function' ? getFeatures() : {}) || {};
      setLiveFeatures({
        rms: Number.isFinite(features.rms) ? features.rms : 0,
        bass: Number.isFinite(features.bass) ? features.bass : 0,
        mids: Number.isFinite(features.mids) ? features.mids : 0,
        highs: Number.isFinite(features.highs) ? features.highs : 0,
        pitch: Number.isFinite(features.pitch) ? features.pitch : 0,
        transient: Number.isFinite(features.transient) ? features.transient : 0,
        beat: Number.isFinite(features.beat) ? features.beat : 0,
        waveformEnergy: Number.isFinite(features.waveformEnergy) ? features.waveformEnergy : 0,
      });
      const debug = (typeof getAllMappingDebug === 'function' ? getAllMappingDebug() : {}) || {};
      setDebugValues((debug && typeof debug === 'object') ? debug : {});
    };
    tick();
    const intervalId = setInterval(tick, 100);
    return () => clearInterval(intervalId);
  }, [isActiveTab, getFeatures, getAllMappingDebug]);

  const handleAddMapping = useCallback(() => {
    if (!addParamId || typeof setMapping !== 'function') return;
    const catalogItem = PATCH_MATRIX_PARAM_CATALOG.find(item => item.id === addParamId);
    const finalParamId = catalogItem?.perLayer
      ? buildPerLayerParamId(addParamId, addLayerTarget)
      : addParamId;
    const existing = mappings?.[finalParamId];
    if (existing && existing.band && existing.band !== 'none') return;
    setMapping(finalParamId, {
      band: 'rms',
      range: defaultRangeForParam(finalParamId),
      gain: 1,
    });
    setAddParamId('');
    setAddLayerTarget('all');
  }, [addParamId, addLayerTarget, mappings, setMapping]);

  if (!audio) {
    return (
      <div className="compact-field" style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '0.5rem', marginTop: '0.5rem' }}>
        <div style={{ fontSize: '0.72rem', opacity: 0.75 }}>Audio patch matrix unavailable (audio context not found).</div>
      </div>
    );
  }

  return (
    <div
      className="compact-field"
      style={{
        borderTop: '1px solid rgba(255,255,255,0.1)',
        paddingTop: '0.5rem',
        marginTop: '0.5rem',
        display: 'block',
        width: '100%',
        minWidth: 0,
        overflowX: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
        <span className="compact-label" style={{ fontWeight: 600 }}>🧩 Audio Patch Matrix</span>
        <span className="compact-label" style={{ opacity: 0.65, fontSize: '0.68rem' }}>{mappedCount} active</span>
      </div>

      {/* Live band meters */}
      <div style={{ marginTop: '0.3rem', display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.3rem' }}>
        {[
          { id: 'rms', label: 'Level', color: '#4fc3f7' },
          { id: 'bass', label: 'Bass', color: '#ff6b6b' },
          { id: 'mids', label: 'Mids', color: '#ffd93d' },
          { id: 'highs', label: 'Highs', color: '#6bcb77' },
          { id: 'pitch', label: 'Pitch', color: '#90caf9' },
          { id: 'transient', label: 'Transient', color: '#ff8a65' },
          { id: 'beat', label: 'Beat', color: '#ce93d8' },
          { id: 'waveformEnergy', label: 'Wave', color: '#80cbc4' },
        ].map(({ id, label, color }) => (
          <div key={id} style={{ fontSize: '0.62rem', opacity: 0.8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{label}</span>
              <span style={{ opacity: 0.6 }}>{(liveFeatures[id] || 0).toFixed(2)}</span>
            </div>
            <div style={{ height: 4, borderRadius: 3, background: 'rgba(255,255,255,0.1)', overflow: 'hidden', marginTop: '0.08rem' }}>
              <div style={{ height: '100%', width: `${clampValue((liveFeatures[id] || 0) * 100, 0, 100)}%`, background: color, transition: 'width 0.08s' }} />
            </div>
          </div>
        ))}
      </div>

      {/* Add mapping */}
      <div style={{ marginTop: '0.4rem', display: 'flex', gap: '0.3rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          className="compact-select"
          value={addParamId}
          onChange={(e) => { setAddParamId(e.target.value); setAddLayerTarget('all'); }}
          style={{ flex: 1, minWidth: 0, fontSize: '0.66rem' }}
        >
          <option value="">+ Add parameter...</option>
          {PATCH_MATRIX_PARAM_GROUPS.map(group => {
            const items = availableParams[group];
            if (!items || items.length === 0) return null;
            return (
              <optgroup key={group} label={group}>
                {items.map(item => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </optgroup>
            );
          })}
        </select>
        {isSelectedPerLayer && (
          <select
            className="compact-select"
            value={addLayerTarget}
            onChange={(e) => setAddLayerTarget(e.target.value)}
            style={{ width: 'auto', minWidth: '5.5rem', fontSize: '0.66rem' }}
          >
            <option value="all">All Layers</option>
            {Array.from({ length: layerCount }, (_, i) => (
              <option key={i} value={String(i + 1)}>Layer {i + 1}</option>
            ))}
          </select>
        )}
        <button
          type="button"
          className="btn-compact-secondary"
          onClick={handleAddMapping}
          disabled={!addParamId || disabledByTimeline}
          style={{ fontSize: '0.66rem', padding: '3px 10px', whiteSpace: 'nowrap' }}
        >
          Add
        </button>
      </div>

      {/* Active mapping cards */}
      <div style={{ marginTop: '0.4rem', display: 'grid', gap: '0.3rem' }}>
        {activeMappingIds.length === 0 ? (
          <div style={{ fontSize: '0.7rem', opacity: 0.55, padding: '0.5rem 0' }}>
            No active mappings. Use the dropdown above to add a parameter.
          </div>
        ) : (
          activeMappingIds.map((paramId) => (
            <PatchMappingCard
              key={paramId}
              paramId={paramId}
              mapping={mappings[paramId]}
              debugValue={debugValues[paramId]}
              liveFeatures={liveFeatures}
              setMapping={setMapping}
              clearMapping={clearMappingFn}
              disabledByTimeline={disabledByTimeline}
              triggerDefaults={triggerDefaults}
              triggerSourceOptions={triggerSourceOptions}
            />
          ))
        )}
      </div>

      {!enabled && (
        <div style={{ marginTop: '0.35rem', fontSize: '0.68rem', opacity: 0.6 }}>
          Enable Audio Input above to audition patch connections.
        </div>
      )}
      {disabledByTimeline && (
        <div style={{ marginTop: '0.35rem', fontSize: '0.68rem', opacity: 0.6 }}>
          Editing is disabled while Timeline mode is active.
        </div>
      )}
    </div>
  );
};

const AudioSpawnSection = ({
  isActiveTab = true,
  timelineMode = false,
  layers = [],
  selectedLayerIndex = 0,
  energyInfluence = 0,
  setEnergyInfluence = null,
  audioSpawnEnabled = false,
  setAudioSpawnEnabled = null,
  audioSpawnTriggerMode = 'level',
  setAudioSpawnTriggerMode = null,
  audioSpawnRepeatWhileAbove = true,
  setAudioSpawnRepeatWhileAbove = null,
  audioSpawnHysteresis = 0.08,
  setAudioSpawnHysteresis = null,
  audioSpawnBand = 'rms',
  setAudioSpawnBand = null,
  audioSpawnThreshold = 0.6,
  setAudioSpawnThreshold = null,
  audioSpawnCooldownMs = 250,
  setAudioSpawnCooldownMs = null,
  audioSpawnHalfLifeMs = 1500,
  setAudioSpawnHalfLifeMs = null,
  audioSpawnHalfLifeEnergyFactor = 1.0,
  setAudioSpawnHalfLifeEnergyFactor = null,
  audioSpawnMaxLayers = 12,
  setAudioSpawnMaxLayers = null,
  audioSpawnMicReactive = false,
  setAudioSpawnMicReactive = null,
  audioSpawnMicReactiveAmount = 100,
  setAudioSpawnMicReactiveAmount = null,
  audioSpawnForceContourMode = false,
  setAudioSpawnForceContourMode = null,
  audioSpawnUseGlobalPalette = false,
  setAudioSpawnUseGlobalPalette = null,
  milkdropInfluence = 0,
  setMilkdropInfluence = null,
  milkdropFeedbackEnabled = true,
  setMilkdropFeedbackEnabled = null,
} = {}) => {
  const audio = useAudioReactive();
  const [bandValue, setBandValue] = useState(0);
  const [pitchMeterExpanded, setPitchMeterExpanded] = useState(false);
  const [pitchMeterEnabled, setPitchMeterEnabled] = useState(true);
  const [pitchMeterValue, setPitchMeterValue] = useState({
    hz: 0,
    normalized: 0,
    confidence: 0,
  });

  const enabled = !!audio?.settings?.enabled;
  const getFeatures = audio?.getFeatures;
  const spawnBandOptions = useMemo(() => {
    const available = Array.isArray(audio?.AUDIO_BANDS) ? audio.AUDIO_BANDS : ['rms', 'bass', 'mids', 'highs'];
    return available.filter((id) => id !== 'none');
  }, [audio?.AUDIO_BANDS]);

  useEffect(() => {
    if (!isActiveTab || !enabled || typeof getFeatures !== 'function') {
      setBandValue(0);
      setPitchMeterValue({ hz: 0, normalized: 0, confidence: 0 });
      return undefined;
    }

    let intervalId;
    const tick = () => {
      const features = getFeatures?.() || {};
      const v = typeof features?.[audioSpawnBand] === 'number' ? features[audioSpawnBand] : 0;
      setBandValue(v);
      if (pitchMeterEnabled) {
        setPitchMeterValue({
          hz: Number.isFinite(features?.pitchHz) ? features.pitchHz : 0,
          normalized: clampValue(Number(features?.pitch) || 0, 0, 1),
          confidence: clampValue(Number(features?.pitchConfidence) || 0, 0, 1),
        });
      }
    };
    intervalId = setInterval(tick, 50);
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isActiveTab, enabled, getFeatures, audioSpawnBand, pitchMeterEnabled]);

  const disabledByTimeline = !!timelineMode;
  const canRun = !disabledByTimeline && enabled;
  const mode = (audioSpawnTriggerMode === 'transient') ? 'transient' : 'level';
  const safeLayers = Array.isArray(layers) ? layers : [];
  const sourceIndex = Math.max(0, Math.min(
    Number.isFinite(selectedLayerIndex) ? selectedLayerIndex : 0,
    Math.max(0, safeLayers.length - 1),
  ));
  const sourceLayer = safeLayers[sourceIndex] || null;
  const sourceLayerLabel = sourceLayer?.name && String(sourceLayer.name).trim().length
    ? String(sourceLayer.name).trim()
    : `Layer ${sourceIndex + 1}`;
  const [showSettingsWhenDisabled, setShowSettingsWhenDisabled] = useState(false);
  const showAdvancedControls = !!audioSpawnEnabled || showSettingsWhenDisabled;
  const milkdropInfluenceValue = clampValue(Number(milkdropInfluence) || 0, 0, 100);
  const micReactiveAmountValue = clampValue(
    Number.isFinite(Number(audioSpawnMicReactiveAmount))
      ? Number(audioSpawnMicReactiveAmount)
      : (audioSpawnMicReactive ? 100 : 0),
    0,
    100,
  );
  const pitchLabel = pitchToNoteLabel(pitchMeterValue.hz);
  const pitchHzText = (Number.isFinite(pitchMeterValue.hz) && pitchMeterValue.hz > 0)
    ? `${pitchMeterValue.hz.toFixed(1)} Hz`
    : '— Hz';

  return (
    <div
      className="compact-field"
      style={{
        borderTop: '1px solid rgba(255,255,255,0.1)',
        paddingTop: '0.5rem',
        marginTop: '0.5rem',
        display: 'block',
        width: '100%',
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
        <span className="compact-label" style={{ fontWeight: 600 }}>⚡ Audio Spawn (Live)</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          {!audioSpawnEnabled && (
            <button
              type="button"
              className="icon-btn sm"
              title={showSettingsWhenDisabled ? 'Hide Audio Spawn settings' : 'Show Audio Spawn settings'}
              aria-label={showSettingsWhenDisabled ? 'Hide Audio Spawn settings' : 'Show Audio Spawn settings'}
              onClick={() => setShowSettingsWhenDisabled(v => !v)}
            >
              ⚙️
            </button>
          )}
          <label className="compact-label" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }} title="Spawn temporary layers on audio threshold crossings (not exported)">
            <input
              type="checkbox"
              checked={!!audioSpawnEnabled}
              disabled={!setAudioSpawnEnabled || disabledByTimeline}
              onChange={(e) => {
                const next = !!e.target.checked;
                setAudioSpawnEnabled?.(next);
                if (!next) setShowSettingsWhenDisabled(false);
              }}
            />
            Enabled
          </label>
        </div>
      </div>

      <div style={{ marginTop: '0.2rem', fontSize: '0.68rem', opacity: 0.72 }}>
        Spawn Source: {sourceLayerLabel} (#{sourceIndex + 1})
      </div>

      {showAdvancedControls && (
        <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem', opacity: canRun ? 1 : 0.7 }}>
        <span className="compact-label" style={{ width: 58 }}>Band</span>
        <select
          className="compact-select"
          style={{ fontSize: '0.75rem', flex: 1 }}
          value={audioSpawnBand || 'rms'}
          disabled={!setAudioSpawnBand || disabledByTimeline}
          onChange={(e) => setAudioSpawnBand?.(e.target.value)}
        >
          {spawnBandOptions.map((id) => {
            const label = (
              id === 'rms' ? 'Level'
                : id === 'waveformEnergy' ? 'Wave Energy'
                : id.charAt(0).toUpperCase() + id.slice(1)
            );
            return (
              <option key={id} value={id}>{label}</option>
            );
          })}
        </select>
        <span className="compact-label" style={{ fontSize: '0.75rem', opacity: 0.7, minWidth: 48, textAlign: 'right' }}>
          {Number.isFinite(bandValue) ? bandValue.toFixed(2) : '0.00'}
        </span>
      </div>

      <div style={{ marginTop: '0.35rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
          <span className="compact-label" style={{ width: 58 }}>Mode</span>
          <select
            className="compact-select"
            style={{ fontSize: '0.75rem', flex: 1 }}
            value={mode}
            disabled={!setAudioSpawnTriggerMode || disabledByTimeline}
            onChange={(e) => setAudioSpawnTriggerMode?.(e.target.value)}
          >
            <option value="level">Threshold</option>
            <option value="transient">Transients</option>
          </select>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="compact-label">{mode === 'transient' ? 'Sensitivity' : 'Threshold'}</span>
          <span className="compact-label" style={{ fontSize: '0.75rem', opacity: 0.7 }}>{Number(audioSpawnThreshold || 0).toFixed(2)}</span>
        </div>
        <input
          className="compact-range"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={Number.isFinite(audioSpawnThreshold) ? audioSpawnThreshold : 0.6}
          disabled={!setAudioSpawnThreshold || disabledByTimeline}
          onChange={(e) => setAudioSpawnThreshold?.(Number(e.target.value))}
          title={mode === 'transient'
            ? 'Lower = more sensitive (triggers on smaller transients)'
            : 'Spawn when the selected band reaches this level'}
        />
      </div>

      {mode === 'level' && (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.25rem', opacity: canRun ? 1 : 0.7 }}>
          <label className="compact-label" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }} title="If the audio stays above the threshold, spawn repeatedly using the cooldown interval">
            <input
              type="checkbox"
              checked={!!audioSpawnRepeatWhileAbove}
              disabled={!setAudioSpawnRepeatWhileAbove || disabledByTimeline}
              onChange={(e) => setAudioSpawnRepeatWhileAbove?.(!!e.target.checked)}
            />
            Repeat While Above
          </label>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span className="compact-label" title="Hysteresis reduces chatter when hovering near the threshold">Hyst</span>
            <BufferedNumberInput
              value={Number.isFinite(audioSpawnHysteresis) ? audioSpawnHysteresis : 0.08}
              step={0.01}
              min={0}
              max={0.5}
              onCommit={setAudioSpawnHysteresis}
              className="compact-number"
              style={{ width: '5.5rem' }}
              disabled={!setAudioSpawnHysteresis || disabledByTimeline}
            />
          </div>
        </div>
      )}

      <div style={{ marginTop: '0.25rem', opacity: canRun ? 1 : 0.7 }}>
        <label className="compact-label" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }} title="Constrain spawned layer colours to the active global palette">
          <input
            type="checkbox"
            checked={!!audioSpawnUseGlobalPalette}
            disabled={!setAudioSpawnUseGlobalPalette || disabledByTimeline}
            onChange={(e) => setAudioSpawnUseGlobalPalette?.(!!e.target.checked)}
          />
          Use Global Palette
        </label>
      </div>

      <div style={{ marginTop: '0.25rem', opacity: canRun ? 1 : 0.7 }}>
        <label className="compact-label" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }} title="For microphone input: waveform-bent shapes, pitch-driven colours, and depth-style shrink/fade as shapes age">
          <input
            type="checkbox"
            checked={!!audioSpawnMicReactive}
            disabled={!setAudioSpawnMicReactive || disabledByTimeline}
            onChange={(e) => setAudioSpawnMicReactive?.(!!e.target.checked)}
          />
          Mic Waveform + Pitch Mode
        </label>
      </div>

      <div style={{ marginTop: '0.25rem', opacity: canRun ? 1 : 0.8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="compact-label">Mic Reactive Amount</span>
          <span className="compact-label" style={{ fontSize: '0.75rem', opacity: 0.7 }}>
            {Math.round(micReactiveAmountValue)}%
          </span>
        </div>
        <input
          className="compact-range"
          type="range"
          min="0"
          max="100"
          step="1"
          value={micReactiveAmountValue}
          disabled={!setAudioSpawnMicReactiveAmount || disabledByTimeline}
          onChange={(e) => setAudioSpawnMicReactiveAmount?.(Number(e.target.value))}
          title="Low values mainly modulate wobble/noise on the source shape. Higher values progressively add waveform node deformation."
        />
      </div>

      <div style={{ marginTop: '0.2rem', opacity: canRun ? 1 : 0.7 }}>
        <label className="compact-label" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }} title="Force smooth contour waveform shaping and disable starburst/ribbon mode switching">
          <input
            type="checkbox"
            checked={!!audioSpawnForceContourMode}
            disabled={!setAudioSpawnForceContourMode || disabledByTimeline}
            onChange={(e) => setAudioSpawnForceContourMode?.(!!e.target.checked)}
          />
          Contour Mode
        </label>
      </div>

      <div style={{ marginTop: '0.4rem', paddingTop: '0.35rem', borderTop: '1px solid rgba(255,255,255,0.08)', opacity: canRun ? 1 : 0.8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
          <span className="compact-label" style={{ fontWeight: 600 }}>Milkdrop Influence Pack</span>
          <span className="compact-label" style={{ fontSize: '0.72rem', opacity: 0.72 }}>{Math.round(milkdropInfluenceValue)}%</span>
        </div>
        <input
          className="compact-range"
          type="range"
          min="0"
          max="100"
          step="1"
          value={milkdropInfluenceValue}
          disabled={!setMilkdropInfluence || disabledByTimeline}
          onChange={(e) => setMilkdropInfluence?.(Number(e.target.value))}
          title="0 = original behavior. Higher values add Milkdrop-style equation drive, beat bursts, waveform shaping, and directional fields."
        />
        <label className="compact-label" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.2rem' }} title="Adds subtle frame-to-frame trails behind shapes">
          <input
            type="checkbox"
            checked={!!milkdropFeedbackEnabled}
            disabled={!setMilkdropFeedbackEnabled || disabledByTimeline}
            onChange={(e) => setMilkdropFeedbackEnabled?.(!!e.target.checked)}
          />
          Feedback Trails
        </label>
        <div style={{ marginTop: '0.15rem', fontSize: '0.66rem', opacity: 0.62 }}>
          Adds equation modulation, beat bursts, waveform mode shifts, directional flow, and symmetry pulses while preserving shape style.
        </div>
      </div>

      <div style={{ marginTop: '0.35rem', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.35rem', opacity: canRun ? 1 : 0.8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', justifyContent: 'space-between' }}>
          <button
            type="button"
            className="btn-compact-secondary"
            style={{ fontSize: '0.68rem', padding: '2px 8px' }}
            onClick={() => setPitchMeterExpanded(v => !v)}
            title={pitchMeterExpanded ? 'Hide pitch meter' : 'Show pitch meter'}
          >
            {pitchMeterExpanded ? 'Hide Pitch Meter' : 'Show Pitch Meter'}
          </button>
          <label className="compact-label" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }} title="Disable live pitch updates to reduce visual noise">
            <input
              type="checkbox"
              checked={pitchMeterEnabled}
              onChange={(e) => {
                const next = !!e.target.checked;
                setPitchMeterEnabled(next);
                if (!next) {
                  setPitchMeterValue({ hz: 0, normalized: 0, confidence: 0 });
                }
              }}
            />
            Enabled
          </label>
        </div>

        {pitchMeterExpanded && (
          <div style={{ marginTop: '0.3rem', padding: '0.35rem', borderRadius: 6, background: 'rgba(255,255,255,0.05)' }}>
            {!pitchMeterEnabled ? (
              <div style={{ fontSize: '0.68rem', opacity: 0.68 }}>
                Pitch meter disabled.
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem' }}>
                  <span className="compact-label" style={{ fontSize: '0.74rem' }}>{pitchLabel}</span>
                  <span className="compact-label" style={{ fontSize: '0.7rem', opacity: 0.72 }}>{pitchHzText}</span>
                </div>
                <div style={{ marginTop: '0.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem', opacity: 0.62 }}>
                    <span>Pitch Position</span>
                    <span>{Math.round(pitchMeterValue.normalized * 100)}%</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 4, background: 'rgba(255,255,255,0.12)', overflow: 'hidden', marginTop: '0.12rem' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${clampValue(pitchMeterValue.normalized * 100, 0, 100)}%`,
                        background: 'linear-gradient(90deg, #4fc3f7 0%, #81c784 50%, #ffd54f 100%)',
                        transition: 'width 0.08s linear',
                      }}
                    />
                  </div>
                </div>
                <div style={{ marginTop: '0.22rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem', opacity: 0.62 }}>
                    <span>Confidence</span>
                    <span>{Math.round(pitchMeterValue.confidence * 100)}%</span>
                  </div>
                  <div style={{ height: 5, borderRadius: 4, background: 'rgba(255,255,255,0.12)', overflow: 'hidden', marginTop: '0.12rem' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${clampValue(pitchMeterValue.confidence * 100, 0, 100)}%`,
                        background: '#7dd3fc',
                        transition: 'width 0.08s linear',
                      }}
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div style={{ marginTop: '0.35rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="compact-label">Energy → Variance</span>
          <span className="compact-label" style={{ fontSize: '0.75rem', opacity: 0.7 }}>{Number.isFinite(energyInfluence) ? Number(energyInfluence).toFixed(2) : '0.00'}</span>
        </div>
        <input
          className="compact-range"
          type="range"
          min="0"
          max="2"
          step="0.01"
          value={Number.isFinite(energyInfluence) ? energyInfluence : 0}
          disabled={!setEnergyInfluence || disabledByTimeline}
          onChange={(e) => setEnergyInfluence?.(Number(e.target.value))}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'auto 6rem', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem' }}>
        <span className="compact-label">Cooldown (ms)</span>
        <BufferedNumberInput
          value={Number.isFinite(audioSpawnCooldownMs) ? audioSpawnCooldownMs : 250}
          step={25}
          min={0}
          max={10000}
          onCommit={setAudioSpawnCooldownMs}
          className="compact-number"
          style={{ width: '6rem' }}
          disabled={!setAudioSpawnCooldownMs || disabledByTimeline}
        />

        <span className="compact-label">Half-life (ms)</span>
        <BufferedNumberInput
          value={Number.isFinite(audioSpawnHalfLifeMs) ? audioSpawnHalfLifeMs : 1500}
          step={50}
          min={50}
          max={60000}
          onCommit={setAudioSpawnHalfLifeMs}
          className="compact-number"
          style={{ width: '6rem' }}
          disabled={!setAudioSpawnHalfLifeMs || disabledByTimeline}
        />

        <span className="compact-label">Half-life Energy Factor</span>
        <BufferedNumberInput
          value={Number.isFinite(audioSpawnHalfLifeEnergyFactor) ? audioSpawnHalfLifeEnergyFactor : 1.0}
          step={0.1}
          min={0}
          max={4}
          onCommit={setAudioSpawnHalfLifeEnergyFactor}
          className="compact-number"
          style={{ width: '6rem' }}
          disabled={!setAudioSpawnHalfLifeEnergyFactor || disabledByTimeline}
        />

        <span className="compact-label">Max Layers</span>
        <BufferedNumberInput
          value={Number.isFinite(audioSpawnMaxLayers) ? audioSpawnMaxLayers : 12}
          step={1}
          min={0}
          max={200}
          onCommit={setAudioSpawnMaxLayers}
          className="compact-number"
          style={{ width: '6rem' }}
          disabled={!setAudioSpawnMaxLayers || disabledByTimeline}
        />
      </div>

      {!enabled && (
        <div style={{ marginTop: '0.35rem', fontSize: '0.75rem', opacity: 0.7 }}>
          Enable Audio Input above to use live spawning.
        </div>
      )}
      {disabledByTimeline && (
        <div style={{ marginTop: '0.35rem', fontSize: '0.75rem', opacity: 0.7 }}>
          Disabled while Timeline mode is active.
        </div>
      )}
        </>
      )}
    </div>
  );
};

// BPM/Beat Sync Section Component - Master BPM controls
const BPMSection = ({ showBeatCounter: _showBeatCounter = false }) => {
  const bpm = useBPM();

  if (!bpm) {
    return null;
  }

  const {
    bpm: currentBPM,
    isPlaying,
    setBPM,
    togglePlay,
    reset,
    tap,
  } = bpm;

  return (
    <div
      className="compact-field"
      style={{
        borderTop: '1px solid rgba(255,255,255,0.1)',
        paddingTop: '0.5rem',
        marginTop: '0.5rem',
        display: 'block',
        width: '100%',
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="compact-label" style={{ fontWeight: 600 }}>♪ BPM / Beat Sync</span>
      </div>

      {/* BPM and controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <span className="compact-label" style={{ fontSize: '0.75rem' }}>BPM:</span>
          <BufferedNumberInput
            value={currentBPM}
            min={20}
            max={300}
            step={1}
            onCommit={(next) => {
              const v = Number(next);
              if (!Number.isFinite(v)) return;
              setBPM(Math.max(20, Math.min(300, Math.round(v))));
            }}
            className="compact-number"
            style={{ width: '4rem', fontSize: '0.75rem', padding: '2px 4px' }}
            inputMode="numeric"
          />
        </div>
        
        <button
          className="btn-compact-secondary"
          onClick={togglePlay}
          style={{ fontSize: '0.75rem', padding: '2px 6px' }}
        >
          {isPlaying ? '⏸ Pause' : '▶ Play'}
        </button>
        
        <button
          className="btn-compact-secondary"
          onClick={reset}
          style={{ fontSize: '0.75rem', padding: '2px 6px' }}
        >
          ⏹ Reset
        </button>
        
        <button
          className="btn-compact-secondary"
          onClick={tap}
          style={{ fontSize: '0.75rem', padding: '2px 6px' }}
          title="Tap tempo - tap 2-4 times to set BPM"
        >
          Tap
        </button>
        
      </div>

      <div style={{ marginTop: '0.5rem', fontSize: '0.7rem', opacity: 0.6 }}>
        Map parameters to beats using the BPM checkbox on each control (when "BPM Learn" is enabled above).
      </div>
    </div>
  );
};

// Helper: compact number input for mode settings
const ModeSettingInput = ({ label, value, onChange, step = 0.01, min, max, title }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
    <span style={{ fontSize: '0.6rem', opacity: 0.7, minWidth: '3rem' }} title={title}>{label}</span>
    <input
      type="number"
      step={step}
      min={min}
      max={max}
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => {
        const next = Number(e.target.value);
        if (Number.isFinite(next)) onChange(next);
      }}
      style={{ width: '3.5rem', fontSize: '0.6rem', padding: '2px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 3, color: 'white' }}
    />
  </div>
);

// Mode-specific settings panel
const AudioModeSettings = ({ mode, modeSettings, onSettingsChange }) => {
  if (!mode || mode === 'direct') return null;

  const defaults = DEFAULT_MODE_SETTINGS[mode] || {};
  const s = { ...defaults, ...modeSettings };
  const update = (key, val) => onSettingsChange({ ...s, [key]: val });

  const bandOptions = ['rms', 'bass', 'mids', 'highs', 'pitch', 'transient', 'beat', 'waveformEnergy'];

  switch (mode) {
    case 'accumulate':
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem 0.75rem', marginTop: '0.25rem' }}>
          <ModeSettingInput label="Rate" value={s.rate} onChange={v => update('rate', v)} step={0.005} min={0.001} max={0.5} title="How fast audio pushes the value" />
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>Wrap</span>
            <input type="checkbox" checked={!!s.wrap} onChange={e => update('wrap', e.target.checked)} style={{ cursor: 'pointer' }} />
          </div>
        </div>
      );

    case 'leaky':
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem 0.75rem', marginTop: '0.25rem' }}>
          <ModeSettingInput label="Rate" value={s.rate} onChange={v => update('rate', v)} step={0.005} min={0.001} max={0.5} title="Accumulation speed" />
          <ModeSettingInput label="Decay" value={s.decay} onChange={v => update('decay', v)} step={0.001} min={0.9} max={0.9999} title="Per-frame decay (closer to 1 = slower)" />
          <ModeSettingInput label="Rest" value={s.restValue} onChange={v => update('restValue', v)} step={0.05} min={0} max={1} title="Value to decay toward" />
        </div>
      );

    case 'bandRatio':
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem 0.75rem', marginTop: '0.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>Num</span>
            <select className="compact-select" style={{ fontSize: '0.6rem', padding: '1px 3px' }} value={s.numerator} onChange={e => update('numerator', e.target.value)}>
              {bandOptions.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>Den</span>
            <select className="compact-select" style={{ fontSize: '0.6rem', padding: '1px 3px' }} value={s.denominator} onChange={e => update('denominator', e.target.value)}>
              {bandOptions.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <ModeSettingInput label="Scale" value={s.scale} onChange={v => update('scale', v)} step={0.5} min={0.5} max={10} title="Normalization divisor for ratio" />
        </div>
      );

    case 'runningAvg':
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem 0.75rem', marginTop: '0.25rem' }}>
          <ModeSettingInput label="Window (s)" value={s.windowSeconds} onChange={v => update('windowSeconds', v)} step={0.5} min={0.5} max={30} title="Averaging window in seconds" />
        </div>
      );

    case 'onsetDrift':
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem 0.75rem', marginTop: '0.25rem' }}>
          <ModeSettingInput label="Thresh" value={s.threshold} onChange={v => update('threshold', v)} step={0.1} min={1.1} max={5} title="Onset detection multiplier" />
          <ModeSettingInput label="Min Lvl" value={s.minLevel} onChange={v => update('minLevel', v)} step={0.05} min={0} max={1} title="Minimum level to trigger onset" />
          <ModeSettingInput label="Drift" value={s.driftSpeed} onChange={v => update('driftSpeed', v)} step={0.005} min={0.001} max={0.2} title="Speed of drift toward target" />
        </div>
      );

    case 'hysteresis':
      return (
        <div style={{ marginTop: '0.25rem' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem 0.75rem' }}>
            <ModeSettingInput label="Q→M" value={s.quietToMed} onChange={v => update('quietToMed', v)} step={0.05} min={0} max={1} title="Threshold: quiet to medium" />
            <ModeSettingInput label="M→L" value={s.medToLoud} onChange={v => update('medToLoud', v)} step={0.05} min={0} max={1} title="Threshold: medium to loud" />
            <ModeSettingInput label="L→M" value={s.loudToMed} onChange={v => update('loudToMed', v)} step={0.05} min={0} max={1} title="Threshold: loud to medium" />
            <ModeSettingInput label="M→Q" value={s.medToQuiet} onChange={v => update('medToQuiet', v)} step={0.05} min={0} max={1} title="Threshold: medium to quiet" />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem 0.75rem', marginTop: '0.2rem' }}>
            <ModeSettingInput label="Lerp" value={s.lerpSpeed} onChange={v => update('lerpSpeed', v)} step={0.001} min={0.001} max={0.1} title="Per-frame lerp speed" />
            <ModeSettingInput label="Quiet" value={s.quietValue} onChange={v => update('quietValue', v)} step={0.05} min={0} max={1} title="Output in quiet zone" />
            <ModeSettingInput label="Med" value={s.medValue} onChange={v => update('medValue', v)} step={0.05} min={0} max={1} title="Output in medium zone" />
            <ModeSettingInput label="Loud" value={s.loudValue} onChange={v => update('loudValue', v)} step={0.05} min={0} max={1} title="Output in loud zone" />
          </div>
        </div>
      );

    case 'milkdrop':
      return (
        <div style={{ marginTop: '0.25rem' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem 0.75rem' }}>
            <ModeSettingInput label="LFO Hz" value={s.lfoHz} onChange={v => update('lfoHz', v)} step={0.01} min={0.01} max={4} title="Base LFO speed" />
            <ModeSettingInput label="LFO Amt" value={s.lfoAmount} onChange={v => update('lfoAmount', v)} step={0.05} min={0} max={1} title="LFO contribution" />
            <ModeSettingInput label="Audio Amt" value={s.audioAmount} onChange={v => update('audioAmount', v)} step={0.05} min={0} max={1} title="Raw audio contribution" />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem 0.75rem', marginTop: '0.2rem' }}>
            <ModeSettingInput label="Transient" value={s.transientAmount} onChange={v => update('transientAmount', v)} step={0.05} min={0} max={1} title="Transient boost contribution" />
            <ModeSettingInput label="Beat Hold" value={s.beatHold} onChange={v => update('beatHold', v)} step={0.05} min={0} max={1} title="Beat hold intensity/decay" />
            <ModeSettingInput label="Pitch Inf" value={s.pitchInfluence} onChange={v => update('pitchInfluence', v)} step={0.05} min={0} max={1} title="Pitch influence on LFO speed" />
          </div>
        </div>
      );

    default:
      return null;
  }
};

// Audio control row component - shown per parameter in settings panel
const AudioControlRow = ({ paramId, label: _label }) => {
  const audio = useAudioReactive();
  const bpm = useBPM();
  const midi = useMidi();
  const [showRange, setShowRange] = useState(false);
  const [showModeSettings, setShowModeSettings] = useState(false);

  const hasAudio = !!audio;
  const isActive = !!audio?.isActive;
  const mappings = audio?.mappings || {};
  const setMapping = audio?.setMapping;
  const clearMapping = audio?.clearMapping;
  const learnParamId = audio?.learnParamId;
  const _beginLearn = audio?.beginLearn;
  const cancelLearn = audio?.cancelLearn;
  const AUDIO_BANDS = audio?.AUDIO_BANDS || ['none'];
  const DEFAULT_RANGE = audio?.DEFAULT_RANGE || { outputMin: 0, outputMax: 1 };
  
  const mapping = mappings?.[paramId];
  const currentBand = mapping?.band || 'none';
  const fallbackRange = mapping?.range || DEFAULT_RANGE;
  const currentRange = fallbackRange;
  const currentMode = mapping?.mode || 'direct';
  const currentModeSettings = mapping?.modeSettings || DEFAULT_MODE_SETTINGS[currentMode] || {};
  const isLearning = learnParamId === paramId;
  
  const handleBandChange = (band) => {
    if (!hasAudio || typeof setMapping !== 'function') return;
    if (band === 'none') {
      setMapping(paramId, { band: 'none', range: currentRange, mode: currentMode, modeSettings: currentModeSettings });
    } else {
      const nextRange = mapping?.range || DEFAULT_RANGE;
      setMapping(paramId, { band, range: nextRange, mode: currentMode, modeSettings: currentModeSettings });
      if (midi?.clearMapping) midi.clearMapping(paramId);
      if (bpm?.setMapping) bpm.setMapping(paramId, { enabled: false, speed: 1, loopMode: 'forward', range: bpm.DEFAULT_RANGE || { outputMin: 0, outputMax: 1 } });
    }
    if (isLearning) cancelLearn();
  };
  
  const handleRangeChange = (update) => {
    if (!hasAudio || typeof setMapping !== 'function') return;
    if (currentBand === 'none') return;
    setMapping(paramId, { band: currentBand, range: { ...currentRange, ...update }, mode: currentMode, modeSettings: currentModeSettings });
  };

  const handleModeChange = (mode) => {
    if (!hasAudio || typeof setMapping !== 'function') return;
    const newSettings = DEFAULT_MODE_SETTINGS[mode] || {};
    setMapping(paramId, { band: currentBand, range: currentRange, mode, modeSettings: newSettings });
    if (mode !== 'direct') setShowModeSettings(true);
  };

  const handleModeSettingsChange = (newSettings) => {
    if (!hasAudio || typeof setMapping !== 'function') return;
    setMapping(paramId, { band: currentBand, range: currentRange, mode: currentMode, modeSettings: newSettings });
  };

  if (!hasAudio) return null;

  const modeInfo = AUDIO_MAPPING_MODES.find(m => m.value === currentMode);
  const hasNonDirectMode = currentMode && currentMode !== 'direct';

  return (
    <div style={{ marginTop: '0.25rem' }}>
      <div className="compact-row" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
        <span className="compact-label" style={{ opacity: 0.8, fontSize: '0.7rem' }}>Audio:</span>
        <select
          className="compact-select"
          style={{ fontSize: '0.7rem', padding: '2px 4px', minWidth: '4rem' }}
          value={currentBand}
          onChange={(e) => handleBandChange(e.target.value)}
        >
          {AUDIO_BANDS.map(b => (
            <option key={b} value={b}>
              {b === 'none'
                ? 'None'
                : b === 'rms'
                  ? 'Level'
                  : b === 'waveformEnergy'
                    ? 'Wave Energy'
                    : b.charAt(0).toUpperCase() + b.slice(1)}
            </option>
          ))}
        </select>
        {currentBand !== 'none' && (
          <>
            <select
              className="compact-select"
              style={{ fontSize: '0.65rem', padding: '2px 3px', minWidth: '5rem', color: hasNonDirectMode ? '#a78bfa' : undefined }}
              value={currentMode}
              onChange={(e) => handleModeChange(e.target.value)}
              title={modeInfo?.desc || ''}
            >
              {AUDIO_MAPPING_MODES.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
            {hasNonDirectMode && (
              <button
                className="btn-compact-secondary"
                style={{ fontSize: '0.6rem', padding: '2px 4px', background: showModeSettings ? 'rgba(167, 139, 250, 0.3)' : undefined }}
                onClick={() => setShowModeSettings(s => !s)}
                title={`${modeInfo?.label} settings`}
              >
                ⚙
              </button>
            )}
            <button
              className="btn-compact-secondary"
              style={{ fontSize: '0.65rem', padding: '2px 4px' }}
              onClick={() => setShowRange(r => !r)}
              title="Edit range mapping"
            >
              Range
            </button>
            <button
              className="btn-compact-secondary"
              style={{ fontSize: '0.65rem', padding: '2px 4px' }}
              onClick={() => clearMapping(paramId)}
              title="Clear audio mapping"
            >
              Clear
            </button>
          </>
        )}
        {isActive && currentBand !== 'none' && (
          <span style={{ fontSize: '0.65rem', color: hasNonDirectMode ? '#a78bfa' : '#4fc3f7' }}>●</span>
        )}
      </div>

      {/* Mode-specific settings */}
      {showModeSettings && currentBand !== 'none' && hasNonDirectMode && (
        <div style={{ marginTop: '0.25rem', marginLeft: '0.5rem', padding: '0.35rem', borderRadius: 4, background: 'rgba(167, 139, 250, 0.06)', borderLeft: '2px solid rgba(167, 139, 250, 0.3)' }}>
          <div style={{ fontSize: '0.6rem', opacity: 0.6, marginBottom: '0.2rem' }}>{modeInfo?.desc}</div>
          <AudioModeSettings
            mode={currentMode}
            modeSettings={currentModeSettings}
            onSettingsChange={handleModeSettingsChange}
          />
        </div>
      )}
      
      {/* Range editor - simplified to just output min/max */}
      {showRange && currentBand !== 'none' && (
        <div style={{ marginTop: '0.25rem', marginLeft: '0.5rem', padding: '0.25rem', borderRadius: 4, background: 'rgba(255,255,255,0.03)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.65rem', opacity: 0.7 }}>Min:</span>
            <input
              type="number"
              step="0.1"
              value={currentRange.outputMin}
              onChange={(e) => handleRangeChange({ outputMin: parseFloat(e.target.value) || 0 })}
              style={{ width: '3rem', fontSize: '0.65rem', padding: '2px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 3, color: 'white' }}
            />
            <span style={{ fontSize: '0.65rem', opacity: 0.7, marginLeft: '0.5rem' }}>Max:</span>
            <input
              type="number"
              step="0.1"
              value={currentRange.outputMax}
              onChange={(e) => handleRangeChange({ outputMax: parseFloat(e.target.value) || 1 })}
              style={{ width: '3rem', fontSize: '0.65rem', padding: '2px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 3, color: 'white' }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

// BPM control row component - shown per parameter in settings panel
const BPMControlRow = React.memo(({ paramId }) => {
  const bpm = useBPM();
  const audio = useAudioReactive();
  const midi = useMidi();
  const [showSettings, setShowSettings] = useState(false);
  const [showEnvelope, setShowEnvelope] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      const stored = window.localStorage.getItem(`bpm-env-open-${paramId}`);
      return stored === 'true';
    } catch {
      return false;
    }
  });
  const [playheadPosition, setPlayheadPosition] = useState(null);
  const [indicatorPhase, setIndicatorPhase] = useState(0);

  const hasBpm = !!bpm;
  const isPlaying = !!bpm?.isPlaying;
  const mappings = bpm?.mappings || {};
  const setMapping = bpm?.setMapping;
  const clearMapping = bpm?.clearMapping;
  const getPhaseForParam = bpm?.getPhaseForParam;
  const BEAT_SPEEDS = bpm?.BEAT_SPEEDS || [];
  const LOOP_MODES = bpm?.LOOP_MODES || [];
  const DEFAULT_RANGE = bpm?.DEFAULT_RANGE || { outputMin: 0, outputMax: 1 };
  const beatsPerBar = bpm?.beatsPerBar;
  
  // Poll for playhead position when envelope is shown and playing
  useEffect(() => {
    if (!hasBpm) return;
    if (!showEnvelope || !isPlaying || !getPhaseForParam) return;
    
    let frameId;
    const updatePlayhead = () => {
      const phase = getPhaseForParam(paramId);
      setPlayheadPosition(phase);
      frameId = requestAnimationFrame(updatePlayhead);
    };
    frameId = requestAnimationFrame(updatePlayhead);
    
    return () => {
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [hasBpm, showEnvelope, isPlaying, getPhaseForParam, paramId]);
  // Persist envelope open state so remounts don't auto-close it
  useEffect(() => {
    try {
      window.localStorage.setItem(`bpm-env-open-${paramId}`, showEnvelope ? 'true' : 'false');
    } catch { /* ignore */ }
  }, [showEnvelope, paramId]);
  
  const mapping = mappings?.[paramId];
  const isEnabled = mapping?.enabled || false;
  const currentSpeed = mapping?.speed || 1;
  const currentLoopMode = mapping?.loopMode || 'forward';
  const currentRange = mapping?.range || DEFAULT_RANGE;
  const currentEnvelope = mapping?.envelope || DEFAULT_ENVELOPE;
  
  const handleToggle = () => {
    if (isEnabled) {
      setMapping(paramId, { enabled: false, speed: currentSpeed, loopMode: currentLoopMode, range: currentRange, envelope: currentEnvelope });
    } else {
      // Enable BPM and disable MIDI/Audio for this parameter (mutual exclusivity)
      setMapping(paramId, { enabled: true, speed: currentSpeed, loopMode: currentLoopMode, range: currentRange, envelope: currentEnvelope });
      // Clear MIDI mapping
      if (midi?.clearMapping) midi.clearMapping(paramId);
      // Clear Audio mapping
      if (audio?.setMapping) audio.setMapping(paramId, { band: 'none', range: audio.DEFAULT_RANGE || { outputMin: 0, outputMax: 1 } });
    }
  };
  
  const handleSpeedChange = (speed) => {
    setMapping(paramId, { enabled: isEnabled, speed: Number(speed), loopMode: currentLoopMode, range: currentRange, envelope: currentEnvelope });
  };
  
  const handleLoopModeChange = (loopMode) => {
    setMapping(paramId, { enabled: isEnabled, speed: currentSpeed, loopMode, range: currentRange, envelope: currentEnvelope });
  };
  
  const handleRangeChange = (update) => {
    setMapping(paramId, { enabled: isEnabled, speed: currentSpeed, loopMode: currentLoopMode, range: { ...currentRange, ...update }, envelope: currentEnvelope });
  };
  
  const handleEnvelopeChange = (newEnvelope) => {
    console.debug('[GlobalControls] handleEnvelopeChange', { paramId, newEnvelope });
    setMapping(paramId, { enabled: isEnabled, speed: currentSpeed, loopMode: currentLoopMode, range: currentRange, envelope: newEnvelope });
  };

  // Lightweight indicator (does not mutate actual slider values):
  // show current phase so users can see BPM automation is active even if UI controls are not animated.
  useEffect(() => {
    if (!hasBpm) return;
    if (!isEnabled || typeof getPhaseForParam !== 'function') {
      setIndicatorPhase(0);
      return undefined;
    }

    let frameId = null;
    let last = 0;
    const THROTTLE_MS = 50; // ~20fps

    const tick = () => {
      const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      if (now - last >= THROTTLE_MS) {
        last = now;
        const phase = getPhaseForParam(paramId);
        setIndicatorPhase(Number.isFinite(phase) ? phase : 0);
      }
      frameId = requestAnimationFrame(tick);
    };

    // Only animate when playing; otherwise keep a static snapshot.
    if (isPlaying) {
      frameId = requestAnimationFrame(tick);
      return () => { if (frameId) cancelAnimationFrame(frameId); };
    }

    const phase = getPhaseForParam(paramId);
    setIndicatorPhase(Number.isFinite(phase) ? phase : 0);
    return undefined;
  }, [hasBpm, isEnabled, isPlaying, getPhaseForParam, paramId]);

  if (!hasBpm) return null;

  return (
    <div style={{ marginTop: '0.25rem' }}>
      <div className="compact-row" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
        <span className="compact-label" style={{ opacity: 0.8, fontSize: '0.7rem' }}>BPM:</span>
        <input
          type="checkbox"
          checked={isEnabled}
          onChange={handleToggle}
          style={{ cursor: 'pointer' }}
        />
        {isEnabled && (
          <>
            <select
              className="compact-select"
              style={{ fontSize: '0.7rem', padding: '2px 4px', minWidth: '3rem' }}
              value={currentSpeed}
              onChange={(e) => handleSpeedChange(e.target.value)}
            >
              {BEAT_SPEEDS.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <select
              className="compact-select"
              style={{ fontSize: '0.7rem', padding: '2px 4px', minWidth: '4rem' }}
              value={currentLoopMode}
              onChange={(e) => handleLoopModeChange(e.target.value)}
            >
              {LOOP_MODES.map(mode => (
                <option key={mode} value={mode}>
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </option>
              ))}
            </select>
            <button
              className="btn-compact-secondary"
              style={{ fontSize: '0.65rem', padding: '2px 4px' }}
              onClick={() => setShowSettings(s => !s)}
              title="Edit range"
            >
              Range
            </button>
            <button
              className="btn-compact-secondary"
              style={{ fontSize: '0.65rem', padding: '2px 4px', background: showEnvelope ? 'rgba(79, 195, 247, 0.3)' : undefined }}
              onClick={() => setShowEnvelope(s => !s)}
              title="Edit envelope curve"
            >
              Env
            </button>
            <button
              className="btn-compact-secondary"
              style={{ fontSize: '0.65rem', padding: '2px 4px' }}
              onClick={() => clearMapping(paramId)}
              title="Clear BPM mapping"
            >
              Clear
            </button>
          </>
        )}
        {isPlaying && isEnabled && (
          <span style={{ fontSize: '0.65rem', color: '#4fc3f7' }}>♪</span>
        )}
        {isEnabled && (
          <span
            title={isPlaying ? 'BPM automation active' : 'BPM automation enabled (paused)'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              width: 44,
              height: 6,
              borderRadius: 6,
              background: 'rgba(255,255,255,0.12)',
              overflow: 'hidden',
              border: '1px solid rgba(255,255,255,0.12)',
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 6,
                background: isPlaying ? '#4fc3f7' : 'rgba(79,195,247,0.55)',
                transform: `translateX(${Math.max(0, Math.min(1, indicatorPhase)) * 38}px)`,
                transition: isPlaying ? 'none' : 'transform 150ms ease',
              }}
            />
          </span>
        )}
      </div>
      
      {/* Range editor */}
      {showSettings && isEnabled && (
        <div style={{ marginTop: '0.25rem', marginLeft: '0.5rem', padding: '0.25rem', borderRadius: 4, background: 'rgba(255,255,255,0.03)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.65rem', opacity: 0.7, width: '2rem' }}>Out:</span>
            <input
              type="number"
              step="0.1"
              value={currentRange.outputMin}
              onChange={(e) => handleRangeChange({ outputMin: parseFloat(e.target.value) || 0 })}
              style={{ width: '2.5rem', fontSize: '0.65rem', padding: '2px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 3, color: 'white' }}
            />
            <span style={{ fontSize: '0.65rem', opacity: 0.5 }}>→</span>
            <input
              type="number"
              step="0.1"
              value={currentRange.outputMax}
              onChange={(e) => handleRangeChange({ outputMax: parseFloat(e.target.value) || 1 })}
              style={{ width: '2.5rem', fontSize: '0.65rem', padding: '2px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 3, color: 'white' }}
            />
          </div>
        </div>
      )}
      
      {/* Envelope editor */}
      {showEnvelope && isEnabled && (
        <div style={{ marginTop: '0.5rem' }}>
          <BPMEnvelopeEditor
            envelope={currentEnvelope}
            onChange={handleEnvelopeChange}
            beatsPerBar={beatsPerBar || 4}
            playheadPosition={playheadPosition}
          />
        </div>
      )}
    </div>
  );
});

// A full-featured Global Controls panel, mirroring the original inline UI

export {
  RangeMappingEditor,
  AudioReactiveSection,
  AudioPatchMatrixSection,
  AudioDemoPresetsSection,
  AudioPresetSlotsSection,
  AudioSpawnSection,
  BPMSection,
  AudioControlRow,
  BPMControlRow,
  AudioModeSettings,
};
