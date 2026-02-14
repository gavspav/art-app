import React, { useState, useMemo, useCallback } from 'react';
import { useAudioReactive } from '../../../context/AudioContext.jsx';

const createMapping = (band, outputMin, outputMax, mode = 'direct', modeSettings = null) => {
  const mapping = {
    band,
    range: { outputMin, outputMax },
  };
  if (mode && mode !== 'direct') mapping.mode = mode;
  if (modeSettings && typeof modeSettings === 'object') mapping.modeSettings = modeSettings;
  return mapping;
};

const layerParamId = (layerNumber, paramId) => `layer:Layer ${layerNumber}:${paramId}`;
const layerMapping = (layerNumber, paramId, band, outputMin, outputMax, mode = 'direct', modeSettings = null) => (
  [layerParamId(layerNumber, paramId), createMapping(band, outputMin, outputMax, mode, modeSettings)]
);

const mappingsObject = (...entries) => Object.fromEntries(entries);

const zoneSettings = (quietValue, medValue, loudValue, overrides = {}) => ({
  quietToMed: 0.2,
  medToLoud: 0.46,
  loudToMed: 0.34,
  medToQuiet: 0.12,
  lerpSpeed: 0.035,
  quietValue,
  medValue,
  loudValue,
  ...overrides,
});

const BASE_TRI_BAND_SCENE = {
  globalSpeedMultiplier: 1,
  globalBlendMode: 'screen',
  selectedLayerIndex: 1,
  palette: ['#ff7a59', '#ffb347', '#ffe27a', '#7df9ff', '#8b8dff', '#d77dff'],
  layers: [
    {
      shapeType: 'polygon',
      numSides: 7,
      curviness: 0.5,
      radiusFactor: 0.22,
      radiusFactorX: 0.23,
      radiusFactorY: 0.2,
      wobble: 0.4,
      noiseAmount: 1.8,
      movementStyle: 'drift',
      movementSpeed: 0.6,
      movementAngle: 210,
      scaleSpeed: 0.02,
      scaleMin: 0.6,
      scaleMax: 1.75,
      opacity: 0.78,
      xOffset: -0.18,
      yOffset: 0.03,
    },
    {
      shapeType: 'polygon',
      numSides: 10,
      curviness: 0.7,
      radiusFactor: 0.2,
      radiusFactorX: 0.2,
      radiusFactorY: 0.2,
      wobble: 0.28,
      noiseAmount: 1.25,
      movementStyle: 'orbit',
      movementSpeed: 0.72,
      movementAngle: 90,
      orbitRadiusX: 0.1,
      orbitRadiusY: 0.14,
      opacity: 0.7,
      xOffset: 0,
      yOffset: 0,
    },
    {
      shapeType: 'polygon',
      numSides: 14,
      curviness: 0.85,
      radiusFactor: 0.16,
      radiusFactorX: 0.16,
      radiusFactorY: 0.16,
      wobble: 0.12,
      noiseAmount: 0.8,
      movementStyle: 'drift',
      movementSpeed: 1.05,
      movementAngle: 34,
      scaleSpeed: 0.03,
      scaleMin: 0.7,
      scaleMax: 1.65,
      opacity: 0.66,
      xOffset: 0.18,
      yOffset: -0.03,
    },
  ],
};

const triBandScene = (overrides = {}) => {
  const layerOverrides = Array.isArray(overrides.layers) ? overrides.layers : [];
  return {
    ...BASE_TRI_BAND_SCENE,
    ...overrides,
    palette: Array.isArray(overrides.palette) && overrides.palette.length
      ? [...overrides.palette]
      : [...BASE_TRI_BAND_SCENE.palette],
    layers: BASE_TRI_BAND_SCENE.layers.map((baseLayer, idx) => ({
      ...baseLayer,
      ...(layerOverrides[idx] || {}),
    })),
  };
};

const MODULATION_PRESETS = [
  {
    id: 'tri-band-wobble',
    name: 'Tri-Band Wobble',
    summary: 'Three persistent layers split by bass, mids, highs for wobble, flow, and detail.',
    recommendedInput: 'Full-spectrum music or live mic with clear lows/highs.',
    audioSettings: { sensitivity: 1.35, smoothing: 0.78, release: 0.88 },
    energyInfluence: 0.95,
    scene: triBandScene({
      globalBlendMode: 'screen',
      palette: ['#f97316', '#facc15', '#34d399', '#22d3ee', '#818cf8', '#e879f9'],
    }),
    mappings: mappingsObject(
      ['globalSpeedMultiplier', createMapping('rms', 0.65, 1.75, 'runningAvg', { windowSeconds: 3 })],
      ['globalOpacity', createMapping('rms', 0.35, 0.95, 'runningAvg', { windowSeconds: 2.8 })],
      layerMapping(1, 'wobble', 'bass', 0.08, 1),
      layerMapping(1, 'noiseAmount', 'bass', 0.3, 5.8, 'leaky', { rate: 0.055, decay: 0.995, restValue: 0.2 }),
      layerMapping(1, 'radiusFactor', 'bass', 0.1, 0.42, 'leaky', { rate: 0.04, decay: 0.996, restValue: 0.2 }),
      layerMapping(2, 'movementSpeed', 'mids', 0.2, 3.1),
      layerMapping(2, 'curviness', 'mids', 0.12, 1, 'runningAvg', { windowSeconds: 2.2 }),
      layerMapping(2, 'rotation', 'mids', -45, 45, 'onsetDrift', { threshold: 1.35, minLevel: 0.1, driftSpeed: 0.08 }),
      layerMapping(3, 'noiseAmount', 'highs', 0.2, 8),
      layerMapping(3, 'wobble', 'highs', 0.02, 1),
      layerMapping(3, 'opacity', 'highs', 0.25, 1)
    ),
  },
  {
    id: 'elastic-geometry',
    name: 'Elastic Geometry',
    summary: 'Bass stretches form, mids bend contour, highs sharpen and rotate details.',
    recommendedInput: 'Punchy electronic, funk, dynamic instrumental mixes.',
    audioSettings: { sensitivity: 1.4, smoothing: 0.7, release: 0.82 },
    energyInfluence: 1.15,
    scene: triBandScene({
      globalBlendMode: 'overlay',
      palette: ['#fb7185', '#f97316', '#f59e0b', '#84cc16', '#22d3ee', '#a78bfa'],
      layers: [
        { numSides: 6, curviness: 0.35, radiusFactor: 0.24, wobble: 0.3 },
        { numSides: 8, curviness: 0.55, radiusFactor: 0.2, wobble: 0.22 },
        { numSides: 12, curviness: 0.8, radiusFactor: 0.14, wobble: 0.1 },
      ],
    }),
    mappings: mappingsObject(
      ['globalSpeedMultiplier', createMapping('rms', 0.8, 2.2)],
      layerMapping(1, 'radiusFactor', 'bass', 0.1, 0.55),
      layerMapping(1, 'radiusFactorX', 'bass', 0.1, 0.75),
      layerMapping(1, 'radiusFactorY', 'mids', 0.1, 0.62),
      layerMapping(2, 'curviness', 'mids', 0.04, 1),
      layerMapping(2, 'wobble', 'mids', 0.05, 1),
      layerMapping(2, 'numSides', 'highs', 3, 18, 'hysteresis', zoneSettings(0.05, 0.5, 1, { lerpSpeed: 0.08 })),
      layerMapping(3, 'rotation', 'highs', -150, 150, 'onsetDrift', { threshold: 1.25, minLevel: 0.08, driftSpeed: 0.06 }),
      layerMapping(3, 'variationShape', 'mids', 0.1, 3)
    ),
  },
  {
    id: 'spectral-tug-of-war',
    name: 'Spectral Tug-of-War',
    summary: 'Bass-vs-highs ratio morphs geometry between round, stretched, and angular states.',
    recommendedInput: 'Contrast-heavy tracks with alternating warm and bright sections.',
    audioSettings: { sensitivity: 1.25, smoothing: 0.82, release: 0.9 },
    energyInfluence: 0.9,
    scene: triBandScene({
      globalBlendMode: 'soft-light',
      palette: ['#f87171', '#fb7185', '#fdba74', '#fcd34d', '#86efac', '#67e8f9'],
      layers: [
        { movementStyle: 'orbit', movementSpeed: 0.5, orbitRadiusX: 0.14, orbitRadiusY: 0.08 },
        { movementStyle: 'drift', movementSpeed: 0.65 },
        { movementStyle: 'spin', movementSpeed: 0.35 },
      ],
    }),
    mappings: mappingsObject(
      ['globalOpacity', createMapping('rms', 0.38, 0.98, 'runningAvg', { windowSeconds: 4.2 })],
      ['globalBlendMode', createMapping('highs', 0, 1)],
      layerMapping(1, 'radiusFactorX', 'bass', 0.12, 0.85, 'bandRatio', { numerator: 'bass', denominator: 'highs', scale: 2.25 }),
      layerMapping(1, 'radiusFactorY', 'highs', 0.12, 0.85, 'bandRatio', { numerator: 'highs', denominator: 'bass', scale: 2.25 }),
      layerMapping(2, 'curviness', 'mids', 0, 1, 'bandRatio', { numerator: 'mids', denominator: 'highs', scale: 2.4 }),
      layerMapping(2, 'movementSpeed', 'mids', 0.08, 2.4),
      layerMapping(3, 'numSides', 'highs', 3, 20, 'bandRatio', { numerator: 'highs', denominator: 'bass', scale: 2 }),
      layerMapping(3, 'colorFadeSpeed', 'highs', 0.02, 4, 'leaky', { rate: 0.05, decay: 0.997, restValue: 0.08 }),
      ['globalBlendMode', createMapping('highs', 0, 1, 'runningAvg', { windowSeconds: 5.5 })]
    ),
  },
  {
    id: 'energy-breather',
    name: 'Energy Breather',
    summary: 'Whole composition inhales/exhales with RMS-driven scale and opacity.',
    recommendedInput: 'Ambient beds, cinematic swells, vocal pads.',
    audioSettings: { sensitivity: 1.18, smoothing: 0.88, release: 0.95 },
    energyInfluence: 0.7,
    scene: triBandScene({
      globalBlendMode: 'lighter',
      palette: ['#fb7185', '#fda4af', '#f9a8d4', '#c4b5fd', '#93c5fd', '#67e8f9'],
      layers: [
        { movementStyle: 'still', movementSpeed: 0, wobble: 0.15 },
        { movementStyle: 'orbit', movementSpeed: 0.38, orbitRadiusX: 0.08, orbitRadiusY: 0.11 },
        { movementStyle: 'drift', movementSpeed: 0.3, wobble: 0.08 },
      ],
    }),
    mappings: mappingsObject(
      ['globalSpeedMultiplier', createMapping('rms', 0.42, 1.35, 'runningAvg', { windowSeconds: 4 })],
      ['globalOpacity', createMapping('rms', 0.2, 1, 'leaky', { rate: 0.03, decay: 0.998, restValue: 0.55 })],
      layerMapping(1, 'scale', 'rms', 0.72, 1.9, 'runningAvg', { windowSeconds: 2.5 }),
      layerMapping(2, 'scale', 'rms', 0.62, 1.7, 'runningAvg', { windowSeconds: 2.8 }),
      layerMapping(3, 'scale', 'rms', 0.82, 1.42, 'runningAvg', { windowSeconds: 2.2 }),
      layerMapping(1, 'movementSpeed', 'rms', 0.02, 1.2, 'runningAvg', { windowSeconds: 3.2 }),
      layerMapping(2, 'movementSpeed', 'rms', 0.08, 1.65, 'runningAvg', { windowSeconds: 3.2 }),
      layerMapping(3, 'opacity', 'highs', 0.24, 0.9)
    ),
  },
  {
    id: 'band-parallax',
    name: 'Band Parallax',
    summary: 'Frequency bands push layers in different axes to create depth without spawning.',
    recommendedInput: 'Rhythmic tracks, podcasts/music hybrid, textured live input.',
    audioSettings: { sensitivity: 1.3, smoothing: 0.74, release: 0.86 },
    energyInfluence: 0.85,
    scene: triBandScene({
      globalBlendMode: 'color-dodge',
      palette: ['#f59e0b', '#eab308', '#84cc16', '#22c55e', '#14b8a6', '#3b82f6'],
      layers: [
        { xOffset: -0.22, movementStyle: 'drift', movementAngle: 170 },
        { xOffset: 0, yOffset: 0, movementStyle: 'orbit', movementSpeed: 0.62 },
        { xOffset: 0.22, movementStyle: 'drift', movementAngle: 20 },
      ],
    }),
    mappings: mappingsObject(
      ['globalSpeedMultiplier', createMapping('rms', 0.65, 1.85)],
      ['globalOpacity', createMapping('rms', 0.32, 0.95)],
      layerMapping(1, 'xOffset', 'bass', -0.34, -0.04, 'leaky', { rate: 0.055, decay: 0.996, restValue: 0.55 }),
      layerMapping(2, 'yOffset', 'mids', -0.24, 0.24),
      layerMapping(3, 'xOffset', 'highs', 0.04, 0.34, 'leaky', { rate: 0.055, decay: 0.996, restValue: 0.55 }),
      layerMapping(1, 'movementAngle', 'bass', 120, 250),
      layerMapping(3, 'movementAngle', 'highs', -30, 70),
      layerMapping(2, 'wobble', 'mids', 0.08, 1)
    ),
  },
  {
    id: 'beat-quantizer',
    name: 'Beat Quantizer',
    summary: 'Transient zones snap rotation, sides, and motion style into stepped states.',
    recommendedInput: 'Percussive audio, clap loops, syncopated drums.',
    audioSettings: { sensitivity: 1.9, smoothing: 0.6, release: 0.7 },
    energyInfluence: 1.3,
    scene: triBandScene({
      globalBlendMode: 'hard-light',
      palette: ['#f43f5e', '#fb7185', '#f59e0b', '#facc15', '#38bdf8', '#818cf8'],
      layers: [
        { movementStyle: 'bounce', numSides: 6, wobble: 0.2, noiseAmount: 1.6 },
        { movementStyle: 'drift', numSides: 8, wobble: 0.15, noiseAmount: 1.2 },
        { movementStyle: 'spin', numSides: 12, wobble: 0.08, noiseAmount: 0.8 },
      ],
    }),
    mappings: mappingsObject(
      ['globalBlendMode', createMapping('highs', 0, 1, 'runningAvg', { windowSeconds: 5.5 })],
      layerMapping(1, 'rotation', 'bass', 0, 360, 'hysteresis', zoneSettings(0, 0.5, 1, { lerpSpeed: 0.11 })),
      layerMapping(2, 'numSides', 'highs', 3, 16, 'hysteresis', zoneSettings(0, 0.5, 1, { lerpSpeed: 0.1 })),
      layerMapping(3, 'movementStyle', 'highs', 0, 4, 'hysteresis', zoneSettings(0, 0.5, 1, { lerpSpeed: 0.14 })),
      layerMapping(1, 'movementSpeed', 'bass', 0.12, 3.6, 'onsetDrift', { threshold: 1.25, minLevel: 0.1, driftSpeed: 0.14 }),
      layerMapping(2, 'wobble', 'mids', 0.04, 1, 'hysteresis', zoneSettings(0, 0.4, 1, { lerpSpeed: 0.09 })),
      layerMapping(3, 'noiseAmount', 'highs', 0.3, 8)
    ),
  },
  {
    id: 'vocal-sculpt',
    name: 'Vocal Sculpt',
    summary: 'Voice articulation shapes contour while highs add air and edge texture.',
    recommendedInput: 'Microphone voice, vocals, spoken word performance.',
    audioSettings: { sensitivity: 1.8, smoothing: 0.72, release: 0.9 },
    energyInfluence: 1.4,
    scene: triBandScene({
      globalBlendMode: 'soft-light',
      palette: ['#fda4af', '#f9a8d4', '#e9d5ff', '#a5b4fc', '#7dd3fc', '#5eead4'],
      layers: [
        { movementStyle: 'drift', movementSpeed: 0.45, noiseAmount: 1.2 },
        { movementStyle: 'orbit', movementSpeed: 0.58, noiseAmount: 1.1 },
        { movementStyle: 'spin', movementSpeed: 0.32, noiseAmount: 0.9 },
      ],
    }),
    mappings: mappingsObject(
      ['globalOpacity', createMapping('rms', 0.42, 1, 'hysteresis', zoneSettings(0.25, 0.65, 1, { lerpSpeed: 0.04 }))],
      ['globalSpeedMultiplier', createMapping('rms', 0.55, 1.9, 'runningAvg', { windowSeconds: 2.2 })],
      layerMapping(1, 'movementSpeed', 'rms', 0.05, 2.4, 'leaky', { rate: 0.05, decay: 0.994, restValue: 0.12 }),
      layerMapping(2, 'curviness', 'mids', 0.06, 1),
      layerMapping(2, 'radiusFactor', 'mids', 0.08, 0.5),
      layerMapping(2, 'variationShape', 'mids', 0.1, 3, 'onsetDrift', { threshold: 1.28, minLevel: 0.08, driftSpeed: 0.08 }),
      layerMapping(3, 'noiseAmount', 'highs', 0.2, 8),
      layerMapping(3, 'opacity', 'highs', 0.2, 1),
      layerMapping(3, 'wobble', 'highs', 0.02, 1)
    ),
  },
  {
    id: 'noise-field-conveyor',
    name: 'Noise Field Conveyor',
    summary: 'Audio animates frequency fields and transport direction for flowing textures.',
    recommendedInput: 'Techno, IDM, generative drones, evolving noise beds.',
    audioSettings: { sensitivity: 1.45, smoothing: 0.68, release: 0.84 },
    energyInfluence: 1.1,
    scene: triBandScene({
      globalBlendMode: 'color-burn',
      palette: ['#f97316', '#ef4444', '#8b5cf6', '#6366f1', '#06b6d4', '#10b981'],
      layers: [
        { numSides: 9, movementStyle: 'drift', movementSpeed: 0.8, wobble: 0.35, noiseAmount: 2.2 },
        { numSides: 11, movementStyle: 'drift', movementSpeed: 0.6, wobble: 0.25, noiseAmount: 1.9 },
        { numSides: 15, movementStyle: 'orbit', movementSpeed: 0.55, wobble: 0.14, noiseAmount: 1.3 },
      ],
    }),
    mappings: mappingsObject(
      ['globalSpeedMultiplier', createMapping('rms', 0.75, 2.5)],
      layerMapping(1, 'freq1', 'bass', 0.5, 8),
      layerMapping(1, 'freq2', 'mids', 0.5, 8),
      layerMapping(1, 'freq3', 'highs', 1, 32),
      layerMapping(2, 'noiseAmount', 'mids', 0.3, 8),
      layerMapping(2, 'movementAngle', 'highs', 0, 360, 'accumulate', { rate: 0.017, wrap: true }),
      layerMapping(2, 'movementSpeed', 'mids', 0.08, 3.4),
      layerMapping(3, 'rotation', 'highs', -180, 180, 'accumulate', { rate: 0.015, wrap: true }),
      layerMapping(3, 'wobble', 'highs', 0.04, 1)
    ),
  },
  {
    id: 'memory-trails-no-spawn',
    name: 'Memory Trails (No Spawn)',
    summary: 'Running averages create delayed motion echoes and ghost-like modulation.',
    recommendedInput: 'Ambient, cinematic, long-form evolving pieces.',
    audioSettings: { sensitivity: 1.2, smoothing: 0.85, release: 0.96 },
    energyInfluence: 0.6,
    scene: triBandScene({
      globalBlendMode: 'lighter',
      palette: ['#fbcfe8', '#ddd6fe', '#c4b5fd', '#93c5fd', '#67e8f9', '#5eead4'],
      layers: [
        { movementStyle: 'drift', movementSpeed: 0.24, opacity: 0.78 },
        { movementStyle: 'orbit', movementSpeed: 0.3, opacity: 0.68 },
        { movementStyle: 'drift', movementSpeed: 0.38, opacity: 0.56 },
      ],
    }),
    mappings: mappingsObject(
      ['globalSpeedMultiplier', createMapping('rms', 0.42, 1.2, 'runningAvg', { windowSeconds: 9 })],
      ['globalOpacity', createMapping('rms', 0.3, 0.92, 'runningAvg', { windowSeconds: 8 })],
      layerMapping(1, 'opacity', 'rms', 0.22, 0.96, 'leaky', { rate: 0.02, decay: 0.999, restValue: 0.58 }),
      layerMapping(2, 'colorFadeSpeed', 'highs', 0.02, 3.6, 'runningAvg', { windowSeconds: 7 }),
      layerMapping(2, 'xOffset', 'mids', -0.18, 0.18, 'runningAvg', { windowSeconds: 9 }),
      layerMapping(3, 'yOffset', 'highs', -0.18, 0.18, 'runningAvg', { windowSeconds: 8 }),
      layerMapping(1, 'movementSpeed', 'rms', 0.02, 1.2, 'runningAvg', { windowSeconds: 10 }),
      layerMapping(3, 'variationColor', 'highs', 0.05, 2.4, 'runningAvg', { windowSeconds: 8.5 })
    ),
  },
  {
    id: 'quiet-loud-zone-morph',
    name: 'Quiet/Loud Zone Morph',
    summary: 'Hysteresis zones morph between minimal, organic, and chaotic visual states.',
    recommendedInput: 'Audio with strong dynamic contrast and silence breaks.',
    audioSettings: { sensitivity: 1.6, smoothing: 0.66, release: 0.9 },
    energyInfluence: 1.55,
    scene: triBandScene({
      globalBlendMode: 'overlay',
      palette: ['#fca5a5', '#fb7185', '#fdba74', '#a3e635', '#67e8f9', '#a78bfa'],
      layers: [
        { movementStyle: 'still', movementSpeed: 0, noiseAmount: 0.3, wobble: 0.1 },
        { movementStyle: 'drift', movementSpeed: 0.3, noiseAmount: 0.4, wobble: 0.08 },
        { movementStyle: 'orbit', movementSpeed: 0.2, noiseAmount: 0.2, wobble: 0.06 },
      ],
    }),
    mappings: mappingsObject(
      ['globalSpeedMultiplier', createMapping('rms', 0.35, 2.6, 'hysteresis', zoneSettings(0.06, 0.42, 1, { lerpSpeed: 0.05 }))],
      ['globalBlendMode', createMapping('highs', 0, 1, 'runningAvg', { windowSeconds: 5.5 })],
      layerMapping(1, 'noiseAmount', 'rms', 0, 8, 'hysteresis', zoneSettings(0, 0.35, 1, { lerpSpeed: 0.06 })),
      layerMapping(1, 'wobble', 'rms', 0.02, 1, 'hysteresis', zoneSettings(0.08, 0.45, 1, { lerpSpeed: 0.06 })),
      layerMapping(2, 'curviness', 'rms', 1, 0.08, 'hysteresis', zoneSettings(0, 0.55, 1, { lerpSpeed: 0.055 })),
      layerMapping(2, 'movementSpeed', 'rms', 0.02, 3.4, 'hysteresis', zoneSettings(0.04, 0.4, 1, { lerpSpeed: 0.06 })),
      layerMapping(3, 'movementStyle', 'rms', 0, 4, 'hysteresis', zoneSettings(0, 0.5, 1, { lerpSpeed: 0.09 })),
      layerMapping(3, 'numSides', 'highs', 3, 20, 'hysteresis', zoneSettings(0.1, 0.45, 1, { lerpSpeed: 0.08 }))
    ),
  },
  {
    id: 'clap-mode-switch',
    name: 'Clap Mode Switch',
    summary: 'Transient peaks switch movement behaviors and can trigger full scene jolts.',
    recommendedInput: 'Claps, snaps, beatboxing, sharp consonants on mic.',
    audioSettings: { sensitivity: 2.1, smoothing: 0.55, release: 0.64 },
    energyInfluence: 1.65,
    scene: triBandScene({
      globalBlendMode: 'difference',
      palette: ['#ef4444', '#f97316', '#facc15', '#22c55e', '#0ea5e9', '#8b5cf6'],
      layers: [
        { movementStyle: 'bounce', movementSpeed: 0.9, noiseAmount: 1.6 },
        { movementStyle: 'drift', movementSpeed: 0.75, noiseAmount: 1.2 },
        { movementStyle: 'spin', movementSpeed: 0.45, noiseAmount: 0.8 },
      ],
    }),
    mappings: mappingsObject(
      ['globalBlendMode', createMapping('highs', 0, 1, 'runningAvg', { windowSeconds: 5.5 })],
      ['randomizeAll', createMapping('highs', 0, 1, 'hysteresis', zoneSettings(0, 0.28, 1, { quietToMed: 0.35, medToLoud: 0.66, loudToMed: 0.5, medToQuiet: 0.24, lerpSpeed: 0.12 }))],
      layerMapping(1, 'movementStyle', 'highs', 0, 4, 'hysteresis', zoneSettings(0, 0.5, 1, { quietToMed: 0.3, medToLoud: 0.62, loudToMed: 0.48, medToQuiet: 0.2, lerpSpeed: 0.14 })),
      layerMapping(2, 'movementStyle', 'highs', 0, 4, 'hysteresis', zoneSettings(0, 0.5, 1, { quietToMed: 0.3, medToLoud: 0.62, loudToMed: 0.48, medToQuiet: 0.2, lerpSpeed: 0.14 })),
      layerMapping(3, 'movementStyle', 'highs', 0, 4, 'hysteresis', zoneSettings(0, 0.5, 1, { quietToMed: 0.3, medToLoud: 0.62, loudToMed: 0.48, medToQuiet: 0.2, lerpSpeed: 0.14 })),
      layerMapping(1, 'movementSpeed', 'bass', 0.15, 4.1, 'onsetDrift', { threshold: 1.22, minLevel: 0.12, driftSpeed: 0.15 }),
      layerMapping(2, 'variationAnim', 'highs', 0, 3, 'onsetDrift', { threshold: 1.26, minLevel: 0.08, driftSpeed: 0.09 }),
      layerMapping(3, 'noiseAmount', 'highs', 0.2, 8)
    ),
  },
  {
    id: 'silence-bloom',
    name: 'Silence Bloom',
    summary: 'Quiet states linger with graceful glow; energy re-entry reactivates structure.',
    recommendedInput: 'Installations, spoken pauses, sparse ambient material.',
    audioSettings: { sensitivity: 1.12, smoothing: 0.9, release: 0.97 },
    energyInfluence: 0.5,
    scene: triBandScene({
      globalBlendMode: 'luminosity',
      palette: ['#f9a8d4', '#e9d5ff', '#c4b5fd', '#93c5fd', '#67e8f9', '#5eead4'],
      layers: [
        { movementStyle: 'still', movementSpeed: 0, opacity: 0.82, noiseAmount: 0.25 },
        { movementStyle: 'orbit', movementSpeed: 0.2, opacity: 0.72, noiseAmount: 0.18 },
        { movementStyle: 'drift', movementSpeed: 0.16, opacity: 0.64, noiseAmount: 0.16 },
      ],
    }),
    mappings: mappingsObject(
      ['globalSpeedMultiplier', createMapping('rms', 0.28, 1.45, 'hysteresis', zoneSettings(0.08, 0.42, 0.92, { lerpSpeed: 0.02 }))],
      ['globalOpacity', createMapping('rms', 0.35, 1, 'hysteresis', zoneSettings(1, 0.72, 0.42, { lerpSpeed: 0.02 }))],
      layerMapping(1, 'movementSpeed', 'rms', 0, 1.8, 'hysteresis', zoneSettings(0.04, 0.35, 0.95, { lerpSpeed: 0.024 })),
      layerMapping(2, 'opacity', 'rms', 0.95, 0.4, 'hysteresis', zoneSettings(1, 0.68, 0.34, { lerpSpeed: 0.024 })),
      layerMapping(3, 'noiseAmount', 'rms', 0.05, 6.5, 'hysteresis', zoneSettings(0.03, 0.3, 1, { lerpSpeed: 0.03 })),
      layerMapping(3, 'variationColor', 'highs', 0.05, 2.2, 'runningAvg', { windowSeconds: 9 }),
      layerMapping(2, 'colorFadeSpeed', 'highs', 0.02, 2.4, 'runningAvg', { windowSeconds: 7 })
    ),
  },
];

const DEFAULT_MOD_PRESET_ID = MODULATION_PRESETS?.[0]?.id || '';
const LAYER_PARAM_PATTERN = /^layer:Layer\s+(\d+):(.+)$/;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const RESPONSE_PROFILES = {
  subtle: { label: 'Subtle', sensitivityMul: 0.78, smoothingDelta: 0.08, releaseDelta: 0.05 },
  balanced: { label: 'Balanced', sensitivityMul: 1, smoothingDelta: 0, releaseDelta: 0 },
  hot: { label: 'Hot', sensitivityMul: 1.35, smoothingDelta: -0.08, releaseDelta: -0.1 },
};

const GENERAL_AUDIO_EFFECT_MAPPINGS = {
  globalSpeedMultiplier: createMapping('rms', 0.6, 1.95, 'runningAvg', { windowSeconds: 2.8 }),
  globalOpacity: createMapping('rms', 0.3, 0.98, 'leaky', { rate: 0.03, decay: 0.997, restValue: 0.55 }),
};

const getResponseAdjustedSettings = (settings = {}, responseProfile = 'balanced') => {
  const baseSensitivity = Number.isFinite(settings?.sensitivity) ? settings.sensitivity : 1;
  const baseSmoothing = Number.isFinite(settings?.smoothing) ? settings.smoothing : 0.7;
  const baseRelease = Number.isFinite(settings?.release) ? settings.release : 0.85;
  const profile = RESPONSE_PROFILES[responseProfile] || RESPONSE_PROFILES.balanced;

  return {
    sensitivity: clamp(baseSensitivity * profile.sensitivityMul, 0, 3),
    smoothing: clamp(baseSmoothing + profile.smoothingDelta, 0.05, 1),
    release: clamp(baseRelease + profile.releaseDelta, 0.05, 0.98),
  };
};

const resolveLayerNameForSlot = (slotIndex, layers = []) => {
  const list = Array.isArray(layers) ? layers : [];
  if (list.length === 0) return `Layer ${slotIndex}`;
  const targetIndex = clamp(slotIndex - 1, 0, list.length - 1);
  const candidate = list[targetIndex];
  const fallback = `Layer ${targetIndex + 1}`;
  const name = (candidate?.name && String(candidate.name).trim().length)
    ? String(candidate.name).trim()
    : fallback;
  return name;
};

const remapMappingsForCurrentLayers = (mappings = {}, layers = []) => {
  const out = {};
  Object.entries(mappings || {}).forEach(([paramId, mapping]) => {
    const match = LAYER_PARAM_PATTERN.exec(paramId);
    if (!match) {
      out[paramId] = mapping;
      return;
    }
    const slotIndex = Number(match[1]);
    const innerParamId = match[2];
    const layerName = resolveLayerNameForSlot(Number.isFinite(slotIndex) ? slotIndex : 1, layers);
    out[`layer:${layerName}:${innerParamId}`] = mapping;
  });
  return out;
};

const cloneLayerForScene = (defaultLayer, layerDef, layerIndex, paletteColor) => {
  const safeDefault = (defaultLayer && typeof defaultLayer === 'object') ? defaultLayer : {};
  const defPos = (safeDefault.position && typeof safeDefault.position === 'object') ? safeDefault.position : {};
  const defVary = (safeDefault.vary && typeof safeDefault.vary === 'object') ? safeDefault.vary : {};
  const layerPos = (layerDef?.position && typeof layerDef.position === 'object') ? layerDef.position : {};
  const layerVary = (layerDef?.vary && typeof layerDef.vary === 'object') ? layerDef.vary : {};
  const nextColors = Array.isArray(layerDef?.colors) && layerDef.colors.length
    ? [...layerDef.colors]
    : [paletteColor || '#ffffff'];

  return {
    ...safeDefault,
    ...(layerDef || {}),
    name: `Layer ${layerIndex + 1}`,
    layerType: 'shape',
    colors: nextColors,
    numColors: nextColors.length,
    selectedColor: 0,
    nodes: null,
    syncNodesToNumSides: true,
    position: {
      ...defPos,
      ...layerPos,
    },
    vary: {
      ...defVary,
      ...layerVary,
    },
  };
};

const AudioModulationPresetsSection = ({
  timelineMode = false,
  layers = [],
  setEnergyInfluence = null,
  setAudioSpawnEnabled = null,
  setAudioSpawnUseGlobalPalette = null,
  setParameterTargetMode = null,
  setLayers = null,
  DEFAULT_LAYER = null,
  setSelectedLayerIndex = null,
  setGlobalSpeedMultiplier = null,
  setGlobalBlendMode = null,
  setGlobalPaletteIndex = null,
  setGlobalPaletteRef = null,
} = {}) => {
  const audio = useAudioReactive();
  const [selectedPresetId, setSelectedPresetId] = useState(DEFAULT_MOD_PRESET_ID);
  const [replaceMappings, setReplaceMappings] = useState(true);
  const [applySceneSetup, setApplySceneSetup] = useState(true);
  const [enableAudioOnApply, setEnableAudioOnApply] = useState(true);
  const [disableSpawnOnApply, setDisableSpawnOnApply] = useState(true);
  const [includeGlobalEffects, setIncludeGlobalEffects] = useState(true);
  const [responseProfile, setResponseProfile] = useState('balanced');
  const [targetMode, setTargetMode] = useState('tri-band');
  const [lastAppliedPresetId, setLastAppliedPresetId] = useState(null);

  const selectedPreset = useMemo(() => (
    MODULATION_PRESETS.find((preset) => preset.id === selectedPresetId) || MODULATION_PRESETS[0] || null
  ), [selectedPresetId]);

  const lastAppliedPreset = useMemo(() => (
    MODULATION_PRESETS.find((preset) => preset.id === lastAppliedPresetId) || null
  ), [lastAppliedPresetId]);

  const applyPreset = useCallback(() => {
    if (!audio || !selectedPreset) return;

    const {
      setAudioEnabled = null,
      setSensitivity = null,
      setSmoothing = null,
      setRelease = null,
      setMapping = null,
      clearAllMappings = null,
    } = audio;

    if (enableAudioOnApply) {
      setAudioEnabled?.(true);
    }

    const audioSettings = selectedPreset.audioSettings || {};
    const tunedAudioSettings = getResponseAdjustedSettings(audioSettings, responseProfile);
    if (Number.isFinite(tunedAudioSettings.sensitivity)) setSensitivity?.(tunedAudioSettings.sensitivity);
    if (Number.isFinite(tunedAudioSettings.smoothing)) setSmoothing?.(tunedAudioSettings.smoothing);
    if (Number.isFinite(tunedAudioSettings.release)) setRelease?.(tunedAudioSettings.release);

    if (replaceMappings) {
      clearAllMappings?.();
    }

    const baseMappings = applySceneSetup
      ? { ...(selectedPreset.mappings || {}) }
      : remapMappingsForCurrentLayers(selectedPreset.mappings || {}, layers);
    const mappings = { ...baseMappings };

    if (includeGlobalEffects) {
      Object.entries(GENERAL_AUDIO_EFFECT_MAPPINGS).forEach(([paramId, mapping]) => {
        if (!(paramId in mappings)) mappings[paramId] = mapping;
      });
    }

    Object.entries(mappings).forEach(([paramId, mapping]) => {
      setMapping?.(paramId, mapping);
    });

    if (Number.isFinite(selectedPreset.energyInfluence)) {
      setEnergyInfluence?.(selectedPreset.energyInfluence);
    }

    if (disableSpawnOnApply) {
      setAudioSpawnEnabled?.(false);
      setAudioSpawnUseGlobalPalette?.(false);
    }

    const nextTargetMode = targetMode === 'global' ? 'global' : 'individual';
    setParameterTargetMode?.(nextTargetMode);

    if (applySceneSetup) {
      const scene = selectedPreset.scene || {};
      const sceneLayers = Array.isArray(scene.layers) ? scene.layers : [];
      const palette = Array.isArray(scene.palette) && scene.palette.length
        ? scene.palette
        : BASE_TRI_BAND_SCENE.palette;

      if (sceneLayers.length > 0 && typeof setLayers === 'function') {
        const nextLayers = sceneLayers.map((layerDef, idx) => (
          cloneLayerForScene(DEFAULT_LAYER, layerDef, idx, palette[idx % palette.length])
        ));
        setLayers(() => nextLayers);
        const selected = Number.isFinite(scene.selectedLayerIndex) ? scene.selectedLayerIndex : 0;
        setSelectedLayerIndex?.(Math.max(0, Math.min(nextLayers.length - 1, Math.round(selected))));
      }

      if (Number.isFinite(scene.globalSpeedMultiplier)) {
        setGlobalSpeedMultiplier?.(scene.globalSpeedMultiplier);
      }
      if (typeof scene.globalBlendMode === 'string' && scene.globalBlendMode.length) {
        setGlobalBlendMode?.(scene.globalBlendMode);
      }
      if (Array.isArray(palette) && palette.length) {
        setGlobalPaletteIndex?.('custom');
        setGlobalPaletteRef?.(null);
      }
    }

    setLastAppliedPresetId(selectedPreset.id);
  }, [
    audio,
    selectedPreset,
    enableAudioOnApply,
    replaceMappings,
    responseProfile,
    applySceneSetup,
    includeGlobalEffects,
    layers,
    setEnergyInfluence,
    disableSpawnOnApply,
    setAudioSpawnEnabled,
    setAudioSpawnUseGlobalPalette,
    targetMode,
    setParameterTargetMode,
    setLayers,
    DEFAULT_LAYER,
    setSelectedLayerIndex,
    setGlobalSpeedMultiplier,
    setGlobalBlendMode,
    setGlobalPaletteIndex,
    setGlobalPaletteRef,
  ]);

  if (!audio) return null;

  return (
    <div
      className="compact-field"
      style={{
        borderTop: '1px solid rgba(255,255,255,0.1)',
        paddingTop: '0.5rem',
        marginTop: '0.5rem',
        display: 'block',
        width: '100%',
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
        <span className="compact-label" style={{ fontWeight: 600 }}>🎛 Modulation Demo Modes (No Spawn)</span>
        <button
          type="button"
          className="btn-compact-secondary"
          style={{ fontSize: '0.72rem', padding: '2px 8px' }}
          onClick={applyPreset}
          disabled={!selectedPreset}
          title="Apply non-spawn interactive audio mappings"
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
          {MODULATION_PRESETS.map((preset, index) => (
            <option key={preset.id} value={preset.id}>
              {`${index + 1}. ${preset.name}`}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.35rem 0.5rem', alignItems: 'center', marginTop: '0.4rem' }}>
        <span className="compact-label" style={{ opacity: 0.75 }}>Response</span>
        <select
          className="compact-select"
          style={{ fontSize: '0.72rem' }}
          value={responseProfile}
          onChange={(e) => setResponseProfile(e.target.value)}
        >
          {Object.entries(RESPONSE_PROFILES).map(([value, profile]) => (
            <option key={value} value={value}>{profile.label}</option>
          ))}
        </select>

        <span className="compact-label" style={{ opacity: 0.75 }}>Target</span>
        <select
          className="compact-select"
          style={{ fontSize: '0.72rem' }}
          value={targetMode}
          onChange={(e) => setTargetMode(e.target.value)}
          title="Tri-band maps by layer role; Global broadcasts mapped params to all layers"
        >
          <option value="tri-band">Tri-band (layer roles)</option>
          <option value="global">Global (all layers)</option>
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
        <label className="compact-label" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }} title="Clear existing audio mappings before loading this mode">
          <input
            type="checkbox"
            checked={replaceMappings}
            onChange={(e) => setReplaceMappings(!!e.target.checked)}
          />
          Replace mappings
        </label>
        <label className="compact-label" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }} title="Create/update a 3-layer demo scene (size, style, colours)">
          <input
            type="checkbox"
            checked={applySceneSetup}
            onChange={(e) => setApplySceneSetup(!!e.target.checked)}
          />
          Apply scene setup
        </label>
        <label className="compact-label" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }} title="Automatically enable Audio Input when applying a mode">
          <input
            type="checkbox"
            checked={enableAudioOnApply}
            onChange={(e) => setEnableAudioOnApply(!!e.target.checked)}
          />
          Enable audio
        </label>
        <label className="compact-label" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }} title="Turn off Audio Spawn so this mode stays strictly non-spawn">
          <input
            type="checkbox"
            checked={disableSpawnOnApply}
            onChange={(e) => setDisableSpawnOnApply(!!e.target.checked)}
          />
          Disable spawn
        </label>
        <label className="compact-label" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }} title="Add always-on global audio mappings (speed/opacity/blend) so the whole scene responds clearly">
          <input
            type="checkbox"
            checked={includeGlobalEffects}
            onChange={(e) => setIncludeGlobalEffects(!!e.target.checked)}
          />
          Add global effects
        </label>
      </div>

      <div style={{ marginTop: '0.35rem', fontSize: '0.68rem', opacity: 0.65 }}>
        Tip: if only one layer reacts, either enable <strong>Apply scene setup</strong> or switch target to <strong>Global</strong>.
      </div>

      {lastAppliedPreset && (
        <div style={{ marginTop: '0.35rem', fontSize: '0.7rem', color: '#6bcb77' }}>
          Applied: {lastAppliedPreset.name}
        </div>
      )}

      {timelineMode && (
        <div style={{ marginTop: '0.35rem', fontSize: '0.7rem', opacity: 0.65 }}>
          Timeline mode disables live Audio automation. Leave Timeline mode to preview this modulation preset.
        </div>
      )}
    </div>
  );
};

export default AudioModulationPresetsSection;
