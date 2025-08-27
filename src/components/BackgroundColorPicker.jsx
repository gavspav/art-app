import React from 'react';

const BackgroundColorPicker = ({ color, onChange, compact = false }) => {
  if (compact) {
    return (
      <div className="bg-compact-wrap" title="Background colour">
        <span className="bg-label">BG</span>
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
