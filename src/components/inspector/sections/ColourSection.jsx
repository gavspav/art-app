import React, { useMemo, useRef, useState } from 'react';
import { Dices, SlidersHorizontal } from 'lucide-react';
import ColorPicker from '../../ColorPicker.jsx';
import BufferedNumberInput from '../../common/BufferedNumberInput.jsx';
import RangeOrDial from '../../common/RangeOrDial.jsx';
import { useMidi } from '../../../context/MidiContext.jsx';
import { hexToRgb, rgbToHex } from '../../../utils/colorUtils.js';
import { buildLayerParamIds, findFirstMappedParamId } from '../../../utils/paramAliases.js';
import { buildMidiRandomizeId } from '../../../hooks/useMidiTrigger.js';
import { useInspectorTargeting } from '../useInspectorTargeting.js';
import ParameterRow from '../ParameterRow.jsx';
import Popover from '../Popover.jsx';
import MidiMappingRow from '../modulation/MidiMappingRow.jsx';
import AudioMappingRow from '../modulation/AudioMappingRow.jsx';
import BpmMappingRow from '../modulation/BpmMappingRow.jsx';

// Pick N colours spread evenly across a palette (repeats when N exceeds it).
export const sampleColors = (base = [], count = 0) => {
  const n = Math.max(0, Math.floor(count));
  if (!Array.isArray(base) || !base.length || !n) return [];
  if (n === 1) return [base[0]];
  return Array.from({ length: n }, (_, i) => base[Math.round((i / (n - 1)) * (base.length - 1))]);
};

const paletteEntries = (palettes) => (Array.isArray(palettes) ? palettes : []).flatMap((palette, index) => {
  const colors = Array.isArray(palette) ? palette : palette?.colors;
  if (!Array.isArray(colors) || !colors.length) return [];
  const custom = palette?.__source === 'custom' && palette?.id;
  const builtinIndex = Number.isFinite(palette?.__index) ? palette.__index : index;
  return [{ value: custom ? `custom:${palette.id}` : `builtin:${builtinIndex}`, label: palette?.name || (custom ? 'Custom palette' : `Palette ${builtinIndex + 1}`), colors, custom: !!custom }];
});

// Manual MIDI control of the active colour's RGBA channels.
function MidiColourChannels({ layer, applyTargetedUpdate, updateLayer }) {
  const midi = useMidi() || {};
  const enabled = !!layer?.manualMidiColorEnabled;
  const colors = Array.isArray(layer?.colors) ? layer.colors : [];
  const selected = Number.isFinite(layer?.selectedColor) ? layer.selectedColor : 0;
  const currentHex = colors[selected] || '#000000';
  const rgb = useMemo(() => hexToRgb(currentHex), [currentHex]);
  const aliases = useMemo(() => Object.fromEntries(['R', 'G', 'B', 'A'].map(channel => [channel, buildLayerParamIds(layer, `color${channel}`)])), [layer]);
  const setChannel = channel => value => {
    const next = rgbToHex({ ...rgb, [channel]: Math.max(0, Math.min(255, Math.round(Number(value)))) || 0 });
    const nextColors = [...colors]; nextColors[selected] = next;
    applyTargetedUpdate(() => ({ colors: nextColors, numColors: Math.max(1, nextColors.length), selectedColor: 0 }));
  };
  if (!midi.supported) return null;
  return (
    <div className="mod-block">
      <div className="mod-row">
        <span className="mod-row-label">MIDI colour</span>
        <button type="button" className={`mod-btn${enabled ? ' active' : ''}`} aria-pressed={enabled} onClick={() => updateLayer({ manualMidiColorEnabled: !enabled })}>{enabled ? 'On' : 'Off'}</button>
        <span className="mod-hint">Drive the active swatch's channels from a controller</span>
      </div>
      {enabled && ['r', 'g', 'b'].map(channel => (
        <div className="mod-row channel" key={channel}>
          <span className="mod-row-label">{channel.toUpperCase()}</span>
          <RangeOrDial min={0} max={255} step={1} value={rgb[channel]} onChange={event => setChannel(channel)(event.target.value)} aria-label={`${channel.toUpperCase()} channel`} className="dc-slider" size={30} />
          <MidiMappingRow paramId={aliases[channel.toUpperCase()][0]} paramAliases={aliases[channel.toUpperCase()]} label="" />
        </div>
      ))}
      {enabled && <div className="mod-row channel">
        <span className="mod-row-label">A</span>
        <RangeOrDial min={0} max={1} step={0.001} value={Math.max(0, Math.min(1, Number(layer?.opacity ?? 1)))} onChange={event => applyTargetedUpdate(() => ({ opacity: Math.max(0, Math.min(1, parseFloat(event.target.value) || 0)) }))} aria-label="Alpha channel" className="dc-slider" size={30} />
        <MidiMappingRow paramId={aliases.A[0]} paramAliases={aliases.A} label="" />
      </div>}
    </div>
  );
}

export default function ColourSection({ props }) {
  const midi = useMidi() || {};
  const { applyTargetedUpdate } = useInspectorTargeting(props);
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const [draftName, setDraftName] = useState('Custom palette');
  const anchorRef = useRef(null);
  const layer = props.currentLayer;
  const colors = Array.isArray(layer?.colors) ? layer.colors : [];
  const count = Math.max(1, Number.isFinite(layer?.numColors) ? layer.numColors : colors.length || 1);
  const entries = useMemo(() => paletteEntries(props.palettes), [props.palettes]);
  const matched = entries.find(entry => {
    const sampled = sampleColors(entry.colors, colors.length);
    return sampled.length === colors.length && sampled.every((c, i) => (c || '').toLowerCase() === (colors[i] || '').toLowerCase());
  })?.value || 'custom';
  const trigger = buildMidiRandomizeId('layerColors');
  const paletteAliases = useMemo(() => buildLayerParamIds(layer, 'paletteIndex', props.selectedLayerIndex), [layer, props.selectedLayerIndex]);
  const fadeAliases = useMemo(() => buildLayerParamIds(layer, 'colorFadeSpeed', props.selectedLayerIndex), [layer, props.selectedLayerIndex]);
  const key = `${layer?.id || 'none'}-${props.editTarget?.type || 'single'}-${props.editTarget?.groupId || ''}`;
  const paletteMapped = !!findFirstMappedParamId(midi.mappings || {}, paletteAliases) && paletteAliases.some(id => midi.mappings?.[id]);

  const setCount = raw => {
    const n = Math.max(1, Math.round(Number(raw)) || 1);
    applyTargetedUpdate(item => {
      const base = Array.isArray(item?.colors) ? item.colors : [];
      const next = base.slice(0, n);
      while (next.length < n) next.push(base[base.length - 1] || '#ffffff');
      return { colors: next, numColors: n, selectedColor: 0 };
    });
  };
  const applyPalette = value => {
    const entry = entries.find(item => item.value === value);
    if (!entry) return;
    applyTargetedUpdate(() => ({ colors: sampleColors(entry.colors, count), numColors: count, selectedColor: 0 }));
  };
  const commitSave = () => {
    const safe = colors.filter(c => typeof c === 'string' && c.trim());
    const name = draftName.trim();
    if (!safe.length || !name || typeof props.onSaveCustomPalette !== 'function') return;
    props.onSaveCustomPalette({ name, colors: safe });
    setNaming(false);
  };
  const fadeEnabled = !!layer?.colorFadeEnabled;
  const toggleFade = () => {
    const enabled = !fadeEnabled;
    const speed = Number(layer?.colorFadeSpeed ?? 0);
    applyTargetedUpdate(item => {
      const arr = Array.isArray(item?.colors) ? item.colors : [];
      const patch = { colorFadeEnabled: enabled, colorFadeSpeed: enabled && speed <= 0 ? 0.5 : speed };
      if (enabled) {
        patch.colors = arr.length === 0 ? ['#000000', '#000000'] : arr.length === 1 ? [arr[0], arr[0]] : arr;
        patch.numColors = patch.colors.length;
      }
      return patch;
    });
  };

  return (
    <section className="insp-section">
      <div className="insp-section-head">
        <h3>Colours</h3>
        <div className="insp-head-actions">
          <button type="button" className="insp-chip" onClick={() => props.randomizeCurrentLayerColors?.()} title="Randomise colours for the targeted layers"><Dices size={14} /> Randomise</button>
          <button type="button" ref={anchorRef} className={`param-icon more${open ? ' active' : ''}${paletteMapped ? ' mapped' : ''}`} aria-expanded={open} aria-label="Colour randomisation and mapping settings" onClick={() => setOpen(value => !value)}><SlidersHorizontal size={14} /></button>
        </div>
      </div>
      <Popover open={open} anchorRef={anchorRef} onClose={() => setOpen(false)} title="Colours · Randomisation and mapping">
        {midi.supported && <div className="popover-actions"><MidiMappingRow paramId={trigger} label="Trigger" /></div>}
        <div className="option-chips">
          <label className={props.randomizePalette ? 'on' : ''}><input type="checkbox" checked={!!props.randomizePalette} onChange={event => props.setRandomizePalette?.(event.target.checked)} />Change palette</label>
          <label className={props.randomizeNumColors ? 'on' : ''}><input type="checkbox" checked={!!props.randomizeNumColors} onChange={event => props.setRandomizeNumColors?.(event.target.checked)} />Change colour count</label>
        </div>
        <div className="limits-grid">
          <label className="random">Fewest colours<BufferedNumberInput min={1} max={props.colorCountMax || 8} step={1} value={Math.max(1, Number(props.colorCountMin || 1))} onCommit={next => props.setColorCountMin?.(Math.max(1, Math.round(Number(next) || 1)))} /></label>
          <label className="random">Most colours<BufferedNumberInput min={props.colorCountMin || 1} max={32} step={1} value={Math.max(Number(props.colorCountMin || 1), Number(props.colorCountMax || 8))} onCommit={next => props.setColorCountMax?.(Math.max(Number(props.colorCountMin || 1), Math.round(Number(next) || 1)))} /></label>
        </div>
        <div className="mod-stack">
          <MidiMappingRow paramId={paletteAliases[0]} paramAliases={paletteAliases} label="Palette" />
          <AudioMappingRow paramId={paletteAliases[0]} paramAliases={paletteAliases} min={0} max={1} />
          <BpmMappingRow paramId={paletteAliases[0]} paramAliases={paletteAliases} min={0} max={1} />
          <MidiColourChannels layer={layer} applyTargetedUpdate={applyTargetedUpdate} updateLayer={props.updateCurrentLayer} />
        </div>
      </Popover>

      <div className="insp-field-row">
        <label className="insp-field grow">Palette
          <select key={`palette-${key}`} value={matched} onChange={event => applyPalette(event.target.value)}>
            <option value="custom">Custom</option>
            {entries.some(entry => !entry.custom) && <optgroup label="Built-in">{entries.filter(entry => !entry.custom).map(entry => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</optgroup>}
            {entries.some(entry => entry.custom) && <optgroup label="Custom">{entries.filter(entry => entry.custom).map(entry => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</optgroup>}
          </select>
        </label>
        <label className="insp-field">Count
          <BufferedNumberInput key={`numColors-${key}`} min={1} step={1} value={count} onCommit={setCount} inputMode="numeric" aria-label="Number of colours" />
        </label>
        <button type="button" className="insp-chip" onClick={() => { setDraftName('Custom palette'); setNaming(true); }} disabled={!colors.length || naming} title="Save these colours as a custom palette">Save</button>
      </div>
      {naming && (
        <div className="insp-field-row">
          <input className="insp-palette-name" aria-label="Palette name" autoFocus value={draftName}
            onChange={event => setDraftName(event.target.value)}
            onKeyDown={event => {
              event.stopPropagation();
              if (event.key === 'Enter') { event.preventDefault(); commitSave(); }
              if (event.key === 'Escape') { event.preventDefault(); setNaming(false); }
            }} />
          <button type="button" className="insp-chip accent" onClick={commitSave} disabled={!draftName.trim()}>Save</button>
          <button type="button" className="insp-chip" onClick={() => setNaming(false)}>Cancel</button>
        </div>
      )}

      <ColorPicker key={`colorpicker-${key}`} label="" colors={colors} onChange={next => applyTargetedUpdate(() => ({ colors: [...(next || [])], numColors: Math.max(1, (next || []).length), selectedColor: 0 }))} layerId={layer?.id} />

      <div className="insp-section-head sub">
        <h4>Animate colours</h4>
        <button type="button" className={`insp-chip${fadeEnabled ? ' active' : ''}`} aria-pressed={fadeEnabled} onClick={toggleFade}>{fadeEnabled ? 'On' : 'Off'}</button>
      </div>
      {fadeEnabled && (
        <div className="param-list">
        <ParameterRow id="colorFadeSpeed" label="Fade speed (colours / s)" value={Number(layer?.colorFadeSpeed ?? 0.5)} min={0} max={4} step={0.01} precision={2} defaultValue={0.5} sliderKey={`fade-${key}`}
          onChange={value => applyTargetedUpdate(() => ({ colorFadeSpeed: value }))}
          details={<div className="mod-stack">
            <MidiMappingRow paramId={fadeAliases[0]} paramAliases={fadeAliases} />
            <AudioMappingRow paramId={fadeAliases[0]} paramAliases={fadeAliases} min={0} max={4} />
            <BpmMappingRow paramId={fadeAliases[0]} paramAliases={fadeAliases} min={0} max={4} />
          </div>} />
        </div>
      )}
    </section>
  );
}
