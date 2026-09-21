import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAudioReactive } from '../../../context/AudioContext.jsx';
import { useBPM } from '../../../context/BPMContext.jsx';
import { useMidi } from '../../../context/MidiContext.jsx';
import BPMEnvelopeEditor, { DEFAULT_ENVELOPE } from '../../common/BPMEnvelopeEditor.jsx';
import { findFirstMappedParamId, resolveParamIds } from '../../../utils/paramAliases.js';

const readEnvelopeOpen = (paramId) => {
  try { return window.localStorage.getItem(`bpm-env-open-${paramId}`) === 'true'; } catch { return false; }
};

// Tempo-synced modulation. Enabling BPM clears MIDI and audio on the same aliases.
export default function BpmMappingRow({ paramId, paramAliases = null, min = 0, max = 1 }) {
  const bpm = useBPM();
  const audio = useAudioReactive();
  const midi = useMidi();
  const [showEnvelope, setShowEnvelope] = useState(() => typeof window !== 'undefined' && readEnvelopeOpen(paramId));
  const [playhead, setPlayhead] = useState(null);

  const hasBpm = !!bpm;
  const mappings = useMemo(() => (bpm?.mappings && typeof bpm.mappings === 'object' ? bpm.mappings : {}), [bpm?.mappings]);
  const setMapping = bpm?.setMapping;
  const ids = useMemo(() => resolveParamIds(paramId, paramAliases), [paramAliases, paramId]);
  const primaryId = ids[0] || paramId;
  const activeId = useMemo(() => findFirstMappedParamId(mappings, ids), [mappings, ids]);
  const mapping = activeId ? mappings?.[activeId] : null;
  const enabled = !!mapping?.enabled;
  const speed = mapping?.speed || 1;
  const loopMode = mapping?.loopMode || 'forward';
  const envelope = mapping?.envelope || DEFAULT_ENVELOPE;
  const defaultRange = useMemo(() => ({ outputMin: min, outputMax: max }), [max, min]);

  const commit = useCallback((next) => {
    if (!hasBpm || typeof setMapping !== 'function' || !primaryId) return;
    setMapping(primaryId, next);
    ids.forEach(id => { if (id && id !== primaryId) bpm?.clearMapping?.(id); });
  }, [bpm, hasBpm, ids, primaryId, setMapping]);

  useEffect(() => {
    if (!hasBpm || !showEnvelope || !bpm?.isPlaying || !bpm?.getPhaseForParam) return undefined;
    let frame;
    const tick = () => { setPlayhead(bpm.getPhaseForParam(activeId || primaryId)); frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [activeId, bpm, hasBpm, primaryId, showEnvelope]);
  useEffect(() => {
    try { window.localStorage.setItem(`bpm-env-open-${primaryId}`, showEnvelope ? 'true' : 'false'); } catch { /* ignore */ }
  }, [primaryId, showEnvelope]);

  // Keep a stored range in step with the parameter's current bounds.
  useEffect(() => {
    if (!hasBpm || typeof setMapping !== 'function' || !mapping?.enabled || !mapping?.range) return;
    if (mapping.range.outputMin !== min || mapping.range.outputMax !== max) commit({ ...mapping, range: defaultRange });
  }, [commit, defaultRange, hasBpm, mapping, max, min, setMapping]);

  const toggle = () => {
    commit({ enabled: !enabled, speed, loopMode, range: defaultRange, envelope });
    if (!enabled) {
      ids.forEach(id => {
        midi?.clearMapping?.(id);
        audio?.setMapping?.(id, { band: 'none', range: audio.DEFAULT_RANGE || { outputMin: 0, outputMax: 1 } });
      });
    }
  };

  if (!hasBpm) return null;
  return (
    <div className="mod-block">
      <div className="mod-row">
        <span className="mod-row-label">Tempo</span>
        <button type="button" className={`mod-btn${enabled ? ' active' : ''}`} aria-pressed={enabled} onClick={toggle}>{enabled ? 'On' : 'Off'}</button>
        {enabled && <>
          <select className="mod-select" value={speed} onChange={event => commit({ enabled, speed: Number(event.target.value), loopMode, range: defaultRange, envelope })} aria-label="Beat speed">
            {(bpm.BEAT_SPEEDS || []).map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <select className="mod-select" value={loopMode} onChange={event => commit({ enabled, speed, loopMode: event.target.value, range: defaultRange, envelope })} aria-label="Loop mode">
            {(bpm.LOOP_MODES || []).map(item => <option key={item} value={item}>{item.charAt(0).toUpperCase() + item.slice(1)}</option>)}
          </select>
          <button type="button" className={`mod-btn${showEnvelope ? ' active' : ''}`} onClick={() => setShowEnvelope(value => !value)}>Curve</button>
        </>}
      </div>
      {showEnvelope && enabled && <div className="mod-sub">
        <BPMEnvelopeEditor envelope={envelope} onChange={next => commit({ enabled, speed, loopMode, range: defaultRange, envelope: next })} beatsPerBar={bpm.beatsPerBar || 4} playheadPosition={playhead} />
      </div>}
    </div>
  );
}
