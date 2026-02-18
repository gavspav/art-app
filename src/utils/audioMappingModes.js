/**
 * audioMappingModes.js - Temporal processing modes for audio→parameter mapping
 * 
 * Each mode transforms raw audio values (0-1) into slowly-evolving parameter
 * values suited for generative art that changes over seconds/minutes, not frames.
 * 
 * Modes:
 *   direct      - Pass-through (existing behavior)
 *   accumulate  - Audio pushes value continuously (audio as fuel, not position)
 *   leaky       - Accumulates but decays toward rest when quiet
 *   bandRatio   - Spectral tilt (bass/highs ratio) - inherently slow-moving
 *   runningAvg  - Long-window average (3-10s) follows song structure
 *   onsetDrift  - Beats trigger slow direction changes
 *   hysteresis  - State zones (quiet/medium/loud) with slow lerping
 *   milkdrop    - Equation-driven blend of LFO, audio, transient, and beat hold
 */

// Available modes with labels and descriptions
export const AUDIO_MAPPING_MODES = [
  { value: 'direct',     label: 'Direct',       desc: 'Immediate response (default)' },
  { value: 'accumulate', label: 'Accumulate',    desc: 'Audio pushes value continuously' },
  { value: 'leaky',      label: 'Leaky',         desc: 'Accumulates, decays in silence' },
  { value: 'bandRatio',  label: 'Band Ratio',    desc: 'Spectral warmth/brightness' },
  { value: 'runningAvg', label: 'Running Avg',   desc: 'Long window average (slow)' },
  { value: 'onsetDrift', label: 'Onset Drift',   desc: 'Beats trigger direction changes' },
  { value: 'hysteresis', label: 'Hysteresis',    desc: 'Zone-based (quiet/med/loud)' },
  { value: 'milkdrop',   label: 'Milkdrop Eq',   desc: 'LFO + audio + beat/transient shaping' },
];

// Default settings per mode
export const DEFAULT_MODE_SETTINGS = {
  direct: {},
  accumulate: {
    rate: 0.02,        // How fast audio pushes the value per frame
    wrap: true,        // Wrap around 0-1 (vs clamp)
  },
  leaky: {
    rate: 0.03,        // Accumulation rate
    decay: 0.998,      // Per-frame decay factor (closer to 1 = slower decay)
    restValue: 0.5,    // Value to decay toward
  },
  bandRatio: {
    numerator: 'bass',   // Top of ratio
    denominator: 'highs', // Bottom of ratio
    scale: 3.0,          // Normalization divisor
  },
  runningAvg: {
    windowSeconds: 5.0,  // Averaging window in seconds
  },
  onsetDrift: {
    threshold: 1.5,      // Onset detection multiplier (current/previous)
    minLevel: 0.15,      // Minimum level to trigger onset
    driftSpeed: 0.01,    // How fast to approach new target
  },
  hysteresis: {
    quietToMed: 0.25,    // Threshold to enter medium zone
    medToLoud: 0.55,     // Threshold to enter loud zone
    loudToMed: 0.40,     // Threshold to drop from loud to medium
    medToQuiet: 0.12,    // Threshold to drop from medium to quiet
    lerpSpeed: 0.005,    // Per-frame lerp speed toward target
    quietValue: 0.0,     // Output value for quiet zone
    medValue: 0.5,       // Output value for medium zone
    loudValue: 1.0,      // Output value for loud zone
  },
  milkdrop: {
    lfoHz: 0.16,          // Base LFO speed in Hz
    lfoAmount: 0.35,      // LFO contribution
    audioAmount: 0.7,     // Raw audio contribution
    transientAmount: 0.45, // Transient boost
    beatHold: 0.3,        // Beat hold/decay blend
    pitchInfluence: 0.25, // Pitch influence on LFO speed
  },
};

const toFinite = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const clamp01 = (value) => Math.max(0, Math.min(1, toFinite(value, 0)));

/**
 * AudioModeProcessor - Maintains per-parameter state and processes audio values
 * through the selected temporal mode.
 * 
 * Usage:
 *   const processor = new AudioModeProcessor();
 *   // In dispatch loop:
 *   const output = processor.process(paramId, rawValue, features, mode, modeSettings, dt);
 */
export class AudioModeProcessor {
  constructor() {
    // Per-param state: { [paramId]: { ...mode-specific state } }
    this.state = {};
  }

  // Get or initialize state for a param
  _getState(paramId, mode) {
    if (!this.state[paramId] || this.state[paramId]._mode !== mode) {
      this.state[paramId] = this._initState(mode);
    }
    return this.state[paramId];
  }

  _initState(mode) {
    switch (mode) {
      case 'accumulate':
        return { _mode: 'accumulate', value: 0 };
      case 'leaky':
        return { _mode: 'leaky', value: 0 };
      case 'bandRatio':
        return { _mode: 'bandRatio', smoothed: 0 };
      case 'runningAvg':
        return { _mode: 'runningAvg', buffer: [], lastPushTime: 0 };
      case 'onsetDrift':
        return { _mode: 'onsetDrift', prevLevel: 0, target: 0.5, value: 0.5 };
      case 'hysteresis':
        return { _mode: 'hysteresis', zone: 'quiet', value: 0, avgLevel: 0 };
      case 'milkdrop':
        return { _mode: 'milkdrop', phase: 0, value: 0, hold: 0 };
      default:
        return { _mode: 'direct' };
    }
  }

  // Clear state for a specific param (e.g., when mapping changes)
  clearParam(paramId) {
    delete this.state[paramId];
  }

  // Clear all state
  clearAll() {
    this.state = {};
  }

  /**
   * Process a raw audio value through the selected mode.
   * 
   * @param {string} paramId - Parameter identifier
   * @param {number} rawValue - Raw audio band value (0-1, already sensitivity-scaled)
   * @param {Object} features - Full features object { rms, bass, mids, highs }
   * @param {string} mode - Mode name
   * @param {Object} modeSettings - Mode-specific settings
   * @param {number} dt - Delta time in seconds since last frame (~0.05 at 20fps)
   * @returns {number} Processed value (0-1)
   */
  process(paramId, rawValue, features, mode, modeSettings, dt) {
    const safeRaw = clamp01(rawValue);
    const safeDt = Math.max(0.0001, toFinite(dt, 0.05));
    if (!mode || mode === 'direct') {
      return safeRaw;
    }

    const s = (modeSettings && typeof modeSettings === 'object')
      ? modeSettings
      : (DEFAULT_MODE_SETTINGS[mode] || {});

    let output = safeRaw;
    switch (mode) {
      case 'accumulate':
        output = this._accumulate(paramId, safeRaw, s, safeDt);
        break;
      case 'leaky':
        output = this._leaky(paramId, safeRaw, s, safeDt);
        break;
      case 'bandRatio':
        output = this._bandRatio(paramId, features, s, safeDt);
        break;
      case 'runningAvg':
        output = this._runningAvg(paramId, safeRaw, s, safeDt);
        break;
      case 'onsetDrift':
        output = this._onsetDrift(paramId, safeRaw, s, safeDt);
        break;
      case 'hysteresis':
        output = this._hysteresis(paramId, safeRaw, s, safeDt);
        break;
      case 'milkdrop':
        output = this._milkdrop(paramId, safeRaw, features, s, safeDt);
        break;
      default:
        output = safeRaw;
        break;
    }

    return clamp01(output);
  }

  // ─── Mode implementations ───

  /**
   * Accumulate: audio energy pushes the value continuously.
   * Silence = still, loud = continuous movement.
   */
  _accumulate(paramId, raw, settings, dt) {
    const st = this._getState(paramId, 'accumulate');
    const rate = Math.max(0, toFinite(settings.rate, 0.02));
    const wrap = settings.wrap ?? true;

    // Scale rate by dt to be framerate-independent (normalize to 20fps baseline)
    const scaledRate = rate * (dt / 0.05);
    st.value = toFinite(st.value, 0) + raw * scaledRate;

    if (wrap) {
      // Wrap around 0-1
      st.value = st.value % 1;
      if (st.value < 0) st.value += 1;
    } else {
      st.value = clamp01(st.value);
    }

    return clamp01(st.value);
  }

  /**
   * Leaky integrator: accumulates with decay toward rest value.
   * Builds up during loud passages, slowly falls back in silence.
   */
  _leaky(paramId, raw, settings, dt) {
    const st = this._getState(paramId, 'leaky');
    const rate = Math.max(0, toFinite(settings.rate, 0.03));
    const decay = Math.max(0, Math.min(0.999999, toFinite(settings.decay, 0.998)));
    const restValue = clamp01(settings.restValue ?? 0.5);

    const scaledRate = rate * (dt / 0.05);

    // Accumulate audio energy
    st.value = toFinite(st.value, restValue) + raw * scaledRate;

    // Decay toward rest value
    // decay^(dt/0.05) for framerate independence
    const effectiveDecay = Math.pow(decay, dt / 0.05);
    st.value = restValue + (st.value - restValue) * effectiveDecay;

    // Clamp to 0-1
    st.value = clamp01(st.value);

    return clamp01(st.value);
  }

  /**
   * Band ratio: computes spectral tilt (e.g., bass/highs).
   * Inherently slow-moving, great for tonal quality changes.
   */
  _bandRatio(paramId, features, settings, dt) {
    const st = this._getState(paramId, 'bandRatio');
    const num = settings.numerator ?? 'bass';
    const den = settings.denominator ?? 'highs';
    const scale = Math.max(0.0001, toFinite(settings.scale, 3.0));
    const featureMap = (features && typeof features === 'object') ? features : {};

    const numVal = clamp01(featureMap[num]);
    const denVal = clamp01(featureMap[den]);

    // Compute ratio, normalize to 0-1
    const ratio = numVal / (denVal + 0.01);
    const normalized = Math.min(1, ratio / scale);

    // Smooth the ratio value
    const smoothFactor = Math.pow(0.92, dt / 0.05);
    st.smoothed = toFinite(st.smoothed, 0) * smoothFactor + normalized * (1 - smoothFactor);

    return clamp01(st.smoothed);
  }

  /**
   * Running average: averages audio energy over a long window (3-10s).
   * Follows song structure (verse vs chorus) rather than individual beats.
   */
  _runningAvg(paramId, raw, settings, _dt) {
    const st = this._getState(paramId, 'runningAvg');
    const windowSec = Math.max(0.1, toFinite(settings.windowSeconds, 5.0));

    if (!Array.isArray(st.buffer)) st.buffer = [];

    // Push sample at ~20fps (every ~50ms)
    st.buffer.push(clamp01(raw));

    // Calculate max buffer size based on window and assumed ~20fps dispatch rate
    const fps = 20;
    const maxSize = Math.max(1, Math.round(windowSec * fps));

    // Trim buffer to window size
    while (st.buffer.length > maxSize) {
      st.buffer.shift();
    }

    // Compute average
    if (st.buffer.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < st.buffer.length; i++) {
      sum += clamp01(st.buffer[i]);
    }
    return clamp01(sum / st.buffer.length);
  }

  /**
   * Onset drift: detects sudden energy increases (beats/hits) and uses them
   * to trigger slow parameter drifts toward new random targets.
   */
  _onsetDrift(paramId, raw, settings, dt) {
    const st = this._getState(paramId, 'onsetDrift');
    const threshold = Math.max(1, toFinite(settings.threshold, 1.5));
    const minLevel = clamp01(settings.minLevel ?? 0.15);
    const driftSpeed = Math.max(0, toFinite(settings.driftSpeed, 0.01));
    const level = clamp01(raw);

    // Detect onset: current level significantly higher than previous
    st.prevLevel = clamp01(st.prevLevel);
    const isOnset = level > st.prevLevel * threshold && level > minLevel;
    st.prevLevel = level;

    if (isOnset) {
      // Pick a new random target, weighted by energy
      // Use a seeded-ish approach: mix current value with random
      st.target = Math.random();
      // Scale drift speed by onset energy
      st.currentDriftSpeed = driftSpeed * (1 + level * 3);
    }

    // Smoothly approach target
    const currentSpeed = Math.max(0, toFinite(st.currentDriftSpeed, driftSpeed));
    const scaledSpeed = currentSpeed * (dt / 0.05);
    st.value = toFinite(st.value, 0.5) + (toFinite(st.target, 0.5) - toFinite(st.value, 0.5)) * scaledSpeed;
    st.value = clamp01(st.value);

    return clamp01(st.value);
  }

  /**
   * Hysteresis zones: divides audio into quiet/medium/loud zones with
   * different enter/exit thresholds (prevents flickering).
   * Slowly lerps toward zone-specific target values.
   */
  _hysteresis(paramId, raw, settings, dt) {
    const st = this._getState(paramId, 'hysteresis');

    const quietToMed = clamp01(settings.quietToMed ?? 0.25);
    const medToLoud = clamp01(settings.medToLoud ?? 0.55);
    const loudToMed = clamp01(settings.loudToMed ?? 0.40);
    const medToQuiet = clamp01(settings.medToQuiet ?? 0.12);
    const lerpSpeed = Math.max(0, toFinite(settings.lerpSpeed, 0.005));
    const quietValue = clamp01(settings.quietValue ?? 0.0);
    const medValue = clamp01(settings.medValue ?? 0.5);
    const loudValue = clamp01(settings.loudValue ?? 1.0);

    // Smooth the raw input to avoid jitter in zone detection
    const smoothFactor = Math.pow(0.9, dt / 0.05);
    st.avgLevel = clamp01(toFinite(st.avgLevel, 0) * smoothFactor + clamp01(raw) * (1 - smoothFactor));
    const level = clamp01(st.avgLevel);

    // Zone transitions with hysteresis
    if (st.zone === 'quiet') {
      if (level > quietToMed) st.zone = 'medium';
    } else if (st.zone === 'medium') {
      if (level > medToLoud) st.zone = 'loud';
      else if (level < medToQuiet) st.zone = 'quiet';
    } else if (st.zone === 'loud') {
      if (level < loudToMed) st.zone = 'medium';
    }

    // Determine target based on zone
    let target;
    switch (st.zone) {
      case 'loud':   target = loudValue; break;
      case 'medium': target = medValue; break;
      default:       target = quietValue; break;
    }

    // Slowly lerp toward target
    const scaledLerp = lerpSpeed * (dt / 0.05);
    const currentValue = toFinite(st.value, quietValue);
    st.value = clamp01(currentValue + (target - currentValue) * scaledLerp);

    return clamp01(st.value);
  }

  /**
   * Milkdrop-style equation mode:
   * Blends an audio-driven term with a lightweight LFO and beat/transient hold.
   */
  _milkdrop(paramId, raw, features, settings, dt) {
    const st = this._getState(paramId, 'milkdrop');
    const f = (features && typeof features === 'object') ? features : {};

    const lfoHz = Math.max(0.001, toFinite(settings.lfoHz, 0.16));
    const lfoAmount = clamp01(settings.lfoAmount ?? 0.35);
    const audioAmount = clamp01(settings.audioAmount ?? 0.7);
    const transientAmount = clamp01(settings.transientAmount ?? 0.45);
    const beatHold = clamp01(settings.beatHold ?? 0.3);
    const pitchInfluence = clamp01(settings.pitchInfluence ?? 0.25);

    const pitch = clamp01(f.pitch);
    const transient = clamp01(f.transient);
    const beat = clamp01(f.beat);

    const lfoSpeed = lfoHz * (1 + pitch * pitchInfluence * 2);
    const phase = toFinite(st.phase, 0) + (lfoSpeed * dt * Math.PI * 2);
    st.phase = phase % (Math.PI * 2);
    const lfo = 0.5 + 0.5 * Math.sin(st.phase);

    // Hold spikes on beats, then decay.
    st.hold = Math.max(toFinite(st.hold, 0), beat);
    const holdDecay = Math.pow(Math.max(0.05, 1 - beatHold * 0.85), dt / 0.05);
    st.hold *= holdDecay;

    const transientTerm = clamp01((transient * transientAmount) + (st.hold * 0.7));
    const combined = clamp01(
      (raw * audioAmount)
      + (lfo * lfoAmount)
      + transientTerm,
    );

    const smooth = Math.pow(0.82, dt / 0.05);
    st.value = clamp01((toFinite(st.value, combined) * smooth) + (combined * (1 - smooth)));
    return st.value;
  }
}
