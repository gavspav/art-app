import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AudioLines, CirclePause, CirclePlay, Download, Dices, FolderOpen, Fullscreen,
  Hand, Layers3, Menu, MousePointer2, Palette, Pentagon, Play, Radio, Redo2,
  Save, Search, Settings2, Share2, Sparkles, Square, Undo2, Waypoints, X,
  SlidersHorizontal,
} from 'lucide-react';
import Canvas from '../Canvas';
import ImportAdjustPanel from '../global/ImportAdjustPanel.jsx';
import StudioCommandPalette from './StudioCommandPalette.jsx';
import StudioInspector from './StudioInspector.jsx';
import KeyboardShortcutsOverlay from '../global/KeyboardShortcutsOverlay.jsx';
import { buildStudioCommands, matchesStudioShortcut } from '../../commands/studioCommands.js';
import { shouldIgnoreGlobalKey } from '../../utils/domUtils.js';
import './StudioWorkspace.css';

const inspectorItems = [
  ['Global', SlidersHorizontal], ['Layers', Layers3], ['Shape', Pentagon], ['Colour', Palette],
  ['Motion', Play], ['Audio', AudioLines], ['Settings', Settings2],
];
const editorTools = [
  ['select', MousePointer2, 'Select'], ['nodes', Waypoints, 'Edit nodes'],
  ['newLine', Share2, 'Draw line'], ['polygon', Pentagon, 'Draw polygon'],
  ['pull', Sparkles, 'Pull nodes'], ['view', Hand, 'Pan and zoom'],
];
const fireNodeTool = tool => window.dispatchEvent(new CustomEvent('artapp:node-tool', { detail: { tool } }));

const FreeWorkspace = ({ canvasRef, canvasProps, importAdjustProps, floatingActionProps, bottomPanelProps }) => {
  const [activeSection, setActiveSection] = useState('Global');
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [commandOpen, setCommandOpen] = useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [activeTool, setActiveTool] = useState('select');
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);

  const openSection = useCallback(section => { setActiveSection(section); setInspectorOpen(true); }, []);
  const focusControl = useCallback((id, section = 'Global') => {
    openSection(section);
    requestAnimationFrame(() => document.getElementById(id)?.focus());
  }, [openSection]);
  const chooseTool = useCallback(tool => {
    setActiveTool(tool);
    if (tool === 'select') {
      bottomPanelProps.setIsNodeEditMode?.(false);
      return;
    }
    bottomPanelProps.setIsNodeEditMode?.(true);
    fireNodeTool(tool === 'nodes' ? 'select' : tool);
  }, [bottomPanelProps]);

  const commands = useMemo(() => buildStudioCommands({
    save: bottomPanelProps.onQuickSave, open: bottomPanelProps.onQuickLoad,
    exportImage: floatingActionProps.onDownload, undo: bottomPanelProps.undo, redo: bottomPanelProps.redo,
    canUndo: bottomPanelProps.canUndo, canRedo: bottomPanelProps.canRedo,
    toggleAnimation: () => bottomPanelProps.setIsFrozen?.(value => !value), randomize: floatingActionProps.onRandomize,
    presentation: floatingActionProps.onToggleFullscreen,
    record: floatingActionProps.isRecording ? floatingActionProps.onStopRecording : floatingActionProps.onStartRecording,
    isRecording: floatingActionProps.isRecording, tool: chooseTool, openSection,
    toggleTarget: bottomPanelProps.toggleParameterTargetMode,
    focusControl,
    toggleOutlines: bottomPanelProps.toggleOutlines,
    toggleIsolate: bottomPanelProps.toggleIsolate,
    toggleZIgnore: bottomPanelProps.toggleZIgnore,
    toggleBPM: bottomPanelProps.toggleBPM,
    toggleAudio: bottomPanelProps.toggleAudio,
    previousLayer: bottomPanelProps.previousLayer,
    nextLayer: bottomPanelProps.nextLayer,
    selectLayerNumber: bottomPanelProps.selectLayerNumber,
    deleteSelection: bottomPanelProps.deleteSelection,
    toggleInspector: () => setInspectorOpen(value => !value),
    shortcutHelp: () => setShortcutHelpOpen(value => !value),
  }), [bottomPanelProps, chooseTool, floatingActionProps, focusControl, openSection]);

  useEffect(() => {
    const onKeyDown = event => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); setCommandOpen(true); return;
      }
      if (commandOpen || shouldIgnoreGlobalKey(event)) return;
      const command = commands.find(item => matchesStudioShortcut(event, item.id));
      if (!command || command.enabled === false) return;
      event.preventDefault(); command.run?.(event);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [commandOpen, commands]);

  const { showImportAdjust, importAdjust, applyImportAdjust, importFitEnabled, setImportFitEnabled, importDebug, setImportDebug, setShowImportAdjust } = importAdjustProps;
  const presentation = !!floatingActionProps.isFullscreen;

  return (
    <div className={`studio-workspace${presentation ? ' presentation' : ''}`}>
      <div className="studio-canvas"><Canvas ref={canvasRef} {...canvasProps} /></div>
      {!presentation && <>
        <header className="studio-topbar">
          <div className="studio-project-wrap">
            <button type="button" className="studio-brand" onClick={() => setProjectMenuOpen(value => !value)} aria-expanded={projectMenuOpen}><Menu size={18} /><span>Art Studio</span></button>
            {projectMenuOpen && <div className="studio-project-menu">
              <button type="button" onClick={() => { bottomPanelProps.onQuickSave?.(); setProjectMenuOpen(false); }}><Save size={16} /> Save project <kbd>⌘S</kbd></button>
              <button type="button" onClick={() => { bottomPanelProps.onQuickLoad?.(); setProjectMenuOpen(false); }}><FolderOpen size={16} /> Open project <kbd>⌘O</kbd></button>
              <button type="button" onClick={() => { floatingActionProps.onDownload?.(); setProjectMenuOpen(false); }}><Download size={16} /> Export image</button>
              <label className="studio-menu-toggle"><input type="checkbox" checked={!!floatingActionProps.includeRecordingAudio} onChange={event => floatingActionProps.setIncludeRecordingAudio?.(event.target.checked)} /> Include source audio in recordings</label>
            </div>}
          </div>
          <div className="studio-top-actions">
            <button type="button" onClick={bottomPanelProps.undo} disabled={!bottomPanelProps.canUndo} title="Undo (Cmd/Ctrl+Z)"><Undo2 size={18} /></button>
            <button type="button" onClick={bottomPanelProps.redo} disabled={!bottomPanelProps.canRedo} title="Redo (Cmd/Ctrl+Shift+Z)"><Redo2 size={18} /></button>
            <span className="studio-divider" />
            <button type="button" onClick={() => bottomPanelProps.setIsFrozen?.(value => !value)} title={bottomPanelProps.isFrozen ? 'Play animation' : 'Pause animation'}>{bottomPanelProps.isFrozen ? <CirclePlay size={19} /> : <CirclePause size={19} />}</button>
            <button type="button" onClick={floatingActionProps.onRandomize} title="Randomise scene (R)"><Dices size={19} /></button>
            <button type="button" className={floatingActionProps.isRecording ? 'active recording' : ''} onClick={floatingActionProps.isRecording ? floatingActionProps.onStopRecording : floatingActionProps.onStartRecording} title={floatingActionProps.isRecording ? 'Stop recording' : `Record${floatingActionProps.includeRecordingAudio ? ' with source audio' : ' silent video'}`}>{floatingActionProps.isRecording ? <Square size={17} /> : <Radio size={18} />}</button>
            <button type="button" onClick={floatingActionProps.onToggleFullscreen} title="Presentation view (F)"><Fullscreen size={18} /></button>
          </div>
          <button type="button" className="studio-command-button" onClick={() => setCommandOpen(true)}><Search size={17} /><span>Commands</span><kbd>⌘K</kbd></button>
        </header>
        <nav className="studio-toolrail" aria-label="Studio tools">
          {editorTools.map(([id, Icon, label]) => <button key={id} type="button" className={activeTool === id ? 'active' : ''} onClick={() => chooseTool(id)} title={label} aria-label={label}>{React.createElement(Icon, { size: 21 })}</button>)}
          <span className="studio-rail-divider" />
          {inspectorItems.map(([label, Icon]) => <button key={label} type="button" className={inspectorOpen && activeSection === label ? 'active' : ''} onClick={() => openSection(label)} title={label} aria-label={`Open ${label}`}>{React.createElement(Icon, { size: 20 })}</button>)}
        </nav>
        {inspectorOpen && <StudioInspector activeSection={activeSection} onClose={() => setInspectorOpen(false)} props={bottomPanelProps} />}
      </>}
      {presentation && <button type="button" className="studio-exit-presentation" onClick={floatingActionProps.onToggleFullscreen}><X size={18} /> Exit presentation</button>}
      {showImportAdjust && <div className="studio-import-adjust"><ImportAdjustPanel
        importAdjust={importAdjust} onChange={applyImportAdjust} fitEnabled={importFitEnabled}
        onToggleFit={() => setImportFitEnabled(value => !value)} debug={importDebug}
        onToggleDebug={() => { const value = !importDebug; setImportDebug(value); window.__artapp_debug_import = value; }}
        onReset={() => applyImportAdjust({ dx: 0, dy: 0, s: 1 })} onClose={() => setShowImportAdjust(false)}
      /></div>}
      <StudioCommandPalette open={commandOpen} commands={commands} onClose={() => setCommandOpen(false)} />
      <KeyboardShortcutsOverlay visible={shortcutHelpOpen} commands={commands} onClose={() => setShortcutHelpOpen(false)} />
    </div>
  );
};

export default FreeWorkspace;
