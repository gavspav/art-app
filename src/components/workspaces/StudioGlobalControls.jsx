import React, { useCallback } from 'react';
import { Dices } from 'lucide-react';
import { useParameters } from '../../context/ParameterContext.jsx';
import { useMidi } from '../../context/MidiContext.jsx';
import { blendModeLabel } from '../../constants/blendModes.js';
import { decimalsForStep } from '../../utils/stepPrecision.js';
import ParameterRow from '../inspector/ParameterRow.jsx';
import LimitsFields from '../inspector/LimitsFields.jsx';
import MidiMappingRow from '../inspector/modulation/MidiMappingRow.jsx';

const VARIATIONS = [
  ['variationPosition', 'Position', 0, 5],
  ['variationShape', 'Shape', 0, 5],
  ['variationAnim', 'Animation', 0, 5],
  ['variationColor', 'Colour', 0, 5],
  ['variationScale', 'Scale', -5, 5],
];

const VARIATION_FIELDS = {
  position: ['xOffset', 'yOffset'],
  shape: ['numSides', 'curviness', 'wobble', 'noiseAmount', 'width', 'height', 'radiusFactor', 'radiusFactorX', 'radiusFactorY', 'nodes', 'syncNodesToNumSides', 'viewBoxMapped'],
  anim: ['movementStyle', 'movementSpeed', 'movementAngle', 'noiseScale', 'wobbleSpeed', 'symmetry', 'freqJitter', 'scaleSpeed', 'scaleMin', 'scaleMax', 'imageBlur', 'imageBrightness', 'imageContrast', 'imageHue', 'imageSaturation', 'imageDistortion', 'vx', 'vy', 'orbitCenterX', 'orbitCenterY', 'orbitAngle', 'orbitRadiusX', 'orbitRadiusY'],
  color: ['colors', 'numColors'],
};

function mergeVariedCategory(original, varied, source, category) {
  const next = { ...original };
  for (const field of VARIATION_FIELDS[category] || []) {
    if (Object.hasOwn(varied, field)) next[field] = varied[field];
  }
  if (category === 'position') {
    next.position = { ...original.position, x: varied.position?.x ?? original.position?.x, y: varied.position?.y ?? original.position?.y };
  } else if (category === 'scale') {
    // The generator varies from the preceding layer. Apply its ratio to this
    // layer's own scale so a change does not flatten individually sized layers.
    const sourceScale = Number(source.position?.scale);
    const generatedScale = Number(varied.position?.scale);
    const originalScale = Number(original.position?.scale);
    const ratio = sourceScale > 0 && Number.isFinite(generatedScale) ? generatedScale / sourceScale : 1;
    next.position = {
      ...original.position,
      scale: originalScale > 0 ? Math.max(0.05, Math.min(5, originalScale * ratio)) : (varied.position?.scale ?? original.position?.scale),
    };
  }
  return next;
}

// Scene-level slider: random bounds live on the track; precise numbers, step
// and MIDI assignment sit in the details popover.
function GlobalControl({ id, label, min, max, step, value, onChange, included, onIncludedChange, randomMin, randomMax, onRandomMinChange, onRandomMaxChange, onStepChange, defaultValue }) {
  const midi = useMidi() || {};
  return (
    <ParameterRow
      id={id} inputId={`global-${id}`} label={label} value={Number(value ?? 0)} min={min} max={max} step={step}
      precision={decimalsForStep(step)} defaultValue={defaultValue} onChange={onChange}
      included={included} onIncludedChange={onIncludedChange}
      randomMin={randomMin} randomMax={randomMax} onRandomMinChange={onRandomMinChange} onRandomMaxChange={onRandomMaxChange}
      mapped={midi.mappings?.[id] ? ['midi'] : []} listening={midi.learnParamId === id}
      detailsTitle="Limits and mapping"
      details={<>
        <LimitsFields min={min} max={max} step={step} randomMin={randomMin} randomMax={randomMax}
          onStep={onStepChange} onRandomMin={onRandomMinChange} onRandomMax={onRandomMaxChange} />
        <div className="mod-stack"><MidiMappingRow paramId={id} /></div>
      </>}
    />
  );
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

  const rangeProps = useCallback((id, label, physicalMin, physicalMax, fallbackStep, value, onChange, defaultValue) => {
    const config = controlConfig(id, physicalMin, physicalMax, fallbackStep);
    const setRandomMin = next => updateParameter?.(id, 'randomMin', Math.max(physicalMin, Math.min(Number(next), config.randomMax)));
    const setRandomMax = next => updateParameter?.(id, 'randomMax', Math.min(physicalMax, Math.max(Number(next), config.randomMin)));
    return {
      id, label, ...config, value, onChange, defaultValue,
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
      if (previous.every(layer => layer?.[property] === value)) return previous;
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
        const source = rebuilt[index - 1];
        const varied = props.buildVariedLayerFrom(source, index + 1, weights, {
          affectCategories: [category], preserveSeeds: true,
          constrainColorsToPalette: !!props.audioSpawnUseGlobalPalette,
          paletteColors: props.paletteColorsForVariation,
        });
        rebuilt.push(varied ? mergeVariedCategory(original, varied, source, category) : original);
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
          position: Number(source[0].variationPosition ?? 0), shape: Number(source[0].variationShape ?? 0),
          anim: Number(source[0].variationAnim ?? 0), color: Number(source[0].variationColor ?? 0),
          scale: Number(source[0].variationScale ?? 0),
        };
        next.push(props.buildVariedLayerFrom?.(prior, next.length + 1, weights, {
          constrainColorsToPalette: !!props.audioSpawnUseGlobalPalette,
          paletteColors: props.paletteColorsForVariation,
        }) || { ...prior, id: undefined, name: `Layer ${next.length + 1}` });
      }
      return next;
    });
  };

  const setOpacity = value => props.setLayers?.(previous => previous.map(layer => ({ ...layer, opacity: value })));
  const globalOpacity = layers.length ? Math.min(...layers.map(layer => Number(layer.opacity ?? 1))) : 1;

  const toggle = (label, checked, onChange) => (
    <label className={`insp-check${checked ? ' on' : ''}`}><input type="checkbox" checked={!!checked} onChange={event => onChange?.(event.target.checked)} />{label}</label>
  );

  const paletteOptions = (props.palettes || []).flatMap((palette, index) => {
    const custom = palette?.__source === 'custom' && palette?.id;
    const builtinIndex = Number.isFinite(palette?.__index) ? palette.__index : index;
    const colors = Array.isArray(palette) ? palette : palette?.colors;
    return [{
      value: custom ? `custom:${palette.id}` : `builtin:${builtinIndex}`,
      label: palette?.name || (custom ? 'Custom palette' : `Palette ${builtinIndex + 1}`),
      colors: Array.isArray(colors) ? colors : [],
      custom: !!custom,
    }];
  });
  const paletteValue = props.globalPaletteIndex === 'custom'
    ? (props.globalPaletteRef ? `custom:${props.globalPaletteRef}` : '')
    : (Number.isFinite(Number(props.globalPaletteIndex)) ? `builtin:${Number(props.globalPaletteIndex)}` : '');
  const choosePalette = (value) => {
    const entry = paletteOptions.find(item => item.value === value);
    if (value.startsWith('builtin:')) props.setGlobalPaletteIndex?.(Number(value.slice(8)));
    else if (value.startsWith('custom:')) props.setGlobalPaletteRef?.(value.slice(7));
    else props.setGlobalPaletteIndex?.('custom');
    if (entry?.colors?.length) {
      props.assignOneColorPerLayer?.(props.sampleColorsEven?.(entry.colors, Math.max(1, layers.length)) || entry.colors);
    }
  };

  return <>
    <section className="insp-section">
      <div className="insp-section-head">
        <h3>Scene</h3>
        <button type="button" className="insp-chip accent" onClick={props.handleRandomizeAll} title="Randomise every included control (R)"><Dices size={14} /> Randomise</button>
      </div>
      <div className="insp-field-row">
        <label className="insp-field grow">Palette<select id="global-palette" value={paletteValue} onChange={event => choosePalette(event.target.value)}>
          <option value="">Custom (from layers)</option>
          {paletteOptions.some(option => !option.custom) && <optgroup label="Built-in">{paletteOptions.filter(option => !option.custom).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</optgroup>}
          {paletteOptions.some(option => option.custom) && <optgroup label="Custom">{paletteOptions.filter(option => option.custom).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</optgroup>}
        </select></label>
        <label className="insp-field grow">Blend<select id="global-blend-mode" value={props.globalBlendMode || 'source-over'} onChange={event => props.setGlobalBlendMode?.(event.target.value)}>{(props.blendModes || []).map(mode => {
          const value = typeof mode === 'string' ? mode : mode.value;
          return <option key={value} value={value}>{typeof mode === 'string' ? blendModeLabel(mode) : mode.label}</option>;
        })}</select></label>
        <label className="insp-field colour">Background<span className="insp-colour-chip"><input id="global-background" type="color" aria-label="Background colour" value={props.backgroundColor || '#000000'} onChange={event => props.setBackgroundColor?.(event.target.value)} /></span></label>
      </div>
      <div className="param-list">
        <GlobalControl {...rangeProps('globalSpeedMultiplier', 'Speed', 0, 10, 0.01, props.globalSpeedMultiplier ?? 1, value => props.setGlobalSpeedMultiplier?.(value), 1)} />
        <GlobalControl {...rangeProps('globalOpacity', 'Opacity', 0, 1, 0.01, globalOpacity, setOpacity, 1)} />
        <GlobalControl {...rangeProps('layersCount', 'Layers', 1, 400, 1, layers.length || 1, setLayerCount)} />
      </div>
    </section>
    <section className="insp-section">
      <div className="insp-section-head">
        <h3>Variation</h3>
        {toggle('Live', props.applyVariationInstantly, props.setApplyVariationInstantly)}
      </div>
      <p className="insp-help">Layer 1 is the source; variation shapes Layers 2 onward. Live rebuilds them as you drag.</p>
      <div className="param-list">
        {VARIATIONS.map(([id, label, min, max]) => <GlobalControl key={id} {...rangeProps(id, label, min, max, 0.1, firstLayer[id] ?? props.DEFAULT_LAYER?.[id] ?? 0, value => applyVariation(id, value), props.DEFAULT_LAYER?.[id] ?? 0)} />)}
      </div>
      <div className="insp-check-row">
        {toggle('Match colours to Layer 1', props.syncLayerColorsToFirst, props.setSyncLayerColorsToFirst)}
        {toggle('Randomise colours per layer', props.randomizeColorsPerLayer, props.setRandomizeColorsPerLayer)}
        {toggle('Generate from global palette', props.audioSpawnUseGlobalPalette, props.setAudioSpawnUseGlobalPalette)}
      </div>
    </section>
  </>;
}
