import React from 'react';

const BackgroundColorPicker = ({ color, onChange, compact = false, hideLabel = false, inline = false }) => {
  if (compact) {
    if (inline) {
      return (
        <input
          className="bgcolor-mini"
          type="color"
          value={color}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Background colour"
          title="Background colour"
        />
      );
    }
    return (
      <div className="bg-compact-wrap" title="Background colour">
        {!hideLabel && <span className="bg-label">BG</span>}
        <input
          className="bgcolor-mini"
          type="color"
          value={color}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Background colour"
        />
      </div>
    );
  }
  return (
    <div className={`control-group`}>
      <label>Background Color</label>
      <input
        type="color"
        value={color}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
};

export default BackgroundColorPicker;
