import React, { useCallback, useState } from 'react';
import { ChevronDown, Dices } from 'lucide-react';
import { useParameters } from '../../context/ParameterContext.jsx';
import RangeSlider from '../common/RangeSlider.jsx';
import BufferedNumberInput from '../common/BufferedNumberInput.jsx';
import { blendModeLabel } from '../../constants/blendModes.js';

const VARIATIONS = [
  ['variationPosition', 'Position', 0, 5],
  ['variationShape', 'Shape', 0, 5],
  ['variationAnim', 'Animation', 0, 5],
  ['variationColor', 'Colour', 0, 5],
  ['variationScale', 'Scale', -5, 5],
];

const UnifiedRangeControl = ({
  id, label, min, max, step, value, onChange, included, onIncludedChange,
  randomMin, randomMax, onRandomMinChange, onRandomMaxChange, onStepChange,
}) => (
  <UnifiedRangeControlBody
    id={id}
    label={label}
    min={min}
    max={max}
    step={step}
    value={value}
    onChange={onChange}
    included={included}
    onIncludedChange={onIncludedChange}
    randomMin={randomMin}
    randomMax={randomMax}
    onRandomMinChange={onRandomMinChange}
    onRandomMaxChange={onRandomMaxChange}
    onStepChange={onStepChange}
  />
);

function UnifiedRangeControlBody({
  id, label, min, max, step, value, onChange, included, onIncludedChange,
  randomMin, randomMax, onRandomMinChange, onRandomMaxChange, onStepChange,
}) {
  const [boundsOpen, setBoundsOpen] = useState(false);
  return <div className="studio-global-control">
    <div className="studio-global-control-label">
      <label htmlFor={`global-${id}`}>{label}</label>
      <BufferedNumberInput
        id={`global-${id}`}
        aria-label={`${label} value`}
        min={min}
        max={max}
        step={step}
        value={Number(value ?? 0)}
        onCommit={onChange}
        className="studio-number-input"
      />
      <button
        type="button"
        className={`studio-dice-toggle${included ? ' active' : ''}`}
        aria-label={`${included ? 'Exclude' : 'Include'} ${label} from randomisation`}
        aria-pressed={included}
        title={`${included ? 'Exclude from' : 'Include in'} scene randomisation`}
        onClick={() => onIncludedChange(!included)}
      ><Dices size={15} /></button>
    </div>
    <RangeSlider
      id={`global-${id}`}
      min={min}
      max={max}
      step={step}
      value={Number(value ?? 0)}
      onChange={event => onChange(Number(event.target.value))}
      rangeMin={randomMin}
      rangeMax={randomMax}
      onRangeMinChange={onRandomMinChange}
      onRangeMaxChange={onRandomMaxChange}
      showRangeHandles={included && boundsOpen}
      aria-label={label}
    />
    <button type="button" className="studio-bounds-toggle" onClick={() => setBoundsOpen(open => !open)} aria-expanded={boundsOpen} aria-label={`${boundsOpen ? 'Hide' : 'Show'} ${label} randomisation limits`} aria-controls={`bounds-${id}`}>
      <ChevronDown size={14} className={boundsOpen ? 'is-open' : ''} />
    </button>
    {boundsOpen && <div id={`bounds-${id}`} className="studio-random-bounds" aria-label={`${label} randomisation limits`}>
      <label>Random min<BufferedNumberInput min={min} max={randomMax} step={step} value={randomMin} onCommit={onRandomMinChange} /></label>
      <label>Random max<BufferedNumberInput min={randomMin} max={max} step={step} value={randomMax} onCommit={onRandomMaxChange} /></label>
      <label>Step<BufferedNumberInput min={id === 'layersCount' ? 1 : 0.0001} step={id === 'layersCount' ? 1 : 0.001} value={step} onCommit={onStepChange} /></label>
    </div>}
  </div>;
}

export default function StudioGlobalControls({ props }) {
  const { parameters = [], updateParameter } = useParameters() || {};
  const layers = Array.isArray(props.layers) ? props.layers : [];
  const firstLayer = layers[0] || props.DEFAULT_LAYER || {};

  const controlConfig = useCallback((id, physicalMin, physicalMax, fallbackStep) => {
    const parameter = parameters.find(item => item.id === id) || {};
    const randomMin = Number.isFinite(parameter.randomMin)
      ? parameter.randomMin
      : (Number.isFinite(parameter.min) ? parameter.min : physicalMin);
    const randomMax = Number.isFinite(parameter.randomMax)
      ? parameter.randomMax
      : (Number.isFinite(parameter.max) ? parameter.max : physicalMax);
    const step = Number.isFinite(parameter.step) && parameter.step > 0 ? parameter.step : fallbackStep;
    return {
      min: physicalMin,
      max: physicalMax,
      step,
      randomMin: Math.max(physicalMin, Math.min(randomMin, physicalMax)),
      randomMax: Math.max(physicalMin, Math.min(randomMax, physicalMax)),
    };
  }, [parameters]);

  const rangeProps = useCallback((id, label, physicalMin, physicalMax, fallbackStep, value, onChange) => {
    const config = controlConfig(id, physicalMin, physicalMax, fallbackStep);
    const setRandomMin = next => updateParameter?.(id, 'randomMin', Math.max(physicalMin, Math.min(Number(next), config.randomMax)));
    const setRandomMax = next => updateParameter?.(id, 'randomMax', Math.min(physicalMax, Math.max(Number(next), config.randomMin)));
    return {
      id, label, ...config, value, onChange,
      included: !!props.getIsRnd?.(id),
      onIncludedChange: next => props.setIsRnd?.(id, next),
      onRandomMinChange: setRandomMin,
      onRandomMaxChange: setRandomMax,
      onStepChange: next => updateParameter?.(id, 'step', Math.max(id === 'layersCount' ? 1 : 0.0001, Number(next) || fallbackStep)),
    };
  }, [controlConfig, props, updateParameter]);

  const applyVariation = useCallback((property, value) => {
    props.setLayers?.(previous => {
      if (!Array.isArray(previous) || !previous.length) return previous;
      const updated = previous.map(layer => ({ ...layer, [property]: value }));
      if (!props.applyVariationInstantly || updated.length < 2 || typeof props.buildVariedLayerFrom !== 'function') return updated;
      const base = updated[0];
      const weights = {
        position: Number(base.variationPosition ?? 0),
        shape: Number(base.variationShape ?? 0),
        anim: Number(base.variationAnim ?? 0),
        color: Number(base.variationColor ?? 0),
        scale: Number(base.variationScale ?? 0),
      };
      const category = {
        variationPosition: 'position', variationShape: 'shape', variationAnim: 'anim',
        variationColor: 'color', variationScale: 'scale',
      }[property];
      const rebuilt = [base];
      for (let index = 1; index < updated.length; index += 1) {
        const original = updated[index];
        const varied = props.buildVariedLayerFrom(rebuilt[index - 1], index + 1, weights, {
          affectCategories: [category], preserveSeeds: true,
        });
        rebuilt.push({ ...original, ...varied, id: original.id, name: original.name });
      }
      return rebuilt;
    });
  }, [props]);

  const setLayerCount = value => {
    const target = Math.max(1, Math.min(400, Math.round(Number(value) || 1)));
    props.setLayers?.(previous => {
      const source = Array.isArray(previous) && previous.length ? previous : [{ ...(props.DEFAULT_LAYER || {}) }];
      if (target <= source.length) return source.slice(0, target);
      const next = [...source];
      while (next.length < target) {
        const prior = next[next.length - 1];
        const weights = {
          position: Number(firstLayer.variationPosition ?? 0), shape: Number(firstLayer.variationShape ?? 0),
          anim: Number(firstLayer.variationAnim ?? 0), color: Number(firstLayer.variationColor ?? 0),
          scale: Number(firstLayer.variationScale ?? 0),
        };
        next.push(props.buildVariedLayerFrom?.(prior, next.length + 1, weights) || { ...prior, id: undefined, name: `Layer ${next.length + 1}` });
      }
      return next;
    });
  };

  const setOpacity = value => props.setLayers?.(previous => previous.map(layer => ({ ...layer, opacity: value })));
  const globalOpacity = layers.length ? Math.min(...layers.map(layer => Number(layer.opacity ?? 1))) : 1;

  return <>
    <section className="studio-card">
      <div className="studio-card-heading"><div><span className="eyebrow">Scene</span><h3>Global controls</h3></div><button type="button" className="studio-small-action" onClick={props.handleRandomizeAll}><Dices size={16} /> Randomise</button></div>
      <div className="studio-global-controls">
        <label className="studio-color-row"><span>Background</span><span className="studio-color-chip"><input id="global-background" type="color" aria-label="Background colour" value={props.backgroundColor || '#000000'} onChange={event => props.setBackgroundColor?.(event.target.value)} /><output>{props.backgroundColor || '#000000'}</output></span></label>
        <label>Palette<select id="global-palette" value={String(props.globalPaletteIndex ?? 0)} onChange={event => {
          const index = Number(event.target.value);
          props.setGlobalPaletteRef?.(null); props.setGlobalPaletteIndex?.(index);
          const palette = props.palettes?.[index];
          if (palette) props.assignOneColorPerLayer?.(props.sampleColorsEven?.(palette.colors || palette, Math.max(1, layers.length)) || palette.colors || palette);
        }}>{(props.palettes || []).map((palette, index) => <option key={palette.name || index} value={index}>{palette.name || `Palette ${index + 1}`}</option>)}</select></label>
        <label>Blend mode<select id="global-blend-mode" value={props.globalBlendMode || 'source-over'} onChange={event => props.setGlobalBlendMode?.(event.target.value)}>{(props.blendModes || []).map(mode => {
          const value = typeof mode === 'string' ? mode : mode.value;
          return <option key={value} value={value}>{typeof mode === 'string' ? blendModeLabel(mode) : mode.label}</option>;
        })}</select></label>
      </div>
      <div className="studio-variation-controls">
        <UnifiedRangeControl {...rangeProps('globalSpeedMultiplier', 'Global speed', 0, 10, 0.01, props.globalSpeedMultiplier ?? 1, value => props.setGlobalSpeedMultiplier?.(value))} />
        <UnifiedRangeControl {...rangeProps('globalOpacity', 'Global opacity', 0, 1, 0.01, globalOpacity, setOpacity)} />
        <UnifiedRangeControl {...rangeProps('layersCount', 'Layers', 1, 400, 1, layers.length || 1, setLayerCount)} />
      </div>
    </section>
    <section className="studio-card">
      <div className="studio-card-heading"><div><span className="eyebrow">Layer generation</span><h3>Variation</h3></div></div>
      <p className="studio-help">These controls vary successive layers from Layer 1. Enable instant variation to rebuild the affected part as you drag.</p>
      <label className="studio-check"><input type="checkbox" checked={!!props.applyVariationInstantly} onChange={event => props.setApplyVariationInstantly?.(event.target.checked)} /> Apply variation instantly</label>
      <div className="studio-variation-controls">
        {VARIATIONS.map(([id, label, min, max]) => <UnifiedRangeControl key={id} {...rangeProps(id, label, min, max, 0.1, firstLayer[id] ?? props.DEFAULT_LAYER?.[id] ?? 0, value => applyVariation(id, value))} />)}
      </div>
      <div className="studio-global-options">
        <label className="studio-check"><input type="checkbox" checked={!!props.syncLayerColorsToFirst} onChange={event => props.setSyncLayerColorsToFirst?.(event.target.checked)} /> Match colours to Layer 1</label>
        <label className="studio-check"><input type="checkbox" checked={!!props.randomizeColorsPerLayer} onChange={event => props.setRandomizeColorsPerLayer?.(event.target.checked)} /> Randomise colours per layer</label>
        <label className="studio-check"><input type="checkbox" checked={!!props.audioSpawnUseGlobalPalette} onChange={event => props.setAudioSpawnUseGlobalPalette?.(event.target.checked)} /> Use global palette for generation</label>
      </div>
    </section>
  </>;
}
