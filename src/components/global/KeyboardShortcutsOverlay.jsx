export default function KeyboardShortcutsOverlay({ visible, onClose }) {
  if (!visible) return null;

  const handleBackgroundClick = (event) => {
    if (event.target === event.currentTarget && typeof onClose === 'function') {
      onClose();
    }
  };

  return (
    <div
      className="shortcuts-overlay"
      aria-live="polite"
      aria-modal="true"
      role="dialog"
      onClick={handleBackgroundClick}
    >
      <div className="shortcuts-card">
        <div className="shortcuts-title">Keyboard Shortcuts</div>
        <div className="shortcuts-grid">
          <div><kbd>1</kbd><span>Global tab</span></div>
          <div><kbd>2</kbd><span>Layer Shape tab</span></div>
          <div><kbd>3</kbd><span>Layer Animation tab</span></div>
          <div><kbd>4</kbd><span>Layer Colour tab</span></div>
          <div><kbd>5</kbd><span>Presets tab</span></div>
          <div><kbd>F</kbd><span>Toggle Fullscreen</span></div>
          <div><kbd>G</kbd><span>Toggle target Individual / Global</span></div>
          <div><kbd>O</kbd><span>Show / Hide layer outlines</span></div>
          <div><kbd>S</kbd><span>Quick-save RAM preset</span></div>
          <div><kbd>Shift</kbd> + <kbd>A</kbd><span>Recall RAM preset</span></div>
          <div><kbd>L</kbd><span>Lock / Unlock control panel</span></div>
          <div><kbd>M</kbd><span>Toggle MIDI panel</span></div>
          <div><kbd>Space</kbd><span>Freeze / Unfreeze</span></div>
          <div><kbd>Delete</kbd><span>Delete selected layer (Node Edit mode)</span></div>
          <div><kbd>Shift</kbd> + <kbd>1</kbd>..<kbd>9</kbd><span>Activate Layers 1–9</span></div>
          <div><kbd>H</kbd><span>Hide / Show control panel</span></div>
          <div><kbd>K</kbd><span>Toggle this shortcuts panel</span></div>
          <div><kbd>Esc</kbd><span>Close dialogs/overlays</span></div>
        </div>
        <div className="shortcuts-hint">Press Esc or K to close</div>
        {typeof onClose === 'function' && (
          <button type="button" className="control-button" onClick={onClose}>
            Close
          </button>
        )}
      </div>
    </div>
  );
}
