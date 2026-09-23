import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Plus, Trash2, X } from 'lucide-react';
import { useAudioReactive } from '../../context/AudioContext.jsx';
import { useMidi } from '../../context/MidiContext.jsx';
import { useUiPreferences } from '../../context/UiPreferencesContext.jsx';
import StudioGlobalControls from './StudioGlobalControls.jsx';
import LayerStrip from '../inspector/LayerStrip.jsx';
import ShapeSection from '../inspector/sections/ShapeSection.jsx';
import ColourSection from '../inspector/sections/ColourSection.jsx';
import MotionSection from '../inspector/sections/MotionSection.jsx';
import RoutingLists from '../inspector/RoutingLists.jsx';
import {
  AudioReactiveSection,
  AudioSpawnSection,
  BPMSection,
} from '../global/sections/GlobalAutomationSections.jsx';
import '../BottomPanel.css';
import '../inspector/Inspector.css';

const DESTINATIONS = [
  ['radiusFactor', 'Size', 0.05, 1.2],
  ['opacity', 'Opacity', 0, 1],
  ['rotation', 'Rotation', -180, 180],
  ['movementSpeed', 'Movement speed', 0, 8],
  ['wobble', 'Wobble', 0, 1],
  ['noiseAmount', 'Noise', 0, 1],
  ['colorFadeSpeed', 'Colour speed', 0, 3],
];

const SIGNALS = [
  ['rms', 'Level'], ['bass', 'Bass'], ['mids', 'Mids'], ['highs', 'Highs'],
  ['pitch', 'Pitch'], ['transient', 'Transient'], ['beat', 'Beat'],
];

const displayParam = id => DESTINATIONS.find(item => item[0] === id)?.[1] || id;
const displaySignal = id => SIGNALS.find(item => item[0] === id)?.[1] || id;

function AudioLinks({ layers }) {
  const audio = useAudioReactive() || {};
  const activeLinks = useMemo(() => Object.entries(audio.mappings || {}).filter(([, value]) => value?.band && value.band !== 'none'), [audio.mappings]);
  const firstLayer = layers[0];
  const addLink = () => {
    if (!firstLayer || !audio.setMapping) return;
    const paramId = `layer:${firstLayer.id}:radiusFactor`;
    audio.setMapping(paramId, { band: 'bass', range: { outputMin: 0.2, outputMax: 0.9 }, gain: 1 });
  };
  const decode = id => {
    const match = /^layer:([^:]+):(.+)$/.exec(id);
    if (!match) return { target: 'Global', param: displayParam(id), resolved: true };
    const layer = layers.find((item, index) => item?.id === match[1] || item?.name === match[1] || String(index + 1) === match[1]);
    return { target: layer?.name || 'Missing layer', param: displayParam(match[2]), resolved: !!layer };
  };

  return (
    <section className="insp-section audio-links-card">
      <div className="insp-section-head">
        <h3>Audio links</h3>
        <button type="button" className="insp-chip" onClick={addLink} disabled={!firstLayer}><Plus size={14} /> Add link</button>
      </div>
      {activeLinks.length === 0 && <p className="insp-empty">No links yet. Add one here, or open a control's details and pick an audio signal.</p>}
      {activeLinks.map(([id, mapping]) => {
        const decoded = decode(id);
        const range = mapping.range || { outputMin: 0, outputMax: 1 };
        return (
          <details className={`audio-link${decoded.resolved ? '' : ' unresolved'}`} key={id}>
            <summary>
              <span className={`signal-dot signal-${mapping.band}`} />
              <strong>{displaySignal(mapping.band)}</strong><span>→</span>
              <span>{decoded.target}</span><span>→</span><span>{decoded.param}</span>
              {!decoded.resolved && <em>Target missing</em>}
              <ChevronDown size={15} />
            </summary>
            <div className="audio-link-editor">
              <label>Signal<select value={mapping.band} onChange={event => audio.setMapping?.(id, { ...mapping, band: event.target.value })}>
                {SIGNALS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select></label>
              <div className="audio-link-grid">
                <label>Minimum<input type="number" step="0.01" value={range.outputMin} onChange={event => audio.setMapping?.(id, { ...mapping, range: { ...range, outputMin: Number(event.target.value) } })} /></label>
                <label>Maximum<input type="number" step="0.01" value={range.outputMax} onChange={event => audio.setMapping?.(id, { ...mapping, range: { ...range, outputMax: Number(event.target.value) } })} /></label>
                <label>Strength<input type="number" min="0" step="0.1" value={mapping.gain ?? 1} onChange={event => audio.setMapping?.(id, { ...mapping, gain: Number(event.target.value) })} /></label>
              </div>
              <details className="audio-link-advanced"><summary>Processing details</summary>
                <p>Mode: {mapping.mode || 'Direct'}{mapping.trigger?.enabled ? ' · Trigger enabled' : ''}</p>
              </details>
              <button type="button" className="studio-danger" onClick={() => audio.clearMapping?.(id)}><Trash2 size={15} /> Remove link</button>
            </div>
          </details>
        );
      })}
    </section>
  );
}

function SettingsPanel({ props }) {
  const midi = useMidi() || {};
  const { controlStyle, dialLayout, showLabels, setControlStyle, setPreference, resetPreferences } = useUiPreferences();
  return <>
    <section className="insp-section">
      <div className="insp-section-head"><h3>Interface</h3></div>
      <div className="insp-field-row">
        <div className="insp-field grow">Parameter controls
          <div className="scope-toggle">
            <button type="button" className={controlStyle === 'sliders' ? 'active' : ''} aria-pressed={controlStyle === 'sliders'} onClick={() => setControlStyle('sliders')}>Sliders</button>
            <button type="button" className={controlStyle === 'dials' ? 'active' : ''} aria-pressed={controlStyle === 'dials'} onClick={() => setControlStyle('dials')}>Dials</button>
          </div>
        </div>
      </div>
      <div className="insp-field-row">
        <div className="insp-field grow">Dial layout
          <div className="scope-toggle">
            <button type="button" className={dialLayout === 'rows' ? 'active' : ''} aria-pressed={dialLayout === 'rows'} disabled={controlStyle !== 'dials'} onClick={() => setPreference('dialLayout', 'rows')}>Rows</button>
            <button type="button" className={dialLayout === 'grid' ? 'active' : ''} aria-pressed={dialLayout === 'grid'} disabled={controlStyle !== 'dials'} onClick={() => setPreference('dialLayout', 'grid')}>Grid</button>
          </div>
        </div>
      </div>
      <div className="insp-field-row">
        <div className="insp-field grow">Button labels
          <div className="scope-toggle">
            <button type="button" className={!showLabels ? 'active' : ''} aria-pressed={!showLabels} onClick={() => setPreference('showLabels', false)}>Off</button>
            <button type="button" className={showLabels ? 'active' : ''} aria-pressed={showLabels} onClick={() => setPreference('showLabels', true)}>On</button>
          </div>
        </div>
      </div>
      <div className="insp-field-row">
        <button type="button" className="insp-chip" onClick={resetPreferences}>Reset interface</button>
      </div>
    </section>
    <section className="insp-section">
      <div className="insp-section-head"><h3>Canvas</h3></div>
      <div className="insp-field-row">
        <label className="insp-field grow">Random seed<input type="number" value={props.globalSeed ?? 1} onChange={event => props.setGlobalSeed?.(Number(event.target.value))} /></label>
      </div>
      <div className="insp-check-row">
        <label className={`insp-check${props.zIgnore ? ' on' : ''}`}><input type="checkbox" checked={!!props.zIgnore} onChange={event => props.setZIgnore?.(event.target.checked)} />Ignore depth movement</label>
        <label className={`insp-check${props.colorFadeWhileFrozen ? ' on' : ''}`}><input type="checkbox" checked={!!props.colorFadeWhileFrozen} onChange={event => props.setColorFadeWhileFrozen?.(event.target.checked)} />Keep colours fading while paused</label>
      </div>
    </section>
    <section className="insp-section">
      <div className="insp-section-head"><h3>MIDI</h3></div>
      <div className="insp-field-row">
        <label className="insp-field grow">Input<select value={midi.selectedInputId || ''} onChange={event => midi.setSelectedInputId?.(event.target.value)} disabled={!midi.supported}>
          <option value="">{midi.supported ? 'No MIDI input' : 'Web MIDI unavailable in this browser'}</option>
          {(midi.inputs || []).map(input => <option key={input.id} value={input.id}>{input.name || input.id}</option>)}
        </select></label>
      </div>
    </section>
    <RoutingLists layers={props.layers || []} />
  </>;
}

const LAYER_SECTIONS = ['Shape', 'Colour', 'Motion'];

export default function StudioInspector({ activeSection, onClose, props }) {
  const layerSection = LAYER_SECTIONS.includes(activeSection);
  const { controlStyle, dialLayout } = useUiPreferences();
  const gridMode = controlStyle === 'dials' && dialLayout === 'grid';

  const asideRef = useRef(null);
  const dragRef = useRef(null);
  const scrubRowRef = useRef(null);
  const [sheetHeight, setSheetHeight] = useState(null);
  const [scrubbing, setScrubbing] = useState(false);

  const onGripPointerDown = (event) => {
    if (!asideRef.current) return;
    const drag = { startY: event.clientY, startH: asideRef.current.getBoundingClientRect().height };
    dragRef.current = drag;
    const heightAt = (clientY) => Math.min(window.innerHeight - 90, Math.max(140, drag.startH + (drag.startY - clientY)));
    const onMove = (ev) => { if (dragRef.current) setSheetHeight(`${heightAt(ev.clientY)}px`); };
    const onUp = (ev) => {
      dragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      // Store the snap as a viewport fraction so it scales on rotate/resize.
      const fraction = heightAt(ev.clientY) / window.innerHeight;
      const snap = [0.32, 0.6, 0.88].reduce((best, f) => (Math.abs(f - fraction) < Math.abs(best - fraction) ? f : best));
      setSheetHeight(`${snap * 100}vh`);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const onScrubStart = (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.closest('.knob, input[type="range"], .range-slider-handle')) return;
    scrubRowRef.current = target.closest('.param-row');
    scrubRowRef.current?.classList.add('scrubbing-row');
    setScrubbing(true);
  };

  useEffect(() => {
    if (!scrubbing) return undefined;
    const end = () => {
      scrubRowRef.current?.classList.remove('scrubbing-row');
      scrubRowRef.current = null;
      setScrubbing(false);
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, [scrubbing]);

  return (
    <aside
      ref={asideRef}
      className={`studio-inspector${gridMode ? ' dial-grid' : ''}${scrubbing ? ' scrubbing' : ''}`}
      style={sheetHeight ? { '--sheet-h': sheetHeight } : undefined}
      onPointerDownCapture={onScrubStart}
      aria-label={`${activeSection} inspector`}
    >
      <div
        className="studio-sheet-grip"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize inspector"
        onPointerDown={onGripPointerDown}
      />
      <header>
        <h2>{activeSection}</h2>
        <button type="button" onClick={onClose} aria-label="Close inspector"><X size={19} /></button>
      </header>
      {layerSection && <LayerStrip props={props} />}
      <div className="studio-inspector-scroll">
        {activeSection === 'Global' && <StudioGlobalControls props={props} />}
        {activeSection === 'Shape' && <ShapeSection props={props} />}
        {activeSection === 'Colour' && <ColourSection props={props} />}
        {activeSection === 'Motion' && <><MotionSection props={props} /><section className="insp-section"><div className="insp-section-head"><h3>Tempo</h3></div><BPMSection /></section></>}
        {activeSection === 'Audio' && <>
          <section className="insp-section"><div className="insp-section-head"><h3>Audio input</h3></div><AudioReactiveSection isActiveTab /></section>
          <AudioLinks layers={props.layers || []} />
          <details className="insp-section studio-collapsible"><summary>Audio-triggered layer spawning <ChevronDown size={16} /></summary><AudioSpawnSection {...props} isActiveTab timelineMode={false} /></details>
        </>}
        {activeSection === 'Settings' && <SettingsPanel props={props} />}
      </div>
    </aside>
  );
}
