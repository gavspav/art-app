import React, { useMemo } from 'react';
import { ChevronDown, Crosshair, Globe2, Layers3, Plus, Trash2, X } from 'lucide-react';
import { useAudioReactive } from '../../context/AudioContext.jsx';
import { useMidi } from '../../context/MidiContext.jsx';
import LayerSectionView from '../LayerSectionView.jsx';
import StudioGlobalControls from './StudioGlobalControls.jsx';
import {
  AudioReactiveSection,
  AudioSpawnSection,
  BPMSection,
} from '../global/sections/GlobalAutomationSections.jsx';
import '../BottomPanel.css';

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
    <section className="studio-card audio-links-card">
      <div className="studio-card-heading">
        <div><span className="eyebrow">Signal routing</span><h3>Audio links</h3></div>
        <button type="button" className="studio-small-action" onClick={addLink} disabled={!firstLayer}><Plus size={16} /> Add link</button>
      </div>
      <p className="studio-help">Connect one sound signal to one visual control. A destination can have one link.</p>
      {activeLinks.length === 0 && <div className="studio-empty">No links yet. Add one, then choose its signal and range.</div>}
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

function LayerList({ props }) {
  const { layers, selectedLayerIndex, selectedLayerIds, selectLayer, toggleLayerSelection, addNewLayer, deleteLayer, moveSelectedLayerUp, moveSelectedLayerDown, handleImportSVGClick, setEditTarget } = props;
  const selectedIds = new Set(selectedLayerIds || []);
  return (
    <section className="studio-card">
      <div className="studio-card-heading"><div><span className="eyebrow">Document</span><h3>Layers</h3></div><button type="button" className="studio-small-action" onClick={addNewLayer}><Plus size={16} /> Layer</button></div>
      <p className="studio-help">Tap a layer to edit it. Shift-click to build a temporary selection.</p>
      <div className="studio-layer-list">
        {(layers || []).map((layer, index) => (
          <button
            type="button"
            key={layer.id || index}
            className={`${selectedLayerIndex === index ? 'active' : ''} ${selectedIds.has(layer.id) ? 'selected' : ''}`}
            onClick={event => {
              if (event.shiftKey) {
                toggleLayerSelection?.(layer.id);
                setEditTarget?.({ type: 'selection' });
              } else {
                selectLayer?.(index);
                setEditTarget?.({ type: 'single' });
              }
            }}
          ><Layers3 size={17} /><span>{layer.name || `Layer ${index + 1}`}</span><small>{index + 1}</small></button>
        ))}
      </div>
      <div className="studio-inline-actions">
        <button type="button" onClick={moveSelectedLayerUp}>Move up</button>
        <button type="button" onClick={moveSelectedLayerDown}>Move down</button>
        <button type="button" onClick={handleImportSVGClick}>Import SVG</button>
        <button type="button" onClick={() => deleteLayer?.(selectedLayerIndex)} disabled={(layers || []).length <= 1}>Delete</button>
      </div>
    </section>
  );
}

function SettingsPanel({ props }) {
  const midi = useMidi() || {};
  return <>
    <section className="studio-card studio-settings-grid">
      <span className="eyebrow">Canvas</span><h3>Scene</h3>
      <label>Background<input type="color" value={props.backgroundColor || '#000000'} onChange={event => props.setBackgroundColor?.(event.target.value)} /></label>
      <label>Blend mode<select value={props.globalBlendMode || 'source-over'} onChange={event => props.setGlobalBlendMode?.(event.target.value)}>
        {(props.blendModes || []).map(mode => {
          const value = typeof mode === 'string' ? mode : mode.value;
          const label = typeof mode === 'string' ? mode : mode.label;
          return <option key={value} value={value}>{label}</option>;
        })}
      </select></label>
      <label>Global speed<input type="range" min="0" max="4" step="0.05" value={props.globalSpeedMultiplier ?? 1} onChange={event => props.setGlobalSpeedMultiplier?.(Number(event.target.value))} /></label>
      <label>Random seed<input type="number" value={props.globalSeed ?? 1} onChange={event => props.setGlobalSeed?.(Number(event.target.value))} /></label>
      <label className="studio-check"><input type="checkbox" checked={!!props.zIgnore} onChange={event => props.setZIgnore?.(event.target.checked)} /> Ignore depth movement</label>
      <label className="studio-check"><input type="checkbox" checked={!!props.colorFadeWhileFrozen} onChange={event => props.setColorFadeWhileFrozen?.(event.target.checked)} /> Continue colour fades while paused</label>
    </section>
    <section className="studio-card studio-settings-grid">
      <span className="eyebrow">Control</span><h3>MIDI</h3>
      <label>Input<select value={midi.selectedInputId || ''} onChange={event => midi.setSelectedInputId?.(event.target.value)} disabled={!midi.supported}>
        <option value="">{midi.supported ? 'No MIDI input' : 'Web MIDI unavailable'}</option>
        {(midi.inputs || []).map(input => <option key={input.id} value={input.id}>{input.name || input.id}</option>)}
      </select></label>
      <p className="studio-help">Use the Learn control beside a parameter to map it to your controller.</p>
      <button type="button" className="studio-danger" disabled={!Object.keys(midi.mappings || {}).length} onClick={() => Object.keys(midi.mappings || {}).forEach(id => midi.clearMapping?.(id))}>Clear MIDI mappings</button>
    </section>
  </>;
}

function TargetScopeControl({ props }) {
  const mode = props.parameterTargetMode === 'global' ? 'global' : 'individual';
  const layers = Array.isArray(props.layers) ? props.layers : [];
  const selectionCount = Array.isArray(props.selectedLayerIds) ? props.selectedLayerIds.length : 0;
  const selectedName = layers[props.selectedLayerIndex]?.name || `Layer ${(props.selectedLayerIndex ?? 0) + 1}`;
  const targetLabel = mode === 'global'
    ? `All layers (${layers.length})`
    : (props.editTarget?.type === 'selection' && selectionCount > 0 ? `Selection (${selectionCount})` : selectedName);

  return <section className="studio-target-scope" aria-label="Parameter target scope">
    <div className="studio-target-heading"><span className="eyebrow">Parameter target</span><strong>{targetLabel}</strong><kbd>G</kbd></div>
    <div className="studio-target-buttons" role="group" aria-label="Choose parameter target">
      <button type="button" className={mode === 'individual' ? 'active' : ''} onClick={() => props.setParameterTargetMode?.('individual')} aria-pressed={mode === 'individual'}><Crosshair size={15} /> Individual</button>
      <button type="button" className={mode === 'global' ? 'active' : ''} onClick={() => props.setParameterTargetMode?.('global')} aria-pressed={mode === 'global'}><Globe2 size={15} /> Global</button>
    </div>
    <p>{mode === 'global' ? 'Layer controls apply to every layer.' : 'Layer controls apply to the selected layer or temporary selection.'}</p>
  </section>;
}

export default function StudioInspector({ activeSection, onClose, props }) {
  const commonLayerProps = {
    currentLayer: props.currentLayer, updateLayer: props.updateCurrentLayer,
    randomizeCurrentLayer: props.randomizeCurrentLayer,
    randomizeAnimationOnly: props.randomizeAnimationForCurrentLayer,
    randomizeAll: props.handleRandomizeAll, isFrozen: props.isFrozen, setIsFrozen: props.setIsFrozen,
    globalSpeedMultiplier: props.globalSpeedMultiplier, setGlobalSpeedMultiplier: props.setGlobalSpeedMultiplier,
    setLayers: props.setLayers, baseColors: props.baseColors, baseNumColors: props.baseNumColors,
    isNodeEditMode: props.isNodeEditMode, setIsNodeEditMode: props.setIsNodeEditMode,
    classicMode: props.classicMode, setClassicMode: props.setClassicMode,
    randomizePalette: props.randomizePalette, setRandomizePalette: props.setRandomizePalette,
    randomizeNumColors: props.randomizeNumColors, setRandomizeNumColors: props.setRandomizeNumColors,
    colorCountMin: props.colorCountMin, colorCountMax: props.colorCountMax,
    setColorCountMin: props.setColorCountMin, setColorCountMax: props.setColorCountMax,
    onRandomizeLayerColors: props.randomizeCurrentLayerColors, getIsRnd: props.getIsRnd, setIsRnd: props.setIsRnd,
    layerNames: props.layerNames, layerIds: (props.layers || []).map(layer => layer?.id),
    selectedLayerIndex: props.selectedLayerIndex, onSelectLayer: props.selectLayer,
    onAddLayer: props.addNewLayer, onDeleteLayer: props.deleteLayer,
    onMoveLayerUp: props.moveSelectedLayerUp, onMoveLayerDown: props.moveSelectedLayerDown,
    onImportSVG: props.handleImportSVGClick, parameterTargetMode: props.parameterTargetMode,
    selectedLayerIds: props.selectedLayerIds, toggleLayerSelection: props.toggleLayerSelection,
    clearSelection: props.clearSelection, editTarget: props.editTarget,
    setEditTarget: props.setEditTarget, getActiveTargetLayerIds: props.getActiveTargetLayerIds,
    palettes: props.palettes, automationPalettes: props.automationPalettes, onSaveCustomPalette: props.onSaveCustomPalette,
    hideTabbar: true,
  };

  return (
    <aside className="studio-inspector" aria-label={`${activeSection} inspector`}>
      <header><div><span className="eyebrow">Inspector</span><h2>{activeSection}</h2></div><button type="button" onClick={onClose} aria-label="Close inspector"><X size={19} /></button></header>
      <div className="studio-inspector-scroll">
        <TargetScopeControl props={props} />
        {activeSection === 'Global' && <StudioGlobalControls props={props} />}
        {activeSection === 'Layers' && <LayerList props={props} />}
        {activeSection === 'Shape' && <LayerSectionView {...commonLayerProps} visibleSection="shape" />}
        {activeSection === 'Colour' && <LayerSectionView {...commonLayerProps} visibleSection="colour" />}
        {activeSection === 'Motion' && <><LayerSectionView {...commonLayerProps} visibleSection="animation" /><section className="studio-card"><h3>Tempo</h3><BPMSection /></section></>}
        {activeSection === 'Audio' && <>
          <section className="studio-card"><span className="eyebrow">Source</span><h3>Audio input</h3><AudioReactiveSection isActiveTab /></section>
          <AudioLinks layers={props.layers || []} />
          <details className="studio-card studio-collapsible"><summary>Audio-triggered layer spawning <ChevronDown size={16} /></summary><AudioSpawnSection {...props} isActiveTab timelineMode={false} /></details>
        </>}
        {activeSection === 'Settings' && <SettingsPanel props={props} />}
      </div>
    </aside>
  );
}
