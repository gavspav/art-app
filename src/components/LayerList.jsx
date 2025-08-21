import React from 'react';
import { DEFAULT_LAYER } from '../constants/defaults';

const LayerList = ({ layers, selectedLayerIndex, onSelectLayer, onAddLayer, onDeleteLayer, setLayers }) => {
  return (
    <div className="layer-list">
      <h3>Layers</h3>
      <ul>
        {layers.map((layer, index) => (
          <li 
            key={index} 
            className={index === selectedLayerIndex ? 'selected' : ''}
          >
            <button className="layer-select-btn" onClick={() => onSelectLayer(index)}>
              {layer.name}
            </button>
            <button className="layer-delete-btn" onClick={() => onDeleteLayer(index)} disabled={layers.length <= 1}>
              X
            </button>
          </li>
        ))}
      </ul>
      {/* Layer Variation for new layer creation (applies to last layer) */}
      <div className="control-group" style={{ marginTop: '0.5rem' }}>
        {(() => {
          const last = layers[layers.length - 1] || DEFAULT_LAYER;
          const value = typeof last.variation === 'number' ? last.variation : DEFAULT_LAYER.variation;
          return (
            <>
              <label>Layer Variation: {Number(value).toFixed(2)}</label>
              <input
                type="range"
                min={0}
                max={3}
                step={0.1}
                value={value}
                onChange={(e) => {
                  const v = Math.max(0, Math.min(3, parseFloat(e.target.value)));
                  setLayers(prev => {
                    const next = [...prev];
                    const idx = next.length - 1;
                    if (idx >= 0) {
                      next[idx] = { ...next[idx], variation: v };
                    }
                    return next;
                  });
                }}
              />
            </>
          );
        })()}
      </div>
      <button className="add-layer-btn" onClick={onAddLayer}>+ Add Layer</button>
    </div>
  );
};

export default LayerList;
