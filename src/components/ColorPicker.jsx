// src/components/ColorPicker.jsx
import React from 'react';

const ColorPicker = ({ colors, selectedColor, setSelectedColor, replaceColor }) => (
  <div className="flex items-center gap-2">
    {colors.map((color, idx) => (
      <div key={idx} className="flex flex-col items-center">
        <button
          style={{ backgroundColor: color, border: selectedColor === color ? '2px solid #fff' : '1px solid #444', width: 32, height: 32 }}
          className="rounded-full mb-1"
          onClick={() => setSelectedColor(color)}
        />
        <button
          className="text-xs text-white bg-gray-700 px-1 py-0.5 rounded"
          onClick={() => replaceColor(idx)}
        >Set</button>
      </div>
    ))}
    <input
      type="color"
      value={selectedColor}
      onChange={e => setSelectedColor(e.target.value)}
      className="w-10 h-10 border-0 ml-2"
    />
  </div>
);

export default ColorPicker;
