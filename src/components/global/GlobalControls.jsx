import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { useAppState } from '../../context/AppStateContext.jsx';
import { useParameters } from '../../context/ParameterContext.jsx';
import { useMidi } from '../../context/MidiContext.jsx';
import { hexToRgb, rgbToHex } from '../../utils/colorUtils.js';
import BackgroundColorPicker from '../BackgroundColorPicker.jsx';
import PresetControls from './PresetControls.jsx';

// A full-featured Global Controls panel, mirroring the original inline UI
const GlobalControls = ({
  // State and actions
  backgroundColor,
  setBackgroundColor,
  backgroundImage,
  setBackgroundImage,
  isFrozen,
  setIsFrozen,
  zIgnore,
  setZIgnore,
  classicMode,
  setClassicMode,
  showGlobalMidi,
  setShowGlobalMidi,
  globalSpeedMultiplier,
  setGlobalSpeedMultiplier,
  getIsRnd,
  setIsRnd,
  // Fade while frozen
  colorFadeWhileFrozen,
  setColorFadeWhileFrozen,
  // MIDI
  midiSupported,
  beginLearn,
  clearMapping,
  midiMappings,
  mappingLabel,
  learnParamId,
  // Palettes/Blend
  palettes,
  blendModes,
  globalBlendMode,
  setGlobalBlendMode,
  // MIDI input
  midiInputs,
  midiInputId,
  setMidiInputId,
  // Layers + helpers
  layers,
  sampleColorsEven,
  assignOneColorPerLayer,
  setLayers,
  DEFAULT_LAYER,
  buildVariedLayerFrom,
  setSelectedLayerIndex,
  // Actions
  handleRandomizeAll,
  // UI options
  hidePresets = false,
  // Quick save/load handlers (injected from App)
  onQuickSave,
  onQuickLoad,
}) => {
  // Keep Canvas background image renderer in sync
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const enabled = !!(backgroundImage && backgroundImage.enabled);
        const src = backgroundImage?.src || null;
        const opacity = Math.max(0, Math.min(1, Number(backgroundImage?.opacity ?? 1)));
        const fit = backgroundImage?.fit || 'cover';
        window.__artapp_bgimg = { enabled, src, opacity, fit };
      }
    } catch {}
  }, [backgroundImage]);
  // Presets: contexts
  const {
    presetSlots,
    setPresetSlot,
    getPresetSlot,
    // clearPresetSlot, // not used yet in Phase 1 UI
    getCurrentAppState,
    loadAppState,
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
  const { registerParamHandler } = useMidi() || {};

  const paletteValue = useMemo(() => {
    try {
      const colorsNow = (layers || []).map(l => (Array.isArray(l?.colors) && l.colors[0]) ? l.colors[0].toLowerCase() : '#000000');
      const idx = palettes.findIndex(p => {
        const src = Array.isArray(p) ? p : (p?.colors || []);
        const sampled = sampleColorsEven(src, Math.max(1, layers.length));
        return sampled.length === colorsNow.length && sampled.every((c, i) => (c || '').toLowerCase() === (colorsNow[i] || ''));
      });
      return idx === -1 ? 'custom' : String(idx);
    } catch {
      return 'custom';
    }
  }, [palettes, layers, sampleColorsEven]);

  // Settings panel visibility toggles
  const [showSpeedSettings, setShowSpeedSettings] = useState(false);
  const [showOpacitySettings, setShowOpacitySettings] = useState(false);
  const [showLayersSettings, setShowLayersSettings] = useState(false);
  const [showVariationShapeSettings, setShowVariationShapeSettings] = useState(false);
  const [showVariationAnimSettings, setShowVariationAnimSettings] = useState(false);
  const [showVariationColorSettings, setShowVariationColorSettings] = useState(false);

  // Numeric bounds (min/max/step) for sliders
  const [speedMin, setSpeedMin] = useState(0);
  const [speedMax, setSpeedMax] = useState(5);
  const [speedStep, setSpeedStep] = useState(0.01);

  const [opacityMin, setOpacityMin] = useState(0);
  const [opacityMax, setOpacityMax] = useState(1);
  const [opacityStep, setOpacityStep] = useState(0.01);

  const [layersMin, setLayersMin] = useState(1);
  const [layersMax, setLayersMax] = useState(1000);
  const [layersStep, setLayersStep] = useState(1);

  // Helper to set layer count uniformly from slider or number box
  const setLayerCount = (targetRaw) => {
    let target = parseInt(targetRaw, 10);
    if (!Number.isFinite(target)) return;
    target = Math.max(layersMin, Math.min(layersMax, target));
    setLayers(prev => {
      let next = prev;
      if (target > prev.length) {
        const addCount = target - prev.length;
        const baseVar = {
          shape: (typeof prev?.[0]?.variationShape === 'number') ? prev[0].variationShape : (typeof prev?.[0]?.variation === 'number' ? prev[0].variation : DEFAULT_LAYER.variationShape),
          anim: (typeof prev?.[0]?.variationAnim === 'number') ? prev[0].variationAnim : (typeof prev?.[0]?.variation === 'number' ? prev[0].variation : DEFAULT_LAYER.variationAnim),
          color: (typeof prev?.[0]?.variationColor === 'number') ? prev[0].variationColor : (typeof prev?.[0]?.variation === 'number' ? prev[0].variation : DEFAULT_LAYER.variationColor),
        };
        const last = prev[prev.length - 1] || DEFAULT_LAYER;
        const toAdd = Array.from({ length: addCount }, (_, i) => buildVariedLayerFrom((i === 0 ? last : next[next.length - 1]), prev.length + i + 1, baseVar));
        next = [...prev, ...toAdd];
      } else if (target < prev.length) {
        next = prev.slice(0, target).map((l, i) => ({ ...l, name: `Layer ${i + 1}` }));
      }
      return next;
    });
  };

  // Independent ranges for each Variation slider
  const [variationShapeMin, setVariationShapeMin] = useState(0);
  const [variationShapeMax, setVariationShapeMax] = useState(3);
  const [variationShapeStep, setVariationShapeStep] = useState(0.01);
  const [variationAnimMin, setVariationAnimMin] = useState(0);
  const [variationAnimMax, setVariationAnimMax] = useState(3);
  const [variationAnimStep, setVariationAnimStep] = useState(0.01);
  const [variationColorMin, setVariationColorMin] = useState(0);
  const [variationColorMax, setVariationColorMax] = useState(3);
  const [variationColorStep, setVariationColorStep] = useState(0.01);

  // Presets: helpers
  const TEMP_PRESET_PREFIX = 'preset-slot-';

  const recallPreset = useCallback(async (slotId) => {
    const slot = getPresetSlot ? getPresetSlot(slotId) : null;
    if (!slot) return;
    try {
      if (!slot.payload) return;
      const key = `${TEMP_PRESET_PREFIX}${slotId}`;
      const saveObj = { parameters: slot.payload.parameters || [], appState: slot.payload.appState || null, savedAt: slot.payload.savedAt || new Date().toISOString(), version: '1.1' };
      localStorage.setItem(`artapp-config-${key}`, JSON.stringify(saveObj));
      if (typeof loadFullConfiguration === 'function') {
        const res = await loadFullConfiguration(key);
        if (res && res.appState && typeof loadAppState === 'function') {
          loadAppState(res.appState);
        }
      }
    } catch (e) {
      console.warn('[Presets] Failed to recall preset', slotId, e);
    }
  }, [getPresetSlot, loadFullConfiguration, loadAppState]);

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
        const payload = { parameters: paramPayload, appState: appStatePayload, savedAt: now, version: '1.0' };
        setPresetSlot && setPresetSlot(slotId, (s) => ({ ...s, payload, savedAt: now }));
      } catch (e) {
        console.warn('[Presets] Failed to save to slot', slotId, e);
      }
      return;
    }
    recallPreset(slotId);
  }, [getPresetSlot, setPresetSlot, getCurrentAppState, parameters, recallPreset]);

  // MIDI: learnable preset recall (maps 0..1 to buckets 1..8)
  useEffect(() => {
    if (!registerParamHandler) return;
    const unsub = registerParamHandler('global:presetRecall', ({ value01 }) => {
      const bucket = Math.max(1, Math.min(8, Math.floor(value01 * 8) + 1));
      recallPreset(bucket);
    });
    return () => { if (typeof unsub === 'function') unsub(); };
  }, [registerParamHandler, recallPreset]);

  const renderPresetGrid = () => {
    const slots = Array.isArray(presetSlots) ? presetSlots : [];
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', marginBottom: '0.75rem' }}>
        {Array.from({ length: 8 }, (_, i) => {
          const slot = slots[i] || { id: i + 1, name: `P${i + 1}`, payload: null };
          const hasData = !!slot.payload;
          return (
            <button
              key={slot.id}
              type="button"
              onClick={(e) => handlePresetClick(slot.id, e)}
              title={`${slot.name || `P${slot.id}`}${hasData ? ` • Saved ${slot.savedAt ? new Date(slot.savedAt).toLocaleString() : ''}` : ' • Empty'}\nClick: Recall • Shift+Click: Save`}
              style={{
                width: '100%',
                aspectRatio: '1 / 1',
                borderRadius: '999px',
                border: hasData ? '2px solid #4fc3f7' : '2px dashed rgba(255,255,255,0.25)',
                background: hasData ? 'rgba(79,195,247,0.25)' : 'transparent',
                color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 600,
              }}
            >
              {slot.name || `P${slot.id}`}
            </button>
          );
        })}
      </div>
    );
  };

  // Morph UI controls
  const [morphStatus, setMorphStatus] = useState(null);
  const [morphError, setMorphError] = useState('');
  const [routeInput, setRouteInput] = useState(Array.isArray(morphRoute) ? morphRoute.join(',') : '');
  useEffect(() => {
    setRouteInput(Array.isArray(morphRoute) ? morphRoute.join(',') : '');
  }, [morphRoute]);
  const applyRouteFromInput = useCallback(() => {
    const vals = (routeInput || '')
      .split(',')
      .map(s => parseInt(s.trim(), 10))
      .filter(n => Number.isFinite(n) && n >= 1 && n <= 8);
    setMorphRoute && setMorphRoute(vals);
  }, [routeInput, setMorphRoute]);
  const renderMorphControls = () => {
    const route = Array.isArray(morphRoute) ? morphRoute : [];
    const missing = (route || []).filter(id => {
      const s = getPresetSlot ? getPresetSlot(id) : null;
      return !(s && s.payload && s.payload.appState);
    });
    return (
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
                  console.debug('[Morph] set enabled ->', next);
                  if (!next) {
                    setMorphEnabled && setMorphEnabled(false);
                    setMorphError('');
                    return;
                  }
                  let route = Array.isArray(morphRoute) ? morphRoute : [];
                  if (route.length < 2) {
                    const savedIds = (presetSlots || []).filter(s => s && s.payload).map(s => s.id);
                    if (savedIds.length >= 2 && setMorphRoute) {
                      route = [savedIds[0], savedIds[1]];
                      setMorphRoute(route);
                      setRouteInput(route.join(','));
                    }
                  }
                  const missing = (route || []).filter(id => {
                    const s = getPresetSlot ? getPresetSlot(id) : null;
                    return !(s && s.payload && s.payload.appState);
                  });
                  if (missing.length > 0) {
                    console.warn('[Morph] Cannot enable; missing saved presets:', missing);
                    setMorphError(`Cannot enable: save presets ${missing.join(', ')} first (Shift+Click on circles).`);
                    // Do NOT enable
                    return;
                  }
                  setMorphEnabled && setMorphEnabled(true);
                  setMorphError('');
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
        {missing.length > 0 && (
          <div style={{ marginTop: '0.4rem', color: '#ff9e80', fontSize: '0.85rem' }}>
            Save these presets first (Shift+Click on their circles): {missing.join(', ')}
          </div>
        )}
        {morphError && (
          <div style={{ marginTop: '0.35rem', color: '#ef5350', fontSize: '0.85rem' }}>{morphError}</div>
        )}
        <div className="compact-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.5rem' }}>
          <label className="compact-label" title="Route of presets to morph through, comma-separated (e.g., 1,3,5)">
            Route
            <input
              type="text"
              className="compact-input"
              value={routeInput}
              onChange={(e) => setRouteInput(e.target.value)}
              onBlur={applyRouteFromInput}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyRouteFromInput(); } }}
            />
          </label>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem' }}>
            <button type="button" className="btn-compact-secondary" onClick={applyRouteFromInput} title="Apply route">Apply</button>
          </div>
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
    );
  };

  // Refs to stabilize morph engine
  const rafRef = useRef(0);
  const routeRef = useRef([]);
  const durRef = useRef(5);
  const easingRef = useRef('linear');
  const loopModeRef = useRef('loop');
  const getPresetSlotRef = useRef(getPresetSlot);
  const loadAppStateRef = useRef(loadAppState);
  const fadePrepRef = useRef({ key: null, lenA: 0, lenB: 0, baseA: [], baseB: [] });

  // Sync current settings into refs
  useEffect(() => { routeRef.current = Array.isArray(morphRoute) ? [...morphRoute] : []; }, [morphRoute]);
  useEffect(() => { durRef.current = Number(morphDurationPerLeg || 5); }, [morphDurationPerLeg]);
  useEffect(() => { easingRef.current = morphEasing || 'linear'; }, [morphEasing]);
  useEffect(() => { loopModeRef.current = morphLoopMode || 'loop'; }, [morphLoopMode]);
  const modeRef = useRef('tween');
  useEffect(() => { modeRef.current = morphMode || 'tween'; }, [morphMode]);
  useEffect(() => { getPresetSlotRef.current = getPresetSlot; }, [getPresetSlot]);
  useEffect(() => { loadAppStateRef.current = loadAppState; }, [loadAppState]);

  // Morph engine: interpolate between consecutive presets' appState
  useEffect(() => {
    // Stop any existing loop
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (!morphEnabled) return;
    const route = routeRef.current;
    if (!Array.isArray(route) || route.length < 2) return;

    let legIndex = 0;
    let forward = true;
    let startTime = performance.now();

    const lerp = (a, b, t) => a + (b - a) * t;
    const sanitizeHex = (val) => (typeof val === 'string' && /^#([0-9a-fA-F]{6})$/.test(val) ? val : '#000000');
    const lerpColor = (ca, cb, t) => {
      const ra = hexToRgb(sanitizeHex(ca));
      const rb = hexToRgb(sanitizeHex(cb));
      return rgbToHex({ r: Math.round(lerp(ra.r, rb.r, t)), g: Math.round(lerp(ra.g, rb.g, t)), b: Math.round(lerp(ra.b, rb.b, t)) });
    };
    const stripMorphFields = (state) => {
      if (!state || typeof state !== 'object') return state;
      const { morphEnabled: _me, morphRoute: _mr, morphDurationPerLeg: _md, morphEasing: _meas, morphLoopMode: _ml, ...rest } = state;
      return rest;
    };

    // Do not hard-load the starting preset; keep live animation running.
    // We'll blend visuals in-place each frame instead.
    setMorphStatus && setMorphStatus({ from: route[0], to: route[1], t: 0 });

    const step = () => {
      const now = performance.now();
      const durMs = Math.max(200, Number(durRef.current || 5) * 1000);
      const tRaw = Math.min(1, (now - startTime) / durMs);
      let t = tRaw;
      if (easingRef.current === 'linear') {
        // no-op
      }

      const routeNow = routeRef.current;
      const fromId = routeNow[legIndex];
      const toId = routeNow[(legIndex + 1) % routeNow.length];
      const fromSlot = getPresetSlotRef.current ? getPresetSlotRef.current(fromId) : null;
      const toSlot = getPresetSlotRef.current ? getPresetSlotRef.current(toId) : null;
      const fromState = fromSlot?.payload?.appState;
      const toState = toSlot?.payload?.appState;
      setMorphStatus && setMorphStatus({ from: fromId, to: toId, t });
      if (fromState && toState) {
        try {
          const a = stripMorphFields(fromState);
          const b = stripMorphFields(toState);
          if (modeRef.current === 'fade') {
            // Prepare once per leg: construct A+B layer stack with baseline opacities
            const legKey = `${fromId}->${toId}`;
            if (fadePrepRef.current.key !== legKey) {
              const layersA = Array.isArray(a.layers) ? a.layers : [];
              const layersB = Array.isArray(b.layers) ? b.layers : [];
              fadePrepRef.current = {
                key: legKey,
                lenA: layersA.length,
                lenB: layersB.length,
                baseA: layersA.map(l => Number(l?.opacity ?? 1)),
                baseB: layersB.map(l => Number(l?.opacity ?? 1)),
              };
              // Initialize combined stack: A visible, B hidden
              setLayers(() => [
                ...layersA.map(l => ({ ...l, opacity: Number(l.opacity ?? 1) })),
                ...layersB.map(l => ({ ...l, opacity: 0 })),
              ]);
            }
            // Blend background and opacities in place using baseline values (no compounding)
            setBackgroundColor && setBackgroundColor(lerpColor(a.backgroundColor || '#000000', b.backgroundColor || '#000000', t));
            const { lenA, baseA, baseB } = fadePrepRef.current;
            setLayers(prev => prev.map((l, i) => {
              let nextOpacity = Number(l.opacity ?? 1);
              if (i < lenA) {
                const oa0 = Number(baseA[i] ?? 0);
                nextOpacity = Math.max(0, Math.min(1, oa0 * (1 - t)));
              } else {
                const j = i - lenA;
                const ob0 = Number(baseB[j] ?? 0);
                nextOpacity = Math.max(0, Math.min(1, ob0 * t));
              }
              return nextOpacity !== l.opacity ? { ...l, opacity: nextOpacity } : l;
            }));
          } else {
            // Tween mode (default): adjust selected numeric fields in-place to keep animation running
            setBackgroundColor && setBackgroundColor(lerpColor(a.backgroundColor || '#000000', b.backgroundColor || '#000000', t));
            // Tween global speed (pass a number; setter doesn't accept functional updater)
            setGlobalSpeedMultiplier && setGlobalSpeedMultiplier(lerp(Number(a.globalSpeedMultiplier||1), Number(b.globalSpeedMultiplier||1), t));
            const bLayers = Array.isArray(b.layers) ? b.layers : [];
            setLayers(prev => prev.map((la, i) => {
              const lb = bLayers[i] || la;
              const pa = la.position || { x: 0.5, y: 0.5, scale: 1 };
              const pb = lb.position || { x: 0.5, y: 0.5, scale: 1 };
              const next = {
                ...la,
                opacity: lerp(Number(la.opacity||1), Number(lb.opacity||1), t),
                rotation: lerp(Number(la.rotation||0), Number(lb.rotation||0), t),
                radiusFactor: lerp(Number(la.radiusFactor||0.125), Number(lb.radiusFactor||0.125), t),
                movementSpeed: lerp(Number(la.movementSpeed||1), Number(lb.movementSpeed||1), t),
                position: {
                  ...pa,
                  x: lerp(Number(pa.x||0.5), Number(pb.x||0.5), t),
                  y: lerp(Number(pa.y||0.5), Number(pb.y||0.5), t),
                  scale: lerp(Number(pa.scale||1), Number(pb.scale||1), t),
                }
              };
              return next;
            }));
          }
        } catch {}
      }

      if (tRaw >= 1) {
        if (loopModeRef.current === 'pingpong') {
          if (forward) {
            if (legIndex + 1 >= routeNow.length - 1) {
              forward = false;
            } else {
              legIndex += 1;
            }
          } else {
            if (legIndex <= 0) {
              forward = true;
            } else {
              legIndex -= 1;
            }
          }
        } else {
          legIndex = (legIndex + 1) % routeNow.length;
        }
        startTime = now;
        // On leg boundary for fade mode: snap to target preset's layer list
        if (modeRef.current === 'fade') {
          const routeNow2 = routeRef.current;
          const toId2 = routeNow2[(legIndex) % routeNow2.length];
          const toSlot2 = getPresetSlotRef.current ? getPresetSlotRef.current(toId2) : null;
          const toState2 = toSlot2?.payload?.appState;
          const b2 = stripMorphFields(toState2 || {});
          const bLayers2 = Array.isArray(b2.layers) ? b2.layers : [];
          setLayers(() => bLayers2.map(l => ({ ...l })));
        }
        // Reset prep for next leg
        fadePrepRef.current = { key: null, lenA: 0, lenB: 0, baseA: [], baseB: [] };
      }
      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [morphEnabled]);

  return (
    <div className="control-card">
      <h3 style={{ marginTop: 0, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span>Global</span>
        <button className="icon-btn sm" onClick={handleRandomizeAll} title="Randomise everything" aria-label="Randomise everything">🎲</button>
        {/* Quick Save/Load configuration */}
        <button
          className="icon-btn sm"
          onClick={(e) => { e.stopPropagation(); typeof onQuickSave === 'function' && onQuickSave(); }}
          title="Save configuration"
          aria-label="Save configuration"
        >
          💾
        </button>
        <button
          className="icon-btn sm"
          onClick={(e) => { e.stopPropagation(); typeof onQuickLoad === 'function' && onQuickLoad(); }}
          title="Load configuration"
          aria-label="Load configuration"
        >
          📂
        </button>
        {showGlobalMidi && (
          <>
            <button
              className="btn-compact-secondary"
              onClick={(e) => { e.stopPropagation(); beginLearn && beginLearn('randomizeAll'); }}
              disabled={!midiSupported}
              title="MIDI Learn: Randomize All"
            >
              Learn
            </button>
            <button
              className="btn-compact-secondary"
              onClick={(e) => { e.stopPropagation(); clearMapping && clearMapping('randomizeAll'); }}
              disabled={!midiSupported || !midiMappings?.randomizeAll}
              title="Clear MIDI for Randomize All"
            >
              Clear
            </button>
            {midiSupported && (
              <span className="compact-label" style={{ opacity: 0.8 }}>
                {midiMappings?.randomizeAll ? (mappingLabel ? mappingLabel(midiMappings.randomizeAll) : 'Mapped') : 'Not mapped'}
                {learnParamId === 'randomizeAll' && <span style={{ marginLeft: '0.35rem', color: '#4fc3f7' }}>Listening…</span>}
              </span>
            )}
          </>
        )}
      </h3>
      {/* Presets & Morph Controls (optional) */}
      {!hidePresets && (
        <PresetControls
          setLayers={setLayers}
          setBackgroundColor={setBackgroundColor}
          setGlobalSpeedMultiplier={setGlobalSpeedMultiplier}
          showGlobalMidi={showGlobalMidi}
        />
      )}
      <div className="control-group" style={{ margin: 0 }}>
        {/* Background Color with inline include toggle */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.25rem', gap: '0.5rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: '1 1 auto', minWidth: 0, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600 }}>Background</span>
            <BackgroundColorPicker compact inline hideLabel showMidi={showGlobalMidi} color={backgroundColor} onChange={setBackgroundColor} />
            <label className="compact-label" title="Enable background image">
              <input
                type="checkbox"
                checked={!!backgroundImage?.enabled}
                onChange={(e) => setBackgroundImage(prev => ({ ...(prev || {}), enabled: !!e.target.checked }))}
              />
              Img
            </label>
            {backgroundImage?.enabled && (
              <>
                <input
                  type="file"
                  accept="image/png, image/jpeg"
                  title="Set background image"
                  aria-label="Set background image"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      const src = String(ev.target?.result || '');
                      setBackgroundImage(prev => ({ ...(prev || {}), src, enabled: true }));
                    };
                    reader.readAsDataURL(file);
                    e.target.value = '';
                  }}
                  style={{ width: 24 }}
                />
                <label className="compact-label" title="Background image opacity">
                  Opac
                  <input
                    type="range"
                    className="compact-range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={Math.max(0, Math.min(1, Number(backgroundImage?.opacity ?? 1)))}
                    onChange={(e) => setBackgroundImage(prev => ({ ...(prev || {}), opacity: parseFloat(e.target.value) }))}
                    style={{ width: 80 }}
                  />
                </label>
                <select
                  className="compact-select"
                  value={backgroundImage?.fit || 'cover'}
                  onChange={(e) => setBackgroundImage(prev => ({ ...(prev || {}), fit: e.target.value }))}
                  title="Background image fit"
                  aria-label="Background image fit"
                >
                  <option value="cover">cover</option>
                  <option value="contain">contain</option>
                  <option value="stretch">stretch</option>
                  <option value="center">center</option>
                </select>
                <button
                  type="button"
                  className="btn-compact-secondary"
                  title="Clear background image"
                  onClick={() => setBackgroundImage({ src: null, enabled: false, opacity: 1, fit: 'cover' })}
                >
                  Clear
                </button>
              </>
            )}
          </div>
          <label className="compact-label" title="Include Background Color in Randomize All" style={{ marginLeft: 'auto' }}>
            <input type="checkbox" checked={Boolean(getIsRnd('backgroundColor'))} onChange={(e) => setIsRnd('backgroundColor', Boolean(e.target.checked))} />
            Include
          </label>
        </div>
        {/* No settings panel for Background (non-numeric) */}

        <div className="global-compact-row">
          <label className="compact-label">
            <input type="checkbox" checked={isFrozen} onChange={(e) => setIsFrozen(e.target.checked)} /> Freeze
          </label>
          <label className="compact-label" title="Continue palette colour fading while frozen">
            <input type="checkbox" checked={!!colorFadeWhileFrozen} onChange={(e) => setColorFadeWhileFrozen(!!e.target.checked)} /> Fade while frozen
          </label>
          <label className="compact-label" title="Ignore Z movement (disable scaling animation)">
            <input type="checkbox" checked={!!zIgnore} onChange={(e) => setZIgnore(!!e.target.checked)} /> Z-Ignore
          </label>
          <label className="compact-label">
            <input type="checkbox" checked={classicMode} onChange={(e) => setClassicMode(e.target.checked)} /> Classic Mode
          </label>
          <label className="compact-label" title="Show/Hide MIDI Learn controls in this section">
            <input type="checkbox" checked={!!showGlobalMidi} onChange={(e) => setShowGlobalMidi(!!e.target.checked)} /> MIDI Learn
          </label>

          <div className="compact-field">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="compact-label">Global Speed: {globalSpeedMultiplier.toFixed(2)}</span>
              <button
                type="button"
                className="icon-btn sm"
                title="Global Speed settings"
                aria-label="Global Speed settings"
                onClick={(e) => { e.stopPropagation(); setShowSpeedSettings(s => !s); }}
              >⚙</button>
              <label className="compact-label" title="Include Global Speed in Randomize All">
                <input type="checkbox" checked={!!getIsRnd('globalSpeedMultiplier')} onChange={(e) => setIsRnd('globalSpeedMultiplier', e.target.checked)} /> Include
              </label>
            </div>
            <input className="compact-range" type="range" min={speedMin} max={speedMax} step={speedStep} value={globalSpeedMultiplier} onChange={(e) => setGlobalSpeedMultiplier(parseFloat(e.target.value))} />
            {showGlobalMidi && (
              <div className="compact-row" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.25rem' }}>
                <span className="compact-label" style={{ opacity: 0.8 }}>MIDI: {midiSupported ? (midiMappings?.globalSpeedMultiplier ? (mappingLabel ? mappingLabel(midiMappings.globalSpeedMultiplier) : 'Mapped') : 'Not mapped') : 'Not supported'}</span>
                {learnParamId === 'globalSpeedMultiplier' && midiSupported && <span style={{ color: '#4fc3f7' }}>Listening…</span>}
                <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); beginLearn && beginLearn('globalSpeedMultiplier'); }} disabled={!midiSupported}>Learn</button>
                <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); clearMapping && clearMapping('globalSpeedMultiplier'); }} disabled={!midiSupported || !midiMappings?.globalSpeedMultiplier}>Clear</button>
              </div>
            )}
            {showSpeedSettings && (
              <div className="dc-settings" style={{ marginTop: '0.25rem', padding: '0.5rem', borderRadius: 6, background: 'rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 5rem auto 5rem auto 5rem', gap: '0.4rem', alignItems: 'center' }}>
                  <label className="compact-label">Min</label>
                  <input type="number" step={0.01} value={speedMin} onChange={(e) => setSpeedMin(parseFloat(e.target.value) || 0)} />
                  <label className="compact-label">Max</label>
                  <input type="number" step={0.01} value={speedMax} onChange={(e) => setSpeedMax(parseFloat(e.target.value) || 0)} />
                  <label className="compact-label">Step</label>
                  <input type="number" step={0.001} value={speedStep} onChange={(e) => setSpeedStep(parseFloat(e.target.value) || 0.01)} />
                </div>
              </div>
            )}
          </div>

          <div className="compact-field">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label className="compact-label">Palette</label>
              <label className="compact-label" title="Allow Randomize All to change the palette">
                <input type="checkbox" checked={!!getIsRnd('globalPaletteIndex')} onChange={(e) => setIsRnd('globalPaletteIndex', e.target.checked)} /> Include
              </label>
            </div>
            <select
              className="compact-select"
              value={paletteValue}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'custom') return;
                const idx = parseInt(val, 10);
                if (!Number.isFinite(idx) || !palettes[idx]) return;
                const pick = palettes[idx];
                const src = Array.isArray(pick) ? pick : (pick?.colors || []);
                const nextColors = sampleColorsEven(src, Math.max(1, layers.length));
                assignOneColorPerLayer(nextColors);
              }}
            >
              <option value="custom">Custom</option>
              {palettes.map((p, i) => (
                <option key={i} value={i}>{p.name || `Palette ${i+1}`}</option>
              ))}
            </select>
            {showGlobalMidi && (
              <div className="compact-row" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.25rem' }}>
                <span className="compact-label" style={{ opacity: 0.8 }}>MIDI: {midiSupported ? (midiMappings?.globalPaletteIndex ? (mappingLabel ? mappingLabel(midiMappings.globalPaletteIndex) : 'Mapped') : 'Not mapped') : 'Not supported'}</span>
                {learnParamId === 'globalPaletteIndex' && midiSupported && <span style={{ color: '#4fc3f7' }}>Listening…</span>}
                <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); beginLearn && beginLearn('globalPaletteIndex'); }} disabled={!midiSupported} title="MIDI Learn: Palette Preset (applies to selected layer)">Learn</button>
                <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); clearMapping && clearMapping('globalPaletteIndex'); }} disabled={!midiSupported || !midiMappings?.globalPaletteIndex} title="Clear MIDI for Palette Preset">Clear</button>
              </div>
            )}
            {/* No settings panel for Palette (non-numeric) */}
          </div>

          <div className="compact-field">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label className="compact-label">Style</label>
              <label className="compact-label" title="Include Style in Randomize All">
                <input type="checkbox" checked={!!getIsRnd('globalBlendMode')} onChange={(e) => setIsRnd('globalBlendMode', e.target.checked)} /> Include
              </label>
            </div>
            <select className="compact-select" value={globalBlendMode} onChange={(e) => setGlobalBlendMode(e.target.value)}>
              {blendModes.map(m => (<option key={m} value={m}>{m}</option>))}
            </select>
            {showGlobalMidi && (
              <div className="compact-row" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.25rem' }}>
                <span className="compact-label" style={{ opacity: 0.8 }}>MIDI: {midiSupported ? (midiMappings?.globalBlendMode ? (mappingLabel ? mappingLabel(midiMappings.globalBlendMode) : 'Mapped') : 'Not mapped') : 'Not supported'}</span>
                {learnParamId === 'globalBlendMode' && midiSupported && <span style={{ color: '#4fc3f7' }}>Listening…</span>}
                <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); beginLearn && beginLearn('globalBlendMode'); }} disabled={!midiSupported}>Learn</button>
                <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); clearMapping && clearMapping('globalBlendMode'); }} disabled={!midiSupported || !midiMappings?.globalBlendMode}>Clear</button>
              </div>
            )}
            {/* No settings panel for Style (non-numeric) */}
          </div>

          <div className="compact-field">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="compact-label">MIDI Input</span>
            </div>
            {!midiSupported ? (
              <div style={{ opacity: 0.7 }}>No Web MIDI</div>
            ) : (
              <select className="compact-select" value={midiInputId || ''} onChange={(e) => setMidiInputId(e.target.value)}>
                <option value="">None</option>
                {(midiInputs || []).map(inp => (<option key={inp.id} value={inp.id}>{inp.name || inp.id}</option>))}
              </select>
            )}
            {/* No settings panel for MIDI Input (non-numeric) */}
          </div>

          <div className="compact-field">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="compact-label">Global Opacity</span>
              <button
                type="button"
                className="icon-btn sm"
                title="Global Opacity settings"
                aria-label="Global Opacity settings"
                onClick={(e) => { e.stopPropagation(); setShowOpacitySettings(s => !s); }}
              >⚙</button>
              <label className="compact-label" title="Include Opacity in Randomize All">
                <input type="checkbox" checked={!!getIsRnd('globalOpacity')} onChange={(e) => setIsRnd('globalOpacity', e.target.checked)} /> Include
              </label>
            </div>
            <input
              className="compact-range"
              type="range"
              min={opacityMin}
              max={opacityMax}
              step={opacityStep}
              value={Number.isFinite(layers?.[0]?.opacity) ? layers[0].opacity : 1}
              onChange={(e) => {
                const v = Math.max(0, Math.min(1, parseFloat(e.target.value)));
                setLayers(prev => prev.map(l => ({ ...l, opacity: v })));
              }}
            />
            {showGlobalMidi && (
              <div className="compact-row" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.25rem' }}>
                <span className="compact-label" style={{ opacity: 0.8 }}>MIDI: {midiSupported ? (midiMappings?.globalOpacity ? (mappingLabel ? mappingLabel(midiMappings.globalOpacity) : 'Mapped') : 'Not mapped') : 'Not supported'}</span>
                {learnParamId === 'globalOpacity' && midiSupported && <span style={{ color: '#4fc3f7' }}>Listening…</span>}
                <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); beginLearn && beginLearn('globalOpacity'); }} disabled={!midiSupported}>Learn</button>
                <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); clearMapping && clearMapping('globalOpacity'); }} disabled={!midiSupported || !midiMappings?.globalOpacity}>Clear</button>
              </div>
            )}
            {showOpacitySettings && (
              <div className="dc-settings" style={{ marginTop: '0.25rem', padding: '0.5rem', borderRadius: 6, background: 'rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 5rem auto 5rem auto 5rem', gap: '0.4rem', alignItems: 'center' }}>
                  <label className="compact-label">Min</label>
                  <input type="number" step={0.01} value={opacityMin} onChange={(e) => setOpacityMin(parseFloat(e.target.value) || 0)} />
                  <label className="compact-label">Max</label>
                  <input type="number" step={0.01} value={opacityMax} onChange={(e) => setOpacityMax(parseFloat(e.target.value) || 1)} />
                  <label className="compact-label">Step</label>
                  <input type="number" step={0.001} value={opacityStep} onChange={(e) => setOpacityStep(parseFloat(e.target.value) || 0.01)} />
                </div>
              </div>
            )}
          </div>

          <div className="compact-field">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="compact-label">Layers</span>
              <button
                type="button"
                className="icon-btn sm"
                title="Layers settings"
                aria-label="Layers settings"
                onClick={(e) => { e.stopPropagation(); setShowLayersSettings(s => !s); }}
              >⚙</button>
              <label className="compact-label" title="Include Layer Count in Randomize All">
                <input type="checkbox" checked={!!getIsRnd('layersCount')} onChange={(e) => setIsRnd('layersCount', e.target.checked)} /> Include
              </label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 64px', gap: '8px', alignItems: 'center' }}>
              <input
                className="compact-range"
                type="range"
                min={layersMin}
                max={layersMax}
                step={layersStep}
                value={layers.length}
                onChange={(e) => setLayerCount(e.target.value)}
              />
              <input
                type="number"
                min={layersMin}
                max={layersMax}
                step={layersStep}
                value={layers.length}
                onChange={(e) => setLayerCount(e.target.value)}
                onBlur={(e) => setLayerCount(e.target.value)}
                style={{ width: '100%', padding: '2px 6px', borderRadius: 6, background: 'rgba(255,255,255,0.08)', color: 'white', border: '1px solid rgba(255,255,255,0.12)' }}
              />
            </div>
            {showGlobalMidi && (
              <div className="compact-row" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.25rem' }}>
                <span className="compact-label" style={{ opacity: 0.8 }}>MIDI: {midiSupported ? (midiMappings?.layersCount ? (mappingLabel ? mappingLabel(midiMappings.layersCount) : 'Mapped') : 'Not mapped') : 'Not supported'}</span>
                {learnParamId === 'layersCount' && midiSupported && <span style={{ color: '#4fc3f7' }}>Listening…</span>}
                <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); beginLearn && beginLearn('layersCount'); }} disabled={!midiSupported}>Learn</button>
                <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); clearMapping && clearMapping('layersCount'); }} disabled={!midiSupported || !midiMappings?.layersCount}>Clear</button>
              </div>
            )}
            {showLayersSettings && (
              <div className="dc-settings" style={{ marginTop: '0.25rem', padding: '0.5rem', borderRadius: 6, background: 'rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 5rem auto 5rem auto 5rem', gap: '0.4rem', alignItems: 'center' }}>
                  <label className="compact-label">Min</label>
                  <input type="number" step={1} value={layersMin} onChange={(e) => setLayersMin(parseInt(e.target.value, 10) || 1)} />
                  <label className="compact-label">Max</label>
                  <input type="number" step={1} value={layersMax} onChange={(e) => setLayersMax(parseInt(e.target.value, 10) || 1)} />
                  <label className="compact-label">Step</label>
                  <input type="number" step={1} value={layersStep} onChange={(e) => setLayersStep(parseInt(e.target.value, 10) || 1)} />
                </div>
              </div>
            )}
          </div>

          <div className="compact-field">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="compact-label">Shape Variation: {Number(layers?.[0]?.variationShape ?? DEFAULT_LAYER.variationShape).toFixed(2)}</span>
              <button type="button" className="icon-btn sm" title="Variation settings" aria-label="Variation settings" onClick={(e) => { e.stopPropagation(); setShowVariationShapeSettings(s => !s); }}>⚙</button>
              <label className="compact-label" title="Include Shape Variation in Randomize All">
                <input type="checkbox" checked={!!getIsRnd('variationShape')} onChange={(e) => setIsRnd('variationShape', e.target.checked)} /> Include
              </label>
            </div>
            <input className="compact-range" type="range" min={variationShapeMin} max={variationShapeMax} step={variationShapeStep} value={Number(layers?.[0]?.variationShape ?? DEFAULT_LAYER.variationShape)} onChange={(e) => { const v = parseFloat(e.target.value); setLayers(prev => prev.map((l, i) => (i === 0 ? { ...l, variationShape: v } : l))); }} />
            {showVariationShapeSettings && (
              <div className="dc-settings" style={{ marginTop: '0.25rem', padding: '0.5rem', borderRadius: 6, background: 'rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 5rem auto 5rem auto 5rem', gap: '0.4rem', alignItems: 'center' }}>
                  <label className="compact-label">Min</label>
                  <input type="number" step={0.01} value={variationShapeMin} onChange={(e) => setVariationShapeMin(parseFloat(e.target.value) || 0)} />
                  <label className="compact-label">Max</label>
                  <input type="number" step={0.01} value={variationShapeMax} onChange={(e) => setVariationShapeMax(parseFloat(e.target.value) || 0)} />
                  <label className="compact-label">Step</label>
                  <input type="number" step={0.001} value={variationShapeStep} onChange={(e) => setVariationShapeStep(parseFloat(e.target.value) || 0.01)} />
                </div>
              </div>
            )}
          </div>

          <div className="compact-field">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="compact-label">Animation Variation: {Number(layers?.[0]?.variationAnim ?? DEFAULT_LAYER.variationAnim).toFixed(2)}</span>
              <button
                type="button"
                className="icon-btn sm"
                title="Variation settings"
                aria-label="Variation settings"
                onClick={(e) => { e.stopPropagation(); setShowVariationAnimSettings(s => !s); }}
              >⚙</button>
              <label className="compact-label" title="Include Animation Variation in Randomize All">
                <input type="checkbox" checked={!!getIsRnd('variationAnim')} onChange={(e) => setIsRnd('variationAnim', e.target.checked)} /> Include
              </label>
            </div>
            <input className="compact-range" type="range" min={variationAnimMin} max={variationAnimMax} step={variationAnimStep} value={Number(layers?.[0]?.variationAnim ?? DEFAULT_LAYER.variationAnim)} onChange={(e) => { const v = parseFloat(e.target.value); setLayers(prev => prev.map((l, i) => (i === 0 ? { ...l, variationAnim: v } : l))); }} />
            {showVariationAnimSettings && (
              <div className="dc-settings" style={{ marginTop: '0.25rem', padding: '0.5rem', borderRadius: 6, background: 'rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 5rem auto 5rem auto 5rem', gap: '0.4rem', alignItems: 'center' }}>
                  <label className="compact-label">Min</label>
                  <input type="number" step={0.01} value={variationAnimMin} onChange={(e) => setVariationAnimMin(parseFloat(e.target.value) || 0)} />
                  <label className="compact-label">Max</label>
                  <input type="number" step={0.01} value={variationAnimMax} onChange={(e) => setVariationAnimMax(parseFloat(e.target.value) || 0)} />
                  <label className="compact-label">Step</label>
                  <input type="number" step={0.001} value={variationAnimStep} onChange={(e) => setVariationAnimStep(parseFloat(e.target.value) || 0.01)} />
                </div>
              </div>
            )}
          </div>

          <div className="compact-field">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="compact-label">Colour Variation: {Number(layers?.[0]?.variationColor ?? DEFAULT_LAYER.variationColor).toFixed(2)}</span>
              <button
                type="button"
                className="icon-btn sm"
                title="Variation settings"
                aria-label="Variation settings"
                onClick={(e) => { e.stopPropagation(); setShowVariationColorSettings(s => !s); }}
              >⚙</button>
              <label className="compact-label" title="Include Colour Variation in Randomize All">
                <input type="checkbox" checked={!!getIsRnd('variationColor')} onChange={(e) => setIsRnd('variationColor', e.target.checked)} /> Include
              </label>
            </div>
            <input className="compact-range" type="range" min={variationColorMin} max={variationColorMax} step={variationColorStep} value={Number(layers?.[0]?.variationColor ?? DEFAULT_LAYER.variationColor)} onChange={(e) => { const v = parseFloat(e.target.value); setLayers(prev => prev.map((l, i) => (i === 0 ? { ...l, variationColor: v } : l))); }} />
            {showGlobalMidi && (
              <div className="compact-row" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.25rem' }}>
                <span className="compact-label" style={{ opacity: 0.8 }}>MIDI: {midiSupported ? (midiMappings?.variationColor ? (mappingLabel ? mappingLabel(midiMappings.variationColor) : 'Mapped') : 'Not mapped') : 'Not supported'}</span>
                {learnParamId === 'variationColor' && midiSupported && <span style={{ color: '#4fc3f7' }}>Listening…</span>}
                <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); beginLearn && beginLearn('variationColor'); }} disabled={!midiSupported}>Learn</button>
                <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); clearMapping && clearMapping('variationColor'); }} disabled={!midiSupported || !midiMappings?.variationColor}>Clear</button>
              </div>
            )}
            {showVariationColorSettings && (
              <div className="dc-settings" style={{ marginTop: '0.25rem', padding: '0.5rem', borderRadius: 6, background: 'rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 5rem auto 5rem auto 5rem', gap: '0.4rem', alignItems: 'center' }}>
                  <label className="compact-label">Min</label>
                  <input type="number" step={0.01} value={variationColorMin} onChange={(e) => setVariationColorMin(parseFloat(e.target.value) || 0)} />
                  <label className="compact-label">Max</label>
                  <input type="number" step={0.01} value={variationColorMax} onChange={(e) => setVariationColorMax(parseFloat(e.target.value) || 0)} />
                  <label className="compact-label">Step</label>
                  <input type="number" step={0.001} value={variationColorStep} onChange={(e) => setVariationColorStep(parseFloat(e.target.value) || 0.01)} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const areGlobalPropsEqual = (prev, next) => {
  const prevBGI = prev.backgroundImage || {};
  const nextBGI = next.backgroundImage || {};
  return (
    prev.backgroundColor === next.backgroundColor &&
    prev.getIsRnd === next.getIsRnd &&
    prevBGI.enabled === nextBGI.enabled &&
    prevBGI.src === nextBGI.src &&
    prevBGI.opacity === nextBGI.opacity &&
    prevBGI.fit === nextBGI.fit &&
    prev.isFrozen === next.isFrozen &&
    prev.zIgnore === next.zIgnore &&
    prev.colorFadeWhileFrozen === next.colorFadeWhileFrozen &&
    prev.classicMode === next.classicMode &&
    prev.showGlobalMidi === next.showGlobalMidi &&
    prev.globalSpeedMultiplier === next.globalSpeedMultiplier &&
    prev.globalBlendMode === next.globalBlendMode &&
    prev.midiInputId === next.midiInputId &&
    prev.layers === next.layers
  );
};

export default React.memo(GlobalControls, areGlobalPropsEqual);
