/* eslint-disable react-hooks/rules-of-hooks, no-unused-vars */
import React, { useState } from 'react';
import ColorPicker from './ColorPicker';
import { useParameters } from '../context/ParameterContext.jsx';
import { DEFAULT_LAYER } from '../constants/defaults';
import { blendModes } from '../constants/blendModes';
import { palettes } from '../constants/palettes';

const DynamicControl = ({ param, currentLayer, updateLayer }) => {
  const { updateParameter } = useParameters();
  const { id, type, min, max, step, label, options } = param;
  const [showSettings, setShowSettings] = useState(false);

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

  const randomizeThisParam = () => {
    console.log('[Controls] Randomize clicked for param', id);
    if (type === 'slider') {
      const rmin = Number.isFinite(param.randomMin) ? param.randomMin : min;
      const rmax = Number.isFinite(param.randomMax) ? param.randomMax : max;
      const low = Math.min(rmin, rmax);
      const high = Math.max(rmin, rmax);
      let rnd = low + Math.random() * (high - low);
      if (step === 1) rnd = Math.round(rnd);
      const clamped = Math.min(max, Math.max(min, rnd));
      if (id === 'scale') {
        updateLayer({ position: { ...currentLayer.position, scale: clamped } });
      } else {
        updateLayer({ [id]: clamped });
      }
    } else if (type === 'dropdown' && Array.isArray(options) && options.length) {
      const choice = options[Math.floor(Math.random() * options.length)];
      updateLayer({ [id]: choice });
    }
  };

  const onToggleRandomizable = (e) => {
    updateParameter(id, 'isRandomizable', !!e.target.checked);
  };

  const onMetaChange = (field) => (e) => {
    let v = e.target.value;
    if (['min', 'max', 'step', 'defaultValue', 'randomMin', 'randomMax'].includes(field)) {
      v = parseFloat(v);
    }
    updateParameter(id, field, v);
  };

  // Inline per-layer Vary toggle support for parameters with vary flags
  const varyKey = (() => {
    switch (id) {
      // Shape
      case 'numSides': return 'numSides';
      case 'curviness': return 'curviness';
      case 'wobble': return 'wobble';
      case 'noiseAmount': return 'noiseAmount';
      case 'width': return 'width';
      case 'height': return 'height';
      // Movement
      case 'movementStyle': return 'movementStyle';
      case 'movementSpeed': return 'movementSpeed';
      case 'movementAngle': return 'movementAngle';
      case 'scaleSpeed': return 'scaleSpeed';
      // Image Effects
      case 'imageBlur': return 'imageBlur';
      case 'imageBrightness': return 'imageBrightness';
      case 'imageContrast': return 'imageContrast';
      case 'imageHue': return 'imageHue';
      case 'imageSaturation': return 'imageSaturation';
      case 'imageDistortion': return 'imageDistortion';
      default: return null;
    }
  })();
  const toggleVaryFlag = (e) => {
    const key = varyKey;
    if (!key) return;
    const checked = !!e.target.checked;
    const nextVary = { ...(currentLayer.vary || DEFAULT_LAYER.vary || {}), [key]: checked };
    updateLayer({ vary: nextVary });
  };

  // Hide shape controls when on an image layer
  if (currentLayer.layerType === 'image' && param.group === 'Shape') {
    return null;
  }
  // Hide image-effect controls when on a non-image layer
  if (currentLayer.layerType !== 'image' && param.group === 'Image Effects') {
    return null;
  }

  const onClickSettings = (e) => {
    e.stopPropagation();
    console.log('[Controls] Settings toggled for param', id);
    setShowSettings(s => !s);
  };

  const onClickRandomize = (e) => {
    e.stopPropagation();
    randomizeThisParam();
  };

  const Header = ({ children }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', pointerEvents: 'auto', position: 'relative', zIndex: 1 }}>
      <div>{children}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <button
          type="button"
          onClick={onClickSettings}
          title="Parameter settings"
          aria-label={`Settings for ${label}`}
          style={{ padding: '0 0.4rem', pointerEvents: 'auto', position: 'relative', zIndex: 2 }}
          tabIndex={0}
        >
          ⚙
        </button>
        <button
          type="button"
          onClick={onClickRandomize}
          title="Randomize this parameter"
          aria-label={`Randomize ${label}`}
          style={{ padding: '0 0.4rem', pointerEvents: 'auto', position: 'relative', zIndex: 2 }}
          tabIndex={0}
        >
          🎲
        </button>
        {varyKey && (
          <label title="Allow this parameter to vary across layers" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <input type="checkbox" checked={!!(currentLayer?.vary?.[varyKey])} onChange={toggleVaryFlag} />
            Vary
          </label>
        )}
        <label title="Include in Randomize All" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <input type="checkbox" checked={!!param.isRandomizable} onChange={onToggleRandomizable} />
          Rnd
        </label>
      </div>
    </div>
  );

  const SettingsPanel = () => (
    <div style={{ marginTop: '0.4rem', padding: '0.5rem', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', display: showSettings ? 'block' : 'none' }}>
      {type === 'slider' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 5rem auto 5rem', gap: '0.4rem', alignItems: 'center' }}>
          <label>Min</label>
          <input type="number" value={min} onChange={onMetaChange('min')} />
          <label>Max</label>
          <input type="number" value={max} onChange={onMetaChange('max')} />
          <label>Step</label>
          <input type="number" value={step} step="0.001" onChange={onMetaChange('step')} />
          <label>Rand Min</label>
          <input type="number" value={Number.isFinite(param.randomMin) ? param.randomMin : min} onChange={onMetaChange('randomMin')} />
          <label>Rand Max</label>
          <input type="number" value={Number.isFinite(param.randomMax) ? param.randomMax : max} onChange={onMetaChange('randomMax')} />
        </div>
      )}
      {type !== 'slider' && (
        <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>No numeric bounds for this control.</div>
      )}
    </div>
  );

  switch (type) {
    case 'slider': {
      // Ensure displayed value is clamped within slider bounds even if state is out-of-range
      const numericValue = Number(value);
      const displayValue = (Number.isFinite(numericValue)
        ? Math.min(max, Math.max(min, numericValue))
        : (Number.isFinite(min) ? min : 0));
      return (
        <div style={{ marginBottom: '0.75rem' }}>
          <Header>
            <span>
              {label}: {Number(displayValue).toFixed(id.includes('Speed') || id === 'curviness' || id === 'movementSpeed' ? 3 : 2)}
            </span>
          </Header>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={displayValue}
            onChange={handleChange}
          />
          <SettingsPanel />
        </div>
      );
    }
    case 'dropdown':
      return (
        <div style={{ marginBottom: '0.75rem' }}>
          <Header>
            <span>{label}:</span>
          </Header>
          <select value={value} onChange={handleChange}>
            {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
          <SettingsPanel />
        </div>
      );
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
  classicMode,
  setClassicMode,
  // Global color randomization toggles
  randomizePalette,
  setRandomizePalette,
  randomizeNumColors,
  setRandomizeNumColors,
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

  // GLOBAL color handlers — apply to all layers
  const handleGlobalColorChange = (newColors) => {
    setLayers(prev => prev.map(l => ({ ...l, colors: newColors, numColors: (newColors?.length || 0), selectedColor: 0 })));
  };

  const handleGlobalNumColorsChange = (e) => {
    let n = parseInt(e.target.value, 10);
    if (!Number.isFinite(n) || n < 1) n = 1;
    const baseColors = Array.isArray(layers?.[0]?.colors) ? layers[0].colors : [];
    const pIdx = matchPaletteIndex(baseColors);
    let newColors = [];
    if (pIdx !== -1) {
      newColors = sampleColors(palettes[pIdx].colors, n);
    } else if (baseColors.length > 0) {
      if (n <= baseColors.length) newColors = baseColors.slice(0, n);
      else {
        newColors = [...baseColors];
        let i = 0;
        while (newColors.length < n) {
          newColors.push(baseColors[i % baseColors.length]);
          i++;
        }
      }
    } else {
      // No colors yet, seed from first palette
      newColors = sampleColors(palettes[0]?.colors || ['#000000'], n);
    }
    setLayers(prev => prev.map(l => ({ ...l, numColors: n, colors: newColors, selectedColor: 0 })));
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

  // Hide per-layer opacity (global control exists)
  const overlayControls = parameters.filter(p => p.showInOverlay && p.id !== 'opacity');
  const groupedControls = overlayControls.reduce((acc, param) => {
    const group = param.group || 'General';
    if (!acc[group]) acc[group] = [];
    acc[group].push(param);
    return acc;
  }, {});

  // Prepare grouped params for tabs
  const shapeParams = groupedControls['Shape'] || [];
  const movementParams = groupedControls['Movement'] || [];
  const imageParams = groupedControls['Image Effects'] || [];

  const [activeTab, setActiveTab] = useState('Animation');

  const renderAnimationTab = () => (
    <div className="tab-section">
      <div className="control-card">
        <div className="control-row" style={{ justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 600 }}>Animation</div>
          <button className="btn-secondary" onClick={() => randomizeCurrentLayer(false)}>Randomize Animation</button>
        </div>
        <label>Global Speed: {globalSpeedMultiplier.toFixed(2)}</label>
        <input
          type="range"
          min="0"
          max="2"
          step="0.01"
          value={globalSpeedMultiplier}
          onChange={(e) => setGlobalSpeedMultiplier(parseFloat(e.target.value))}
        />
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
          <button onClick={() => setIsNodeEditMode(!isNodeEditMode)}>{isNodeEditMode ? 'Exit Node Edit' : 'Edit Nodes'}</button>
          <button onClick={() => setIsFrozen(!isFrozen)}>{isFrozen ? 'Unfreeze' : 'Freeze'}</button>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            <input type="checkbox" checked={classicMode} onChange={e => setClassicMode(e.target.checked)} /> Classic Mode
          </label>
        </div>
      </div>

      {movementParams.map(param => (
        <div className="control-card" key={param.id}>
          <DynamicControl param={param} currentLayer={currentLayer} updateLayer={updateLayer} />
        </div>
      ))}
    </div>
  );

  const renderShapeTab = () => (
    <div className="tab-section">
      {shapeParams.map(param => (
        <div className="control-card" key={param.id}>
          <DynamicControl param={param} currentLayer={currentLayer} updateLayer={updateLayer} />
        </div>
      ))}
    </div>
  );

  const renderAppearanceTab = () => (
    <div className="tab-section">
      <div className="control-card">
        <label>Blend Mode:</label>
        <select value={globalBlendMode} onChange={(e) => setGlobalBlendMode(e.target.value)}>
          {blendModes.map(mode => <option key={mode} value={mode}>{mode}</option>)}
        </select>
        <label>Global Opacity: {(() => {
          if (!Array.isArray(layers) || layers.length === 0) return '—';
          const first = layers[0]?.opacity ?? 1;
          return Number(first).toFixed(2);
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
      </div>

      {imageParams.map(param => (
        <div className="control-card" key={param.id}>
          <DynamicControl param={param} currentLayer={currentLayer} updateLayer={updateLayer} />
        </div>
      ))}
    </div>
  );

  const renderColorsTab = () => (
    <div className="tab-section">
      <div className="control-card">
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '0.5rem' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }} title="Allow Randomize All to change the color preset">
            <input type="checkbox" checked={!!randomizePalette} onChange={(e) => setRandomizePalette(!!e.target.checked)} />
            Randomize palette
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }} title="Allow Randomize All to change the number of colors">
            <input type="checkbox" checked={!!randomizeNumColors} onChange={(e) => setRandomizeNumColors(!!e.target.checked)} />
            Randomize number of colors
          </label>
        </div>

        <label>Number of colours:</label>
        <input
          type="number"
          min={1}
          step={1}
          value={(() => {
            if (!Array.isArray(layers) || layers.length === 0) return 1;
            const base = layers[0];
            const n = Number.isFinite(base.numColors) ? base.numColors : (base.colors?.length || 1);
            return Math.max(1, n);
          })()}
          onChange={handleGlobalNumColorsChange}
          style={{ width: '5rem' }}
        />

        <label>Color Preset:</label>
        <select
          value={(() => {
            const colors = layers?.[0]?.colors || [];
            const idx = matchPaletteIndex(colors);
            return idx === -1 ? 'custom' : String(idx);
          })()}
          onChange={(e) => {
            const val = e.target.value;
            if (val !== 'custom') {
              const idx = parseInt(val, 10);
              if (palettes[idx]) {
                const base = layers?.[0];
                const count = Number.isFinite(base?.numColors)
                  ? base.numColors
                  : (base?.colors?.length || palettes[idx].colors.length);
                const nextColors = sampleColors(palettes[idx].colors, count);
                setLayers(prev => prev.map(l => ({ ...l, colors: nextColors, numColors: count, selectedColor: 0 })));
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
          colors={layers?.[0]?.colors || []}
          onChange={handleGlobalColorChange}
        />
      </div>
    </div>
  );

  const renderRandomTab = () => (
    <div className="tab-section">
      <div className="control-card">
        <button onClick={() => randomizeCurrentLayer(false)}>Randomize Layer</button>
        <button style={{ marginLeft: '0.5rem' }} onClick={randomizeAll}>Randomize All</button>
      </div>

      {/* Per-layer variation flags moved here for clarity */}
      <div className="control-card">
        {(() => {
          const vary = currentLayer.vary || DEFAULT_LAYER.vary || {};
          const updateVary = (key) => (e) => {
            const checked = !!e.target.checked;
            updateLayer({ vary: { ...(currentLayer.vary || DEFAULT_LAYER.vary || {}), [key]: checked } });
          };
          return (
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              <div>
                <div style={{ fontWeight: '600', opacity: 0.85, marginBottom: '0.25rem' }}>Shape</div>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginRight: '0.75rem' }}>
                  <input type="checkbox" checked={!!vary.numSides} onChange={updateVary('numSides')} /> Sides
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginRight: '0.75rem' }}>
                  <input type="checkbox" checked={!!vary.curviness} onChange={updateVary('curviness')} /> Curviness
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginRight: '0.75rem' }}>
                  <input type="checkbox" checked={!!vary.wobble} onChange={updateVary('wobble')} /> Wobble
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginRight: '0.75rem' }}>
                  <input type="checkbox" checked={!!vary.noiseAmount} onChange={updateVary('noiseAmount')} /> Noise
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginRight: '0.75rem' }}>
                  <input type="checkbox" checked={!!vary.width} onChange={updateVary('width')} /> Guide Width
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                  <input type="checkbox" checked={!!vary.height} onChange={updateVary('height')} /> Guide Height
                </label>
              </div>

              <div>
                <div style={{ fontWeight: '600', opacity: 0.85, marginBottom: '0.25rem' }}>Movement</div>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginRight: '0.75rem' }}>
                  <input type="checkbox" checked={!!vary.movementStyle} onChange={updateVary('movementStyle')} /> Style
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginRight: '0.75rem' }}>
                  <input type="checkbox" checked={!!vary.movementSpeed} onChange={updateVary('movementSpeed')} /> Speed
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginRight: '0.75rem' }}>
                  <input type="checkbox" checked={!!vary.movementAngle} onChange={updateVary('movementAngle')} /> Angle
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginRight: '0.75rem' }}>
                  <input type="checkbox" checked={!!vary.scaleSpeed} onChange={updateVary('scaleSpeed')} /> Z Scale Speed
                </label>
              </div>

              <div>
                <div style={{ fontWeight: '600', opacity: 0.85, marginBottom: '0.25rem' }}>Image Effects</div>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginRight: '0.75rem' }}>
                  <input type="checkbox" checked={!!vary.imageBlur} onChange={updateVary('imageBlur')} /> Blur
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginRight: '0.75rem' }}>
                  <input type="checkbox" checked={!!vary.imageBrightness} onChange={updateVary('imageBrightness')} /> Brightness
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginRight: '0.75rem' }}>
                  <input type="checkbox" checked={!!vary.imageContrast} onChange={updateVary('imageContrast')} /> Contrast
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginRight: '0.75rem' }}>
                  <input type="checkbox" checked={!!vary.imageHue} onChange={updateVary('imageHue')} /> Hue
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginRight: '0.75rem' }}>
                  <input type="checkbox" checked={!!vary.imageSaturation} onChange={updateVary('imageSaturation')} /> Saturation
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                  <input type="checkbox" checked={!!vary.imageDistortion} onChange={updateVary('imageDistortion')} /> Distortion
                </label>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );

  return (
    <div className="controls-panel">
      <div className="controls-header">
        <h2>Controls</h2>
        <div className="controls-actions">
          <button className="btn-secondary" onClick={() => setActiveTab('Colors')}>Colors</button>
          <button className="btn-primary" onClick={randomizeAll}>Randomize All</button>
        </div>
      </div>

      <div className="tabbar">
        {['Animation','Shape','Appearance','Colors','Random'].map(tab => (
          <button
            key={tab}
            className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'Animation' && renderAnimationTab()}
      {activeTab === 'Shape' && renderShapeTab()}
      {activeTab === 'Appearance' && renderAppearanceTab()}
      {activeTab === 'Colors' && renderColorsTab()}
      {activeTab === 'Random' && renderRandomTab()}
    </div>
  );
};

export default Controls;
/* eslint-disable react-hooks/rules-of-hooks, no-unused-vars */
