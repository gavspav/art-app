import React from 'react';
import BufferedNumberInput from '../common/BufferedNumberInput.jsx';

// Precise numeric entry for a slider's physical bounds and randomisation range.
export default function LimitsFields({ min, max, step, randomMin, randomMax, onMin, onMax, onStep, onRandomMin, onRandomMax, maxHint = '' }) {
  return (
    <div className="limits-grid">
      {onMin && <label>Min<BufferedNumberInput value={min} step={step} onCommit={onMin} /></label>}
      {onMax && <label>{`Max${maxHint}`}<BufferedNumberInput value={max} step={step} onCommit={onMax} /></label>}
      {onStep && <label>Step<BufferedNumberInput value={step} precision={3} onCommit={onStep} /></label>}
      <label className="random">Random min<BufferedNumberInput min={min} max={randomMax} step={step} value={randomMin} onCommit={onRandomMin} /></label>
      <label className="random">Random max<BufferedNumberInput min={randomMin} max={max} step={step} value={randomMax} onCommit={onRandomMax} /></label>
    </div>
  );
}
