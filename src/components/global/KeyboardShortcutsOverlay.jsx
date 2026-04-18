const SHORTCUT_SECTIONS = [
  {
    title: 'Workspace',
    items: [
      [['1'], 'Global tab'],
      [['2'], 'Layer Shape tab'],
      [['3'], 'Layer Animation tab'],
      [['4'], 'Layer Colour tab'],
      [['5'], 'Audio tab'],
      [['6'], 'Presets tab'],
      [['7'], 'Groups tab'],
      [['H'], 'Hide / show control panel'],
      [['F'], 'Toggle fullscreen'],
      [['T'], 'Show / hide timeline'],
      [['K'], 'Toggle this shortcuts panel'],
    ],
  },
  {
    title: 'Scene',
    items: [
      [['G'], 'Toggle target Individual / Global'],
      [['I'], 'Toggle isolate mode'],
      [['O'], 'Show / hide layer outlines'],
      [['R'], 'Randomize all'],
      [['S'], 'Quick-save RAM preset'],
      [['Shift', 'A'], 'Recall RAM preset'],
      [['L'], 'Lock / unlock control panel'],
      [['N'], 'Toggle node edit mode'],
      [['Z'], 'Toggle Z-scale ignore'],
      [['Space'], 'Freeze / unfreeze, or timeline play / pause when visible'],
    ],
  },
  {
    title: 'Audio',
    items: [
      [['B'], 'Toggle BPM play / pause'],
      [['A'], 'Toggle audio reactive input'],
      [['P'], 'Timeline play / pause'],
      [['Home'], 'Stop timeline and go to start'],
      [['C'], 'Capture active layer to shape keyframe'],
      [['Delete'], 'Delete selected layer in node edit mode'],
      [['['], 'Select previous layer'],
      [[']'], 'Select next layer'],
      [['Shift', '1..9'], 'Activate Layers 1-9'],
      [['Esc'], 'Close dialogs and overlays'],
    ],
  },
  {
    title: 'Timeline',
    items: [
      [['Ctrl/Cmd', 'Drag'], 'Marquee-select timeline keyframes'],
      [['Ctrl/Cmd', 'C/X/V'], 'Copy, cut, or paste keyframes at the playhead'],
      [['Shift', 'C'], 'Overwrite selected keyframe or capture a global keyframe'],
      [['Shift', 'V'], 'Generate variation keyframe at playhead'],
      [['Shift', 'R'], 'Generate N random keyframes'],
      [['Shift', 'F'], 'Fill variation keyframes between first and last keyframe'],
    ],
  },
  {
    title: 'Node Edit',
    items: [
      [['Double-click'], 'Close the current draft path'],
      [['Enter'], 'Close the current draft path'],
      [['Esc'], 'Cancel the current draft and restore the prior shape'],
      [['Shift', 'Drag'], 'Snap draft and endpoint drags to straight 45° increments'],
      [['Ctrl', 'Drag center'], 'Rotate the active shape/path in place'],
      [['CapsLock'], 'Bend selected nodes with vertical mouse movement'],
    ],
  },
];

const NODE_EDIT_TIPS = [
  'Click and drag on empty canvas in Node Edit mode to start a draft path on the active layer.',
  'Release after two points to keep an open line, or keep clicking to add more points.',
  'Double-click or press Enter to close the draft into a filled shape.',
  'Hold Shift while drawing or dragging an endpoint to snap to straight 45 degree angles.',
  'Hold Alt while extending a draft corner to replace the hard turn with a curved fillet.',
  'Ctrl-drag the center handle to rotate the active path or shape in place.',
  'Turn on Caps Lock, or use the bend toggle button on canvas, then drag up or down to bend nearby nodes.',
  'While bending, hold Shift to scale the affected selection instead of pushing nodes vertically.',
  'Shift-drag one open-path endpoint onto another open endpoint to join them, or onto its opposite endpoint to close the path.',
];

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
        <div className="shortcuts-header">
          <div>
            <div className="shortcuts-title">Keyboard Shortcuts</div>
            <div className="shortcuts-subtitle">Core navigation, audio, and timeline controls in one place.</div>
          </div>
          {typeof onClose === 'function' && (
            <button type="button" className="control-button" onClick={onClose}>
              Close
            </button>
          )}
        </div>
        <div className="shortcuts-body">
          {SHORTCUT_SECTIONS.map((section) => (
            <section key={section.title} className="shortcuts-section">
              <div className="shortcuts-section-title">{section.title}</div>
              <div className="shortcuts-grid">
                {section.items.map(([keys, description]) => (
                  <div key={`${section.title}-${description}`}>
                    <span>
                      {keys.map((key) => (
                        <kbd key={`${description}-${key}`}>{key}</kbd>
                      ))}
                    </span>
                    <span>{description}</span>
                  </div>
                ))}
              </div>
            </section>
          ))}
          <section className="shortcuts-section">
            <div className="shortcuts-section-title">Node Edit Drawing Tips</div>
            <div className="shortcuts-grid">
              {NODE_EDIT_TIPS.map((tip) => (
                <div key={tip}>
                  <span />
                  <span>{tip}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
        <div className="shortcuts-footer">
          <div className="shortcuts-hint">Press `Esc` or `K` to close.</div>
        </div>
      </div>
    </div>
  );
}
