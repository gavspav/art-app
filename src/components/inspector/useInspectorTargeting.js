import { useMemo } from 'react';
import { useLayerTargeting } from '../../hooks/controls/useLayerTargeting.js';

// Shared targeting for every layer section: which layers an edit applies to.
export function useInspectorTargeting(props) {
  const targetMode = props.parameterTargetMode === 'global' ? 'global' : 'individual';
  const layerIds = useMemo(() => (props.layers || []).map(layer => layer?.id), [props.layers]);
  const targeting = useLayerTargeting({
    currentLayer: props.currentLayer,
    layerIds,
    targetMode,
    getActiveTargetLayerIds: props.getActiveTargetLayerIds,
    setLayers: props.setLayers,
    updateLayer: props.updateCurrentLayer,
  });
  return { targetMode, layerIds, ...targeting };
}
