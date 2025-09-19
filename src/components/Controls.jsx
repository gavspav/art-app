import React, { useState, useEffect, useMemo, forwardRef, useImperativeHandle, useRef, useCallback } from 'react';
import { useAppState } from '../context/AppStateContext.jsx';
import ColorPicker from './ColorPicker';
import { useParameters } from '../context/ParameterContext.jsx';
import { DEFAULT_LAYER } from '../constants/defaults';
// blendModes no longer used here; Global Style handled in App.jsx
import { palettes } from '../constants/palettes';
import { useMidi } from '../context/MidiContext.jsx';
import { hexToRgb, rgbToHex } from '../utils/colorUtils.js';
import { resolveLayerTargets, applyWithVary } from '../utils/varyUtils.js';

// Per-layer MIDI Position control block
// Minimal stub to avoid build errors; detailed MIDI position UI is handled elsewhere
const MidiPositionSection = ({ currentLayer: _currentLayer, updateLayer: _updateLayer }) => {
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

// MIDI colour block that applies to the active target scope (individual or global)
const MidiColorSection = ({ currentLayer, updateLayer, setLayers, buildTargetSet, targetMode = 'individual' }) => {
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

  // Update a single RGB channel across the selected target scope
  const setChannel = (channel) => (e) => {
    const v = Math.max(0, Math.min(255, Math.round(parseFloat(e.target.value)))) || 0;
    const next = { ...curRGB, [channel]: v };
    const nextHex = rgbToHex(next);
    const nextColors = [...colors];
    nextColors[selIdx] = nextHex;
    const n = Math.max(1, nextColors.length);
    const { effective: targets } = resolveLayerTargets({
      currentLayer,
      buildTargetSet,
      targetMode,
    });
    if (typeof setLayers === 'function' && targets.size > 0) {
      setLayers(prev => applyWithVary({
        layers: prev,
        targets,
        updater: (layer) => ({ ...layer, colors: [...nextColors], numColors: n, selectedColor: 0 }),
      }));
    } else {
      updateLayer({ colors: nextColors });
    }
  };

  const setAlpha = (e) => {
    let v = parseFloat(e.target.value);
    if (!Number.isFinite(v)) v = 1;
    v = Math.max(0, Math.min(1, v));
    const { effective: targets } = resolveLayerTargets({
      currentLayer,
      buildTargetSet,
      targetMode,
    });
    if (typeof setLayers === 'function' && targets.size > 0) {
      setLayers(prev => applyWithVary({
        layers: prev,
        targets,
        updater: (layer) => ({ ...layer, opacity: v }),
      }));
    } else {
      updateLayer({ opacity: v });
    }
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

const DynamicControlBase = ({ param, currentLayer, updateLayer, setLayers, buildTargetSet, targetMode = 'individual' }) => {
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

  const applyUpdateToTargets = useCallback((patchFactory) => {
    const { effective: targets } = resolveLayerTargets({
      currentLayer,
      buildTargetSet,
      targetMode,
    });
    try {
      // Diagnostics: confirm which targets we are about to update for this control
      console.debug('[applyUpdateToTargets]', {
        paramId: id,
        targetMode,
        targets: Array.from(targets || []),
      });
    } catch { /* noop */ }
    const factory = typeof patchFactory === 'function'
      ? patchFactory
      : (() => patchFactory || {});

    if (typeof setLayers === 'function' && targets.size > 0) {
      setLayers(prev => applyWithVary({
        layers: prev,
        targets,
        updater: (layer) => ({
          ...layer,
          ...factory(layer),
        }),
      }));
    } else {
      updateLayer(factory(currentLayer));
    }
  }, [buildTargetSet, currentLayer, id, setLayers, targetMode, updateLayer]);

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
    // Helper to rebuild evenly spaced nodes when syncing polygons
    const makeRegularNodes = (sides) => {
      const n = Math.max(3, Math.round(Number(sides) || 3));
      return Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2;
        return { x: Math.cos(a), y: Math.sin(a) };
      });
    };
    if (id === 'scale') {
      applyUpdateToTargets((layer) => ({
        position: { ...(layer?.position || {}), scale: newValue },
      }));
      return;
    }

    if (id === 'radiusFactor') {
      applyUpdateToTargets((layer) => {
        const prevRF = Number(layer?.radiusFactor);
        const rx = Number(layer?.radiusFactorX);
        const ry = Number(layer?.radiusFactorY);
        const targetRF = Number(newValue);
        const ratioRaw = (Number.isFinite(prevRF) && prevRF > 0) ? (targetRF / prevRF) : targetRF;
        const ratio = Number.isFinite(ratioRaw) && ratioRaw > 0 ? ratioRaw : 1;
        const baseX = Number.isFinite(rx) ? rx : 1;
        const baseY = Number.isFinite(ry) ? ry : 1;
        const nextX = baseX * ratio;
        const nextY = baseY * ratio;
        return { radiusFactor: targetRF, radiusFactorX: nextX, radiusFactorY: nextY };
      });
      return;
    }

    if (id === 'numSides') {
      applyUpdateToTargets((layer) => {
        const n = Math.max(3, Math.round(newValue));
        if (layer?.layerType === 'shape' && layer?.syncNodesToNumSides) {
          return { numSides: n, nodes: makeRegularNodes(n) };
        }
        return { numSides: n };
      });
      return;
    }

    applyUpdateToTargets({ [id]: newValue });
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
        applyUpdateToTargets((layer) => ({
          position: { ...(layer?.position || {}), scale: clamped },
        }));
        return;
      }

      if (id === 'radiusFactor') {
        applyUpdateToTargets((layer) => {
          const prevRF = Number(layer?.radiusFactor);
          const rx = Number(layer?.radiusFactorX);
          const ry = Number(layer?.radiusFactorY);
          const targetRF = Number(clamped);
          const ratioRaw = (Number.isFinite(prevRF) && prevRF > 0) ? (targetRF / prevRF) : targetRF;
          const ratio = Number.isFinite(ratioRaw) && ratioRaw > 0 ? ratioRaw : 1;
          const baseX = Number.isFinite(rx) ? rx : 1;
          const baseY = Number.isFinite(ry) ? ry : 1;
          const nextX = baseX * ratio;
          const nextY = baseY * ratio;
          return { radiusFactor: targetRF, radiusFactorX: nextX, radiusFactorY: nextY };
        });
        return;
      }

      if (id === 'numSides') {
        applyUpdateToTargets((layer) => {
          const n = Math.max(3, Math.round(clamped));
          if (layer?.layerType === 'shape' && layer?.syncNodesToNumSides) {
            const nodes = Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return { x: Math.cos(a), y: Math.sin(a) }; });
            return { numSides: n, nodes };
          }
          return { numSides: n };
        });
        return;
      }

      applyUpdateToTargets({ [id]: clamped });
      return;
    } else if (type === 'dropdown' && Array.isArray(options) && options.length) {
      const choice = options[Math.floor(Math.random() * options.length)];
      applyUpdateToTargets({ [id]: choice });
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

        // Respect target mode when updating via MIDI
        if (id === 'scale') {
          applyUpdateToTargets((layer) => ({
            position: { ...(layer?.position || {}), scale: mapped },
          }));
        } else {
          applyUpdateToTargets({ [id]: mapped });
        }
      } else if (type === 'dropdown' && Array.isArray(options) && options.length) {
        const idx = Math.round(value01 * (options.length - 1));
        const choice = options[Math.max(0, Math.min(options.length - 1, idx))];
        applyUpdateToTargets({ [id]: choice });
      }
    });
    return () => { if (typeof unsub === 'function') unsub(); };
  }, [applyUpdateToTargets, id, max, min, options, registerParamHandler, step, type]);

  // Now short-circuit render if hidden, after hooks are declared
  if (hidden) return null;

  const Header = ({ children }) => (
    <div className="dc-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', pointerEvents: 'auto' }}>
      <div>{children}</div>
      <div className="dc-actions" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', userSelect: 'none' }}>
        <button
          type="button"
          onClick={onClickRandomize}
          onMouseDown={onMouseDownRandomize}
          title="Randomize this parameter"
          aria-label={`Randomize ${label}`}
          className="icon-btn"
          style={{ padding: '0 0.4rem', pointerEvents: 'auto' }}
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
          style={{ padding: '0 0.4rem', pointerEvents: 'auto' }}
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
        style={{ marginTop: '0.4rem', padding: '0.5rem', borderRadius: '6px', background: 'rgba(255,255,255,0.05)' }}
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
              style={{}}
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

// Memoized version: re-render when metadata, target scope, or displayed value changes.
const DynamicControl = React.memo(DynamicControlBase, (prev, next) => {
  if (prev.param !== next.param) return false;
  if (prev.targetMode !== next.targetMode) return false;
  if (!!prev.param?.isRandomizable !== !!next.param?.isRandomizable) return false;

  const prevId = prev.currentLayer?.id;
  const nextId = next.currentLayer?.id;
  if (prevId !== nextId) return false;

  const paramId = prev.param?.id;
  if (!paramId) return false;

  const readValue = (layer) => {
    if (!layer) return undefined;
    if (paramId === 'scale') return layer.position?.scale;
    return layer[paramId];
  };

  if (readValue(prev.currentLayer) !== readValue(next.currentLayer)) return false;

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
  setLayers,
  isNodeEditMode,
  showMidi,
  setIsNodeEditMode,
  randomizePalette,
  setRandomizePalette,
  randomizeNumColors,
  setRandomizeNumColors,
  colorCountMin,
  colorCountMax,
  setColorCountMin,
  setColorCountMax,
  onRandomizeLayerColors,
  getIsRnd,
  setIsRnd,
  layerNames,
  layerIds,
  selectedLayerIndex,
  onSelectLayer,
  onAddLayer,
  onDeleteLayer,
  onImportSVG,
  onMoveLayerUp,
  onMoveLayerDown,
}, ref) => {
  const { parameters } = useParameters();
  const {
    layerGroups = [],
    editTarget,
    setEditTarget,
    selectedLayerIds: selectedLayerIdsCtx = [],
    toggleLayerSelection,
    clearSelection,
    getActiveTargetLayerIds,
    layers: _layers = [],
    parameterTargetMode: contextParameterTargetMode,
  } = useAppState() || {};

  // Local UI state for delete picker
  const [showDeletePicker, setShowDeletePicker] = useState(false);
  const [deleteIndex, setDeleteIndex] = useState(Number.isFinite(selectedLayerIndex) ? selectedLayerIndex : 0);
  const deletePickerRef = useRef(null);
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

  // Ensure delete index stays within range if layer count changes after deletion
  useEffect(() => {
    const names = Array.isArray(layerNames) ? layerNames : [];
    const max = Math.max(0, names.length - 1);
    setDeleteIndex((idx) => Math.max(0, Math.min(max, Number.isFinite(idx) ? idx : 0)));
  }, [layerNames]);

  const selectionCount = Array.isArray(selectedLayerIdsCtx) ? selectedLayerIdsCtx.length : 0;
  const targetMode = contextParameterTargetMode === 'global' ? 'global' : 'individual';
  const layerOptions = useMemo(() => {
    const list = Array.isArray(layerNames) ? layerNames : [];
    const ids = Array.isArray(layerIds) ? layerIds : [];
    const out = [];
    for (let i = 0; i < list.length; i++) {
      const idx = Math.max(0, list.length - 1 - i);
      const name = list[idx] || `Layer ${idx + 1}`;
      out.push({ value: `layer:${idx}`, label: name, layerId: ids[idx] });
    }
    return out;
  }, [layerNames, layerIds]);

  const targetSelectValue = useMemo(() => {
    if (editTarget?.type === 'group' && editTarget.groupId && layerGroups.some(g => g.id === editTarget.groupId)) {
      return `group:${editTarget.groupId}`;
    }
    if (editTarget?.type === 'selection' && selectionCount > 0) {
      return 'selection';
    }
    const idx = Number.isFinite(selectedLayerIndex) ? Math.max(0, selectedLayerIndex) : 0;
    return `layer:${idx}`;
  }, [editTarget, layerGroups, selectionCount, selectedLayerIndex]);

  const buildTargetSet = useCallback((options = {}) => {
    const mode = options.mode || 'targeted'; // 'targeted' or 'all'
    if (mode === 'all') {
      return new Set((layerIds || []).filter(Boolean));
    }
    if (typeof getActiveTargetLayerIds !== 'function') return new Set();
    const ids = getActiveTargetLayerIds();
    return new Set(Array.isArray(ids) ? ids.filter(Boolean) : []);
  }, [getActiveTargetLayerIds, layerIds]);

  const applyTargetedUpdate = useCallback((updater) => {
    const { effective: targets } = resolveLayerTargets({
      currentLayer,
      buildTargetSet,
      targetMode,
    });
    const factory = typeof updater === 'function'
      ? updater
      : (() => updater || {});

    const ids = Array.from(targets || []);
    try {
      console.debug('[Controls] applyTargetedUpdate', targetMode, ids);
    } catch { /* noop */ }

    if (targetMode === 'individual' && ids.length === 1) {
      const nextPatch = factory(currentLayer);
      if (nextPatch && typeof updateLayer === 'function') {
        updateLayer(nextPatch);
        return;
      }
    }

    if (typeof setLayers === 'function' && targets.size > 0) {
      setLayers(prev => applyWithVary({
        layers: prev,
        targets,
        updater: (layer) => ({
          ...layer,
          ...factory(layer),
        }),
      }));
    } else if (typeof factory === 'function') {
      updateLayer(factory(currentLayer));
    }
  }, [buildTargetSet, currentLayer, setLayers, targetMode, updateLayer]);

  const applyRotation = useCallback((wrapped) => {
    const { effective: targets } = resolveLayerTargets({
      currentLayer,
      buildTargetSet,
      targetMode,
    });
    try {
      // Diagnostics: confirm targets for rotation updates
      console.debug('[applyRotation]', {
        targetMode,
        targets: Array.from(targets || []),
        value: wrapped,
      });
    } catch { /* noop */ }
    if (typeof setLayers === 'function' && targets.size > 0) {
      setLayers(prev => applyWithVary({
        layers: prev,
        targets,
        updater: () => ({ rotation: wrapped }),
      }));
    } else {
      updateLayer({ rotation: wrapped });
    }
  }, [buildTargetSet, currentLayer, setLayers, targetMode, updateLayer]);

  // Diagnostics: observe targetMode changes live
  useEffect(() => {
    try {
      console.debug('[Controls] targetMode changed:', targetMode);
      // Expose for quick manual inspection from DevTools if needed
      window.__artapp_targetMode = targetMode;
    } catch { /* noop */ }
  }, [targetMode]);

  const handleTargetSelect = useCallback((e) => {
    const value = e.target.value;
    if (!value) return;
    if (value.startsWith('layer:')) {
      const idx = parseInt(value.slice(6), 10);
      if (Number.isFinite(idx) && onSelectLayer) {
        onSelectLayer(idx);
      }
      if (clearSelection) clearSelection();
      const layerId = Array.isArray(layerIds) ? layerIds[idx] : null;
      if (layerId && toggleLayerSelection) {
        toggleLayerSelection(layerId);
      }
      setEditTarget && setEditTarget({ type: 'single' });
    } else if (value === 'selection') {
      if (selectionCount > 0) {
        setEditTarget && setEditTarget({ type: 'selection' });
      }
    } else if (value.startsWith('group:')) {
      const id = value.slice(6);
      if (id) {
        const group = layerGroups.find(g => g.id === id);
        if (clearSelection) clearSelection();
        if (group && Array.isArray(group.memberIds) && toggleLayerSelection) {
          for (const memberId of group.memberIds) {
            toggleLayerSelection(memberId);
          }
        }
        setEditTarget && setEditTarget({ type: 'group', groupId: id });
      }
    }
  }, [onSelectLayer, selectionCount, setEditTarget, clearSelection, toggleLayerSelection, layerIds, layerGroups]);

  // Keyboard shortcuts while delete popover is open: Enter=Delete, Esc=Cancel
  useEffect(() => {
    if (!showDeletePicker) return;
    const onKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (((layerNames || []).length) > 1 && onDeleteLayer) {
          onDeleteLayer(deleteIndex);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowDeletePicker(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    // Focus the popover for accessibility
    try { deletePickerRef.current && deletePickerRef.current.focus?.(); } catch { /* noop */ }
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showDeletePicker, deleteIndex, onDeleteLayer, layerNames]);

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
  
  // Orbit controls: update according to target mode
  const handleOrbitRadiusChange = (axis) => (e) => {
    let v = parseFloat(e.target.value);
    if (!Number.isFinite(v)) v = 0.0;
    v = Math.max(0, Math.min(0.5, v));
    const key = axis === 'x' ? 'orbitRadiusX' : 'orbitRadiusY';
    applyTargetedUpdate(() => ({ [key]: v }));
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
                <DynamicControl
                  param={param}
                  currentLayer={currentLayer}
                  updateLayer={updateLayer}
                  setLayers={setLayers}
                  buildTargetSet={buildTargetSet}
                  targetMode={targetMode}
                />
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
            <DynamicControl
              param={param}
              currentLayer={currentLayer}
              updateLayer={updateLayer}
              setLayers={setLayers}
              buildTargetSet={buildTargetSet}
              targetMode={targetMode}
            />
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
                    applyRotation(wrapped);
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
                applyRotation(wrapped);
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

  // Colour handlers: apply according to the selected target mode
  const handleLayerColorChange = (newColors) => {
    const arr = Array.isArray(newColors) ? newColors : [];
    const n = Math.max(1, arr.length);
    applyTargetedUpdate(() => ({ colors: [...arr], numColors: n, selectedColor: 0 }));
  };

  const handleLayerNumColorsChange = (e) => {
    let n = parseInt(e.target.value, 10);
    if (!Number.isFinite(n) || n < 1) n = 1;
    applyTargetedUpdate((layer) => {
      const base = Array.isArray(layer?.colors) ? layer.colors : [];
      let next = base.slice(0, n);
      while (next.length < n) next.push(base[base.length - 1] || '#ffffff');
      return { colors: [...next], numColors: n, selectedColor: 0 };
    });
  };

  const renderColorsTab = () => (
    <div className="tab-section">
      <div className="control-card">
        {/* MIDI Colour Control */}
        <MidiColorSection
          currentLayer={currentLayer}
          updateLayer={updateLayer}
          setLayers={setLayers}
          buildTargetSet={buildTargetSet}
          targetMode={targetMode}
        />

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
                applyTargetedUpdate(() => ({ colors: [...nextColors], numColors: count, selectedColor: 0 }));
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
                    const enabled = !!e.target.checked;
                    const ensureTwoStops = (arr) => {
                      if (!Array.isArray(arr) || arr.length === 0) return ['#000000', '#000000'];
                      if (arr.length === 1) return [arr[0], arr[0]];
                      return arr;
                    };
                    const baseSpeed = Number(currentLayer?.colorFadeSpeed ?? 0);
                    const nextSpeed = enabled ? (baseSpeed > 0 ? baseSpeed : 0.5) : baseSpeed;
                    applyTargetedUpdate((layer) => {
                      const arr = Array.isArray(layer?.colors) ? layer.colors : [];
                      const nextColors = enabled ? ensureTwoStops(arr) : arr;
                      const patch = {
                        colorFadeEnabled: enabled,
                        colorFadeSpeed: nextSpeed,
                      };
                      if (enabled) {
                        patch.colors = nextColors;
                        patch.numColors = Array.isArray(nextColors) ? nextColors.length : (layer?.numColors || 1);
                      }
                      return patch;
                    });
                  }}
                  onMouseDown={(e) => { e.stopPropagation(); }}
                  onClick={(e) => { e.stopPropagation(); }}
                />
                Animate colours
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
                      applyTargetedUpdate(() => ({ colorFadeSpeed: v }));
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
      applyTargetedUpdate(() => ({ colors: [...nextColors], numColors: count, selectedColor: 0 }));
    });
    return unregister;
  }, [applyTargetedUpdate, currentLayer, registerParamHandler]);

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
      applyRotation(wrapped);
    });
    return unregister;
  }, [applyRotation, currentLayer, registerParamHandler]);

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
              value={targetSelectValue}
              onChange={handleTargetSelect}
            >
              {layerOptions.length > 0 && (
                <optgroup label="Layers">
                  {layerOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </optgroup>
              )}
              {selectionCount > 0 && (
                <optgroup label="Selection">
                  <option value="selection">Selection ({selectionCount})</option>
                </optgroup>
              )}
              {Array.isArray(layerGroups) && layerGroups.length > 0 && (
                <optgroup label="Groups">
                  {layerGroups.map(group => (
                    <option key={group.id} value={`group:${group.id}`}>
                      {(group.name || 'Group')} ({Array.isArray(group.memberIds) ? group.memberIds.length : 0})
                    </option>
                  ))}
                </optgroup>
              )}
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
        <div className="control-card" style={{ marginTop: '0.5rem' }} ref={deletePickerRef} tabIndex={-1}>
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
                  // Keep the popover open until user clicks Cancel
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
