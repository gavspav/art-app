import React from 'react';

const ImportAdjustPanel = ({
  importAdjust,
  onChange,
  fitEnabled,
  onToggleFit,
  debug,
  onToggleDebug,
  onReset,
  onClose,
}) => {
  const { dx = 0, dy = 0, s = 1 } = importAdjust || {};
  return (
    <div className="import-adjust">
      <div className="row"><strong>Adjust Imported Layers</strong></div>
      <div className="row">
        <label>dx</label>
        <input type="range" min={-1} max={1} step={0.001} value={dx}
          onChange={e => onChange?.({ ...importAdjust, dx: Number(e.target.value) })} />
      </div>
      <div className="row">
        <label>dy</label>
        <input type="range" min={-1} max={1} step={0.001} value={dy}
          onChange={e => onChange?.({ ...importAdjust, dy: Number(e.target.value) })} />
      </div>
      <div className="row">
        <label>scale</label>
        <input type="range" min={0.05} max={5} step={0.001} value={s}
          onChange={e => onChange?.({ ...importAdjust, s: Number(e.target.value) })} />
      </div>
      <div className="row">
        <label>Fit</label>
        <input type="checkbox" checked={!!fitEnabled} onChange={onToggleFit} />
      </div>
      <div className="row">
        <label>Debug</label>
        <input type="checkbox" checked={!!debug} onChange={onToggleDebug} />
      </div>
      <div className="row">
        <button onClick={onReset}>Reset</button>
        <button onClick={onClose}>Close</button>
      </div>
    </div>
  );
};

export default ImportAdjustPanel;

