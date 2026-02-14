import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useMidi } from '../../../context/MidiContext.jsx';
import { useAudioReactive } from '../../../context/AudioContext.jsx';
import { useBPM } from '../../../context/BPMContext.jsx';
import BufferedNumberInput from '../../common/BufferedNumberInput.jsx';
import BPMEnvelopeEditor, { DEFAULT_ENVELOPE } from '../../common/BPMEnvelopeEditor.jsx';
import { AUDIO_MAPPING_MODES, DEFAULT_MODE_SETTINGS } from '../../../utils/audioMappingModes.js';

const RangeMappingEditor = ({ label, range, band, onRangeChange, onBandChange }) => {
  const [expanded, setExpanded] = useState(false);
  const bands = ['rms', 'bass', 'mids', 'highs'];
  
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
              {bands.map(b => <option key={b} value={b}>{b.toUpperCase()}</option>)}
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
];

const DEFAULT_DEMO_PRESET_ID = AUDIO_DEMO_PRESETS?.[0]?.id || '';
const AUDIO_PRESET_SLOTS_KEY = 'artapp-audio-preset-slots-v1';
const AUDIO_PRESET_SLOT_COUNT = 10;
const AUDIO_PRESET_VERSION = '1.0';

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

const AudioDemoPresetsSection = ({
  timelineMode = false,
  parameterTargetMode = 'individual',
  setParameterTargetMode = null,
  energyInfluence = 0.5,
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
  audioSpawnUseGlobalPalette = false,
  setAudioSpawnUseGlobalPalette = null,
} = {}) => {
  const audio = useAudioReactive();
  const [selectedPresetId, setSelectedPresetId] = useState(DEFAULT_DEMO_PRESET_ID);
  const [replaceMappings, setReplaceMappings] = useState(true);
  const [enableAudioOnApply, setEnableAudioOnApply] = useState(true);
  const [lastAppliedPresetId, setLastAppliedPresetId] = useState(null);

  const selectedPreset = useMemo(() => (
    AUDIO_DEMO_PRESETS.find(preset => preset.id === selectedPresetId) || AUDIO_DEMO_PRESETS[0] || null
  ), [selectedPresetId]);

  const lastAppliedPreset = useMemo(() => (
    AUDIO_DEMO_PRESETS.find(preset => preset.id === lastAppliedPresetId) || null
  ), [lastAppliedPresetId]);

  const applyPreset = useCallback(() => {
    if (!audio || !selectedPreset) return;

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
    } = audio;

    if (enableAudioOnApply) {
      setAudioEnabled?.(true);
    }

    const audioSettings = selectedPreset.audioSettings || {};
    if (Number.isFinite(audioSettings.sensitivity)) setSensitivity?.(audioSettings.sensitivity);
    if (Number.isFinite(audioSettings.bassSensitivity)) setBassSensitivity?.(audioSettings.bassSensitivity);
    if (Number.isFinite(audioSettings.midsSensitivity)) setMidsSensitivity?.(audioSettings.midsSensitivity);
    if (Number.isFinite(audioSettings.highsSensitivity)) setHighsSensitivity?.(audioSettings.highsSensitivity);
    if (Number.isFinite(audioSettings.smoothing)) setSmoothing?.(audioSettings.smoothing);
    if (Number.isFinite(audioSettings.release)) setRelease?.(audioSettings.release);

    if (replaceMappings) {
      clearAllMappings?.();
    }

    const mappings = selectedPreset.mappings || {};
    Object.entries(mappings).forEach(([paramId, mapping]) => {
      setMapping?.(paramId, mapping);
    });

    const spawn = selectedPreset.spawn || {};
    setAudioSpawnEnabled?.(typeof spawn.enabled === 'boolean' ? spawn.enabled : true);
    setAudioSpawnTriggerMode?.(spawn.triggerMode || 'level');
    setAudioSpawnRepeatWhileAbove?.(typeof spawn.repeatWhileAbove === 'boolean' ? spawn.repeatWhileAbove : true);
    setAudioSpawnHysteresis?.(Number.isFinite(spawn.hysteresis) ? spawn.hysteresis : 0.08);
    setAudioSpawnBand?.(spawn.band || 'rms');
    setAudioSpawnThreshold?.(Number.isFinite(spawn.threshold) ? spawn.threshold : 0.6);
    setAudioSpawnCooldownMs?.(Number.isFinite(spawn.cooldownMs) ? spawn.cooldownMs : 250);
    setAudioSpawnHalfLifeMs?.(Number.isFinite(spawn.halfLifeMs) ? spawn.halfLifeMs : 1500);
    setAudioSpawnHalfLifeEnergyFactor?.(Number.isFinite(spawn.halfLifeEnergyFactor) ? spawn.halfLifeEnergyFactor : 1);
    setAudioSpawnMaxLayers?.(Number.isFinite(spawn.maxLayers) ? spawn.maxLayers : 12);
    if (typeof spawn.useGlobalPalette === 'boolean') {
      setAudioSpawnUseGlobalPalette?.(spawn.useGlobalPalette);
    }

    if (Number.isFinite(selectedPreset.energyInfluence)) {
      setEnergyInfluence?.(selectedPreset.energyInfluence);
    }

    setLastAppliedPresetId(selectedPreset.id);
  }, [
    audio,
    enableAudioOnApply,
    replaceMappings,
    selectedPreset,
    setEnergyInfluence,
    setAudioSpawnEnabled,
    setAudioSpawnTriggerMode,
    setAudioSpawnRepeatWhileAbove,
    setAudioSpawnHysteresis,
    setAudioSpawnBand,
    setAudioSpawnThreshold,
    setAudioSpawnCooldownMs,
    setAudioSpawnHalfLifeMs,
    setAudioSpawnHalfLifeEnergyFactor,
    setAudioSpawnMaxLayers,
    setAudioSpawnUseGlobalPalette,
  ]);

  if (!audio) return null;

  return (
    <div className="compact-field" style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '0.5rem', marginTop: '0.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
        <span className="compact-label" style={{ fontWeight: 600 }}>✨ Spawn Demo Presets</span>
        <button
          type="button"
          className="btn-compact-secondary"
          style={{ fontSize: '0.72rem', padding: '2px 8px' }}
          onClick={applyPreset}
          disabled={!selectedPreset}
          title="Apply demo mappings + audio spawn behavior"
        >
          Apply
        </button>
      </div>

      <div style={{ marginTop: '0.35rem' }}>
        <select
          className="compact-select"
          style={{ width: '100%' }}
          value={selectedPresetId}
          onChange={(e) => setSelectedPresetId(e.target.value)}
        >
          {AUDIO_DEMO_PRESETS.map((preset, index) => (
            <option key={preset.id} value={preset.id}>
              {`${index + 1}. ${preset.name}`}
            </option>
          ))}
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
      </div>

      {lastAppliedPreset && (
        <div style={{ marginTop: '0.35rem', fontSize: '0.7rem', color: '#6bcb77' }}>
          Applied: {lastAppliedPreset.name}
        </div>
      )}

      <AudioPresetSlotsSection
        timelineMode={timelineMode}
        parameterTargetMode={parameterTargetMode}
        setParameterTargetMode={setParameterTargetMode}
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
      />

      {timelineMode && (
        <div style={{ marginTop: '0.35rem', fontSize: '0.7rem', opacity: 0.65 }}>
          Timeline mode mutes live Audio + BPM automation; preset values are still saved and will run after leaving Timeline mode.
        </div>
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
  setAudioSpawnEnabled = null,
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
} = {}) => {
  const audio = useAudioReactive();
  const [slots, setSlots] = useState(() => loadAudioPresetSlots());
  const [selectedSlotId, setSelectedSlotId] = useState(1);
  const [enableAudioOnLoad, setEnableAudioOnLoad] = useState(true);
  const [status, setStatus] = useState({ text: '', error: false });

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
  }), [
    parameterTargetMode,
    energyInfluence,
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
    <div className="compact-field" style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '0.5rem', marginTop: '0.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
        <span className="compact-label" style={{ fontWeight: 600 }}>💾 Audio Preset Slots</span>
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
      </div>

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
    </div>
  );
};

// Audio Reactive Section Component - Global audio settings only
// Per-parameter audio mappings are shown alongside MIDI controls on each parameter
const AudioReactiveSection = ({ isActiveTab = true }) => {
  const audio = useAudioReactive();
  const [showSettings, setShowSettings] = useState(false);
  const [features, setFeatures] = useState({ rms: 0, bass: 0, mids: 0, highs: 0 });
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
  
  // Poll audio features for visual meters when active and tab is visible
  // This hook must be called unconditionally (before any early returns)
  useEffect(() => {
    // Only run when tab is active and audio is active
    if (!isActiveTab || !isActive || !getFeatures) return;
    
    let intervalId;
    const updateMeters = () => {
      const f = getFeatures();
      setFeatures(f);
    };
    
    // Run at ~20fps instead of RAF
    intervalId = setInterval(updateMeters, 50);
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isActiveTab, isActive, getFeatures]);

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
    <div className="compact-field" style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '0.5rem', marginTop: '0.5rem' }}>
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

      {/* Audio level meters */}
      {isActive && (
        <div style={{ marginTop: '0.5rem', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.25rem 0.5rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>Level</span>
          <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${features.rms * 100}%`, background: '#4fc3f7', transition: 'width 0.05s' }} />
          </div>
          <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>Bass</span>
          <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${features.bass * 100}%`, background: '#ff6b6b', transition: 'width 0.05s' }} />
          </div>
          <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>Mids</span>
          <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${features.mids * 100}%`, background: '#ffd93d', transition: 'width 0.05s' }} />
          </div>
          <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>Highs</span>
          <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${features.highs * 100}%`, background: '#6bcb77', transition: 'width 0.05s' }} />
          </div>
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

const AudioSpawnSection = ({
  isActiveTab = true,
  timelineMode = false,
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
  audioSpawnUseGlobalPalette = false,
  setAudioSpawnUseGlobalPalette = null,
} = {}) => {
  const audio = useAudioReactive();
  const [bandValue, setBandValue] = useState(0);

  const enabled = !!audio?.settings?.enabled;
  const getFeatures = audio?.getFeatures;

  useEffect(() => {
    if (!isActiveTab || !enabled || typeof getFeatures !== 'function') {
      setBandValue(0);
      return undefined;
    }

    let intervalId;
    const tick = () => {
      const features = getFeatures?.() || {};
      const v = typeof features?.[audioSpawnBand] === 'number' ? features[audioSpawnBand] : 0;
      setBandValue(v);
    };
    intervalId = setInterval(tick, 50);
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isActiveTab, enabled, getFeatures, audioSpawnBand]);

  const disabledByTimeline = !!timelineMode;
  const canRun = !disabledByTimeline && enabled;
  const mode = (audioSpawnTriggerMode === 'transient') ? 'transient' : 'level';
  const [showSettingsWhenDisabled, setShowSettingsWhenDisabled] = useState(false);
  const showAdvancedControls = !!audioSpawnEnabled || showSettingsWhenDisabled;

  return (
    <div className="compact-field" style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '0.5rem', marginTop: '0.5rem' }}>
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
          <option value="rms">Level</option>
          <option value="bass">Bass</option>
          <option value="mids">Mids</option>
          <option value="highs">Highs</option>
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
    <div className="compact-field" style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '0.5rem', marginTop: '0.5rem' }}>
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
      onChange={(e) => onChange(parseFloat(e.target.value))}
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

  const bandOptions = ['rms', 'bass', 'mids', 'highs'];

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
              {b === 'none' ? 'None' : b === 'rms' ? 'Level' : b.charAt(0).toUpperCase() + b.slice(1)}
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
  AudioDemoPresetsSection,
  AudioPresetSlotsSection,
  AudioSpawnSection,
  BPMSection,
  AudioControlRow,
  BPMControlRow,
  AudioModeSettings,
};
