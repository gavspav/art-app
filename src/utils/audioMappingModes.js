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
};

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
    if (!mode || mode === 'direct') {
      return rawValue;
    }

    const s = modeSettings || DEFAULT_MODE_SETTINGS[mode] || {};

    switch (mode) {
      case 'accumulate':
        return this._accumulate(paramId, rawValue, s, dt);
      case 'leaky':
        return this._leaky(paramId, rawValue, s, dt);
      case 'bandRatio':
        return this._bandRatio(paramId, features, s, dt);
      case 'runningAvg':
        return this._runningAvg(paramId, rawValue, s, dt);
      case 'onsetDrift':
        return this._onsetDrift(paramId, rawValue, s, dt);
      case 'hysteresis':
        return this._hysteresis(paramId, rawValue, s, dt);
      default:
        return rawValue;
    }
  }

  // ─── Mode implementations ───

  /**
   * Accumulate: audio energy pushes the value continuously.
   * Silence = still, loud = continuous movement.
   */
  _accumulate(paramId, raw, settings, dt) {
    const st = this._getState(paramId, 'accumulate');
    const rate = settings.rate ?? 0.02;
    const wrap = settings.wrap ?? true;

    // Scale rate by dt to be framerate-independent (normalize to 20fps baseline)
    const scaledRate = rate * (dt / 0.05);
    st.value += raw * scaledRate;

    if (wrap) {
      // Wrap around 0-1
      st.value = st.value % 1;
      if (st.value < 0) st.value += 1;
    } else {
      st.value = Math.max(0, Math.min(1, st.value));
    }

    return st.value;
  }

  /**
   * Leaky integrator: accumulates with decay toward rest value.
   * Builds up during loud passages, slowly falls back in silence.
   */
  _leaky(paramId, raw, settings, dt) {
    const st = this._getState(paramId, 'leaky');
    const rate = settings.rate ?? 0.03;
    const decay = settings.decay ?? 0.998;
    const restValue = settings.restValue ?? 0.5;

    const scaledRate = rate * (dt / 0.05);

    // Accumulate audio energy
    st.value += raw * scaledRate;

    // Decay toward rest value
    // decay^(dt/0.05) for framerate independence
    const effectiveDecay = Math.pow(decay, dt / 0.05);
    st.value = restValue + (st.value - restValue) * effectiveDecay;

    // Clamp to 0-1
    st.value = Math.max(0, Math.min(1, st.value));

    return st.value;
  }

  /**
   * Band ratio: computes spectral tilt (e.g., bass/highs).
   * Inherently slow-moving, great for tonal quality changes.
   */
  _bandRatio(paramId, features, settings, dt) {
    const st = this._getState(paramId, 'bandRatio');
    const num = settings.numerator ?? 'bass';
    const den = settings.denominator ?? 'highs';
    const scale = settings.scale ?? 3.0;

    const numVal = features?.[num] ?? 0;
    const denVal = features?.[den] ?? 0;

    // Compute ratio, normalize to 0-1
    const ratio = numVal / (denVal + 0.01);
    const normalized = Math.min(1, ratio / scale);

    // Smooth the ratio value
    const smoothFactor = Math.pow(0.92, dt / 0.05);
    st.smoothed = st.smoothed * smoothFactor + normalized * (1 - smoothFactor);

    return Math.max(0, Math.min(1, st.smoothed));
  }

  /**
   * Running average: averages audio energy over a long window (3-10s).
   * Follows song structure (verse vs chorus) rather than individual beats.
   */
  _runningAvg(paramId, raw, settings, dt) {
    const st = this._getState(paramId, 'runningAvg');
    const windowSec = settings.windowSeconds ?? 5.0;

    // Push sample at ~20fps (every ~50ms)
    st.buffer.push(raw);

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
      sum += st.buffer[i];
    }
    return sum / st.buffer.length;
  }

  /**
   * Onset drift: detects sudden energy increases (beats/hits) and uses them
   * to trigger slow parameter drifts toward new random targets.
   */
  _onsetDrift(paramId, raw, settings, dt) {
    const st = this._getState(paramId, 'onsetDrift');
    const threshold = settings.threshold ?? 1.5;
    const minLevel = settings.minLevel ?? 0.15;
    const driftSpeed = settings.driftSpeed ?? 0.01;

    // Detect onset: current level significantly higher than previous
    const isOnset = raw > st.prevLevel * threshold && raw > minLevel;
    st.prevLevel = raw;

    if (isOnset) {
      // Pick a new random target, weighted by energy
      // Use a seeded-ish approach: mix current value with random
      st.target = Math.random();
      // Scale drift speed by onset energy
      st.currentDriftSpeed = driftSpeed * (1 + raw * 3);
    }

    // Smoothly approach target
    const scaledSpeed = (st.currentDriftSpeed || driftSpeed) * (dt / 0.05);
    st.value += (st.target - st.value) * scaledSpeed;
    st.value = Math.max(0, Math.min(1, st.value));

    return st.value;
  }

  /**
   * Hysteresis zones: divides audio into quiet/medium/loud zones with
   * different enter/exit thresholds (prevents flickering).
   * Slowly lerps toward zone-specific target values.
   */
  _hysteresis(paramId, raw, settings, dt) {
    const st = this._getState(paramId, 'hysteresis');

    const quietToMed = settings.quietToMed ?? 0.25;
    const medToLoud = settings.medToLoud ?? 0.55;
    const loudToMed = settings.loudToMed ?? 0.40;
    const medToQuiet = settings.medToQuiet ?? 0.12;
    const lerpSpeed = settings.lerpSpeed ?? 0.005;
    const quietValue = settings.quietValue ?? 0.0;
    const medValue = settings.medValue ?? 0.5;
    const loudValue = settings.loudValue ?? 1.0;

    // Smooth the raw input to avoid jitter in zone detection
    const smoothFactor = Math.pow(0.9, dt / 0.05);
    st.avgLevel = st.avgLevel * smoothFactor + raw * (1 - smoothFactor);
    const level = st.avgLevel;

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
    st.value += (target - st.value) * scaledLerp;
    st.value = Math.max(0, Math.min(1, st.value));

    return st.value;
  }
}
