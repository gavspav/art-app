import React from 'react';

const LayerList = ({ layers, selectedLayerIndex, onSelectLayer, onAddLayer, onDeleteLayer }) => {
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
      <button className="add-layer-btn" onClick={onAddLayer}>+ Add Layer</button>
    </div>
  );
};

export default LayerList;
