import React, { useState } from 'react';
import { blendModes } from '../constants/blendModes';

const Controls = ({ 
  currentLayer, 
  updateLayer, 
  randomize,
  speed,
  setSpeed,
  variation,
  setVariation,
  isFrozen,
  setIsFrozen
}) => {
  if (!currentLayer) {
    return <div>Loading controls...</div>;
  }

  const [selectedColorIndex, setSelectedColorIndex] = useState(0);

  const handleColorChange = (newColor) => {
    const newColors = [...currentLayer.colors];
    newColors[selectedColorIndex] = newColor;
    updateLayer({ colors: newColors });
  };

  const handleValueChange = (key, value, isNumber = true) => {
    updateLayer({ [key]: isNumber ? parseFloat(value) : value });
  };

  return (
    <div className="controls">
      <h3>Layer: {currentLayer.name || 'Default'}</h3>

      {/* Layer-specific controls */}
      <div className="control-group">
        <h4>Shape</h4>
        <label>Shape Type</label>
        <select value={currentLayer.shapeType} onChange={(e) => handleValueChange('shapeType', e.target.value, false)}>
          <option value="polygon">Polygon</option>
          <option value="circle">Circle</option>
        </select>

        <label>Sides: {currentLayer.numSides}</label>
        <input 
          type="range" 
          min="3" 
          max="30" 
          step="1" 
          value={currentLayer.numSides} 
          onChange={(e) => handleValueChange('numSides', e.target.value)}
        />

        <label>Curviness: {currentLayer.curviness.toFixed(2)}</label>
        <input 
          type="range" 
          min="-1" 
          max="1" 
          step="0.01" 
          value={currentLayer.curviness} 
          onChange={(e) => handleValueChange('curviness', e.target.value)}
        />

        <label>Noise: {currentLayer.noiseAmount.toFixed(2)}</label>
        <input 
          type="range" 
          min="0" 
          max="5" 
          step="0.01" 
          value={currentLayer.noiseAmount} 
          onChange={(e) => handleValueChange('noiseAmount', e.target.value)}
        />
      </div>

      <div className="control-group">
        <h4>Appearance</h4>
        <label>Opacity: {currentLayer.opacity.toFixed(2)}</label>
        <input 
          type="range" 
          min="0" 
          max="1" 
          step="0.01" 
          value={currentLayer.opacity} 
          onChange={(e) => handleValueChange('opacity', e.target.value)}
        />

        <label>Blend Mode</label>
        <select value={currentLayer.blendMode} onChange={(e) => handleValueChange('blendMode', e.target.value, false)}>
          {blendModes.map(mode => <option key={mode} value={mode}>{mode}</option>)}
        </select>

        <h4>Colors</h4>
        <div className="color-palette-swatches">
          {currentLayer.colors.map((color, index) => (
            <button
              key={index}
              className={`swatch ${index === selectedColorIndex ? 'selected' : ''}`}
              style={{ backgroundColor: color }}
              onClick={() => setSelectedColorIndex(index)}
            />
          ))}
        </div>
        <input
          type="color"
          value={currentLayer.colors[selectedColorIndex] || '#000000'}
          onChange={(e) => handleColorChange(e.target.value)}
        />
      </div>

      <div className="control-group">
        <h4>Transform</h4>
        <label>Width: {currentLayer.shapeWidth.toFixed(2)}</label>
        <input type="range" min="0.1" max="2" step="0.01" value={currentLayer.shapeWidth} onChange={(e) => handleValueChange('shapeWidth', e.target.value)} />
        
        <label>Height: {currentLayer.shapeHeight.toFixed(2)}</label>
        <input type="range" min="0.1" max="2" step="0.01" value={currentLayer.shapeHeight} onChange={(e) => handleValueChange('shapeHeight', e.target.value)} />

        <label>Center X: {currentLayer.centerX.toFixed(2)}</label>
        <input type="range" min="0" max="1" step="0.01" value={currentLayer.centerX} onChange={(e) => handleValueChange('centerX', e.target.value)} />

        <label>Center Y: {currentLayer.centerY.toFixed(2)}</label>
        <input type="range" min="0" max="1" step="0.01" value={currentLayer.centerY} onChange={(e) => handleValueChange('centerY', e.target.value)} />
      </div>

      <div className="control-group">
        <h4>Seed</h4>
        <label>Layer Seed: {currentLayer.seed}</label>
        <input type="range" min="0" max="1000" step="1" value={currentLayer.seed} onChange={(e) => handleValueChange('seed', e.target.value)} />
        <label>
          <input type="checkbox" checked={currentLayer.useGlobalSeed} onChange={(e) => handleValueChange('useGlobalSeed', e.target.checked, false)} />
          Use Global Seed
        </label>
      </div>

      <button onClick={randomize}>Randomize Layer</button>

      <hr />

      {/* Global controls */}
      <h3>Global Settings</h3>
      <div className="control-group">
        <label>Speed: {speed.toFixed(4)}</label>
        <input type="range" min="0" max="0.01" step="0.0001" value={speed} onChange={(e) => setSpeed(parseFloat(e.target.value))} />

        <label>Variation: {variation.toFixed(2)}</label>
        <input type="range" min="0" max="5" step="0.01" value={variation} onChange={(e) => setVariation(parseFloat(e.target.value))} />

        <button onClick={() => setIsFrozen(!isFrozen)}>{isFrozen ? 'Unfreeze' : 'Freeze'}</button>
      </div>
    </div>
  );
};

export default Controls;
