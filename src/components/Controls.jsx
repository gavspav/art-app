import React, { useState, useEffect, useMemo, forwardRef, useImperativeHandle, useRef, useCallback } from 'react';
import ColorPicker from './ColorPicker';
import BufferedNumberInput from './common/BufferedNumberInput.jsx';
import { getOperationalMaxHint } from '../utils/parameterOperationalHints.js';
import { useParameters } from '../context/ParameterContext.jsx';
import { DEFAULT_LAYER } from '../constants/defaults';
// blendModes no longer used here; Global Style handled in App.jsx
import { useMidi } from '../context/MidiContext.jsx';
import { useAudioReactive } from '../context/AudioContext.jsx';
import { useBPM } from '../context/BPMContext.jsx';
import { hexToRgb, rgbToHex } from '../utils/colorUtils.js';
import { resolveLayerTargets, applyWithVary } from '../utils/varyUtils.js';
import { resizeNodes, computeInitialNodes } from '../utils/nodeUtils.js';
import { isSettingsDebugEnabled, throttledSettingsDebugLog } from '../utils/settingsDebug.js';
import BPMEnvelopeEditor, { DEFAULT_ENVELOPE } from './common/BPMEnvelopeEditor.jsx';

// Custom hover-based dropdown component
const HoverDropdown = ({ value, options, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredValue, setHoveredValue] = useState(value);
  const dropdownRef = useRef(null);
  const menuRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Update hovered value when value prop changes
  useEffect(() => {
    setHoveredValue(value);
  }, [value]);

  const handleToggle = (e) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  const handleItemHover = (itemValue) => {
    setHoveredValue(itemValue);
    // Trigger onChange on hover to preview the layer
    onChange(itemValue);
  };

  const handleItemClick = (e, itemValue) => {
    e.stopPropagation();
    onChange(itemValue);
    setHoveredValue(itemValue);
    setIsOpen(false);
  };

  // Find the current label
  const currentLabel = useMemo(() => {
    for (const group of options) {
      const item = group.items.find(i => i.value === value);
      if (item) return item.label;
    }
    return 'Select...';
  }, [value, options]);

  return (
    <div className="hover-dropdown" ref={dropdownRef} style={{ display: 'inline-block', width: '100%' }}>
      <button
        type="button"
        className="hover-dropdown-toggle compact-select"
        onClick={handleToggle}
        style={{
          padding: '0.25rem 0.5rem',
          cursor: 'pointer',
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: '4px',
          background: 'rgba(255,255,255,0.05)',
          color: 'inherit',
          fontSize: 'inherit',
          minWidth: '150px',
          width: '100%',
          textAlign: 'left',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>{currentLabel}</span>
        <span style={{ marginLeft: '0.5rem', opacity: 0.6 }}>{isOpen ? '▲' : '▼'}</span>
      </button>
      {isOpen && (
        <div
          ref={menuRef}
          className="hover-dropdown-menu"
          style={{
            marginTop: '2px',
            marginBottom: '0.5rem',
            width: '100%',
            maxHeight: '400px',
            overflowY: 'auto',
            background: 'rgba(20, 20, 30, 0.98)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            backdropFilter: 'blur(10px)',
          }}
        >
          {options.map((group, groupIdx) => (
            <div key={groupIdx} style={{ padding: '0.25rem 0' }}>
              {group.label && (
                <div
                  style={{
                    padding: '0.35rem 0.75rem',
                    fontSize: '0.75rem',
                    fontWeight: 'bold',
                    opacity: 0.6,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  {group.label}
                </div>
              )}
              {group.items.map((item) => (
                <div
                  key={item.value}
                  onMouseEnter={() => handleItemHover(item.value)}
                  onClick={(e) => handleItemClick(e, item.value)}
                  style={{
                    padding: '0.5rem 0.75rem',
                    cursor: 'pointer',
                    background: hoveredValue === item.value ? 'rgba(100, 150, 255, 0.3)' : 'transparent',
                    transition: 'background 0.1s ease',
                    borderLeft: value === item.value ? '3px solid rgba(100, 150, 255, 0.8)' : '3px solid transparent',
                  }}
                >
                  {item.label}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

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

// Audio control row - compact version for layer parameters
const AudioRotationStatus = ({ paramId, min = 0, max = 1 }) => {
  const audio = useAudioReactive();
  const bpm = useBPM();
  const midi = useMidi();
  
  if (!audio) return null;
  
  const { mappings, setMapping, AUDIO_BANDS } = audio;
  const mapping = mappings?.[paramId];
  const currentBand = mapping?.band || 'none';
  
  // Use parameter's min/max as default output range (simplified - no inputMin/inputMax)
  const defaultRange = { outputMin: min, outputMax: max };
  
  // Auto-fix stale mappings that have wrong output range values
  useEffect(() => {
    if (mapping && mapping.band !== 'none' && mapping.range) {
      const storedMin = mapping.range.outputMin;
      const storedMax = mapping.range.outputMax;
      // If stored output range doesn't match parameter's actual range, update it
      if (storedMin !== min || storedMax !== max) {
        setMapping(paramId, { 
          ...mapping, 
          range: { ...mapping.range, outputMin: min, outputMax: max } 
        });
      }
    }
  }, [paramId, min, max, mapping, setMapping]);
  
  const handleBandChange = (band) => {
    if (band === 'none') {
      setMapping(paramId, { band: 'none', range: defaultRange });
    } else {
      // Always use defaultRange to ensure correct output min/max
      setMapping(paramId, { band, range: defaultRange });
      // Clear MIDI and BPM (mutual exclusivity)
      if (midi?.clearMapping) midi.clearMapping(paramId);
      if (bpm?.setMapping) bpm.setMapping(paramId, { enabled: false, speed: 1, loopMode: 'forward', range: bpm.DEFAULT_RANGE || { outputMin: 0, outputMax: 1 } });
    }
  };
  
  return (
    <div className="compact-row" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.35rem' }}>
      <span className="compact-label" style={{ opacity: 0.8, fontSize: '0.7rem' }}>Audio:</span>
      <select
        className="compact-select"
        style={{ fontSize: '0.7rem', padding: '2px 4px', minWidth: '4rem' }}
        value={currentBand}
        onChange={(e) => handleBandChange(e.target.value)}
      >
        {AUDIO_BANDS.map(b => (
          <option key={b} value={b}>
            {b === 'none' ? 'None' : b === 'rms' ? 'Level' : b.charAt(0).toUpperCase() + b.slice(1)}
          </option>
        ))}
      </select>
    </div>
  );
};

// BPM control row - compact version for layer parameters
const BPMRotationStatus = React.memo(({ paramId, min = 0, max = 1 }) => {
  const bpm = useBPM();
  const audio = useAudioReactive();
  const midi = useMidi();
  const [showEnvelope, setShowEnvelope] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      const stored = window.localStorage.getItem(`bpm-env-open-${paramId}`);
      return stored === 'true';
    } catch {
      return false;
    }
  });
  const [playheadPosition, setPlayheadPosition] = useState(null);
  
  if (!bpm) return null;
  
  const { mappings, setMapping, getPhaseForParam, isPlaying, BEAT_SPEEDS, LOOP_MODES, beatsPerBar } = bpm;
  
  // Poll for playhead position when envelope is shown and playing
  useEffect(() => {
    if (!showEnvelope || !isPlaying || !getPhaseForParam) return;
    
    let frameId;
    const updatePlayhead = () => {
      const phase = getPhaseForParam(paramId);
      setPlayheadPosition(phase);
      frameId = requestAnimationFrame(updatePlayhead);
    };
    frameId = requestAnimationFrame(updatePlayhead);
    
    return () => {
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [showEnvelope, isPlaying, getPhaseForParam, paramId]);
  // Persist envelope open state so remounts don't auto-close it
  useEffect(() => {
    try {
      window.localStorage.setItem(`bpm-env-open-${paramId}`, showEnvelope ? 'true' : 'false');
    } catch { /* ignore */ }
  }, [showEnvelope, paramId]);
  const mapping = mappings?.[paramId];
  const isEnabled = mapping?.enabled || false;
  const currentSpeed = mapping?.speed || 1;
  const currentLoopMode = mapping?.loopMode || 'forward';
  const currentEnvelope = mapping?.envelope || DEFAULT_ENVELOPE;
  
  // Use parameter's min/max as default output range
  const defaultRange = { outputMin: min, outputMax: max };
  
  // Auto-fix stale mappings that have wrong range values
  useEffect(() => {
    if (mapping?.enabled && mapping?.range) {
      const storedMin = mapping.range.outputMin;
      const storedMax = mapping.range.outputMax;
      // If stored range doesn't match parameter's actual range, update it
      if (storedMin !== min || storedMax !== max) {
        setMapping(paramId, { ...mapping, range: { outputMin: min, outputMax: max } });
      }
    }
  }, [paramId, min, max, mapping, setMapping]);
  
  const handleToggle = () => {
    // Always use defaultRange when toggling to ensure correct min/max
    const rangeToUse = defaultRange;
    if (isEnabled) {
      setMapping(paramId, { enabled: false, speed: currentSpeed, loopMode: currentLoopMode, range: rangeToUse, envelope: currentEnvelope });
    } else {
      setMapping(paramId, { enabled: true, speed: currentSpeed, loopMode: currentLoopMode, range: rangeToUse, envelope: currentEnvelope });
      // Clear MIDI and Audio (mutual exclusivity)
      if (midi?.clearMapping) midi.clearMapping(paramId);
      if (audio?.setMapping) audio.setMapping(paramId, { band: 'none', range: audio.DEFAULT_RANGE || { outputMin: 0, outputMax: 1 } });
    }
  };
  
  const handleSpeedChange = (speed) => {
    // Always use defaultRange to ensure correct min/max for this parameter
    setMapping(paramId, { enabled: isEnabled, speed: Number(speed), loopMode: currentLoopMode, range: defaultRange, envelope: currentEnvelope });
  };
  
  const handleLoopModeChange = (loopMode) => {
    // Always use defaultRange to ensure correct min/max for this parameter
    setMapping(paramId, { enabled: isEnabled, speed: currentSpeed, loopMode, range: defaultRange, envelope: currentEnvelope });
  };
  
  const handleEnvelopeChange = (newEnvelope) => {
    console.debug('[Controls] handleEnvelopeChange', { paramId, newEnvelope });
    setMapping(paramId, { enabled: isEnabled, speed: currentSpeed, loopMode: currentLoopMode, range: defaultRange, envelope: newEnvelope });
  };
  
  return (
    <div style={{ marginTop: '0.35rem' }}>
      <div className="compact-row" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
        <span className="compact-label" style={{ opacity: 0.8, fontSize: '0.7rem' }}>BPM:</span>
        <input
          type="checkbox"
          checked={isEnabled}
          onChange={handleToggle}
          style={{ cursor: 'pointer' }}
        />
        {isEnabled && (
          <>
            <select
              className="compact-select"
              style={{ fontSize: '0.7rem', padding: '2px 4px', minWidth: '3rem' }}
              value={currentSpeed}
              onChange={(e) => handleSpeedChange(e.target.value)}
            >
              {BEAT_SPEEDS.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <select
              className="compact-select"
              style={{ fontSize: '0.7rem', padding: '2px 4px', minWidth: '4rem' }}
              value={currentLoopMode}
              onChange={(e) => handleLoopModeChange(e.target.value)}
            >
              {LOOP_MODES.map(mode => (
                <option key={mode} value={mode}>
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn-compact-secondary"
              style={{ fontSize: '0.65rem', padding: '2px 4px', background: showEnvelope ? 'rgba(79, 195, 247, 0.3)' : undefined }}
              onClick={() => setShowEnvelope(s => !s)}
              title="Edit envelope curve"
            >
              Env
            </button>
          </>
        )}
      </div>
      {/* Envelope editor */}
      {showEnvelope && isEnabled && (
        <div style={{ marginTop: '0.5rem' }}>
          <BPMEnvelopeEditor
            envelope={currentEnvelope}
            onChange={handleEnvelopeChange}
            beatsPerBar={beatsPerBar || 4}
            playheadPosition={playheadPosition}
          />
        </div>
      )}
    </div>
  );
});

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

const DynamicControlBase = ({ param, currentLayer, updateLayer, setLayers, buildTargetSet, targetMode = 'individual', editTarget, debugSettingsEnabled }) => {
  const { updateParameter } = useParameters();
  const { id, type, min, max, step, label, options } = param;
  const [showSettings, setShowSettings] = useState(false);
  const settingsRenderCountRef = useRef(0);
  const debugLog = useCallback((...args) => {
    if (debugSettingsEnabled && typeof console !== 'undefined') {
      console.debug(...args);
    }
  }, [debugSettingsEnabled]);

  // Track settings open/close events for this control
  useEffect(() => {
    if (!debugSettingsEnabled) return;
    settingsRenderCountRef.current = 0;
    console.info(`[settings] ${id} ${showSettings ? 'opened' : 'closed'}`);
  }, [debugSettingsEnabled, id, showSettings]);

  // Track render count while settings panel is visible
  useEffect(() => {
    if (!debugSettingsEnabled || !showSettings) return;
    settingsRenderCountRef.current += 1;
    const count = settingsRenderCountRef.current;
    if (count === 1 || count % 10 === 0) {
      debugLog(`[settings] render #${count} for ${id}`, {
        targetMode,
        valueSnapshot: currentLayer?.[id],
      });
    }
  }, [currentLayer, debugLog, id, showSettings, targetMode, debugSettingsEnabled]);
  const {
    mappings: midiMappings,
    registerParamHandler,
    beginLearn,
    clearMapping,
    mappingLabel,
    learnParamId,
    supported: midiSupported,
  } = useMidi() || {};

  const bpm = useBPM();
  const audioReactive = useAudioReactive();
  const bpmParamId = useMemo(
    () => `layer:${(currentLayer?.name || 'Layer').toString()}:${id}`,
    [currentLayer?.name, id],
  );
  const bpmMapped = !!bpm?.mappings?.[bpmParamId]?.enabled;
  const bpmPlaying = !!bpm?.isPlaying;
  const audioMapped = !!(audioReactive?.mappings?.[bpmParamId] && audioReactive.mappings[bpmParamId].band && audioReactive.mappings[bpmParamId].band !== 'none');
  const audioEnabled = !!audioReactive?.settings?.enabled;
  
  // Note: Audio and BPM modulation is now handled in the animation loop (useAnimation.js)
  // to prevent excessive re-renders. Handlers are not registered here.
  // The AudioRotationStatus and BPMRotationStatus components use their own hooks internally.

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
      const targetScale = newValue;
      const refScale = Number(currentLayer?.position?.scale);
      const hasGlobalRatio = targetMode === 'global'
        && Number.isFinite(refScale)
        && Math.abs(refScale) > 1e-9;
      const ratio = hasGlobalRatio ? (targetScale / refScale) : null;
      const clampScale = (value) => {
        if (!Number.isFinite(value)) return targetScale;
        if (Number.isFinite(min) && Number.isFinite(max)) {
          return Math.min(max, Math.max(min, value));
        }
        return value;
      };
      applyUpdateToTargets((layer) => {
        const prevScale = Number(layer?.position?.scale);
        const rawScale = hasGlobalRatio && Number.isFinite(prevScale)
          ? prevScale * ratio
          : targetScale;
        const clampedScale = clampScale(rawScale);
        return {
          position: { ...(layer?.position || {}), scale: clampedScale },
        };
      });
      return;
    }

    if (id === 'radiusFactor') {
      const targetRF = Number(newValue);
      const refRF = Number(currentLayer?.radiusFactor);
      const hasGlobalRatio = targetMode === 'global' && Number.isFinite(refRF) && Math.abs(refRF) > 1e-9;
      const globalRatio = hasGlobalRatio ? (targetRF / refRF) : null;
      applyUpdateToTargets((layer) => {
        const prevRF = Number(layer?.radiusFactor);
        const prevX = Number(layer?.radiusFactorX);
        const prevY = Number(layer?.radiusFactorY);
        if (hasGlobalRatio && Number.isFinite(prevRF)) {
          const scaledRF = prevRF * globalRatio;
          const nextX = Number.isFinite(prevX) ? prevX * globalRatio : scaledRF;
          const nextY = Number.isFinite(prevY) ? prevY * globalRatio : scaledRF;
          return { radiusFactor: scaledRF, radiusFactorX: nextX, radiusFactorY: nextY };
        }
        const ratioRaw = (Number.isFinite(prevRF) && Math.abs(prevRF) > 1e-9) ? (targetRF / prevRF) : targetRF;
        const ratio = Number.isFinite(ratioRaw) && ratioRaw > 0 ? ratioRaw : 1;
        const baseX = Number.isFinite(prevX) ? prevX : 1;
        const baseY = Number.isFinite(prevY) ? prevY : 1;
        const nextX = baseX * ratio;
        const nextY = baseY * ratio;
        return { radiusFactor: targetRF, radiusFactorX: nextX, radiusFactorY: nextY };
      });
      return;
    }

    if (id === 'radiusFactorX' || id === 'radiusFactorY') {
      const targetAxis = Number(newValue);
      const refAxis = Number(currentLayer?.[id]);
      const hasGlobalRatio = targetMode === 'global' && Number.isFinite(refAxis) && Math.abs(refAxis) > 1e-9;
      const globalRatio = hasGlobalRatio ? (targetAxis / refAxis) : null;
      applyUpdateToTargets((layer) => {
        const prevAxis = Number(layer?.[id]);
        if (hasGlobalRatio && Number.isFinite(prevAxis)) {
          return { [id]: prevAxis * globalRatio };
        }
        return { [id]: targetAxis };
      });
      return;
    }

    if (id === 'numSides') {
      applyUpdateToTargets((layer) => {
        const n = Math.max(3, Math.round(newValue));
        if (layer?.layerType !== 'shape') {
          return { numSides: n };
        }
        if (layer.syncNodesToNumSides) {
          return { numSides: n, nodes: makeRegularNodes(n) };
        }
        const existing = Array.isArray(layer?.nodes) && layer.nodes.length
          ? layer.nodes
          : computeInitialNodes(n);
        const nodes = resizeNodes(existing, n);
        return { numSides: n, nodes, syncNodesToNumSides: false };
      });
      return;
    }

    // Special handling for movementStyle to convert between coordinate systems
    if (id === 'movementStyle') {
      applyUpdateToTargets((layer) => {
        const oldStyle = layer.movementStyle || 'bounce';
        const newStyle = newValue;
        
        // If switching between coordinate system types, we need to track this for canvas conversion
        const oldUsesFullCanvas = oldStyle === 'drift' || oldStyle === 'bounce';
        const newUsesFullCanvas = newStyle === 'drift' || newStyle === 'bounce';
        
        if (oldUsesFullCanvas !== newUsesFullCanvas) {
          // Mark that coordinate system changed so canvas can convert position
          return {
            ...layer,
            movementStyle: newStyle,
            _previousMovementStyle: oldStyle,
            _coordinateSystemChanged: true
          };
        }
        
        return { ...layer, movementStyle: newStyle };
      });
    } else {
      applyUpdateToTargets({ [id]: newValue });
    }
  };

  // Ensure movementStyle options are hardcoded and independent of saved parameter metadata
  const effectiveOptions = useMemo(() => (
    id === 'movementStyle' ? ['bounce', 'drift', 'still', 'orbit', 'spin'] : options
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
          if (layer?.layerType !== 'shape') {
            return { numSides: n };
          }
          if (layer.syncNodesToNumSides) {
            const nodes = Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return { x: Math.cos(a), y: Math.sin(a) }; });
            return { numSides: n, nodes };
          }
          const existing = Array.isArray(layer?.nodes) && layer.nodes.length
            ? layer.nodes
            : computeInitialNodes(n);
          const nodes = resizeNodes(existing, n);
          return { numSides: n, nodes, syncNodesToNumSides: false };
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

  const onToggleOptionRandomizable = (option) => (e) => {
    e.stopPropagation();
    const baseOptions = Array.isArray(options) ? options : [];
    const current = Array.isArray(param.randomOptions) && param.randomOptions.length
      ? param.randomOptions.filter((opt) => baseOptions.includes(opt))
      : baseOptions;

    let next;
    if (e.target.checked) {
      next = current.includes(option) ? current : [...current, option];
    } else {
      next = current.filter((opt) => opt !== option);
    }

    updateParameter(id, 'randomOptions', next);
  };

  const onMetaChange = (field) => (input) => {
    let nextValue = input;
    if (input && typeof input === 'object' && 'target' in input) {
      nextValue = input.target.value;
      if (['min', 'max', 'step', 'defaultValue', 'randomMin', 'randomMax'].includes(field)) {
        nextValue = parseFloat(nextValue);
      }
    }
    updateParameter(id, field, nextValue);
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

  // BPM and Audio modulation is handled in the animation loop (useAnimation.js)
  // No handlers registered here to prevent excessive re-renders

  // Now short-circuit render if hidden, after hooks are declared
  if (hidden) return null;

  const Header = ({ children }) => (
    <div className="dc-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', pointerEvents: 'auto' }}>
      <div>{children}</div>
      <div className="dc-actions" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', userSelect: 'none' }}>
        {(bpmMapped || audioMapped) && (
          <span
            title={
              audioMapped
                ? (audioEnabled ? 'Audio automation mapped' : 'Audio automation mapped (disabled)')
                : (bpmPlaying ? 'BPM automation mapped' : 'BPM automation mapped (paused)')
            }
            aria-label={audioMapped ? 'Audio automation mapped' : 'BPM automation mapped'}
            style={{
              fontSize: '0.85rem',
              color: audioMapped
                ? (audioEnabled ? '#4ade80' : 'rgba(74,222,128,0.6)')
                : (bpmPlaying ? '#4fc3f7' : 'rgba(79,195,247,0.6)'),
              lineHeight: 1,
            }}
          >
            ♪
          </span>
        )}
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
            <BufferedNumberInput
              value={min}
              step={step}
              onCommit={onMetaChange('min')}
              className="compact-number"
              inputMode="decimal"
              style={{ width: '4.5rem' }}
            />
            <label>{`Max${getOperationalMaxHint(id)}`}</label>
            <BufferedNumberInput
              value={max}
              step={step}
              onCommit={onMetaChange('max')}
              className="compact-number"
              inputMode="decimal"
              style={{ width: '4.5rem' }}
            />
            <label>Step</label>
            <BufferedNumberInput
              value={step}
              onCommit={onMetaChange('step')}
              className="compact-number"
              inputMode="decimal"
              precision={3}
              style={{ width: '4.5rem' }}
            />
            <label>Rand Min</label>
            <BufferedNumberInput
              value={Number.isFinite(param.randomMin) ? param.randomMin : min}
              step={step}
              onCommit={onMetaChange('randomMin')}
              className="compact-number"
              inputMode="decimal"
              style={{ width: '4.5rem' }}
            />
            <label>Rand Max</label>
            <BufferedNumberInput
              value={Number.isFinite(param.randomMax) ? param.randomMax : max}
              step={step}
              onCommit={onMetaChange('randomMax')}
              className="compact-number"
              inputMode="decimal"
              style={{ width: '4.5rem' }}
            />
          </div>
        ) : (
          <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>No numeric bounds for this control.</div>
        )}
        {type === 'dropdown' && Array.isArray(options) && options.length > 0 && (
          <div style={{ marginTop: '0.6rem' }}>
            <div style={{ fontSize: '0.85rem', opacity: 0.9, marginBottom: '0.25rem' }}>
              Movement styles allowed in Randomize All
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {options.map((opt) => {
                const allowed = Array.isArray(param.randomOptions) && param.randomOptions.length
                  ? param.randomOptions.includes(opt)
                  : true;
                return (
                  <label
                    key={opt}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem' }}
                    onMouseDown={(e) => { e.stopPropagation(); }}
                    onClick={(e) => { e.stopPropagation(); }}
                  >
                    <input
                      type="checkbox"
                      checked={allowed}
                      onChange={onToggleOptionRandomizable(opt)}
                    />
                    <span>{opt}</span>
                  </label>
                );
              })}
            </div>
          </div>
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
        {/* MIDI controls - always shown in settings panel */}
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
        {/* Audio and BPM controls - always shown in settings panel */}
        <AudioRotationStatus paramId={`layer:${currentLayer?.name || 'Layer'}:${id}`} min={min} max={max} />
        <BPMRotationStatus paramId={`layer:${currentLayer?.name || 'Layer'}:${id}`} min={min} max={max} />
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
              key={`${id}-${currentLayer?.id || 'none'}-${editTarget?.type || 'single'}-${editTarget?.groupId || ''}`}
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
            <select 
              key={`${id}-${currentLayer?.id || 'none'}-${editTarget?.type || 'single'}-${editTarget?.groupId || ''}`}
              value={value} 
              onChange={handleChange}
            >
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
// IMPORTANT: We don't use React.memo here because it causes bugs when switching between
// layers/groups - the control shows stale values and becomes unresponsive.
// The performance impact is negligible since controls are lightweight.
const DynamicControl = DynamicControlBase;

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
  layerGroups = [],
  editTarget,
  setEditTarget,
  selectedLayerIds = [],
  toggleLayerSelection,
  clearSelection,
  getActiveTargetLayerIds,
  parameterTargetMode = 'individual',
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
  palettes = [],
  automationPalettes = [],
  onSaveCustomPalette,
}, ref) => {
  const { parameters } = useParameters();

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

  const selectionCount = Array.isArray(selectedLayerIds) ? selectedLayerIds.length : 0;
  const targetMode = parameterTargetMode === 'global' ? 'global' : 'individual';
  const layerOptions = useMemo(() => {
    const list = Array.isArray(layerNames) ? layerNames : [];
    return list.map((name, idx) => ({
      value: `layer:${idx}`,
      label: `${idx + 1}. ${name || 'Layer'}`,
    }));
  }, [layerNames]);

  // Optional console-based debug for settings panels.
  const debugSettingsEnabled = useMemo(() => {
    if (typeof window === 'undefined') return false;
    if (window.__artapp_debugSettings === true) return true;
    try {
      return localStorage.getItem('artapp-debug-settings') === 'true';
    } catch {
      return false;
    }
  }, []);

  // Format options for HoverDropdown component
  const dropdownOptions = useMemo(() => {
    const groups = [];
    
    if (layerOptions.length > 0) {
      groups.push({
        label: 'Layers',
        items: layerOptions,
      });
    }
    
    if (selectionCount > 0) {
      groups.push({
        label: 'Selection',
        items: [{ value: 'selection', label: `Selection (${selectionCount})` }],
      });
    }
    
    if (Array.isArray(layerGroups) && layerGroups.length > 0) {
      groups.push({
        label: 'Groups',
        items: layerGroups.map(group => ({
          value: `group:${group.id}`,
          label: `${group.name || 'Group'} (${Array.isArray(group.memberIds) ? group.memberIds.length : 0})`,
        })),
      });
    }
    
    return groups;
  }, [layerOptions, selectionCount, layerGroups]);

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

  // Optional: expose for manual inspection from DevTools when settings debug is enabled
  useEffect(() => {
    if (!debugSettingsEnabled) return;
    try { window.__artapp_targetMode = targetMode; } catch { /* noop */ }
  }, [targetMode, debugSettingsEnabled]);

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

  const paletteOptions = useMemo(() => {
    const list = Array.isArray(palettes) ? palettes : [];
    const builtins = [];
    const customs = [];
    list.forEach((p, idx) => {
      const source = p?.__source === 'custom' ? 'custom' : 'builtin';
      const colors = Array.isArray(p) ? p : p?.colors;
      if (!Array.isArray(colors) || !colors.length) return;
      if (source === 'custom' && p?.id) {
        customs.push({
          value: `custom:${p.id}`,
          label: p?.name || 'Custom Palette',
        });
      } else {
        const builtinIndex = Number.isFinite(p?.__index) ? p.__index : idx;
        builtins.push({
          value: `builtin:${builtinIndex}`,
          label: p?.name || `Palette ${builtinIndex + 1}`,
        });
      }
    });
    return { builtins, customs };
  }, [palettes]);

  const paletteValueMap = useMemo(() => {
    const list = Array.isArray(palettes) ? palettes : [];
    const map = new Map();
    list.forEach((p, idx) => {
      const source = p?.__source === 'custom' ? 'custom' : 'builtin';
      const colors = Array.isArray(p) ? p : p?.colors;
      if (!Array.isArray(colors) || !colors.length) return;
      if (source === 'custom' && p?.id) {
        map.set(`custom:${p.id}`, colors);
      } else {
        const builtinIndex = Number.isFinite(p?.__index) ? p.__index : idx;
        map.set(`builtin:${builtinIndex}`, colors);
      }
    });
    return map;
  }, [palettes]);

  const matchPaletteValue = (colors = []) => {
    const list = Array.isArray(palettes) ? palettes : [];
    for (let idx = 0; idx < list.length; idx += 1) {
      const p = list[idx];
      const source = p?.__source === 'custom' ? 'custom' : 'builtin';
      const src = Array.isArray(p) ? p : p?.colors;
      if (!Array.isArray(src) || !src.length) continue;
      const sampled = sampleColors(src, colors.length);
      const matches = sampled.length === colors.length
        && sampled.every((c, i) => (c || '').toLowerCase() === (colors[i] || '').toLowerCase());
      if (!matches) continue;
      if (source === 'custom' && p?.id) return `custom:${p.id}`;
      const builtinIndex = Number.isFinite(p?.__index) ? p.__index : idx;
      return `builtin:${builtinIndex}`;
    }
    return 'custom';
  };

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
              <div key={`${param.id}-${currentLayer?.id || 0}-${editTarget?.type || 'single'}-${editTarget?.groupId || ''}`}>
                <DynamicControl
                  param={param}
                  currentLayer={currentLayer}
                  updateLayer={updateLayer}
                  setLayers={setLayers}
                  buildTargetSet={buildTargetSet}
                  targetMode={targetMode}
                  editTarget={editTarget}
                  debugSettingsEnabled={debugSettingsEnabled}
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
                key={`orbitX-${currentLayer?.id || 'none'}-${editTarget?.type || 'single'}-${editTarget?.groupId || ''}`}
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
                key={`orbitY-${currentLayer?.id || 'none'}-${editTarget?.type || 'single'}-${editTarget?.groupId || ''}`}
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
          <div key={`${param.id}-${currentLayer?.id || 0}-${editTarget?.type || 'single'}-${editTarget?.groupId || ''}`}>
            <DynamicControl
              param={param}
              currentLayer={currentLayer}
              updateLayer={updateLayer}
              setLayers={setLayers}
              buildTargetSet={buildTargetSet}
              targetMode={targetMode}
              debugSettingsEnabled={debugSettingsEnabled}
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
              key={`rotation-${currentLayer?.id || 'none'}-${editTarget?.type || 'single'}-${editTarget?.groupId || ''}`}
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
                  <BufferedNumberInput
                    value={Number.isFinite(rotateMin) ? rotateMin : -180}
                    min={-360}
                    max={360}
                    step={1}
                    onCommit={(next) => setRotateMin(Number.isFinite(next) ? next : -180)}
                    className="compact-number"
                    inputMode="numeric"
                    style={{ width: '4.5rem' }}
                  />
                  <label className="compact-label">{`Max${getOperationalMaxHint('rotation')}`}</label>
                  <BufferedNumberInput
                    value={Number.isFinite(rotateMax) ? rotateMax : 180}
                    min={-360}
                    max={360}
                    step={1}
                    onCommit={(next) => setRotateMax(Number.isFinite(next) ? next : 180)}
                    className="compact-number"
                    inputMode="numeric"
                    style={{ width: '4.5rem' }}
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
                {/* MIDI/Audio/BPM controls for Rotation - inside settings panel */}
                {(() => {
                  const layerKey = (currentLayer?.name || 'Layer').toString();
                  const paramId = `layer:${layerKey}:rotation`;
                  return (
                    <>
                      <MidiRotationStatus paramId={paramId} />
                      <AudioRotationStatus paramId={paramId} />
                      <BPMRotationStatus paramId={paramId} />
                    </>
                  );
                })()}
              </div>
            )}
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

  const handleLayerNumColorsChange = (rawValue) => {
    let n = Math.round(Number(rawValue));
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
        <BufferedNumberInput
          key={`numColors-${currentLayer?.id || 'none'}-${editTarget?.type || 'single'}-${editTarget?.groupId || ''}`}
          min={1}
          step={1}
          value={Math.max(1, Number.isFinite(currentLayer?.numColors) ? currentLayer.numColors : (Array.isArray(currentLayer?.colors) ? currentLayer.colors.length : 1))}
          onCommit={handleLayerNumColorsChange}
          className="compact-number"
          inputMode="numeric"
          style={{ width: '5rem' }}
        />

        <label>Colour Preset:</label>
        <select
          key={`palette-${currentLayer?.id || 'none'}-${editTarget?.type || 'single'}-${editTarget?.groupId || ''}`}
          value={(() => {
            const colors = Array.isArray(currentLayer?.colors) ? currentLayer.colors : [];
            return matchPaletteValue(colors);
          })()}
          onChange={(e) => {
            const val = e.target.value;
            if (val === 'custom') return;
            const src = paletteValueMap.get(val);
            if (!Array.isArray(src) || src.length === 0) return;
            const count = Number.isFinite(currentLayer?.numColors)
              ? currentLayer.numColors
              : ((Array.isArray(currentLayer?.colors) ? currentLayer.colors.length : 0) || src.length);
            const nextColors = sampleColors(src, count);
            applyTargetedUpdate(() => ({ colors: [...nextColors], numColors: count, selectedColor: 0 }));
          }}
        >
          <option value="custom">Custom</option>
          {paletteOptions.builtins.length > 0 && (
            <optgroup label="Built-in">
              {paletteOptions.builtins.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </optgroup>
          )}
          {paletteOptions.customs.length > 0 && (
            <optgroup label="Custom">
              {paletteOptions.customs.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </optgroup>
          )}
        </select>
        <div style={{ marginTop: '0.4rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-compact-secondary"
            onClick={() => {
              const base = Array.isArray(currentLayer?.colors) ? currentLayer.colors : [];
              const safe = base.filter(c => typeof c === 'string' && c.trim().length > 0);
              if (!safe.length || typeof onSaveCustomPalette !== 'function') return;
              const name = (window.prompt('Name this custom palette:', 'Custom Palette') || '').trim();
              if (!name) return;
              onSaveCustomPalette({ name, colors: safe });
            }}
          >
            Save as custom
          </button>
        </div>

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
              <BufferedNumberInput
                min={1}
                max={colorCountMax || 8}
                step={1}
                value={Math.max(1, Number(colorCountMin || 1))}
                onCommit={(next) => {
                  if (!setColorCountMin) return;
                  const safe = Math.max(1, Math.round(Number(next) || 1));
                  setColorCountMin(safe);
                }}
                className="compact-number"
                inputMode="numeric"
                style={{ width: '4.5rem' }}
              />
              <label className="compact-label">Max</label>
              <BufferedNumberInput
                min={colorCountMin || 1}
                max={32}
                step={1}
                value={Math.max(Number(colorCountMin || 1), Number(colorCountMax || 8))}
                onCommit={(next) => {
                  if (!setColorCountMax) return;
                  const floor = Number(colorCountMin || 1);
                  const safe = Math.max(floor, Math.round(Number(next) || floor));
                  setColorCountMax(safe);
                }}
                className="compact-number"
                inputMode="numeric"
                style={{ width: '4.5rem' }}
              />
            </div>
            {/* Palette MIDI/Audio/BPM controls */}
            {(() => {
              const layerKey = (currentLayer?.name || 'Layer').toString();
              const paramId = `layer:${layerKey}:paletteIndex`;
              return (
                <div style={{ marginTop: '0.6rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ fontSize: '0.9rem', opacity: 0.9, marginBottom: '0.4rem' }}>
                    <strong>Palette Control</strong>
                  </div>
                  {/* MIDI */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>
                      <span style={{ opacity: 0.7 }}>MIDI:</span> {midiSupported ? (midiMappings?.[paramId] ? (mappingLabel ? mappingLabel(midiMappings[paramId]) : 'Mapped') : 'Not mapped') : 'Not supported'}
                      {learnParamId === paramId && midiSupported && <span style={{ marginLeft: '0.5rem', color: '#4fc3f7' }}>Listening…</span>}
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button type="button" className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); beginLearn && beginLearn(paramId); }} disabled={!midiSupported}>Learn</button>
                      <button type="button" className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); clearMapping && clearMapping(paramId); }} disabled={!midiSupported || !midiMappings?.[paramId]}>Clear</button>
                    </div>
                  </div>
                  {/* Audio */}
                  <AudioRotationStatus paramId={paramId} min={0} max={1} />
                  {/* BPM */}
                  <BPMRotationStatus paramId={paramId} min={0} max={1} />
                </div>
              );
            })()}
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
                    key={`colorFadeSpeed-${currentLayer?.id || 'none'}-${editTarget?.type || 'single'}-${editTarget?.groupId || ''}`}
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
                {/* Audio/BPM controls for colorFadeSpeed */}
                {(() => {
                  const layerKey = (currentLayer?.name || 'Layer').toString();
                  const paramId = `layer:${layerKey}:colorFadeSpeed`;
                  return (
                    <>
                      <AudioRotationStatus paramId={paramId} min={0} max={4} />
                      <BPMRotationStatus paramId={paramId} min={0} max={4} />
                    </>
                  );
                })()}
              </div>
            )}
          </div>

          <ColorPicker 
            key={`colorpicker-${currentLayer?.id || 'none'}-${editTarget?.type || 'single'}-${editTarget?.groupId || ''}`}
            label="Colours"
            colors={Array.isArray(currentLayer?.colors) ? currentLayer.colors : []}
            onChange={handleLayerColorChange}
            layerId={currentLayer?.id}
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
      const list = automationPalettes || [];
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
  }, [applyTargetedUpdate, currentLayer, registerParamHandler, automationPalettes]);

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
      <div className="controls-header compact" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
          <h2 style={{ margin: 0, fontSize: '1rem' }}>Layer Controls</h2>
          <div className="compact-row" style={{ gap: '0.4rem', display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
            <label className="compact-label" style={{ opacity: 0.9 }}>Active layer:</label>
            <HoverDropdown
              value={targetSelectValue}
              options={dropdownOptions}
              onChange={(value) => {
                handleTargetSelect({ target: { value } });
              }}
            />
          </div>
          <div className="compact-row" style={{ gap: '0.4rem', display: 'flex', flexWrap: 'wrap' }}>
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
          <div className="controls-actions" style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
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
          </div>
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

// Prevent unnecessary re-renders while the animation loop mutates fast-moving
// fields (position, rotation for spin, etc.). This keeps the heavy settings UI
// from re-rendering every frame when the layer tab is visible.
const isLayerEqualForUI = (a, b) => {
  if (a === b) return true;
  if (!a || !b) return false;

  const ignores = new Set(['position', 'movementAngle', 'orbitAngle', 'spinAngle']);
  const compareRotation = !(a.movementStyle === 'spin' || b.movementStyle === 'spin');

  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  keys.forEach(k => {
    if (ignores.has(k)) keys.delete(k);
    if (!compareRotation && k === 'rotation') keys.delete(k);
  });
  for (const key of keys) {
    if (!Object.is(a[key], b[key])) return false;
  }

  const posA = a.position || {};
  const posB = b.position || {};
  const posKeys = new Set([...Object.keys(posA), ...Object.keys(posB)]);
  ['x', 'y', 'vx', 'vy', 'scale', 'scaleDirection'].forEach(k => posKeys.delete(k));
  for (const key of posKeys) {
    if (!Object.is(posA[key], posB[key])) return false;
  }

  if (compareRotation && !Object.is(a.rotation, b.rotation)) return false;
  return true;
};

const isArrayShallowEqual = (a, b) => {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (!Object.is(a[i], b[i])) return false;
  }
  return true;
};

const areControlsPropsEqual = (prev, next) => {
  const debug = isSettingsDebugEnabled();
  const log = throttledSettingsDebugLog;

  const fail = (reason) => {
    if (debug) log(`[settings-debug] Controls re-render: ${reason}`);
    return false;
  };

  if (!isLayerEqualForUI(prev.currentLayer, next.currentLayer)) return fail('currentLayer changed (or animation fields not ignored)');
  if (!isArrayShallowEqual(prev.layerNames, next.layerNames)) return fail('layerNames changed');
  if (!isArrayShallowEqual(prev.layerIds, next.layerIds)) return fail('layerIds changed');
  if (!isArrayShallowEqual(prev.baseColors, next.baseColors)) return fail('baseColors changed');
  if (!Object.is(prev.baseNumColors, next.baseNumColors)) return fail('baseNumColors changed');
  if (!Object.is(prev.selectedLayerIndex, next.selectedLayerIndex)) return fail('selectedLayerIndex changed');
  if (!Object.is(prev.isNodeEditMode, next.isNodeEditMode)) return fail('isNodeEditMode changed');
  if (!isArrayShallowEqual(prev.layerGroups, next.layerGroups)) return fail('layerGroups changed');
  if (!isArrayShallowEqual(prev.selectedLayerIds, next.selectedLayerIds)) return fail('selectedLayerIds changed');
  if (!Object.is(prev.editTarget, next.editTarget)) return fail('editTarget changed');
  if (!Object.is(prev.parameterTargetMode, next.parameterTargetMode)) return fail('parameterTargetMode changed');
  if (!Object.is(prev.randomizePalette, next.randomizePalette)) return fail('randomizePalette changed');
  if (!Object.is(prev.randomizeNumColors, next.randomizeNumColors)) return fail('randomizeNumColors changed');
  if (!Object.is(prev.colorCountMin, next.colorCountMin)) return fail('colorCountMin changed');
  if (!Object.is(prev.colorCountMax, next.colorCountMax)) return fail('colorCountMax changed');

  // Assume function/handler props are stable (useCallback); if any change, re-render.
  const handlerKeys = [
    'updateLayer',
    'randomizeCurrentLayer',
    'randomizeAnimationOnly',
    'setLayers',
    'setIsNodeEditMode',
    'setRandomizePalette',
    'setRandomizeNumColors',
    'setColorCountMin',
    'setColorCountMax',
    'onRandomizeLayerColors',
    'getIsRnd',
    'setIsRnd',
    'onSelectLayer',
    'onAddLayer',
    'onDeleteLayer',
    'onImportSVG',
    'onMoveLayerUp',
    'onMoveLayerDown',
    'toggleLayerSelection',
    'clearSelection',
    'setEditTarget',
    'getActiveTargetLayerIds',
  ];
  for (const key of handlerKeys) {
    if (prev[key] !== next[key]) return fail(`${key} changed identity`);
  }
  
  if (debug) log('[settings-debug] Controls stable; render skipped');
  return true;
};

export default React.memo(Controls, areControlsPropsEqual);
