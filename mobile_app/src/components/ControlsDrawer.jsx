import React, { useCallback } from 'react';
import { useMobileArtState } from '../state/useMobileArtState.js';
import { blendModes } from '../constants/blendModes.js';
import { palettes } from '../constants/palettes.js';
import '../styles/drawer.css';

const getStepPrecision = (step) => {
  const text = step.toString();
  if (!text.includes('.')) return 0;
  return text.split('.')[1].length;
};

const randomFromRange = (min, max, step) => {
  const precision = getStepPrecision(step);
  const steps = Math.round((max - min) / step);
  const value = min + Math.round(Math.random() * steps) * step;
  return Number(value.toFixed(precision));
};

const randomHexColor = () => `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')}`;

const DiceButton = ({ onClick, label }) => (
  <button type="button" className="drawer-dice-btn" aria-label={`Randomize ${label}`} onClick={onClick}>
    🎲
  </button>
);

const Slider = ({ id, label, value, min, max, step, onChange, onRandom }) => {
  const decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  const displayValue = Number.isFinite(value) ? Number(value).toFixed(decimals) : '0';

  return (
    <label className="drawer-slider" htmlFor={id}>
      <div className="drawer-slider__label">
        <span>{label}</span>
        <div className="drawer-slider__meta">
          {onRandom ? <DiceButton onClick={onRandom} label={label} /> : null}
          <span className="drawer-slider__value">{displayValue}</span>
        </div>
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

  const randomizeSlider = useCallback((key, min, max, step) => {
    const value = randomFromRange(min, max, step);
    setSlider(key, value);
  }, [setSlider]);

  const randomizeLayers = useCallback(() => {
    const value = randomFromRange(3, 7, 1);
    setLayers(value);
  }, [setLayers]);

  const randomizeColor = useCallback((setter) => {
    setter(randomHexColor());
  }, []);

  const randomizeBlendMode = useCallback(() => {
    const choice = blendModes[Math.floor(Math.random() * blendModes.length)];
    setBlendMode(choice.value);
  }, [setBlendMode]);

  const randomizePalette = useCallback(() => {
    const options = [-1, ...palettes.map((_, index) => index)];
    const choice = options[Math.floor(Math.random() * options.length)];
    if (choice === -1) {
      setPalette(null, []);
    } else {
      const palette = palettes[choice];
      if (palette) {
        setPalette(choice, palette.colors);
      }
    }
  }, [setPalette]);

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
            onRandom={() => randomizeSlider('size', 0.35, 1.1, 0.01)}
          />
          <Slider
            id="sides"
            label="Sides"
            value={sides}
            min={3}
            max={10}
            step={1}
            onChange={(value) => setSlider('sides', value)}
            onRandom={() => randomizeSlider('sides', 3, 10, 1)}
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
            onRandom={() => randomizeSlider('variationPosition', 0, 0.6, 0.01)}
          />
          <Slider
            id="variationShape"
            label="Shape Variation"
            value={variationShape}
            min={0}
            max={0.8}
            step={0.02}
            onChange={(value) => setSlider('variationShape', value)}
            onRandom={() => randomizeSlider('variationShape', 0, 0.8, 0.02)}
          />
          <Slider
            id="variationColor"
            label="Colour Variation"
            value={variationColor}
            min={0}
            max={0.9}
            step={0.01}
            onChange={(value) => setSlider('variationColor', value)}
            onRandom={() => randomizeSlider('variationColor', 0, 0.9, 0.01)}
          />
          <Slider
            id="layers"
            label="Layers"
            value={layers}
            min={1}
            max={20}
            step={1}
            onChange={(value) => setLayers(value)}
            onRandom={randomizeLayers}
          />
        </div>
        <div className="drawer-group color-group">
          <h3>Colours</h3>
          <div className="color-pickers">
            <label className="color-picker" htmlFor="backgroundColor">
              <div className="color-picker__label-row">
                <span className="color-picker__label">Background</span>
                <DiceButton onClick={() => randomizeColor(setBackgroundColor)} label="Background colour" />
              </div>
              <input
                id="backgroundColor"
                type="color"
                className="color-picker__input"
                value={backgroundColor}
                onChange={(e) => setBackgroundColor(e.target.value)}
              />
            </label>
            <label className="color-picker" htmlFor="foregroundColor">
              <div className="color-picker__label-row">
                <span className="color-picker__label">Foreground</span>
                <DiceButton onClick={() => randomizeColor(setForegroundColor)} label="Foreground colour" />
              </div>
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
            <div className="drawer-select__label-row">
              <span className="drawer-select__label">Blend Mode</span>
              <DiceButton onClick={randomizeBlendMode} label="Blend mode" />
            </div>
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
            <div className="drawer-select__label-row">
              <span className="drawer-select__label">Palette</span>
              <DiceButton onClick={randomizePalette} label="Palette" />
            </div>
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
