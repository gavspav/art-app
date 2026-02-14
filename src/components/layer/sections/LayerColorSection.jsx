import React from 'react';
import ColorPicker from '../../ColorPicker.jsx';
import BufferedNumberInput from '../../common/BufferedNumberInput.jsx';

const buildLayerParamIds = (layer, paramId) => {
  const layerNameKey = (layer?.name || 'Layer').toString();
  const stableLayerKey = String(layer?.id ?? layerNameKey);
  const layerKeys = Array.from(new Set([stableLayerKey, layerNameKey].filter(Boolean)));
  return layerKeys.map((layerKey) => `layer:${layerKey}:${paramId}`);
};

export default function LayerColorSection({
  currentLayer,
  editTarget,
  targetMode,
  updateLayer,
  setLayers,
  buildTargetSet,
  applyTargetedUpdate,
  MidiColorSection: _MidiColorSection,
  randomizePalette,
  setRandomizePalette,
  randomizeNumColors,
  setRandomizeNumColors,
  colorCountMin,
  colorCountMax,
  setColorCountMin,
  setColorCountMax,
  midiSupported,
  midiMappings,
  mappingLabel,
  learnParamId,
  beginLearn,
  clearMapping,
  onRandomizeLayerColors,
  showColourSettings,
  setShowColourSettings,
  paletteOptions,
  paletteValueMap,
  matchPaletteValue,
  sampleColors,
  onSaveCustomPalette,
  AudioRotationStatus: _AudioRotationStatus,
  BPMRotationStatus: _BPMRotationStatus,
}) {
  const MidiColorSection = _MidiColorSection;
  const AudioRotationStatus = _AudioRotationStatus;
  const BPMRotationStatus = _BPMRotationStatus;
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

  return (
    <div className="tab-section">
      <div className="control-card">
        <MidiColorSection
          currentLayer={currentLayer}
          updateLayer={updateLayer}
          setLayers={setLayers}
          buildTargetSet={buildTargetSet}
          targetMode={targetMode}
        />

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

        <div className="dc-inner" style={{ marginTop: '0.6rem' }}>
          <div className="dc-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
              {(() => {
                const paramIds = buildLayerParamIds(currentLayer, 'paletteIndex');
                const paramId = paramIds[0] || null;
                const mappedMidiId = paramIds.find(id => midiMappings?.[id]) || null;
                return (
                  <div style={{ marginTop: '0.6rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ fontSize: '0.9rem', opacity: 0.9, marginBottom: '0.4rem' }}>
                      <strong>Palette Control</strong>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>
                        <span style={{ opacity: 0.7 }}>MIDI:</span> {midiSupported ? (mappedMidiId ? (mappingLabel ? mappingLabel(midiMappings[mappedMidiId]) : 'Mapped') : 'Not mapped') : 'Not supported'}
                        {paramIds.includes(learnParamId) && midiSupported && <span style={{ marginLeft: '0.5rem', color: '#4fc3f7' }}>Listening…</span>}
                      </div>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button type="button" className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); beginLearn && beginLearn(paramId); }} disabled={!midiSupported}>Learn</button>
                        <button
                          type="button"
                          className="btn-compact-secondary"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!clearMapping) return;
                            paramIds.forEach((id) => clearMapping(id));
                          }}
                          disabled={!midiSupported || !mappedMidiId}
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                    <AudioRotationStatus paramId={paramId} paramAliases={paramIds} min={0} max={1} />
                    <BPMRotationStatus paramId={paramId} paramAliases={paramIds} min={0} max={1} />
                  </div>
                );
              })()}
            </div>
          )}

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
                {(() => {
                  const paramIds = buildLayerParamIds(currentLayer, 'colorFadeSpeed');
                  const paramId = paramIds[0] || null;
                  return (
                    <>
                      <AudioRotationStatus paramId={paramId} paramAliases={paramIds} min={0} max={4} />
                      <BPMRotationStatus paramId={paramId} paramAliases={paramIds} min={0} max={4} />
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
}
