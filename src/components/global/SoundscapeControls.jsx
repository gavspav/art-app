import React, { useEffect, useRef, useState } from 'react';
import { Download, Play, Plus, RotateCcw, Save, Trash2, Upload, Volume2, VolumeX } from 'lucide-react';
import { SOUNDSCAPE_DESTINATIONS, SOUNDSCAPE_SOURCES } from '../../constants/soundscapeParams.js';
import { useSoundscape } from '../../context/SoundscapeContext.jsx';

const Slider = ({ label, value, min = 0, max = 1, step = 0.01, onChange }) => (
  <label className="compact-label" style={{ display: 'grid', gridTemplateColumns: '9rem 1fr 3.25rem', gap: '0.5rem', alignItems: 'center' }}>
    <span>{label}</span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={event => onChange(Number(event.target.value))} />
    <span>{Number(value).toFixed(step >= 1 ? 0 : 2)}</span>
  </label>
);

const Meter = ({ label, value }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '8.5rem 1fr 3rem', gap: '0.4rem', alignItems: 'center', marginBottom: '0.25rem' }}>
    <span className="compact-label">{label}</span>
    <div style={{ height: '0.45rem', background: '#343434', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${Math.max(0, Math.min(1, Number(value) || 0)) * 100}%`, background: '#38bdf8' }} />
    </div>
    <span className="compact-label">{Number(value || 0).toFixed(2)}</span>
  </div>
);

const tabButtonStyle = active => ({
  borderBottom: active ? '2px solid #38bdf8' : '2px solid transparent',
  opacity: active ? 1 : 0.7,
});

const SoundscapeControls = () => {
  const sound = useSoundscape();
  const [activeSection, setActiveSection] = useState('programs');
  const [patchName, setPatchName] = useState('');
  const [newSource, setNewSource] = useState('speed');
  const [newDestination, setNewDestination] = useState('bpm');
  const importRef = useRef(null);
  const setLiveMonitoring = sound?.setLiveMonitoring;
  useEffect(() => {
    setLiveMonitoring?.(true);
    return () => setLiveMonitoring?.(false);
  }, [setLiveMonitoring]);
  if (!sound) return null;
  const { config, liveValues } = sound;
  const update = patch => sound.setConfig(previous => ({ ...previous, ...patch }));

  const exportPatch = () => {
    const blob = new Blob([JSON.stringify(sound.getSoundscapeSnapshot(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${patchName.trim() || 'soundscape'}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importPatch = async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      sound.applySoundscapeSnapshot(JSON.parse(await file.text()));
    } catch (error) {
      console.warn('[Soundscape] Failed to import sound patch', error);
    }
    event.target.value = '';
  };

  return (
    <div className="tab-content global-tab">
      <div className="compact-row" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        <button type="button" className="icon-btn" onClick={sound.started ? sound.stop : sound.start} title={sound.started ? 'Mute soundscape' : 'Start soundscape'}>
          {sound.started ? <VolumeX size={18} /> : <Play size={18} />}
        </button>
        <label className="compact-label">
          <input type="checkbox" checked={config.enabled} onChange={event => update({ enabled: event.target.checked })} /> Enabled
        </label>
        <span style={{ opacity: 0.7 }}>{sound.started ? 'Soundscape running' : 'Soundscape stopped'}</span>
        {sound.startError && <span style={{ color: '#fca5a5' }}>{sound.startError}</span>}
      </div>

      <div className="compact-row" style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.8rem' }}>
        {['programs', 'routing', 'mix', 'presets'].map(section => (
          <button
            type="button"
            className="compact-button"
            style={tabButtonStyle(activeSection === section)}
            onClick={() => setActiveSection(section)}
            key={section}
          >
            {section[0].toUpperCase() + section.slice(1)}
          </button>
        ))}
      </div>

      {activeSection === 'programs' && (
        <div className="control-card">
          <h3 style={{ margin: '0 0 0.6rem' }}>Current palette program</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '9rem minmax(10rem, 18rem)', gap: '0.5rem', alignItems: 'center' }}>
            <span className="compact-label">Palette identity</span>
            <code style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={liveValues.paletteIdentity}>{liveValues.paletteIdentity || 'Waiting for visual state'}</code>
            <span className="compact-label">Sound program</span>
            <select
              className="compact-select"
              value={liveValues.programId || ''}
              disabled={!liveValues.paletteIdentity}
              onChange={event => sound.assignPaletteProgram(liveValues.paletteIdentity, event.target.value)}
            >
              {!liveValues.programId && <option value="">Generated</option>}
              {Object.entries(sound.programs).map(([id, program]) => <option value={id} key={id}>{program.name}</option>)}
            </select>
          </div>
          <h3 style={{ margin: '1rem 0 0.6rem' }}>Live visual sources</h3>
          {Object.entries(SOUNDSCAPE_SOURCES).map(([key, source]) => (
            <Meter key={key} label={source.label} value={liveValues.sources?.[key]} />
          ))}
        </div>
      )}

      {activeSection === 'routing' && (
        <div className="control-card">
          <h3 style={{ margin: '0 0 0.6rem' }}>Continuous routes</h3>
          <div className="compact-row" style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
            <select className="compact-select" value={newSource} onChange={event => setNewSource(event.target.value)}>
              {Object.entries(SOUNDSCAPE_SOURCES).map(([key, source]) => <option value={key} key={key}>{source.label}</option>)}
            </select>
            <span>to</span>
            <select className="compact-select" value={newDestination} onChange={event => setNewDestination(event.target.value)}>
              {Object.entries(SOUNDSCAPE_DESTINATIONS).map(([key, destination]) => <option value={key} key={key}>{destination.label}</option>)}
            </select>
            <button
              type="button"
              className="icon-btn sm"
              title="Add route"
              onClick={() => {
                const destination = SOUNDSCAPE_DESTINATIONS[newDestination];
                sound.addRoute({ source: newSource, dest: newDestination, outMin: destination.min, outMax: destination.max });
              }}
            >
              <Plus size={15} />
            </button>
          </div>
          {config.routes.map(route => {
            const destination = SOUNDSCAPE_DESTINATIONS[route.dest];
            return (
              <div key={route.id} style={{ borderTop: '1px solid #444', padding: '0.5rem 0', marginBottom: '0.2rem' }}>
                <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
                  <label className="compact-label"><input type="checkbox" checked={route.enabled} onChange={event => sound.updateRoute(route.id, { enabled: event.target.checked })} /> On</label>
                  <select className="compact-select" value={route.source} onChange={event => sound.updateRoute(route.id, { source: event.target.value })}>
                    {Object.entries(SOUNDSCAPE_SOURCES).map(([key, source]) => <option value={key} key={key}>{source.label}</option>)}
                  </select>
                  <span>to</span>
                  <select className="compact-select" value={route.dest} onChange={event => {
                    const next = SOUNDSCAPE_DESTINATIONS[event.target.value];
                    sound.updateRoute(route.id, { dest: event.target.value, outMin: next.min, outMax: next.max });
                  }}>
                    {Object.entries(SOUNDSCAPE_DESTINATIONS).map(([key, item]) => <option value={key} key={key}>{item.label}</option>)}
                  </select>
                  <button type="button" className="icon-btn sm" title="Delete route" onClick={() => sound.deleteRoute(route.id)}><Trash2 size={14} /></button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(6.5rem, 1fr))', gap: '0.35rem' }}>
                  <label className="compact-label">In min<input className="compact-input" type="number" min="0" max="1" step="0.05" value={route.inMin} onChange={event => sound.updateRoute(route.id, { inMin: Number(event.target.value) })} /></label>
                  <label className="compact-label">In max<input className="compact-input" type="number" min="0" max="1" step="0.05" value={route.inMax} onChange={event => sound.updateRoute(route.id, { inMax: Number(event.target.value) })} /></label>
                  <label className="compact-label">Out min<input className="compact-input" type="number" step={destination.step} value={route.outMin} onChange={event => sound.updateRoute(route.id, { outMin: Number(event.target.value) })} /></label>
                  <label className="compact-label">Out max<input className="compact-input" type="number" step={destination.step} value={route.outMax} onChange={event => sound.updateRoute(route.id, { outMax: Number(event.target.value) })} /></label>
                  <label className="compact-label">Curve<select className="compact-select" value={route.curve} onChange={event => sound.updateRoute(route.id, { curve: event.target.value })}><option value="linear">Linear</option><option value="exp">Exp</option><option value="log">Log</option></select></label>
                  <label className="compact-label">Depth<input className="compact-input" type="number" min="0" max="1" step="0.05" value={route.depth} onChange={event => sound.updateRoute(route.id, { depth: Number(event.target.value) })} /></label>
                  <label className="compact-label">Smooth<input className="compact-input" type="number" min="0.05" max="2" step="0.05" value={route.smoothing} onChange={event => sound.updateRoute(route.id, { smoothing: Number(event.target.value) })} /></label>
                  <label className="compact-label"><input type="checkbox" checked={route.invert} onChange={event => sound.updateRoute(route.id, { invert: event.target.checked })} /> Invert</label>
                </div>
              </div>
            );
          })}
          <h3 style={{ margin: '1rem 0 0.6rem' }}>Resolved destinations</h3>
          {Object.entries(SOUNDSCAPE_DESTINATIONS).map(([key, destination]) => {
            const value = liveValues.destinations?.[key];
            const normalized = (Number(value) - destination.min) / Math.max(0.0001, destination.max - destination.min);
            return <Meter key={key} label={destination.label} value={normalized} />;
          })}
        </div>
      )}

      {activeSection === 'mix' && (
        <div className="control-card">
          <h3 style={{ margin: '0 0 0.6rem' }}><Volume2 size={16} style={{ verticalAlign: 'text-bottom' }} /> Mix</h3>
          <Slider label="Master volume" value={config.masterVolume} onChange={value => update({ masterVolume: value })} />
          <Slider label="Ambient level" value={config.ambientLevel} onChange={value => update({ ambientLevel: value })} />
          <Slider label="Layer pad level" value={config.pulseLevel} onChange={value => update({ pulseLevel: value })} />
          <Slider label="Voice limit" value={config.voiceLimit} min={1} max={12} step={1} onChange={value => update({ voiceLimit: value })} />
          <Slider label="Default smoothing" value={config.smoothing} min={0.08} max={1.5} step={0.01} onChange={value => update({ smoothing: value })} />
          <h3 style={{ margin: '1rem 0 0.6rem' }}>Bounce accents</h3>
          <label className="compact-label">
            <input type="checkbox" checked={config.collisionEnabled} onChange={event => update({ collisionEnabled: event.target.checked })} /> Enabled
          </label>
          <Slider label="Collision level" value={config.collisionLevel} onChange={value => update({ collisionLevel: value })} />
          <Slider label="Cooldown (ms)" value={config.collisionCooldownMs} min={60} max={800} step={10} onChange={value => update({ collisionCooldownMs: value })} />
          <button type="button" className="compact-button" onClick={() => sound.triggerCollision({ layerId: 'audition', speed: 5 })}>Audition bounce</button>
        </div>
      )}

      {activeSection === 'presets' && (
        <div className="control-card">
          <h3 style={{ margin: '0 0 0.6rem' }}>Sound patches</h3>
          <div className="compact-row" style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input className="compact-input" value={patchName} onChange={event => setPatchName(event.target.value)} placeholder="Patch name" />
            <button type="button" className="icon-btn sm" title="Save sound patch" onClick={() => sound.savePatch(patchName)}><Save size={15} /></button>
            <button type="button" className="icon-btn sm" title="Export sound patch" onClick={exportPatch}><Download size={15} /></button>
            <button type="button" className="icon-btn sm" title="Import sound patch" onClick={() => importRef.current?.click()}><Upload size={15} /></button>
            <button type="button" className="icon-btn sm" title="Reset sound settings" onClick={sound.resetConfig}><RotateCcw size={15} /></button>
            <input ref={importRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={importPatch} />
          </div>
          {Object.keys(sound.patches).map(name => (
            <div key={name} className="compact-row" style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginTop: '0.35rem' }}>
              <button type="button" className="compact-button" onClick={() => sound.applyPatch(name)}>{name}</button>
              <button type="button" className="icon-btn sm" title={`Delete ${name}`} onClick={() => sound.deletePatch(name)}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SoundscapeControls;
