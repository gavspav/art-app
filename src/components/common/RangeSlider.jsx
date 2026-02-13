import React, { useRef, useCallback, useEffect, useState } from 'react';

/**
 * RangeSlider
 *
 * A slider with draggable min/max range handles overlaid on the track.
 * The range handles represent the randomisation bounds (randomMin / randomMax).
 *
 * Props:
 *  - value        Current parameter value
 *  - min          Slider minimum
 *  - max          Slider maximum
 *  - step         Slider step
 *  - onChange      Called when the main thumb moves  (e) => void
 *  - rangeMin     Current randomMin value (defaults to min)
 *  - rangeMax     Current randomMax value (defaults to max)
 *  - onRangeMinChange  (newVal) => void
 *  - onRangeMaxChange  (newVal) => void
 *  - className    Extra class for the native input
 *  - sliderKey    React key for the native input (for re-mount on layer switch)
 *  - style        Extra style for the native input
 *  - ...rest      Forwarded to the native <input>
 */
export default function RangeSlider({
  value,
  min,
  max,
  step,
  onChange,
  rangeMin,
  rangeMax,
  onRangeMinChange,
  onRangeMaxChange,
  className = 'dc-slider',
  sliderKey,
  style,
  ...rest
}) {
  const wrapRef = useRef(null);
  const draggingRef = useRef(null); // 'rangeMin' | 'rangeMax' | null
  const [isMainDragging, setIsMainDragging] = useState(false);
  const [, forceUpdate] = useState(0);

  const lo = Number.isFinite(min) ? min : 0;
  const hi = Number.isFinite(max) ? max : 1;
  const span = hi - lo || 1;

  const effectiveRangeMin = Number.isFinite(rangeMin) ? rangeMin : lo;
  const effectiveRangeMax = Number.isFinite(rangeMax) ? rangeMax : hi;

  const formatValue = useCallback((v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return '0';
    const stepNum = Number(step);
    if (Number.isFinite(stepNum) && stepNum > 0) {
      const stepText = String(stepNum);
      const decimals = stepText.includes('.') ? stepText.split('.')[1].length : 0;
      return n.toFixed(Math.min(4, Math.max(0, decimals)));
    }
    return n.toFixed(2);
  }, [step]);

  // Convert a value to a percentage position on the track (0–100)
  const toPercent = useCallback((v) => {
    return ((v - lo) / span) * 100;
  }, [lo, span]);

  // Convert a clientX to a value
  const clientXToValue = useCallback((clientX) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return lo;
    // Account for thumb width (9px half-thumb on each side)
    const thumbHalf = 9;
    const trackLeft = rect.left + thumbHalf;
    const trackWidth = rect.width - thumbHalf * 2;
    const ratio = Math.max(0, Math.min(1, (clientX - trackLeft) / trackWidth));
    let v = lo + ratio * span;
    // Snap to step
    const s = Number.isFinite(step) && step > 0 ? step : span / 1000;
    v = Math.round((v - lo) / s) * s + lo;
    return Math.max(lo, Math.min(hi, v));
  }, [lo, hi, span, step]);

  const onPointerDown = useCallback((which) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsMainDragging(false);
    draggingRef.current = which;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
    // Immediately update to pointer position
    const v = clientXToValue(e.clientX);
    if (which === 'rangeMin' && onRangeMinChange) {
      onRangeMinChange(Math.min(v, effectiveRangeMax));
    } else if (which === 'rangeMax' && onRangeMaxChange) {
      onRangeMaxChange(Math.max(v, effectiveRangeMin));
    }
    forceUpdate(n => n + 1);
  }, [clientXToValue, effectiveRangeMin, effectiveRangeMax, onRangeMinChange, onRangeMaxChange]);

  useEffect(() => {
    const onMove = (e) => {
      if (!draggingRef.current) return;
      const v = clientXToValue(e.clientX);
      if (draggingRef.current === 'rangeMin' && onRangeMinChange) {
        onRangeMinChange(Math.min(v, effectiveRangeMax));
      } else if (draggingRef.current === 'rangeMax' && onRangeMaxChange) {
        onRangeMaxChange(Math.max(v, effectiveRangeMin));
      }
    };
    const onUp = () => {
      setIsMainDragging(false);
      if (!draggingRef.current) return;
      draggingRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      forceUpdate(n => n + 1);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [clientXToValue, effectiveRangeMin, effectiveRangeMax, onRangeMinChange, onRangeMaxChange]);

  const minPct = toPercent(effectiveRangeMin);
  const maxPct = toPercent(effectiveRangeMax);
  const valuePct = toPercent(Number(value));

  // Show the highlighted band when the range is narrower than the full slider range
  const rangeIsCustom = effectiveRangeMin > lo + span * 0.001 || effectiveRangeMax < hi - span * 0.001;
  const activeDragType = draggingRef.current || (isMainDragging ? 'value' : null);
  const activeValue = activeDragType === 'rangeMin'
    ? effectiveRangeMin
    : activeDragType === 'rangeMax'
      ? effectiveRangeMax
      : Number(value);
  const activePct = activeDragType === 'rangeMin'
    ? minPct
    : activeDragType === 'rangeMax'
      ? maxPct
      : valuePct;

  return (
    <div className="range-slider-wrap" ref={wrapRef}>
      <input
        key={sliderKey}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={onChange}
        onPointerDown={() => setIsMainDragging(true)}
        className={className}
        style={style}
        {...rest}
      />
      {activeDragType && (
        <div
          className="range-slider-value-pop"
          style={{ left: `calc(${activePct}% + ${9 - activePct * 0.18}px)` }}
        >
          {activeDragType === 'rangeMin' ? 'Min: ' : activeDragType === 'rangeMax' ? 'Max: ' : ''}
          {formatValue(activeValue)}
        </div>
      )}
      {/* Highlighted range band */}
      {rangeIsCustom && (
        <div
          className="range-slider-band"
          style={{
            left: `calc(${minPct}% + ${9 - minPct * 0.18}px)`,
            width: `calc(${maxPct - minPct}% - ${(maxPct - minPct) * 0.18}px)`,
          }}
        />
      )}
      {/* Min handle — always visible */}
      <div
        className={`range-slider-handle range-slider-handle--min${draggingRef.current === 'rangeMin' ? ' active' : ''}${!rangeIsCustom ? ' at-edge' : ''}`}
        style={{ left: `calc(${minPct}% + ${9 - minPct * 0.18}px)` }}
        onPointerDown={onPointerDown('rangeMin')}
        title={`Rand Min: ${effectiveRangeMin.toFixed(2)}`}
      />
      {/* Max handle — always visible */}
      <div
        className={`range-slider-handle range-slider-handle--max${draggingRef.current === 'rangeMax' ? ' active' : ''}${!rangeIsCustom ? ' at-edge' : ''}`}
        style={{ left: `calc(${maxPct}% + ${9 - maxPct * 0.18}px)` }}
        onPointerDown={onPointerDown('rangeMax')}
        title={`Rand Max: ${effectiveRangeMax.toFixed(2)}`}
      />
    </div>
  );
}
