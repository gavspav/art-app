import React from 'react';

const BackgroundColorPicker = ({ color, onChange }) => {
  return (
    <div className="control-group">
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
