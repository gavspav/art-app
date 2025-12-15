import { useEffect, useRef } from 'react';
import { useAudioReactive } from '../context/AudioContext.jsx';
import { buildVariedLayerFrom } from '../utils/layerVariation.js';
import { clamp } from '../utils/mathUtils.js';

const DEFAULTS = Object.freeze({
  band: 'rms',
  threshold: 0.6,
  cooldownMs: 250,
  halfLifeMs: 1500,
  halfLifeEnergyFactor: 1.0,
  maxLayers: 12,
  minOpacity: 0.01,
});

const nowMs = () => (
  (typeof performance !== 'undefined' && typeof performance.now === 'function')
    ? performance.now()
    : Date.now()
);

const uniqueId = (prefix = 'spawn') => `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;

/**
 * Spawns ephemeral (non-export) overlay layers from live audio threshold crossings.
 * Returned layers are intended to be drawn separately from the main `layers` state.
 */
export function useAudioSpawnLayers({
  enabled = false,
  paused = false,
  layers = [],
  selectedLayerIndex = 0,
  energyInfluence = 0,
  band = DEFAULTS.band,
  threshold = DEFAULTS.threshold,
  cooldownMs = DEFAULTS.cooldownMs,
  halfLifeMs = DEFAULTS.halfLifeMs,
  halfLifeEnergyFactor = DEFAULTS.halfLifeEnergyFactor,
  maxLayers = DEFAULTS.maxLayers,
  minOpacity = DEFAULTS.minOpacity,
} = {}) {
  const audio = useAudioReactive();
  const overlayLayersRef = useRef([]);

  const configRef = useRef({});
  configRef.current = {
    enabled: !!enabled,
    paused: !!paused,
    layers: Array.isArray(layers) ? layers : [],
    selectedLayerIndex: Number.isFinite(selectedLayerIndex) ? selectedLayerIndex : 0,
    energyInfluence: Number.isFinite(energyInfluence) ? energyInfluence : 0,
    band: typeof band === 'string' ? band : DEFAULTS.band,
    threshold: clamp(Number(threshold) || 0, 0, 1),
    cooldownMs: Math.max(0, Number(cooldownMs) || 0),
    halfLifeMs: Math.max(50, Number(halfLifeMs) || DEFAULTS.halfLifeMs),
    halfLifeEnergyFactor: clamp(Number(halfLifeEnergyFactor) || 0, 0, 4),
    maxLayers: clamp(Number(maxLayers) || DEFAULTS.maxLayers, 0, 200),
    minOpacity: clamp(Number(minOpacity) || DEFAULTS.minOpacity, 0.0001, 1),
  };

  const rafRef = useRef(null);
  const lastSpawnMsRef = useRef(-Infinity);
  const counterRef = useRef(0);
  // Transient detection state
  const energyHistoryRef = useRef([]);
  const prevEnergyRef = useRef(0);

  useEffect(() => {
    const stop = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      energyHistoryRef.current = [];
      prevEnergyRef.current = 0;
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
        }
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const t = nowMs();
      const features = audio.getFeatures() || {};
      const energy = clamp(Number(features[cfg.band]) || 0, 0, 1);

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

        // Animate position based on movementStyle
        const pos = layer.position || {};
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

        // Scale pulsing
        if (layer.scaleSpeed > 0) {
          const scaleDir = pos.scaleDirection || 1;
          const scaleSpd = (layer.scaleSpeed || 0.05) * dtSec * 60;
          let nextScale = (pos.scale || 1) + scaleDir * scaleSpd;
          let nextDir = scaleDir;
          const sMin = layer.scaleMin ?? 0.2;
          const sMax = layer.scaleMax ?? 1.5;
          if (nextScale >= sMax) { nextScale = sMax; nextDir = -1; }
          else if (nextScale <= sMin) { nextScale = sMin; nextDir = 1; }
          layer.position = { ...(layer.position || pos), scale: nextScale, scaleDirection: nextDir };
        }

        list[writeIndex++] = layer;
      }
      list.length = writeIndex;

      // Transient detection: trigger on sudden energy increases
      // threshold slider (0-1) now acts as sensitivity (lower = more sensitive)
      const history = energyHistoryRef.current;
      const prevEnergy = prevEnergyRef.current;
      
      // Update energy history (keep last ~10 frames for moving average)
      history.push(energy);
      if (history.length > 10) history.shift();
      
      // Compute moving average of recent energy
      const avgEnergy = history.length > 1
        ? history.slice(0, -1).reduce((a, b) => a + b, 0) / (history.length - 1)
        : 0;
      
      // Compute flux (positive energy increase relative to average)
      const flux = Math.max(0, energy - avgEnergy);
      
      // Sensitivity: threshold 0.1 = very sensitive, 0.9 = only big transients
      // Map threshold to a flux threshold: lower threshold = lower required flux
      const fluxThreshold = 0.02 + cfg.threshold * 0.3; // Range: 0.02 to 0.32
      
      // Detect transient: flux exceeds threshold AND energy is rising
      const isTransient = flux > fluxThreshold && energy > prevEnergy;
      prevEnergyRef.current = energy;

      if (isTransient && (t - lastSpawnMsRef.current) >= cfg.cooldownMs) {
        const sourceLayers = cfg.layers;
        const srcIndex = clamp(cfg.selectedLayerIndex, 0, Math.max(0, sourceLayers.length - 1));
        const base = sourceLayers[srcIndex];
        if (base) {
          counterRef.current += 1;
          const spawnIndex = counterRef.current;
          // Energy scales variance: at energyInfluence=2 and energy=1, varianceScale = 3
          // buildVariedLayerFrom expects values 0-3 for full effect (divides by 3 internally)
          const varianceScale = 1 + (energy * cfg.energyInfluence);
          const baseVar = {
            shape: clamp((Number(base?.variationShape ?? base?.variation) || 0) * varianceScale, 0, 3),
            anim: clamp((Number(base?.variationAnim ?? base?.variation) || 0) * varianceScale, 0, 3),
            color: clamp((Number(base?.variationColor ?? base?.variation) || 0) * varianceScale, 0, 3),
            position: clamp((Number(base?.variationPosition ?? base?.variation) || 0) * varianceScale, 0, 3),
            scale: clamp((Number(base?.variationScale) || 0) * varianceScale, 0, 3),
          };

          const hl = cfg.halfLifeMs * (1 + cfg.halfLifeEnergyFactor * energy);
          const baseOpacity = Number.isFinite(base?.opacity) ? clamp(base.opacity, 0, 1) : 0.8;

          const varied = buildVariedLayerFrom(base, spawnIndex, baseVar, {
            randomSeed: (Number.isFinite(base?.seed) ? base.seed : 1) + Math.floor(t) + (spawnIndex * 1013),
          });

          varied.id = uniqueId('audio-spawn');
          varied.name = `Audio ${spawnIndex}`;
          varied.visible = true;
          varied.opacity = baseOpacity;
          varied.__audioSpawn = {
            createdAtMs: t,
            halfLifeMs: Math.max(50, hl),
            baseOpacity,
            band: cfg.band,
            threshold: cfg.threshold,
            energyAtSpawn: energy,
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

      rafRef.current = requestAnimationFrame(tick);
    };

    stop();

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      stop();
    };
  }, [audio]);

  return { overlayLayersRef };
}

