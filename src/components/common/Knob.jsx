import React, { useCallback, useEffect, useRef, useState } from 'react';
import './Knob.css';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Polar point on a dial: 0deg points straight up, positive angles clockwise.
const polar = (cx, cy, r, deg) => {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(rad), cy - r * Math.cos(rad)];
};

// SVG arc path from angle a0 to a1 (degrees, 0 = up, clockwise positive).
const arcPath = (cx, cy, r, a0, a1) => {
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  const sweep = a1 >= a0 ? 1 : 0;
  return `M ${x0.toFixed(3)} ${y0.toFixed(3)} A ${r} ${r} 0 ${large} ${sweep} ${x1.toFixed(3)} ${y1.toFixed(3)}`;
};

/**
 * Knob - a rotary dial ("pot") control, compact alternative to a slider.
 *
 * Drag up/down to change the value; moving sideways away from the dial while
 * dragging progressively increases precision (touch-friendly fine control),
 * and Shift gives the finest control. Double-tap resets to `defaultValue`
 * when supplied. Arrow keys step, PageUp/PageDown jump 10 steps, Home/End go
 * to the limits. Optional amber band on the outer ring shows the
 * randomisation range (rangeMin/rangeMax); when range callbacks are supplied
 * its two ends become draggable handles (grab within ~6 viewBox units of a
 * handle).
 *
 * Props:
 *  - value, min, max, step   numeric range (numbers or numeric strings)
 *  - onChange(next: number)  called with the snapped/clamped value
 *  - defaultValue            enables double-tap to reset
 *  - rangeMin, rangeMax      randomisation bounds for the band
 *  - onRangeMinChange(v), onRangeMaxChange(v)  make the bounds draggable
 *  - showRangeBand           render the amber band when the range is narrowed
 *  - disabled                block interaction
 *  - size                    pixel size of the SVG (default 40)
 *  - label                   aria-label for the slider role
 *  - className               appended to `knob` on the outer element
 *  - ...rest                 forwarded to the outer element (title, style, ...)
 */
export default function Knob({
  value,
  min = 0,
  max = 1,
  step = 0,
  onChange,
  defaultValue,
  rangeMin,
  rangeMax,
  onRangeMinChange,
  onRangeMaxChange,
  showRangeBand = false,
  disabled = false,
  size = 40,
  className = '',
  label,
  ...rest
}) {
  const lo = Number.isFinite(Number(min)) ? Number(min) : 0;
  const hi = Number.isFinite(Number(max)) ? Number(max) : 1;
  const span = hi - lo || 1;
  const stepNum = Number.isFinite(Number(step)) ? Number(step) : 0;

  const raw = Number(value);
  const shown = Number.isFinite(raw) ? clamp(raw, lo, hi) : lo;
  const fraction = (shown - lo) / span;
  const angle = -135 + fraction * 270;

  // Randomisation bounds (effective, clamped and ordered).
  const rangeEditable = !!(showRangeBand && onRangeMinChange && onRangeMaxChange);
  const rMinRaw = Number(rangeMin);
  const rMaxRaw = Number(rangeMax);
  const rA = rangeMin !== undefined && rangeMin !== null && rangeMin !== '' && Number.isFinite(rMinRaw) ? clamp(rMinRaw, lo, hi) : lo;
  const rB = rangeMax !== undefined && rangeMax !== null && rangeMax !== '' && Number.isFinite(rMaxRaw) ? clamp(rMaxRaw, lo, hi) : hi;
  const rMin = Math.min(rA, rB);
  const rMax = Math.max(rA, rB);
  const toAngle = (v) => -135 + ((v - lo) / span) * 270;
  const minAngle = toAngle(rMin);
  const maxAngle = toAngle(rMax);

  // Drag mode: null | 'value' | 'rangeMin' | 'rangeMax'.
  const [dragMode, setDragMode] = useState(null);
  const dragging = dragMode !== null;
  const startRef = useRef({ value: 0, current: 0, x: 0, y: 0, lastY: 0, cx: 0, cy: 0 });
  const lastTapRef = useRef({ t: 0, x: 0, y: 0 });
  const hasDefault = Number.isFinite(Number(defaultValue));

  const snapClamp = useCallback((next) => {
    let snapped = next;
    if (stepNum > 0) snapped = Number((Math.round((snapped - lo) / stepNum) * stepNum + lo).toFixed(10));
    return clamp(snapped, lo, hi);
  }, [stepNum, lo, hi]);

  const emit = useCallback((next) => {
    if (!onChange) return;
    onChange(snapClamp(next));
  }, [onChange, snapClamp]);

  const onPointerDown = useCallback((e) => {
    if (disabled) return;
    e.preventDefault();
    const clientX = e.clientX || 0;
    const clientY = e.clientY || 0;
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let mode = 'value';
    if (rangeEditable) {
      const scale = 40 / (rect.width || 40);
      const lx = (clientX - rect.left) * scale;
      const ly = (clientY - rect.top) * scale;
      const [minX, minY] = polar(20, 20, 17.5, minAngle);
      const [maxX, maxY] = polar(20, 20, 17.5, maxAngle);
      const nearMin = Math.hypot(lx - minX, ly - minY) <= 6;
      const nearMax = Math.hypot(lx - maxX, ly - maxY) <= 6;
      if (nearMin && nearMax) {
        if (rMin === rMax && rMax >= hi) mode = 'rangeMin';
        else if (rMin === rMax && rMin <= lo) mode = 'rangeMax';
        else {
          const pa = (Math.atan2(clientX - cx, -(clientY - cy)) * 180) / Math.PI;
          mode = pa < (minAngle + maxAngle) / 2 ? 'rangeMin' : 'rangeMax';
        }
      } else if (nearMin) mode = 'rangeMin';
      else if (nearMax) mode = 'rangeMax';
    }
    if (mode === 'value' && hasDefault) {
      const lt = lastTapRef.current;
      if (performance.now() - lt.t < 300 && Math.hypot(clientX - lt.x, clientY - lt.y) < 10) {
        lastTapRef.current = { t: 0, x: 0, y: 0 };
        emit(Number(defaultValue));
        return;
      }
    }
    startRef.current = { value: shown, current: shown, x: clientX, y: clientY, lastY: clientY, cx, cy };
    setDragMode(mode);
    document.body.style.cursor = mode === 'value' ? 'ns-resize' : 'grabbing';
    document.body.style.userSelect = 'none';
  }, [disabled, shown, rangeEditable, minAngle, maxAngle, rMin, rMax, lo, hi, hasDefault, defaultValue, emit]);

  // Reset global cursor/selection when a drag ends or the component unmounts.
  useEffect(() => {
    if (!dragging) return undefined;
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [dragging]);

  useEffect(() => {
    if (!dragMode) return undefined;
    const onMove = (e) => {
      if (dragMode === 'value') {
        // Vertical drag changes the value; horizontal distance from the
        // start point increases precision (Pencil-friendly fine control).
        const dx = Math.abs((e.clientX || 0) - startRef.current.x);
        const precision = Math.min(10, 1 + Math.max(0, dx - 20) / 30);
        const pxPerSpan = 150 * precision * (e.shiftKey ? 10 : 1);
        const dy = startRef.current.lastY - (e.clientY || 0);
        startRef.current.lastY = e.clientY || 0;
        startRef.current.current += (dy / pxPerSpan) * span;
        emit(startRef.current.current);
        return;
      }
      const { cx, cy } = startRef.current;
      let pa = (Math.atan2((e.clientX || 0) - cx, -((e.clientY || 0) - cy)) * 180) / Math.PI;
      if (pa > 135 || pa < -135) pa = pa > 0 ? 135 : -135;
      const v = snapClamp(lo + ((pa + 135) / 270) * span);
      if (dragMode === 'rangeMin') onRangeMinChange?.(Math.min(v, rMax));
      else onRangeMaxChange?.(Math.max(v, rMin));
    };
    const onUp = (e) => {
      if (dragMode === 'value' && e && Number.isFinite(e.clientX)) {
        const moved = Math.hypot((e.clientX || 0) - startRef.current.x, (e.clientY || 0) - startRef.current.y);
        if (moved < 4) lastTapRef.current = { t: performance.now(), x: e.clientX, y: e.clientY };
      }
      setDragMode(null);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragMode, emit, snapClamp, span, lo, rMin, rMax, onRangeMinChange, onRangeMaxChange]);

  const formatValue = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return '0';
    if (stepNum > 0) {
      const stepText = String(stepNum);
      const decimals = stepText.includes('.') ? stepText.split('.')[1].length : 0;
      return n.toFixed(Math.min(4, Math.max(0, decimals)));
    }
    return n.toFixed(2);
  };

  const onKeyDown = useCallback((e) => {
    if (disabled) return;
    const s = stepNum > 0 ? stepNum : span / 100;
    let next;
    switch (e.key) {
      case 'ArrowUp':
      case 'ArrowRight': next = shown + s; break;
      case 'ArrowDown':
      case 'ArrowLeft': next = shown - s; break;
      case 'PageUp': next = shown + s * 10; break;
      case 'PageDown': next = shown - s * 10; break;
      case 'Home': next = lo; break;
      case 'End': next = hi; break;
      default: return;
    }
    e.preventDefault();
    emit(next);
  }, [disabled, stepNum, span, shown, lo, hi, emit]);

  // Amber band only when the randomisation range is narrower than min..max.
  const bandShown = showRangeBand && (rMin > lo || rMax < hi);
  const [hMinX, hMinY] = polar(20, 20, 17.5, minAngle);
  const [hMaxX, hMaxY] = polar(20, 20, 17.5, maxAngle);
  const minAtEdge = rMin <= lo || rMin >= hi;
  const maxAtEdge = rMax <= lo || rMax >= hi;
  const rangeDrag = dragMode === 'rangeMin' || dragMode === 'rangeMax';

  const [px, py] = polar(20, 20, 9, angle);

  return (
    <div
      className={`knob${dragging ? ' dragging' : ''}${disabled ? ' disabled' : ''} ${className}`}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-valuemin={lo}
      aria-valuemax={hi}
      aria-valuenow={shown}
      aria-orientation="vertical"
      aria-disabled={disabled || undefined}
      aria-label={label}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      {...rest}
      title={rest.title ?? (hasDefault ? 'Drag up/down · double-tap to reset' : undefined)}
    >
      <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
        <path className="knob-track" d={arcPath(20, 20, 13.5, -135, 135)} />
        <path className="knob-value" d={arcPath(20, 20, 13.5, -135, angle)} />
        {bandShown && <path className="knob-range" d={arcPath(20, 20, 17.5, minAngle, maxAngle)} />}
        <line className="knob-pointer" x1={20} y1={20} x2={px.toFixed(3)} y2={py.toFixed(3)} />
        {rangeEditable && <>
          <circle
            className={`knob-handle knob-handle--min${minAtEdge ? ' at-edge' : ''}${dragMode === 'rangeMin' ? ' active' : ''}`}
            cx={hMinX.toFixed(3)} cy={hMinY.toFixed(3)} r="2.6"
          />
          <circle
            className={`knob-handle knob-handle--max${maxAtEdge ? ' at-edge' : ''}${dragMode === 'rangeMax' ? ' active' : ''}`}
            cx={hMaxX.toFixed(3)} cy={hMaxY.toFixed(3)} r="2.6"
          />
        </>}
      </svg>
      {rangeDrag && (
        <span className="knob-pop">
          {dragMode === 'rangeMin' ? 'Min' : 'Max'} {formatValue(dragMode === 'rangeMin' ? rMin : rMax)}
        </span>
      )}
    </div>
  );
}
