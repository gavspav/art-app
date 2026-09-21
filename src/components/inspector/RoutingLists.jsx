import React, { useMemo } from 'react';
import { Trash2 } from 'lucide-react';
import { useMidi } from '../../context/MidiContext.jsx';
import { useBPM } from '../../context/BPMContext.jsx';
import { useParameters } from '../../context/ParameterContext.jsx';

const GLOBAL_LABELS = {
  globalSpeedMultiplier: 'Speed', globalOpacity: 'Opacity', layersCount: 'Layers', globalPaletteIndex: 'Palette',
  backgroundColor: 'Background', globalBlendMode: 'Blend mode', rotation: 'Rotation', paletteIndex: 'Palette',
  colorFadeSpeed: 'Fade speed', colorR: 'Red', colorG: 'Green', colorB: 'Blue', colorA: 'Alpha',
  currentLayer: 'Layer', layerColors: 'Colours', layerAnimation: 'Movement',
};

// Turn a stored mapping id into "where → what" for the overview lists.
export function describeMappingId(id, layers = [], parameters = []) {
  const paramLabel = key => parameters.find(param => param.id === key)?.label || GLOBAL_LABELS[key] || key;
  const trigger = /^randomize:(.+)$/.exec(id);
  if (trigger) return { target: 'Trigger', param: `Randomise ${paramLabel(trigger[1]).toLowerCase()}`, resolved: true };
  const match = /^layer:([^:]+):(.+)$/.exec(id);
  if (!match) return { target: 'Scene', param: paramLabel(id), resolved: true };
  if (match[1] === 'all') return { target: 'All layers', param: paramLabel(match[2]), resolved: true };
  const layer = layers.find((item, index) => item?.id === match[1] || item?.name === match[1] || String(index + 1) === match[1]);
  return { target: layer?.name || 'Missing layer', param: paramLabel(match[2]), resolved: !!layer };
}

function RoutingList({ title, entries, empty, onClear, onClearAll }) {
  return (
    <section className="insp-section">
      <div className="insp-section-head">
        <h3>{title}</h3>
        {entries.length > 0 && <button type="button" className="insp-chip danger" onClick={onClearAll}><Trash2 size={13} /> Clear all</button>}
      </div>
      {entries.length === 0
        ? <p className="insp-empty">{empty}</p>
        : <ul className="routing-list">
          {entries.map(entry => (
            <li key={entry.id} className={entry.resolved ? '' : 'unresolved'}>
              <span className="routing-source">{entry.source}</span>
              <span className="routing-target">{entry.target} <em>→</em> {entry.param}{!entry.resolved && <small> · target missing</small>}</span>
              <button type="button" className="param-icon" aria-label={`Remove ${entry.param} mapping`} onClick={() => onClear(entry.id)}><Trash2 size={13} /></button>
            </li>
          ))}
        </ul>}
    </section>
  );
}

// Overview of every MIDI and tempo assignment, so nothing has to be hunted for.
export default function RoutingLists({ layers }) {
  const midi = useMidi() || {};
  const bpm = useBPM() || {};
  const { parameters = [] } = useParameters() || {};
  const { mappings: midiMappings, mappingLabel } = midi;
  const { mappings: bpmMappings, BEAT_SPEEDS } = bpm;
  const midiEntries = useMemo(() => Object.entries(midiMappings || {}).map(([id, mapping]) => ({
    id, source: mappingLabel ? mappingLabel(mapping) : 'MIDI', ...describeMappingId(id, layers, parameters),
  })), [layers, mappingLabel, midiMappings, parameters]);
  const bpmEntries = useMemo(() => Object.entries(bpmMappings || {}).filter(([, mapping]) => mapping?.enabled).map(([id, mapping]) => ({
    id, source: `${BEAT_SPEEDS?.find(item => item.value === mapping.speed)?.label || `${mapping.speed}×`} · ${mapping.loopMode || 'forward'}`, ...describeMappingId(id, layers, parameters),
  })), [BEAT_SPEEDS, bpmMappings, layers, parameters]);

  return <>
    {midi.supported && <RoutingList title="MIDI assignments" entries={midiEntries} empty="Nothing assigned. Open a control's details and press Learn."
      onClear={id => midi.clearMapping?.(id)} onClearAll={() => midiEntries.forEach(entry => midi.clearMapping?.(entry.id))} />}
    <RoutingList title="Tempo links" entries={bpmEntries} empty="No controls follow the tempo yet. Turn Tempo on in a control's details."
      onClear={id => bpm.clearMapping?.(id)} onClearAll={() => bpm.clearAllMappings ? bpm.clearAllMappings() : bpmEntries.forEach(entry => bpm.clearMapping?.(entry.id))} />
  </>;
}
