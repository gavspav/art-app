import React, { useId, useRef, useState } from 'react';
import { Dices, Lock, SlidersHorizontal } from 'lucide-react';
import BufferedNumberInput from '../common/BufferedNumberInput.jsx';
import RangeSlider from '../common/RangeSlider.jsx';
import Knob from '../common/Knob.jsx';
import Popover from './Popover.jsx';
import { useUiPreferences } from '../../context/UiPreferencesContext.jsx';

// Compact parameter control: label · value · include-in-randomise · details.
// Randomisation bounds are always shown as draggable handles — on the slider
// track, or on the dial's outer ring when dials are enabled; the details popover holds precise numbers plus mapping (MIDI / audio / tempo).
// In dial-grid mode the row becomes a compact cell: label, dial, value, actions.
export default function ParameterRow({
  id, label, type = 'slider', value, min, max, step, precision, onChange, options = [],
  included, onIncludedChange, defaultValue,
  randomMin, randomMax, onRandomMinChange, onRandomMaxChange,
  mapped = [], listening = false,
  details, detailsTitle = 'Parameter details', sliderKey, inputId: inputIdProp,
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef(null);
  const uid = useId();
  const inputId = inputIdProp || `${id || 'param'}-${uid}`;
  const numeric = type === 'slider';
  const { controlStyle, dialLayout } = useUiPreferences();
  const useDial = numeric && controlStyle === 'dials';
  const gridCell = useDial && dialLayout === 'grid';
  const shown = numeric ? Math.min(max, Math.max(min, Number.isFinite(Number(value)) ? Number(value) : min)) : value;
  const hasMapping = mapped.length > 0;
  const hasDefault = Number.isFinite(Number(defaultValue));

  const diceButton = onIncludedChange && (
    <button type="button" className={`param-icon dice${included ? ' active' : ''}${included === false ? ' locked' : ''}`} aria-pressed={!!included}
      aria-label={included ? `Exclude ${label} from randomisation` : `Include ${label} in randomisation`}
      title={included ? 'Randomised — click to lock' : 'Locked — click to include in Randomise'}
      onClick={() => onIncludedChange(!included)}>
      {included === false ? <Lock size={14} /> : <Dices size={14} />}
    </button>
  );

  const detailsButton = details && (
    <button type="button" className={`param-icon more${open ? ' active' : ''}${hasMapping ? ' mapped' : ''}${listening ? ' listening' : ''}`}
      ref={anchorRef} aria-expanded={open} aria-label={`${label} details and mapping`}
      title={hasMapping ? `Mapped: ${mapped.join(', ')}` : 'Details, limits and mapping'}
      onClick={() => setOpen(value => !value)}>
      <SlidersHorizontal size={14} />
      {hasMapping && <span className="param-dots" aria-hidden="true">{mapped.map(kind => <i key={kind} className={`dot ${kind}`} />)}</span>}
    </button>
  );

  const dialControl = (
    <Knob
      min={min} max={max} step={step} value={shown}
      onChange={next => onChange(next)}
      defaultValue={defaultValue}
      rangeMin={randomMin} rangeMax={randomMax}
      onRangeMinChange={onRandomMinChange} onRangeMaxChange={onRandomMaxChange}
      showRangeBand={!!(onRandomMinChange && onRandomMaxChange)}
      size={gridCell ? 52 : 48}
      label={label}
      className={`knob-in-row${included === false ? ' excluded' : ''}`}
    />
  );

  const valueControl = numeric
    ? <BufferedNumberInput id={inputId} aria-label={`${label} value`} min={min} max={max} step={step} precision={precision} value={shown} onCommit={onChange} className="param-value" />
    : <select id={inputId} className="param-select" value={value ?? ''} onChange={event => onChange(event.target.value)}>
      {options.map(option => <option key={option} value={option}>{option}</option>)}
    </select>;

  const popover = details && <Popover open={open} anchorRef={anchorRef} onClose={() => setOpen(false)} title={`${label} · ${detailsTitle}`}>{details}</Popover>;

  if (gridCell) {
    return (
      <div className={`param-row dial cell${included === false ? ' excluded' : ''}${open ? ' open' : ''}`} data-param={id}>
        <label htmlFor={inputId} className="param-label" title={label}>{label}</label>
        {dialControl}
        {valueControl}
        <div className="param-cell-actions">{diceButton}{detailsButton}</div>
        {popover}
      </div>
    );
  }

  return (
    <div className={`param-row${useDial ? ' dial' : ''}${included === false ? ' excluded' : ''}${open ? ' open' : ''}`} data-param={id}>
      <div className="param-head">
        {useDial && dialControl}
        <label htmlFor={inputId} className="param-label">{label}</label>
        {valueControl}
        {diceButton}
        {detailsButton}
      </div>
      {numeric && !useDial && (
        <RangeSlider
          sliderKey={sliderKey}
          min={min} max={max} step={step} value={shown}
          onChange={event => onChange(parseFloat(event.target.value))}
          onDoubleClick={() => { if (hasDefault) onChange(Number(defaultValue)); }}
          rangeMin={randomMin} rangeMax={randomMax}
          onRangeMinChange={onRandomMinChange} onRangeMaxChange={onRandomMaxChange}
          showRangeHandles={!!(onRandomMinChange && onRandomMaxChange)}
          aria-label={label}
          className={`dc-slider${included === false ? ' excluded' : ''}`}
        />
      )}
      {popover}
    </div>
  );
}
