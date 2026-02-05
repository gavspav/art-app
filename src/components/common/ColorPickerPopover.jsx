import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { hexToRgb as hexToRgbInt, rgbToHex as rgbToHexInt } from '../../utils/colorUtils.js';

const clamp01 = (value) => Math.min(1, Math.max(0, value));

const normalizeHex = (hex) => {
  if (typeof hex !== 'string') return '#ffffff';
  const value = hex.trim().replace('#', '');
  if (value.length === 3) {
    return `#${value.split('').map((v) => `${v}${v}`).join('')}`;
  }
  if (value.length === 6) return `#${value}`;
  return '#ffffff';
};

const hexToRgb = (hex) => {
  const parsed = hexToRgbInt(normalizeHex(hex));
  return {
    r: parsed.r / 255,
    g: parsed.g / 255,
    b: parsed.b / 255,
  };
};

const rgbToHex = ({ r, g, b }) => rgbToHexInt({
  r: clamp01(r) * 255,
  g: clamp01(g) * 255,
  b: clamp01(b) * 255,
});

const rgbToHsva = ({ r, g, b }) => {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta > 0.00001) {
    if (max === r) {
      h = ((g - b) / delta) % 6;
    } else if (max === g) {
      h = (b - r) / delta + 2;
    } else {
      h = (r - g) / delta + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : delta / max;
  const v = max;
  return { h, s, v, a: 1 };
};

const hsvaToRgb = ({ h, s, v }) => {
  const c = v * s;
  const hh = (h % 360) / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hh >= 0 && hh < 1) {
    r1 = c; g1 = x; b1 = 0;
  } else if (hh >= 1 && hh < 2) {
    r1 = x; g1 = c; b1 = 0;
  } else if (hh >= 2 && hh < 3) {
    r1 = 0; g1 = c; b1 = x;
  } else if (hh >= 3 && hh < 4) {
    r1 = 0; g1 = x; b1 = c;
  } else if (hh >= 4 && hh < 5) {
    r1 = x; g1 = 0; b1 = c;
  } else {
    r1 = c; g1 = 0; b1 = x;
  }
  const m = v - c;
  return { r: r1 + m, g: g1 + m, b: b1 + m };
};

const useDrag = (ref, handler) => {
  useEffect(() => {
    const node = ref.current;
    if (!node) return () => {};

    const handlePointerDown = (event) => {
      event.preventDefault();
      node.setPointerCapture?.(event.pointerId);
      const move = (ev) => handler(ev);
      const up = (ev) => {
        handler(ev);
        node.releasePointerCapture?.(event.pointerId);
        node.removeEventListener('pointermove', move);
        node.removeEventListener('pointerup', up);
        node.removeEventListener('pointercancel', up);
      };
      node.addEventListener('pointermove', move);
      node.addEventListener('pointerup', up);
      node.addEventListener('pointercancel', up);
      handler(event);
    };

    node.addEventListener('pointerdown', handlePointerDown);
    return () => {
      node.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [handler, ref]);
};

export default function ColorPickerPopover({ color, onChange, onClose, inline = false }) {
  const [hsva, setHsva] = useState(() => rgbToHsva(hexToRgb(color)));
  const [hexInput, setHexInput] = useState(() => color?.toUpperCase?.() || '#FFFFFF');
  const squareRef = useRef(null);
  const hueRef = useRef(null);

  useEffect(() => {
    const next = rgbToHsva(hexToRgb(color));
    setHsva(next);
    setHexInput((color || '#FFFFFF').toUpperCase());
  }, [color]);

  const emitChange = useCallback((nextHsva) => {
    const rgb = hsvaToRgb(nextHsva);
    const hex = rgbToHex(rgb);
    setHexInput(hex.toUpperCase());
    onChange?.(hex);
  }, [onChange]);

  const updateSquare = useCallback((event) => {
    if (!squareRef.current) return;
    const rect = squareRef.current.getBoundingClientRect();
    const x = clamp01((event.clientX - rect.left) / rect.width);
    const y = clamp01((event.clientY - rect.top) / rect.height);
    setHsva((prev) => {
      const next = { ...prev, s: x, v: 1 - y };
      emitChange(next);
      return next;
    });
  }, [emitChange]);

  const updateHue = useCallback((event) => {
    if (!hueRef.current) return;
    const rect = hueRef.current.getBoundingClientRect();
    const x = clamp01((event.clientX - rect.left) / rect.width);
    setHsva((prev) => {
      const next = { ...prev, h: x * 360 };
      emitChange(next);
      return next;
    });
  }, [emitChange]);

  useDrag(squareRef, updateSquare);
  useDrag(hueRef, updateHue);

  const currentRgb = useMemo(() => hsvaToRgb(hsva), [hsva]);
  const currentHex = useMemo(() => rgbToHex(currentRgb).toUpperCase(), [currentRgb]);

  const handleHexChange = useCallback((value) => {
    setHexInput(value.toUpperCase());
    const rgb = hexToRgb(value);
    const nextHsva = rgbToHsva(rgb);
    setHsva(nextHsva);
    emitChange(nextHsva);
  }, [emitChange]);

  const wrapClass = inline ? 'color-popover color-popover--inline' : 'color-popover';

  return (
    <div className={wrapClass} role="dialog" aria-label="Colour picker">
      {!inline && (
        <div className="color-popover__header">
          <input
            className="color-popover__hex"
            value={hexInput}
            onChange={(e) => handleHexChange(e.target.value)}
            onBlur={() => setHexInput(currentHex)}
            spellCheck={false}
            aria-label="Hex colour"
          />
          {onClose && (
            <button type="button" className="color-popover__close" onClick={onClose} aria-label="Close colour picker">✕</button>
          )}
        </div>
      )}

      <div
        ref={squareRef}
        className="color-popover__field"
        style={{
          background: `linear-gradient(90deg, #fff 0%, hsl(${hsva.h}deg 100% 50%) 100%), linear-gradient(0deg, #000 0%, transparent 100%)`,
        }}
      >
        <span
          className="color-popover__thumb"
          style={{
            left: `${hsva.s * 100}%`,
            top: `${(1 - hsva.v) * 100}%`,
          }}
        />
      </div>

      <div ref={hueRef} className="color-popover__hue">
        <span
          className="color-popover__hue-thumb"
          style={{ left: `${(hsva.h % 360) / 360 * 100}%` }}
        />
      </div>
    </div>
  );
}
