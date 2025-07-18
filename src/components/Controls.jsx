import React from 'react';
import ColorPicker from './ColorPicker';
import { useParameters } from '../context/ParameterContext.jsx';
import { blendModes } from '../constants/blendModes';

const DynamicControl = ({ param, currentLayer, updateLayer }) => {
  const { id, type, min, max, step, label, options } = param;
  let value = currentLayer[id];

  // Special mapping for scale - it should update position.scale, not width/height
  if (id === 'scale') {
    value = currentLayer.position?.scale || 1;
  }

  const handleChange = (e) => {
    let newValue;
    switch (type) {
      case 'slider':
        newValue = parseFloat(e.target.value);
        break;
      case 'dropdown':
        newValue = e.target.value;
        break;
      default:
        newValue = e.target.value;
    }
    // Custom mapping for scale
    if (id === 'scale') {
      // Update position.scale for uniform scaling
      updateLayer({ position: { ...currentLayer.position, scale: newValue } });
    } else {
      updateLayer({ [id]: newValue });
    }
  };

  // Don't show shape controls for image layers
  if (currentLayer.layerType === 'image' && param.group === 'Shape') {
    return null; 
  }

  switch (type) {
    case 'slider':
      return (
        <>
          <label>{label}: {Number(value).toFixed(id.includes('Speed') || id === 'curviness' || id === 'movementSpeed' ? 3 : 2)}</label>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={handleChange}
          />
        </>
      );
    case 'dropdown':
        return (
            <>
                <label>{label}:</label>
                <select value={value} onChange={handleChange}>
                    {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
            </>
        )
    default:
      return null;
  }
};

const Controls = ({ 
  currentLayer, 
  updateLayer, 
  randomizeSeed, // Changed from randomizeLayer to randomizeSeed
  randomizeAll, 
  variation, 
  setVariation, 
  isFrozen, 
  setIsFrozen,
  globalSpeedMultiplier,
  setGlobalSpeedMultiplier
}) => {
  const { parameters } = useParameters();

  if (!currentLayer) {
    return <div className="controls">Loading...</div>;
  }

  const handleColorChange = (newColors) => {
    updateLayer({ colors: newColors });
  };

  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (file && (file.type === 'image/jpeg' || file.type === 'image/png')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          updateLayer({ layerType: 'image', image: img, numSides: 0 });
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  };

  const overlayControls = parameters.filter(p => p.showInOverlay);
  const groupedControls = overlayControls.reduce((acc, param) => {
    const group = param.group || 'General';
    if (!acc[group]) acc[group] = [];
    acc[group].push(param);
    return acc;
  }, {});

  return (
    <div className="controls">
      <h2>Controls</h2>
      <div className="control-group">
        <button onClick={randomizeAll}>Randomize All</button>
        <button onClick={() => setIsFrozen(!isFrozen)}>{isFrozen ? 'Unfreeze' : 'Freeze'}</button>
      </div>

      <div className="control-group">
        <h3>Global</h3>
        <label>Variation: {variation.toFixed(2)}</label>
        <input 
          type="range" 
          min="0" 
          max="1" 
          step="0.01" 
          value={variation} 
          onChange={(e) => setVariation(parseFloat(e.target.value))} 
        />
        <label>Global Speed: {globalSpeedMultiplier.toFixed(2)}</label>
        <input 
          type="range" 
          min="0" 
          max="2" 
          step="0.01" 
          value={globalSpeedMultiplier} 
          onChange={(e) => setGlobalSpeedMultiplier(parseFloat(e.target.value))} 
        />
      </div>

      <div className="control-group">
        <h3>Layer: {currentLayer.name}</h3>
        
        {/* --- Special non-dynamic controls --- */}
        <h4>Appearance</h4>
        <ColorPicker 
    label="Colors"
    colors={currentLayer.colors}
    onChange={handleColorChange}
/>
        <label>Blend Mode:</label>
        <select value={currentLayer.blendMode} onChange={(e) => updateLayer({ blendMode: e.target.value })}>
          {blendModes.map(mode => <option key={mode} value={mode}>{mode}</option>)}
        </select>

        <h4>Image</h4>
        <input type="file" accept="image/png, image/jpeg" onChange={handleImageUpload} />
        
        {/* --- Dynamically generated controls --- */}
        {Object.entries(groupedControls).map(([groupName, params]) => (
          <React.Fragment key={groupName}>
            <h4>{groupName}</h4>
            {params.map(param => (
              <DynamicControl 
                key={param.id} 
                param={param} 
                currentLayer={currentLayer} 
                updateLayer={updateLayer} 
              />
            ))}
          </React.Fragment>
        ))}
        
        <button onClick={randomizeSeed} style={{ marginTop: '1rem' }}>Randomize Seed</button>
      </div>
    </div>
  );
};

export default Controls;
