import React from 'react';
import { useMobileArtState } from '../state/useMobileArtState.js';
import '../styles/drawer.css';

const Slider = ({ id, label, value, min, max, step, onChange }) => {
  const decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  const displayValue = Number.isFinite(value) ? Number(value).toFixed(decimals) : '0';

  return (
    <label className="drawer-slider" htmlFor={id}>
      <div className="drawer-slider__label">
        <span>{label}</span>
        <span className="drawer-slider__value">{displayValue}</span>
      </div>
      <input
        id={id}
        type="range"
        className="drawer-slider__input"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
};

const ControlsDrawer = () => {
  const {
    isDrawerOpen,
    setDrawerOpen,
    size,
    sides,
    variationPosition,
    variationShape,
    variationColor,
    layers,
    setSlider,
    setLayers,
    paletteIndex,
    paletteOptions,
    setPaletteIndex,
  } = useMobileArtState();

  const drawerClass = `controls-drawer${isDrawerOpen ? ' open' : ''}`;

  return (
    <aside className={drawerClass}>
      <div className="drawer-header">
        <h2>Controls</h2>
        <button type="button" className="drawer-close" onClick={() => setDrawerOpen(false)}>
          Close
        </button>
      </div>
      <div className="drawer-content">
        <div className="drawer-group">
          <Slider
            id="size"
            label="Size"
            value={size}
            min={0.35}
            max={1.1}
            step={0.01}
            onChange={(value) => setSlider('size', value)}
          />
          <Slider
            id="sides"
            label="Sides"
            value={sides}
            min={3}
            max={10}
            step={1}
            onChange={(value) => setSlider('sides', value)}
          />
        </div>
        <div className="drawer-group">
          <Slider
            id="variationPosition"
            label="Position Variation"
            value={variationPosition}
            min={0}
            max={0.6}
            step={0.01}
            onChange={(value) => setSlider('variationPosition', value)}
          />
          <Slider
            id="variationShape"
            label="Shape Variation"
            value={variationShape}
            min={0}
            max={0.8}
            step={0.02}
            onChange={(value) => setSlider('variationShape', value)}
          />
          <Slider
            id="variationColor"
            label="Colour Variation"
            value={variationColor}
            min={0}
            max={0.9}
            step={0.01}
            onChange={(value) => setSlider('variationColor', value)}
          />
          <label className="drawer-slider" htmlFor="layers">
            <div className="drawer-slider__label">
              <span>Layers</span>
              <span className="drawer-slider__value">{layers}</span>
            </div>
            <input
              id="layers"
              type="range"
              min={1}
              max={6}
              step={1}
              value={layers}
              onChange={(event) => setLayers(Number(event.target.value))}
            />
          </label>
        </div>
        <div className="drawer-group palette-group">
          <h3>Colour</h3>
          <div className="palette-options">
            {paletteOptions.map((option, index) => (
              <button
                key={option.id}
                type="button"
                className={`palette-chip${index === paletteIndex ? ' selected' : ''}`}
                onClick={() => setPaletteIndex(index)}
              >
                <span className="palette-chip__color" style={{ backgroundColor: option.color }} />
                <span className="palette-chip__label">{option.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
};

export default ControlsDrawer;
