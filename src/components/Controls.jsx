import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import ColorPicker from './ColorPicker';
import { useParameters } from '../context/ParameterContext.jsx';
import { DEFAULT_LAYER } from '../constants/defaults';
// blendModes no longer used here; Global Style handled in App.jsx
import { palettes } from '../constants/palettes';
import { useMidi } from '../context/MidiContext.jsx';

// Per-layer MIDI Position control block
const MidiPositionSection = ({ currentLayer, updateLayer }) => {
  const {
    mappings: midiMappings,
    registerParamHandler,
    beginLearn,
    clearMapping,
    mappingLabel,
    learnParamId,
    supported: midiSupported,
  } = useMidi() || {};


  const enabled = !!currentLayer?.manualMidiPositionEnabled;
  const layerKey = (currentLayer?.name || 'Layer').toString();
  const idX = `layer:${layerKey}:posX`;
  const idY = `layer:${layerKey}:posY`;
  const idZ = `layer:${layerKey}:posZ`;

  const scaleMin = Number.isFinite(currentLayer?.scaleMin) ? currentLayer.scaleMin : 0.1;
  const scaleMax = Number.isFinite(currentLayer?.scaleMax) ? currentLayer.scaleMax : 1.5;

  // Per-axis output mapping ranges stored on the layer for persistence
  const rangeX = currentLayer?.midiPosRangeX || { min: 0, max: 1 };
  const rangeY = currentLayer?.midiPosRangeY || { min: 0, max: 1 };
  const rangeZ = currentLayer?.midiPosRangeZ || { min: scaleMin, max: scaleMax };

  const setRange = (axis, field) => (e) => {
    const v = parseFloat(e.target.value);
    const key = axis === 'x' ? 'midiPosRangeX' : (axis === 'y' ? 'midiPosRangeY' : 'midiPosRangeZ');
    const cur = axis === 'x' ? rangeX : (axis === 'y' ? rangeY : rangeZ);
    const next = { ...cur, [field]: Number.isFinite(v) ? v : cur[field] };
    updateLayer({ [key]: next });
  };

  // Handlers for sliders
  const onX = (e) => updateLayer({ position: { ...currentLayer.position, x: Math.max(0, Math.min(1, parseFloat(e.target.value))) } });
  const onY = (e) => updateLayer({ position: { ...currentLayer.position, y: Math.max(0, Math.min(1, parseFloat(e.target.value))) } });
  const onZ = (e) => {
    let v = parseFloat(e.target.value);
    if (!Number.isFinite(v)) v = scaleMin;
    v = Math.max(scaleMin, Math.min(scaleMax, v));
    updateLayer({ position: { ...currentLayer.position, scale: v } });
  };

  // MIDI handlers for position are now registered globally so that layers update even when not selected.

  const toggleEnabled = (e) => {
    const on = !!e.target.checked;
    if (on) {
      // Persist previous speeds so we can restore later
      const prevMove = Number.isFinite(currentLayer?.movementSpeed)
        ? currentLayer.movementSpeed
        : DEFAULT_LAYER.movementSpeed;
      const prevScale = Number.isFinite(currentLayer?.scaleSpeed)
        ? currentLayer.scaleSpeed
        : DEFAULT_LAYER.scaleSpeed;
      updateLayer({
        manualMidiPositionEnabled: true,
        movementSpeed: 0,
        scaleSpeed: 0,
        // store previous values on the layer
        _prevMovementSpeed: prevMove,
        _prevScaleSpeed: prevScale,
        position: { ...currentLayer.position, vx: 0, vy: 0 },
      });
    } else {
      // Restore previous speeds (fallback to defaults if missing)
      const restoredMove = Number.isFinite(currentLayer?._prevMovementSpeed)
        ? currentLayer._prevMovementSpeed
        : (Number.isFinite(currentLayer?.movementSpeed) ? currentLayer.movementSpeed : DEFAULT_LAYER.movementSpeed);
      const restoredScale = Number.isFinite(currentLayer?._prevScaleSpeed)
        ? currentLayer._prevScaleSpeed
        : (Number.isFinite(currentLayer?.scaleSpeed) ? currentLayer.scaleSpeed : DEFAULT_LAYER.scaleSpeed);

      // Recompute velocities based on movementAngle and restored movement speed
      const ang = Number.isFinite(currentLayer?.movementAngle) ? currentLayer.movementAngle : DEFAULT_LAYER.movementAngle;
      const angleRad = ang * (Math.PI / 180);
      const vx = Math.cos(angleRad) * (restoredMove * 0.001) * 1.0;
      const vy = Math.sin(angleRad) * (restoredMove * 0.001) * 1.0;

      updateLayer({
        manualMidiPositionEnabled: false,
        movementSpeed: restoredMove,
        scaleSpeed: restoredScale,
        // clear cached prev values to avoid stale state
        _prevMovementSpeed: undefined,
        _prevScaleSpeed: undefined,
        position: { ...currentLayer.position, vx, vy },
      });
    }
  };

  return (
    <div className="control-card">
      <div className="control-row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
        <div style={{ fontWeight: 600 }}>MIDI Position Control</div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }} title="Enable manual MIDI control for X/Y/Z; disables animation controls">
          <input type="checkbox" checked={enabled} onChange={toggleEnabled} />
          Enable
        </label>
      </div>

      {enabled && (
        <>
          {/* X */}
          <div className="dc-inner" style={{ marginTop: '0.5rem' }}>
            <div className="dc-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>X: {Number(currentLayer?.position?.x || 0).toFixed(3)}</div>
              <div className="dc-actions" style={{ display: 'flex', gap: '0.4rem' }}>
                <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); beginLearn && beginLearn(idX); }} disabled={!midiSupported}>Learn</button>
                <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); clearMapping && clearMapping(idX); }} disabled={!midiSupported || !midiMappings?.[idX]}>Clear</button>
              </div>
            </div>
            <input type="range" min={0} max={1} step={0.001} value={Math.max(0, Math.min(1, Number(currentLayer?.position?.x || 0)))} onChange={onX} className="dc-slider" />
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 5rem auto 5rem', gap: '0.35rem', marginTop: '0.35rem', alignItems: 'center' }}>
              <label style={{ opacity: 0.85 }}>Out Min</label>
              <input type="number" step={0.001} value={Number(rangeX.min ?? 0)} onChange={setRange('x','min')} />
              <label style={{ opacity: 0.85 }}>Out Max</label>
              <input type="number" step={0.001} value={Number(rangeX.max ?? 1)} onChange={setRange('x','max')} />
            </div>
            <div style={{ fontSize: '0.8rem', opacity: 0.8, marginTop: '0.25rem' }}>
              MIDI: {(!midiSupported) ? 'Not supported' : (midiMappings && midiMappings[idX] ? (mappingLabel ? mappingLabel(midiMappings[idX]) : 'Mapped') : 'Not mapped')}
              {learnParamId === idX && midiSupported && <span style={{ marginLeft: '0.5rem', color: '#4fc3f7' }}>Listening…</span>}
            </div>
          </div>

          {/* Y */}
          <div className="dc-inner" style={{ marginTop: '0.5rem' }}>
            <div className="dc-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>Y: {Number(currentLayer?.position?.y || 0).toFixed(3)}</div>
              <div className="dc-actions" style={{ display: 'flex', gap: '0.4rem' }}>
                <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); beginLearn && beginLearn(idY); }} disabled={!midiSupported}>Learn</button>
                <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); clearMapping && clearMapping(idY); }} disabled={!midiSupported || !midiMappings?.[idY]}>Clear</button>
              </div>
            </div>
            <input type="range" min={0} max={1} step={0.001} value={Math.max(0, Math.min(1, Number(currentLayer?.position?.y || 0)))} onChange={onY} className="dc-slider" />
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 5rem auto 5rem', gap: '0.35rem', marginTop: '0.35rem', alignItems: 'center' }}>
              <label style={{ opacity: 0.85 }}>Out Min</label>
              <input type="number" step={0.001} value={Number(rangeY.min ?? 0)} onChange={setRange('y','min')} />
              <label style={{ opacity: 0.85 }}>Out Max</label>
              <input type="number" step={0.001} value={Number(rangeY.max ?? 1)} onChange={setRange('y','max')} />
            </div>
            <div style={{ fontSize: '0.8rem', opacity: 0.8, marginTop: '0.25rem' }}>
              MIDI: {(!midiSupported) ? 'Not supported' : (midiMappings && midiMappings[idY] ? (mappingLabel ? mappingLabel(midiMappings[idY]) : 'Mapped') : 'Not mapped')}
              {learnParamId === idY && midiSupported && <span style={{ marginLeft: '0.5rem', color: '#4fc3f7' }}>Listening…</span>}
            </div>
          </div>

          {/* Z (scale) */}
          <div className="dc-inner" style={{ marginTop: '0.5rem' }}>
            <div className="dc-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>Z (Scale): {Number(currentLayer?.position?.scale || 1).toFixed(3)}</div>
              <div className="dc-actions" style={{ display: 'flex', gap: '0.4rem' }}>
                <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); beginLearn && beginLearn(idZ); }} disabled={!midiSupported}>Learn</button>
                <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); clearMapping && clearMapping(idZ); }} disabled={!midiSupported || !midiMappings?.[idZ]}>Clear</button>
              </div>
            </div>
            <input type="range" min={scaleMin} max={scaleMax} step={0.001} value={Math.max(scaleMin, Math.min(scaleMax, Number(currentLayer?.position?.scale || 1)))} onChange={onZ} className="dc-slider" />
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 5rem auto 5rem', gap: '0.35rem', marginTop: '0.35rem', alignItems: 'center' }}>
              <label style={{ opacity: 0.85 }}>Out Min</label>
              <input type="number" step={0.001} value={Number(rangeZ.min ?? scaleMin)} onChange={setRange('z','min')} />
              <label style={{ opacity: 0.85 }}>Out Max</label>
              <input type="number" step={0.001} value={Number(rangeZ.max ?? scaleMax)} onChange={setRange('z','max')} />
            </div>
            <div style={{ fontSize: '0.8rem', opacity: 0.8, marginTop: '0.25rem' }}>
              Range: {scaleMin}–{scaleMax}. MIDI: {(!midiSupported) ? 'Not supported' : (midiMappings && midiMappings[idZ] ? (mappingLabel ? mappingLabel(midiMappings[idZ]) : 'Mapped') : 'Not mapped')}
              {learnParamId === idZ && midiSupported && <span style={{ marginLeft: '0.5rem', color: '#4fc3f7' }}>Listening…</span>}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// Per-layer MIDI Colour control block (RGBA)
const MidiColorSection = ({ currentLayer, updateLayer }) => {
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

  const hexToRgb = (hex) => {
    const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || '');
    if (!m) return { r: 0, g: 0, b: 0 };
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
  };
  const rgbToHex = ({ r, g, b }) => {
    const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
    return `#${c(r)}${c(g)}${c(b)}`;
  };

  const curRGB = hexToRgb(curHex);

  const setChannel = (channel) => (e) => {
    const v = Math.max(0, Math.min(255, Math.round(parseFloat(e.target.value)))) || 0;
    const next = { ...curRGB, [channel]: v };
    const nextHex = rgbToHex(next);
    const nextColors = [...colors];
    nextColors[selIdx] = nextHex;
    updateLayer({ colors: nextColors });
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
          <input type="checkbox" checked={enabled} onChange={toggleEnabled} />
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

const DynamicControlBase = ({ param, currentLayer, updateLayer }) => {
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

  let value = currentLayer[id];

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
    // Custom mapping for scale
    if (id === 'scale') {
      // Update position.scale for uniform scaling
      updateLayer({ position: { ...currentLayer.position, scale: newValue } });
    } else {
      updateLayer({ [id]: newValue });
    }
  };

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
        updateLayer({ position: { ...currentLayer.position, scale: clamped } });
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
    const nextVary = { ...(currentLayer.vary || DEFAULT_LAYER.vary || {}), [key]: checked };
    updateLayer({ vary: nextVary });
  };

  // Determine visibility but do not return yet to preserve hook order
  const hidden = (
    (currentLayer.layerType === 'image' && param.group === 'Shape') ||
    (currentLayer.layerType !== 'image' && param.group === 'Image Effects')
  );

  const onClickSettings = (e) => {
    e.stopPropagation();
    console.log('[Controls] Settings toggled for param', id);
    setShowSettings(s => !s);
  };

  const onClickRandomize = (e) => {
    e.stopPropagation();
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
          updateLayer({ position: { ...currentLayer.position, scale: mapped } });
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
    <div className="dc-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', pointerEvents: 'auto', position: 'relative', zIndex: 1 }}>
      <div>{children}</div>
      <div className="dc-actions" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <button
          type="button"
          onClick={onClickSettings}
          title="Parameter settings"
          aria-label={`Settings for ${label}`}
          className="icon-btn"
          style={{ padding: '0 0.4rem', pointerEvents: 'auto', position: 'relative', zIndex: 2 }}
          tabIndex={0}
        >
          ⚙
        </button>
        <button
          type="button"
          onClick={onClickRandomize}
          title="Randomize this parameter"
          aria-label={`Randomize ${label}`}
          className="icon-btn"
          style={{ padding: '0 0.4rem', pointerEvents: 'auto', position: 'relative', zIndex: 2 }}
          tabIndex={0}
        >
          🎲
        </button>
      </div>
    </div>
  );

  const SettingsPanel = () => (
    <div className="dc-settings" style={{ marginTop: '0.4rem', padding: '0.5rem', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', display: showSettings ? 'block' : 'none' }}>
      {type === 'slider' && (
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
      )}
      {type !== 'slider' && (
        <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>No numeric bounds for this control.</div>
      )}
      <div style={{ marginTop: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        {varyKey && (
          <label title="Allow this parameter to vary across layers" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            <input type="checkbox" checked={!!(currentLayer?.vary?.[varyKey])} onChange={toggleVaryFlag} />
            Vary across layers
          </label>
        )}
        <label title="Include this parameter when using Randomize All" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
          <input type="checkbox" checked={!!param.isRandomizable} onChange={onToggleRandomizable} />
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
              disabled={!midiSupported || !(midiMappings && midiMappings[id])}
              title="Clear MIDI mapping for this parameter"
            >
              Clear
            </button>
          </div>
        </div>
      </div>
    </div>
  );

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
              {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
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

  const id = prev.param?.id;
  if (!id) return false;

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
  randomizeAll, 
  isFrozen, 
  setIsFrozen,
  globalSpeedMultiplier,
  setGlobalSpeedMultiplier,
  // decoupled: do not pass full layers array to avoid frequent re-renders
  setLayers,
  // new lightweight props derived from the first/base layer
  baseColors,
  baseNumColors,
  isNodeEditMode,
  setIsNodeEditMode,
  classicMode,
  setClassicMode,
  // Global color randomization toggles
  randomizePalette,
  setRandomizePalette,
  randomizeNumColors,
  setRandomizeNumColors,
  // Lightweight layer navigation controls
  layerNames,
  selectedLayerIndex,
  onSelectLayer,
  onAddLayer,
  onDeleteLayer,
}, ref) => {
  const { parameters } = useParameters();

  // Local UI state for delete picker
  const [showDeletePicker, setShowDeletePicker] = useState(false);
  const [deleteIndex, setDeleteIndex] = useState(Number.isFinite(selectedLayerIndex) ? selectedLayerIndex : 0);
  // Tab state must be initialized before any early returns to keep hook order stable
  const [activeTab, setActiveTab] = useState('Shape');

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

  // PER-LAYER color handlers — apply only to the selected layer
  const handleLayerColorChange = (newColors) => {
    const arr = Array.isArray(newColors) ? newColors : [];
    updateLayer({ colors: arr, numColors: arr.length, selectedColor: 0 });
  };

  const handleLayerNumColorsChange = (e) => {
    let n = parseInt(e.target.value, 10);
    if (!Number.isFinite(n) || n < 1) n = 1;
    const base = Array.isArray(currentLayer.colors) ? currentLayer.colors : [];
    const pIdx = matchPaletteIndex(base);
    let newColors = [];
    if (pIdx !== -1) {
      newColors = sampleColors(palettes[pIdx].colors, n);
    } else if (base.length > 0) {
      if (n <= base.length) newColors = base.slice(0, n);
      else {
        newColors = [...base];
        let i = 0;
        while (newColors.length < n) {
          newColors.push(base[i % base.length]);
          i++;
        }
      }
    } else {
      newColors = sampleColors(palettes[0]?.colors || ['#000000'], n);
    }
    updateLayer({ numColors: n, colors: newColors, selectedColor: 0 });
  };

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
              <div key={param.id}>
                <DynamicControl param={param} currentLayer={currentLayer} updateLayer={updateLayer} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderShapeTab = () => (
    <div className="tab-section">
      <div className="control-card">
        {shapeParams.map(param => (
          <div key={param.id}>
            <DynamicControl param={param} currentLayer={currentLayer} updateLayer={updateLayer} />
          </div>
        ))}
      </div>
    </div>
  );

  // Appearance tab removed

  const renderColorsTab = () => (
    <div className="tab-section">
      <div className="control-card">
        {/* MIDI Colour Control */}
        <MidiColorSection currentLayer={currentLayer} updateLayer={updateLayer} />

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '0.5rem' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }} title="Allow Randomize All to change the color preset">
            <input type="checkbox" checked={!!randomizePalette} onChange={(e) => { e.stopPropagation(); console.log('[Colors] randomizePalette', e.target.checked); setRandomizePalette(!!e.target.checked); }} />
            Randomise palette
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }} title="Allow Randomize All to change the number of colors">
            <input type="checkbox" checked={!!randomizeNumColors} onChange={(e) => { e.stopPropagation(); console.log('[Colors] randomizeNumColors', e.target.checked); setRandomizeNumColors(!!e.target.checked); }} />
            Randomise number of colours
          </label>
        </div>

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
                updateLayer({ colors: nextColors, numColors: count, selectedColor: 0 });
              }
            }
          }}
        >
          <option value="custom">Custom</option>
          {palettes.map((p, idx) => (
            <option key={idx} value={idx}>{p.name}</option>
          ))}
        </select>

        <ColorPicker 
          label="Colours"
          colors={Array.isArray(currentLayer?.colors) ? currentLayer.colors : []}
          onChange={handleLayerColorChange}
        />
      </div>
    </div>
  );


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
              {(layerNames || []).map((name, i) => (
                <option key={i} value={i}>{name || `Layer ${i + 1}`}</option>
              ))}
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
                {(layerNames || []).map((name, i) => (
                  <option key={i} value={i}>{name || `Layer ${i + 1}`}</option>
                ))}
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

export default Controls;