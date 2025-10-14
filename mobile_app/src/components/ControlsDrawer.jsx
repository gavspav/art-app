import React from 'react';
import { useMobileArtState } from '../state/useMobileArtState.js';
import { blendModes } from '../constants/blendModes.js';
import { palettes } from '../constants/palettes.js';
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
    backgroundColor,
    foregroundColor,
    setBackgroundColor,
    setForegroundColor,
    blendMode,
    setBlendMode,
    paletteIndex,
    setPalette,
  } = useMobileArtState();

  const handlePaletteChange = (e) => {
    const index = parseInt(e.target.value, 10);
    if (index === -1) {
      setPalette(null, []);
    } else {
      const palette = palettes[index];
      if (palette) {
        setPalette(index, palette.colors);
      }
    }
  };

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
              max={20}
              step={1}
              value={layers}
              onChange={(event) => setLayers(Number(event.target.value))}
            />
          </label>
        </div>
        <div className="drawer-group color-group">
          <h3>Colours</h3>
          <div className="color-pickers">
            <label className="color-picker" htmlFor="backgroundColor">
              <span className="color-picker__label">Background</span>
              <input
                id="backgroundColor"
                type="color"
                className="color-picker__input"
                value={backgroundColor}
                onChange={(e) => setBackgroundColor(e.target.value)}
              />
            </label>
            <label className="color-picker" htmlFor="foregroundColor">
              <span className="color-picker__label">Foreground</span>
              <input
                id="foregroundColor"
                type="color"
                className="color-picker__input"
                value={foregroundColor}
                onChange={(e) => setForegroundColor(e.target.value)}
              />
            </label>
          </div>
        </div>
        <div className="drawer-group">
          <label className="drawer-select" htmlFor="blendMode">
            <span className="drawer-select__label">Blend Mode</span>
            <select
              id="blendMode"
              className="drawer-select__input"
              value={blendMode}
              onChange={(e) => setBlendMode(e.target.value)}
            >
              {blendModes.map((mode) => (
                <option key={mode.value} value={mode.value}>
                  {mode.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="drawer-group">
          <label className="drawer-select" htmlFor="palette">
            <span className="drawer-select__label">Palette</span>
            <select
              id="palette"
              className="drawer-select__input"
              value={paletteIndex ?? -1}
              onChange={handlePaletteChange}
            >
              <option value={-1}>None (Use Foreground)</option>
              {palettes.map((palette, index) => (
                <option key={index} value={index}>
                  {palette.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </aside>
  );
};

export default ControlsDrawer;
