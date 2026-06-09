import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as Tone from 'tone';
import { calculateSoundscapeTension, clamp01, colorToRootMidi, hexToHsl, paletteToSound } from '../utils/soundscapeUtils.js';
import { getRuntimeProfile } from '../utils/runtimeProfile.js';

const SoundscapeContext = createContext(null);
const STORAGE_KEY = 'artapp-soundscape-config';
const PATCHES_KEY = 'artapp-soundscape-patches';
const MAPPING_KEYS = ['palette', 'background', 'speed', 'layers', 'size', 'opacity', 'noise', 'blend', 'curviness', 'wobble', 'sides'];
const DEFAULT_MAPPING_RANGES = Object.fromEntries(MAPPING_KEYS.map(key => [key, { min: 0, max: 1, invert: false }]));

export const DEFAULT_SOUNDSCAPE_CONFIG = Object.freeze({
  version: 1,
  enabled: true,
  masterVolume: 0.55,
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
    size: 0.65,
    opacity: 0.8,
    noise: 0.6,
    blend: 0.7,
    curviness: 0.7,
    wobble: 0.55,
    sides: 0.5,
  },
  mappingRanges: DEFAULT_MAPPING_RANGES,
  paletteOverrides: {},
  backgroundOverrides: {},
});

const normalizeConfig = (config) => ({
  ...DEFAULT_SOUNDSCAPE_CONFIG,
  ...(config || {}),
  mappings: { ...DEFAULT_SOUNDSCAPE_CONFIG.mappings, ...(config?.mappings || {}) },
  mappingRanges: Object.fromEntries(MAPPING_KEYS.map(key => [
    key,
    { ...DEFAULT_MAPPING_RANGES[key], ...(config?.mappingRanges?.[key] || {}) },
  ])),
  paletteOverrides: { ...(config?.paletteOverrides || {}) },
  backgroundOverrides: { ...(config?.backgroundOverrides || {}) },
  version: 1,
});

const readStored = (key, fallback) => {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null');
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

const midiToFrequency = (midi) => 440 * (2 ** ((midi - 69) / 12));
const hashString = (value) => {
  let hash = 2166136261;
  for (const char of String(value || '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};
const mapVisualValue = (config, key, value) => {
  const range = config.mappingRanges?.[key] || DEFAULT_MAPPING_RANGES[key];
  const normalized = range.invert ? 1 - clamp01(value) : clamp01(value);
  return Number(range.min) + normalized * (Number(range.max) - Number(range.min));
};

export const SoundscapeProvider = ({ children }) => {
  const isArcade = useMemo(() => getRuntimeProfile().isArcade, []);
  const [config, setConfigState] = useState(() => normalizeConfig(readStored(STORAGE_KEY, null)));
  const [patches, setPatches] = useState(() => readStored(PATCHES_KEY, {}));
  const [started, setStarted] = useState(false);
  const [startError, setStartError] = useState('');
  const nodesRef = useRef(null);
  const visualRef = useRef(null);
  const configRef = useRef(config);
  const collisionTimesRef = useRef(new Map());
  const lastAppliedRef = useRef({});

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
    nodes.master.gain.rampTo(config.enabled ? config.masterVolume : 0, 0.15);
  }, [config.enabled, config.masterVolume, started]);

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
    const mappings = config.mappings;
    const speed = Math.max(0.1, Math.min(5, Number(visual?.speed) || 1));
    const generatedPaletteSound = paletteToSound(visual?.paletteColors);
    const paletteOverride = config.paletteOverrides?.[String(visual?.paletteIndex)] || {};
    const paletteSound = { ...generatedPaletteSound, ...paletteOverride };
    const backgroundOverride = config.backgroundOverrides?.[String(visual?.backgroundColor || '').toLowerCase()] || {};
    const backgroundRoot = colorToRootMidi(visual?.backgroundColor) + (Number(backgroundOverride.rootOffset) || 0);
    const paletteRoot = paletteSound.rootMidi + Math.round((Number(paletteOverride.rootOffset) || 0) * mappings.palette);
    const backgroundHsl = hexToHsl(visual?.backgroundColor);
    const ramp = Math.max(0.08, config.smoothing);
    const mappedSpeed = mapVisualValue(config, 'speed', (speed - 0.1) / 4.9);
    const mappedOpacity = mapVisualValue(config, 'opacity', layers.opacity);
    const mappedSize = mapVisualValue(config, 'size', layers.size);
    const mappedNoise = mapVisualValue(config, 'noise', layers.noise);
    const mappedCurviness = mapVisualValue(config, 'curviness', layers.curviness);
    const mappedWobble = mapVisualValue(config, 'wobble', layers.wobble);
    const mappedBackground = mapVisualValue(config, 'background', backgroundHsl.lightness);
    const changed = (key, value, epsilon = 0.0001) => {
      const previous = last[key];
      if (typeof value === 'number' && typeof previous === 'number' && Math.abs(value - previous) <= epsilon) return false;
      if (Object.is(previous, value)) return false;
      last[key] = value;
      return true;
    };
    const rampIfChanged = (key, param, value, epsilon) => {
      if (changed(key, value, epsilon)) param.rampTo(value, ramp);
    };

    rampIfChanged('bpm', Tone.getTransport().bpm, 42 + mappedSpeed * 120 * mappings.speed, 0.05);
    rampIfChanged('masterGain', nodes.master.gain, config.masterVolume * (0.25 + mappedOpacity * 0.75 * mappings.opacity));
    rampIfChanged('reverbWet', nodes.reverb.wet, clamp01(0.08 + mappedSize * 0.88 * mappings.size));
    const distortionAmount = clamp01(mappedNoise * 0.75 * mappings.noise);
    if (changed('distortion', distortionAmount, 0.002)) nodes.distortion.distortion = distortionAmount;
    const tension = calculateSoundscapeTension({
      speed,
      noise: layers.noise,
      curviness: layers.curviness,
      wobble: layers.wobble,
    });
    rampIfChanged('filterFrequency', nodes.filter.frequency, 240 + mappedCurviness * 2200 * mappings.curviness + tension * 1800, 1);
    rampIfChanged('filterQ', nodes.filter.Q, 0.5 + mappedWobble * 7 * mappings.wobble, 0.01);
    rampIfChanged('noiseFilterFrequency', nodes.noiseFilter.frequency, 180 + mappedBackground * 1300 * mappings.background, 1);
    rampIfChanged('noiseVolume', nodes.noise.volume, -48 + mappedNoise * 28 * mappings.noise, 0.05);
    rampIfChanged('compressorThreshold', nodes.compressor.threshold, visual?.blendMode === 'difference' ? -30 : -18);
    rampIfChanged('compressorRatio', nodes.compressor.ratio, visual?.blendMode === 'difference' ? 8 : 3);
    rampIfChanged('droneVolume', nodes.drone.volume, -24 + config.ambientLevel * 16, 0.05);
    const droneOscillator = backgroundHsl.saturation > 0.65 ? 'triangle' : 'sine';
    if (nodes.droneOscillator !== droneOscillator) {
      try {
        nodes.drone.set({ oscillator: { type: droneOscillator } });
        nodes.droneOscillator = droneOscillator;
      } catch { /* noop */ }
    }
    const droneFrequency = midiToFrequency(backgroundRoot - 12);
    if (!nodes.droneStarted) {
      nodes.drone.triggerAttack(droneFrequency, undefined, 0.35);
      nodes.droneStarted = true;
      last.droneFrequency = droneFrequency;
    } else if (changed('droneFrequency', droneFrequency, 0.01)) {
      nodes.drone.frequency.rampTo(droneFrequency, ramp);
    }

    const voices = Array.isArray(layers.voices) ? layers.voices.slice(0, config.voiceLimit) : [];
    const third = paletteSound.scale.find(interval => interval === 3 || interval === 4) ?? 3;
    const fifth = paletteSound.scale.find(interval => interval === 7) ?? 7;
    const harmony = clamp01((layers.sides - 3) / 17);
    const angularity = 1 - harmony;
    const discord = clamp01(angularity * tension * 1.45);
    const simpleIntervals = [0, fifth, 12, 12 + fifth, 24];
    const richIntervals = [0, third, fifth, 12, 12 + third, 12 + fifth, 19, 24, 24 + third, 31, 36];
    const discordantIntervals = [0, 1, 6, 11, 13, 18, 25, 30, 37];
    const calmVoicing = [0, fifth, 12, 12 + third, 19, 24, 24 + fifth, 36];
    const voiceGainCompensation = 1 / Math.sqrt(Math.max(1, voices.length));
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
      const sidesComplexity = clamp01((voice.sides - 3) / 17);
      const intervalSet = discord > 0.62
        ? discordantIntervals
        : tension < 0.28
          ? calmVoicing
          : harmony > 0.72
            ? simpleIntervals
            : richIntervals;
      const baseInterval = tension < 0.28
        ? intervalSet[index % intervalSet.length]
        : intervalSet[(hash + index) % intervalSet.length];
      const traversalCycle = Math.sin(voice.x * Math.PI * 2 + (hash % 7));
      const verticalCycle = Math.cos(voice.y * Math.PI * 2 + ((hash >>> 5) % 5));
      const sideHarmonicMotion = Math.sin((voice.x + voice.y) * Math.PI * (2 + Math.round(sidesComplexity * 5)));
      const detuneSemitones = traversalCycle * (0.012 + tension * 1.45)
        + verticalCycle * tension * 0.6
        + sideHarmonicMotion * discord * tension * 0.8;
      const sizeOctave = voice.size > 0.55 ? -12 : voice.size < 0.1 ? 12 : 0;
      const targetMidi = paletteRoot + 12 + baseInterval + sizeOctave + detuneSemitones;
      const targetFrequency = midiToFrequency(targetMidi);
      const padRamp = Math.max(0.12, 0.7 - speed * 0.08);
      const desiredOscillator = sidesComplexity > 0.72 && tension > 0.58
        ? 'fatsawtooth'
        : paletteSound.oscillator;
      if (pad.oscillator !== desiredOscillator) {
        try {
          pad.synth.set({ oscillator: { type: desiredOscillator } });
          pad.oscillator = desiredOscillator;
        } catch { /* noop */ }
      }
      pad.panner.pan.rampTo(voice.x * 2 - 1, padRamp);
      pad.filter.frequency.rampTo(
        240 + (1 - voice.y) * 1500 + voice.size * 850 + tension * 1800 + sidesComplexity * 1500 + discord * 900,
        padRamp,
      );
      pad.filter.Q.rampTo(0.45 + tension * 4 + layers.wobble * 1.5 + discord * 4, padRamp);
      pad.gain.gain.rampTo(
        config.pulseLevel * voice.opacity * (0.16 + voice.size * 0.7) * voiceGainCompensation,
        padRamp,
      );
      if (!pad.active || pad.layerId !== voice.id) {
        if (pad.active) pad.synth.triggerRelease();
        pad.layerId = voice.id;
        pad.active = true;
        pad.synth.triggerAttack(targetFrequency, undefined, 0.28);
      } else {
        pad.synth.frequency.rampTo(targetFrequency, padRamp);
      }
    });
  }, [config, ensureNodes, started]);

  const triggerCollision = useCallback(({ layerId = 'layer', speed = 1 } = {}) => {
    if (!started || !config.enabled || !config.collisionEnabled) return;
    const now = performance.now();
    const previous = collisionTimesRef.current.get(layerId) || 0;
    if (now - previous < config.collisionCooldownMs) return;
    collisionTimesRef.current.set(layerId, now);
    const nodes = ensureNodes();
    nodes.collision.volume.rampTo(-34 + config.collisionLevel * 24, 0.03);
    nodes.collision.triggerAttackRelease(45 + Math.min(50, Math.max(0, speed) * 8), '16n');
  }, [config, ensureNodes, started]);

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
    savePatch,
    deletePatch,
    applyPatch: name => patches[name] && setConfig(patches[name]),
    getSoundscapeSnapshot,
    applySoundscapeSnapshot,
    resetConfig: () => setConfig(DEFAULT_SOUNDSCAPE_CONFIG),
  }), [
    applySoundscapeSnapshot, config, deletePatch, getSoundscapeSnapshot, patches, savePatch, setConfig,
    start, startError, started, stop, triggerCollision, updateVisualState,
  ]);

  return <SoundscapeContext.Provider value={value}>{children}</SoundscapeContext.Provider>;
};

export const useSoundscape = () => useContext(SoundscapeContext);
