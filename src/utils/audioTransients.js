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
