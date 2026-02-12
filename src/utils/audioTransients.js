/**
 * Audio transient detection utility
 * 
 * Detects transients (sudden energy increases) in audio data,
 * useful for suggesting keyframe positions in the timeline.
 */

/**
 * Compute energy flux from mono PCM samples.
 * This is the expensive part - should be done once per audio file.
 * 
 * @param {Float32Array} monoSamples - Mono audio samples
 * @param {number} sampleRate - Sample rate in Hz
 * @param {object} options - Detection options
 * @returns {{ flux: Float32Array, hopSize: number, frameSize: number }}
 */
export function computeEnergyFlux(
  monoSamples,
  sampleRate,
  {
    frameSize = 1024,
    hopSize = 512,
  } = {}
) {
  const numFrames = Math.floor((monoSamples.length - frameSize) / hopSize) + 1;
  if (numFrames <= 1) {
    return { flux: new Float32Array(0), hopSize, frameSize };
  }

  const energies = new Float32Array(numFrames);
  const flux = new Float32Array(numFrames);

  // Compute frame-wise RMS energies
  for (let frame = 0; frame < numFrames; frame++) {
    const start = frame * hopSize;
    let sumSq = 0;
    for (let i = 0; i < frameSize; i++) {
      const s = monoSamples[start + i];
      sumSq += s * s;
    }
    energies[frame] = Math.sqrt(sumSq / frameSize);
  }

  // Compute flux (positive energy difference)
  flux[0] = 0;
  for (let i = 1; i < numFrames; i++) {
    const diff = energies[i] - energies[i - 1];
    flux[i] = Math.max(0, diff);
  }

  return { flux, hopSize, frameSize };
}

/**
 * Detect transients from pre-computed flux data.
 * This is the cheap part - can be re-run when threshold changes.
 * 
 * @param {Float32Array} flux - Pre-computed energy flux
 * @param {number} sampleRate - Sample rate in Hz
 * @param {number} hopSize - Hop size used for flux computation
 * @param {object} options - Detection options
 * @returns {Array<{ time: number, strength: number }>}
 */
export function detectTransientsFromFlux(
  flux,
  sampleRate,
  hopSize,
  {
    localAvgWindow = 20,
    thresholdFactor = 1.5,
    minStrength = 0.001,
    maxMarkers = 1000,
  } = {}
) {
  if (!flux || flux.length < 3) return [];

  const transients = [];

  for (let i = 1; i < flux.length - 1; i++) {
    const val = flux[i];
    if (val < minStrength) continue;

    // Compute local average from preceding frames
    let sum = 0;
    let count = 0;
    const start = Math.max(0, i - localAvgWindow);
    for (let j = start; j < i; j++) {
      sum += flux[j];
      count++;
    }
    const localAvg = count > 0 ? sum / count : 0;

    // Check if this is a local peak and exceeds threshold
    const isPeak = val > flux[i - 1] && val >= flux[i + 1];
    const passesThresh = val > localAvg * thresholdFactor;

    if (isPeak && passesThresh) {
      const time = (i * hopSize) / sampleRate;
      transients.push({ time, strength: val });

      // Cap number of markers for performance
      if (transients.length >= maxMarkers) break;
    }
  }

  return transients;
}

/**
 * Full transient detection from PCM samples.
 * Combines flux computation and peak detection.
 * 
 * @param {Float32Array} monoSamples - Mono audio samples
 * @param {number} sampleRate - Sample rate in Hz
 * @param {object} options - Detection options
 * @returns {{ transients: Array<{ time: number, strength: number }>, flux: Float32Array, hopSize: number, frameSize: number }}
 */
export function detectTransientsFromPcm(
  monoSamples,
  sampleRate,
  {
    frameSize = 1024,
    hopSize = 512,
    localAvgWindow = 20,
    thresholdFactor = 1.5,
    minStrength = 0.001,
    maxMarkers = 1000,
  } = {}
) {
  const { flux, hopSize: hop, frameSize: frame } = computeEnergyFlux(
    monoSamples,
    sampleRate,
    { frameSize, hopSize }
  );

  const transients = detectTransientsFromFlux(flux, sampleRate, hop, {
    localAvgWindow,
    thresholdFactor,
    minStrength,
    maxMarkers,
  });

  return { transients, flux, hopSize: hop, frameSize: frame };
}

/**
 * Convert a user-friendly sensitivity value (0-100) to threshold parameters.
 * Higher sensitivity = lower threshold = more transients detected.
 * 
 * @param {number} sensitivity - 0 to 100
 * @returns {{ thresholdFactor: number, minStrength: number }}
 */
export function sensitivityToThreshold(sensitivity) {
  // Clamp to 0-100
  const s = Math.max(0, Math.min(100, sensitivity));

  // Map sensitivity to thresholdFactor: 
  // sensitivity 0 -> thresholdFactor 10 (very few transients)
  // sensitivity 50 -> thresholdFactor 1.5 (moderate)
  // sensitivity 100 -> thresholdFactor 1.01 (many transients)
  const thresholdFactor = 10 - (s / 100) * 8.99;

  // Map sensitivity to minStrength:
  // sensitivity 0 -> minStrength 0.1 (ignore quiet transients)
  // sensitivity 100 -> minStrength 0.0001 (detect quiet transients)
  const minStrength = 0.1 * Math.pow(0.001, s / 100);

  return { thresholdFactor, minStrength };
}

/**
 * Convert threshold parameters back to a sensitivity value (0-100).
 * 
 * @param {number} thresholdFactor
 * @returns {number} sensitivity 0-100
 */
export function thresholdToSensitivity(thresholdFactor) {
  // Inverse of the thresholdFactor mapping
  const sensitivity = ((10 - thresholdFactor) / 8.99) * 100;
  return Math.max(0, Math.min(100, sensitivity));
}

/**
 * Build an energy map from mono PCM samples.
 * Returns an array of { time, energy, normalized } objects.
 * The normalized value is 0-1, representing relative perceived loudness.
 *
 * Uses dB-scale normalization so that quiet-to-medium transitions are
 * visible (linear RMS normalisation hides them). Percentile clipping
 * prevents outlier spikes/silences from compressing the useful range.
 * 
 * @param {Float32Array} monoSamples - Mono audio samples
 * @param {number} sampleRate - Sample rate in Hz
 * @param {object} options - Options
 * @param {number} options.windowSizeSec - Window size in seconds (default 0.05)
 * @param {number} options.hopSizeSec - Hop size in seconds (default 0.02)
 * @param {number} options.smoothWindow - Smoothing window size in frames (default 3)
 * @param {number} options.dbFloor - Minimum dB value (default -60)
 * @param {number} options.clipLowPct - Low percentile for clipping (default 2)
 * @param {number} options.clipHighPct - High percentile for clipping (default 98)
 * @returns {Array<{ time: number, energy: number, normalized: number }>}
 */
export function buildEnergyMap(
  monoSamples,
  sampleRate,
  {
    windowSizeSec = 0.05,
    hopSizeSec = 0.02,
    smoothWindow = 3,
    dbFloor = -60,
    clipLowPct = 2,
    clipHighPct = 98,
  } = {}
) {
  const windowSize = Math.round(windowSizeSec * sampleRate);
  const hopSize = Math.round(hopSizeSec * sampleRate);

  // Step 1: Compute frame-wise RMS
  const raw = [];
  for (let start = 0; start + windowSize <= monoSamples.length; start += hopSize) {
    let sumSq = 0;
    for (let i = 0; i < windowSize; i++) {
      const s = monoSamples[start + i];
      sumSq += s * s;
    }
    const rms = Math.sqrt(sumSq / windowSize);
    const time = (start + windowSize / 2) / sampleRate;
    raw.push({ time, energy: rms });
  }
  if (raw.length === 0) return [];

  // Step 2: Convert to dB scale (logarithmic, matches human hearing)
  const dbValues = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    const rms = raw[i].energy;
    // 20*log10(rms), clamped to dbFloor for near-silence
    dbValues[i] = rms > 0 ? Math.max(dbFloor, 20 * Math.log10(rms)) : dbFloor;
  }

  // Step 3: Light smoothing in dB space (moving average)
  const smoothed = new Float32Array(raw.length);
  const half = Math.floor(smoothWindow / 2);
  for (let i = 0; i < raw.length; i++) {
    let sum = 0;
    let count = 0;
    const lo = Math.max(0, i - half);
    const hi = Math.min(raw.length - 1, i + half);
    for (let j = lo; j <= hi; j++) {
      sum += dbValues[j];
      count++;
    }
    smoothed[i] = sum / count;
  }

  // Step 4: Percentile clipping to avoid outlier compression
  const sorted = Float32Array.from(smoothed).sort();
  const loIdx = Math.floor((clipLowPct / 100) * sorted.length);
  const hiIdx = Math.min(sorted.length - 1, Math.ceil((clipHighPct / 100) * sorted.length));
  const dbMin = sorted[loIdx];
  const dbMax = sorted[hiIdx];
  const dbRange = dbMax - dbMin || 1;

  // Step 5: Normalize to 0-1, clipping at percentile bounds
  return raw.map((pt, i) => ({
    time: pt.time,
    energy: pt.energy,
    normalized: Math.max(0, Math.min(1, (smoothed[i] - dbMin) / dbRange)),
  }));
}

/**
 * In-place radix-2 Cooley-Tukey FFT.
 * @param {Float32Array} re - Real part (modified in place)
 * @param {Float32Array} im - Imaginary part (modified in place)
 * @param {number} N - FFT size (must be power of 2)
 */
function fftInPlace(re, im, N) {
  // Bit-reversal permutation
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) {
      let tmp = re[i]; re[i] = re[j]; re[j] = tmp;
      tmp = im[i]; im[i] = im[j]; im[j] = tmp;
    }
  }
  // Butterfly stages
  for (let len = 2; len <= N; len <<= 1) {
    const half = len >> 1;
    const angle = -2 * Math.PI / len;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    for (let i = 0; i < N; i += len) {
      let tRe = 1, tIm = 0;
      for (let j = 0; j < half; j++) {
        const uRe = re[i + j];
        const uIm = im[i + j];
        const vRe = re[i + j + half] * tRe - im[i + j + half] * tIm;
        const vIm = re[i + j + half] * tIm + im[i + j + half] * tRe;
        re[i + j] = uRe + vRe;
        im[i + j] = uIm + vIm;
        re[i + j + half] = uRe - vRe;
        im[i + j + half] = uIm - vIm;
        const newTRe = tRe * wRe - tIm * wIm;
        tIm = tRe * wIm + tIm * wRe;
        tRe = newTRe;
      }
    }
  }
}

/**
 * Normalize an array of raw energy frames using dB-scale + percentile clipping.
 * Reusable helper for both buildEnergyMap and buildMultiBandEnergyMap.
 *
 * @param {Array<{ time: number, energy: number }>} raw
 * @param {object} opts
 * @returns {Array<{ time: number, energy: number, normalized: number }>}
 */
function normalizeEnergyFrames(raw, { smoothWindow = 3, dbFloor = -60, clipLowPct = 2, clipHighPct = 98 } = {}) {
  if (raw.length === 0) return [];

  const dbValues = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    const rms = raw[i].energy;
    dbValues[i] = rms > 0 ? Math.max(dbFloor, 20 * Math.log10(rms)) : dbFloor;
  }

  const smoothed = new Float32Array(raw.length);
  const half = Math.floor(smoothWindow / 2);
  for (let i = 0; i < raw.length; i++) {
    let sum = 0, count = 0;
    const lo = Math.max(0, i - half);
    const hi = Math.min(raw.length - 1, i + half);
    for (let j = lo; j <= hi; j++) { sum += dbValues[j]; count++; }
    smoothed[i] = sum / count;
  }

  const sorted = Float32Array.from(smoothed).sort();
  const loIdx = Math.floor((clipLowPct / 100) * sorted.length);
  const hiIdx = Math.min(sorted.length - 1, Math.ceil((clipHighPct / 100) * sorted.length));
  const dbMin = sorted[loIdx];
  const dbMax = sorted[hiIdx];
  const dbRange = dbMax - dbMin || 1;

  return raw.map((pt, i) => ({
    time: pt.time,
    energy: pt.energy,
    normalized: Math.max(0, Math.min(1, (smoothed[i] - dbMin) / dbRange)),
  }));
}

/**
 * Build multi-band energy maps from mono PCM samples using FFT spectral analysis.
 * Returns an object with 4 bands: total, low, mid, high.
 * Each band is an array of { time, energy, normalized }.
 *
 * Frequency bands (at 44100 Hz):
 *   low:  20–250 Hz   (bass, kick drums)
 *   mid:  250–4000 Hz (vocals, instruments)
 *   high: 4000–20000 Hz (hi-hats, cymbals)
 *   total: all frequencies
 *
 * @param {Float32Array} monoSamples
 * @param {number} sampleRate
 * @param {object} options
 * @returns {{ total: Array, low: Array, mid: Array, high: Array }}
 */
export function buildMultiBandEnergyMap(
  monoSamples,
  sampleRate,
  {
    fftSize = 2048,
    hopSizeSec = 0.02,
    smoothWindow = 3,
    dbFloor = -60,
    clipLowPct = 2,
    clipHighPct = 98,
    lowCutoff = 250,
    highCutoff = 4000,
  } = {}
) {
  const hopSize = Math.round(hopSizeSec * sampleRate);
  const freqRes = sampleRate / fftSize;
  const lowBinEnd = Math.round(lowCutoff / freqRes);
  const highBinStart = Math.round(highCutoff / freqRes);
  const nyquist = fftSize / 2;

  // Pre-compute Hann window
  const hann = new Float32Array(fftSize);
  for (let i = 0; i < fftSize; i++) {
    hann[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (fftSize - 1)));
  }

  const rawTotal = [], rawLow = [], rawMid = [], rawHigh = [];
  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);

  for (let start = 0; start + fftSize <= monoSamples.length; start += hopSize) {
    for (let i = 0; i < fftSize; i++) {
      re[i] = monoSamples[start + i] * hann[i];
      im[i] = 0;
    }

    fftInPlace(re, im, fftSize);

    let eTotal = 0, eLow = 0, eMid = 0, eHigh = 0;
    for (let k = 1; k < nyquist; k++) {
      const mag2 = re[k] * re[k] + im[k] * im[k];
      eTotal += mag2;
      if (k <= lowBinEnd) eLow += mag2;
      else if (k >= highBinStart) eHigh += mag2;
      else eMid += mag2;
    }

    const time = (start + fftSize / 2) / sampleRate;
    rawTotal.push({ time, energy: Math.sqrt(eTotal / nyquist) });
    rawLow.push({ time, energy: Math.sqrt(eLow / Math.max(1, lowBinEnd)) });
    rawMid.push({ time, energy: Math.sqrt(eMid / Math.max(1, highBinStart - lowBinEnd)) });
    rawHigh.push({ time, energy: Math.sqrt(eHigh / Math.max(1, nyquist - highBinStart)) });
  }

  const normOpts = { smoothWindow, dbFloor, clipLowPct, clipHighPct };
  return {
    total: normalizeEnergyFrames(rawTotal, normOpts),
    low: normalizeEnergyFrames(rawLow, normOpts),
    mid: normalizeEnergyFrames(rawMid, normOpts),
    high: normalizeEnergyFrames(rawHigh, normOpts),
  };
}

/**
 * Look up the normalized energy at a specific time from an energy map.
 * Uses linear interpolation between adjacent points.
 *
 * When lookAheadSec > 0 the function returns the **peak** energy in the
 * window [time, time + lookAheadSec].  This compensates for the fact that
 * transients mark the onset of a sound while energy peaks 20-80 ms later.
 * 
 * @param {Array<{ time: number, normalized: number }>} energyMap - The energy map
 * @param {number} time - Time in seconds
 * @param {number} [lookAheadSec=0.08] - Look-ahead window in seconds (0 = point sample)
 * @returns {number} Normalized energy (0-1)
 */
export function getEnergyAtTime(energyMap, time, lookAheadSec = 0.08) {
  if (!energyMap || energyMap.length === 0) return 0.5; // Default to mid-energy

  // Handle edge cases
  if (time <= energyMap[0].time && lookAheadSec <= 0) return energyMap[0].normalized;
  if (time >= energyMap[energyMap.length - 1].time) {
    return energyMap[energyMap.length - 1].normalized;
  }

  // Binary search for the interval containing `time`
  const findIndex = (t) => {
    let lo = 0;
    let hi = energyMap.length - 1;
    while (lo < hi - 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (energyMap[mid].time <= t) lo = mid;
      else hi = mid;
    }
    return lo;
  };

  // Point-sample via linear interpolation
  const sampleAt = (t) => {
    if (t <= energyMap[0].time) return energyMap[0].normalized;
    if (t >= energyMap[energyMap.length - 1].time) return energyMap[energyMap.length - 1].normalized;
    const lo = findIndex(t);
    const hi = lo + 1;
    const p1 = energyMap[lo];
    const p2 = energyMap[hi];
    const frac = (t - p1.time) / (p2.time - p1.time);
    return p1.normalized + (p2.normalized - p1.normalized) * frac;
  };

  if (lookAheadSec <= 0) return sampleAt(time);

  // Scan the look-ahead window and return peak energy
  const endTime = Math.min(time + lookAheadSec, energyMap[energyMap.length - 1].time);
  const startIdx = findIndex(time);
  let peak = sampleAt(time);
  for (let i = startIdx; i < energyMap.length && energyMap[i].time <= endTime; i++) {
    if (energyMap[i].normalized > peak) peak = energyMap[i].normalized;
  }
  return peak;
}

/**
 * Apply energy-based scaling to variation weights.
 * 
 * @param {object} weights - Variation weights { shape, anim, color, position, scale }
 * @param {number} energy - Normalized energy (0-1)
 * @param {number} influence - How much energy affects variation (0-1)
 *   0 = energy has no effect (weights unchanged)
 *   1 = energy has maximum effect (low energy = near-zero variation)
 * @returns {object} Scaled weights
 */
export function scaleWeightsByEnergy(weights, energy, influence = 0.5) {
  if (!weights || influence <= 0) return weights;

  // Clamp energy to 0-1, but allow influence up to 2 for more dramatic effects
  const e = Math.max(0, Math.min(1, energy));
  const inf = Math.max(0, Math.min(2, influence)); // Support 0-2 range from UI slider

  // Calculate multiplier:
  // At influence=0: multiplier is always 1 (no effect)
  // At influence=1: multiplier ranges from 0.05 (low energy) to 2.0 (high energy)
  // At influence=2: multiplier ranges from ~0 (low energy) to 4.0 (high energy) - extreme!
  // The curve is: base + energy * range, where base and range depend on influence
  const minMult = 0.05; // Minimum multiplier at low energy, influence=1
  const maxMult = 2.0;  // Maximum multiplier at high energy, influence=1

  // Lerp between "no effect" (multiplier=1) and "full effect" (energy-based)
  // Then scale by influence (values > 1 amplify the effect further)
  const fullEffectMult = minMult + e * (maxMult - minMult);
  const multiplier = 1 + (fullEffectMult - 1) * inf;

  return {
    shape: (weights.shape ?? 0) * multiplier,
    anim: (weights.anim ?? 0) * multiplier,
    color: (weights.color ?? 0) * multiplier,
    position: (weights.position ?? 0) * multiplier,
    scale: (weights.scale ?? 0) * multiplier,
  };
}
