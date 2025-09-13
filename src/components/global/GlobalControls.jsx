import React, { useMemo, useState } from 'react';
import BackgroundColorPicker from '../BackgroundColorPicker.jsx';

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
}) => {
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
  return (
    <div className="control-card">
      <h3 style={{ marginTop: 0, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span>Global</span>
        <button className="icon-btn sm" onClick={handleRandomizeAll} title="Randomise everything" aria-label="Randomise everything">🎲</button>
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
            <input
              className="compact-range"
              type="range"
              min={layersMin}
              max={layersMax}
              step={layersStep}
              value={layers.length}
              onChange={(e) => {
                const target = parseInt(e.target.value, 10);
                setLayers(prev => {
                  let next = prev;
                  if (target > prev.length) {
                    const addCount = target - prev.length;
                    const baseVar = {
                      shape: (typeof prev?.[0]?.variationShape === 'number') ? prev[0].variationShape : (typeof prev?.[0]?.variation === 'number' ? prev[0].variation : DEFAULT_LAYER.variationShape),
                      anim: (typeof prev?.[0]?.variationAnim === 'number') ? prev[0].variationAnim : (typeof prev?.[0]?.variation === 'number' ? prev[0].variation : DEFAULT_LAYER.variationAnim),
                      color: (typeof prev?.[0]?.variationColor === 'number') ? prev[0].variationColor : (typeof prev?.[0]?.variation === 'number' ? prev[0].variation : DEFAULT_LAYER.variationColor),
                    };
                    let last = prev[prev.length - 1] || DEFAULT_LAYER;
                    const additions = Array.from({ length: addCount }, (_, i) => {
                      const nextIdx = prev.length + i + 1;
                      const nextLayer = buildVariedLayerFrom(last, nextIdx, baseVar);
                      last = nextLayer;
                      return nextLayer;
                    });
                    next = [...prev, ...additions];
                  } else if (target < prev.length) {
                    next = prev.slice(0, target);
                  }
                  return next.map((l, i) => ({ ...l, name: `Layer ${i + 1}` }));
                });
                setSelectedLayerIndex(Math.max(0, target - 1));
              }}
            />
            <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>{layers.length}</span>
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
