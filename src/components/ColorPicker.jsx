import React from 'react';

const ColorPicker = ({ color, onChange }) => {
  return (
    <div className="color-picker-container">
      <label htmlFor="bg-color-picker">BG Color:</label>
      <input
        type="color"
        id="bg-color-picker"
        value={color}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
};

export default ColorPicker;
