import React, { useState } from 'react';
import { Play, RotateCcw, Save, Trash2, Volume2, VolumeX } from 'lucide-react';
import { useSoundscape } from '../../context/SoundscapeContext.jsx';

const Slider = ({ label, value, min = 0, max = 1, step = 0.01, onChange }) => (
  <label className="compact-label" style={{ display: 'grid', gridTemplateColumns: '9rem 1fr 3.25rem', gap: '0.5rem', alignItems: 'center' }}>
    <span>{label}</span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={event => onChange(Number(event.target.value))} />
    <span>{Number(value).toFixed(step >= 1 ? 0 : 2)}</span>
  </label>
);

const MAPPING_LABELS = {
  palette: 'Palette character',
  background: 'Background drone',
  speed: 'Speed to tempo',
  layers: 'Layers to voices',
  size: 'Size to reverb',
  opacity: 'Opacity to volume',
  noise: 'Noise to distortion',
  blend: 'Blend compression',
  curviness: 'Curviness to filter',
  wobble: 'Wobble modulation',
  sides: 'Sides complexity',
};

const SoundscapeControls = () => {
  const sound = useSoundscape();
  const [patchName, setPatchName] = useState('');
  const [paletteOverrideIndex, setPaletteOverrideIndex] = useState('');
  const [paletteOverrideOscillator, setPaletteOverrideOscillator] = useState('triangle');
  const [backgroundOverrideColor, setBackgroundOverrideColor] = useState('#000000');
  const [backgroundRootOffset, setBackgroundRootOffset] = useState(0);
  if (!sound) return null;
  const { config } = sound;
  const update = patch => sound.setConfig(previous => ({ ...previous, ...patch }));
  const updateMapping = (key, value) => sound.setConfig(previous => ({
    ...previous,
    mappings: { ...previous.mappings, [key]: value },
  }));
  const updateMappingRange = (key, patch) => sound.setConfig(previous => ({
    ...previous,
    mappingRanges: {
      ...previous.mappingRanges,
      [key]: { ...previous.mappingRanges[key], ...patch },
    },
  }));

  return (
    <div className="tab-content global-tab">
      <div className="control-card">
        <div className="compact-row" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem' }}>
          <button type="button" className="icon-btn" onClick={sound.started ? sound.stop : sound.start} title={sound.started ? 'Mute soundscape' : 'Start soundscape'}>
            {sound.started ? <VolumeX size={18} /> : <Play size={18} />}
          </button>
          <label className="compact-label">
            <input type="checkbox" checked={config.enabled} onChange={event => update({ enabled: event.target.checked })} /> Enabled
          </label>
          <span style={{ opacity: 0.7 }}>{sound.started ? 'Soundscape running' : 'Soundscape stopped'}</span>
          {sound.startError && <span style={{ color: '#fca5a5' }}>{sound.startError}</span>}
        </div>

        <h3 style={{ margin: '0 0 0.6rem' }}><Volume2 size={16} style={{ verticalAlign: 'text-bottom' }} /> Mix</h3>
        <Slider label="Master volume" value={config.masterVolume} onChange={value => update({ masterVolume: value })} />
        <Slider label="Ambient level" value={config.ambientLevel} onChange={value => update({ ambientLevel: value })} />
        <Slider label="Layer pad level" value={config.pulseLevel} onChange={value => update({ pulseLevel: value })} />
        <Slider label="Voice limit" value={config.voiceLimit} min={1} max={12} step={1} onChange={value => update({ voiceLimit: value })} />
        <Slider label="Smoothing" value={config.smoothing} min={0.08} max={1.5} step={0.01} onChange={value => update({ smoothing: value })} />

        <h3 style={{ margin: '1rem 0 0.6rem' }}>Visual mappings</h3>
        {Object.entries(MAPPING_LABELS).map(([key, label]) => (
          <div key={key} style={{ display: 'grid', gridTemplateColumns: '9rem 1fr 3rem 4rem 4rem 4rem', gap: '0.35rem', alignItems: 'center', marginBottom: '0.25rem' }}>
            <span className="compact-label">{label}</span>
            <input type="range" min="0" max="1" step="0.01" value={config.mappings[key]} onChange={event => updateMapping(key, Number(event.target.value))} />
            <span>{Number(config.mappings[key]).toFixed(2)}</span>
            <input className="compact-input" type="number" min="0" max="1" step="0.05" value={config.mappingRanges[key].min} title={`${label} output minimum`} onChange={event => updateMappingRange(key, { min: Number(event.target.value) })} />
            <input className="compact-input" type="number" min="0" max="1" step="0.05" value={config.mappingRanges[key].max} title={`${label} output maximum`} onChange={event => updateMappingRange(key, { max: Number(event.target.value) })} />
            <label className="compact-label"><input type="checkbox" checked={config.mappingRanges[key].invert} onChange={event => updateMappingRange(key, { invert: event.target.checked })} /> Inv</label>
          </div>
        ))}

        <h3 style={{ margin: '1rem 0 0.6rem' }}>Bounce accents</h3>
        <label className="compact-label">
          <input type="checkbox" checked={config.collisionEnabled} onChange={event => update({ collisionEnabled: event.target.checked })} /> Enabled
        </label>
        <Slider label="Collision level" value={config.collisionLevel} onChange={value => update({ collisionLevel: value })} />
        <Slider label="Cooldown (ms)" value={config.collisionCooldownMs} min={60} max={800} step={10} onChange={value => update({ collisionCooldownMs: value })} />
        <button type="button" className="compact-button" onClick={() => sound.triggerCollision({ layerId: 'audition', speed: 5 })}>Audition bounce</button>

        <h3 style={{ margin: '1rem 0 0.6rem' }}>Generated sound overrides</h3>
        <div className="compact-row" style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input className="compact-input" value={paletteOverrideIndex} onChange={event => setPaletteOverrideIndex(event.target.value)} placeholder="Palette index" />
          <select className="compact-select" value={paletteOverrideOscillator} onChange={event => setPaletteOverrideOscillator(event.target.value)}>
            <option value="sine">Sine</option>
            <option value="triangle">Triangle</option>
            <option value="fatsawtooth">Wide saw</option>
            <option value="square">Square</option>
          </select>
          <button
            type="button"
            className="compact-button"
            onClick={() => sound.setConfig(previous => ({
              ...previous,
              paletteOverrides: {
                ...previous.paletteOverrides,
                [paletteOverrideIndex]: { oscillator: paletteOverrideOscillator },
              },
            }))}
            disabled={!paletteOverrideIndex.trim()}
          >
            Set palette override
          </button>
        </div>
        <div className="compact-row" style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.4rem' }}>
          <input type="color" value={backgroundOverrideColor} onChange={event => setBackgroundOverrideColor(event.target.value)} title="Background override colour" />
          <input className="compact-input" type="number" min="-12" max="12" step="1" value={backgroundRootOffset} onChange={event => setBackgroundRootOffset(Number(event.target.value))} />
          <button
            type="button"
            className="compact-button"
            onClick={() => sound.setConfig(previous => ({
              ...previous,
              backgroundOverrides: {
                ...previous.backgroundOverrides,
                [backgroundOverrideColor.toLowerCase()]: { rootOffset: backgroundRootOffset },
              },
            }))}
          >
            Set background pitch
          </button>
        </div>

        <h3 style={{ margin: '1rem 0 0.6rem' }}>Sound patches</h3>
        <div className="compact-row" style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <input className="compact-input" value={patchName} onChange={event => setPatchName(event.target.value)} placeholder="Patch name" />
          <button type="button" className="icon-btn sm" title="Save sound patch" onClick={() => sound.savePatch(patchName)}><Save size={15} /></button>
          <button type="button" className="icon-btn sm" title="Reset sound settings" onClick={sound.resetConfig}><RotateCcw size={15} /></button>
        </div>
        {Object.keys(sound.patches).map(name => (
          <div key={name} className="compact-row" style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginTop: '0.35rem' }}>
            <button type="button" className="compact-button" onClick={() => sound.applyPatch(name)}>{name}</button>
            <button type="button" className="icon-btn sm" title={`Delete ${name}`} onClick={() => sound.deletePatch(name)}><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SoundscapeControls;
