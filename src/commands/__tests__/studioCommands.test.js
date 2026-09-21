import { describe, expect, test, vi } from 'vitest';
import { buildStudioCommands, matchesStudioShortcut } from '../studioCommands.js';

const actions = () => ({
  save: vi.fn(), open: vi.fn(), exportImage: vi.fn(), undo: vi.fn(), redo: vi.fn(),
  canUndo: true, canRedo: true, toggleAnimation: vi.fn(), randomize: vi.fn(),
  presentation: vi.fn(), record: vi.fn(), isRecording: false, tool: vi.fn(), openSection: vi.fn(),
  toggleTarget: vi.fn(),
});

describe('studio command registry', () => {
  test('provides unique searchable commands for every inspector and primary tool', () => {
    const commands = buildStudioCommands(actions());
    expect(new Set(commands.map(command => command.id)).size).toBe(commands.length);
    expect(commands.filter(command => command.group === 'Inspector').map(command => command.label)).toEqual([
      'Toggle Individual / Global target', 'Open Global', 'Open Shape', 'Open Colour', 'Open Motion', 'Open Audio', 'Open Settings',
    ]);
    expect(commands.filter(command => command.group === 'Tools')).toHaveLength(6);
  });

  test('reserves standard project and history shortcuts', () => {
    const key = (value, options = {}) => ({ key: value, metaKey: false, ctrlKey: false, shiftKey: false, ...options });
    expect(matchesStudioShortcut(key('s', { metaKey: true }), 'project.save')).toBe(true);
    expect(matchesStudioShortcut(key('o', { ctrlKey: true }), 'project.open')).toBe(true);
    expect(matchesStudioShortcut(key('z', { metaKey: true }), 'history.undo')).toBe(true);
    expect(matchesStudioShortcut(key('z', { ctrlKey: true, shiftKey: true }), 'history.redo')).toBe(true);
    expect(matchesStudioShortcut(key('z'), 'history.undo')).toBe(false);
    expect(matchesStudioShortcut(key('h'), 'view.inspector')).toBe(true);
    expect(matchesStudioShortcut(key('k'), 'view.shortcuts')).toBe(true);
    expect(matchesStudioShortcut(key('g'), 'target.toggle')).toBe(true);
    expect(matchesStudioShortcut(key('e'), 'project.export')).toBe(true);
    expect(matchesStudioShortcut(key('v'), 'tool.select')).toBe(true);
    expect(matchesStudioShortcut(key('k', { metaKey: true }), 'view.shortcuts')).toBe(false);
    expect(matchesStudioShortcut(key('1'), 'panel.global')).toBe(true);
    expect(matchesStudioShortcut(key('5'), 'panel.audio')).toBe(true);
    expect(matchesStudioShortcut(key('6'), 'panel.settings')).toBe(true);
  });
});
