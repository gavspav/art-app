import React, { memo } from 'react';
import styles from './Controls.module.css';

/**
 * Individual parameter control component
 * Renders different input types based on parameter configuration
 */
const ParameterControl = memo(({ parameter, value, onChange }) => {
  const handleChange = (newValue) => {
    // Apply transformation if defined
    const transformedValue = parameter.transform?.fromSlider 
      ? parameter.transform.fromSlider(newValue)
      : newValue;
    
    onChange(parameter.id, transformedValue);
  };

  const getDisplayValue = () => {
    // Apply transformation for display if defined
    return parameter.transform?.toSlider 
      ? parameter.transform.toSlider(value)
      : value;
  };

  const renderSlider = () => {
    const displayValue = getDisplayValue();
    const controlId = `control-${parameter.id}`;
    
    return (
      <div className={styles.sliderContainer}>
        <input
          id={controlId}
          type="range"
          min={parameter.min}
          max={parameter.max}
          step={parameter.step}
          value={displayValue}
          onChange={(e) => handleChange(parseFloat(e.target.value))}
          className={styles.slider}
        />
        <span className={styles.valueDisplay}>
          {typeof value === 'number' ? value.toFixed(3) : value}
        </span>
      </div>
    );
  };

  const renderDropdown = () => {
    const controlId = `control-${parameter.id}`;
    return (
      <select
        id={controlId}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        className={styles.dropdown}
      >
        {parameter.options.map(option => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  };

  const renderColorPicker = () => {
    const controlId = `control-${parameter.id}`;
    return (
      <input
        id={controlId}
        type="color"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        className={styles.colorPicker}
      />
    );
  };

  const renderNumberInput = () => {
    const controlId = `control-${parameter.id}`;
    return (
      <input
        id={controlId}
        type="number"
        min={parameter.min}
        max={parameter.max}
        step={parameter.step}
        value={value}
        onChange={(e) => handleChange(parseFloat(e.target.value))}
        className={styles.numberInput}
      />
    );
  };

  const renderControl = () => {
    switch (parameter.type) {
      case 'slider':
        return renderSlider();
      case 'dropdown':
        return renderDropdown();
      case 'color':
        return renderColorPicker();
      case 'number':
        return renderNumberInput();
      default:
        return <span>Unsupported parameter type: {parameter.type}</span>;
    }
  };

  const controlId = `control-${parameter.id}`;

  return (
    <div className={styles.parameterControl}>
      <label className={styles.parameterLabel} htmlFor={controlId}>
        {parameter.label}
      </label>
      {renderControl()}
    </div>
  );
});

ParameterControl.displayName = 'ParameterControl';

export default ParameterControl;