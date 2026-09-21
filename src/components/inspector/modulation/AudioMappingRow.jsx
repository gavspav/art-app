import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAudioReactive } from '../../../context/AudioContext.jsx';
import { useBPM } from '../../../context/BPMContext.jsx';
import { useMidi } from '../../../context/MidiContext.jsx';
import { AUDIO_MAPPING_MODES, DEFAULT_MODE_SETTINGS } from '../../../utils/audioMappingModes.js';
import { AudioModeSettings } from '../../global/sections/GlobalAutomationSections.jsx';
import { findFirstMappedParamId, resolveParamIds } from '../../../utils/paramAliases.js';

const BAND_LABELS = { none: 'None', rms: 'Level', waveformEnergy: 'Wave energy' };
const bandLabel = band => BAND_LABELS[band] || band.charAt(0).toUpperCase() + band.slice(1);

// Audio signal → parameter link. Enabling audio clears MIDI and BPM on the same aliases.
export default function AudioMappingRow({ paramId, paramAliases = null, min = 0, max = 1 }) {
  const audio = useAudioReactive();
  const bpm = useBPM();
  const midi = useMidi();
  const [showRange, setShowRange] = useState(false);
  const [showModeSettings, setShowModeSettings] = useState(false);

  const hasAudio = !!audio;
  const mappings = useMemo(() => (audio?.mappings && typeof audio.mappings === 'object' ? audio.mappings : {}), [audio?.mappings]);
  const setMapping = audio?.setMapping;
  const clearMapping = audio?.clearMapping;
  const AUDIO_BANDS = audio?.AUDIO_BANDS || ['none'];
  const ids = useMemo(() => resolveParamIds(paramId, paramAliases), [paramAliases, paramId]);
  const primaryId = ids[0] || paramId;
  const activeId = useMemo(() => findFirstMappedParamId(mappings, ids), [mappings, ids]);
  const mapping = activeId ? mappings?.[activeId] : null;
  const band = mapping?.band || 'none';
  const defaultRange = { outputMin: min, outputMax: max };
  const range = mapping?.range || defaultRange;
  const mode = mapping?.mode || 'direct';
  const modeSettings = mapping?.modeSettings || DEFAULT_MODE_SETTINGS[mode] || {};

  const commit = useCallback((next) => {
    if (!hasAudio || typeof setMapping !== 'function' || !primaryId) return;
    setMapping(primaryId, next);
    ids.forEach(id => { if (id !== primaryId) clearMapping?.(id); });
  }, [clearMapping, hasAudio, ids, primaryId, setMapping]);

  // Keep a stored range in step with the parameter's current bounds.
  const storedMin = mapping?.range?.outputMin;
  const storedMax = mapping?.range?.outputMax;
  useEffect(() => {
    if (!hasAudio || typeof setMapping !== 'function') return;
    if (band !== 'none' && storedMin !== undefined && storedMax !== undefined && (storedMin !== min || storedMax !== max)) {
      commit({ ...mapping, range: { outputMin: min, outputMax: max } });
    }
  }, [band, commit, hasAudio, mapping, max, min, setMapping, storedMax, storedMin]);

  const setBand = (next) => {
    if (next === 'none') {
      commit({ band: 'none', range, mode, modeSettings });
      return;
    }
    commit({ band: next, range: defaultRange, mode, modeSettings });
    ids.forEach(id => {
      midi?.clearMapping?.(id);
      bpm?.setMapping?.(id, { enabled: false, speed: 1, loopMode: 'forward', range: bpm.DEFAULT_RANGE || { outputMin: 0, outputMax: 1 } });
    });
  };
  const setMode = (next) => {
    commit({ band, range, mode: next, modeSettings: DEFAULT_MODE_SETTINGS[next] || {} });
    if (next !== 'direct') setShowModeSettings(true);
  };

  if (!hasAudio) return null;
  const active = band !== 'none';
  const modeInfo = AUDIO_MAPPING_MODES.find(item => item.value === mode);
  const shaped = active && mode !== 'direct';

  return (
    <div className="mod-block">
      <div className="mod-row">
        <span className="mod-row-label">Audio</span>
        <select className="mod-select" value={band} onChange={event => setBand(event.target.value)} aria-label="Audio signal">
          {AUDIO_BANDS.map(item => <option key={item} value={item}>{bandLabel(item)}</option>)}
        </select>
        {active && <>
          <select className={`mod-select${shaped ? ' shaped' : ''}`} value={mode} onChange={event => setMode(event.target.value)} title={modeInfo?.desc || ''} aria-label="Audio mode">
            {AUDIO_MAPPING_MODES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          {shaped && <button type="button" className={`mod-btn${showModeSettings ? ' active' : ''}`} onClick={() => setShowModeSettings(value => !value)}>Shape</button>}
          <button type="button" className={`mod-btn${showRange ? ' active' : ''}`} onClick={() => setShowRange(value => !value)}>Range</button>
          <button type="button" className="mod-btn" onClick={() => ids.forEach(id => clearMapping?.(id))}>Clear</button>
        </>}
      </div>
      {showModeSettings && shaped && <div className="mod-sub shaped">
        <p>{modeInfo?.desc}</p>
        <AudioModeSettings mode={mode} modeSettings={modeSettings} onSettingsChange={next => commit({ band, range, mode, modeSettings: next })} />
      </div>}
      {showRange && active && <div className="mod-sub mod-range">
        <label>Min<input type="number" step="0.1" value={range.outputMin} onChange={event => commit({ band, range: { ...range, outputMin: parseFloat(event.target.value) || 0 }, mode, modeSettings })} /></label>
        <label>Max<input type="number" step="0.1" value={range.outputMax} onChange={event => commit({ band, range: { ...range, outputMax: parseFloat(event.target.value) || 1 }, mode, modeSettings })} /></label>
      </div>}
    </div>
  );
}
