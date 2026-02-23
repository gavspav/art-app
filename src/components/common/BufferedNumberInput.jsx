import React, { useEffect, useMemo, useState } from 'react';

const clampNumber = (value, min, max) => {
  let next = value;
  if (Number.isFinite(min)) next = Math.max(min, next);
  if (Number.isFinite(max)) next = Math.min(max, next);
  return next;
};

const resolvePrecision = (step) => {
  if (!Number.isFinite(step)) return 0;
  const str = step.toString().toLowerCase();
  if (str.includes('e-')) {
    const parts = str.split('e-');
    const exp = parseInt(parts[1], 10);
    return Number.isFinite(exp) ? exp : 0;
  }
  if (!str.includes('.')) return 0;
  return str.length - str.indexOf('.') - 1;
};

const formatValue = (value, precision) => {
  if (!Number.isFinite(value)) return '';
  if (!precision) return `${value}`;
  return value.toFixed(precision);
};

const parseDraft = (draft) => {
  if (typeof draft !== 'string') return null;
  const trimmed = draft.trim();
  if (trimmed === '' || trimmed === '-' || trimmed === '+' || trimmed === '.' || trimmed === '-.' || trimmed === '+.') {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

export default function BufferedNumberInput({
  value,
  onCommit,
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY,
  step,
  precision: precisionOverride,
  placeholder = '',
  className,
  style,
  disabled = false,
  inputMode = 'decimal',
  // Allow consumers to pass through any other valid input props (name, id, aria-* etc)
  ...rest
}) {
  const { onChange: _ignoredOnChange, ...passthrough } = rest;
  const precision = useMemo(() => {
    if (Number.isInteger(precisionOverride) && precisionOverride >= 0) {
      return precisionOverride;
    }
    return resolvePrecision(step);
  }, [precisionOverride, step]);
  const [isActive, setIsActive] = useState(false);
  const [draft, setDraft] = useState(() => formatValue(value, precision));
  useEffect(() => {
    if (!isActive) {
      setDraft(formatValue(value, precision));
    }
  }, [isActive, precision, value]);

  const commit = (forceValue) => {
    if (disabled) {
      setIsActive(false);
      return;
    }
    const source = typeof forceValue === 'number' ? forceValue : parseDraft(draft);
    if (source === null) {
      setDraft(formatValue(value, precision));
      setIsActive(false);
      return;
    }
    let next = source;
    if (Number.isFinite(step) && step > 0) {
      const factor = 10 ** precision;
      next = Math.round(next * factor) / factor;
    }
    next = clampNumber(next, min, max);
    if (Number.isFinite(next) && next !== value) {
      onCommit?.(next);
    }
    setDraft(formatValue(Number.isFinite(next) ? next : value, precision));
    setIsActive(false);
  };

  const revert = () => {
    setDraft(formatValue(value, precision));
    setIsActive(false);
  };

  const handleKeyDown = (event) => {
    if (disabled) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      revert();
      event.currentTarget?.blur?.();
      return;
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const increment = Number.isFinite(step) && step !== 0 ? step : 1;
      const base = parseDraft(draft);
      const current = base === null ? (Number.isFinite(value) ? value : 0) : base;
      const delta = event.key === 'ArrowUp' ? increment : -increment;
      const next = clampNumber(current + delta, min, max);
      setDraft(formatValue(next, precision));
      onCommit?.(next);
      return;
    }
    event.stopPropagation();
  };

  const handleBlur = () => {
    commit();
  };

  const handleFocus = (event) => {
    if (disabled) return;
    setIsActive(true);
    setDraft(formatValue(value, precision));
    event.target.select?.();
  };

  const displayValue = isActive ? draft : formatValue(value, precision);

  return (
    <input
      type="text"
      value={displayValue}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      onChange={(event) => {
        setDraft(event.target.value);
      }}
      placeholder={placeholder}
      className={className}
      style={style}
      disabled={disabled}
      inputMode={inputMode}
      aria-disabled={disabled}
      {...passthrough}
    />
  );
}
