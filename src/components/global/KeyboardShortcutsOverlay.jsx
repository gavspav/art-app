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
          <div><kbd>6</kbd><span>Groups tab</span></div>
          <div><kbd>F</kbd><span>Toggle Fullscreen</span></div>
          <div><kbd>G</kbd><span>Toggle target Individual / Global</span></div>
          <div><kbd>I</kbd><span>Toggle isolate mode</span></div>
          <div><kbd>O</kbd><span>Show / Hide layer outlines</span></div>
          <div><kbd>R</kbd><span>Randomize all</span></div>
          <div><kbd>S</kbd><span>Quick-save RAM preset</span></div>
          <div><kbd>Shift</kbd> + <kbd>A</kbd><span>Recall RAM preset</span></div>
          <div><kbd>L</kbd><span>Lock / Unlock control panel</span></div>
          <div><kbd>N</kbd><span>Toggle node edit mode</span></div>
          <div><kbd>Z</kbd><span>Toggle Z-Scale ignore</span></div>
          <div><kbd>Space</kbd><span>Freeze / Unfreeze (or Timeline Play/Pause when timeline visible)</span></div>
          <div><kbd>Delete</kbd><span>Delete selected layer (Node Edit mode)</span></div>
          <div><kbd>[</kbd><span>Select previous layer</span></div>
          <div><kbd>]</kbd><span>Select next layer</span></div>
          <div><kbd>Shift</kbd> + <kbd>1</kbd>..<kbd>9</kbd><span>Activate Layers 1–9</span></div>
          <div><kbd>H</kbd><span>Hide / Show control panel</span></div>
          <div><kbd>B</kbd><span>Toggle BPM play/pause</span></div>
          <div><kbd>A</kbd><span>Toggle audio reactive input</span></div>
          <div><kbd>T</kbd><span>Show / Hide timeline</span></div>
          <div><kbd>P</kbd><span>Timeline play / pause</span></div>
          <div><kbd>Home</kbd><span>Stop timeline and go to start</span></div>
          <div><kbd>C</kbd><span>Capture active layer to shape keyframe (when timeline visible)</span></div>
          <div><kbd>Shift</kbd> + <kbd>C</kbd><span>Capture current scene to global keyframe (Global Shape track)</span></div>
          <div><kbd>Shift</kbd> + <kbd>V</kbd><span>Generate variation keyframe at playhead (active layer&apos;s shape track)</span></div>
          <div><kbd>Shift</kbd> + <kbd>R</kbd><span>Generate N random keyframes (variation scaled by audio energy if enabled)</span></div>
          <div><kbd>Shift</kbd> + <kbd>F</kbd><span>Fill variation keyframes between first and last keyframe on active shape track</span></div>
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
