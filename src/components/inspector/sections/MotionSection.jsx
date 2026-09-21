import React, { useMemo } from 'react';
import { Dices } from 'lucide-react';
import { useParameters } from '../../../context/ParameterContext.jsx';
import { useMidi } from '../../../context/MidiContext.jsx';
import { buildMidiRandomizeId } from '../../../hooks/useMidiTrigger.js';
import { useInspectorTargeting } from '../useInspectorTargeting.js';
import LayerParameterControl from '../LayerParameterControl.jsx';
import ParameterRow from '../ParameterRow.jsx';
import MidiMappingRow from '../modulation/MidiMappingRow.jsx';

export default function MotionSection({ props }) {
  const { parameters = [] } = useParameters() || {};
  const midi = useMidi() || {};
  const { targetMode, buildTargetSet, applyTargetedUpdate } = useInspectorTargeting(props);
  const layer = props.currentLayer;
  const movementParams = useMemo(() => parameters.filter(param => param.showInOverlay && param.group === 'Movement'), [parameters]);
  const trigger = buildMidiRandomizeId('layerAnimation');
  const key = `${layer?.id || 'none'}-${props.editTarget?.type || 'single'}-${props.editTarget?.groupId || ''}`;
  const setOrbit = axis => value => applyTargetedUpdate({ [axis === 'x' ? 'orbitRadiusX' : 'orbitRadiusY']: Math.max(0, Math.min(0.5, Number(value) || 0)) });

  return (
    <section className="insp-section">
      <div className="insp-section-head">
        <h3>Movement</h3>
        <div className="insp-head-actions">
          {midi.supported && <MidiMappingRow paramId={trigger} label="Trigger" />}
          <button type="button" className="insp-chip" onClick={() => props.randomizeAnimationForCurrentLayer?.()} title="Randomise movement for the targeted layers"><Dices size={14} /> Randomise</button>
        </div>
      </div>
      {movementParams.map(param => (
        <LayerParameterControl key={`${param.id}-${key}`} param={param} currentLayer={layer} updateLayer={props.updateCurrentLayer} setLayers={props.setLayers}
          buildTargetSet={buildTargetSet} targetMode={targetMode} editTarget={props.editTarget} selectedLayerIndex={props.selectedLayerIndex} />
      ))}
      {layer?.movementStyle === 'orbit' && <>
        <div className="insp-section-head sub"><h4>Orbit</h4></div>
        <ParameterRow id="orbitRadiusX" label="Radius X" value={Number(layer?.orbitRadiusX ?? 0.15)} min={0} max={0.5} step={0.001} precision={3} sliderKey={`orbitX-${key}`} onChange={setOrbit('x')} />
        <ParameterRow id="orbitRadiusY" label="Radius Y" value={Number(layer?.orbitRadiusY ?? 0.15)} min={0} max={0.5} step={0.001} precision={3} sliderKey={`orbitY-${key}`} onChange={setOrbit('y')} />
      </>}
    </section>
  );
}
