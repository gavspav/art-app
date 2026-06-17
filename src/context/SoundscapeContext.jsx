import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as Tone from 'tone';
import { DEFAULT_PROGRAM_IDS, SOUND_PROGRAMS } from '../constants/soundscapeParams.js';
import { calculateSoundscapeTension, clamp01, colorToRootMidi, hexToHsl, paletteToSound } from '../utils/soundscapeUtils.js';
import { migrateLegacySoundscapeRoutes, normalizeSoundscapeRoutes, resolveSoundscapeRoutes } from '../utils/soundscapeRouting.js';
import { getRuntimeProfile } from '../utils/runtimeProfile.js';

const SoundscapeContext = createContext(null);
const STORAGE_KEY = 'artapp-soundscape-config';
const PATCHES_KEY = 'artapp-soundscape-patches';
const MAPPING_KEYS = ['palette', 'background', 'speed', 'layers', 'density', 'chaos', 'size', 'opacity', 'noise', 'blend', 'curviness', 'wobble', 'sides'];
const DEFAULT_MAPPING_RANGES = Object.fromEntries(MAPPING_KEYS.map(key => [key, { min: 0, max: 1, invert: false }]));
const DEFAULT_MASTER_VOLUME = 1;
const HARMONIC_MASTER_MAKEUP = 1.18;

export const DEFAULT_SOUNDSCAPE_CONFIG = Object.freeze({
  version: 2,
  enabled: true,
  mode: 'textural',
  masterVolume: DEFAULT_MASTER_VOLUME,
  voiceLimit: 8,
  ambientLevel: 0.7,
  pulseLevel: 0.32,
  collisionEnabled: true,
  collisionLevel: 0.18,
  collisionCooldownMs: 180,
  smoothing: 0.35,
  mappings: {
    palette: 0.8,
    background: 0.8,
    speed: 0.8,
    layers: 0.7,
    density: 0.75,
    chaos: 0.75,
    size: 0.65,
    opacity: 0.8,
    noise: 0.6,
    blend: 0.7,
    curviness: 0.7,
    wobble: 0.55,
    sides: 0.5,
  },
  mappingRanges: DEFAULT_MAPPING_RANGES,
  routes: migrateLegacySoundscapeRoutes({}),
  paletteProgramMap: {},
  paletteOverrides: {},
  backgroundOverrides: {},
});

const normalizeConfig = (config) => {
  const source = config || {};
  return {
    ...DEFAULT_SOUNDSCAPE_CONFIG,
    ...source,
    mode: source.mode === 'harmonic' ? 'harmonic' : 'textural',
    voiceLimit: Math.max(1, Math.min(8, Number(source.voiceLimit) || DEFAULT_SOUNDSCAPE_CONFIG.voiceLimit)),
    mappings: { ...DEFAULT_SOUNDSCAPE_CONFIG.mappings, ...(source.mappings || {}) },
    mappingRanges: Object.fromEntries(MAPPING_KEYS.map(key => [
      key,
      { ...DEFAULT_MAPPING_RANGES[key], ...(source.mappingRanges?.[key] || {}) },
    ])),
    routes: source.version >= 2
      ? normalizeSoundscapeRoutes(source.routes)
      : migrateLegacySoundscapeRoutes(source),
    paletteProgramMap: { ...(source.paletteProgramMap || {}) },
    paletteOverrides: { ...(source.paletteOverrides || {}) },
    backgroundOverrides: { ...(source.backgroundOverrides || {}) },
    version: 2,
  };
};

export const resolveSoundscapeMode = ({ mode, blendMode, isArcade = false } = {}) => {
  if (isArcade) return blendMode === 'difference' ? 'textural' : 'harmonic';
  return mode === 'harmonic' ? 'harmonic' : 'textural';
};

export const calculateSoundscapeMasterGain = ({
  masterVolume = DEFAULT_MASTER_VOLUME,
  destinationGain = 1,
  harmonicMode = false,
  screensaverMuted = false,
} = {}) => {
  if (screensaverMuted) return 0;
  const makeup = harmonicMode ? HARMONIC_MASTER_MAKEUP : 1;
  return Math.min(1, Math.max(0, Number(masterVolume) || 0) * Math.max(0, Number(destinationGain) || 0) * makeup);
};

const readStored = (key, fallback) => {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null');
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

const midiToFrequency = (midi) => 440 * (2 ** ((midi - 69) / 12));
const VOICE_ROLES = Object.freeze([
  { name: 'low', octave: -12, gain: 0.95, filter: 0.78, q: -0.1, motion: 0.5 },
  { name: 'mid', octave: 0, gain: 0.9, filter: 1, q: 0, motion: 0.75 },
  { name: 'high', octave: 12, gain: 0.72, filter: 1.28, q: 0.25, motion: 0.95 },
  { name: 'shimmer', octave: 24, gain: 0.48, filter: 1.55, q: 0.45, motion: 1.15 },
  { name: 'texture', octave: 7, gain: 0.58, filter: 1.15, q: 0.65, motion: 1.35 },
]);
const HARMONIC_OSCILLATORS = Object.freeze(['sine', 'sine2', 'sine4', 'sine2', 'sine']);
const HARMONIC_DENSITY_INTERVALS = Object.freeze([0, 4, 7, 9, 12, 16, 19, 24, 28, 31, 36]);
const hashString = (value) => {
  let hash = 2166136261;
  for (const char of String(value || '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};
const getGeneratedProgramId = identity => DEFAULT_PROGRAM_IDS[hashString(identity) % DEFAULT_PROGRAM_IDS.length];
const uniqueSortedIntervals = intervals => Array.from(new Set(
  intervals
    .map(value => Math.round(Number(value) || 0))
    .filter(value => value >= 0 && value <= 36),
)).sort((a, b) => a - b);
export const buildHarmonicVoiceIntervals = (scale = []) => {
  const third = scale.find(interval => interval === 3 || interval === 4) ?? 4;
  const fifth = scale.find(interval => interval === 7) ?? 7;
  const seventh = scale.find(interval => interval === 10 || interval === 11) ?? 10;
  return [0, third, fifth, 12, seventh, 12 + third, 12 + fifth, 24];
};

export const SoundscapeProvider = ({ children }) => {
  const isArcade = useMemo(() => getRuntimeProfile().isArcade, []);
  const [config, setConfigState] = useState(() => normalizeConfig(readStored(STORAGE_KEY, null)));
  const [patches, setPatches] = useState(() => readStored(PATCHES_KEY, {}));
  const [started, setStarted] = useState(false);
  const [startError, setStartError] = useState('');
  const [screensaverMuted, setScreensaverMuted] = useState(false);
  const [liveValues, setLiveValues] = useState({ sources: {}, destinations: {}, paletteIdentity: '', programId: '' });
  const nodesRef = useRef(null);
  const visualRef = useRef(null);
  const configRef = useRef(config);
  const collisionTimesRef = useRef(new Map());
  const lastAppliedRef = useRef({});
  const lastLivePublishRef = useRef(0);
  const liveMonitoringRef = useRef(false);

  const setConfig = useCallback((updater) => {
    setConfigState(previous => normalizeConfig(typeof updater === 'function' ? updater(previous) : updater));
  }, []);

  useEffect(() => {
    configRef.current = config;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(config)); } catch { /* noop */ }
  }, [config]);

  useEffect(() => {
    try { localStorage.setItem(PATCHES_KEY, JSON.stringify(patches)); } catch { /* noop */ }
  }, [patches]);

  const disposeNodes = useCallback(() => {
    const nodes = nodesRef.current;
    if (!nodes) return;
    nodes.padVoices?.forEach(voice => {
      try { voice.synth.triggerRelease(); } catch { /* noop */ }
      [voice.synth, voice.filter, voice.panner, voice.gain].forEach(node => {
        try { node.dispose(); } catch { /* noop */ }
      });
    });
    Object.values(nodes).forEach(node => {
      if (Array.isArray(node)) return;
      if (node && typeof node.dispose === 'function') {
        try { node.dispose(); } catch { /* noop */ }
      }
    });
    nodesRef.current = null;
    lastAppliedRef.current = {};
  }, []);

  const ensureNodes = useCallback(() => {
    if (nodesRef.current) return nodesRef.current;
    const master = new Tone.Gain(0).toDestination();
    const compressor = new Tone.Compressor(-18, 3).connect(master);
    const distortion = new Tone.Distortion(0.05).connect(compressor);
    const reverb = new Tone.Reverb({ decay: 4, wet: 0.35 }).connect(distortion);
    const filter = new Tone.Filter(900, 'lowpass').connect(reverb);
    const drone = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 2.5, decay: 1, sustain: 0.8, release: 4 },
    }).connect(filter);
    const padVoices = Array.from({ length: 12 }, (_, index) => {
      const gain = new Tone.Gain(0).connect(reverb);
      const panner = new Tone.Panner(0).connect(gain);
      const voiceFilter = new Tone.Filter(700, 'lowpass').connect(panner);
      const synth = new Tone.Synth({
        oscillator: { type: index % 3 === 0 ? 'sine' : 'triangle' },
        envelope: { attack: 1.8, decay: 1.2, sustain: 0.9, release: 3.5 },
      }).connect(voiceFilter);
      return {
        synth,
        filter: voiceFilter,
        panner,
        gain,
        layerId: null,
        active: false,
        oscillator: index % 3 === 0 ? 'sine' : 'triangle',
        pendingOscillator: '',
        last: {},
      };
    });
    const noiseFilter = new Tone.Filter(500, 'lowpass').connect(reverb);
    const noise = new Tone.Noise('pink').connect(noiseFilter);
    noise.volume.value = -42;
    const collision = new Tone.MembraneSynth({
      pitchDecay: 0.03,
      octaves: 2,
      envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.15 },
    }).connect(compressor);
    collision.volume.value = -28;
    nodesRef.current = {
      master, compressor, distortion, reverb, filter, drone, padVoices, noiseFilter, noise, collision,
      droneStarted: false,
      droneOscillator: 'sine',
      noiseType: 'pink',
      programId: '',
    };
    return nodesRef.current;
  }, []);

  const start = useCallback(async () => {
    try {
      await Tone.start();
      const nodes = ensureNodes();
      if (nodes.noise.state !== 'started') nodes.noise.start();
      if (Tone.getTransport().state !== 'started') Tone.getTransport().start();
      setStarted(true);
      setStartError('');
      return true;
    } catch (error) {
      setStartError(error?.message || 'Browser blocked audio startup');
      return false;
    }
  }, [ensureNodes]);

  const stop = useCallback(() => {
    const nodes = nodesRef.current;
    if (nodes) {
      try { nodes.drone.triggerRelease(); } catch { /* noop */ }
      nodes.padVoices?.forEach(voice => {
        try { voice.synth.triggerRelease(); } catch { /* noop */ }
        voice.active = false;
        voice.layerId = null;
        voice.gain.gain.rampTo(0, 0.2);
      });
      try { nodes.master.gain.rampTo(0, 0.15); } catch { /* noop */ }
      nodes.droneStarted = false;
    }
    setStarted(false);
  }, []);

  useEffect(() => {
    const nodes = nodesRef.current;
    if (!nodes || !started) return;
    nodes.master.gain.rampTo(config.enabled && !screensaverMuted ? config.masterVolume : 0, 0.15);
  }, [config.enabled, config.masterVolume, screensaverMuted, started]);

  useEffect(() => disposeNodes, [disposeNodes]);

  useEffect(() => {
    if (!isArcade || !config.enabled || started) return undefined;
    start();
    const unlock = () => start();
    window.addEventListener('pointerdown', unlock, { once: true, capture: true });
    window.addEventListener('keydown', unlock, { once: true, capture: true });
    return () => {
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
    };
  }, [config.enabled, isArcade, start, started]);

  const updateVisualState = useCallback((visual) => {
    visualRef.current = visual;
    if (!started || !config.enabled) return;
    const nodes = ensureNodes();
    const last = lastAppliedRef.current;
    const layers = visual?.layers || {};
    const speed = Math.max(0.1, Math.min(5, Number(visual?.speed) || 1));
    const generatedPaletteSound = paletteToSound(visual?.paletteColors);
    const paletteIdentity = generatedPaletteSound.identity;
    const paletteOverride = config.paletteOverrides?.[paletteIdentity]
      || config.paletteOverrides?.[String(visual?.paletteIndex)]
      || {};
    const paletteSound = { ...generatedPaletteSound, ...paletteOverride };
    const programId = config.paletteProgramMap?.[paletteIdentity] || getGeneratedProgramId(paletteIdentity);
    const program = SOUND_PROGRAMS[programId] || SOUND_PROGRAMS.velvet;
    const soundMode = resolveSoundscapeMode({ mode: config.mode, blendMode: visual?.blendMode, isArcade });
    const harmonicMode = soundMode === 'harmonic';
    const backgroundOverride = config.backgroundOverrides?.[String(visual?.backgroundColor || '').toLowerCase()] || {};
    const backgroundRoot = colorToRootMidi(visual?.backgroundColor) + (Number(backgroundOverride.rootOffset) || 0);
    const paletteRoot = paletteSound.rootMidi + (Number(paletteOverride.rootOffset) || 0);
    const backgroundHsl = hexToHsl(visual?.backgroundColor);
    const ramp = Math.max(0.08, config.smoothing);
    const tension = calculateSoundscapeTension({
      speed,
      noise: layers.noise,
      curviness: layers.curviness,
      wobble: layers.wobble,
    });
    const layerCount = Math.max(0, Number(layers.count) || 0);
    const primaryVoiceCount = Math.max(0, Math.min(8, Number(layers.primaryVoiceCount) || Math.min(layerCount, config.voiceLimit)));
    const density = clamp01(Number(layers.density), clamp01(layerCount / 20));
    const chaos = clamp01(Number(layers.chaos), clamp01((layerCount - 8) / 12));
    const noiseAmount = clamp01(layers.noise);
    const wobbleAmount = clamp01(layers.wobble);
    const sparseLift = Math.max(0, 1 - density) * 0.34;
    const sources = {
      speed: clamp01((speed - 0.1) / 4.9),
      layers: clamp01(primaryVoiceCount / Math.max(1, config.voiceLimit)),
      density,
      chaos,
      size: clamp01(layers.size),
      opacity: clamp01(layers.opacity, 1),
      noise: noiseAmount,
      blend: visual?.blendMode === 'difference' ? 1 : 0,
      curviness: clamp01(layers.curviness, 1),
      wobble: wobbleAmount,
      sides: clamp01(((Number(layers.sides) || 3) - 3) / 17),
      tension,
      backgroundLightness: clamp01(backgroundHsl.lightness),
    };
    const { destinations, smoothing } = resolveSoundscapeRoutes(sources, config.routes);
    const changed = (key, value, epsilon = 0.0001) => {
      const previous = last[key];
      if (typeof value === 'number' && typeof previous === 'number' && Math.abs(value - previous) <= epsilon) return false;
      if (Object.is(previous, value)) return false;
      last[key] = value;
      return true;
    };
    const rampIfChanged = (key, param, value, epsilon, duration = ramp) => {
      if (changed(key, value, epsilon)) param.rampTo(value, duration);
    };

    rampIfChanged('bpm', Tone.getTransport().bpm, destinations.bpm ?? 72, 0.05, smoothing.bpm);
    rampIfChanged('masterGain', nodes.master.gain, calculateSoundscapeMasterGain({
      masterVolume: config.masterVolume,
      destinationGain: destinations.masterGain ?? 1,
      harmonicMode,
      screensaverMuted,
    }), 0.001, smoothing.masterGain);
    rampIfChanged('reverbWet', nodes.reverb.wet, clamp01((destinations.reverbWet ?? 0.35) + program.reverbOffset), 0.001, smoothing.reverbWet);
    const distortionAmount = harmonicMode
      ? Math.min(0.28, (destinations.distortion ?? 0.05) * 0.35 + noiseAmount * 0.025 + chaos * 0.02)
      : Math.min(0.75, (destinations.distortion ?? 0.05) + noiseAmount * 0.1 + chaos * 0.08);
    if (changed('distortion', distortionAmount, 0.002)) nodes.distortion.distortion = distortionAmount;
    const sizeWarmth = 1 - clamp01(layers.size, 0.2);
    rampIfChanged('filterFrequency', nodes.filter.frequency, Math.max(120, (destinations.filterFrequency ?? 900) + program.filterOffset - layers.size * 560 + sizeWarmth * 240 + (harmonicMode ? density * 240 : 0)), 1, smoothing.filterFrequency);
    rampIfChanged('filterQ', nodes.filter.Q, Math.max(0.2, (destinations.filterQ ?? 1) + program.filterQOffset + wobbleAmount * (harmonicMode ? 0.45 : 1.2)), 0.01, smoothing.filterQ);
    rampIfChanged('noiseFilterFrequency', nodes.noiseFilter.frequency, (destinations.noiseFilterFrequency ?? 500) + noiseAmount * (harmonicMode ? 260 : 650), 1, smoothing.noiseFilterFrequency);
    rampIfChanged('noiseVolume', nodes.noise.volume, (destinations.noiseVolume ?? -42) + program.noiseOffset + noiseAmount * (harmonicMode ? 1.5 : 5) + chaos * (harmonicMode ? 1.5 : 6), 0.05, smoothing.noiseVolume);
    rampIfChanged('compressorThreshold', nodes.compressor.threshold, visual?.blendMode === 'difference' ? -30 : -18);
    rampIfChanged('compressorRatio', nodes.compressor.ratio, visual?.blendMode === 'difference' ? 8 : 3);
    rampIfChanged('droneVolume', nodes.drone.volume, -24 + config.ambientLevel * 16 + (program.droneLevelOffset || 0) + sparseLift * 8 + (harmonicMode ? 2 : 0), 0.05);
    const droneOscillator = harmonicMode ? 'sine' : program.droneOscillator || (backgroundHsl.saturation > 0.65 ? 'triangle' : 'sine');
    if (nodes.droneOscillator !== droneOscillator) {
      try {
        nodes.drone.set({ oscillator: { type: droneOscillator } });
        nodes.droneOscillator = droneOscillator;
      } catch { /* noop */ }
    }
    if (nodes.noiseType !== program.noiseType) {
      try {
        nodes.noise.type = program.noiseType;
        nodes.noiseType = program.noiseType;
      } catch { /* noop */ }
    }
    if (liveMonitoringRef.current && performance.now() - lastLivePublishRef.current > 250) {
      lastLivePublishRef.current = performance.now();
      setLiveValues({ sources, destinations, paletteIdentity, programId });
    }
    const droneFrequency = midiToFrequency(backgroundRoot - 12);
    if (!nodes.droneStarted) {
      nodes.drone.triggerAttack(droneFrequency, undefined, 0.35);
      nodes.droneStarted = true;
      last.droneFrequency = droneFrequency;
    } else if (changed('droneFrequency', droneFrequency, 0.01)) {
      nodes.drone.frequency.rampTo(droneFrequency, ramp);
    }

    const voices = Array.isArray(layers.voices) ? layers.voices.slice(0, Math.min(8, config.voiceLimit)) : [];
    const third = paletteSound.scale.find(interval => interval === 3 || interval === 4) ?? 3;
    const fifth = paletteSound.scale.find(interval => interval === 7) ?? 7;
    const sixth = paletteSound.scale.find(interval => interval === 8 || interval === 9) ?? 9;
    const harmonicVoiceIntervals = buildHarmonicVoiceIntervals(paletteSound.scale);
    const harmony = clamp01((layers.sides - 3) / 17);
    const angularity = 1 - harmony;
    const discord = clamp01(angularity * (0.18 + tension * 1.35) + noiseAmount * 0.18 + wobbleAmount * 0.12 + chaos * 0.28);
    const calmness = clamp01(1 - tension);
    const simpleIntervals = [0, fifth, 12, 12 + fifth, 19, 24];
    const richIntervals = [0, third, fifth, sixth, 12, 12 + third, 12 + fifth, 19, 24, 24 + third, 31, 36];
    const discordantIntervals = [0, 1, 6, 11, 13, 18, 25, 30, 37];
    const clearVoiceIntervals = [0, fifth, 12, third || 5, 19, 24, 24 + sixth, 31];
    const harmonicDensityIntervals = uniqueSortedIntervals([
      ...HARMONIC_DENSITY_INTERVALS,
      ...paletteSound.scale,
      ...paletteSound.scale.map(interval => interval + 12),
      ...paletteSound.scale.map(interval => interval + 24),
    ]);
    const voiceGainCompensation = 1 / Math.sqrt(Math.max(1, voices.length)) * (1 + density * 0.12 + sparseLift);
    nodes.padVoices.forEach((pad, index) => {
      const voice = voices[index];
      if (!voice) {
        if (pad.active) {
          pad.gain.gain.rampTo(0, 0.6);
          pad.synth.triggerRelease();
          pad.active = false;
          pad.layerId = null;
        }
        return;
      }

      const hash = hashString(voice.id);
      const role = harmonicMode ? VOICE_ROLES[index % VOICE_ROLES.length] : VOICE_ROLES[(hash + index) % VOICE_ROLES.length];
      const sidesComplexity = clamp01((voice.sides - 3) / 17);
      const intervalSet = harmonicMode
        ? harmonicDensityIntervals
        : discord > 0.62
          ? discordantIntervals
          : tension < 0.28
            ? clearVoiceIntervals
            : harmony > 0.72
              ? simpleIntervals
              : richIntervals;
      const rawInterval = harmonicMode
        ? harmonicVoiceIntervals[index % harmonicVoiceIntervals.length]
        : tension < 0.28
          ? intervalSet[index % intervalSet.length]
          : intervalSet[(hash + index) % intervalSet.length];
      const baseInterval = harmonicMode
        ? rawInterval
        : rawInterval;
      const traversalCycle = Math.sin(voice.x * Math.PI * 2 + (hash % 7));
      const verticalCycle = Math.cos(voice.y * Math.PI * 2 + ((hash >>> 5) % 5));
      const sideHarmonicMotion = Math.sin((voice.x + voice.y) * Math.PI * (2 + Math.round(sidesComplexity * 5)));
      const detuneAmount = destinations.detuneAmount ?? 0.2;
      const motionDepth = harmonicMode
        ? (program.motionDepth || 1) * role.motion * (0.18 + wobbleAmount * 0.38 + density * 0.16 + chaos * 0.14)
        : (program.motionDepth || 1) * role.motion * (1 + wobbleAmount * 1.15 + noiseAmount * 0.35 + density * 0.35 + chaos * 0.65);
      const detuneSemitones = (
        traversalCycle * detuneAmount * (harmonicMode ? 0.12 + wobbleAmount * 0.2 : 0.18 + tension * 0.82)
        + verticalCycle * (harmonicMode ? wobbleAmount * 0.22 : tension + wobbleAmount * 0.5) * detuneAmount * 0.45
        + sideHarmonicMotion * (harmonicMode ? density * 0.08 : discord + noiseAmount * 0.25 + chaos * 0.45) * detuneAmount * 0.75
      ) * motionDepth;
      const sizeRegister = harmonicMode ? 0 : Math.round((0.5 - voice.size) * 18);
      const roleOctave = harmonicMode ? 0 : role.octave;
      const targetMidi = Math.max(28, Math.min(92, paletteRoot + 12 + program.octaveOffset + roleOctave + baseInterval + sizeRegister + detuneSemitones));
      const targetFrequency = midiToFrequency(targetMidi);
      const padRamp = Math.max(0.12, 0.7 - speed * 0.08);
      const desiredOscillator = harmonicMode
        ? HARMONIC_OSCILLATORS[(hash + index) % HARMONIC_OSCILLATORS.length]
        : sidesComplexity > 0.72 && tension > 0.58
        ? 'fatsawtooth'
        : program.padOscillator || paletteSound.oscillator;
      if (pad.last.programId !== programId) {
        try {
          pad.synth.set({
            envelope: {
              attack: program.attack || 1.8,
              decay: 1.2,
              sustain: 0.88,
              release: program.release || 3.5,
            },
          });
          pad.last.programId = programId;
        } catch { /* noop */ }
      }
      if (pad.oscillator !== desiredOscillator && pad.pendingOscillator !== desiredOscillator) {
        pad.pendingOscillator = desiredOscillator;
        pad.transitionUntil = performance.now() + 260;
        pad.gain.gain.rampTo(0, 0.12);
        window.setTimeout(() => {
          try {
            pad.synth.set({ oscillator: { type: desiredOscillator } });
            pad.oscillator = desiredOscillator;
          } catch { /* noop */ }
          pad.pendingOscillator = '';
        }, 130);
      }
      const padRampIfChanged = (key, param, value, epsilon = 0.001) => {
        const previous = pad.last[key];
        if (typeof previous === 'number' && Math.abs(previous - value) <= epsilon) return;
        pad.last[key] = value;
        param.rampTo(value, padRamp);
      };
      const stereoSpread = destinations.stereoSpread ?? 1;
      const panMotion = Math.sin((voice.x + voice.y + density) * Math.PI * 2 + hash) * density * 0.18;
      const harmonicVoiceMakeup = harmonicMode ? 1.34 - density * 0.14 : 1;
      padRampIfChanged('pan', pad.panner.pan, Math.max(-1, Math.min(1, ((voice.x * 2 - 1) + panMotion) * stereoSpread * (program.stereoWidth || 1))), 0.002);
      padRampIfChanged(
        'filterFrequency',
        pad.filter.frequency,
        Math.max(80, (240 + program.filterOffset + (1 - voice.y) * 1450 + (1 - voice.size) * 1100 + tension * (harmonicMode ? 650 : 1800) + sidesComplexity * (harmonicMode ? 420 : 1150) + discord * (harmonicMode ? 260 : 950) + density * (harmonicMode ? 520 : 650) + chaos * (harmonicMode ? 320 : 1100)) * role.filter),
        1,
      );
      padRampIfChanged('filterQ', pad.filter.Q, Math.max(0.2, 0.45 + program.filterQOffset + role.q + tension * (harmonicMode ? 1.1 : 3.2) + wobbleAmount * (harmonicMode ? 1.1 : 3.2) + noiseAmount * (harmonicMode ? 0.25 : 1.2) + discord * (harmonicMode ? 0.8 : 4) + chaos * (harmonicMode ? 0.55 : 2.2)), 0.01);
      const targetGain = performance.now() < (pad.transitionUntil || 0)
        ? 0
        : config.pulseLevel * (destinations.padLevel ?? 1) * voice.opacity * (0.2 + sparseLift * 0.14 + voice.size * 0.68) * voiceGainCompensation * role.gain * (program.voiceGain || 1) * (0.84 + calmness * 0.16) * harmonicVoiceMakeup * (role.name === 'shimmer' || role.name === 'texture' ? 1 + density * (harmonicMode ? 0.7 : 0.45) + chaos * (harmonicMode ? 0.25 : 0.55) : 1);
      padRampIfChanged('gain', pad.gain.gain, targetGain, 0.001);
      if (!pad.active || pad.layerId !== voice.id) {
        if (pad.active) pad.synth.triggerRelease();
        pad.layerId = voice.id;
        pad.active = true;
        pad.synth.triggerAttack(targetFrequency, undefined, 0.28);
      } else {
        padRampIfChanged('frequency', pad.synth.frequency, targetFrequency, 0.02);
      }
    });
  }, [config, ensureNodes, isArcade, screensaverMuted, started]);

  const triggerCollision = useCallback(({ layerId = 'layer', speed = 1 } = {}) => {
    if (!started || !config.enabled || !config.collisionEnabled) return;
    const visualLayers = visualRef.current?.layers || {};
    const layerCount = Math.max(0, Number(visualLayers.count) || 0);
    const density = clamp01(Number(visualLayers.density), clamp01(layerCount / 20));
    const chaos = clamp01(Number(visualLayers.chaos), clamp01((layerCount - 8) / 12));
    const soundMode = resolveSoundscapeMode({ mode: config.mode, blendMode: visualRef.current?.blendMode, isArcade });
    const harmonicMode = soundMode === 'harmonic';
    const now = performance.now();
    const previous = collisionTimesRef.current.get(layerId) || 0;
    const cooldown = Math.max(60, config.collisionCooldownMs * (1 - density * 0.28 - chaos * 0.32));
    if (now - previous < cooldown) return;
    collisionTimesRef.current.set(layerId, now);
    const nodes = ensureNodes();
    nodes.collision.volume.rampTo(-34 + config.collisionLevel * 24 + density * 3 + chaos * (harmonicMode ? 2 : 5), 0.03);
    const accentFrequency = harmonicMode
      ? 48 + HARMONIC_DENSITY_INTERVALS[(hashString(layerId) + Math.round(density * 8)) % HARMONIC_DENSITY_INTERVALS.length]
      : 45 + Math.min(50, Math.max(0, speed) * 8) + chaos * 16;
    nodes.collision.triggerAttackRelease(harmonicMode ? midiToFrequency(accentFrequency) : accentFrequency, chaos > 0.65 && !harmonicMode ? '32n' : '16n');
  }, [config, ensureNodes, isArcade, started]);

  const savePatch = useCallback((name) => {
    const trimmed = String(name || '').trim();
    if (!trimmed) return false;
    setPatches(previous => ({ ...previous, [trimmed]: config }));
    return true;
  }, [config]);

  const deletePatch = useCallback((name) => {
    setPatches(previous => {
      const next = { ...previous };
      delete next[name];
      return next;
    });
  }, []);

  const addRoute = useCallback((route) => {
    setConfig(previous => ({
      ...previous,
      routes: normalizeSoundscapeRoutes([
        ...previous.routes,
        { ...route, id: route?.id || `route-${Date.now()}` },
      ]),
    }));
  }, [setConfig]);

  const updateRoute = useCallback((id, patch) => {
    setConfig(previous => ({
      ...previous,
      routes: normalizeSoundscapeRoutes(previous.routes.map(route => (
        route.id === id ? { ...route, ...patch, id } : route
      ))),
    }));
  }, [setConfig]);

  const deleteRoute = useCallback((id) => {
    setConfig(previous => ({ ...previous, routes: previous.routes.filter(route => route.id !== id) }));
  }, [setConfig]);

  const assignPaletteProgram = useCallback((paletteIdentity, programId) => {
    if (!paletteIdentity || !SOUND_PROGRAMS[programId]) return;
    setConfig(previous => ({
      ...previous,
      paletteProgramMap: { ...previous.paletteProgramMap, [paletteIdentity]: programId },
    }));
  }, [setConfig]);

  const setLiveMonitoring = useCallback((enabled) => {
    liveMonitoringRef.current = !!enabled;
  }, []);

  const getSoundscapeSnapshot = useCallback(() => normalizeConfig(config), [config]);
  const applySoundscapeSnapshot = useCallback((snapshot) => {
    if (snapshot && typeof snapshot === 'object') setConfig(snapshot);
  }, [setConfig]);

  const value = useMemo(() => ({
    config,
    setConfig,
    started,
    startError,
    start,
    stop,
    updateVisualState,
    triggerCollision,
    patches,
    liveValues,
    programs: SOUND_PROGRAMS,
    savePatch,
    deletePatch,
    addRoute,
    updateRoute,
    deleteRoute,
    assignPaletteProgram,
    setLiveMonitoring,
    setScreensaverMuted,
    applyPatch: name => patches[name] && setConfig(patches[name]),
    getSoundscapeSnapshot,
    applySoundscapeSnapshot,
    resetConfig: () => setConfig(DEFAULT_SOUNDSCAPE_CONFIG),
  }), [
    addRoute, applySoundscapeSnapshot, assignPaletteProgram, config, deletePatch, deleteRoute,
    getSoundscapeSnapshot, liveValues, patches, savePatch, setConfig, start, startError, started,
    setLiveMonitoring, stop, triggerCollision, updateRoute, updateVisualState,
  ]);

  return <SoundscapeContext.Provider value={value}>{children}</SoundscapeContext.Provider>;
};

export const useSoundscape = () => useContext(SoundscapeContext);
