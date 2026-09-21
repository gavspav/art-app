import { useEffect } from 'react';

const LEGACY_SHORTCUT_SECTIONS = [
  {
    title: 'Workspace',
    items: [
      [['Cmd/Ctrl', 'K'], 'Search every command and inspector section'],
      [['1'], 'Open Global controls'],
      [['2'], 'Open Shape'],
      [['3'], 'Open Colour'],
      [['4'], 'Open Motion'],
      [['5'], 'Open Audio'],
      [['6'], 'Open Settings'],
      [['K'], 'Show or hide this shortcut reference'],
      [['H'], 'Hide or show the inspector'],
      [['F'], 'Toggle presentation view'],
      [['V'], 'Select tool'],
      [['N'], 'Toggle node editing'],
      [['E'], 'Export image'],
    ],
  },
  {
    title: 'Project and scene',
    items: [
      [['Cmd/Ctrl', 'S'], 'Save versioned project'],
      [['Cmd/Ctrl', 'O'], 'Open project'],
      [['Cmd/Ctrl', 'Z'], 'Undo document change'],
      [['Cmd/Ctrl', 'Shift', 'Z'], 'Redo document change'],
      [['G'], 'Toggle target Individual / Global'],
      [['I'], 'Toggle isolate mode'],
      [['O'], 'Show / hide layer outlines'],
      [['R'], 'Randomise scene'],
      [['Z'], 'Toggle Z-scale ignore'],
      [['Space'], 'Pause or play animation'],
      [['['], 'Select previous layer'],
      [[']'], 'Select next layer'],
      [['Shift', '1..9'], 'Select Layers 1–9'],
    ],
  },
  {
    title: 'Audio',
    items: [
      [['B'], 'Toggle BPM play / pause'],
      [['A'], 'Toggle audio reactive input'],
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
      [['Cmd', 'Drag center'], 'Resize the active shape/path in place'],
      [['Alt/Option', 'Click node/segment'], 'Remove a node, or add one on a segment'],
      [['Wheel / pinch'], 'Zoom the node-edit viewport'],
      [['Space', 'Drag'], 'Pan the node-edit viewport'],
      [['Delete'], 'Delete selected node or layer'],
      [['Esc'], 'Cancel the current draft, then close dialogs'],
    ],
  },
];

const NODE_EDIT_TIPS = [
  'Use the mouse wheel, trackpad pinch, or the on-canvas zoom buttons to zoom the node-edit viewport without changing saved geometry.',
  'Hold Space and drag, or middle-drag, to pan while zoomed in.',
  'In Node Edit mode, click an empty layer to start drawing. Shift-click a closed shape to stroke its exact existing contour as an editable line.',
  'Release after two points to keep an open line, or keep clicking to add more points.',
  'Double-click or press Enter to close the draft or active open outline into a filled shape.',
  'Hold Shift while drawing or dragging an endpoint to snap to straight 45 degree angles.',
  'Hold Alt while extending a draft corner to replace the hard turn with a curved fillet.',
  'Use the Line button, then click the canvas to start drawing a new open line on a new layer.',
  'Use the Sides field and Poly button to place a polygon draft. Move the cursor to scale it, hold Ctrl to rotate, then press Enter.',
  'Use Copy to duplicate the active layer as a new layer.',
  'Use +N / -N, or Alt-click a segment/node, to add or remove nodes from the active shape or line.',
  'Ctrl-drag the center handle to rotate; Cmd-drag the center handle to resize.',
  'Use Caps Lock or the bend toggle button on canvas (orange outline when active), then drag up or down to bend nearby nodes.',
  'While bending, hold Shift to scale the affected selection instead of pushing nodes vertically.',
  'Shift-drag one open-path endpoint onto another open endpoint to join them, or onto its opposite endpoint to close the path.',
];

export default function KeyboardShortcutsOverlay({ visible, onClose, commands = [] }) {
  useEffect(() => {
    if (!visible) return undefined;
    const closeOnEscape = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
      }
    };
    window.addEventListener('keydown', closeOnEscape, true);
    return () => window.removeEventListener('keydown', closeOnEscape, true);
  }, [visible, onClose]);

  if (!visible) return null;

  const commandSections = commands.length
    ? Object.entries(commands.reduce((groups, command) => {
      if (!command.shortcut) return groups;
      const group = command.group || 'Workspace';
      if (!groups[group]) groups[group] = [];
      groups[group].push([[command.shortcut], command.label]);
      return groups;
    }, {})).map(([title, items]) => ({ title, items }))
    : LEGACY_SHORTCUT_SECTIONS;

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
            <div className="shortcuts-subtitle">Project, workspace, audio, and drawing controls.</div>
          </div>
          {typeof onClose === 'function' && (
            <button type="button" className="control-button" onClick={onClose}>
              Close
            </button>
          )}
        </div>
        <div className="shortcuts-body">
          {commandSections.map((section) => (
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
