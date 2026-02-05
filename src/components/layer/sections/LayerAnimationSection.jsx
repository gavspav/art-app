import React from 'react';
import ControlSectionCard from '../../controls/common/ControlSectionCard.jsx';

export default function LayerAnimationSection({
  currentLayer,
  editTarget,
  movementParams,
  DynamicControl: _DynamicControl,
  updateLayer,
  setLayers,
  buildTargetSet,
  targetMode,
  debugSettingsEnabled,
  randomizeAnimationOnly,
  handleOrbitRadiusChange,
}) {
  const DynamicControl = _DynamicControl;
  return (
    <div className="tab-section">
      <ControlSectionCard
        title="Animation"
        actions={(
          <button
            type="button"
            className="icon-btn sm"
            title="Randomize animation for selected layer"
            aria-label="Randomize animation for selected layer"
            onClick={() => randomizeAnimationOnly && randomizeAnimationOnly()}
          >
            🎲
          </button>
        )}
      >
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
      </ControlSectionCard>

      {currentLayer?.movementStyle === 'orbit' && (
        <ControlSectionCard title="Orbit" style={{ marginTop: '0.6rem' }}>
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
        </ControlSectionCard>
      )}
    </div>
  );
}
