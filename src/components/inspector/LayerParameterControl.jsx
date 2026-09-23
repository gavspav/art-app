import React, { useCallback, useMemo } from 'react';
import { Dices } from 'lucide-react';
import { useParameters } from '../../context/ParameterContext.jsx';
import { useMidi } from '../../context/MidiContext.jsx';
import { useBPM } from '../../context/BPMContext.jsx';
import { useAudioReactive } from '../../context/AudioContext.jsx';
import { resolveLayerTargets, applyWithVary } from '../../utils/varyUtils.js';
import { resizeNodes, computeInitialNodes } from '../../utils/nodeUtils.js';
import { buildRadiusFactorPatch, getEffectiveRadiusFactor } from '../../utils/layerSize.js';
import { getOperationalMaxHint } from '../../utils/parameterOperationalHints.js';
import { buildLayerParamIds, findFirstMappedParamId } from '../../utils/paramAliases.js';
import { buildMidiRandomizeId } from '../../hooks/useMidiTrigger.js';
import { decimalsForStep, snapToStep } from '../../utils/stepPrecision.js';
import ParameterRow from './ParameterRow.jsx';
import LimitsFields from './LimitsFields.jsx';
import MidiMappingRow from './modulation/MidiMappingRow.jsx';
import AudioMappingRow from './modulation/AudioMappingRow.jsx';
import BpmMappingRow from './modulation/BpmMappingRow.jsx';

const MOVEMENT_STYLES = ['bounce', 'drift', 'still', 'orbit', 'spin'];
const regularNodes = (sides) => {
  const n = Math.max(3, Math.round(Number(sides) || 3));
  return Array.from({ length: n }, (_, i) => ({ x: Math.cos((i / n) * Math.PI * 2), y: Math.sin((i / n) * Math.PI * 2) }));
};
const sidesPatch = (layer, count, syncOnly = false) => {
  const n = Math.max(3, Math.round(count));
  if (layer?.layerType !== 'shape') return { numSides: n };
  if (!syncOnly && layer?.pathMode === 'open' && layer?.pathClosed !== true) return { numSides: n };
  if (layer.syncNodesToNumSides) return { numSides: n, nodes: regularNodes(n) };
  const existing = Array.isArray(layer?.nodes) && layer.nodes.length ? layer.nodes : computeInitialNodes(n);
  return { numSides: n, nodes: resizeNodes(existing, n), syncNodesToNumSides: false };
};

// Binds a parameter definition to the current layer(s) and renders a ParameterRow.
// Handles the parameters whose value lives elsewhere (scale, size, sides, movement).
export default function LayerParameterControl({ param, currentLayer, updateLayer, setLayers, buildTargetSet, targetMode = 'individual', editTarget, selectedLayerIndex = null }) {
  const { updateParameter } = useParameters();
  const midi = useMidi() || {};
  const bpm = useBPM();
  const audio = useAudioReactive();
  const { id, type, min, max, step, label, options } = param;

  const aliases = useMemo(() => buildLayerParamIds(currentLayer, id, selectedLayerIndex), [currentLayer, id, selectedLayerIndex]);
  const mapped = useMemo(() => {
    const kinds = [];
    const midiId = findFirstMappedParamId(midi.mappings || {}, aliases);
    if (midiId && midi.mappings?.[midiId]) kinds.push('midi');
    const audioId = findFirstMappedParamId(audio?.mappings || {}, aliases);
    if (audioId && audio?.mappings?.[audioId]?.band && audio.mappings[audioId].band !== 'none') kinds.push('audio');
    const bpmId = findFirstMappedParamId(bpm?.mappings || {}, aliases);
    if (bpmId && bpm?.mappings?.[bpmId]?.enabled) kinds.push('bpm');
    return kinds;
  }, [aliases, audio?.mappings, bpm?.mappings, midi.mappings]);
  const midiRandomizeId = buildMidiRandomizeId(id);
  const listening = midi.learnParamId && (aliases.includes(midi.learnParamId) || midi.learnParamId === midiRandomizeId);

  let value = currentLayer?.[id];
  if (id === 'scale') value = currentLayer?.position?.scale || 1;
  if (currentLayer?.viewBoxMapped && ['radiusFactor', 'radiusFactorX', 'radiusFactorY'].includes(id)) value = 0.5;

  const applyToTargets = useCallback((patchFactory) => {
    const { effective: targets } = resolveLayerTargets({ currentLayer, buildTargetSet, targetMode });
    const factory = typeof patchFactory === 'function' ? patchFactory : () => patchFactory || {};
    if (typeof setLayers === 'function' && targets.size > 0) {
      setLayers(prev => applyWithVary({ layers: prev, targets, updater: layer => ({ ...layer, ...factory(layer) }) }));
    } else {
      updateLayer(factory(currentLayer));
    }
  }, [buildTargetSet, currentLayer, setLayers, targetMode, updateLayer]);

  const clamp = useCallback(v => (Number.isFinite(min) && Number.isFinite(max) ? Math.min(max, Math.max(min, v)) : v), [max, min]);

  const setValue = useCallback((raw) => {
    if (type !== 'slider') {
      if (id === 'movementStyle') {
        applyToTargets(layer => {
          const oldStyle = layer.movementStyle || 'bounce';
          const fullCanvas = style => style === 'drift' || style === 'bounce';
          return fullCanvas(oldStyle) !== fullCanvas(raw)
            ? { movementStyle: raw, _previousMovementStyle: oldStyle, _coordinateSystemChanged: true }
            : { movementStyle: raw };
        });
      } else {
        applyToTargets({ [id]: raw });
      }
      return;
    }
    const next = clamp(parseFloat(raw));
    if (!Number.isFinite(next)) return;
    const global = targetMode === 'global';
    if (id === 'scale') {
      const ref = Number(currentLayer?.position?.scale);
      const ratio = global && Number.isFinite(ref) && Math.abs(ref) > 1e-9 ? next / ref : null;
      applyToTargets(layer => {
        const prev = Number(layer?.position?.scale);
        return { position: { ...(layer?.position || {}), scale: clamp(ratio !== null && Number.isFinite(prev) ? prev * ratio : next) } };
      });
    } else if (id === 'radiusFactor') {
      const ref = getEffectiveRadiusFactor(currentLayer);
      const ratio = global && Number.isFinite(ref) && Math.abs(ref) > 1e-9 ? next / ref : null;
      applyToTargets(layer => buildRadiusFactorPatch(layer, ratio !== null ? getEffectiveRadiusFactor(layer) * ratio : next, ratio));
    } else if (id === 'radiusFactorX' || id === 'radiusFactorY') {
      const ref = Number(currentLayer?.[id]);
      const ratio = global && Number.isFinite(ref) && Math.abs(ref) > 1e-9 ? next / ref : null;
      applyToTargets(layer => {
        const prev = Number(layer?.[id]);
        return { [id]: ratio !== null && Number.isFinite(prev) ? prev * ratio : next };
      });
    } else if (id === 'numSides') {
      applyToTargets(layer => sidesPatch(layer, next));
    } else {
      applyToTargets({ [id]: next });
    }
  }, [applyToTargets, clamp, currentLayer, id, targetMode, type]);

  const randomizeNow = useCallback(() => {
    if (type === 'slider') {
      const lo = Math.min(param.randomMin ?? min, param.randomMax ?? max);
      const hi = Math.max(param.randomMin ?? min, param.randomMax ?? max);
      let rnd = lo + Math.random() * (hi - lo);
      rnd = snapToStep(rnd, step, min);
      const next = clamp(rnd);
      if (id === 'scale') applyToTargets(layer => ({ position: { ...(layer?.position || {}), scale: next } }));
      else if (id === 'radiusFactor') applyToTargets(layer => {
        const prev = Number(layer?.radiusFactor);
        const ratio = Number.isFinite(prev) && prev > 0 ? next / prev : 1;
        return { radiusFactor: next, radiusFactorX: (Number(layer?.radiusFactorX) || 1) * ratio, radiusFactorY: (Number(layer?.radiusFactorY) || 1) * ratio };
      });
      else if (id === 'numSides') applyToTargets(layer => sidesPatch(layer, next, true));
      else applyToTargets({ [id]: next });
    } else if (Array.isArray(options) && options.length) {
      applyToTargets({ [id]: options[Math.floor(Math.random() * options.length)] });
    }
  }, [applyToTargets, clamp, id, max, min, options, param.randomMax, param.randomMin, step, type]);

  const meta = field => next => updateParameter(id, field, next);
  const hidden = (currentLayer?.layerType === 'image' && param.group === 'Shape') || (currentLayer?.layerType !== 'image' && param.group === 'Image Effects');
  if (hidden) return null;

  const effectiveOptions = id === 'movementStyle' ? MOVEMENT_STYLES : options;
  const allowedOptions = Array.isArray(param.randomOptions) && param.randomOptions.length ? param.randomOptions : effectiveOptions;
  const toggleOption = option => checked => {
    const current = allowedOptions.filter(item => effectiveOptions.includes(item));
    updateParameter(id, 'randomOptions', checked ? Array.from(new Set([...current, option])) : current.filter(item => item !== option));
  };

  const details = (
    <>
      <div className="popover-actions">
        <button type="button" className="mod-btn primary" onClick={randomizeNow}><Dices size={14} /> Randomise now</button>
        {midi.supported && <MidiMappingRow paramId={midiRandomizeId} label="Trigger" />}
      </div>
      {type === 'slider'
        ? <LimitsFields min={min} max={max} step={step} maxHint={getOperationalMaxHint(id)}
          randomMin={Number.isFinite(param.randomMin) ? param.randomMin : min}
          randomMax={Number.isFinite(param.randomMax) ? param.randomMax : max}
          onMin={meta('min')} onMax={meta('max')} onStep={meta('step')} onRandomMin={meta('randomMin')} onRandomMax={meta('randomMax')} />
        : Array.isArray(effectiveOptions) && effectiveOptions.length > 0 && (
          <div className="option-chips" role="group" aria-label={`${label} values allowed when randomising`}>
            {effectiveOptions.map(option => (
              <label key={option} className={allowedOptions.includes(option) ? 'on' : ''}>
                <input type="checkbox" checked={allowedOptions.includes(option)} onChange={event => toggleOption(option)(event.target.checked)} />{option}
              </label>
            ))}
          </div>
        )}
      <div className="mod-stack">
        <MidiMappingRow paramId={aliases[0]} paramAliases={aliases} />
        <AudioMappingRow paramId={aliases[0]} paramAliases={aliases} min={min} max={max} />
        <BpmMappingRow paramId={aliases[0]} paramAliases={aliases} min={min} max={max} />
      </div>
    </>
  );

  return (
    <ParameterRow
      id={id} label={label} type={type === 'slider' ? 'slider' : 'select'} options={effectiveOptions}
      value={value} min={min} max={max} step={step}
      precision={decimalsForStep(step)}
      defaultValue={id === 'scale' ? 1 : param.defaultValue}
      onChange={setValue}
      sliderKey={`${id}-${currentLayer?.id || 'none'}-${editTarget?.type || 'single'}-${editTarget?.groupId || ''}`}
      included={!!param.isRandomizable} onIncludedChange={meta('isRandomizable')}
      randomMin={Number.isFinite(param.randomMin) ? param.randomMin : min}
      randomMax={Number.isFinite(param.randomMax) ? param.randomMax : max}
      onRandomMinChange={type === 'slider' ? meta('randomMin') : undefined}
      onRandomMaxChange={type === 'slider' ? meta('randomMax') : undefined}
      mapped={mapped} listening={!!listening}
      details={details}
    />
  );
}
