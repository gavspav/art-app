import { useEffect, useMemo, useRef } from 'react';
import { computeInitialNodes, resizeNodes } from '../utils/nodeUtils.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const mapMidiToParamValue = (value01, param) => {
  const absoluteMin = Number.isFinite(param?.min) ? param.min : 0;
  const absoluteMax = Number.isFinite(param?.max) ? param.max : 1;
  const absoluteLow = Math.min(absoluteMin, absoluteMax);
  const absoluteHigh = Math.max(absoluteMin, absoluteMax);
  const min = clamp(
    Number.isFinite(param?.randomMin) ? param.randomMin : absoluteMin,
    absoluteLow,
    absoluteHigh,
  );
  const max = clamp(
    Number.isFinite(param?.randomMax) ? param.randomMax : absoluteMax,
    absoluteLow,
    absoluteHigh,
  );
  const step = Number.isFinite(param?.step) && param.step > 0 ? param.step : (max - min) / 1000;
  let mapped = min + Math.max(0, Math.min(1, value01)) * (max - min);
  mapped = Math.round((mapped - min) / step) * step + min;
  return clamp(mapped, Math.min(min, max), Math.max(min, max));
};

const mapParamValueToMidi = (value, param) => {
  const absoluteMin = Number.isFinite(param?.min) ? param.min : 0;
  const absoluteMax = Number.isFinite(param?.max) ? param.max : 1;
  const absoluteLow = Math.min(absoluteMin, absoluteMax);
  const absoluteHigh = Math.max(absoluteMin, absoluteMax);
  const min = clamp(
    Number.isFinite(param?.randomMin) ? param.randomMin : absoluteMin,
    absoluteLow,
    absoluteHigh,
  );
  const max = clamp(
    Number.isFinite(param?.randomMax) ? param.randomMax : absoluteMax,
    absoluteLow,
    absoluteHigh,
  );
  if (Math.abs(max - min) < 1e-9) return 0;
  return clamp((Number(value) - min) / (max - min), 0, 1);
};

const makeRegularNodes = (sides) => {
  const n = Math.max(3, Math.round(Number(sides) || 3));
  return Array.from({ length: n }, (_, i) => {
    const angle = (i / n) * Math.PI * 2;
    return { x: Math.cos(angle), y: Math.sin(angle) };
  });
};

const buildLayerParamIds = (layer, paramId, layerIndex = null) => {
  const layerNameKey = (layer?.name || `Layer ${Number.isFinite(layerIndex) ? layerIndex + 1 : ''}`.trim()).toString();
  const stableLayerKey = String(layer?.id ?? layerNameKey);
  const layerKeys = Array.from(new Set([stableLayerKey, layerNameKey].filter(Boolean)));
  const aliases = layerKeys.map((layerKey) => `layer:${layerKey}:${paramId}`);
  if (Number.isFinite(layerIndex)) {
    aliases.push(`layer:${Math.max(1, Math.floor(layerIndex) + 1)}:${paramId}`);
  } else {
    const nameMatch = /^Layer\s+(\d+)$/i.exec(layerNameKey);
    if (nameMatch) aliases.push(`layer:${nameMatch[1]}:${paramId}`);
  }
  aliases.push(`layer:all:${paramId}`);
  return Array.from(new Set(aliases.filter(Boolean)));
};

export function useMIDILayerParamHandlers({
  registerParamHandler,
  setArcadeVirtualCcValue,
  setArcadeActionValue,
  setArcadeButtonCounterValue,
  parameters,
  layers,
  setLayers,
  selectedLayerIndex = 0,
  parameterTargetMode = 'individual',
  getActiveTargetLayerIds,
  palettes = [],
  sampleColors,
}) {
  const randomizePreviousValuesRef = useRef(new Map());

  const layerParams = useMemo(() => {
    const params = Array.isArray(parameters) ? parameters : [];
    const visibleLayerParams = params.filter(param => (
      param?.showInOverlay
      && param.id !== 'opacity'
      && ['Shape', 'Movement', 'Image Effects'].includes(param.group)
    ));

    return [
      ...visibleLayerParams,
      { id: 'scale', label: 'Scale', type: 'slider', min: 0.05, max: 5, step: 0.01 },
      { id: 'rotation', label: 'Rotation', type: 'slider', min: -180, max: 180, step: 1 },
      { id: 'paletteIndex', label: 'Palette', type: 'slider', min: 0, max: 1, step: 0.001 },
    ].filter((param, index, list) => (
      param?.id && list.findIndex(candidate => candidate?.id === param.id) === index
    ));
  }, [parameters]);

  useEffect(() => {
    if (
      typeof setArcadeVirtualCcValue !== 'function'
      && typeof setArcadeActionValue !== 'function'
      && typeof setArcadeButtonCounterValue !== 'function'
    ) {
      return;
    }

    const params = new Map(layerParams.map(param => [param.id, param]));
    const list = Array.isArray(layers) ? layers : [];
    if (!list.length) return;
    const index = clamp(Math.round(Number(selectedLayerIndex) || 0), 0, Math.max(0, list.length - 1));
    const layer = list[index] || list[0] || {};

    const syncCc = (cc, paramId, fallbackParam) => {
      if (typeof setArcadeVirtualCcValue !== 'function') return;
      const param = params.get(paramId) || fallbackParam;
      const raw = Number(layer?.[paramId]);
      if (Number.isFinite(raw)) setArcadeVirtualCcValue(cc, mapParamValueToMidi(raw, param));
    };

    syncCc(37, 'radiusFactor', { id: 'radiusFactor', min: 0, max: 1 });
    syncCc(35, 'curviness', { id: 'curviness', min: 0, max: 1 });

    if (typeof setArcadeButtonCounterValue === 'function') {
      const numSides = Number(layer?.numSides);
      const numSidesParam = params.get('numSides') || { id: 'numSides', min: 3, max: 16 };
      if (Number.isFinite(numSides)) {
        setArcadeButtonCounterValue('numSides', mapParamValueToMidi(numSides, numSidesParam));
      }
    }

    if (typeof setArcadeActionValue === 'function') {
      const wobble = Number(layer?.wobble);
      const wobbleParam = params.get('wobble') || { id: 'wobble', min: 0, max: 1 };
      if (Number.isFinite(wobble)) {
        setArcadeActionValue('wobbleNoise', mapParamValueToMidi(wobble, wobbleParam));
      }
    }
  }, [
    layerParams,
    layers,
    selectedLayerIndex,
    setArcadeActionValue,
    setArcadeButtonCounterValue,
    setArcadeVirtualCcValue,
  ]);

  useEffect(() => {
    if (!registerParamHandler || typeof setLayers !== 'function' || layerParams.length === 0) return undefined;
    const paramMap = new Map(layerParams.map(param => [param.id, param]));
    const unsubs = [];

    const getTargets = (currentLayers, sourceIndex = null, forceAll = false) => {
      const list = Array.isArray(currentLayers) ? currentLayers : [];
      if (forceAll || parameterTargetMode === 'global') {
        return { mode: 'global', targetIds: null, selectedIndex: -1 };
      }

      if (Number.isFinite(sourceIndex)) {
        return {
          mode: 'index',
          targetIds: null,
          selectedIndex: clamp(Math.round(sourceIndex), 0, Math.max(0, list.length - 1)),
        };
      }

      if (typeof getActiveTargetLayerIds === 'function') {
        const ids = getActiveTargetLayerIds();
        if (Array.isArray(ids) && ids.length > 0) {
          return { mode: 'ids', targetIds: new Set(ids.filter(Boolean)), selectedIndex: -1 };
        }
      }

      const index = clamp(
        Math.round(Number(selectedLayerIndex) || 0),
        0,
        Math.max(0, list.length - 1),
      );
      return { mode: 'index', targetIds: null, selectedIndex: index };
    };

    const shouldUpdateLayer = (layer, index, targets) => {
      if (targets.mode === 'global') return true;
      if (targets.mode === 'ids') return !!(layer?.id && targets.targetIds.has(layer.id));
      return index === targets.selectedIndex;
    };

    const applyParamUpdate = (paramId, value01, sourceIndex = null, forceAll = false) => {
      const param = paramMap.get(paramId);
      if (!param) return;

      setLayers(prev => {
        if (!Array.isArray(prev) || prev.length === 0) return prev;
        const targets = getTargets(prev, sourceIndex, forceAll);
        const selectedIndex = targets.mode === 'index'
          ? targets.selectedIndex
          : clamp(Math.round(Number(selectedLayerIndex) || 0), 0, Math.max(0, prev.length - 1));
        const referenceLayer = prev[selectedIndex] || prev[0] || {};

        let anyChange = false;
        const next = prev.map((layer, index) => {
          if (!shouldUpdateLayer(layer, index, targets)) return layer;
          let patch = null;

          if (paramId === 'paletteIndex') {
            const list = Array.isArray(palettes) ? palettes : [];
            if (!list.length) return layer;
            const paletteIndex = Math.max(0, Math.min(list.length - 1, Math.floor(Math.max(0, Math.min(1, value01)) * list.length)));
            const palette = list[paletteIndex];
            const src = Array.isArray(palette) ? palette : palette?.colors;
            const count = Number.isFinite(layer?.numColors)
              ? layer.numColors
              : ((Array.isArray(layer?.colors) ? layer.colors.length : 0) || (Array.isArray(src) ? src.length : 1));
            const colors = typeof sampleColors === 'function'
              ? sampleColors(src || [], count)
              : (Array.isArray(src) ? src.slice(0, Math.max(1, count)) : ['#000000']);
            patch = { colors: [...colors], numColors: colors.length, selectedColor: 0 };
          } else if (param.type === 'dropdown' && Array.isArray(param.options) && param.options.length) {
            const optionIndex = Math.round(Math.max(0, Math.min(1, value01)) * (param.options.length - 1));
            patch = { [paramId]: param.options[clamp(optionIndex, 0, param.options.length - 1)] };
          } else {
            const mapped = mapMidiToParamValue(value01, param);

            if (paramId === 'scale') {
              patch = { position: { ...(layer?.position || {}), scale: mapped } };
            } else if (paramId === 'radiusFactor') {
              const targetRF = Number(mapped);
              const refRF = Number(referenceLayer?.radiusFactor);
              const globalRatio = parameterTargetMode === 'global' && Number.isFinite(refRF) && Math.abs(refRF) > 1e-9
                ? targetRF / refRF
                : null;
              const prevRF = Number(layer?.radiusFactor);
              const prevX = Number(layer?.radiusFactorX);
              const prevY = Number(layer?.radiusFactorY);
              if (Number.isFinite(globalRatio)) {
                const scaledRF = Number.isFinite(prevRF) ? prevRF * globalRatio : targetRF;
                patch = {
                  radiusFactor: scaledRF,
                  radiusFactorX: Number.isFinite(prevX) ? prevX * globalRatio : scaledRF,
                  radiusFactorY: Number.isFinite(prevY) ? prevY * globalRatio : scaledRF,
                };
              } else {
                const ratioRaw = Number.isFinite(prevRF) && Math.abs(prevRF) > 1e-9 ? targetRF / prevRF : targetRF;
                const ratio = Number.isFinite(ratioRaw) && ratioRaw > 0 ? ratioRaw : 1;
                patch = {
                  radiusFactor: targetRF,
                  radiusFactorX: (Number.isFinite(prevX) ? prevX : 1) * ratio,
                  radiusFactorY: (Number.isFinite(prevY) ? prevY : 1) * ratio,
                };
              }
            } else if (paramId === 'radiusFactorX' || paramId === 'radiusFactorY') {
              const targetAxis = Number(mapped);
              const refAxis = Number(referenceLayer?.[paramId]);
              const globalRatio = parameterTargetMode === 'global' && Number.isFinite(refAxis) && Math.abs(refAxis) > 1e-9
                ? targetAxis / refAxis
                : null;
              const prevAxis = Number(layer?.[paramId]);
              patch = Number.isFinite(globalRatio) && Number.isFinite(prevAxis)
                ? { [paramId]: prevAxis * globalRatio }
                : { [paramId]: targetAxis };
            } else if (paramId === 'numSides') {
              const sides = Math.max(3, Math.round(mapped));
              if (layer?.layerType !== 'shape' || (layer?.pathMode === 'open' && layer?.pathClosed !== true)) {
                patch = { numSides: sides };
              } else if (layer?.syncNodesToNumSides) {
                patch = { numSides: sides, nodes: makeRegularNodes(sides) };
              } else {
                const existing = Array.isArray(layer?.nodes) && layer.nodes.length
                  ? layer.nodes
                  : computeInitialNodes(sides);
                patch = { numSides: sides, nodes: resizeNodes(existing, sides), syncNodesToNumSides: false };
              }
            } else {
              patch = { [paramId]: mapped };
            }
          }

          if (!patch) return layer;
          anyChange = true;
          return { ...layer, ...patch };
        });

        return anyChange ? next : prev;
      });
    };

    layerParams.forEach((param) => {
      unsubs.push(registerParamHandler(param.id, ({ value01 }) => {
        applyParamUpdate(param.id, value01);
      }));
    });

    const randomizeParam = (paramId) => {
      const param = paramMap.get(paramId);
      if (!param) return;

      if (paramId === 'paletteIndex') {
        applyParamUpdate(paramId, Math.random());
        return;
      }

      if (param.type === 'dropdown' && Array.isArray(param.options) && param.options.length) {
        if (param.options.length === 1) {
          applyParamUpdate(paramId, 0);
          return;
        }
        const optionIndex = Math.floor(Math.random() * param.options.length);
        applyParamUpdate(paramId, optionIndex / (param.options.length - 1));
        return;
      }

      const min = Number.isFinite(param?.min) ? param.min : 0;
      const max = Number.isFinite(param?.max) ? param.max : 1;
      const randomMin = Number.isFinite(param?.randomMin) ? param.randomMin : min;
      const randomMax = Number.isFinite(param?.randomMax) ? param.randomMax : max;
      const low = Math.max(min, Math.min(randomMin, randomMax));
      const high = Math.min(max, Math.max(randomMin, randomMax));
      if (Math.abs(max - min) < 1e-9) {
        applyParamUpdate(paramId, 0);
        return;
      }
      const raw = low + Math.random() * Math.max(0, high - low);
      const value = param.step === 1 ? Math.round(raw) : raw;
      const clamped = clamp(value, min, max);
      applyParamUpdate(paramId, (clamped - min) / (max - min));
    };

    layerParams.forEach((param) => {
      const randomizeId = `randomize:${param.id}`;
      unsubs.push(registerParamHandler(randomizeId, ({ value01 }) => {
        const previous = randomizePreviousValuesRef.current.get(randomizeId) || 0;
        const current = Math.max(0, Math.min(1, Number(value01) || 0));
        if (previous < 0.5 && current >= 0.5) {
          randomizeParam(param.id);
        }
        randomizePreviousValuesRef.current.set(randomizeId, current);
      }));
    });

    const aliasedParamIds = layerParams.map(param => param.id);
    const registeredAliasIds = new Set();
    (Array.isArray(layers) ? layers : []).forEach((layer, index) => {
      aliasedParamIds.forEach((paramId) => {
        if (!paramMap.has(paramId)) return;
        buildLayerParamIds(layer, paramId, index).forEach((aliasId) => {
          if (registeredAliasIds.has(aliasId)) return;
          registeredAliasIds.add(aliasId);
          unsubs.push(registerParamHandler(aliasId, ({ value01 }) => {
            applyParamUpdate(paramId, value01, index, aliasId === `layer:all:${paramId}`);
          }));
        });
      });
    });

    return () => {
      unsubs.forEach(unsub => { if (typeof unsub === 'function') unsub(); });
    };
  }, [
    getActiveTargetLayerIds,
    layerParams,
    layers,
    palettes,
    parameterTargetMode,
    registerParamHandler,
    sampleColors,
    selectedLayerIndex,
    setLayers,
  ]);
}
