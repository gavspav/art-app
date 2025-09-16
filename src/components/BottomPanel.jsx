import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAppState } from '../context/AppStateContext.jsx';
import { useParameters } from '../context/ParameterContext.jsx';
import { useMidi } from '../context/MidiContext.jsx';
import GlobalControls from './global/GlobalControls.jsx';
import Controls from './Controls.jsx';
import LayerSectionView from './LayerSectionView.jsx';
import PresetControls from './global/PresetControls.jsx';
import GroupsControls from './global/GroupsControls.jsx';
import './BottomPanel.css';

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
  colorCountMin,
  colorCountMax,
  setColorCountMin,
  setColorCountMax,
  rotationVaryAcrossLayers,
  setRotationVaryAcrossLayers,
  layerNames,
  selectedLayerIndex,
  selectLayer,
  addNewLayer,
  deleteLayer,
  moveSelectedLayerUp,
  moveSelectedLayerDown,
  handleImportSVGClick,
}) => {
  const [activeTab, setActiveTab] = useState('presets');
  const [panelState, setPanelState] = useState('peek'); // 'hidden', 'peek', 'expanded', 'locked'
  const [isLocked, setIsLocked] = useState(false);
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
      }, 3000); // Hide after 3 seconds of inactivity
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
  }, [panelState, resetHideTimer]);

  // Handle panel interactions
  const handlePanelInteraction = () => {
    resetHideTimer();
  };

  const toggleLock = () => {
    setIsLocked(!isLocked);
    if (!isLocked) {
      setPanelState('expanded');
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    } else {
      resetHideTimer();
    }
  };

  // Persist panel height
  useEffect(() => {
    try { localStorage.setItem('artapp-bottom-panel-height', String(panelHeight)); } catch {}
  }, [panelHeight]);

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
  const onDockDragStart = useCallback((e) => {
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
    try { localStorage.setItem('artapp-bottom-panel-dock', JSON.stringify({ h: hPos, v: vPos })); } catch {}
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
      try { localStorage.setItem('artapp-bottom-panel-widthvw', String(panelWidthVW)); } catch {}
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [panelWidthVW]);

  const tabs = [
    { id: 'global', label: 'Global', icon: '🌍' },
    { id: 'layer-shape', label: 'Layer Shape', icon: '⬟' },
    { id: 'layer-animation', label: 'Layer Animation', icon: '▶️' },
    { id: 'layer-colour', label: 'Layer Colour', icon: '🎨' },
    { id: 'presets', label: 'Presets', icon: '🎛️' },
    { id: 'groups', label: 'Groups', icon: '🧰' },
  ];

  // Keyboard shortcuts: 1..5 to switch tabs (no modifiers)
  useEffect(() => {
    const handler = (e) => {
      // Ignore when typing in inputs/textareas
      const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea') return;
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

  // Keyboard shortcut: 'l' to toggle lock/unlock (no modifiers)
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) return;
      if (e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const key = (e.key || '').toLowerCase();
      if (key === 'l') {
        e.preventDefault();
        toggleLock();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleLock]);

  // Keyboard shortcut: 'h' to minimize (peek) the panel (no modifiers)
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) return;
      if (e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const key = (e.key || '').toLowerCase();
      if (key === 'h') {
        e.preventDefault();
        setPanelState('peek');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
              onQuickSave={onQuickSave}
              onQuickLoad={onQuickLoad}
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
              hidePresets
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
              rotationVaryAcrossLayers={rotationVaryAcrossLayers}
              setRotationVaryAcrossLayers={setRotationVaryAcrossLayers}
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
      className={`bottom-panel ${panelState} ${isLocked ? 'locked' : ''} ${panelWidthVW <= 28 ? 'compact' : ''} dock-${dockV} dock-${dockH}`}
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

        {/* Tab content area */}
        <div className="tab-content-area">
          {renderTabContent()}
        </div>
      </div>
    </div>
  );
};

export default BottomPanel;
