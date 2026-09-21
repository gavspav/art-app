import React, { useMemo } from 'react';
import { useMidi } from '../../../context/MidiContext.jsx';
import { findFirstMappedParamId, resolveParamIds } from '../../../utils/paramAliases.js';

// One line: current MIDI assignment for a parameter, plus Learn / Clear.
export default function MidiMappingRow({ paramId, paramAliases = null, label = 'MIDI' }) {
  const { supported, mappings, beginLearn, clearMapping, mappingLabel, learnParamId } = useMidi() || {};
  const ids = useMemo(() => resolveParamIds(paramId, paramAliases), [paramId, paramAliases]);
  const primaryId = ids[0] || paramId;
  const activeId = findFirstMappedParamId(mappings || {}, ids);
  const mapped = !!(activeId && mappings?.[activeId]);
  const listening = ids.includes(learnParamId);
  if (!supported) return null;

  return (
    <div className="mod-row">
      <span className="mod-row-label">{label}</span>
      <span className={`mod-row-status${mapped ? ' mapped' : ''}${listening ? ' listening' : ''}`}>
        {listening ? 'Move a control…' : mapped ? (mappingLabel ? mappingLabel(mappings[activeId]) : 'Mapped') : 'Unassigned'}
      </span>
      <button type="button" className={`mod-btn${listening ? ' active' : ''}`} onClick={() => beginLearn?.(primaryId)}>Learn</button>
      <button type="button" className="mod-btn" disabled={!mapped} onClick={() => ids.forEach(id => clearMapping?.(id))}>Clear</button>
    </div>
  );
}
