import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ColorPickerPopover from './common/ColorPickerPopover.jsx';

const FALLBACK_COLOR = '#FFFFFF';

const ColorPicker = ({ label, colors, onChange, layerId }) => {
  const containerRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(null);

  const safeColors = useMemo(() => (Array.isArray(colors) ? colors : []), [colors]);

  useEffect(() => {
    setActiveIndex((prev) => {
      if (prev === null) return prev;
      const list = safeColors;
      if (!Array.isArray(list) || list.length === 0) return null;
      if (prev < 0 || prev >= list.length) return Math.max(0, list.length - 1);
      if (list[prev] !== colors?.[prev]) {
        const idx = Math.min(prev, list.length - 1);
        return idx;
      }
      return prev;
    });
  }, [colors, safeColors]);

  const handleColorChange = useCallback((index, nextColor) => {
    const next = [...safeColors];
    next[index] = nextColor;
    onChange(next);
  }, [safeColors, onChange]);

  const addColor = useCallback(() => {
    const base = safeColors.length ? safeColors[safeColors.length - 1] : FALLBACK_COLOR;
    const next = [...safeColors, base];
    onChange(next);
    setActiveIndex(next.length - 1);
  }, [safeColors, onChange]);

  const removeColor = useCallback((index) => {
    const next = safeColors.filter((_, i) => i !== index);
    onChange(next);
    setActiveIndex((prev) => {
      if (prev === null) return prev;
      if (prev === index) return null;
      if (prev > index) return Math.max(0, prev - 1);
      return prev;
    });
  }, [onChange, safeColors]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target)) {
        setActiveIndex(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setActiveIndex(null);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (activeIndex === null) return;
    if (activeIndex >= colors.length) {
      setActiveIndex(null);
    }
  }, [activeIndex, colors.length]);

  const activeColor = (typeof activeIndex === 'number' && activeIndex >= 0 && activeIndex < colors.length)
    ? colors[activeIndex]
    : null;

  return (
    <div
      className="control-group"
      ref={containerRef}
      style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}
    >
      <label style={{ fontWeight: 600 }}>{label}</label>
      <div className="color-picker__swatches">
        {safeColors.map((color, index) => (
          <div
            key={`${layerId || 'default'}-${index}`}
            style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}
          >
            <button
              type="button"
              onClick={() => setActiveIndex((prev) => (prev === index ? null : index))}
              className={`color-picker__swatch-btn${activeIndex === index ? ' active' : ''}`}
              style={{ background: color }}
              title={`Edit colour ${index + 1}`}
            />
            <button
              type="button"
              onClick={() => removeColor(index)}
              className="color-picker__remove-btn"
              title="Remove colour"
              disabled={safeColors.length <= 1}
            >
              −
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addColor}
          className="color-picker__add-btn"
          title="Add colour"
        >
          +
        </button>
      </div>
      {activeColor && (
        <div className="color-popover-container">
          <ColorPickerPopover
            color={activeColor}
            onChange={(next) => handleColorChange(activeIndex, next)}
            onClose={() => setActiveIndex(null)}
          />
        </div>
      )}
    </div>
  );
};

export default ColorPicker;
