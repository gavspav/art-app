import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppState } from '../../context/AppStateContext.jsx';
import { useParameters } from '../../context/ParameterContext.jsx';
import { useMidi } from '../../context/MidiContext.jsx';
import { usePresetMorph } from '../../hooks/usePresetMorph.js';

/**
 * PresetControls
 * - 4x2 preset grid with Shift+Click save / Click recall
 * - MIDI learn for preset recall
 * - Morph controls (enables, route, duration, easing, loop mode, algorithm)
 * - Internally runs the morph engine via usePresetMorph
 */
export default function PresetControls({ setLayers, setBackgroundColor, setGlobalSpeedMultiplier, showGlobalMidi }) {
  // Contexts
  const {
    presetSlots,
    setPresetSlot,
    getPresetSlot,
    getCurrentAppState,
    loadAppState, // not used directly here but available if needed
    // Morph state
    morphEnabled,
    morphRoute,
    morphDurationPerLeg,
    morphEasing,
    morphLoopMode,
    setMorphEnabled,
    setMorphRoute,
    setMorphDurationPerLeg,
    setMorphEasing,
    setMorphLoopMode,
    morphMode,
    setMorphMode,
  } = useAppState() || {};
  const { parameters, loadFullConfiguration } = useParameters() || {};
  const { registerParamHandler, beginLearn, clearMapping, mappings: midiMappings, mappingLabel, supported: midiSupported, learnParamId } = useMidi() || {};

  const getExportMeta = useCallback(() => {
    if (typeof window === 'undefined') {
      return {
        version: '2.0',
        canvasWidth: 0,
        canvasHeight: 0,
        exportedAt: new Date().toISOString(),
      };
    }
    const meta = window.__artapp_canvasMeta || {};
    const width = Math.round(Number(meta.width ?? window.innerWidth ?? 0));
    const height = Math.round(Number(meta.height ?? window.innerHeight ?? 0));
    return {
      version: '2.0',
      canvasWidth: width,
      canvasHeight: height,
      exportedAt: new Date().toISOString(),
    };
  }, []);

  // Run morph engine
  const { morphStatus } = usePresetMorph({
    getPresetSlot,
    setLayers,
    setBackgroundColor,
    setGlobalSpeedMultiplier,
    morphEnabled,
    morphRoute,
    morphDurationPerLeg,
    morphEasing,
    morphLoopMode,
    morphMode,
  });

  // Preset helpers
  const TEMP_PRESET_PREFIX = 'preset-slot-';

  // Track last MIDI values for rising-edge detection per preset mapping id
  const lastValuesRef = useRef({});
  const forceUiTick = useState(0)[1];

  const recallPreset = useCallback(async (slotId) => {
    const slot = getPresetSlot ? getPresetSlot(slotId) : null;
    if (!slot) return;
    try {
      if (!slot.payload) return;
      // Preserve current morph settings so recalling a preset doesn't alter them
      const preservedMorph = {
        enabled: !!morphEnabled,
        route: Array.isArray(morphRoute) ? [...morphRoute] : morphRoute,
        duration: morphDurationPerLeg,
        easing: morphEasing,
        loopMode: morphLoopMode,
        mode: morphMode,
      };
      const key = `${TEMP_PRESET_PREFIX}${slotId}`;
      const exportMeta = slot.payload?.exportMeta || getExportMeta();
      const saveObj = {
        parameters: slot.payload.parameters || [],
        appState: slot.payload.appState || null,
        savedAt: slot.payload.savedAt || new Date().toISOString(),
        version: '2.0',
        exportMeta,
      };
      localStorage.setItem(`artapp-config-${key}`, JSON.stringify(saveObj));
      if (typeof loadFullConfiguration === 'function') {
        const res = await loadFullConfiguration(key);
        if (res && res.appState && typeof loadAppState === 'function') {
          // Strip morph fields, then restore preserved values after applying
          const {
            morphEnabled: _me,
            morphRoute: _mr,
            morphDurationPerLeg: _md,
            morphEasing: _meas,
            morphLoopMode: _ml,
            morphMode: _mm,
            ...rest
          } = res.appState || {};
          loadAppState(rest);
          if (res.exportMeta && typeof window !== 'undefined') {
            window.__artapp_lastImportMeta = res.exportMeta;
          }
          setMorphEnabled?.(preservedMorph.enabled);
          const routeToRestore = Array.isArray(preservedMorph.route)
            ? preservedMorph.route
            : (Array.isArray(morphRoute) ? morphRoute : []);
          setMorphRoute?.(routeToRestore);
          if (typeof preservedMorph.duration !== 'undefined') setMorphDurationPerLeg?.(preservedMorph.duration);
          if (typeof preservedMorph.easing !== 'undefined') setMorphEasing?.(preservedMorph.easing);
          if (typeof preservedMorph.loopMode !== 'undefined') setMorphLoopMode?.(preservedMorph.loopMode);
          if (typeof preservedMorph.mode !== 'undefined') setMorphMode?.(preservedMorph.mode);
        }
      }
    } catch (e) {
      console.warn('[Presets] Failed to recall preset', slotId, e);
    }
  }, [
    getExportMeta,
    getPresetSlot,
    loadFullConfiguration,
    loadAppState,
    morphDurationPerLeg,
    morphEasing,
    morphEnabled,
    morphLoopMode,
    morphMode,
    morphRoute,
    setMorphDurationPerLeg,
    setMorphEasing,
    setMorphEnabled,
    setMorphLoopMode,
    setMorphMode,
    setMorphRoute,
  ]);

  const handlePresetClick = useCallback(async (slotId, evt) => {
    const slot = getPresetSlot ? getPresetSlot(slotId) : null;
    if (!slot) return;
    const isShift = !!(evt && (evt.shiftKey || evt.metaKey));
    if (isShift) {
      // Save current config into preset slot
      try {
        const now = new Date().toISOString();
        const appStatePayload = typeof getCurrentAppState === 'function' ? getCurrentAppState() : null;
        const paramPayload = Array.isArray(parameters) ? parameters : [];
        const payload = { parameters: paramPayload, appState: appStatePayload, savedAt: now, version: '2.0', exportMeta: getExportMeta() };
        setPresetSlot && setPresetSlot(slotId, (s) => ({ ...s, payload, savedAt: now }));
      } catch (e) {
        console.warn('[Presets] Failed to save to slot', slotId, e);
      }
      return;
    }
    recallPreset(slotId);
  }, [getCurrentAppState, getExportMeta, getPresetSlot, parameters, recallPreset, setPresetSlot]);

  // MIDI: per-preset triggers. Each preset i (1..16) gets its own mapping id 'preset:i'
  useEffect(() => {
    if (!registerParamHandler) return;
    const unsubs = [];
    for (let i = 1; i <= 16; i++) {
      const id = `preset:${i}`;
      const unsub = registerParamHandler(id, (payload = {}) => {
        const v = typeof payload.value01 === 'number' ? payload.value01 : (payload.on ? 1 : 0);
        const prev = Number(lastValuesRef.current[id] ?? 0);
        // Rising edge -> trigger
        if (prev <= 0.5 && v > 0.5) {
          recallPreset(i);
        }
        lastValuesRef.current[id] = v;
      });
      if (typeof unsub === 'function') unsubs.push(unsub);
    }
    return () => { unsubs.forEach(u => { try { u(); } catch { /* noop */ } }); };
  }, [registerParamHandler, recallPreset]);

  const renderPresetGrid = () => {
    const slots = Array.isArray(presetSlots) ? presetSlots : [];
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', marginBottom: '0.75rem' }}>
        {Array.from({ length: 16 }, (_, i) => {
          const slot = slots[i] || { id: i + 1, name: `P${i + 1}`, payload: null };
          const hasData = !!slot.payload;
          const mapped = !!midiMappings?.[`preset:${slot.id}`];
          return (
            <div key={slot.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
              <button
                type="button"
                onClick={(e) => handlePresetClick(slot.id, e)}
                title={`${slot.name || `P${slot.id}`}${hasData ? ` • Saved ${slot.savedAt ? new Date(slot.savedAt).toLocaleString() : ''}` : ' • Empty'}\nClick: Recall • Shift+Click: Save`}
                style={{
                  width: '48%', // make buttons much smaller for compact layout
                  aspectRatio: '1 / 1',
                  borderRadius: '999px',
                  border: mapped ? '2px solid #4caf50' : (hasData ? '2px solid #4fc3f7' : '2px dashed rgba(255,255,255,0.25)'),
                  background: mapped ? 'rgba(76,175,80,0.22)' : (hasData ? 'rgba(79,195,247,0.18)' : 'transparent'),
                  color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                }}
              >
                {slot.name || `P${slot.id}`}
              </button>
              {showGlobalMidi && midiSupported && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <button
                    className="btn-compact-secondary"
                    onClick={(e) => { e.stopPropagation(); beginLearn && beginLearn(`preset:${slot.id}`); }}
                    disabled={!midiSupported}
                    title={`Learn MIDI for ${slot.name || `P${slot.id}`}`}
                  >L</button>
                  <button
                    className="btn-compact-secondary"
                    onClick={(e) => { e.stopPropagation(); clearMapping && clearMapping(`preset:${slot.id}`); lastValuesRef.current[`preset:${slot.id}`] = 0; forceUiTick(t => t + 1); }}
                    disabled={!midiSupported || !midiMappings?.[`preset:${slot.id}`]}
                    title={`Clear MIDI for ${slot.name || `P${slot.id}`}`}
                  >C</button>
                  <span className="compact-label" style={{ opacity: 0.85, minWidth: '4.5rem', textAlign: 'left' }}>
                    {mapped ? (mappingLabel ? mappingLabel(midiMappings[`preset:${slot.id}`]) : 'Mapped') : 'Not mapped'}
                    {learnParamId === `preset:${slot.id}` && <span style={{ marginLeft: '0.25rem', color: '#4fc3f7' }}>Listening…</span>}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const routeInput = useMemo(() => (Array.isArray(morphRoute) ? morphRoute.join(',') : ''), [morphRoute]);
  const [routeDraft, setRouteDraft] = useState(routeInput);
  useEffect(() => {
    setRouteDraft(routeInput);
  }, [routeInput]);
  const applyRouteDraft = useCallback(() => {
    if (!setMorphRoute) return;
    const nextRoute = (routeDraft || '')
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n >= 1 && n <= 16);
    setMorphRoute(nextRoute);
  }, [routeDraft, setMorphRoute]);

  const missingIds = useMemo(() => {
    const route = Array.isArray(morphRoute) ? morphRoute : [];
    return (route || []).filter(id => {
      const s = getPresetSlot ? getPresetSlot(id) : null;
      return !(s && s.payload && s.payload.appState);
    });
  }, [morphRoute, getPresetSlot]);

  return (
    <>
      {/* Presets: 4x2 grid */}
      {renderPresetGrid()}

      {/* Preset Morph controls */}
      <div className="control-card" style={{ marginTop: '0.5rem' }}>
        <div className="control-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontWeight: 600 }}>Preset Morph</span>
            <label className="compact-label" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <input
                type="checkbox"
                checked={!!morphEnabled}
                onChange={() => {
                  const next = !morphEnabled;
                  if (!next) {
                    setMorphEnabled && setMorphEnabled(false);
                    return;
                  }
                  let route = Array.isArray(morphRoute) ? morphRoute : [];
                  if (route.length < 2) {
                    const savedIds = (presetSlots || []).filter(s => s && s.payload).map(s => s.id);
                    if (savedIds.length >= 2 && setMorphRoute) {
                      route = [savedIds[0], savedIds[1]];
                      setMorphRoute(route);
                      setRouteDraft(route.join(','));
                    }
                  }
                  const missing = (route || []).filter(id => {
                    const s = getPresetSlot ? getPresetSlot(id) : null;
                    return !(s && s.payload && s.payload.appState);
                  });
                  if (missing.length > 0) {
                    console.warn('[Morph] Cannot enable; missing saved presets:', missing);
                    // do not enable
                    return;
                  }
                  setMorphEnabled && setMorphEnabled(true);
                }}
              />
              Enable
              <span style={{
                padding: '0.1rem 0.4rem',
                borderRadius: 999,
                background: morphEnabled ? 'rgba(76,175,80,0.25)' : 'rgba(255,255,255,0.08)',
                border: morphEnabled ? '1px solid #4caf50' : '1px solid rgba(255,255,255,0.15)',
                fontSize: '0.75rem',
                color: morphEnabled ? '#a5d6a7' : 'rgba(255,255,255,0.7)'
              }}>{morphEnabled ? 'On' : 'Off'}</span>
            </label>
          </div>
        </div>
        {missingIds.length > 0 && (
          <div style={{ marginTop: '0.4rem', color: '#ff9e80', fontSize: '0.85rem' }}>
            Save these presets first (Shift+Click on their circles): {missingIds.join(', ')}
          </div>
        )}
        <div className="compact-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.5rem' }}>
          <label className="compact-label" title="Route of presets to morph through, comma-separated (e.g., 1,3,5)">
            Route
            <input
              type="text"
              className="compact-input"
              value={routeDraft}
              onChange={(e) => setRouteDraft(e.target.value)}
              onBlur={applyRouteDraft}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  applyRouteDraft();
                }
              }}
            />
          </label>
          <label className="compact-label" title="Seconds per leg">
            Duration
            <input type="number" step={0.1} min={0.2} max={120} value={Number(morphDurationPerLeg || 5)} onChange={(e) => setMorphDurationPerLeg && setMorphDurationPerLeg(e.target.value)} className="compact-input" />
          </label>
          <label className="compact-label" title="Easing">
            Easing
            <select className="compact-select" value={morphEasing || 'linear'} onChange={(e) => setMorphEasing && setMorphEasing(e.target.value)}>
              <option value="linear">linear</option>
            </select>
          </label>
          <label className="compact-label" title="Loop mode">
            Mode
            <select className="compact-select" value={morphLoopMode || 'loop'} onChange={(e) => setMorphLoopMode && setMorphLoopMode(e.target.value)}>
              <option value="loop">loop</option>
              <option value="pingpong">pingpong</option>
            </select>
          </label>
          <label className="compact-label" title="Morph algorithm">
            Morph
            <select className="compact-select" value={morphMode || 'tween'} onChange={(e) => setMorphMode && setMorphMode(e.target.value)}>
              <option value="tween">tween</option>
              <option value="fade">fade</option>
            </select>
          </label>
        </div>
        {morphEnabled && morphStatus && (
          <div style={{ marginTop: '0.35rem', fontSize: '0.85rem', opacity: 0.8 }}>
            Morph: {morphStatus.from} → {morphStatus.to} ({Math.round(morphStatus.t * 100)}%)
          </div>
        )}
      </div>
    </>
  );
}
