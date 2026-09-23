import React, { useMemo } from 'react';
import { Dices, Eye, EyeOff } from 'lucide-react';
import { useParameters } from '../../../context/ParameterContext.jsx';
import { useMidi } from '../../../context/MidiContext.jsx';
import { computeInitialNodes } from '../../../utils/nodeUtils.js';
import { buildLayerParamIds } from '../../../utils/paramAliases.js';
import { buildMidiRandomizeId } from '../../../hooks/useMidiTrigger.js';
import { useInspectorTargeting } from '../useInspectorTargeting.js';
import LayerParameterControl from '../LayerParameterControl.jsx';
import ParameterRow from '../ParameterRow.jsx';
import LimitsFields from '../LimitsFields.jsx';
import MidiMappingRow from '../modulation/MidiMappingRow.jsx';
import AudioMappingRow from '../modulation/AudioMappingRow.jsx';
import BpmMappingRow from '../modulation/BpmMappingRow.jsx';

const wrap180 = value => ((((value + 180) % 360) + 360) % 360) - 180;

// A layer whose shape was deleted comes back as a regular polygon when edited.
const reviveDeletedShape = (layer) => {
  if (!layer?.shapeDeleted) return layer;
  const sides = Math.max(3, Math.round(Number(layer?.numSides) || 6));
  const nodes = (Array.isArray(layer?.nodes) && layer.nodes.length >= 3 ? layer.nodes : computeInitialNodes(sides)).map(node => ({ ...node }));
  return { ...layer, shapeDeleted: false, blankLayer: false, layerType: 'shape', pathMode: 'closed', pathClosed: false, nodes, subpaths: [], subpathStyles: [], subpathGroups: [], numSides: nodes.length, syncNodesToNumSides: false };
};

export default function ShapeSection({ props }) {
  const { parameters = [], updateParameter } = useParameters() || {};
  const midi = useMidi() || {};
  const { targetMode, buildTargetSet, applyTargetedUpdate } = useInspectorTargeting(props);
  const layer = props.currentLayer;
  const shapeParams = useMemo(() => parameters.filter(param => param.showInOverlay && param.group === 'Shape'), [parameters]);
  const rotationMeta = parameters.find(param => param.id === 'rotation') || {};
  const rotationMin = Number.isFinite(rotationMeta.randomMin) ? rotationMeta.randomMin : -180;
  const rotationMax = Number.isFinite(rotationMeta.randomMax) ? rotationMeta.randomMax : 180;
  const rotationAliases = useMemo(() => buildLayerParamIds(layer, 'rotation', props.selectedLayerIndex), [layer, props.selectedLayerIndex]);
  const rotationTrigger = buildMidiRandomizeId('rotation');

  const revivingUpdate = patch => props.updateCurrentLayer?.(reviveDeletedShape({ ...(layer || {}), ...(patch || {}) }));
  const revivingSetLayers = update => props.setLayers?.(prev => {
    const next = typeof update === 'function' ? update(prev) : update;
    return Array.isArray(next) ? next.map((item, index) => (prev?.[index]?.shapeDeleted && item?.shapeDeleted ? reviveDeletedShape(item) : item)) : next;
  });
  const setRotation = value => applyTargetedUpdate(item => reviveDeletedShape({ ...item, rotation: wrap180(Number(value) || 0) }));
  const randomizeRotation = () => setRotation(Math.min(rotationMin, rotationMax) + Math.random() * Math.abs(rotationMax - rotationMin));
  const visible = layer?.visible !== false;
  const key = `${layer?.id || 'none'}-${props.editTarget?.type || 'single'}-${props.editTarget?.groupId || ''}`;

  return (
    <section className="insp-section">
      <div className="insp-section-head">
        <h3>Geometry</h3>
        <button type="button" className={`insp-chip${visible ? '' : ' off'}`} aria-pressed={visible} onClick={() => applyTargetedUpdate({ visible: !visible })} aria-label={visible ? 'Hide layer' : 'Show layer'} title={visible ? 'Hide layer' : 'Show layer'}>
          {visible ? <Eye size={14} /> : <EyeOff size={14} />} {visible ? 'Visible' : 'Hidden'}
        </button>
      </div>
      <div className="param-list">
      {shapeParams.map(param => (
        <LayerParameterControl key={`${param.id}-${key}`} param={param} currentLayer={layer} updateLayer={revivingUpdate} setLayers={revivingSetLayers}
          buildTargetSet={buildTargetSet} targetMode={targetMode} editTarget={props.editTarget} selectedLayerIndex={props.selectedLayerIndex} />
      ))}
      {layer?.layerType === 'shape' && (
        <ParameterRow
          id="rotation" label="Rotation" value={Number(layer?.rotation ?? 0)} min={-180} max={180} step={1} precision={0} defaultValue={0}
          sliderKey={`rotation-${key}`} onChange={setRotation}
          included={!!props.getIsRnd?.('rotation')} onIncludedChange={next => props.setIsRnd?.('rotation', next)}
          randomMin={rotationMin} randomMax={rotationMax}
          onRandomMinChange={next => updateParameter?.('rotation', 'randomMin', Math.min(next, rotationMax))}
          onRandomMaxChange={next => updateParameter?.('rotation', 'randomMax', Math.max(next, rotationMin))}
          mapped={[midi.mappings && rotationAliases.some(id => midi.mappings[id]) ? 'midi' : null].filter(Boolean)}
          listening={rotationAliases.includes(midi.learnParamId) || midi.learnParamId === rotationTrigger}
          details={<>
            <div className="popover-actions">
              <button type="button" className="mod-btn primary" onClick={randomizeRotation}><Dices size={14} /> Randomise now</button>
              {midi.supported && <MidiMappingRow paramId={rotationTrigger} label="Trigger" />}
            </div>
            <LimitsFields min={-180} max={180} step={1} randomMin={rotationMin} randomMax={rotationMax}
              onRandomMin={next => updateParameter?.('rotation', 'randomMin', Math.min(next, rotationMax))}
              onRandomMax={next => updateParameter?.('rotation', 'randomMax', Math.max(next, rotationMin))} />
            <div className="mod-stack">
              <MidiMappingRow paramId={rotationAliases[0]} paramAliases={rotationAliases} />
              <AudioMappingRow paramId={rotationAliases[0]} paramAliases={rotationAliases} min={-180} max={180} />
              <BpmMappingRow paramId={rotationAliases[0]} paramAliases={rotationAliases} min={-180} max={180} />
            </div>
          </>}
        />
      )}
      </div>
    </section>
  );
}
