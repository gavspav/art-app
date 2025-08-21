import React, { useState } from 'react';
import ColorPicker from './ColorPicker';
import { useParameters } from '../context/ParameterContext.jsx';
import { blendModes } from '../constants/blendModes';
import { palettes } from '../constants/palettes';

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
        // Clamp to slider bounds
        if (Number.isFinite(min) && Number.isFinite(max)) {
          newValue = Math.min(max, Math.max(min, newValue));
        }
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

  

  // Hide shape controls when on an image layer
  if (currentLayer.layerType === 'image' && param.group === 'Shape') {
    return null;
  }
  // Hide image-effect controls when on a non-image layer
  if (currentLayer.layerType !== 'image' && param.group === 'Image Effects') {
    return null;
  }

  switch (type) {
    case 'slider':
      // Ensure displayed value is clamped within slider bounds even if state is out-of-range
      const numericValue = Number(value);
      const displayValue = (Number.isFinite(numericValue)
        ? Math.min(max, Math.max(min, numericValue))
        : (Number.isFinite(min) ? min : 0));
      return (
        <>
          <label>{label}: {Number(displayValue).toFixed(id.includes('Speed') || id === 'curviness' || id === 'movementSpeed' ? 3 : 2)}</label>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={displayValue}
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

// Collapsible Section component defined at module scope to maintain stable identity across renders
const Section = ({ title, id, defaultOpen = false, children }) => {
  const [open, setOpen] = React.useState(!!defaultOpen);
  return (
    <div className="control-group" data-section-id={id}>
      <div
        className="section-header"
        onClick={() => setOpen(o => !o)}
        style={{ cursor: 'pointer', userSelect: 'none', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
      >
        <span>{open ? '▾' : '▸'}</span>
        <span>{title}</span>
      </div>
      {open && (
        <div className="section-body" style={{ marginTop: '0.5rem' }}>
          {children}
        </div>
      )}
    </div>
  );
};

const Controls = ({ 
  currentLayer, 
  updateLayer, 
  randomizeCurrentLayer,
  randomizeAll, 
  isFrozen, 
  setIsFrozen,
  globalSpeedMultiplier,
  setGlobalSpeedMultiplier,
  globalBlendMode,
  setGlobalBlendMode,
  layers,
  setLayers,
  isNodeEditMode,
  setIsNodeEditMode,
}) => {
  const { parameters } = useParameters();


  if (!currentLayer) {
    return <div className="controls">Loading...</div>;
  }

  // Sampling helper: pick N colors from a palette evenly across its range
  const sampleColors = (base = [], count = 0) => {
    const n = Math.max(0, Math.floor(count));
    if (!Array.isArray(base) || base.length === 0 || n === 0) return [];
    if (n === 1) return [base[0]];
    if (n >= base.length) {
      // Evenly sample by spreading across the palette and allowing repeats if needed
      const out = [];
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const idx = Math.round(t * (base.length - 1));
        out.push(base[idx]);
      }
      return out;
    }
    // n < base.length: evenly spaced indices
    const out = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const idx = Math.round(t * (base.length - 1));
      out.push(base[idx]);
    }
    return out;
  };

  // Return index of palette whose sampled colors match the given array
  const matchPaletteIndex = (colors = []) => palettes.findIndex(p => {
    const sampled = sampleColors(p.colors, colors.length);
    return sampled.length === colors.length && sampled.every((c, i) => (c || '').toLowerCase() === (colors[i] || '').toLowerCase());
  });

  // Change colors directly via picker
  const handleColorChange = (newColors) => {
    updateLayer({ colors: newColors, numColors: (newColors?.length || 0) });
  };

  // Handle number-of-colours change
  const handleNumColorsChange = (e) => {
    let n = parseInt(e.target.value, 10);
    if (!Number.isFinite(n) || n < 1) n = 1;
    const colors = currentLayer.colors || [];
    const pIdx = matchPaletteIndex(colors);
    let newColors = [];
    if (pIdx !== -1) {
      newColors = sampleColors(palettes[pIdx].colors, n);
    } else if (colors.length > 0) {
      if (n <= colors.length) newColors = colors.slice(0, n);
      else {
        newColors = [...colors];
        let i = 0;
        while (newColors.length < n) {
          newColors.push(colors[i % colors.length]);
          i++;
        }
      }
    } else {
      // No colors yet, seed from first palette
      newColors = sampleColors(palettes[0]?.colors || ['#000000'], n);
    }
    updateLayer({ numColors: n, colors: newColors });
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

  // Hide per-layer opacity (global control exists) and variation (moved to Layers section)
  const overlayControls = parameters.filter(p => p.showInOverlay && p.id !== 'opacity' && p.id !== 'variation');
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

      <Section title="Global" id="global" defaultOpen={false}>
        <button onClick={() => setIsNodeEditMode(!isNodeEditMode)}>{isNodeEditMode ? 'Exit Node Edit' : 'Edit Nodes'}</button>
        <label>Global Speed: {globalSpeedMultiplier.toFixed(2)}</label>
        <input 
          type="range" 
          min="0" 
          max="2" 
          step="0.01" 
          value={globalSpeedMultiplier} 
          onChange={(e) => setGlobalSpeedMultiplier(parseFloat(e.target.value))} 
        />
        <label>Blend Mode:</label>
        <select value={globalBlendMode} onChange={(e) => setGlobalBlendMode(e.target.value)}>
          {blendModes.map(mode => <option key={mode} value={mode}>{mode}</option>)}
        </select>
        <label>Global Opacity: {(() => {
          if (!Array.isArray(layers) || layers.length === 0) return '—';
          const first = layers[0]?.opacity ?? 1;
          const allSame = layers.every(l => (l?.opacity ?? first) === first);
          return (allSame ? first : first).toFixed(2);
        })()}</label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={(() => {
            if (!Array.isArray(layers) || layers.length === 0) return 1;
            const first = layers[0]?.opacity ?? 1;
            return first;
          })()}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            setLayers(prev => prev.map(l => ({ ...l, opacity: v })));
          }}
        />
      </Section>

      <Section title={`Layer: ${currentLayer.name}`} id="layer" defaultOpen={false}>
        {/* Appearance subsection */}
        <Section title="Appearance" id="layer-appearance" defaultOpen={false}>
          <label>Number of colours:</label>
          <input
            type="number"
            min={1}
            step={1}
            value={(() => {
              const n = Number.isFinite(currentLayer.numColors)
                ? currentLayer.numColors
                : (currentLayer.colors?.length || 1);
              return Math.max(1, n);
            })()}
            onChange={handleNumColorsChange}
            style={{ width: '5rem' }}
          />

          <label>Color Preset:</label>
          <select
            value={(() => {
              const idx = matchPaletteIndex(currentLayer.colors || []);
              return idx === -1 ? 'custom' : String(idx);
            })()}
            onChange={(e) => {
              const val = e.target.value;
              if (val !== 'custom') {
                const idx = parseInt(val, 10);
                if (palettes[idx]) {
                  const count = Number.isFinite(currentLayer.numColors)
                    ? currentLayer.numColors
                    : (currentLayer.colors?.length || palettes[idx].colors.length);
                  const nextColors = sampleColors(palettes[idx].colors, count);
                  updateLayer({ colors: nextColors, numColors: count });
                }
              }
            }}
          >
            <option value="custom">Custom</option>
            {palettes.map((p, idx) => (
              <option key={idx} value={idx}>{p.name}</option>
            ))}
          </select>

          <ColorPicker 
            label="Colors"
            colors={currentLayer.colors}
            onChange={handleColorChange}
          />
        </Section>

        {/* Image subsection */}
        <Section title="Image" id="layer-image" defaultOpen={false}>
          <input type="file" accept="image/png, image/jpeg" onChange={handleImageUpload} />
        </Section>

        {/* Dynamic groups (Shape, Movement, Image Effects, etc.) */}
        {Object.entries(groupedControls).map(([groupName, params]) => (
          <Section key={groupName} title={groupName} id={`group-${groupName}`} defaultOpen={false}>
            {params.map(param => (
              <DynamicControl 
                key={param.id} 
                param={param} 
                currentLayer={currentLayer} 
                updateLayer={updateLayer} 
              />
            ))}
          </Section>
        ))}

        <button onClick={() => randomizeCurrentLayer(false)} style={{ marginTop: '1rem' }}>Randomize Layer</button>
      </Section>
    </div>
  );
};

export default Controls;
