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
 * The normalized value is 0-1, representing relative energy level.
 * 
 * @param {Float32Array} monoSamples - Mono audio samples
 * @param {number} sampleRate - Sample rate in Hz
 * @param {object} options - Options
 * @param {number} options.windowSizeSec - Window size in seconds (default 0.25)
 * @param {number} options.hopSizeSec - Hop size in seconds (default 0.1)
 * @param {number} options.smoothWindow - Smoothing window size (default 5)
 * @returns {Array<{ time: number, energy: number, normalized: number }>}
 */
export function buildEnergyMap(
  monoSamples,
  sampleRate,
  {
    windowSizeSec = 0.25,
    hopSizeSec = 0.1,
    smoothWindow = 5,
  } = {}
) {
  const windowSize = Math.round(windowSizeSec * sampleRate);
  const hopSize = Math.round(hopSizeSec * sampleRate);

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

  // Smooth the energy values
  const smoothed = raw.map((_, idx) => {
    let sum = 0;
    let count = 0;
    const half = Math.floor(smoothWindow / 2);
    const startIdx = Math.max(0, idx - half);
    const endIdx = Math.min(raw.length - 1, idx + half);
    for (let j = startIdx; j <= endIdx; j++) {
      sum += raw[j].energy;
      count++;
    }
    return sum / count;
  });

  // Find min/max for normalization
  let min = Infinity, max = -Infinity;
  for (const e of smoothed) {
    if (e < min) min = e;
    if (e > max) max = e;
  }
  const range = max - min || 1;

  return raw.map((pt, i) => ({
    time: pt.time,
    energy: pt.energy,
    normalized: (smoothed[i] - min) / range,
  }));
}

/**
 * Look up the normalized energy at a specific time from an energy map.
 * Uses linear interpolation between adjacent points.
 * 
 * @param {Array<{ time: number, normalized: number }>} energyMap - The energy map
 * @param {number} time - Time in seconds
 * @returns {number} Normalized energy (0-1)
 */
export function getEnergyAtTime(energyMap, time) {
  if (!energyMap || energyMap.length === 0) return 0.5; // Default to mid-energy

  // Handle edge cases
  if (time <= energyMap[0].time) return energyMap[0].normalized;
  if (time >= energyMap[energyMap.length - 1].time) {
    return energyMap[energyMap.length - 1].normalized;
  }

  // Binary search for the right interval
  let lo = 0;
  let hi = energyMap.length - 1;
  while (lo < hi - 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (energyMap[mid].time <= time) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  // Linear interpolation
  const p1 = energyMap[lo];
  const p2 = energyMap[hi];
  const t = (time - p1.time) / (p2.time - p1.time);
  return p1.normalized + (p2.normalized - p1.normalized) * t;
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
