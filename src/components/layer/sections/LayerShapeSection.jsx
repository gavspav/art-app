import React from 'react';
import BufferedNumberInput from '../../common/BufferedNumberInput.jsx';
import { getOperationalMaxHint } from '../../../utils/parameterOperationalHints.js';
import RangeSlider from '../../common/RangeSlider.jsx';

const buildLayerParamIds = (layer, paramId) => {
  const layerNameKey = (layer?.name || 'Layer').toString();
  const stableLayerKey = String(layer?.id ?? layerNameKey);
  const layerKeys = Array.from(new Set([stableLayerKey, layerNameKey].filter(Boolean)));
  return layerKeys.map((layerKey) => `layer:${layerKey}:${paramId}`);
};

export default function LayerShapeSection({
  currentLayer,
  editTarget,
  shapeParams,
  DynamicControl: _DynamicControl,
  updateLayer,
  setLayers,
  buildTargetSet,
  targetMode,
  debugSettingsEnabled,
  rotateMin,
  rotateMax,
  showRotateSettings,
  setShowRotateSettings,
  setRotateMin,
  setRotateMax,
  applyRotation,
  getIsRnd,
  setIsRnd,
  MidiRotationStatus: _MidiRotationStatus,
  AudioRotationStatus: _AudioRotationStatus,
  BPMRotationStatus: _BPMRotationStatus,
}) {
  const DynamicControl = _DynamicControl;
  const MidiRotationStatus = _MidiRotationStatus;
  const AudioRotationStatus = _AudioRotationStatus;
  const BPMRotationStatus = _BPMRotationStatus;
  return (
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

        {currentLayer?.layerType === 'shape' && (
          <div className="control-group" style={{ marginTop: '0.5rem' }}>
            <div className="dc-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span style={{ fontWeight: 600 }}>Rotate</span>
                <BufferedNumberInput
                  value={Number(currentLayer?.rotation ?? 0)}
                  min={-180}
                  max={180}
                  step={1}
                  precision={0}
                  onCommit={(next) => {
                    const wrapped = ((((next + 180) % 360) + 360) % 360) - 180;
                    applyRotation(wrapped);
                  }}
                  className="dc-value-input"
                />
                <span style={{ opacity: 0.8 }}>°</span>
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
            <RangeSlider
              sliderKey={`rotation-${currentLayer?.id || 'none'}-${editTarget?.type || 'single'}-${editTarget?.groupId || ''}`}
              min={-180}
              max={180}
              step={1}
              value={Math.max(-180, Math.min(180, Number(currentLayer?.rotation ?? 0)))}
              onChange={(e) => {
                let v = parseFloat(e.target.value);
                if (!Number.isFinite(v)) v = 0;
                const wrapped = ((((v + 180) % 360) + 360) % 360) - 180;
                applyRotation(wrapped);
              }}
              className="dc-slider"
              rangeMin={rotateMin}
              rangeMax={rotateMax}
              onRangeMinChange={setRotateMin}
              onRangeMaxChange={setRotateMax}
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
                {(() => {
                  const paramIds = buildLayerParamIds(currentLayer, 'rotation');
                  const paramId = paramIds[0] || null;
                  return (
                    <>
                      <MidiRotationStatus paramId={paramId} paramAliases={paramIds} />
                      <AudioRotationStatus paramId={paramId} paramAliases={paramIds} />
                      <BPMRotationStatus paramId={paramId} paramAliases={paramIds} />
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
}
