export default function RandomizationControls({
  onRandomizeAll,
  onRandomizeLayer,
  onRandomizeAnimation,
  onRandomizeColors,
  disabled = false,
}) {
  return (
    <div className="randomization-controls" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
      <button
        type="button"
        className="control-button"
        onClick={onRandomizeAll}
        disabled={disabled}
      >
        Randomize All
      </button>
      <button
        type="button"
        className="control-button"
        onClick={onRandomizeLayer}
        disabled={disabled}
      >
        Randomize Layer
      </button>
      <button
        type="button"
        className="control-button"
        onClick={onRandomizeAnimation}
        disabled={disabled}
      >
        Randomize Animation
      </button>
      <button
        type="button"
        className="control-button"
        onClick={onRandomizeColors}
        disabled={disabled}
      >
        Randomize Colors
      </button>
    </div>
  );
}
