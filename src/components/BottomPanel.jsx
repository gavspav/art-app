import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useMidi } from '../context/MidiContext.jsx';
import { shouldIgnoreGlobalKey } from '../utils/domUtils.js';
import GlobalControls from './global/GlobalControls.jsx';
import Controls from './Controls.jsx';
import LayerSectionView from './LayerSectionView.jsx';
import PresetControls from './global/PresetControls.jsx';
import GroupsControls from './global/GroupsControls.jsx';
import './BottomPanel.css';
import { isSettingsDebugEnabled, throttledSettingsDebugLog } from '../utils/settingsDebug.js';

const PANEL_STATE_KEY = 'artapp-bottom-panel-state';
const PANEL_LOCK_KEY = 'artapp-bottom-panel-locked';
const PANEL_HIDE_DELAY_MS = 4500;

const readInitialLock = () => {
  try {
    const stored = localStorage.getItem(PANEL_LOCK_KEY);
    if (stored === 'true' || stored === 'false') {
      return stored === 'true';
    }
  } catch { /* noop */ }
  return true;
};

const readInitialPanelState = (initialLock) => {
  try {
    const stored = localStorage.getItem(PANEL_STATE_KEY);
    if (stored === 'expanded' || stored === 'peek' || stored === 'hidden') {
      if (initialLock) {
        return 'expanded';
      }
      return stored === 'hidden' ? 'peek' : stored;
    }
  } catch { /* noop */ }
  return initialLock ? 'expanded' : 'peek';
};

const BottomPanel = ({
  // All props from App.jsx for GlobalControls
  backgroundColor,
  setBackgroundColor,
  backgroundImage,
  setBackgroundImage,
  isFrozen,
  setIsFrozen,
  colorFadeWhileFrozen,
  setColorFadeWhileFrozen,
  classicMode,
  setClassicMode,
  zIgnore,
  setZIgnore,
  showGlobalMidi,
  setShowGlobalMidi,
  showGlobalAudio,
  setShowGlobalAudio,
  showGlobalBPM,
  setShowGlobalBPM,
  globalSeed,
  setGlobalSeed,
  globalSpeedMultiplier,
  setGlobalSpeedMultiplier,
  getIsRnd,
  setIsRnd,
  palettes,
  blendModes,
  globalBlendMode,
  setGlobalBlendMode,
  parameterTargetMode,
  setParameterTargetMode,
  onQuickSave,
  onQuickLoad,
  layers,
  sampleColorsEven,
  assignOneColorPerLayer,
  setLayers,
  DEFAULT_LAYER,
  buildVariedLayerFrom,
  setSelectedLayerIndex,
  handleRandomizeAll,
  
  // Props for Controls (layer-specific)
  currentLayer,
  updateCurrentLayer,
  randomizeCurrentLayer,
  randomizeAnimationForCurrentLayer,
  randomizeCurrentLayerColors,
  baseColors,
  baseNumColors,
  isNodeEditMode,
  setIsNodeEditMode,
  randomizePalette,
  setRandomizePalette,
  randomizeNumColors,
  setRandomizeNumColors,
  syncLayerColorsToFirst,
  setSyncLayerColorsToFirst,
  selectedLayerIds,
  toggleLayerSelection,
  clearSelection,
  layerGroups,
  editTarget,
  setEditTarget,
  getActiveTargetLayerIds,
  colorCountMin,
  colorCountMax,
  setColorCountMin,
  setColorCountMax,
  layerNames,
  selectedLayerIndex,
  selectLayer,
  addNewLayer,
  deleteLayer,
  moveSelectedLayerUp,
  moveSelectedLayerDown,
  handleImportSVGClick,
  // Morph props for GlobalControls
  presetSlots,
  getPresetSlot,
  loadAppState,
  morphEnabled,
  morphRoute,
  morphDurationPerLeg,
  morphEasing,
  morphLoopMode,
  setMorphEnabled,
  setMorphRoute,
  setMorphDurationPerLeg,
  setMorphEasing,
  setMorphLoopMode,
  morphMode,
  setMorphMode,
  applyVariationInstantly,
  setApplyVariationInstantly,
}) => {
  const initialLock = useMemo(() => readInitialLock(), []);
  const initialPanelState = useMemo(() => readInitialPanelState(initialLock), [initialLock]);

  const [activeTab, setActiveTab] = useState(() => {
    try {
      const stored = localStorage.getItem('artapp-bottom-panel-tab');
      return typeof stored === 'string' && stored.length ? stored : 'global';
    } catch { return 'global'; }
  });
  const [panelState, setPanelState] = useState(initialPanelState);
  const [isLocked, setIsLocked] = useState(initialLock);
  const hideTimeoutRef = useRef(null);
  const panelRef = useRef(null);
  const tabsContainerRef = useRef(null);
  const lastActivityRef = useRef(Date.now());
  const [panelHeight, setPanelHeight] = useState(() => {
    try {
      const v = parseInt(localStorage.getItem('artapp-bottom-panel-height') || '260', 10);
      return Number.isFinite(v) ? Math.max(160, Math.min(600, v)) : 260;
    } catch { return 260; }
  });
  const [autosaveToggleToken, setAutosaveToggleToken] = useState(0);
  const isResizingRef = useRef(false);
  const [panelWidthVW, setPanelWidthVW] = useState(() => {
    try {
      const v = parseFloat(localStorage.getItem('artapp-bottom-panel-widthvw') || '50');
      return Number.isFinite(v) ? Math.max(20, Math.min(95, v)) : 50;
    } catch { return 50; }
  });
  const resizeSideRef = useRef(null); // 'left' | 'right' | null
  const [dockV, setDockV] = useState(() => {
    try { const v = JSON.parse(localStorage.getItem('artapp-bottom-panel-dock') || '{}').v; return v === 'top' ? 'top' : 'bottom'; } catch { return 'bottom'; }
  });
  const [dockH, setDockH] = useState(() => {
    try { const v = JSON.parse(localStorage.getItem('artapp-bottom-panel-dock') || '{}').h; return ['left','center','right'].includes(v) ? v : 'center'; } catch { return 'center'; }
  });
  const isDockDraggingRef = useRef(false);

  // MIDI context
  const {
    supported: midiSupported,
    inputs: midiInputs,
    selectedInputId: midiInputId,
    setSelectedInputId: setMidiInputId,
    mappings: midiMappings,
    beginLearn,
    clearMapping,
    mappingLabel,
    learnParamId,
  } = useMidi() || {};

  // Auto-hide logic
  const resetHideTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
    }
    
    if (!isLocked && panelState === 'expanded') {
      hideTimeoutRef.current = setTimeout(() => {
        setPanelState('peek');
      }, PANEL_HIDE_DELAY_MS);
    }
  }, [isLocked, panelState]);

  // Show panel on hover near docked edge (top or bottom)
  useEffect(() => {
    const handleMouseMove = (e) => {
      const threshold = 50; // pixels from edge
      const distFromBottom = window.innerHeight - e.clientY;
      const distFromTop = e.clientY;
      const dist = dockV === 'top' ? distFromTop : distFromBottom;
      if (dist < threshold && panelState === 'hidden') {
        setPanelState('peek');
      } else if (dist < 20 && panelState === 'peek') {
        setPanelState('expanded');
        resetHideTimer();
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [dockV, panelState, resetHideTimer]);

  // Handle panel interactions
  const handlePanelInteraction = () => {
    resetHideTimer();
  };

  const toggleLock = useCallback(() => {
    setIsLocked(prev => {
      const next = !prev;
      try { localStorage.setItem(PANEL_LOCK_KEY, String(next)); } catch { /* noop */ }
      if (next) {
        setPanelState('expanded');
        if (hideTimeoutRef.current) {
          clearTimeout(hideTimeoutRef.current);
        }
      } else {
        resetHideTimer();
      }
      return next;
    });
  }, [resetHideTimer]);

  // Persist panel height
  useEffect(() => {
    try { localStorage.setItem('artapp-bottom-panel-height', String(panelHeight)); } catch { /* noop */ }
  }, [panelHeight]);

  useEffect(() => {
    try { localStorage.setItem(PANEL_STATE_KEY, panelState); } catch { /* noop */ }
  }, [panelState]);

  useEffect(() => {
    try { localStorage.setItem(PANEL_LOCK_KEY, String(isLocked)); } catch { /* noop */ }
  }, [isLocked]);

  useEffect(() => {
    try { localStorage.setItem('artapp-bottom-panel-tab', activeTab); } catch { /* noop */ }
  }, [activeTab]);

  // Removed: Lock no longer forces panel to stay expanded
  // This allows the 'H' keyboard shortcut to work even when locked

  // Start/stop resize from the top edge handle
  const onResizeStart = useCallback((e) => {
    if (panelState !== 'expanded') return;
    isResizingRef.current = true;
    e.preventDefault();
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  }, [panelState]);

  const onResizeMove = useCallback((e) => {
    if (!isResizingRef.current) return;
    const minH = 160;
    const maxH = Math.min( Math.round(window.innerHeight * 0.9), 600 );
    const newH = Math.max(minH, Math.min(maxH, window.innerHeight - e.clientY));
    setPanelHeight(newH);
  }, []);

  const onResizeEnd = useCallback(() => {
    if (!isResizingRef.current) return;
    isResizingRef.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', onResizeMove);
    window.addEventListener('mouseup', onResizeEnd);
    return () => {
      window.removeEventListener('mousemove', onResizeMove);
      window.removeEventListener('mouseup', onResizeEnd);
    };
  }, [onResizeMove, onResizeEnd]);

  // Drag the peek bar to set docking position (top/bottom + left/center/right)
  const onDockDragStart = useCallback(() => {
    isDockDraggingRef.current = true;
    document.body.style.cursor = 'move';
    document.body.style.userSelect = 'none';
  }, []);

  const onDockDragEnd = useCallback((e) => {
    if (!isDockDraggingRef.current) return;
    isDockDraggingRef.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    const x = e.clientX;
    const y = e.clientY;
    const third = window.innerWidth / 3;
    const hPos = x < third ? 'left' : (x < third * 2 ? 'center' : 'right');
    const vPos = y < window.innerHeight / 2 ? 'top' : 'bottom';
    setDockH(hPos);
    setDockV(vPos);
    try { localStorage.setItem('artapp-bottom-panel-dock', JSON.stringify({ h: hPos, v: vPos })); } catch { /* noop */ }
  }, []);

  useEffect(() => {
    const up = (e) => onDockDragEnd(e);
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, [onDockDragEnd]);

  // Start side resize (width)
  const onSideResizeStart = useCallback((side) => (e) => {
    if (panelState !== 'expanded') return;
    resizeSideRef.current = side; // 'left' | 'right'
    e.preventDefault();
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  }, [panelState]);

  // Handle side resize (width) on mousemove
  useEffect(() => {
    const onMove = (e) => {
      const side = resizeSideRef.current;
      if (!side) return;
      const centerX = window.innerWidth / 2;
      const halfWidthPx = Math.max(120, Math.min((window.innerWidth * 0.95) / 2, Math.abs(e.clientX - centerX)));
      const fullWidthPx = Math.min(window.innerWidth * 0.95, halfWidthPx * 2);
      const vw = (fullWidthPx / window.innerWidth) * 100;
      const clampedVW = Math.max(20, Math.min(95, vw));
      setPanelWidthVW(clampedVW);
    };
    const onUp = () => {
      if (!resizeSideRef.current) return;
      resizeSideRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try { localStorage.setItem('artapp-bottom-panel-widthvw', String(panelWidthVW)); } catch { /* noop */ }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [panelWidthVW]);

  const tabs = useMemo(() => ([
    { id: 'global', label: 'Global', icon: '🌍' },
    { id: 'layer-shape', label: 'Layer Shape', icon: '⬟' },
    { id: 'layer-animation', label: 'Layer Animation', icon: '▶️' },
    { id: 'layer-colour', label: 'Layer Colour', icon: '🎨' },
    { id: 'presets', label: 'Presets', icon: '🎛️' },
    { id: 'groups', label: 'Groups', icon: '🧰' },
  ]), []);

  // Keyboard shortcuts: 1..5 to switch tabs (no modifiers)
  useEffect(() => {
    const handler = (e) => {
      if (shouldIgnoreGlobalKey(e)) return;
      // Require no modifiers (Shift/Ctrl/Meta/Alt) so it's simple 1..6
      if (e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const key = e.key;
      if (key >= '1' && key <= '6') {
        const idx = parseInt(key, 10) - 1;
        const t = tabs[idx];
        if (t) {
          setActiveTab(t.id);
          // Expand panel on shortcut use and reset hide timer
          setPanelState('expanded');
          resetHideTimer();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [tabs, resetHideTimer]);

  // Keep active tab visible in scrollable tab row
  useEffect(() => {
    const el = tabsContainerRef.current;
    if (!el) return;
    const activeBtn = el.querySelector('.tab-button.active');
    if (activeBtn && typeof activeBtn.scrollIntoView === 'function') {
      activeBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [activeTab]);

  // Keyboard shortcut: 'h' to minimize (peek) the panel (no modifiers)
  useEffect(() => {
    const onKey = (e) => {
      if (shouldIgnoreGlobalKey(e)) return;
      if (e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const key = (e.key || '').toLowerCase();
      if (key === 'h') {
        e.preventDefault();
        const nextState = panelState === 'expanded' ? 'peek' : 'expanded';
        setPanelState(nextState);
        if (nextState === 'expanded') {
          resetHideTimer();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panelState, resetHideTimer]);

  // Keyboard shortcut: 'l' to toggle lock/unlock (allow with or without Shift)
  useEffect(() => {
    const onKey = (e) => {
      if (shouldIgnoreGlobalKey(e)) return;
      // Block only Ctrl/Meta/Alt; allow Shift so uppercase 'L' also works
      if (e.altKey || e.metaKey || e.ctrlKey) return;
      const key = (e.key || '').toLowerCase();
      if (key === 'l') {
        e.preventDefault();
        toggleLock();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleLock]);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'presets':
        return (
          <div className="tab-content presets-tab">
            <PresetControls
              setLayers={setLayers}
              setBackgroundColor={setBackgroundColor}
              setGlobalSpeedMultiplier={setGlobalSpeedMultiplier}
              showGlobalMidi={showGlobalMidi}
            />
          </div>
        );
      
      case 'global':
        return (
          <div className="tab-content global-tab" style={{ overflowY: 'auto' }}>
            <GlobalControls
              key={`glob-${parameterTargetMode}`}
              isActiveTab={activeTab === 'global'}
              autosaveToggleToken={autosaveToggleToken}
              backgroundColor={backgroundColor}
              setBackgroundColor={setBackgroundColor}
              backgroundImage={backgroundImage}
              setBackgroundImage={setBackgroundImage}
              isFrozen={isFrozen}
              setIsFrozen={setIsFrozen}
              colorFadeWhileFrozen={colorFadeWhileFrozen}
              setColorFadeWhileFrozen={setColorFadeWhileFrozen}
              classicMode={classicMode}
              setClassicMode={setClassicMode}
              zIgnore={zIgnore}
              setZIgnore={setZIgnore}
              showGlobalMidi={showGlobalMidi}
              setShowGlobalMidi={setShowGlobalMidi}
              showGlobalAudio={showGlobalAudio}
              setShowGlobalAudio={setShowGlobalAudio}
              showGlobalBPM={showGlobalBPM}
              setShowGlobalBPM={setShowGlobalBPM}
              globalSeed={globalSeed}
              setGlobalSeed={setGlobalSeed}
              globalSpeedMultiplier={globalSpeedMultiplier}
              setGlobalSpeedMultiplier={setGlobalSpeedMultiplier}
              getIsRnd={getIsRnd}
              setIsRnd={setIsRnd}
              palettes={palettes}
              blendModes={blendModes}
              globalBlendMode={globalBlendMode}
              setGlobalBlendMode={setGlobalBlendMode}
              parameterTargetMode={parameterTargetMode}
              setParameterTargetMode={setParameterTargetMode}
              midiSupported={midiSupported}
              beginLearn={beginLearn}
              clearMapping={clearMapping}
              midiMappings={midiMappings}
              mappingLabel={mappingLabel}
              learnParamId={learnParamId}
              midiInputs={midiInputs}
              midiInputId={midiInputId}
              setMidiInputId={setMidiInputId}
              layers={layers}
              sampleColorsEven={sampleColorsEven}
              assignOneColorPerLayer={assignOneColorPerLayer}
              setLayers={setLayers}
              DEFAULT_LAYER={DEFAULT_LAYER}
              buildVariedLayerFrom={buildVariedLayerFrom}
              setSelectedLayerIndex={setSelectedLayerIndex}
              handleRandomizeAll={handleRandomizeAll}
              syncLayerColorsToFirst={syncLayerColorsToFirst}
              setSyncLayerColorsToFirst={setSyncLayerColorsToFirst}
              hidePresets
              // Morph props
              presetSlots={presetSlots}
              getPresetSlot={getPresetSlot}
              loadAppState={loadAppState}
              morphEnabled={morphEnabled}
              morphRoute={morphRoute}
              morphDurationPerLeg={morphDurationPerLeg}
              morphEasing={morphEasing}
              morphLoopMode={morphLoopMode}
              setMorphEnabled={setMorphEnabled}
              setMorphRoute={setMorphRoute}
              setMorphDurationPerLeg={setMorphDurationPerLeg}
              setMorphEasing={setMorphEasing}
              setMorphLoopMode={setMorphLoopMode}
              morphMode={morphMode}
              setMorphMode={setMorphMode}
              applyVariationInstantly={applyVariationInstantly}
              setApplyVariationInstantly={setApplyVariationInstantly}
            />
          </div>
        );
      
      case 'layer-shape':
      case 'layer-animation':
      case 'layer-colour': {
        const visibleSection = (activeTab === 'layer-shape') ? 'shape' : (activeTab === 'layer-animation') ? 'animation' : 'colour';
        return (
          <div className="tab-content layer-controls-tab">
            <LayerSectionView
              visibleSection={visibleSection}
              hideTabbar
              currentLayer={currentLayer}
              updateLayer={updateCurrentLayer}
              randomizeCurrentLayer={randomizeCurrentLayer}
              randomizeAnimationOnly={randomizeAnimationForCurrentLayer}
              randomizeAll={handleRandomizeAll}
              isFrozen={isFrozen}
              setIsFrozen={setIsFrozen}
              globalSpeedMultiplier={globalSpeedMultiplier}
              setGlobalSpeedMultiplier={setGlobalSpeedMultiplier}
              setLayers={setLayers}
              baseColors={baseColors}
              baseNumColors={baseNumColors}
              isNodeEditMode={isNodeEditMode}
              showMidi={showGlobalMidi}
              showAudio={showGlobalAudio}
              showBPM={showGlobalBPM}
              setIsNodeEditMode={setIsNodeEditMode}
              classicMode={classicMode}
              setClassicMode={setClassicMode}
              randomizePalette={randomizePalette}
              setRandomizePalette={setRandomizePalette}
              randomizeNumColors={randomizeNumColors}
              setRandomizeNumColors={setRandomizeNumColors}
              colorCountMin={colorCountMin}
              colorCountMax={colorCountMax}
              setColorCountMin={setColorCountMin}
              setColorCountMax={setColorCountMax}
              onRandomizeLayerColors={randomizeCurrentLayerColors}
              getIsRnd={getIsRnd}
              setIsRnd={setIsRnd}
              layerNames={layerNames}
              layerIds={(layers || []).map((l) => l?.id)}
              selectedLayerIndex={selectedLayerIndex}
              onSelectLayer={selectLayer}
              onAddLayer={addNewLayer}
              onDeleteLayer={deleteLayer}
              onMoveLayerUp={moveSelectedLayerUp}
              onMoveLayerDown={moveSelectedLayerDown}
              onImportSVG={handleImportSVGClick}
              parameterTargetMode={parameterTargetMode}
              selectedLayerIds={selectedLayerIds}
              toggleLayerSelection={toggleLayerSelection}
              clearSelection={clearSelection}
              layerGroups={layerGroups}
              editTarget={editTarget}
              setEditTarget={setEditTarget}
              getActiveTargetLayerIds={getActiveTargetLayerIds}
            />
          </div>
        );
      }
      case 'groups':
        return (
          <div className="tab-content groups-tab">
            <GroupsControls />
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <div 
      ref={panelRef}
      className={`bottom-panel ${panelState} ${(isLocked && panelState === 'expanded') ? 'locked' : ''} ${panelWidthVW <= 28 ? 'compact' : ''} dock-${dockV} dock-${dockH}`}
      onMouseEnter={handlePanelInteraction}
      onMouseMove={handlePanelInteraction}
      onClick={handlePanelInteraction}
    >
      {/* Peek bar - always visible when not hidden */}
      <div className="panel-peek-bar" style={{ width: `${panelWidthVW}vw` }} onMouseDown={onDockDragStart} onClick={() => setPanelState(panelState === 'expanded' ? 'peek' : 'expanded')}>
        <div className="peek-indicator">
          <span className="peek-line"></span>
          <span className="peek-text">Controls</span>
          <span className="peek-line"></span>
        </div>
      </div>

      {/* Main panel content */}
      <div className="panel-content" style={{ height: panelHeight, width: `${panelWidthVW}vw` }}>
        {/* Resize handle at top edge */}
        <div className="panel-resize-handle" onMouseDown={onResizeStart} title="Drag up/down to resize" />
        {/* Side handles for width resize */}
        <div className="panel-resize-handle-side left" onMouseDown={onSideResizeStart('left')} title="Drag left/right to resize" />
        <div className="panel-resize-handle-side right" onMouseDown={onSideResizeStart('right')} title="Drag left/right to resize" />
        {/* Tab navigation */}
        <div className="tab-navigation">
          <div className="tabs-container" ref={tabsContainerRef}>
            {tabs.map((tab, i) => (
              <button
                key={tab.id}
                className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
                title={`${tab.label} (${i + 1})`}
              >
                <span className="tab-icon">{tab.icon}</span>
                <span className="tab-label">{tab.label}</span>
              </button>
            ))}
          </div>
          
          {/* Panel controls */}
          <div className="panel-controls">
            <button 
              className="panel-control-btn"
              onClick={toggleLock}
              title={(isLocked ? 'Unlock panel' : 'Lock panel open') + ' (L)'}
            >
              {isLocked ? '🔒' : '🔓'}
            </button>
            <button 
              className="panel-control-btn"
              onClick={() => setPanelState('peek')}
              title="Minimize panel"
            >
              ⬇️
            </button>
          </div>
        </div>

        {/* Global quick actions toolbar (visible across tabs) */}
        <div className="global-toolbar">
          <button
            type="button"
            className="icon-btn sm"
            disabled={typeof onQuickSave !== 'function'}
            onClick={(e) => {
              e.stopPropagation();
              handlePanelInteraction();
              typeof onQuickSave === 'function' && onQuickSave();
            }}
            title="Save configuration"
            aria-label="Save configuration"
          >
            💾
          </button>
          <button
            type="button"
            className="icon-btn sm"
            disabled={typeof onQuickLoad !== 'function'}
            onClick={(e) => {
              e.stopPropagation();
              handlePanelInteraction();
              typeof onQuickLoad === 'function' && onQuickLoad();
            }}
            title="Load configuration"
            aria-label="Load configuration"
          >
            📂
          </button>
          <button
            type="button"
            className="icon-btn sm"
            onClick={(e) => {
              e.stopPropagation();
              handlePanelInteraction();
              setActiveTab('global');
              setAutosaveToggleToken((token) => token + 1);
            }}
            title="Autosave recovery"
            aria-label="Autosave recovery"
          >
            🛟
          </button>
        </div>

        {/* Tab content area */}
        <div className="tab-content-area">
          {renderTabContent()}
        </div>
      </div>
    </div>
  );
};

// Helpers to avoid re-rendering the entire panel on every animation frame.
const isLayerEqualForUI = (a, b) => {
  if (a === b) return true;
  if (!a || !b) return false;
  const ignoreTopLevel = new Set(['position', 'movementAngle', 'orbitAngle', 'spinAngle']);
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  keys.forEach(k => { if (ignoreTopLevel.has(k)) keys.delete(k); });
  for (const key of keys) {
    if (!Object.is(a[key], b[key])) return false;
  }
  const ignorePos = new Set(['x', 'y', 'vx', 'vy', 'scale', 'scaleDirection']);
  const posA = a.position || {};
  const posB = b.position || {};
  const posKeys = new Set([...Object.keys(posA), ...Object.keys(posB)]);
  posKeys.forEach(k => { if (ignorePos.has(k)) posKeys.delete(k); });
  for (const key of posKeys) {
    if (!Object.is(posA[key], posB[key])) return false;
  }
  const ignoreRotation = a.movementStyle === 'spin' || b.movementStyle === 'spin';
  if (!ignoreRotation && !Object.is(a.rotation, b.rotation)) return false;
  return true;
};

const areLayersEqualForUI = (prevLayers, nextLayers) => {
  if (prevLayers === nextLayers) return true;
  if (!Array.isArray(prevLayers) || !Array.isArray(nextLayers)) return false;
  if (prevLayers.length !== nextLayers.length) return false;
  for (let i = 0; i < prevLayers.length; i += 1) {
    if (!isLayerEqualForUI(prevLayers[i], nextLayers[i])) return false;
  }
  return true;
};

const isArrayShallowEqual = (a, b) => {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (!Object.is(a[i], b[i])) return false;
  }
  return true;
};

const areBottomPanelPropsEqual = (prev, next) => {
  const debug = isSettingsDebugEnabled();
  const log = throttledSettingsDebugLog;
  const fail = (reason) => {
    if (debug) log(`[settings-debug] BottomPanel re-render: ${reason}`);
    return false;
  };

  if (!areLayersEqualForUI(prev.layers, next.layers)) return fail('layers changed');
  if (!isLayerEqualForUI(prev.currentLayer, next.currentLayer)) return fail('currentLayer changed');
  if (!Object.is(prev.backgroundColor, next.backgroundColor)) return fail('backgroundColor changed');
  if (!Object.is(prev.backgroundImage, next.backgroundImage)) return fail('backgroundImage changed');
  if (!Object.is(prev.isFrozen, next.isFrozen)) return fail('isFrozen changed');
  if (!Object.is(prev.colorFadeWhileFrozen, next.colorFadeWhileFrozen)) return fail('colorFadeWhileFrozen changed');
  if (!Object.is(prev.classicMode, next.classicMode)) return fail('classicMode changed');
  if (!Object.is(prev.zIgnore, next.zIgnore)) return fail('zIgnore changed');
  if (!Object.is(prev.showGlobalMidi, next.showGlobalMidi)) return fail('showGlobalMidi changed');
  if (!Object.is(prev.showGlobalAudio, next.showGlobalAudio)) return fail('showGlobalAudio changed');
  if (!Object.is(prev.showGlobalBPM, next.showGlobalBPM)) return fail('showGlobalBPM changed');
  if (!Object.is(prev.globalSeed, next.globalSeed)) return fail('globalSeed changed');
  if (!Object.is(prev.globalSpeedMultiplier, next.globalSpeedMultiplier)) return fail('globalSpeedMultiplier changed');
  if (!Object.is(prev.globalBlendMode, next.globalBlendMode)) return fail('globalBlendMode changed');
  if (!Object.is(prev.parameterTargetMode, next.parameterTargetMode)) return fail('parameterTargetMode changed');
  if (!Object.is(prev.randomizePalette, next.randomizePalette)) return fail('randomizePalette changed');
  if (!Object.is(prev.randomizeNumColors, next.randomizeNumColors)) return fail('randomizeNumColors changed');
  if (!Object.is(prev.syncLayerColorsToFirst, next.syncLayerColorsToFirst)) return fail('syncLayerColorsToFirst changed');
  if (!Object.is(prev.colorCountMin, next.colorCountMin)) return fail('colorCountMin changed');
  if (!Object.is(prev.colorCountMax, next.colorCountMax)) return fail('colorCountMax changed');
  if (!Object.is(prev.selectedLayerIndex, next.selectedLayerIndex)) return fail('selectedLayerIndex changed');
  if (!Object.is(prev.isNodeEditMode, next.isNodeEditMode)) return fail('isNodeEditMode changed');
  if (!isArrayShallowEqual(prev.layerNames, next.layerNames)) return fail('layerNames changed');
  if (!isArrayShallowEqual(prev.layerIds, next.layerIds)) return fail('layerIds changed');
  if (!isArrayShallowEqual(prev.baseColors, next.baseColors)) return fail('baseColors changed');
  if (!Object.is(prev.baseNumColors, next.baseNumColors)) return fail('baseNumColors changed');
  if (!isArrayShallowEqual(prev.selectedLayerIds, next.selectedLayerIds)) return fail('selectedLayerIds changed');
  if (!isArrayShallowEqual(prev.layerGroups, next.layerGroups)) return fail('layerGroups changed');
  if (!Object.is(prev.editTarget, next.editTarget)) return fail('editTarget changed');

  // Assume callbacks passed in are stable (useCallback); if any change, allow re-render.
  const handlerKeys = [
    'setBackgroundColor',
    'setBackgroundImage',
    'setIsFrozen',
    'setColorFadeWhileFrozen',
    'setClassicMode',
    'setZIgnore',
    'setShowGlobalMidi',
    'setShowGlobalAudio',
    'setShowGlobalBPM',
    'setGlobalSeed',
    'setGlobalSpeedMultiplier',
    'setGlobalBlendMode',
    'setParameterTargetMode',
    'onQuickSave',
    'onQuickLoad',
    'sampleColorsEven',
    'assignOneColorPerLayer',
    'setLayers',
    'buildVariedLayerFrom',
    'setSelectedLayerIndex',
    'handleRandomizeAll',
    'updateCurrentLayer',
    'randomizeCurrentLayer',
    'randomizeAnimationForCurrentLayer',
    'randomizeCurrentLayerColors',
    'setIsNodeEditMode',
    'setRandomizePalette',
    'setRandomizeNumColors',
    'setSyncLayerColorsToFirst',
    'setColorCountMin',
    'setColorCountMax',
    'selectLayer',
    'addNewLayer',
    'deleteLayer',
    'moveSelectedLayerUp',
    'moveSelectedLayerDown',
    'handleImportSVGClick',
    'toggleLayerSelection',
    'clearSelection',
    'setEditTarget',
    'getActiveTargetLayerIds',
  ];
  for (const key of handlerKeys) {
    if (prev[key] !== next[key]) return fail(`${key} changed identity`);
  }

  return true;
};

export default React.memo(BottomPanel, areBottomPanelPropsEqual);
