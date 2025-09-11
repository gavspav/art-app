import React, { useMemo } from 'react';
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

        <div className="global-compact-row">
          <label className="compact-label">
            <input type="checkbox" checked={isFrozen} onChange={(e) => setIsFrozen(e.target.checked)} /> Freeze
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
              <label className="compact-label" title="Include Global Speed in Randomize All">
                <input type="checkbox" checked={!!getIsRnd('globalSpeedMultiplier')} onChange={(e) => setIsRnd('globalSpeedMultiplier', e.target.checked)} /> Include
              </label>
            </div>
            <input className="compact-range" type="range" min={0} max={5} step={0.01} value={globalSpeedMultiplier} onChange={(e) => setGlobalSpeedMultiplier(parseFloat(e.target.value))} />
            {showGlobalMidi && (
              <div className="compact-row" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.25rem' }}>
                <span className="compact-label" style={{ opacity: 0.8 }}>MIDI: {midiSupported ? (midiMappings?.globalSpeedMultiplier ? (mappingLabel ? mappingLabel(midiMappings.globalSpeedMultiplier) : 'Mapped') : 'Not mapped') : 'Not supported'}</span>
                {learnParamId === 'globalSpeedMultiplier' && midiSupported && <span style={{ color: '#4fc3f7' }}>Listening…</span>}
                <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); beginLearn && beginLearn('globalSpeedMultiplier'); }} disabled={!midiSupported}>Learn</button>
                <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); clearMapping && clearMapping('globalSpeedMultiplier'); }} disabled={!midiSupported || !midiMappings?.globalSpeedMultiplier}>Clear</button>
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
          </div>

          <div className="compact-field">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="compact-label">Global Opacity</span>
              <label className="compact-label" title="Include Opacity in Randomize All">
                <input type="checkbox" checked={!!getIsRnd('globalOpacity')} onChange={(e) => setIsRnd('globalOpacity', e.target.checked)} /> Include
              </label>
            </div>
            <input
              className="compact-range"
              type="range"
              min={0}
              max={1}
              step={0.01}
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
          </div>

          <div className="compact-field">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="compact-label">Layers</span>
              <label className="compact-label" title="Include Layer Count in Randomize All">
                <input type="checkbox" checked={!!getIsRnd('layersCount')} onChange={(e) => setIsRnd('layersCount', e.target.checked)} /> Include
              </label>
            </div>
            <input
              className="compact-range"
              type="range"
              min={1}
              max={20}
              step={1}
              value={layers.length}
              onChange={(e) => {
                const target = parseInt(e.target.value, 10);
                setLayers(prev => {
                  let next = prev;
                  if (target > prev.length) {
                    const addCount = target - prev.length;
                    const baseVar = (typeof prev[0]?.variation === 'number') ? prev[0].variation : DEFAULT_LAYER.variation;
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
          </div>

          <div className="compact-field">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="compact-label">Layer Variation: {Number(layers?.[0]?.variation ?? DEFAULT_LAYER.variation).toFixed(2)}</span>
              <label className="compact-label" title="Include Layer Variation in Randomize All">
                <input type="checkbox" checked={!!getIsRnd('variation')} onChange={(e) => setIsRnd('variation', e.target.checked)} /> Include
              </label>
            </div>
            <input
              className="compact-range"
              type="range"
              min={0}
              max={3}
              step={0.01}
              value={Number(layers?.[0]?.variation ?? DEFAULT_LAYER.variation)}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setLayers(prev => prev.map((l, i) => (i === 0 ? { ...l, variation: v } : l)));
              }}
            />
            {showGlobalMidi && (
              <div className="compact-row" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.25rem' }}>
                <span className="compact-label" style={{ opacity: 0.8 }}>
                  MIDI: {midiSupported ? (midiMappings?.variation ? (mappingLabel ? mappingLabel(midiMappings.variation) : 'Mapped') : 'Not mapped') : 'Not supported'}
                </span>
                {learnParamId === 'variation' && midiSupported && <span style={{ color: '#4fc3f7' }}>Listening…</span>}
                <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); beginLearn && beginLearn('variation'); }} disabled={!midiSupported}>Learn</button>
                <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); clearMapping && clearMapping('variation'); }} disabled={!midiSupported || !midiMappings?.variation}>Clear</button>
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
    prevBGI.enabled === nextBGI.enabled &&
    prevBGI.src === nextBGI.src &&
    prevBGI.opacity === nextBGI.opacity &&
    prevBGI.fit === nextBGI.fit &&
    prev.isFrozen === next.isFrozen &&
    prev.classicMode === next.classicMode &&
    prev.showGlobalMidi === next.showGlobalMidi &&
    prev.globalSpeedMultiplier === next.globalSpeedMultiplier &&
    prev.globalBlendMode === next.globalBlendMode &&
    prev.midiInputId === next.midiInputId &&
    prev.layers === next.layers
  );
};

export default React.memo(GlobalControls, areGlobalPropsEqual);
