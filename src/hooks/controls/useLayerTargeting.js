import { useCallback } from 'react';
import { resolveLayerTargets, applyWithVary, buildLayerIndexTarget } from '../../utils/varyUtils.js';

export function useLayerTargeting({
  currentLayer,
  layerIds,
  targetMode,
  getActiveTargetLayerIds,
  setLayers,
  updateLayer,
}) {
  const buildTargetSet = useCallback((options = {}) => {
    const mode = options.mode || 'targeted';
    if (mode === 'all') {
      return new Set((layerIds || []).map((id, index) => id || buildLayerIndexTarget(index)).filter(Boolean));
    }
    if (typeof getActiveTargetLayerIds !== 'function') return new Set();
    const ids = getActiveTargetLayerIds();
    return new Set(Array.isArray(ids) ? ids.filter(Boolean) : []);
  }, [getActiveTargetLayerIds, layerIds]);

  const applyTargetedUpdate = useCallback((updater) => {
    const { effective: targets } = resolveLayerTargets({
      currentLayer,
      buildTargetSet,
      targetMode,
    });
    const factory = typeof updater === 'function' ? updater : (() => updater || {});

    if (typeof setLayers === 'function' && targets.size > 0) {
      setLayers(prev => applyWithVary({
        layers: prev,
        targets,
        updater: (layer) => ({
          ...layer,
          ...factory(layer),
        }),
      }));
    } else if (typeof factory === 'function') {
      updateLayer(factory(currentLayer));
    }
  }, [buildTargetSet, currentLayer, setLayers, targetMode, updateLayer]);

  return {
    buildTargetSet,
    applyTargetedUpdate,
  };
}
