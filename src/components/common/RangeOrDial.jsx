import React from 'react';
import { useUiPreferences } from '../../context/UiPreferencesContext.jsx';
import Knob from './Knob.jsx';

/**
 * RangeOrDial - drop-in replacement for <input type="range"> call sites.
 *
 * Reads the user's control-style preference: 'dials' renders a rotary Knob,
 * anything else renders the native range input unchanged. In dial mode the
 * onChange handler is invoked with a synthetic `{ target: { value: String(v) } }`
 * so existing `e => f(parseFloat(e.target.value))` handlers keep working.
 *
 * `className` and `style` describe the native input (e.g. `.dc-slider` sets
 * width:100%/height:6px) so they are only applied in slider mode. `size` only
 * applies to the Knob in dial mode.
 */
export default function RangeOrDial({
  min,
  max,
  step,
  value,
  onChange,
  className,
  style,
  disabled,
  title,
  size,
  'aria-label': ariaLabel,
  ...rest
}) {
  const { controlStyle } = useUiPreferences();

  if (controlStyle === 'dials') {
    return (
      <Knob
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={v => onChange?.({ target: { value: String(v) } })}
        disabled={disabled}
        size={size}
        title={title}
        label={ariaLabel}
        {...rest}
      />
    );
  }

  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={onChange}
      className={className}
      style={style}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      {...rest}
    />
  );
}
