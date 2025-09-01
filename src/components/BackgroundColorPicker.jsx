import React from 'react';
import { useMidi } from '../context/MidiContext.jsx';

const BackgroundColorPicker = ({ color, onChange, compact = false, hideLabel = false, inline = false, showMidi = false }) => {
  const {
    supported: midiSupported,
    mappings: midiMappings,
    beginLearn,
    clearMapping,
    mappingLabel,
    learnParamId,
  } = useMidi() || {};

  const idR = 'backgroundColorR';
  const idG = 'backgroundColorG';
  const idB = 'backgroundColorB';
  if (compact) {
    if (inline) {
      return (
        <div className="bg-compact-wrap" title="Background colour">
          <input
            className="bgcolor-mini"
            type="color"
            value={color}
            onChange={(e) => onChange(e.target.value)}
            aria-label="Background colour"
            title="Background colour"
          />
          {/* MIDI mini controls (inline) */}
          {showMidi && (
            <div style={{ display: 'flex', gap: '0.25rem', marginLeft: '0.4rem', alignItems: 'center' }}>
              <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); beginLearn && beginLearn(idR); }} disabled={!midiSupported} title={`Learn MIDI for BG Red${midiSupported ? '' : ' (not supported)'}`}>R</button>
              <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); beginLearn && beginLearn(idG); }} disabled={!midiSupported} title={`Learn MIDI for BG Green${midiSupported ? '' : ' (not supported)'}`}>G</button>
              <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); beginLearn && beginLearn(idB); }} disabled={!midiSupported} title={`Learn MIDI for BG Blue${midiSupported ? '' : ' (not supported)'}`}>B</button>
              <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); clearMapping && clearMapping(idR); }} disabled={!midiSupported || !midiMappings?.[idR]} title="Clear R">✕R</button>
              <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); clearMapping && clearMapping(idG); }} disabled={!midiSupported || !midiMappings?.[idG]} title="Clear G">✕G</button>
              <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); clearMapping && clearMapping(idB); }} disabled={!midiSupported || !midiMappings?.[idB]} title="Clear B">✕B</button>
            </div>
          )}
        </div>
      );
    }
    return (
      <div className="bg-compact-wrap" title="Background colour">
        {!hideLabel && <span className="bg-label">BG</span>}
        <input
          className="bgcolor-mini"
          type="color"
          value={color}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Background colour"
        />
        {/* MIDI mini controls */}
        {showMidi && (
          <div style={{ display: 'flex', gap: '0.25rem', marginLeft: '0.4rem', alignItems: 'center' }}>
            <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); beginLearn && beginLearn(idR); }} disabled={!midiSupported} title={`Learn MIDI for BG Red${midiSupported ? '' : ' (not supported)'}`}>R</button>
            <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); beginLearn && beginLearn(idG); }} disabled={!midiSupported} title={`Learn MIDI for BG Green${midiSupported ? '' : ' (not supported)'}`}>G</button>
            <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); beginLearn && beginLearn(idB); }} disabled={!midiSupported} title={`Learn MIDI for BG Blue${midiSupported ? '' : ' (not supported)'}`}>B</button>
            <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); clearMapping && clearMapping(idR); }} disabled={!midiSupported || !midiMappings?.[idR]} title="Clear R">✕R</button>
            <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); clearMapping && clearMapping(idG); }} disabled={!midiSupported || !midiMappings?.[idG]} title="Clear G">✕G</button>
            <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); clearMapping && clearMapping(idB); }} disabled={!midiSupported || !midiMappings?.[idB]} title="Clear B">✕B</button>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className={`control-group`}>
      <label>Background Color</label>
      <input
        type="color"
        value={color}
        onChange={(e) => onChange(e.target.value)}
      />
      {/* MIDI status and actions */}
      <div style={{ marginTop: '0.35rem', paddingTop: '0.35rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '0.9rem', opacity: 0.9 }}>
            <strong>MIDI</strong>
            <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>
              R: {(!midiSupported) ? 'N/A' : (midiMappings && midiMappings[idR] ? (mappingLabel ? mappingLabel(midiMappings[idR]) : 'Mapped') : 'Not mapped')}
              {learnParamId === idR && midiSupported && <span style={{ marginLeft: '0.35rem', color: '#4fc3f7' }}>Listening…</span>}
            </div>
            <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>
              G: {(!midiSupported) ? 'N/A' : (midiMappings && midiMappings[idG] ? (mappingLabel ? mappingLabel(midiMappings[idG]) : 'Mapped') : 'Not mapped')}
              {learnParamId === idG && midiSupported && <span style={{ marginLeft: '0.35rem', color: '#4fc3f7' }}>Listening…</span>}
            </div>
            <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>
              B: {(!midiSupported) ? 'N/A' : (midiMappings && midiMappings[idB] ? (mappingLabel ? mappingLabel(midiMappings[idB]) : 'Mapped') : 'Not mapped')}
              {learnParamId === idB && midiSupported && <span style={{ marginLeft: '0.35rem', color: '#4fc3f7' }}>Listening…</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); beginLearn && beginLearn(idR); }} disabled={!midiSupported} title="Learn BG Red">Learn R</button>
            <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); beginLearn && beginLearn(idG); }} disabled={!midiSupported} title="Learn BG Green">Learn G</button>
            <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); beginLearn && beginLearn(idB); }} disabled={!midiSupported} title="Learn BG Blue">Learn B</button>
            <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); clearMapping && clearMapping(idR); }} disabled={!midiSupported || !midiMappings?.[idR]} title="Clear R">Clear R</button>
            <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); clearMapping && clearMapping(idG); }} disabled={!midiSupported || !midiMappings?.[idG]} title="Clear G">Clear G</button>
            <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); clearMapping && clearMapping(idB); }} disabled={!midiSupported || !midiMappings?.[idB]} title="Clear B">Clear B</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BackgroundColorPicker;
