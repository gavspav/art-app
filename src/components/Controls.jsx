import React, { useState, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react';
import ColorPicker from './ColorPicker';
import { useParameters } from '../context/ParameterContext.jsx';
import { DEFAULT_LAYER } from '../constants/defaults';
// blendModes no longer used here; Global Style handled in App.jsx
import { palettes } from '../constants/palettes';
import { useMidi } from '../context/MidiContext.jsx';
import { hexToRgb, rgbToHex } from '../utils/colorUtils.js';

// Per-layer MIDI Position control block
// Minimal stub to avoid build errors; detailed MIDI position UI is handled elsewhere
const MidiPositionSection = ({ currentLayer, updateLayer }) => {
  return null;
};

// Small helper component to show MIDI mapping status and controls for rotation
const MidiRotationStatus = ({ paramId }) => {
  const { supported: midiSupported, mappings: midiMappings, beginLearn, clearMapping, mappingLabel, learnParamId } = useMidi() || {};
  return (
    <div className="compact-row" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.35rem' }}>
      <span className="compact-label" style={{ opacity: 0.8 }}>
        MIDI: {midiSupported ? (midiMappings?.[paramId] ? (mappingLabel ? mappingLabel(midiMappings[paramId]) : 'Mapped') : 'Not mapped') : 'Not supported'}
      </span>
      {midiSupported && (
        <>
          {learnParamId === paramId && <span style={{ color: '#4fc3f7' }}>Listening…</span>}
          <button type="button" className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); beginLearn && beginLearn(paramId); }} disabled={!midiSupported}>Learn</button>
          <button type="button" className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); clearMapping && clearMapping(paramId); }} disabled={!midiSupported || !midiMappings?.[paramId]}>Clear</button>
        </>
      )}
    </div>
  );
};

// Per-layer MIDI Colour control block (RGBA) with broadcasting when vary is OFF
const MidiColorSection = ({ currentLayer, updateLayer, setLayers }) => {
  const {
    mappings: midiMappings,
    beginLearn,
    clearMapping,
    mappingLabel,
    learnParamId,
    supported: midiSupported,
  } = useMidi() || {};

  const enabled = !!currentLayer?.manualMidiColorEnabled;
  const layerKey = (currentLayer?.name || 'Layer').toString();
  const idR = `layer:${layerKey}:colorR`;
  const idG = `layer:${layerKey}:colorG`;
  const idB = `layer:${layerKey}:colorB`;
  const idA = `layer:${layerKey}:colorA`;

  const colors = Array.isArray(currentLayer?.colors) ? currentLayer.colors : [];
  const selIdx = Number.isFinite(currentLayer?.selectedColor) ? currentLayer.selectedColor : 0;
  const curHex = colors[selIdx] || '#000000';
  const curRGB = useMemo(() => hexToRgb(curHex), [curHex]);

  // Update a single RGB channel; broadcast palette if vary is OFF
  const setChannel = (channel) => (e) => {
    const v = Math.max(0, Math.min(255, Math.round(parseFloat(e.target.value)))) || 0;
    const next = { ...curRGB, [channel]: v };
    const nextHex = rgbToHex(next);
    const nextColors = [...colors];
    nextColors[selIdx] = nextHex;
    const n = Math.max(1, nextColors.length);
    const varyColorsEffective = !!(currentLayer?.vary?.colors) && !!(currentLayer?.vary?.colorFadeEnabled);
    if (!varyColorsEffective && typeof setLayers === 'function') {
      setLayers(prev => prev.map(l => ({ ...l, colors: [...nextColors], numColors: n, selectedColor: 0 })));
    } else {
      updateLayer({ colors: nextColors });
    }
  };

  const setAlpha = (e) => {
    let v = parseFloat(e.target.value);
    if (!Number.isFinite(v)) v = 1;
    v = Math.max(0, Math.min(1, v));
    updateLayer({ opacity: v });
  };

  const toggleEnabled = (e) => {
    const on = !!e.target.checked;
    updateLayer({ manualMidiColorEnabled: on });
  };

  return (
    <div className="control-card">
      <div className="control-row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
        <div style={{ fontWeight: 600 }}>MIDI Colour Control</div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }} title="Enable manual MIDI control for colour RGBA">
          <input type="checkbox" checked={!!enabled} onChange={toggleEnabled} />
          Enable
        </label>
      </div>

      {enabled && (
        <>
          {/* R */}
          <div className="dc-inner" style={{ marginTop: '0.5rem' }}>
            <div className="dc-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>R: {curRGB.r}</div>
              <div className="dc-actions" style={{ display: 'flex', gap: '0.4rem' }}>
                <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); beginLearn && beginLearn(idR); }} disabled={!midiSupported}>Learn</button>
                <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); clearMapping && clearMapping(idR); }} disabled={!midiSupported || !midiMappings?.[idR]}>Clear</button>
              </div>
            </div>
            <input type="range" min={0} max={255} step={1} value={curRGB.r} onChange={setChannel('r')} className="dc-slider" />
            <div style={{ fontSize: '0.8rem', opacity: 0.8, marginTop: '0.25rem' }}>
              MIDI: {(!midiSupported) ? 'Not supported' : (midiMappings && midiMappings[idR] ? (mappingLabel ? mappingLabel(midiMappings[idR]) : 'Mapped') : 'Not mapped')}
              {learnParamId === idR && midiSupported && <span style={{ marginLeft: '0.5rem', color: '#4fc3f7' }}>Listening…</span>}
            </div>
          </div>

          {/* G */}
          <div className="dc-inner" style={{ marginTop: '0.5rem' }}>
            <div className="dc-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>G: {curRGB.g}</div>
              <div className="dc-actions" style={{ display: 'flex', gap: '0.4rem' }}>
                <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); beginLearn && beginLearn(idG); }} disabled={!midiSupported}>Learn</button>
                <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); clearMapping && clearMapping(idG); }} disabled={!midiSupported || !midiMappings?.[idG]}>Clear</button>
              </div>
            </div>
            <input type="range" min={0} max={255} step={1} value={curRGB.g} onChange={setChannel('g')} className="dc-slider" />
            <div style={{ fontSize: '0.8rem', opacity: 0.8, marginTop: '0.25rem' }}>
              MIDI: {(!midiSupported) ? 'Not supported' : (midiMappings && midiMappings[idG] ? (mappingLabel ? mappingLabel(midiMappings[idG]) : 'Mapped') : 'Not mapped')}
              {learnParamId === idG && midiSupported && <span style={{ marginLeft: '0.5rem', color: '#4fc3f7' }}>Listening…</span>}
            </div>
          </div>

          {/* B */}
          <div className="dc-inner" style={{ marginTop: '0.5rem' }}>
            <div className="dc-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>B: {curRGB.b}</div>
              <div className="dc-actions" style={{ display: 'flex', gap: '0.4rem' }}>
                <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); beginLearn && beginLearn(idB); }} disabled={!midiSupported}>Learn</button>
                <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); clearMapping && clearMapping(idB); }} disabled={!midiSupported || !midiMappings?.[idB]}>Clear</button>
              </div>
            </div>
            <input type="range" min={0} max={255} step={1} value={curRGB.b} onChange={setChannel('b')} className="dc-slider" />
            <div style={{ fontSize: '0.8rem', opacity: 0.8, marginTop: '0.25rem' }}>
              MIDI: {(!midiSupported) ? 'Not supported' : (midiMappings && midiMappings[idB] ? (mappingLabel ? mappingLabel(midiMappings[idB]) : 'Mapped') : 'Not mapped')}
              {learnParamId === idB && midiSupported && <span style={{ marginLeft: '0.5rem', color: '#4fc3f7' }}>Listening…</span>}
            </div>
          </div>

          {/* A (opacity) */}
          <div className="dc-inner" style={{ marginTop: '0.5rem' }}>
            <div className="dc-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>A (Opacity): {Number(currentLayer?.opacity ?? 1).toFixed(3)}</div>
              <div className="dc-actions" style={{ display: 'flex', gap: '0.4rem' }}>
                <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); beginLearn && beginLearn(idA); }} disabled={!midiSupported}>Learn</button>
                <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); clearMapping && clearMapping(idA); }} disabled={!midiSupported || !midiMappings?.[idA]}>Clear</button>
              </div>
            </div>
            <input type="range" min={0} max={1} step={0.001} value={Math.max(0, Math.min(1, Number(currentLayer?.opacity ?? 1)))} onChange={setAlpha} className="dc-slider" />
            <div style={{ fontSize: '0.8rem', opacity: 0.8, marginTop: '0.25rem' }}>
              MIDI: {(!midiSupported) ? 'Not supported' : (midiMappings && midiMappings[idA] ? (mappingLabel ? mappingLabel(midiMappings[idA]) : 'Mapped') : 'Not mapped')}
              {learnParamId === idA && midiSupported && <span style={{ marginLeft: '0.5rem', color: '#4fc3f7' }}>Listening…</span>}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const DynamicControlBase = ({ param, currentLayer, updateLayer, setLayers }) => {
  const { updateParameter } = useParameters();
  const { id, type, min, max, step, label, options } = param;
  const [showSettings, setShowSettings] = useState(false);
  const {
    mappings: midiMappings,
    registerParamHandler,
    beginLearn,
    clearMapping,
    mappingLabel,
    learnParamId,
    supported: midiSupported,
  } = useMidi() || {};

  // Guard against undefined currentLayer during initial mounts
  let value = currentLayer?.[id];

  // Special mapping for scale - it should update position.scale, not width/height
  if (id === 'scale') {
    value = currentLayer.position?.scale || 1;
  }

  const handleChange = (e) => {
    let newValue;
    switch (type) {
      case 'slider':
        newValue = parseFloat(e.target.value);
        // Clamp to slider bounds
        if (Number.isFinite(min) && Number.isFinite(max)) {
          newValue = Math.min(max, Math.max(min, newValue));
        }
        break;
      case 'dropdown':
        newValue = e.target.value;
        break;
      default:
        newValue = e.target.value;
    }
    // Determine if we should apply to all layers (when 'Vary across layers' is OFF for this param)
    const varyKey = (() => {
      switch (id) {
        case 'numSides': return 'numSides';
        case 'curviness': return 'curviness';
        case 'wobble': return 'wobble';
        case 'noiseAmount': return 'noiseAmount';
        case 'radiusFactor': return 'radiusFactor';
        case 'width': return 'width';
        case 'height': return 'height';
        case 'movementStyle': return 'movementStyle';
        case 'movementSpeed': return 'movementSpeed';
        case 'movementAngle': return 'movementAngle';
        case 'scaleSpeed': return 'scaleSpeed';
        case 'imageBlur': return 'imageBlur';
        case 'imageBrightness': return 'imageBrightness';
        case 'imageContrast': return 'imageContrast';
        case 'imageHue': return 'imageHue';
        case 'imageSaturation': return 'imageSaturation';
        case 'imageDistortion': return 'imageDistortion';
        default: return null;
      }
    })();

    const applyToAll = !!varyKey && !Boolean(currentLayer?.vary?.[varyKey]);

    const makeRegularNodes = (sides) => {
      const n = Math.max(3, Math.round(Number(sides) || 3));
      return Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2;
        return { x: Math.cos(a), y: Math.sin(a) };
      });
    };

  

    if (applyToAll && typeof setLayers === 'function') {
      // Apply the change across all layers
      if (id === 'scale') {
        setLayers(prev => prev.map(l => ({ ...l, position: { ...(l.position || {}), scale: newValue } })));
      } else if (id === 'radiusFactor') {
        // Master Size updates X and Y as well
        setLayers(prev => prev.map(l => ({ ...l, radiusFactor: newValue, radiusFactorX: newValue, radiusFactorY: newValue })));
      } else if (id === 'numSides') {
        setLayers(prev => prev.map(l => {
          if (l.layerType === 'shape' && l.syncNodesToNumSides) {
            const nodes = makeRegularNodes(newValue);
            return { ...l, numSides: Math.max(3, Math.round(newValue)), nodes };
          }
          return { ...l, numSides: Math.max(3, Math.round(newValue)) };
        }));
      } else {
        setLayers(prev => prev.map(l => ({ ...l, [id]: newValue })));
      }
    } else {
      // Apply only to current layer
      if (id === 'scale') {
        updateLayer({ position: { ...(currentLayer?.position || {}), scale: newValue } });
      } else if (id === 'radiusFactor') {
        // Master Size updates X and Y as well
        updateLayer({ radiusFactor: newValue, radiusFactorX: newValue, radiusFactorY: newValue });
      } else if (id === 'numSides') {
        // When editing number of sides, regenerate nodes if syncing is enabled
        if (currentLayer?.layerType === 'shape' && currentLayer?.syncNodesToNumSides) {
          updateLayer({ numSides: Math.max(3, Math.round(newValue)), nodes: makeRegularNodes(newValue) });
        } else {
          updateLayer({ numSides: Math.max(3, Math.round(newValue)) });
        }
      } else {
        updateLayer({ [id]: newValue });
      }
    }
  };

  // Ensure movementStyle options are hardcoded and independent of saved parameter metadata
  const effectiveOptions = useMemo(() => (
    id === 'movementStyle' ? ['bounce', 'drift', 'still', 'orbit'] : options
  ), [id, options]);

  const randomizeThisParam = () => {
    console.log('[Controls] Randomize clicked for param', id);
    if (type === 'slider') {
      const rmin = Number.isFinite(param.randomMin) ? param.randomMin : min;
      const rmax = Number.isFinite(param.randomMax) ? param.randomMax : max;
      const low = Math.min(rmin, rmax);
      const high = Math.max(rmin, rmax);
      let rnd = low + Math.random() * (high - low);
      if (step === 1) rnd = Math.round(rnd);
      const clamped = Math.min(max, Math.max(min, rnd));
      if (id === 'scale') {
        updateLayer({ position: { ...(currentLayer?.position || {}), scale: clamped } });
      } else {
        updateLayer({ [id]: clamped });
      }
    } else if (type === 'dropdown' && Array.isArray(options) && options.length) {
      const choice = options[Math.floor(Math.random() * options.length)];
      updateLayer({ [id]: choice });
    }
  };

  const onToggleRandomizable = (e) => {
    e.stopPropagation();
    console.log('[Rnd] isRandomizable', id, !!e.target.checked);
    updateParameter(id, 'isRandomizable', !!e.target.checked);
  };

  const onMetaChange = (field) => (e) => {
    let v = e.target.value;
    if (['min', 'max', 'step', 'defaultValue', 'randomMin', 'randomMax'].includes(field)) {
      v = parseFloat(v);
    }
    updateParameter(id, field, v);
  };

  // Inline per-layer Vary toggle support for parameters with vary flags
  const varyKey = (() => {
    switch (id) {
      // Shape
      case 'numSides': return 'numSides';
      case 'curviness': return 'curviness';
      case 'wobble': return 'wobble';
      case 'noiseAmount': return 'noiseAmount';
      case 'radiusFactor': return 'radiusFactor';
      case 'width': return 'width';
      case 'height': return 'height';
      // Movement
      case 'movementStyle': return 'movementStyle';
      case 'movementSpeed': return 'movementSpeed';
      case 'movementAngle': return 'movementAngle';
      case 'scaleSpeed': return 'scaleSpeed';
      // Image Effects
      case 'imageBlur': return 'imageBlur';
      case 'imageBrightness': return 'imageBrightness';
      case 'imageContrast': return 'imageContrast';
      case 'imageHue': return 'imageHue';
      case 'imageSaturation': return 'imageSaturation';
      case 'imageDistortion': return 'imageDistortion';
      default: return null;
    }
  })();
  const toggleVaryFlag = (e) => {
    const key = varyKey;
    if (!key) return;
    e.stopPropagation();
    const checked = !!e.target.checked;
    console.log('[Vary] header flag', key, checked, 'for param', id);
    // Apply the vary flag to ALL layers so behavior is consistent everywhere,
    // and new layers (which copy vary flags from previous) inherit correctly.
    if (typeof setLayers === 'function') {
      setLayers(prev => prev.map(l => ({
        ...l,
        vary: { ...(l?.vary || DEFAULT_LAYER.vary || {}), [key]: checked },
      })));
    } else {
      // Fallback: update only current layer if setLayers is unavailable
      const nextVary = { ...(currentLayer?.vary || DEFAULT_LAYER.vary || {}), [key]: checked };
      updateLayer({ vary: nextVary });
    }
  };

  // Determine visibility but do not return yet to preserve hook order
  const hidden = (
    ((currentLayer?.layerType === 'image') && param.group === 'Shape') ||
    ((currentLayer?.layerType !== 'image') && param.group === 'Image Effects')
  );

  const onClickSettings = (e) => {
    // Do nothing on click; primary action handled on mousedown to avoid lost click
    e.stopPropagation();
    console.log('[Controls] Settings button CLICK (ignored, handled on mousedown) for param', id, 'label:', label);
  };

  const onClickRandomize = (e) => {
    // Do nothing on click; primary action handled on mousedown to avoid lost click
    e.stopPropagation();
    console.log('[Controls] Randomize button CLICK (ignored, handled on mousedown) for param', id, 'label:', label);
  };

  // Extra instrumentation to detect if events are being swallowed by overlays
  const onMouseDownSettings = (e) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('[Controls] Settings button MOUSEDOWN for param', id, 'label:', label);
    setShowSettings(s => !s);
  };
  const onMouseDownRandomize = (e) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('[Controls] Randomize button MOUSEDOWN for param', id, 'label:', label);
    randomizeThisParam();
  };

  // Register MIDI handler for this parameter
  useEffect(() => {
    if (!registerParamHandler) return;
    const unsub = registerParamHandler(id, ({ value01 }) => {
      if (type === 'slider') {
        const lo = Number.isFinite(min) ? min : 0;
        const hi = Number.isFinite(max) ? max : 1;
        const st = Number.isFinite(step) && step > 0 ? step : (hi - lo) / 1000;
        let mapped = lo + value01 * (hi - lo);
        mapped = Math.round((mapped - lo) / st) * st + lo;
        mapped = Math.max(lo, Math.min(hi, mapped));
        if (id === 'scale') {
          updateLayer({ position: { ...(currentLayer?.position || {}), scale: mapped } });
        } else {
          updateLayer({ [id]: mapped });
        }
      } else if (type === 'dropdown' && Array.isArray(options) && options.length) {
        const idx = Math.round(value01 * (options.length - 1));
        const choice = options[Math.max(0, Math.min(options.length - 1, idx))];
        updateLayer({ [id]: choice });
      }
    });
    return () => { if (typeof unsub === 'function') unsub(); };
    // It's intentional to exclude updateLayer/currentLayer from deps to avoid churn; handler reads latest via closure sufficiently for UI updates
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, type, min, max, step, options, registerParamHandler]);

  // Now short-circuit render if hidden, after hooks are declared
  if (hidden) return null;

  const Header = ({ children }) => (
    <div className="dc-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', pointerEvents: 'auto', position: 'relative', zIndex: 1000 }}>
      <div>{children}</div>
      <div className="dc-actions" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', position: 'relative', zIndex: 1001, userSelect: 'none' }}>
        <button
          type="button"
          onClick={onClickRandomize}
          onMouseDown={onMouseDownRandomize}
          title="Randomize this parameter"
          aria-label={`Randomize ${label}`}
          className="icon-btn"
          style={{ padding: '0 0.4rem', pointerEvents: 'auto', position: 'relative', zIndex: 1002 }}
          tabIndex={0}
        >
          🎲
        </button>
        <button
          type="button"
          onClick={onClickSettings}
          onMouseDown={onMouseDownSettings}
          title="Parameter settings"
          aria-label={`Settings for ${label}`}
          aria-pressed={showSettings ? 'true' : 'false'}
          className="icon-btn"
          style={{ padding: '0 0.4rem', pointerEvents: 'auto', position: 'relative', zIndex: 1003 }}
          tabIndex={0}
        >
          ⚙{showSettings ? '•' : ''}
        </button>
      </div>
    </div>
  );
  
  // Inline settings panel for this parameter (scoped to DynamicControlBase)
  const SettingsPanel = () => {
    if (!showSettings) return null;
    return (
      <div
        className="dc-settings"
        style={{ marginTop: '0.4rem', padding: '0.5rem', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', position: 'relative', zIndex: 3 }}
        onMouseDown={(e) => { e.stopPropagation(); }}
        onClick={(e) => { e.stopPropagation(); }}
      >
        {type === 'slider' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 5rem auto 5rem', gap: '0.4rem', alignItems: 'center' }}>
            <label>Min</label>
            <input type="number" value={min} onChange={onMetaChange('min')} />
            <label>Max</label>
            <input type="number" value={max} onChange={onMetaChange('max')} />
            <label>Step</label>
            <input type="number" value={step} step="0.001" onChange={onMetaChange('step')} />
            <label>Rand Min</label>
            <input type="number" value={Number.isFinite(param.randomMin) ? param.randomMin : min} onChange={onMetaChange('randomMin')} />
            <label>Rand Max</label>
            <input type="number" value={Number.isFinite(param.randomMax) ? param.randomMax : max} onChange={onMetaChange('randomMax')} />
          </div>
        ) : (
          <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>No numeric bounds for this control.</div>
        )}
        <div style={{ marginTop: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {varyKey && (
            <label
              title="Allow this parameter to vary across layers"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
              onMouseDown={(e) => { e.stopPropagation(); }}
              onClick={(e) => { e.stopPropagation(); }}
           >
              <input
                type="checkbox"
                checked={!!(currentLayer?.vary?.[varyKey])}
                onChange={toggleVaryFlag}
                onMouseDown={(e) => { e.stopPropagation(); }}
                onClick={(e) => { e.stopPropagation(); }}
              />
              Vary across layers
            </label>
          )}
          <label
            title="Include this parameter when using Randomize All"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
            onMouseDown={(e) => { e.stopPropagation(); }}
            onClick={(e) => { e.stopPropagation(); }}
          >
            <input
              type="checkbox"
              checked={!!param.isRandomizable}
              onChange={onToggleRandomizable}
              onMouseDown={(e) => { e.stopPropagation(); }}
              onClick={(e) => { e.stopPropagation(); }}
            />
            Include in Randomize All
          </label>
        </div>
        <div style={{ marginTop: '0.6rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '0.9rem', opacity: 0.9 }}>
              <strong>MIDI</strong>
              <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>
                {(!midiSupported) ? 'Not supported' : (midiMappings && midiMappings[id] ? (mappingLabel ? mappingLabel(midiMappings[id]) : 'Mapped') : 'Not mapped')}
                {learnParamId === id && midiSupported && <span style={{ marginLeft: '0.5rem', color: '#4fc3f7' }}>Listening… move a control</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button
                type="button"
                className="btn-compact-secondary"
                onClick={(e) => { e.stopPropagation(); if (beginLearn) beginLearn(id); }}
                disabled={!midiSupported}
                title="Click, then move a MIDI control to map"
              >
                Learn
              </button>
              <button
                type="button"
                className="btn-compact-secondary"
                onClick={(e) => { e.stopPropagation(); if (clearMapping) clearMapping(id); }}
                disabled={!midiSupported || !midiMappings?.[id]}
                title="Clear MIDI mapping for this parameter"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };
  
  switch (type) {
    case 'slider': {
      // Ensure displayed value is clamped within slider bounds even if state is out-of-range
      const numericValue = Number(value);
      const displayValue = (Number.isFinite(numericValue)
        ? Math.min(max, Math.max(min, numericValue))
        : (Number.isFinite(min) ? min : 0));
      return (
        <div style={{ marginBottom: '0.4rem' }}>
          <div className="dc-inner">
            <Header>
              <span>
                {label}: {Number(displayValue).toFixed(id.includes('Speed') || id === 'curviness' || id === 'movementSpeed' ? 3 : 2)}
              </span>
            </Header>
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={displayValue}
              onChange={handleChange}
              className="dc-slider"
              style={{ position: 'relative', zIndex: 0 }}
            />
          </div>
          <SettingsPanel />
        </div>
      );
    }
    case 'dropdown':
      return (
        <div style={{ marginBottom: '0.4rem' }}>
          <div className="dc-inner">
            <Header>
              <span>{label}:</span>
            </Header>
            <select value={value} onChange={handleChange}>
              {(effectiveOptions || options || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
          <SettingsPanel />
        </div>
      );
    default:
      return null;
  }
};

// Memoized version: only re-render when the specific param's displayed value or vary flag changes,
// or when the param metadata object reference changes (e.g., min/max/options updates).
const DynamicControl = React.memo(DynamicControlBase, (prev, next) => {
  if (prev.param !== next.param) return false; // param metadata changed

  // Force re-render *only* when the selected layer actually changes (by index / name),
  // not on every animation tick that mutates layer position/velocity. This keeps
  // the component mounted during animation so mouseup events still hit the same
  // element, fixing lost-click issues.
  const prevName = prev.currentLayer?.name;
  const nextName = next.currentLayer?.name;
  if (prevName !== nextName) return false;

  const id = prev.param?.id;
  if (!id) return false;

  // If the Include-in-Randomize flag changes, re-render so the checkbox reflects it immediately
  if (!!prev.param?.isRandomizable !== !!next.param?.isRandomizable) return false;

  // Compare displayed value; ignore other animating props
  const getValue = (cl, pid) => {
    if (!cl) return undefined;
    if (pid === 'scale') return cl.position?.scale;
    return cl[pid];
  };
  const prevVal = getValue(prev.currentLayer, id);
  const nextVal = getValue(next.currentLayer, id);
  if (prevVal !== nextVal) return false;

  // Vary flag header checkbox state
  const varyKey = (() => {
    switch (id) {
      case 'numSides': return 'numSides';
      case 'curviness': return 'curviness';
      case 'wobble': return 'wobble';
      case 'noiseAmount': return 'noiseAmount';
      case 'radiusFactor': return 'radiusFactor';
      case 'radiusFactorX': return 'radiusFactorX';
      case 'radiusFactorY': return 'radiusFactorY';
      case 'width': return 'width';
      case 'height': return 'height';
      case 'movementStyle': return 'movementStyle';
      case 'movementSpeed': return 'movementSpeed';
      case 'movementAngle': return 'movementAngle';
      case 'scaleSpeed': return 'scaleSpeed';
      case 'imageBlur': return 'imageBlur';
      case 'imageBrightness': return 'imageBrightness';
      case 'imageContrast': return 'imageContrast';
      case 'imageHue': return 'imageHue';
      case 'imageSaturation': return 'imageSaturation';
      case 'imageDistortion': return 'imageDistortion';
      default: return null;
    }
  })();

  if (varyKey) {
    const pv = !!(prev.currentLayer?.vary?.[varyKey]);
    const nv = !!(next.currentLayer?.vary?.[varyKey]);
    if (pv !== nv) return false;
  }

  // Otherwise skip re-render
  return true;
});

// Collapsible Section component defined at module scope to maintain stable identity across renders
const Section = ({ title, id, defaultOpen = false, children }) => {
  const [open, setOpen] = React.useState(!!defaultOpen);
  return (
    <div className="control-group" data-section-id={id}>
      <div
        className="section-header"
        onClick={() => setOpen(o => !o)}
        style={{ cursor: 'pointer', userSelect: 'none', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
      >
        <span>{open ? '▾' : '▸'}</span>
        <span>{title}</span>
      </div>
      {open && (
        <div className="section-body" style={{ marginTop: '0.5rem' }}>
          {children}
        </div>
      )}
    </div>
  );
};

const Controls = forwardRef(({ 
  currentLayer, 
  updateLayer, 
  randomizeCurrentLayer,
  randomizeAnimationOnly,
  /* eslint-disable no-unused-vars */
  randomizeAll, 
  isFrozen, 
  setIsFrozen,
  globalSpeedMultiplier,
  setGlobalSpeedMultiplier,
  /* eslint-enable no-unused-vars */
  // decoupled: do not pass full layers array to avoid frequent re-renders
  setLayers, // eslint-disable-line no-unused-vars
  // new lightweight props derived from the first/base layer
  /* eslint-disable no-unused-vars */
  baseColors,
  baseNumColors,
  /* eslint-enable no-unused-vars */
  isNodeEditMode,
  showMidi,
  setIsNodeEditMode,
  /* eslint-disable no-unused-vars */
  classicMode,
  setClassicMode,
  /* eslint-enable no-unused-vars */
  randomizePalette,
  setRandomizePalette,
  randomizeNumColors,
  setRandomizeNumColors,
  colorCountMin,
  colorCountMax,
  setColorCountMin,
  setColorCountMax,
  onRandomizeLayerColors,
  // rotate options
  rotationVaryAcrossLayers,
  setRotationVaryAcrossLayers,
  getIsRnd,
  setIsRnd,
  layerNames,
  selectedLayerIndex,
  onSelectLayer,
  onAddLayer,
  onDeleteLayer,
  onImportSVG,
  onMoveLayerUp,
  onMoveLayerDown
}, ref) => {
  const { parameters } = useParameters();

  // Local UI state for delete picker
  const [showDeletePicker, setShowDeletePicker] = useState(false);
  const [deleteIndex, setDeleteIndex] = useState(Number.isFinite(selectedLayerIndex) ? selectedLayerIndex : 0);
  // Tab state must be initialized before any early returns to keep hook order stable
  const [activeTab, setActiveTab] = useState('Shape');
  // Local UI state for Colours settings panel
  const [showColourSettings, setShowColourSettings] = useState(false);
  // Local UI state for Rotate settings
  const [showRotateSettings, setShowRotateSettings] = useState(false);
  const [rotateMin, setRotateMin] = useState(-180);
  const [rotateMax, setRotateMax] = useState(180);

  useEffect(() => {
    setDeleteIndex(Number.isFinite(selectedLayerIndex) ? selectedLayerIndex : 0);
  }, [selectedLayerIndex]);

  // Expose imperative API before any early returns to maintain hook order
  useImperativeHandle(ref, () => ({
    openTab: (name) => {
      const allowed = ['Animation','Shape','Colors'];
      if (allowed.includes(name)) setActiveTab(name);
    }
  }), []);


  // Do not early-return on falsy currentLayer; App clamps/passes a safe layer and
  // we guard property access with optional chaining where necessary.

  // Sampling helper: pick N colors from a palette evenly across its range
  const sampleColors = (base = [], count = 0) => {
    const n = Math.max(0, Math.floor(count));
    if (!Array.isArray(base) || base.length === 0 || n === 0) return [];
    if (n === 1) return [base[0]];
    if (n >= base.length) {
      // Evenly sample by spreading across the palette and allowing repeats if needed
      const out = [];
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const idx = Math.round(t * (base.length - 1));
        out.push(base[idx]);
      }
      return out;
    }
    // n < base.length: evenly spaced indices
    const out = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const idx = Math.round(t * (base.length - 1));
      out.push(base[idx]);
    }
    return out;
  };

  // Return index of palette whose sampled colors match the given array
  const matchPaletteIndex = (colors = []) => palettes.findIndex(p => {
    const sampled = sampleColors(p.colors, colors.length);
    return sampled.length === colors.length && sampled.every((c, i) => (c || '').toLowerCase() === (colors[i] || '').toLowerCase());
  });

  // (Removed old duplicate color handlers; consolidated below)

  // eslint-disable-next-line no-unused-vars
  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (file && (file.type === 'image/jpeg' || file.type === 'image/png')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          updateLayer({ layerType: 'image', image: img, numSides: 0 });
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  };

  // Hide per-layer opacity (global control exists)
  const overlayControls = parameters.filter(p => p.showInOverlay && p.id !== 'opacity');
  const groupedControls = overlayControls.reduce((acc, param) => {
    const group = param.group || 'General';
    if (!acc[group]) acc[group] = [];
    acc[group].push(param);
    return acc;
  }, {});

  // Prepare grouped params for tabs
  const shapeParams = groupedControls['Shape'] || [];
  const movementParams = groupedControls['Movement'] || [];
  // Appearance tab removed; image effect controls hidden for now

  // moved useImperativeHandle above early return
  
  // Orbit controls: apply across layers if corresponding vary flags are OFF
  const handleOrbitRadiusChange = (axis) => (e) => {
    let v = parseFloat(e.target.value);
    if (!Number.isFinite(v)) v = 0.0;
    v = Math.max(0, Math.min(0.5, v));
    const key = axis === 'x' ? 'orbitRadiusX' : 'orbitRadiusY';
    const varyFlag = !!(currentLayer?.vary?.[key]);
    if (!varyFlag && typeof setLayers === 'function') {
      setLayers(prev => prev.map(l => ({ ...l, [key]: v })));
    } else {
      updateLayer({ [key]: v });
    }
  };

  const toggleOrbitVary = (axis) => (e) => {
    const checked = !!e.target.checked;
    const key = axis === 'x' ? 'orbitRadiusX' : 'orbitRadiusY';
    if (typeof setLayers === 'function') {
      setLayers(prev => prev.map(l => ({
        ...l,
        vary: { ...(l?.vary || DEFAULT_LAYER.vary || {}), [key]: checked },
      })));
    } else {
      const nextVary = { ...(currentLayer?.vary || DEFAULT_LAYER.vary || {}), [key]: checked };
      updateLayer({ vary: nextVary });
    }
  };

  const renderAnimationTab = () => (
    <div className="tab-section">
      {/* MIDI Position Control Section remains a dedicated card */}
      <MidiPositionSection currentLayer={currentLayer} updateLayer={updateLayer} />

      {/* Consolidated movement params into one compact card */}
      {!(currentLayer?.manualMidiPositionEnabled) && (
        <div className="control-card">
          <div className="control-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 600 }}>Animation</div>
            <button
              type="button"
              className="icon-btn sm"
              title="Randomize animation for selected layer"
              aria-label="Randomize animation for selected layer"
              onClick={() => randomizeAnimationOnly && randomizeAnimationOnly()}
            >
              🎲
            </button>
          </div>
          <div style={{ marginTop: '0.5rem' }}>
            {movementParams.map(param => (
              <div key={`${param.id}-${Number.isFinite(selectedLayerIndex) ? selectedLayerIndex : 0}`}>
                <DynamicControl param={param} currentLayer={currentLayer} updateLayer={updateLayer} setLayers={setLayers} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Orbit Settings (visible when movement style is 'orbit') */}
      {currentLayer?.movementStyle === 'orbit' && (
        <div className="control-card" style={{ marginTop: '0.6rem' }}>
          <div className="control-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 600 }}>Orbit</div>
          </div>
          <div style={{ marginTop: '0.5rem', display: 'grid', gap: '0.6rem' }}>
            <div>
              <div className="dc-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span className="compact-label">Radius X</span>
                  <span style={{ opacity: 0.8 }}>{Number(currentLayer?.orbitRadiusX ?? 0).toFixed(3)}</span>
                </div>
                <label className="compact-label" title="Allow Radius X to vary across layers" onMouseDown={(e) => { e.stopPropagation(); }} onClick={(e) => { e.stopPropagation(); }}>
                  <input type="checkbox" checked={!!(currentLayer?.vary?.orbitRadiusX)} onChange={toggleOrbitVary('x')} />
                  Vary across layers
                </label>
              </div>
              <input
                type="range"
                min={0}
                max={0.5}
                step={0.001}
                value={Math.max(0, Math.min(0.5, Number(currentLayer?.orbitRadiusX ?? 0.15)))}
                onChange={handleOrbitRadiusChange('x')}
                className="dc-slider"
              />
            </div>

            <div>
              <div className="dc-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span className="compact-label">Radius Y</span>
                  <span style={{ opacity: 0.8 }}>{Number(currentLayer?.orbitRadiusY ?? 0).toFixed(3)}</span>
                </div>
                <label className="compact-label" title="Allow Radius Y to vary across layers" onMouseDown={(e) => { e.stopPropagation(); }} onClick={(e) => { e.stopPropagation(); }}>
                  <input type="checkbox" checked={!!(currentLayer?.vary?.orbitRadiusY)} onChange={toggleOrbitVary('y')} />
                  Vary across layers
                </label>
              </div>
              <input
                type="range"
                min={0}
                max={0.5}
                step={0.001}
                value={Math.max(0, Math.min(0.5, Number(currentLayer?.orbitRadiusY ?? 0.15)))}
                onChange={handleOrbitRadiusChange('y')}
                className="dc-slider"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderShapeTab = () => (
    <div className="tab-section">
      <div className="control-card">
        {shapeParams.map(param => (
          <div key={`${param.id}-${Number.isFinite(selectedLayerIndex) ? selectedLayerIndex : 0}`}>
            <DynamicControl param={param} currentLayer={currentLayer} updateLayer={updateLayer} setLayers={setLayers} />
          </div>
        ))}
        {/* Rotation slider for shape layers */}
        {currentLayer?.layerType === 'shape' && (
          <div className="control-group" style={{ marginTop: '0.5rem' }}>
            <div className="dc-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span style={{ fontWeight: 600 }}>Rotate</span>
                <span style={{ opacity: 0.8 }}>{Number(currentLayer?.rotation ?? 0).toFixed(0)}°</span>
              </div>
              <div className="dc-actions" style={{ display: 'flex', gap: '0.4rem' }}>
                <button
                  type="button"
                  className="icon-btn"
                  title="Randomize rotation"
                  aria-label="Randomize rotation"
                  onClick={(e) => {
                    e.stopPropagation();
                    const low = Math.min(rotateMin, rotateMax);
                    const high = Math.max(rotateMin, rotateMax);
                    let v = low + Math.random() * Math.max(0, high - low);
                    // wrap into [-180,180]
                    const wrapped = ((((v + 180) % 360) + 360) % 360) - 180;
                    updateLayer({ rotation: wrapped });
                  }}
                >
                  🎲
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  title="Rotation settings"
                  aria-label="Rotation settings"
                  onClick={(e) => { e.stopPropagation(); setShowRotateSettings(s => !s); }}
                >
                  ⚙
                </button>
              </div>
            </div>
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={Math.max(-180, Math.min(180, Number(currentLayer?.rotation ?? 0)))}
              onChange={(e) => {
                let v = parseFloat(e.target.value);
                if (!Number.isFinite(v)) v = 0;
                // wrap into [-180,180]
                const wrapped = ((((v + 180) % 360) + 360) % 360) - 180;
                updateLayer({ rotation: wrapped });
              }}
              className="dc-slider"
            />
            {showRotateSettings && (
              <div className="dc-settings" style={{ marginTop: '0.5rem', padding: '0.5rem', borderRadius: 6, background: 'rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 5rem auto 5rem', gap: '0.5rem', alignItems: 'center' }}>
                  <label className="compact-label">Min</label>
                  <input
                    type="number"
                    step={1}
                    min={-360}
                    max={360}
                    value={Number.isFinite(rotateMin) ? rotateMin : -180}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setRotateMin(Number.isFinite(v) ? v : -180);
                    }}
                  />
                  <label className="compact-label">Max</label>
                  <input
                    type="number"
                    step={1}
                    min={-360}
                    max={360}
                    value={Number.isFinite(rotateMax) ? rotateMax : 180}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setRotateMax(Number.isFinite(v) ? v : 180);
                    }}
                  />
                </div>
                <div className="compact-row" style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '0.6rem', flexWrap: 'wrap' }}>
                  <label className="compact-label" title="Sample one rotation for all layers or vary per layer when randomizing all">
                    <input
                      type="checkbox"
                      checked={!!rotationVaryAcrossLayers}
                      onChange={(e) => setRotationVaryAcrossLayers && setRotationVaryAcrossLayers(!!e.target.checked)}
                    />
                    Vary across layers
                  </label>
                  <label className="compact-label" title="Include rotation in Randomize All">
                    <input
                      type="checkbox"
                      checked={!!(getIsRnd && getIsRnd('rotation'))}
                      onChange={(e) => setIsRnd && setIsRnd('rotation', !!e.target.checked)}
                    />
                    Include in Randomize All
                  </label>
                </div>
              </div>
            )}
            {/* MIDI Learn for Rotation */}
            {(() => {
              const layerKey = (currentLayer?.name || 'Layer').toString();
              const paramId = `layer:${layerKey}:rotation`;
              return (
                <MidiRotationStatus paramId={paramId} />
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );

  // Appearance tab removed

  // Colour handlers: apply to all layers if vary across layers is OFF
  const handleLayerColorChange = (newColors) => {
    const arr = Array.isArray(newColors) ? newColors : [];
    const n = Math.max(1, arr.length);
    // Effective vary: only vary per-layer if BOTH palette vary and animate-colours vary are ON
    const varyColorsEffective = !!(currentLayer?.vary?.colors) && !!(currentLayer?.vary?.colorFadeEnabled);
    if (!varyColorsEffective && typeof setLayers === 'function') {
      setLayers(prev => prev.map(l => ({ ...l, colors: [...arr], numColors: n, selectedColor: 0 })));
    } else {
      updateLayer({ colors: [...arr], numColors: n, selectedColor: 0 });
    }
  };

  const handleLayerNumColorsChange = (e) => {
    let n = parseInt(e.target.value, 10);
    if (!Number.isFinite(n) || n < 1) n = 1;
    const base = Array.isArray(currentLayer?.colors) ? currentLayer.colors : [];
    let next = base.slice(0, n);
    while (next.length < n) next.push(base[base.length - 1] || '#ffffff');
    // If either numColors vary is OFF or animate-colours vary is OFF, broadcast
    const varyNumEffective = !!(currentLayer?.vary?.numColors) && !!(currentLayer?.vary?.colorFadeEnabled);
    if (!varyNumEffective && typeof setLayers === 'function') {
      // Broadcast same palette and count across all layers when not varying number of colours
      setLayers(prev => prev.map(l => ({
        ...l,
        colors: [...next],
        numColors: n,
        selectedColor: 0,
      })));
    } else {
      updateLayer({ colors: next, numColors: n, selectedColor: 0 });
    }
  };

  const renderColorsTab = () => (
    <div className="tab-section">
      <div className="control-card">
        {/* MIDI Colour Control */}
        <MidiColorSection currentLayer={currentLayer} updateLayer={updateLayer} setLayers={setLayers} />

        {/* Duplicate randomize checkboxes removed; use settings panel toggles below */}

        <label>Number of colours:</label>
        <input
          type="number"
          min={1}
          step={1}
          value={Math.max(1, Number.isFinite(currentLayer?.numColors) ? currentLayer.numColors : (Array.isArray(currentLayer?.colors) ? currentLayer.colors.length : 1))}
          onChange={handleLayerNumColorsChange}
          style={{ width: '5rem' }}
        />

        <label>Colour Preset:</label>
        <select
          value={(() => {
            const colors = Array.isArray(currentLayer?.colors) ? currentLayer.colors : [];
            const idx = matchPaletteIndex(colors);
            return idx === -1 ? 'custom' : String(idx);
          })()}
          onChange={(e) => {
            const val = e.target.value;
            if (val !== 'custom') {
              const idx = parseInt(val, 10);
              if (palettes[idx]) {
                const count = Number.isFinite(currentLayer?.numColors)
                  ? currentLayer.numColors
                  : ((Array.isArray(currentLayer?.colors) ? currentLayer.colors.length : 0) || palettes[idx].colors.length);
                const nextColors = sampleColors(palettes[idx].colors, count);
                const varyColorsEffective = !!(currentLayer?.vary?.colors) && !!(currentLayer?.vary?.colorFadeEnabled);
                if (!varyColorsEffective && typeof setLayers === 'function') {
                  setLayers(prev => prev.map(l => ({ ...l, colors: [...nextColors], numColors: count, selectedColor: 0 })));
                } else {
                  updateLayer({ colors: nextColors, numColors: count, selectedColor: 0 });
                }
              }
            }
          }}
        >
          <option value="custom">Custom</option>
          {palettes.map((p, idx) => (
            <option key={idx} value={idx}>{p.name}</option>
          ))}
        </select>
        {showMidi && (
          <div className="compact-row" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.25rem' }}>
            {(() => {
              const layerKey = (currentLayer?.name || 'Layer').toString();
              const paramId = `layer:${layerKey}:paletteIndex`;
              return (
                <>
                  <span className="compact-label" style={{ opacity: 0.8 }}>
                    MIDI: {midiSupported ? (midiMappings?.[paramId] ? (mappingLabel ? mappingLabel(midiMappings[paramId]) : 'Mapped') : 'Not mapped') : 'Not supported'}
                  </span>
                  {learnParamId === paramId && midiSupported && <span style={{ color: '#4fc3f7' }}>Listening…</span>}
                  <button type="button" className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); beginLearn && beginLearn(paramId); }} disabled={!midiSupported}>Learn</button>
                  <button type="button" className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); clearMapping && clearMapping(paramId); }} disabled={!midiSupported || !midiMappings?.[paramId]}>Clear</button>
                </>
              );
            })()}
          </div>
        )}

        {/* Colours header with settings and random icons */}
        <div className="dc-inner" style={{ marginTop: '0.6rem' }}>
          <div className="dc-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontWeight: 600 }}>Colours</div>
            <div className="dc-actions" style={{ display: 'flex', gap: '0.4rem' }}>
              <button
                type="button"
                className="icon-btn"
                title="Randomize colours for this layer"
                aria-label="Randomize colours"
                onClick={(e) => { e.stopPropagation(); onRandomizeLayerColors && onRandomizeLayerColors(); }}
              >
                🎲
              </button>
              <button
                type="button"
                className="icon-btn"
                title="Colour settings"
                aria-label="Colour settings"
                onClick={(e) => { e.stopPropagation(); setShowColourSettings(s => !s); }}
              >
                ⚙
              </button>
            </div>
          </div>
          {/* Colour settings panel */}
          {showColourSettings && (
            <div className="dc-settings" style={{ marginTop: '0.5rem', padding: '0.5rem', borderRadius: 6, background: 'rgba(255,255,255,0.05)' }}>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <label className="compact-label" title="Allow randomize to change palette">
                  <input
                    type="checkbox"
                    checked={!!randomizePalette}
                    onChange={(e) => setRandomizePalette && setRandomizePalette(!!e.target.checked)}
                  />
                  Randomise palette
                </label>
              <label className="compact-label" title="Allow randomize to change number of colours">
                <input
                  type="checkbox"
                  checked={!!randomizeNumColors}
                  onChange={(e) => setRandomizeNumColors && setRandomizeNumColors(!!e.target.checked)}
                />
                Randomise number of colours
              </label>
              {/* Vary across layers toggles for Colours */}
              <label
                className="compact-label"
                title="Allow colour palette to vary across layers"
                onMouseDown={(e) => { e.stopPropagation(); }}
                onClick={(e) => { e.stopPropagation(); }}
              >
                <input
                  type="checkbox"
                  checked={!!(currentLayer?.vary?.colors)}
                  onChange={(e) => {
                    const checked = !!e.target.checked;
                    const baseColors = Array.isArray(currentLayer?.colors) ? currentLayer.colors : [];
                    const n = Number.isFinite(currentLayer?.numColors) ? Math.max(1, currentLayer.numColors) : (baseColors.length || 1);
                    if (typeof setLayers === 'function') {
                      if (!checked) {
                        // Turning vary OFF: unify palettes across all layers to the selected layer's palette
                        setLayers(prev => prev.map(l => ({
                          ...l,
                          vary: { ...(l?.vary || DEFAULT_LAYER.vary || {}), colors: false },
                          colors: [...baseColors],
                          numColors: n,
                          selectedColor: 0,
                        })));
                      } else {
                        // Turning vary ON: just set the flag
                        setLayers(prev => prev.map(l => ({ ...l, vary: { ...(l?.vary || DEFAULT_LAYER.vary || {}), colors: true } })));
                      }
                    } else {
                      const nextVary = { ...(currentLayer?.vary || DEFAULT_LAYER.vary || {}), colors: checked };
                      const nextUpdate = { vary: nextVary };
                      if (!checked) {
                        nextUpdate.colors = [...baseColors];
                        nextUpdate.numColors = n;
                        nextUpdate.selectedColor = 0;
                      }
                      updateLayer(nextUpdate);
                    }
                  }}
                  onMouseDown={(e) => { e.stopPropagation(); }}
                  onClick={(e) => { e.stopPropagation(); }}
                />
                Vary palette across layers
              </label>
              <label
                className="compact-label"
                title="Allow the number of colours to vary across layers"
                onMouseDown={(e) => { e.stopPropagation(); }}
                onClick={(e) => { e.stopPropagation(); }}
              >
                <input
                  type="checkbox"
                  checked={!!(currentLayer?.vary?.numColors)}
                  onChange={(e) => {
                    const checked = !!e.target.checked;
                    const base = Array.isArray(currentLayer?.colors) ? currentLayer.colors : [];
                    const n = Number.isFinite(currentLayer?.numColors) ? Math.max(1, currentLayer.numColors) : (base.length || 1);
                    let next = base.slice(0, n);
                    while (next.length < n) next.push(base[base.length - 1] || '#ffffff');
                    if (typeof setLayers === 'function') {
                      if (!checked) {
                        // Turning vary OFF: unify colour count (and palette) across layers to selected layer's
                        setLayers(prev => prev.map(l => ({
                          ...l,
                          vary: { ...(l?.vary || DEFAULT_LAYER.vary || {}), numColors: false },
                          colors: [...next],
                          numColors: n,
                          selectedColor: 0,
                        })));
                      } else {
                        // Turning vary ON: just set the flag
                        setLayers(prev => prev.map(l => ({ ...l, vary: { ...(l?.vary || DEFAULT_LAYER.vary || {}), numColors: true } })));
                      }
                    } else {
                      const nextVary = { ...(currentLayer?.vary || DEFAULT_LAYER.vary || {}), numColors: checked };
                      const nextUpdate = { vary: nextVary };
                      if (!checked) {
                        nextUpdate.colors = [...next];
                        nextUpdate.numColors = n;
                        nextUpdate.selectedColor = 0;
                      }
                      updateLayer(nextUpdate);
                    }
                  }}
                  onMouseDown={(e) => { e.stopPropagation(); }}
                  onClick={(e) => { e.stopPropagation(); }}
                />
                Vary number of colours across layers
              </label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 5rem auto 5rem', gap: '0.5rem', alignItems: 'center', marginTop: '0.6rem' }}>
              <label className="compact-label">Min</label>
              <input
                type="number"
                min={1}
                max={colorCountMax || 8}
                value={Math.max(1, Number(colorCountMin || 1))}
                onChange={(e) => setColorCountMin && setColorCountMin(Math.max(1, parseInt(e.target.value || '1', 10)))}
              />
              <label className="compact-label">Max</label>
              <input
                type="number"
                min={colorCountMin || 1}
                max={32}
                value={Math.max(Number(colorCountMin || 1), Number(colorCountMax || 8))}
                onChange={(e) => setColorCountMax && setColorCountMax(Math.max(Number(colorCountMin || 1), parseInt(e.target.value || '8', 10)))}
              />
            </div>
          </div>
          )}
          {/* Animate colours (fade between palette stops) */}
          <div className="dc-inner" style={{ marginTop: '0.5rem' }}>
            <div className="compact-row" style={{ alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem', flexWrap: 'wrap' }}>
              <label className="compact-label" title="Fade smoothly between the colours in this layer's palette"
                onMouseDown={(e) => { e.stopPropagation(); }}
                onClick={(e) => { e.stopPropagation(); }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
              >
                <input
                  type="checkbox"
                  checked={!!currentLayer?.colorFadeEnabled}
                  onChange={(e) => {
                    const v = !!e.target.checked;
                    const varyFade = !!(currentLayer?.vary?.colorFadeEnabled);
                    const ensureTwoStops = (arr) => {
                      if (!Array.isArray(arr) || arr.length === 0) return ['#000000', '#000000'];
                      if (arr.length === 1) return [arr[0], arr[0]];
                      return arr;
                    };
                    if (!varyFade && typeof setLayers === 'function') {
                      // Broadcast enable + speed + ensure >=2 stops across all layers
                      const baseSpeed = Number(currentLayer?.colorFadeSpeed ?? 0);
                      const selSpeed = v ? (baseSpeed > 0 ? baseSpeed : 0.5) : baseSpeed;
                      setLayers(prev => prev.map(l => {
                        const arr = Array.isArray(l.colors) ? l.colors : [];
                        const out = v ? ensureTwoStops(arr) : arr;
                        return { ...l, colorFadeEnabled: v, colorFadeSpeed: selSpeed, colors: out, numColors: Array.isArray(out) ? out.length : (l.numColors || 1) };
                      }));
                    } else {
                      const baseSpeed = Number(currentLayer?.colorFadeSpeed ?? 0);
                      const next = { colorFadeEnabled: v };
                      if (v && baseSpeed <= 0) next.colorFadeSpeed = 0.5;
                      const curCols = Array.isArray(currentLayer?.colors) ? currentLayer.colors : [];
                      if (v && curCols.length < 2) next.colors = ensureTwoStops(curCols);
                      updateLayer(next);
                    }
                  }}
                  onMouseDown={(e) => { e.stopPropagation(); }}
                  onClick={(e) => { e.stopPropagation(); }}
                />
                Animate colours
              </label>
              <label className="compact-label" title="Vary Animate colours across layers"
                onMouseDown={(e) => { e.stopPropagation(); }}
                onClick={(e) => { e.stopPropagation(); }}
              >
                <input
                  type="checkbox"
                  checked={!!(currentLayer?.vary?.colorFadeEnabled)}
                  onChange={(e) => {
                    const checked = !!e.target.checked;
                    const ensureTwoStops = (arr) => {
                      if (!Array.isArray(arr) || arr.length === 0) return ['#000000', '#000000'];
                      if (arr.length === 1) return [arr[0], arr[0]];
                      return arr;
                    };
                    if (typeof setLayers === 'function') {
                      if (!checked) {
                        // Turning vary OFF: broadcast selected layer's current animate state and ensure >=2 stops per layer
                        const selEnabled = !!(currentLayer?.colorFadeEnabled);
                        const baseSpeed = Number(currentLayer?.colorFadeSpeed ?? 0);
                        const selSpeed = selEnabled ? (baseSpeed > 0 ? baseSpeed : 0.5) : baseSpeed;
                        setLayers(prev => prev.map(l => {
                          const arr = Array.isArray(l.colors) ? l.colors : [];
                          const out = selEnabled ? ensureTwoStops(arr) : arr;
                          return { ...l, vary: { ...(l?.vary || DEFAULT_LAYER.vary || {}), colorFadeEnabled: false }, colorFadeEnabled: selEnabled, colorFadeSpeed: selSpeed, colors: out, numColors: Array.isArray(out) ? out.length : (l.numColors || 1) };
                        }));
                      } else {
                        // Turning vary ON: just set the flag
                        setLayers(prev => prev.map(l => ({ ...l, vary: { ...(l?.vary || DEFAULT_LAYER.vary || {}), colorFadeEnabled: true } })));
                      }
                    } else {
                      const nextVary = { ...(currentLayer?.vary || DEFAULT_LAYER.vary || {}), colorFadeEnabled: checked };
                      updateLayer({ vary: nextVary });
                    }
                  }}
                  onMouseDown={(e) => { e.stopPropagation(); }}
                  onClick={(e) => { e.stopPropagation(); }}
                />
                Vary across layers
              </label>
            </div>
            {!!currentLayer?.colorFadeEnabled && (
              <div style={{ marginTop: '0.5rem' }}>
                <div className="compact-row" style={{ alignItems: 'center', gap: '0.6rem' }}>
                  <label className="compact-label">Fade speed</label>
                  <input
                    type="range"
                    min={0}
                    max={4}
                    step={0.01}
                    value={Math.max(0, Math.min(4, Number(currentLayer?.colorFadeSpeed ?? 0.5)))}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      const varyFade = !!(currentLayer?.vary?.colorFadeEnabled);
                      if (!varyFade && typeof setLayers === 'function') {
                        setLayers(prev => prev.map(l => ({ ...l, colorFadeSpeed: v })));
                      } else {
                        updateLayer({ colorFadeSpeed: v });
                      }
                    }}
                    className="dc-slider"
                  />
                  <span style={{ minWidth: 48, textAlign: 'right', opacity: 0.85 }}>{Number(currentLayer?.colorFadeSpeed ?? 0.5).toFixed(2)}</span>
                </div>
                <div style={{ fontSize: '0.8rem', opacity: 0.75, marginTop: '0.25rem' }}>Units: colours per second</div>
              </div>
            )}
          </div>

          <ColorPicker 
            label="Colours"
            colors={Array.isArray(currentLayer?.colors) ? currentLayer.colors : []}
            onChange={handleLayerColorChange}
          />
        </div>
      </div>
    </div>
  );


  // MIDI context for header actions
  const {
    supported: midiSupported,
    mappings: midiMappings,
    registerParamHandler,
    beginLearn,
    clearMapping,
    mappingLabel,
    learnParamId,
  } = useMidi() || {};

  // Register per-layer MIDI handler for Palette Index
  useEffect(() => {
    if (!registerParamHandler || !currentLayer) return;
    const layerKey = (currentLayer?.name || 'Layer').toString();
    const paramId = `layer:${layerKey}:paletteIndex`;
    const unregister = registerParamHandler(paramId, ({ value01 }) => {
      const list = palettes || [];
      if (!Array.isArray(list) || list.length === 0) return;
      const idx = Math.max(0, Math.min(list.length - 1, Math.floor(value01 * list.length)));
      const palette = list[idx];
      const count = Number.isFinite(currentLayer?.numColors)
        ? currentLayer.numColors
        : ((Array.isArray(currentLayer?.colors) ? currentLayer.colors.length : 0) || (palette?.colors?.length ?? 1));
      const src = Array.isArray(palette) ? palette : palette?.colors;
      const nextColors = sampleColors(src || [], count);
      const varyColorsEffective = !!(currentLayer?.vary?.colors) && !!(currentLayer?.vary?.colorFadeEnabled);
      if (!varyColorsEffective && typeof setLayers === 'function') {
        setLayers(prev => prev.map(l => ({ ...l, colors: [...nextColors], numColors: count, selectedColor: 0 })));
      } else {
        updateLayer({ colors: nextColors, numColors: count, selectedColor: 0 });
      }
    });
    return unregister;
  }, [registerParamHandler, currentLayer?.name, currentLayer?.numColors, updateLayer]);

  // Register per-layer MIDI handler for Rotation (-180..180)
  useEffect(() => {
    if (!registerParamHandler || !currentLayer) return;
    const layerKey = (currentLayer?.name || 'Layer').toString();
    const paramId = `layer:${layerKey}:rotation`;
    const unregister = registerParamHandler(paramId, ({ value01 }) => {
      // Map 0..1 to -180..180 linearly
      const v = -180 + (value01 * 360);
      // wrap to [-180,180]
      const wrapped = ((((v + 180) % 360) + 360) % 360) - 180;
      updateLayer({ rotation: wrapped });
    });
    return unregister;
  }, [registerParamHandler, currentLayer?.name, updateLayer]);

  return (
    <div className="controls-panel">
      <div className="controls-header compact" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: '1rem' }}>Layer Controls</h2>
          <div className="compact-row" style={{ gap: '0.4rem' }}>
            <label htmlFor="activeLayerSelect" className="compact-label" style={{ opacity: 0.9 }}>Active layer:</label>
            <select
              id="activeLayerSelect"
              className="compact-select"
              value={Number.isFinite(selectedLayerIndex) ? selectedLayerIndex : 0}
              onChange={(e) => onSelectLayer && onSelectLayer(parseInt(e.target.value, 10))}
            >
              {(layerNames || []).map((_, i) => {
                const idx = Math.max(0, (layerNames?.length || 0) - 1 - i);
                const name = (layerNames && layerNames[idx]) || `Layer ${idx + 1}`;
                return (
                  <option key={idx} value={idx}>{name}</option>
                );
              })}
            </select>
            <button
              type="button"
              className="icon-btn sm"
              title="Add a layer"
              aria-label="Add a layer"
              onClick={() => onAddLayer && onAddLayer()}
            >
              +
            </button>
            <button
              type="button"
              className="icon-btn sm"
              title="Move selected layer up"
              aria-label="Move selected layer up"
              onClick={() => onMoveLayerUp && onMoveLayerUp()}
              disabled={!Number.isFinite(selectedLayerIndex) || selectedLayerIndex >= Math.max(0, (layerNames || []).length - 1)}
            >
              ↑
            </button>
            <button
              type="button"
              className="icon-btn sm"
              title="Move selected layer down"
              aria-label="Move selected layer down"
              onClick={() => onMoveLayerDown && onMoveLayerDown()}
              disabled={!Number.isFinite(selectedLayerIndex) || selectedLayerIndex <= 0}
            >
              ↓
            </button>
            <button
              type="button"
              className="icon-btn sm"
              title="Remove selected layer"
              aria-label="Remove selected layer"
              onClick={() => setShowDeletePicker(true)}
              disabled={((layerNames || []).length) <= 1}
            >
              -
            </button>
          </div>
        </div>
        <div className="controls-actions" style={{ display: 'flex', gap: '0.4rem' }}>
          <button
            type="button"
            className="icon-btn sm"
            title="Import SVG as nodes (adds new layer)"
            aria-label="Import SVG"
            onClick={() => onImportSVG && onImportSVG()}
          >
            SVG
          </button>
          <button
            type="button"
            className="icon-btn sm"
            title="Edit nodes"
            aria-label="Edit nodes"
            onClick={() => setIsNodeEditMode(!isNodeEditMode)}
          >
            {isNodeEditMode ? '⛔' : '✎'}
          </button>
          <button
            type="button"
            className="icon-btn sm"
            title="Randomize selected layer"
            aria-label="Randomize selected layer"
            onClick={() => randomizeCurrentLayer(false)}
          >
            🎲
          </button>
          {showMidi && (
            <>
              <button
                type="button"
                className="btn-compact-secondary"
                onClick={(e) => { e.stopPropagation(); beginLearn && beginLearn('randomizeLayer'); }}
                disabled={!midiSupported}
                title="MIDI Learn: Randomize Current Layer"
              >
                Learn
              </button>
              <button
                type="button"
                className="btn-compact-secondary"
                onClick={(e) => { e.stopPropagation(); clearMapping && clearMapping('randomizeLayer'); }}
                disabled={!midiSupported || !midiMappings?.randomizeLayer}
                title="Clear MIDI for Randomize Current Layer"
              >
                Clear
              </button>
              {midiSupported && (
                <span className="compact-label" style={{ opacity: 0.8 }}>
                  {midiMappings?.randomizeLayer ? (mappingLabel ? mappingLabel(midiMappings.randomizeLayer) : 'Mapped') : 'Not mapped'}
                  {learnParamId === 'randomizeLayer' && <span style={{ marginLeft: '0.5rem', color: '#4fc3f7' }}>Listening…</span>}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Inline delete picker popover */}
      {showDeletePicker && (
        <div className="control-card" style={{ marginTop: '0.5rem' }}>
          <div className="control-row" style={{ alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontWeight: 600 }}>Delete layer</span>
              <select
                value={deleteIndex}
                onChange={(e) => setDeleteIndex(parseInt(e.target.value, 10))}
              >
                {(layerNames || []).map((_, i) => {
                  const idx = Math.max(0, (layerNames?.length || 0) - 1 - i);
                  const name = (layerNames && layerNames[idx]) || `Layer ${idx + 1}`;
                  return (
                    <option key={idx} value={idx}>{name}</option>
                  );
                })}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button
                type="button"
                className="btn-compact-secondary"
                onClick={() => setShowDeletePicker(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-compact-danger"
                onClick={() => {
                  if (((layerNames || []).length) <= 1) return;
                  if (onDeleteLayer) onDeleteLayer(deleteIndex);
                  setShowDeletePicker(false);
                }}
                disabled={((layerNames || []).length) <= 1}
                title={((layerNames || []).length) <= 1 ? 'At least one layer required' : 'Delete selected layer'}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="tabbar">
        {['Shape','Animation','Colors'].map(tab => (
          <button
            key={tab}
            className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'Colors' ? 'Colours' : tab}
          </button>
        ))}
      </div>

      {activeTab === 'Shape' && renderShapeTab()}
      {activeTab === 'Animation' && renderAnimationTab()}
      {activeTab === 'Colors' && renderColorsTab()}
    </div>
  );
});

export default React.memo(Controls);
