import { useEffect, useCallback } from 'react';

// Encapsulates layer management operations and node initialization behavior
export function useLayerManagement({
  layers,
  layersRef,
  setLayers,
  selectedLayerIndex,
  selectedLayerIndexRef,
  setSelectedLayerIndex,
  DEFAULT_LAYER,
  buildVariedLayerFrom,
  isNodeEditMode,
  setSuppressAnimation,
  suppressTimerRef,
}) {
  // Update properties on the currently selected layer
  const updateCurrentLayer = useCallback((newProps) => {
    // Briefly pause animation ONLY for movement-related edits, so RAF doesn't fight position/velocity updates
    try {
      const movementKeys = ['movementAngle', 'movementSpeed', 'position', 'scaleMin', 'scaleMax', 'scaleSpeed'];
      if (Object.keys(newProps || {}).some(k => movementKeys.includes(k))) {
        if (setSuppressAnimation) {
          setSuppressAnimation(true);
          if (suppressTimerRef) {
            suppressTimerRef.current && clearTimeout(suppressTimerRef.current);
            suppressTimerRef.current = setTimeout(() => setSuppressAnimation(false), 150);
          }
        }
      }
    } catch { /* noop */ }

    setLayers(prevLayers => {
      const updatedLayers = [...prevLayers];
      const selIdx = selectedLayerIndexRef?.current ?? selectedLayerIndex;
      const idx = Math.max(0, Math.min(selIdx, Math.max(0, updatedLayers.length - 1)));
      const currentLayer = updatedLayers[idx];
      const updatedLayer = { ...currentLayer, ...newProps };

      if (newProps && (newProps.movementAngle !== undefined || newProps.movementSpeed !== undefined)) {
        const angleRad = updatedLayer.movementAngle * (Math.PI / 180);
        // Map UI movementSpeed (0..5) to engine units
        updatedLayer.vx = Math.cos(angleRad) * (updatedLayer.movementSpeed * 0.001) * 1.0;
        updatedLayer.vy = Math.sin(angleRad) * (updatedLayer.movementSpeed * 0.001) * 1.0;
      }

      const clampedIndex = Math.max(0, Math.min(selIdx, updatedLayers.length - 1));
      updatedLayers[clampedIndex] = updatedLayer;
      return updatedLayers;
    });
  }, [selectedLayerIndex, selectedLayerIndexRef, setLayers, setSuppressAnimation, suppressTimerRef]);

  const addNewLayer = useCallback(() => {
    const snapshot = layersRef?.current || layers || [];
    const baseVar = {
      shape: (typeof snapshot?.[0]?.variationShape === 'number') ? snapshot[0].variationShape : (typeof snapshot?.[0]?.variation === 'number' ? snapshot[0].variation : DEFAULT_LAYER.variationShape),
      anim: (typeof snapshot?.[0]?.variationAnim === 'number') ? snapshot[0].variationAnim : (typeof snapshot?.[0]?.variation === 'number' ? snapshot[0].variation : DEFAULT_LAYER.variationAnim),
      color: (typeof snapshot?.[0]?.variationColor === 'number') ? snapshot[0].variationColor : (typeof snapshot?.[0]?.variation === 'number' ? snapshot[0].variation : DEFAULT_LAYER.variationColor),
      position: (typeof snapshot?.[0]?.variationPosition === 'number') ? snapshot[0].variationPosition : (typeof snapshot?.[0]?.variation === 'number' ? snapshot[0].variation : DEFAULT_LAYER.variationPosition),
      scale: (typeof snapshot?.[0]?.variationScale === 'number') ? snapshot[0].variationScale : (DEFAULT_LAYER.variationScale ?? 0),
    };
    const prev = snapshot[snapshot.length - 1] || DEFAULT_LAYER;
    const nextLayer = buildVariedLayerFrom(prev, snapshot.length + 1, baseVar);
    setLayers([...snapshot, nextLayer]);
    setSelectedLayerIndex(snapshot.length);
  }, [DEFAULT_LAYER, buildVariedLayerFrom, layers, layersRef, setLayers, setSelectedLayerIndex]);

  const deleteLayer = useCallback((index) => {
    const snapshot = layersRef?.current || layers || [];
    if (snapshot.length <= 1) return;
    const newLayers = snapshot
      .filter((_, i) => i !== index)
      .map((l, i) => ({ ...l, name: `Layer ${i + 1}` }));
    setLayers(newLayers);
    const selIdx = selectedLayerIndexRef?.current ?? selectedLayerIndex;
    if (selIdx >= index) {
      setSelectedLayerIndex(Math.max(0, selIdx - 1));
    }
  }, [layers, layersRef, selectedLayerIndex, selectedLayerIndexRef, setLayers, setSelectedLayerIndex]);

  const selectLayer = useCallback((index) => {
    setSelectedLayerIndex(index);
  }, [setSelectedLayerIndex]);

  // Reorder: move a layer from one index to another, updating selection
  const moveLayer = useCallback((fromIdx, toIdx) => {
    setLayers(prev => {
      const n = prev.length;
      const from = Math.max(0, Math.min(n - 1, fromIdx));
      const to = Math.max(0, Math.min(n - 1, toIdx));
      if (n <= 1 || from === to) return prev;
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
    const snapshot = layersRef?.current || layers || [];
    setSelectedLayerIndex(Math.max(0, Math.min(Math.max(0, snapshot.length - 1), toIdx)));
  }, [layers, layersRef, setLayers, setSelectedLayerIndex]);

  const moveSelectedLayerUp = useCallback(() => {
    const snapshot = layersRef?.current || layers || [];
    const idx = Math.max(0, Math.min(selectedLayerIndexRef?.current ?? selectedLayerIndex, Math.max(0, snapshot.length - 1)));
    if (idx < snapshot.length - 1) moveLayer(idx, idx + 1);
  }, [layers, layersRef, moveLayer, selectedLayerIndex, selectedLayerIndexRef]);

  const moveSelectedLayerDown = useCallback(() => {
    const snapshot = layersRef?.current || layers || [];
    const idx = Math.max(0, Math.min(selectedLayerIndexRef?.current ?? selectedLayerIndex, Math.max(0, snapshot.length - 1)));
    if (idx > 0) moveLayer(idx, idx - 1);
  }, [layers, layersRef, moveLayer, selectedLayerIndex, selectedLayerIndexRef]);

  // Ensure selected layer has nodes in node-edit mode even after layer-count changes via slider
  useEffect(() => {
    if (!isNodeEditMode) return;
    const idx = Math.max(0, Math.min(selectedLayerIndex, Math.max(0, layers.length - 1)));
    const layer = layers[idx];
    if (
      !layer ||
      layer.layerType !== 'shape' ||
      layer.shapeDeleted === true ||
      layer.blankLayer === true ||
      (layer.pathMode === 'open' && layer.pathClosed !== true)
    ) return;
    if (!Array.isArray(layer.nodes) || layer.nodes.length < 3) {
      const desired = Math.max(3, layer.numSides || 6);
      const nodes = Array.from({ length: desired }, (_, i) => {
        const a = (i / desired) * Math.PI * 2;
        return { x: Math.cos(a), y: Math.sin(a) };
      });
      setLayers(prev => prev.map((l, i) => (i === idx ? { ...l, nodes } : l)));
    }
  }, [isNodeEditMode, layers, selectedLayerIndex, setLayers]);

  return {
    updateCurrentLayer,
    addNewLayer,
    deleteLayer,
    selectLayer,
    moveSelectedLayerUp,
    moveSelectedLayerDown,
  };
}
