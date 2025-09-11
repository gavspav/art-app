import { useEffect } from 'react';

// Encapsulates layer management operations and node initialization behavior
export function useLayerManagement({
  layers,
  setLayers,
  selectedLayerIndex,
  setSelectedLayerIndex,
  DEFAULT_LAYER,
  buildVariedLayerFrom,
  isNodeEditMode,
  setSuppressAnimation,
  suppressTimerRef,
}) {
  // Update properties on the currently selected layer
  const updateCurrentLayer = (newProps) => {
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
    } catch (e) { /* ignore */ }

    setLayers(prevLayers => {
      const updatedLayers = [...prevLayers];
      const idx = Math.max(0, Math.min(selectedLayerIndex, Math.max(0, updatedLayers.length - 1)));
      const currentLayer = updatedLayers[idx];
      const updatedLayer = { ...currentLayer, ...newProps };

      if (newProps && (newProps.movementAngle !== undefined || newProps.movementSpeed !== undefined)) {
        const angleRad = updatedLayer.movementAngle * (Math.PI / 180);
        // Map UI movementSpeed (0..5) to engine units
        updatedLayer.vx = Math.cos(angleRad) * (updatedLayer.movementSpeed * 0.001) * 1.0;
        updatedLayer.vy = Math.sin(angleRad) * (updatedLayer.movementSpeed * 0.001) * 1.0;
      }

      const clampedIndex = Math.max(0, Math.min(selectedLayerIndex, updatedLayers.length - 1));
      updatedLayers[clampedIndex] = updatedLayer;
      return updatedLayers;
    });
  };

  const addNewLayer = () => {
    const baseVar = (typeof layers?.[0]?.variation === 'number') ? layers[0].variation : DEFAULT_LAYER.variation;
    const prev = layers[layers.length - 1] || DEFAULT_LAYER;
    const nextLayer = buildVariedLayerFrom(prev, layers.length + 1, baseVar);
    setLayers([...layers, nextLayer]);
    setSelectedLayerIndex(layers.length);
  };

  const deleteLayer = (index) => {
    if (layers.length <= 1) return;
    const newLayers = layers
      .filter((_, i) => i !== index)
      .map((l, i) => ({ ...l, name: `Layer ${i + 1}` }));
    setLayers(newLayers);
    if (selectedLayerIndex >= index) {
      setSelectedLayerIndex(Math.max(0, selectedLayerIndex - 1));
    }
  };

  const selectLayer = (index) => {
    setSelectedLayerIndex(index);
  };

  // Reorder: move a layer from one index to another, updating selection
  const moveLayer = (fromIdx, toIdx) => {
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
    setSelectedLayerIndex(Math.max(0, Math.min(layers.length - 1, toIdx)));
  };

  const moveSelectedLayerUp = () => {
    const idx = Math.max(0, Math.min(selectedLayerIndex, Math.max(0, layers.length - 1)));
    if (idx < layers.length - 1) moveLayer(idx, idx + 1);
  };

  const moveSelectedLayerDown = () => {
    const idx = Math.max(0, Math.min(selectedLayerIndex, Math.max(0, layers.length - 1)));
    if (idx > 0) moveLayer(idx, idx - 1);
  };

  // Ensure selected layer has nodes in node-edit mode even after layer-count changes via slider
  useEffect(() => {
    if (!isNodeEditMode) return;
    const idx = Math.max(0, Math.min(selectedLayerIndex, Math.max(0, layers.length - 1)));
    const layer = layers[idx];
    if (!layer || layer.layerType !== 'shape') return;
    if (!Array.isArray(layer.nodes) || layer.nodes.length < 3) {
      const desired = Math.max(3, layer.numSides || 6);
      const nodes = Array.from({ length: desired }, (_, i) => {
        const a = (i / desired) * Math.PI * 2;
        return { x: Math.cos(a), y: Math.sin(a) };
      });
      setLayers(prev => prev.map((l, i) => (i === idx ? { ...l, nodes } : l)));
    }
  }, [layers.length, selectedLayerIndex, isNodeEditMode, setLayers]);

  return {
    updateCurrentLayer,
    addNewLayer,
    deleteLayer,
    selectLayer,
    moveSelectedLayerUp,
    moveSelectedLayerDown,
  };
}
