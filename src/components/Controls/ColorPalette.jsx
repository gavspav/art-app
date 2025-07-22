import React, { memo } from 'react';
import { palettes } from '../../constants/palettes.js';
import styles from './Controls.module.css';

/**
 * Color palette selection component
 * Allows users to select from predefined color palettes
 */
const ColorPalette = memo(({ selectedColors, onColorsChange, selectedPalette, onPaletteChange }) => {
  const handlePaletteSelect = (paletteName) => {
    onPaletteChange(paletteName);
    if (palettes && palettes[paletteName]) {
      onColorsChange(palettes[paletteName]);
    }
  };

  const handleColorChange = (index, newColor) => {
    const newColors = [...selectedColors];
    newColors[index] = newColor;
    onColorsChange(newColors);
  };

  const addColor = () => {
    const newColors = [...selectedColors, '#ffffff'];
    onColorsChange(newColors);
  };

  const removeColor = (index) => {
    if (selectedColors.length > 1) {
      const newColors = selectedColors.filter((_, i) => i !== index);
      onColorsChange(newColors);
    }
  };

  return (
    <div className={styles.colorPalette}>
      <div className={styles.paletteSelector}>
        <label className={styles.sectionLabel}>Color Palette</label>
        <select
          value={selectedPalette || ''}
          onChange={(e) => handlePaletteSelect(e.target.value)}
          className={styles.paletteDropdown}
        >
          <option value="">Custom</option>
          {Object.keys(palettes || {}).map(paletteName => (
            <option key={paletteName} value={paletteName}>
              {paletteName.charAt(0).toUpperCase() + paletteName.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.palettePreview}>
        {selectedPalette && palettes && palettes[selectedPalette] && (
          <div className={styles.previewColors}>
            {palettes[selectedPalette].map((color, index) => (
              <div
                key={index}
                className={styles.previewColor}
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>
        )}
      </div>

      <div className={styles.colorEditor}>
        <label className={styles.sectionLabel}>Colors</label>
        <div className={styles.colorList}>
          {selectedColors.map((color, index) => (
            <div key={index} className={styles.colorItem}>
              <input
                type="color"
                value={color}
                onChange={(e) => handleColorChange(index, e.target.value)}
                className={styles.colorInput}
              />
              <span className={styles.colorValue}>{color}</span>
              {selectedColors.length > 1 && (
                <button
                  onClick={() => removeColor(index)}
                  className={styles.removeColorButton}
                  title="Remove color"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        
        <button
          onClick={addColor}
          className={styles.addColorButton}
          disabled={selectedColors.length >= 8}
        >
          Add Color
        </button>
      </div>
    </div>
  );
});

ColorPalette.displayName = 'ColorPalette';

export default ColorPalette;