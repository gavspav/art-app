// src/components/LayerList.jsx
import React from 'react';

const LayerList = ({ numLayers, colors }) => (
  <div className="flex gap-1 mt-2">
    {[...Array(numLayers)].map((_, i) => (
      <div
        key={i}
        className="w-6 h-6 rounded-full border border-white"
        style={{ backgroundColor: colors[i % colors.length] }}
        title={`Layer ${i+1}`}
      />
    ))}
  </div>
);

export default LayerList;
