import React from 'react';

const ColorPicker = ({ label, colors, onChange }) => {

    const handleColorChange = (index, newColor) => {
        const newColors = [...colors];
        newColors[index] = newColor;
        onChange(newColors);
    };

    const addColor = () => {
        const newColors = [...colors, '#FFFFFF']; // Add white as default new color
        onChange(newColors);
    };

    const removeColor = (index) => {
        const newColors = colors.filter((_, i) => i !== index);
        onChange(newColors);
    };

    return (
        <div className="control-group color-picker-group">
            <label>{label}</label>
            <div className="color-inputs">
                {colors.map((color, index) => (
                    <div key={index} className="color-input-wrapper">
                        <input
                            type="color"
                            value={color}
                            onChange={(e) => handleColorChange(index, e.target.value)}
                        />
                        <button onClick={() => removeColor(index)} className="remove-color-btn">-</button>
                    </div>
                ))}
                <button onClick={addColor} className="add-color-btn">+</button>
            </div>
        </div>
    );
};

export default ColorPicker;
