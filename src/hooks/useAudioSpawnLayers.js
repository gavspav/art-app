import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useAudioReactive } from '../context/AudioContext.jsx';
import { useParameters } from '../context/ParameterContext.jsx';
import { buildVariedLayerFrom } from '../utils/layerVariation.js';
import { clamp } from '../utils/mathUtils.js';
import { hslToHex } from '../utils/colorUtils.js';
import { resizeNodes } from '../utils/nodeUtils.js';

const DEFAULTS = Object.freeze({
  triggerMode: 'level', // 'level' | 'transient'
  band: 'rms',
  threshold: 0.6,
  cooldownMs: 250,
  halfLifeMs: 1500,
  halfLifeEnergyFactor: 1.0,
  maxLayers: 12,
  minOpacity: 0.01,
  repeatWhileAbove: true,
  hysteresis: 0.08,
  micReactive: false,
  micReactiveAmount: 100,
  forceContourMode: false,
  directionMode: 'template', // 'template' | 'spread'
  directionSpreadDeg: 0,
});

const nowMs = () => (
  (typeof performance !== 'undefined' && typeof performance.now === 'function')
    ? performance.now()
    : Date.now()
);

const uniqueId = (prefix = 'spawn') => `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;

const pseudoRandom01 = (a = 0, b = 0) => {
  const x = Math.sin((Number(a) || 0) * 12.9898 + (Number(b) || 0) * 78.233) * 43758.5453123;
  return x - Math.floor(x);
};

const readWaveSample = (waveform, index) => {
  if (!waveform || !Number.isFinite(Number(waveform.length)) || waveform.length < 1) return 0;
  const i = Math.max(0, Math.min(waveform.length - 1, Math.floor(index)));
  return clamp(Number(waveform[i]) || 0, -1, 1);
};

const readWaveSampleSmoothed = (waveform, index, smoothness = 0) => {
  const amt = clamp(Number(smoothness) || 0, 0, 1);
  if (amt <= 0.001) return readWaveSample(waveform, index);
  const radius = Math.max(1, Math.round(1 + (amt * 5)));
  let sum = 0;
  let weightSum = 0;
  for (let o = -radius; o <= radius; o += 1) {
    const w = (radius + 1) - Math.abs(o);
    sum += readWaveSample(waveform, index + o) * w;
    weightSum += w;
  }
  if (weightSum <= 0) return 0;
  return clamp(sum / weightSum, -1, 1);
};

const detectZeroToOneNodes = (nodes = []) => {
  if (!Array.isArray(nodes) || nodes.length < 3) return false;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < nodes.length; i += 1) {
    const n = nodes[i];
    const x = Number(n?.x);
    const y = Number(n?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return minX >= 0 && minY >= 0 && maxX <= 1 && maxY <= 1;
};

const buildFallbackNodes = (count, zeroToOne = false) => {
  const n = Math.max(3, Math.round(Number(count) || 3));
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const angle = (i / n) * Math.PI * 2;
    if (zeroToOne) {
      out.push({ x: 0.5 + Math.cos(angle) * 0.45, y: 0.5 + Math.sin(angle) * 0.45 });
    } else {
      out.push({ x: Math.cos(angle), y: Math.sin(angle) });
    }
  }
  return out;
};

const chooseWaveformMode = (beat = 0, forceContourMode = false) => {
  if (forceContourMode) return 'contour';
  if (beat > 0.45) return 'starburst';
  if (beat > 0.2) return 'ribbon';
  return 'contour';
};

const applyWaveformShape = (layer, waveform, energy = 0, mode = 'contour', waveformEnergy = 0, reactiveAmount = 1) => {
  if (!layer || !waveform || waveform.length < 8) return null;

  const modeId = (mode === 'starburst' || mode === 'ribbon') ? mode : 'contour';
  const waveEnergy = clamp(Number(waveformEnergy) || 0, 0, 1);
  const reactive = clamp(Number(reactiveAmount) || 0, 0, 1);
  const modulation = clamp((Number(energy) || 0) * 0.6 + waveEnergy * 0.4, 0, 1);
  if (reactive <= 0.001) return null;
  const contourMode = modeId === 'contour';

  const currentCount = clamp(Math.round(Number(layer.numSides) || 10), 6, 40);
  const baseCount = modeId === 'ribbon' ? 9 : (modeId === 'starburst' ? 14 : 10);
  const targetCount = clamp(Math.round(baseCount + (energy * 14) + (modulation * 6)), 8, 40);
  const count = clamp(Math.round(currentCount + ((targetCount - currentCount) * reactive)), 6, 40);
  const deformAmount = (0.2 + (energy * 0.35) + (modulation * 0.18)) * reactive * (contourMode ? 0.72 : 1);
  const spikeGain = contourMode ? 1 : (1 + (modulation * 1.1 * reactive));
  const sampleSmoothness = contourMode
    ? clamp(0.75 + ((1 - reactive) * 0.2), 0, 1)
    : clamp(0.18 + ((1 - reactive) * 0.15), 0, 1);
  const zeroToOneNodes = detectZeroToOneNodes(layer.nodes);
  const fallbackNodes = buildFallbackNodes(count, zeroToOneNodes);
  const baseNodes = Array.isArray(layer.nodes) && layer.nodes.length >= 3
    ? resizeNodes(layer.nodes, count)
    : fallbackNodes;

  const nodes = [];

  let peak = 0;
  let zeroCross = 0;
  let positive = 0;
  let negative = 0;
  let prev = readWaveSample(waveform, 0);

  for (let i = 0; i < count; i += 1) {
    const sampleIdx = (i / count) * (waveform.length - 1);
    const sample = readWaveSampleSmoothed(waveform, sampleIdx, sampleSmoothness);
    const abs = Math.abs(sample);
    if (abs > peak) peak = abs;
    if (sample >= 0) positive += sample; else negative += abs;
    if (i > 0 && ((sample >= 0) !== (prev >= 0))) zeroCross += 1;
    prev = sample;

    const angle = (i / count) * Math.PI * 2;
    const phaseGate = (modeId === 'starburst' && (i % 2 === 0)) ? spikeGain : 1;
    const signedSample = (modeId === 'ribbon') ? (sample * 0.65 + abs * 0.35) : sample;
    const radiusBase = zeroToOneNodes ? 0.45 : 0.9;
    const radius = radiusBase * (1 + (signedSample * deformAmount * phaseGate));
    const flatten = modeId === 'ribbon'
      ? (0.22 + waveEnergy * 0.55 + modulation * 0.2) * reactive
      : 0;
    const rx = radius * (1 + flatten);
    const ry = radius * (1 - flatten * 0.8);
    const baseNode = baseNodes[i] || fallbackNodes[i] || { x: zeroToOneNodes ? 0.5 : 0, y: zeroToOneNodes ? 0.5 : 0 };
    const targetX = zeroToOneNodes
      ? clamp(0.5 + (Math.cos(angle) * rx), 0, 1)
      : clamp(Math.cos(angle) * rx, -1, 1);
    const targetY = zeroToOneNodes
      ? clamp(0.5 + (Math.sin(angle) * ry), 0, 1)
      : clamp(Math.sin(angle) * ry, -1, 1);
    nodes.push({
      x: clamp((Number(baseNode.x) || 0) * (1 - reactive) + targetX * reactive, zeroToOneNodes ? 0 : -1, 1),
      y: clamp((Number(baseNode.y) || 0) * (1 - reactive) + targetY * reactive, zeroToOneNodes ? 0 : -1, 1),
    });
  }

  const asymmetry = clamp(
    (positive - negative) / Math.max(1e-6, positive + negative),
    -1,
    1,
  );
  const effectiveAsymmetry = asymmetry * reactive;
  const baseRadius = Number.isFinite(layer.radiusFactor) ? layer.radiusFactor : 0.125;
  const targetRadius = clamp(baseRadius * (0.78 + (peak * 1.15)), 0.04, 1.8);
  const radius = clamp(baseRadius + ((targetRadius - baseRadius) * reactive), 0.04, 1.8);

  layer.nodes = nodes;
  layer.syncNodesToNumSides = false;
  layer.numSides = count;
  const zeroCrossNorm = zeroCross / Math.max(1, count - 1);
  const baseCurviness = Number.isFinite(layer.curviness) ? layer.curviness : 0.75;
  let targetCurviness = 0.2 + (zeroCrossNorm * 0.9);
  if (modeId === 'starburst') targetCurviness = 0.08 + (zeroCrossNorm * 0.45);
  if (modeId === 'ribbon') targetCurviness = 0.55 + (zeroCrossNorm * 0.35);
  layer.curviness = clamp(baseCurviness + ((targetCurviness - baseCurviness) * reactive), 0, 1);
  layer.radiusFactor = radius;
  layer.radiusFactorX = clamp(radius * (1 + (effectiveAsymmetry * 0.22)), 0.04, 2);
  layer.radiusFactorY = clamp(radius * (1 - (effectiveAsymmetry * 0.22)), 0.04, 2);

  return {
    peak,
    asymmetry: effectiveAsymmetry,
    zeroCrossNorm,
  };
};

const applyMicReactiveSurface = ({
  layer,
  amount = 0,
  energy = 0,
  waveformEnergy = 0,
  transientSignal = 0,
  forceContourMode = false,
}) => {
  if (!layer) return;
  const amt = clamp(Number(amount) || 0, 0, 1);
  if (amt <= 0.001) return;

  const wEnergy = clamp(Number(waveformEnergy) || 0, 0, 1);
  const trans = clamp(Number(transientSignal) || 0, 0, 1);
  const lvl = clamp(Number(energy) || 0, 0, 1);

  const baseWobble = clamp(Number(layer.wobble) || 0, 0, 1);
  const baseNoise = clamp(Number(layer.noiseAmount) || 0, 0, 8);
  const baseCurviness = clamp(Number(layer.curviness) || 0.7, 0, 1);
  const baseJitter = clamp(Number(layer.freqJitter) || 0, 0, 1);

  if (forceContourMode) {
    const wobbleTarget = clamp(baseWobble + (amt * (0.06 + wEnergy * 0.22 + lvl * 0.12)), 0, 1);
    layer.wobble = wobbleTarget;
    layer.noiseAmount = clamp(baseNoise * (1 - amt * 0.92), 0, 8);
    layer.curviness = clamp(Math.max(baseCurviness, 0.78 + (amt * 0.18)), 0, 1);
    layer.freqJitter = clamp(baseJitter * (1 - amt * 0.75), 0, 1);
    return;
  }

  const wobbleTarget = clamp(baseWobble + (amt * (0.05 + wEnergy * 0.28 + lvl * 0.12)), 0, 1);
  const noiseTarget = clamp(baseNoise + (amt * (0.02 + wEnergy * 0.12 + trans * 0.06)), 0, 8);
  const blend = clamp(0.25 + (amt * 0.45), 0, 0.9);
  layer.wobble = clamp((baseWobble * (1 - blend)) + (wobbleTarget * blend), 0, 1);
  layer.noiseAmount = clamp((baseNoise * (1 - blend)) + (noiseTarget * blend), 0, 8);
};

const applyPitchColor = (layer, pitchHz, pitchConfidence, energy = 0) => {
  if (!layer) return;
  const hz = Number(pitchHz);
  const confidence = clamp(Number(pitchConfidence) || 0, 0, 1);
  if (!Number.isFinite(hz) || hz <= 0 || confidence < 0.12) return;

  const midi = 69 + (12 * Math.log2(hz / 440));
  const pitchClass = ((Math.round(midi) % 12) + 12) % 12;
  const hue = (pitchClass / 12) * 360;
  const saturation = clamp(52 + (confidence * 36) + (energy * 18), 35, 96);
  const lightness = clamp(40 + (energy * 24), 24, 72);
  const palette = [
    hslToHex(hue, saturation, lightness),
    hslToHex((hue + 32) % 360, clamp(saturation * 0.95, 30, 96), clamp(lightness * 0.92, 20, 80)),
    hslToHex((hue + 75) % 360, clamp(saturation * 0.88, 30, 96), clamp(lightness * 0.85, 20, 78)),
    hslToHex((hue + 160) % 360, clamp(saturation * 0.82, 25, 95), clamp(lightness * 0.78, 18, 75)),
  ];
  const desiredCount = clamp(Math.round(layer.numColors || layer.colors?.length || 4), 1, 8);
  const nextColors = [];
  for (let i = 0; i < desiredCount; i += 1) {
    nextColors.push(palette[i % palette.length]);
  }
  layer.colors = nextColors;
  layer.numColors = nextColors.length;
  layer.selectedColor = clamp(Number(layer.selectedColor) || 0, 0, nextColors.length - 1);
};

/**
 * Spawns ephemeral (non-export) overlay layers from live audio threshold crossings.
 * Returned layers are intended to be drawn separately from the main `layers` state.
 */
export function useAudioSpawnLayers({
  enabled = false,
  paused = false,
  zIgnore = false,
  getIsRnd = null,
  layers = [],
  selectedLayerIndex = 0,
  energyInfluence = 0,
  useGlobalPalette = false,
  paletteColors = [],
  triggerMode = DEFAULTS.triggerMode,
  band = DEFAULTS.band,
  threshold = DEFAULTS.threshold,
  cooldownMs = DEFAULTS.cooldownMs,
  halfLifeMs = DEFAULTS.halfLifeMs,
  halfLifeEnergyFactor = DEFAULTS.halfLifeEnergyFactor,
  maxLayers = DEFAULTS.maxLayers,
  minOpacity = DEFAULTS.minOpacity,
  repeatWhileAbove = DEFAULTS.repeatWhileAbove,
  hysteresis = DEFAULTS.hysteresis,
  micReactive = DEFAULTS.micReactive,
  micReactiveAmount = DEFAULTS.micReactiveAmount,
  forceContourMode = DEFAULTS.forceContourMode,
  directionMode = DEFAULTS.directionMode,
  directionSpreadDeg = DEFAULTS.directionSpreadDeg,
} = {}) {
  const audio = useAudioReactive();
  const { parameters } = useParameters() || {};
  const overlayLayersRef = useRef([]);
  const randomizableParamMap = useMemo(() => {
    const map = new Map();
    (Array.isArray(parameters) ? parameters : []).forEach((param) => {
      if (param?.id) map.set(param.id, !!param.isRandomizable);
    });
    return map;
  }, [parameters]);
  const parameterConfigMap = useMemo(() => {
    const map = new Map();
    (Array.isArray(parameters) ? parameters : []).forEach((param) => {
      if (param?.id) map.set(param.id, param);
    });
    return map;
  }, [parameters]);
  const isParamRandomizable = useCallback((id) => {
    if (randomizableParamMap.has(id)) return randomizableParamMap.get(id);
    return undefined;
  }, [randomizableParamMap]);
  const getParamConfig = useCallback((id) => {
    if (parameterConfigMap.has(id)) return parameterConfigMap.get(id);
    return null;
  }, [parameterConfigMap]);

  const configRef = useRef({});
  configRef.current = {
    enabled: !!enabled,
    paused: !!paused,
    zIgnore: !!zIgnore,
    getIsRnd: typeof getIsRnd === 'function' ? getIsRnd : null,
    layers: Array.isArray(layers) ? layers : [],
    selectedLayerIndex: Number.isFinite(selectedLayerIndex) ? selectedLayerIndex : 0,
    energyInfluence: Number.isFinite(energyInfluence) ? energyInfluence : 0,
    useGlobalPalette: !!useGlobalPalette,
    paletteColors: Array.isArray(paletteColors) ? paletteColors : [],
    triggerMode: (triggerMode === 'transient' || triggerMode === 'level') ? triggerMode : DEFAULTS.triggerMode,
    band: typeof band === 'string' ? band : DEFAULTS.band,
    threshold: clamp(Number(threshold) || 0, 0, 1),
    cooldownMs: Math.max(0, Number(cooldownMs) || 0),
    halfLifeMs: Math.max(50, Number(halfLifeMs) || DEFAULTS.halfLifeMs),
    halfLifeEnergyFactor: clamp(Number(halfLifeEnergyFactor) || 0, 0, 4),
    maxLayers: clamp(Number(maxLayers) || DEFAULTS.maxLayers, 0, 200),
    minOpacity: clamp(Number(minOpacity) || DEFAULTS.minOpacity, 0.0001, 1),
    repeatWhileAbove: !!repeatWhileAbove,
    hysteresis: clamp(Number(hysteresis) || 0, 0, 0.5),
    micReactive: !!micReactive,
    micReactiveAmount: clamp(Number(micReactiveAmount) || 0, 0, 100),
    forceContourMode: !!forceContourMode,
    directionMode: directionMode === 'spread' ? 'spread' : 'template',
    directionSpreadDeg: clamp(Number(directionSpreadDeg) || 0, 0, 180),
    isParamRandomizable,
    getParamConfig,
  };

  const rafRef = useRef(null);
  const lastSpawnMsRef = useRef(-Infinity);
  const counterRef = useRef(0);
  const armedRef = useRef(true);
  const manualSpawnQueueRef = useRef(0);
  const manualDespawnQueueRef = useRef(0);
  // Transient detection state
  const energyHistoryRef = useRef([]);
  const prevEnergyRef = useRef(0);
  const prevEnabledRef = useRef(false);

  const triggerAudioSpawn = useCallback((action = 'spawn') => {
    if (action === 'despawn') {
      manualDespawnQueueRef.current += 1;
      return;
    }
    manualSpawnQueueRef.current += 1;
  }, []);

  useEffect(() => {
    const stop = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      energyHistoryRef.current = [];
      prevEnergyRef.current = 0;
      armedRef.current = true;
      manualSpawnQueueRef.current = 0;
      manualDespawnQueueRef.current = 0;
    };

    const clear = () => {
      overlayLayersRef.current = [];
    };

    const tick = () => {
      const cfg = configRef.current;
      const isAudioReady = !!audio?.settings?.enabled && !!audio?.isActive && typeof audio?.getFeatures === 'function';
      if (!cfg.enabled || cfg.paused || !isAudioReady) {
        // Keep ticking while enabled so we can react instantly once audio becomes ready,
        // but don't keep old ephemeral layers around if the feature is off/paused.
        if (!cfg.enabled || cfg.paused) {
          clear();
          manualSpawnQueueRef.current = 0;
          manualDespawnQueueRef.current = 0;
        }
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const t = nowMs();
      const features = audio.getFeatures() || {};
      const energy = clamp(Number(features[cfg.band]) || 0, 0, 1);
      const beatSignal = clamp(Number(features?.beat) || 0, 0, 1);
      const transientSignal = clamp(Number(features?.transient) || 0, 0, 1);
      const waveformEnergy = clamp(Number(features?.waveformEnergy) || 0, 0, 1);

      // Detect enabling edge to avoid carrying trigger state across disables.
      if (!prevEnabledRef.current && cfg.enabled) {
        armedRef.current = true;
        energyHistoryRef.current = [];
        prevEnergyRef.current = energy;
      }
      prevEnabledRef.current = cfg.enabled;

      // Update existing ephemeral layers (half-life fade-out + animation)
      const list = overlayLayersRef.current;
      let writeIndex = 0;
      const dtSec = 1 / 60; // Approximate frame time for animation
      for (let i = 0; i < list.length; i++) {
        const layer = list[i];
        const spawn = layer?.__audioSpawn;
        if (!spawn) continue;
        const ageMs = Math.max(0, t - (spawn.createdAtMs || 0));
        const hl = Math.max(50, spawn.halfLifeMs || cfg.halfLifeMs);
        const decay = Math.pow(0.5, ageMs / hl);
        const nextOpacity = clamp((spawn.baseOpacity || 1) * decay, 0, 1);
        if (nextOpacity <= cfg.minOpacity) continue;
        layer.opacity = nextOpacity;
        layer.visible = true;

        const pos = layer.position || {};
        if (spawn.micReactive) {
          const progress = clamp(1 - decay, 0, 1);
          const startX = Number.isFinite(spawn.startX) ? spawn.startX : (pos.x ?? 0.5);
          const startY = Number.isFinite(spawn.startY) ? spawn.startY : (pos.y ?? 0.5);
          const depthVx = Number.isFinite(spawn.depthVx) ? spawn.depthVx : 0;
          const depthVy = Number.isFinite(spawn.depthVy) ? spawn.depthVy : -1;
          const dirVx = depthVx;
          const dirVy = depthVy;
          const depthTravel = Number.isFinite(spawn.depthTravel) ? spawn.depthTravel : 0.25;
          const centerPull = Number.isFinite(spawn.depthCenterPull) ? spawn.depthCenterPull : 0.55;
          const travel = depthTravel * progress;
          const nx = clamp(
            startX + (dirVx * travel) + ((0.5 - startX) * centerPull * progress),
            -0.3,
            1.3,
          );
          const ny = clamp(
            startY + (dirVy * travel) + ((0.5 - startY) * centerPull * progress),
            -0.3,
            1.3,
          );
          const baseScale = Number.isFinite(spawn.baseScale) ? spawn.baseScale : (pos.scale ?? 1);
          const scaleDecay = clamp(Number(spawn.scaleDecay) || 0.82, 0.1, 0.98);
          const nextScale = Math.max(0.04, baseScale * (1 - (progress * scaleDecay)));
          layer.position = {
            ...pos,
            x: nx,
            y: ny,
            vx: 0,
            vy: 0,
            scale: nextScale,
            scaleDirection: -1,
          };
          if (Number.isFinite(spawn.symmetryBase)) {
            const currentSym = Number.isFinite(layer.symmetry) ? layer.symmetry : spawn.symmetryBase;
            const targetSym = clamp(
              spawn.symmetryBase + (Number(spawn.waveAsymmetry) || 0) * 0.06,
              0,
              1,
            );
            layer.symmetry = clamp(currentSym * 0.78 + targetSym * 0.22, 0, 1);
          }
        } else {
          // Animate position based on movementStyle
          const style = layer.movementStyle || 'bounce';
          const speed = (layer.movementSpeed || 1) * 0.002 * dtSec * 60;
          const angle = (layer.movementAngle || 45) * (Math.PI / 180);

          if (style === 'drift' || style === 'bounce') {
            let vx = pos.vx ?? (Math.cos(angle) * speed);
            let vy = pos.vy ?? (Math.sin(angle) * speed);
            let nx = (pos.x ?? 0.5) + vx;
            let ny = (pos.y ?? 0.5) + vy;

            if (style === 'bounce') {
              if (nx <= 0 || nx >= 1) { vx = -vx; nx = clamp(nx, 0, 1); }
              if (ny <= 0 || ny >= 1) { vy = -vy; ny = clamp(ny, 0, 1); }
            } else {
              // Drift wraps around
              if (nx < 0) nx += 1; else if (nx > 1) nx -= 1;
              if (ny < 0) ny += 1; else if (ny > 1) ny -= 1;
            }
            layer.position = { ...pos, x: nx, y: ny, vx, vy };
          } else if (style === 'orbit') {
            const orbitSpeed = speed * 2;
            const orbitAngle = (pos.orbitAngle || 0) + orbitSpeed;
            const cx = pos.orbitCenterX ?? 0.5;
            const cy = pos.orbitCenterY ?? 0.5;
            const rx = pos.orbitRadiusX ?? 0.15;
            const ry = pos.orbitRadiusY ?? 0.15;
            layer.position = {
              ...pos,
              x: cx + Math.cos(orbitAngle) * rx,
              y: cy + Math.sin(orbitAngle) * ry,
              orbitAngle,
            };
          } else if (style === 'spin') {
            const spinSpeed = speed * 100;
            layer.rotation = ((layer.rotation || 0) + spinSpeed) % 360;
          }
          // 'still' = no position update

          // Scale pulsing (respect Global "Z-Ignore")
          if (!cfg.zIgnore && layer.scaleSpeed > 0) {
            const scaleDir = pos.scaleDirection || 1;
            const scaleSpd = (layer.scaleSpeed || 0.05) * dtSec * 60;
            let nextScale = (pos.scale || 1) + scaleDir * scaleSpd;
            let nextDir = scaleDir;
            const rawMin = Number.isFinite(layer.scaleMin) ? layer.scaleMin : 0.2;
            const rawMax = Number.isFinite(layer.scaleMax) ? layer.scaleMax : 1.5;
            const sMin = Math.max(0.05, rawMin);
            const sMax = Math.max(sMin, rawMax);
            if (nextScale >= sMax) { nextScale = sMax; nextDir = -1; }
            else if (nextScale <= sMin) { nextScale = sMin; nextDir = 1; }
            layer.position = { ...(layer.position || pos), scale: nextScale, scaleDirection: nextDir };
          }
        }

        list[writeIndex++] = layer;
      }
      list.length = writeIndex;

      const manualDespawnCount = Math.max(0, Math.floor(manualDespawnQueueRef.current || 0));
      if (manualDespawnCount > 0) {
        manualDespawnQueueRef.current = 0;
        if (manualDespawnCount >= list.length) {
          list.length = 0;
        } else {
          list.length = Math.max(0, list.length - manualDespawnCount);
        }
      }

      const canSpawn = (t - lastSpawnMsRef.current) >= cfg.cooldownMs;
      let shouldSpawn = false;

      if (cfg.triggerMode === 'level') {
        const thresholdOn = cfg.threshold;
        const thresholdOff = clamp(thresholdOn - cfg.hysteresis, 0, 1);
        if (energy <= thresholdOff) {
          armedRef.current = true;
        }
        if (energy >= thresholdOn && canSpawn && (armedRef.current || cfg.repeatWhileAbove)) {
          shouldSpawn = true;
          armedRef.current = false;
        }
      } else {
        // Transient detection: trigger on sudden energy increases.
        // In this mode, threshold acts as "sensitivity" (lower = more sensitive).
        const history = energyHistoryRef.current;
        const prevEnergy = prevEnergyRef.current;

        history.push(energy);
        if (history.length > 10) history.shift();

        const avgEnergy = history.length > 1
          ? history.slice(0, -1).reduce((a, b) => a + b, 0) / (history.length - 1)
          : 0;

        const flux = Math.max(0, energy - avgEnergy);
        const fluxThreshold = 0.02 + cfg.threshold * 0.3; // Range: 0.02 to 0.32
        const isTransient = flux > fluxThreshold && energy > prevEnergy;
        prevEnergyRef.current = energy;

        if (isTransient && canSpawn) {
          shouldSpawn = true;
        }
      }

      const manualSpawnCount = Math.max(0, Math.floor(manualSpawnQueueRef.current || 0));
      if (manualSpawnCount > 0) {
        manualSpawnQueueRef.current = 0;
      }
      const totalSpawns = (shouldSpawn ? 1 : 0) + manualSpawnCount;

      if (totalSpawns > 0) {
        const sourceLayers = cfg.layers;
        const srcIndex = clamp(cfg.selectedLayerIndex, 0, Math.max(0, sourceLayers.length - 1));
        const base = sourceLayers[srcIndex];
        if (base) {
          const includeVarPosition = cfg.getIsRnd ? !!cfg.getIsRnd('variationPosition') : true;
          const includeVarShape = cfg.getIsRnd ? !!cfg.getIsRnd('variationShape') : true;
          const includeVarAnim = cfg.getIsRnd ? !!cfg.getIsRnd('variationAnim') : true;
          const includeVarColor = cfg.getIsRnd ? !!cfg.getIsRnd('variationColor') : true;
          const includeVarScale = cfg.getIsRnd ? !!cfg.getIsRnd('variationScale') : true;

          const affectCategories = cfg.getIsRnd
            ? [
              includeVarShape ? 'shape' : null,
              includeVarAnim ? 'anim' : null,
              includeVarColor ? 'color' : null,
              includeVarPosition ? 'position' : null,
              includeVarScale ? 'scale' : null,
            ].filter(Boolean)
            : null;
          const micReactiveEnabled = !!cfg.micReactive && !audio?.isFileMode;
          const micReactiveAmountNorm = clamp((Number(cfg.micReactiveAmount) || 0) / 100, 0, 1);
          const shapeReactiveAmount = cfg.forceContourMode
            ? Math.pow(micReactiveAmountNorm, 1.6)
            : clamp((micReactiveAmountNorm - 0.28) / 0.72, 0, 1);
          const waveform = features?.waveform;
          const pitchHz = Number(features?.pitchHz) || 0;
          const pitchConfidence = clamp(Number(features?.pitchConfidence) || 0, 0, 1);

          for (let spawnCount = 0; spawnCount < totalSpawns; spawnCount += 1) {
            counterRef.current += 1;
            const spawnIndex = counterRef.current;
            // Energy scales variance: at energyInfluence=2 and energy=1, varianceScale = 3
            // buildVariedLayerFrom expects values 0-3 for full effect (divides by 3 internally)
            const varianceScale = 1 + (energy * cfg.energyInfluence);
            const baseVar = {
              shape: includeVarShape ? clamp((Number(base?.variationShape ?? base?.variation) || 0) * varianceScale, 0, 3) : 0,
              anim: includeVarAnim ? clamp((Number(base?.variationAnim ?? base?.variation) || 0) * varianceScale, 0, 3) : 0,
              color: includeVarColor ? clamp((Number(base?.variationColor ?? base?.variation) || 0) * varianceScale, 0, 3) : 0,
              position: includeVarPosition ? clamp((Number(base?.variationPosition ?? base?.variation) || 0) * varianceScale, 0, 3) : 0,
              scale: includeVarScale ? clamp((Number(base?.variationScale) || 0) * varianceScale, -3, 3) : 0,
            };

            const hl = cfg.halfLifeMs * (1 + cfg.halfLifeEnergyFactor * energy);
            const baseOpacity = Number.isFinite(base?.opacity) ? clamp(base.opacity, 0, 1) : 0.8;
            const varied = buildVariedLayerFrom(base, spawnIndex, baseVar, {
              randomSeed: (Number.isFinite(base?.seed) ? base.seed : 1) + Math.floor(t) + (spawnIndex * 1013),
              affectCategories,
              isParamRandomizable: cfg.isParamRandomizable,
              getParamConfig: cfg.getParamConfig,
              constrainColorsToPalette: !!cfg.useGlobalPalette,
              paletteColors: cfg.paletteColors,
            });

            let waveStats = null;
            if (micReactiveEnabled) {
              applyMicReactiveSurface({
                layer: varied,
                amount: micReactiveAmountNorm,
                energy,
                waveformEnergy,
                transientSignal,
                forceContourMode: cfg.forceContourMode,
              });
              if (shapeReactiveAmount > 0.001) {
                const waveformMode = chooseWaveformMode(beatSignal, cfg.forceContourMode);
                waveStats = applyWaveformShape(
                  varied,
                  waveform,
                  energy,
                  waveformMode,
                  waveformEnergy,
                  shapeReactiveAmount,
                );
              }
              if (!cfg.useGlobalPalette) {
                applyPitchColor(varied, pitchHz, pitchConfidence, energy);
              }
            }

            const variedPos = varied.position || {};
            const startX = Number.isFinite(variedPos.x) ? variedPos.x : 0.5;
            const startY = Number.isFinite(variedPos.y) ? variedPos.y : 0.5;
            const baseScale = Number.isFinite(variedPos.scale) ? variedPos.scale : 1;
            const movementAngleRad = ((Number(varied?.movementAngle) || 45) * Math.PI) / 180;
            const directionSpreadRad = ((Number(cfg.directionSpreadDeg) || 0) * Math.PI) / 180;
            let spawnAngleRad = movementAngleRad;
            if (cfg.directionMode === 'spread' && directionSpreadRad > 1e-6) {
              const jitter01 = pseudoRandom01(spawnIndex + 17, t * 0.001 + 37);
              const jitter = ((jitter01 * 2) - 1) * directionSpreadRad;
              spawnAngleRad += jitter;
            }
            let dirX = Math.cos(spawnAngleRad);
            let dirY = Math.sin(spawnAngleRad);
            const dirLen = Math.hypot(dirX, dirY) || 1;
            dirX /= dirLen;
            dirY /= dirLen;
            const waveAsymmetry = clamp(Number(waveStats?.asymmetry) || 0, -1, 1);
            const symmetryBase = clamp(
              (Number(varied?.symmetry) || 0.5) + (waveAsymmetry * 0.06),
              0,
              1,
            );
            varied.symmetry = symmetryBase;

            varied.id = uniqueId('audio-spawn');
            varied.name = `Audio ${spawnIndex}`;
            varied.visible = true;
            varied.opacity = baseOpacity;
            varied.position = { ...variedPos, x: startX, y: startY, scale: baseScale };
            varied.__audioSpawn = {
              createdAtMs: t,
              halfLifeMs: Math.max(50, hl),
              baseOpacity,
              band: cfg.band,
              threshold: cfg.threshold,
              energyAtSpawn: energy,
              micReactive: micReactiveEnabled,
              pitchHz,
              pitchConfidence,
              startX,
              startY,
              baseScale,
              depthVx: dirX,
              depthVy: dirY,
              depthTravel: 0.2 + (energy * 0.2) + (beatSignal * 0.08),
              depthCenterPull: 0.55,
              scaleDecay: clamp(0.86 + (waveformEnergy * 0.06), 0.58, 0.95),
              symmetryBase,
              waveAsymmetry,
            };

            list.push(varied);
            lastSpawnMsRef.current = t;

            if (cfg.maxLayers === 0) {
              list.length = 0;
            } else if (cfg.maxLayers > 0 && list.length > cfg.maxLayers) {
              list.splice(0, list.length - cfg.maxLayers);
            }
          }
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    stop();

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      stop();
    };
  }, [audio]);

  return { overlayLayersRef, triggerAudioSpawn };
}
