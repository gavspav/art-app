import React, { useId, useRef, useState } from 'react';
import { Dices, SlidersHorizontal } from 'lucide-react';
import BufferedNumberInput from '../common/BufferedNumberInput.jsx';
import RangeSlider from '../common/RangeSlider.jsx';
import Popover from './Popover.jsx';

// Compact parameter control: label · value · include-in-randomise · details.
// Randomisation bounds are always shown as handles on the slider itself;
// the details popover holds precise numbers plus mapping (MIDI / audio / tempo).
export default function ParameterRow({
  id, label, type = 'slider', value, min, max, step, precision, onChange, options = [],
  included, onIncludedChange,
  randomMin, randomMax, onRandomMinChange, onRandomMaxChange,
  mapped = [], listening = false,
  details, detailsTitle = 'Parameter details', sliderKey, inputId: inputIdProp,
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef(null);
  const uid = useId();
  const inputId = inputIdProp || `${id || 'param'}-${uid}`;
  const numeric = type === 'slider';
  const shown = numeric ? Math.min(max, Math.max(min, Number.isFinite(Number(value)) ? Number(value) : min)) : value;
  const hasMapping = mapped.length > 0;

  return (
    <div className={`param-row${open ? ' open' : ''}`} data-param={id}>
      <div className="param-head">
        <label htmlFor={inputId} className="param-label">{label}</label>
        {numeric
          ? <BufferedNumberInput id={inputId} aria-label={`${label} value`} min={min} max={max} step={step} precision={precision} value={shown} onCommit={onChange} className="param-value" />
          : <select id={inputId} className="param-select" value={value ?? ''} onChange={event => onChange(event.target.value)}>
            {options.map(option => <option key={option} value={option}>{option}</option>)}
          </select>}
        {onIncludedChange && (
          <button type="button" className={`param-icon dice${included ? ' active' : ''}`} aria-pressed={!!included}
            aria-label={included ? `Exclude ${label} from randomisation` : `Include ${label} in randomisation`}
            title={included ? 'Included in Randomise — click to exclude' : 'Excluded from Randomise — click to include'}
            onClick={() => onIncludedChange(!included)}><Dices size={14} /></button>
        )}
        {details && (
          <button type="button" className={`param-icon more${open ? ' active' : ''}${hasMapping ? ' mapped' : ''}${listening ? ' listening' : ''}`}
            ref={anchorRef} aria-expanded={open} aria-label={`${label} details and mapping`}
            title={hasMapping ? `Mapped: ${mapped.join(', ')}` : 'Details, limits and mapping'}
            onClick={() => setOpen(value => !value)}>
            <SlidersHorizontal size={14} />
            {hasMapping && <span className="param-dots" aria-hidden="true">{mapped.map(kind => <i key={kind} className={`dot ${kind}`} />)}</span>}
          </button>
        )}
      </div>
      {numeric && (
        <RangeSlider
          sliderKey={sliderKey}
          min={min} max={max} step={step} value={shown}
          onChange={event => onChange(parseFloat(event.target.value))}
          rangeMin={randomMin} rangeMax={randomMax}
          onRangeMinChange={onRandomMinChange} onRangeMaxChange={onRandomMaxChange}
          showRangeHandles={!!(onRandomMinChange && onRandomMaxChange)}
          aria-label={label}
          className={`dc-slider${included === false ? ' excluded' : ''}`}
        />
      )}
      {details && <Popover open={open} anchorRef={anchorRef} onClose={() => setOpen(false)} title={`${label} · ${detailsTitle}`}>{details}</Popover>}
    </div>
  );
}
