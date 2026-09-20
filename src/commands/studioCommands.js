export const buildStudioCommands = actions => [
  { id: 'project.save', group: 'Project', label: 'Save project', shortcut: '⌘/Ctrl S', run: actions.save },
  { id: 'project.open', group: 'Project', label: 'Open project', shortcut: '⌘/Ctrl O', run: actions.open },
  { id: 'project.export', group: 'Project', label: 'Export image', shortcut: 'E', run: actions.exportImage },
  { id: 'history.undo', group: 'Edit', label: 'Undo', shortcut: '⌘/Ctrl Z', run: actions.undo, enabled: actions.canUndo },
  { id: 'history.redo', group: 'Edit', label: 'Redo', shortcut: '⌘/Ctrl ⇧ Z', run: actions.redo, enabled: actions.canRedo },
  { id: 'animation.toggle', group: 'Playback', label: 'Pause or play animation', shortcut: 'Space', run: actions.toggleAnimation },
  { id: 'scene.randomize', group: 'Create', label: 'Randomise scene', shortcut: 'R', run: actions.randomize },
  { id: 'view.presentation', group: 'View', label: 'Toggle presentation view', shortcut: 'F', run: actions.presentation },
  { id: 'view.inspector', group: 'View', label: 'Hide or show inspector', shortcut: 'H', run: actions.toggleInspector },
  { id: 'view.shortcuts', group: 'View', label: 'Show keyboard shortcuts', shortcut: 'K', run: actions.shortcutHelp },
  { id: 'record.toggle', group: 'Export', label: actions.isRecording ? 'Stop recording' : 'Start recording', run: actions.record },
  { id: 'tool.select', group: 'Tools', label: 'Select tool', shortcut: 'V', run: () => actions.tool('select') },
  { id: 'tool.nodes', group: 'Tools', label: 'Edit nodes', shortcut: 'N', run: () => actions.tool('nodes') },
  { id: 'tool.line', group: 'Tools', label: 'Draw line', run: () => actions.tool('newLine') },
  { id: 'tool.polygon', group: 'Tools', label: 'Draw polygon', run: () => actions.tool('polygon') },
  { id: 'tool.pull', group: 'Tools', label: 'Pull nodes', run: () => actions.tool('pull') },
  { id: 'tool.pan', group: 'Tools', label: 'Pan and zoom', run: () => actions.tool('view') },
  ...['Global', 'Layers', 'Shape', 'Colour', 'Motion', 'Audio', 'Settings'].map((label, index) => ({
    id: `panel.${label.toLowerCase()}`,
    group: 'Inspector',
    label: `Open ${label}`,
    shortcut: String(index + 1),
    run: () => actions.openSection(label),
  })),
];

export const matchesStudioShortcut = (event, commandId) => {
  const key = (event.key || '').toLowerCase();
  const commandModifier = event.metaKey || event.ctrlKey;
  if (commandId === 'project.save') return commandModifier && key === 's';
  if (commandId === 'project.open') return commandModifier && key === 'o';
  if (commandId === 'history.undo') return commandModifier && !event.shiftKey && key === 'z';
  if (commandId === 'history.redo') return commandModifier && event.shiftKey && key === 'z';
  if (commandModifier || event.altKey || event.shiftKey) return false;
  if (commandId === 'project.export') return key === 'e';
  if (commandId === 'tool.select') return key === 'v';
  if (commandId === 'view.inspector') return key === 'h';
  if (commandId === 'view.shortcuts') return key === 'k';
  if (commandId.startsWith('panel.')) {
    const panelKeys = { global: '1', layers: '2', shape: '3', colour: '4', motion: '5', audio: '6', settings: '7' };
    return panelKeys[commandId.slice('panel.'.length)] === key;
  }
  return false;
};
