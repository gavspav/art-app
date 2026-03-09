import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useMidi } from '../context/MidiContext.jsx';
import { useBPM } from '../context/BPMContext.jsx';
import { useAudioReactive } from '../context/AudioContext.jsx';
import { shouldIgnoreGlobalKey } from '../utils/domUtils.js';
import GlobalControls from './global/GlobalControls.jsx';
import Controls from './Controls.jsx';
import LayerSectionView from './LayerSectionView.jsx';
import PresetControls from './global/PresetControls.jsx';
import GroupsControls from './global/GroupsControls.jsx';
import { AudioReactiveSection, AudioDemoPresetsSection, AudioSpawnSection, BPMSection } from './global/sections/GlobalAutomationSections.jsx';
import './BottomPanel.css';
import { isSettingsDebugEnabled, throttledSettingsDebugLog } from '../utils/settingsDebug.js';

// Compact beat indicator that shows BPM state with a pulsing circle
const BeatIndicator = ({ panelExpanded = true }) => {
  const bpm = useBPM();
  const [phase, setPhase] = useState(0);
  const intervalRef = useRef(null);
  
  const isPlaying = bpm?.isPlaying;
  const getClockState = bpm?.getClockState;
  const togglePlay = bpm?.togglePlay;
  
  useEffect(() => {
    // Only run when panel is expanded and BPM is playing
    if (!panelExpanded || !isPlaying || typeof getClockState !== 'function') {
      setPhase(0);
      return undefined;
    }
    
    const tick = () => {
      const clock = getClockState();
      if (clock) {
        setPhase(clock.beatPhase ?? 0);
      }
    };

    // Run at ~20fps instead of RAF
    intervalRef.current = setInterval(tick, 50);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [panelExpanded, isPlaying, getClockState]);
  
  // Pulse effect: scale from 0.6 to 1.0 based on beat phase
  const scale = isPlaying ? 0.6 + (1 - phase) * 0.4 : 0.6;
  const opacity = isPlaying ? 0.7 + (1 - phase) * 0.3 : 0.4;
  
  return (
    <button
      type="button"
      className="icon-btn sm"
      onClick={(e) => {
        e.stopPropagation();
        togglePlay?.();
      }}
      title={isPlaying ? 'BPM Playing (B to pause)' : 'BPM Paused (B to play)'}
      aria-label={isPlaying ? 'Pause BPM' : 'Play BPM'}
      style={{ padding: '4px' }}
    >
      <span
        style={{
          display: 'inline-block',
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          backgroundColor: isPlaying ? '#4ade80' : '#666',
          transform: `scale(${scale})`,
          opacity,
          transition: isPlaying ? 'none' : 'all 0.2s',
        }}
      />
    </button>
  );
};

// LED bar meter for audio bands (bass, mids, highs)
const AudioLEDMeter = ({ panelExpanded = true }) => {
  const audio = useAudioReactive();
  const [bands, setBands] = useState({ bass: 0, mids: 0, highs: 0 });
  const intervalRef = useRef(null);

  const enabled = !!audio?.settings?.enabled;
  const getFeatures = audio?.getFeatures;

  useEffect(() => {
    // Only run when panel is expanded and audio is enabled
    if (!panelExpanded || !enabled || typeof getFeatures !== 'function') {
      setBands({ bass: 0, mids: 0, highs: 0 });
      return undefined;
    }

    const tick = () => {
      const features = getFeatures?.();
      setBands({
        bass: typeof features?.bass === 'number' ? features.bass : 0,
        mids: typeof features?.mids === 'number' ? features.mids : 0,
        highs: typeof features?.highs === 'number' ? features.highs : 0,
      });
    };

    // Run at ~20fps instead of RAF
    intervalRef.current = setInterval(tick, 50);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [panelExpanded, enabled, getFeatures]);

  if (!enabled) return null;

  // Each bar is 3 segments (low, mid, high intensity)
  const renderBar = (value, color) => {
    const segments = 4;
    return (
      <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: '1px', height: '14px' }}>
        {Array.from({ length: segments }, (_, i) => {
          const threshold = (i + 1) / segments;
          const isLit = value >= threshold * 0.8;
          const isTop = i === segments - 1;
          return (
            <div
              key={i}
              style={{
                width: '4px',
                flex: 1,
                borderRadius: '1px',
                background: isLit
                  ? isTop ? '#ef4444' : color
                  : 'rgba(255,255,255,0.15)',
                boxShadow: isLit ? `0 0 3px ${isTop ? '#ef4444' : color}` : 'none',
                transition: 'background 0.05s, box-shadow 0.05s',
              }}
            />
          );
        })}
      </div>
    );
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '2px',
        padding: '2px 4px',
        borderRadius: '4px',
        background: 'rgba(0,0,0,0.3)',
      }}
      title="Bass | Mids | Highs"
    >
      {renderBar(bands.bass, '#ff6b6b')}
      {renderBar(bands.mids, '#ffd93d')}
      {renderBar(bands.highs, '#6bcb77')}
    </div>
  );
};

// Clear all audio and BPM mappings button
const ClearMappingsButton = () => {
  const audio = useAudioReactive();
  const bpm = useBPM();
  
  const audioMappings = audio?.mappings || {};
  const storedAudioMappings = useMemo(() => {
    if (typeof audio?.getAudioSnapshot !== 'function') return null;
    const snapshot = audio.getAudioSnapshot();
    const snapshotMappings = snapshot?.mappings;
    if (!snapshotMappings || typeof snapshotMappings !== 'object') return null;
    return snapshotMappings;
  }, [audio]);
  const bpmMappings = bpm?.mappings || {};
  const clearAudioMappings = audio?.clearAllMappings;
  const clearBPMMappings = bpm?.clearAllMappings;
  
  // Count total mappings
  const audioCount = storedAudioMappings
    ? Object.keys(storedAudioMappings).length
    : Object.values(audioMappings).filter(
      (mapping) => mapping && typeof mapping === 'object' && mapping.band && mapping.band !== 'none',
    ).length;
  const bpmCount = Object.keys(bpmMappings).length;
  const totalCount = audioCount + bpmCount;
  
  const handleClear = (e) => {
    e.stopPropagation();
    if (totalCount === 0) return;
    if (!window.confirm(`Clear all ${totalCount} audio/BPM mappings?`)) return;
    clearAudioMappings?.();
    clearBPMMappings?.();
  };
  
  return (
    <button
      type="button"
      className="icon-btn sm"
      onClick={handleClear}
      disabled={totalCount === 0}
      title={totalCount > 0 ? `Clear ${totalCount} audio/BPM mappings` : 'No mappings to clear'}
      aria-label="Clear all audio and BPM mappings"
      style={{ padding: '4px', opacity: totalCount > 0 ? 1 : 0.4 }}
    >
      <span
        style={{
          display: 'inline-block',
          width: '14px',
          height: '14px',
          lineHeight: '14px',
          textAlign: 'center',
          fontSize: '12px',
        }}
      >
        🧹
      </span>
    </button>
  );
};

// Speaker indicator for Audio on/off & activity
const AudioIndicator = ({ panelExpanded = true }) => {
  const audio = useAudioReactive();
  const [level, setLevel] = useState(0);
  const intervalRef = useRef(null);

  const enabled = !!audio?.settings?.enabled;
  const isListening = enabled && !!audio?.isActive;
  const getFeatures = audio?.getFeatures;
  const toggleAudio = audio?.toggleAudio;

  useEffect(() => {
    // Only run when panel is expanded and audio is enabled
    if (!panelExpanded || !enabled || typeof getFeatures !== 'function') {
      setLevel(0);
      return undefined;
    }

    const tick = () => {
      const features = getFeatures?.();
      const rms = typeof features?.rms === 'number' ? features.rms : 0;
      setLevel(rms);
    };

    // Run at ~20fps instead of RAF
    intervalRef.current = setInterval(tick, 50);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [panelExpanded, enabled, getFeatures]);

  const pulseScale = enabled ? 0.9 + Math.min(0.4, level * 0.6) : 0.9;
  const intensity = enabled ? Math.min(1, 0.35 + level * 2.2) : 0.45;
  const glow = enabled
    ? `0 0 ${6 + level * 16}px rgba(74, 222, 128, ${0.5 + level * 0.6})`
    : '0 0 6px rgba(248, 113, 113, 0.4)';

  return (
    <button
      type="button"
      className="icon-btn sm"
      onClick={(e) => {
        e.stopPropagation();
        toggleAudio?.(!enabled);
      }}
      title={enabled ? 'Audio enabled (A to toggle)' : 'Audio disabled (A to toggle)'}
      aria-label={enabled ? 'Disable audio' : 'Enable audio'}
      style={{ padding: '4px' }}
    >
      <span
        style={{
          display: 'inline-block',
          width: '14px',
          height: '14px',
          lineHeight: '14px',
          textAlign: 'center',
          borderRadius: '4px',
          color: enabled ? '#052e16' : '#fff',
          background: enabled
            ? `rgba(74, 222, 128, ${intensity})`
            : `rgba(248, 113, 113, ${intensity})`,
          boxShadow: glow,
          transform: `scale(${pulseScale})`,
          transition: 'background 0.1s ease-out, box-shadow 0.1s ease-out, transform 0.08s ease-out',
        }}
      >
        🔊
      </span>
      {isListening && <span className="sr-only">Audio listening</span>}
    </button>
  );
};

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
  enableBreathing,
  setEnableBreathing,
  colorFadeWhileFrozen,
  setColorFadeWhileFrozen,
  classicMode,
  setClassicMode,
  zIgnore,
  setZIgnore,
  globalSeed,
  setGlobalSeed,
  globalSpeedMultiplier,
  setGlobalSpeedMultiplier,
  getIsRnd,
  setIsRnd,
  palettes,
  globalPaletteIndex,
  globalPaletteRef,
  setGlobalPaletteIndex,
  setGlobalPaletteRef,
  customPalettes,
  onSaveCustomPalette,
  automationPalettes,
  blendModes,
  globalBlendMode,
  setGlobalBlendMode,
  parameterTargetMode,
  setParameterTargetMode,
  onQuickSave,
  onQuickLoad,
  energyInfluence,
  setEnergyInfluence,
  audioSpawnEnabled,
  audioSpawnPresetActive,
  setAudioSpawnEnabled,
  setAudioSpawnPresetActive,
  audioSpawnTriggerMode,
  setAudioSpawnTriggerMode,
  audioSpawnRepeatWhileAbove,
  setAudioSpawnRepeatWhileAbove,
  audioSpawnHysteresis,
  setAudioSpawnHysteresis,
  audioSpawnUseGlobalPalette,
  setAudioSpawnUseGlobalPalette,
  audioSpawnBand,
  setAudioSpawnBand,
  audioSpawnThreshold,
  setAudioSpawnThreshold,
  audioSpawnCooldownMs,
  setAudioSpawnCooldownMs,
  audioSpawnHalfLifeMs,
  setAudioSpawnHalfLifeMs,
  audioSpawnHalfLifeEnergyFactor,
  setAudioSpawnHalfLifeEnergyFactor,
  audioSpawnMaxLayers,
  setAudioSpawnMaxLayers,
  audioSpawnMicReactive,
  setAudioSpawnMicReactive,
  audioSpawnMicReactiveAmount,
  setAudioSpawnMicReactiveAmount,
  audioSpawnForceContourMode,
  setAudioSpawnForceContourMode,
  audioSpawnDirectionMode,
  setAudioSpawnDirectionMode,
  audioSpawnDirectionSpread,
  setAudioSpawnDirectionSpread,
  timelineMode,
  setTimelineMode,
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
  randomizeColorsPerLayer,
  setRandomizeColorsPerLayer,
  uniformColorCount,
  setUniformColorCount,
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
  const [panelOffsetVW, setPanelOffsetVW] = useState(() => {
    try {
      const v = parseFloat(localStorage.getItem('artapp-bottom-panel-offsetvw') || '0');
      return Number.isFinite(v) ? v : 0;
    } catch { return 0; }
  });
  const resizeSideRef = useRef(null); // 'left' | 'right' | null
  const sideResizeStartXRef = useRef(0);
  const sideResizeStartWidthRef = useRef(50);
  const sideResizeStartOffsetRef = useRef(0);
  const panelWidthVWRef = useRef(panelWidthVW);
  const panelOffsetVWRef = useRef(panelOffsetVW);
  const [dockV, setDockV] = useState(() => {
    try { const v = JSON.parse(localStorage.getItem('artapp-bottom-panel-dock') || '{}').v; return v === 'top' ? 'top' : 'bottom'; } catch { return 'bottom'; }
  });
  const [dockH, setDockH] = useState(() => {
    try { const v = JSON.parse(localStorage.getItem('artapp-bottom-panel-dock') || '{}').h; return ['left','center','right'].includes(v) ? v : 'center'; } catch { return 'center'; }
  });
  const isDockDraggingRef = useRef(false);
  const dockDragStartRef = useRef({ x: 0, y: 0 });
  const dockDragMovedRef = useRef(false);
  const lastMidiInputIdRef = useRef('');

  useEffect(() => {
    panelWidthVWRef.current = panelWidthVW;
  }, [panelWidthVW]);
  useEffect(() => {
    panelOffsetVWRef.current = panelOffsetVW;
  }, [panelOffsetVW]);

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
  useEffect(() => {
    if (midiInputId) lastMidiInputIdRef.current = midiInputId;
  }, [midiInputId]);

  // Auto-hide logic (disabled — panel stays expanded until manually minimised)
  const resetHideTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

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

  // Handle panel interactions (throttled to avoid excessive work while scrolling)
  const lastPanelInteractionRef = useRef(0);
  const handlePanelInteraction = useCallback(() => {
    if (panelState !== 'expanded') return;
    const now = Date.now();
    if (now - lastPanelInteractionRef.current < 200) return;
    lastPanelInteractionRef.current = now;
    resetHideTimer();
  }, [panelState, resetHideTimer]);

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
    const rawH = dockV === 'top' ? e.clientY : (window.innerHeight - e.clientY);
    const newH = Math.max(minH, Math.min(maxH, rawH));
    setPanelHeight(newH);
  }, [dockV]);

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
    e.preventDefault();
    isDockDraggingRef.current = true;
    dockDragMovedRef.current = false;
    dockDragStartRef.current = { x: e.clientX, y: e.clientY };
    document.body.style.cursor = 'move';
    document.body.style.userSelect = 'none';
  }, []);

  const applyDockFromPoint = useCallback((x, y) => {
    const third = window.innerWidth / 3;
    const hPos = x < third ? 'left' : (x < third * 2 ? 'center' : 'right');
    const vPos = y < window.innerHeight / 2 ? 'top' : 'bottom';
    setDockH(hPos);
    setDockV(vPos);
    try { localStorage.setItem('artapp-bottom-panel-dock', JSON.stringify({ h: hPos, v: vPos })); } catch { /* noop */ }
  }, []);

  const onDockDragMove = useCallback((e) => {
    if (!isDockDraggingRef.current) return;
    const movedX = Math.abs(e.clientX - dockDragStartRef.current.x);
    const movedY = Math.abs(e.clientY - dockDragStartRef.current.y);
    if ((movedX + movedY) > 6) {
      dockDragMovedRef.current = true;
      applyDockFromPoint(e.clientX, e.clientY);
    }
  }, [applyDockFromPoint]);

  const onDockDragEnd = useCallback((e) => {
    if (!isDockDraggingRef.current) return;
    isDockDraggingRef.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    const movedX = Math.abs(e.clientX - dockDragStartRef.current.x);
    const movedY = Math.abs(e.clientY - dockDragStartRef.current.y);
    const didMove = (movedX + movedY) > 6;
    dockDragMovedRef.current = didMove;
    if (!didMove) return;
    applyDockFromPoint(e.clientX, e.clientY);
  }, [applyDockFromPoint]);

  useEffect(() => {
    const move = (e) => onDockDragMove(e);
    const up = (e) => onDockDragEnd(e);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, [onDockDragMove, onDockDragEnd]);

  // Start side resize (width)
  const onSideResizeStart = useCallback((side) => (e) => {
    const isOuterEdgeHandle =
      (dockH === 'left' && side === 'left')
      || (dockH === 'right' && side === 'right');
    if (panelState !== 'expanded') return;
    if (isOuterEdgeHandle) return;
    resizeSideRef.current = side; // 'left' | 'right'
    sideResizeStartXRef.current = e.clientX;
    sideResizeStartWidthRef.current = panelWidthVWRef.current;
    sideResizeStartOffsetRef.current = panelOffsetVWRef.current;
    e.preventDefault();
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  }, [dockH, panelState]);

  // Handle side resize (width) on mousemove
  useEffect(() => {
    const MIN_PANEL_PX = 320; // pixel floor – matches CSS min-width
    const onMove = (e) => {
      const side = resizeSideRef.current;
      if (!side) return;
      const deltaX = e.clientX - sideResizeStartXRef.current;
      const deltaVW = (deltaX / window.innerWidth) * 100;
      const minVW = Math.max(20, (MIN_PANEL_PX / window.innerWidth) * 100);
      if (dockH === 'center') {
        // Center-docked behavior: drag only the grabbed edge and let center shift.
        const startW = sideResizeStartWidthRef.current;
        const startO = sideResizeStartOffsetRef.current;
        const startLeft = 50 + startO - (startW / 2);
        const startRight = 50 + startO + (startW / 2);
        let left = startLeft;
        let right = startRight;
        if (side === 'right') {
          right = startRight + deltaVW;
        } else {
          left = startLeft + deltaVW;
        }
        let nextW = right - left;
        if (nextW < minVW) {
          if (side === 'right') right = left + minVW;
          else left = right - minVW;
          nextW = minVW;
        } else if (nextW > 95) {
          if (side === 'right') right = left + 95;
          else left = right - 95;
          nextW = 95;
        }
        const nextCenter = (left + right) / 2;
        const nextOffset = nextCenter - 50;
        setPanelWidthVW(nextW);
        setPanelOffsetVW(nextOffset);
        return;
      }

      // Edge-docked behavior (left/right): resize from the inward-facing side.
      const nextVW = side === 'right'
        ? sideResizeStartWidthRef.current + deltaVW
        : sideResizeStartWidthRef.current - deltaVW;
      setPanelWidthVW(Math.max(minVW, Math.min(95, nextVW)));
    };
    const onUp = () => {
      if (!resizeSideRef.current) return;
      resizeSideRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try { localStorage.setItem('artapp-bottom-panel-widthvw', String(panelWidthVWRef.current)); } catch { /* noop */ }
      try { localStorage.setItem('artapp-bottom-panel-offsetvw', String(panelOffsetVWRef.current)); } catch { /* noop */ }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dockH, panelWidthVW]);

  const tabs = useMemo(() => ([
    { id: 'global', label: 'Global', icon: '🌍' },
    { id: 'layer-shape', label: 'Layer Shape', icon: '⬟' },
    { id: 'layer-animation', label: 'Layer Animation', icon: '▶️' },
    { id: 'layer-colour', label: 'Layer Colour', icon: '🎨' },
    { id: 'audio', label: 'Audio', icon: '🎵' },
    { id: 'presets', label: 'Presets', icon: '🎛️' },
    { id: 'groups', label: 'Groups', icon: '🧰' },
  ]), []);
  const showInlineTitleBar = dockV === 'top' && panelState !== 'peek';
  const showFloatingPeekBar = !showInlineTitleBar;
  const handlePeekBarClick = useCallback(() => {
    if (dockDragMovedRef.current) {
      dockDragMovedRef.current = false;
      return;
    }
    setPanelState(panelState === 'expanded' ? 'peek' : 'expanded');
  }, [panelState]);

  // Keyboard shortcuts: 1..7 to switch tabs (no modifiers)
  useEffect(() => {
    const handler = (e) => {
      if (shouldIgnoreGlobalKey(e)) return;
      // Require no modifiers (Shift/Ctrl/Meta/Alt) so it's simple 1..7
      if (e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const key = e.key;
      if (key >= '1' && key <= '7') {
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
            />
          </div>
        );
      
      case 'global':
        return (
          <div className="tab-content global-tab">
            <GlobalControls
              key={`glob-${parameterTargetMode}`}
              isActiveTab={activeTab === 'global'}
              autosaveToggleToken={autosaveToggleToken}
              timelineMode={timelineMode}
              backgroundColor={backgroundColor}
              setBackgroundColor={setBackgroundColor}
              backgroundImage={backgroundImage}
              setBackgroundImage={setBackgroundImage}
              isFrozen={isFrozen}
              setIsFrozen={setIsFrozen}
              enableBreathing={enableBreathing}
              setEnableBreathing={setEnableBreathing}
              energyInfluence={energyInfluence}
              setEnergyInfluence={setEnergyInfluence}
              audioSpawnEnabled={audioSpawnEnabled}
              audioSpawnPresetActive={audioSpawnPresetActive}
              setAudioSpawnEnabled={setAudioSpawnEnabled}
              setAudioSpawnPresetActive={setAudioSpawnPresetActive}
              audioSpawnTriggerMode={audioSpawnTriggerMode}
              setAudioSpawnTriggerMode={setAudioSpawnTriggerMode}
              audioSpawnRepeatWhileAbove={audioSpawnRepeatWhileAbove}
              setAudioSpawnRepeatWhileAbove={setAudioSpawnRepeatWhileAbove}
              audioSpawnHysteresis={audioSpawnHysteresis}
              setAudioSpawnHysteresis={setAudioSpawnHysteresis}
              audioSpawnUseGlobalPalette={audioSpawnUseGlobalPalette}
              setAudioSpawnUseGlobalPalette={setAudioSpawnUseGlobalPalette}
              audioSpawnBand={audioSpawnBand}
              setAudioSpawnBand={setAudioSpawnBand}
              audioSpawnThreshold={audioSpawnThreshold}
              setAudioSpawnThreshold={setAudioSpawnThreshold}
              audioSpawnCooldownMs={audioSpawnCooldownMs}
              setAudioSpawnCooldownMs={setAudioSpawnCooldownMs}
              audioSpawnHalfLifeMs={audioSpawnHalfLifeMs}
              setAudioSpawnHalfLifeMs={setAudioSpawnHalfLifeMs}
              audioSpawnHalfLifeEnergyFactor={audioSpawnHalfLifeEnergyFactor}
              setAudioSpawnHalfLifeEnergyFactor={setAudioSpawnHalfLifeEnergyFactor}
              audioSpawnMaxLayers={audioSpawnMaxLayers}
              setAudioSpawnMaxLayers={setAudioSpawnMaxLayers}
              audioSpawnMicReactive={audioSpawnMicReactive}
              setAudioSpawnMicReactive={setAudioSpawnMicReactive}
              audioSpawnMicReactiveAmount={audioSpawnMicReactiveAmount}
              setAudioSpawnMicReactiveAmount={setAudioSpawnMicReactiveAmount}
              audioSpawnForceContourMode={audioSpawnForceContourMode}
              setAudioSpawnForceContourMode={setAudioSpawnForceContourMode}
              audioSpawnDirectionMode={audioSpawnDirectionMode}
              setAudioSpawnDirectionMode={setAudioSpawnDirectionMode}
              audioSpawnDirectionSpread={audioSpawnDirectionSpread}
              setAudioSpawnDirectionSpread={setAudioSpawnDirectionSpread}
              colorFadeWhileFrozen={colorFadeWhileFrozen}
              setColorFadeWhileFrozen={setColorFadeWhileFrozen}
              classicMode={classicMode}
              setClassicMode={setClassicMode}
              zIgnore={zIgnore}
              setZIgnore={setZIgnore}
              globalSeed={globalSeed}
              setGlobalSeed={setGlobalSeed}
              globalSpeedMultiplier={globalSpeedMultiplier}
              setGlobalSpeedMultiplier={setGlobalSpeedMultiplier}
              getIsRnd={getIsRnd}
              setIsRnd={setIsRnd}
              palettes={palettes}
              globalPaletteIndex={globalPaletteIndex}
              globalPaletteRef={globalPaletteRef}
              setGlobalPaletteIndex={setGlobalPaletteIndex}
              setGlobalPaletteRef={setGlobalPaletteRef}
              customPalettes={customPalettes}
              onSaveCustomPalette={onSaveCustomPalette}
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
              hideAudioSections
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
              randomizeColorsPerLayer={randomizeColorsPerLayer}
              setRandomizeColorsPerLayer={setRandomizeColorsPerLayer}
              uniformColorCount={uniformColorCount}
              setUniformColorCount={setUniformColorCount}
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
              palettes={palettes}
              automationPalettes={automationPalettes}
              onSaveCustomPalette={onSaveCustomPalette}
            />
          </div>
        );
      }
      case 'audio':
        return (
          <div className="tab-content global-tab">
            <div className="control-card">
              <h3 style={{ marginTop: 0, marginBottom: '0.75rem' }}>Audio</h3>
              <div className="compact-field">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className="compact-label">MIDI Input</span>
                </div>
                {!midiSupported ? (
                  <div style={{ opacity: 0.7 }}>No Web MIDI</div>
                ) : (
                  <select className="compact-select" value={midiInputId || ''} onChange={(e) => setMidiInputId?.(e.target.value)}>
                    <option value="">None</option>
                    {(midiInputs || []).map(inp => (<option key={inp.id} value={inp.id}>{inp.name || inp.id}</option>))}
                  </select>
                )}
              </div>
              <AudioReactiveSection isActiveTab={activeTab === 'audio'} />
              <AudioDemoPresetsSection
                timelineMode={timelineMode}
                layers={layers}
                parameterTargetMode={parameterTargetMode}
                setParameterTargetMode={setParameterTargetMode}
                setLayers={setLayers}
                DEFAULT_LAYER={DEFAULT_LAYER}
                setSelectedLayerIndex={setSelectedLayerIndex}
                setGlobalSpeedMultiplier={setGlobalSpeedMultiplier}
                setGlobalBlendMode={setGlobalBlendMode}
                setGlobalPaletteIndex={setGlobalPaletteIndex}
                setGlobalPaletteRef={setGlobalPaletteRef}
                energyInfluence={energyInfluence}
                setEnergyInfluence={setEnergyInfluence}
                audioSpawnEnabled={audioSpawnEnabled}
                audioSpawnPresetActive={audioSpawnPresetActive}
                setAudioSpawnEnabled={setAudioSpawnEnabled}
                setAudioSpawnPresetActive={setAudioSpawnPresetActive}
                audioSpawnTriggerMode={audioSpawnTriggerMode}
                setAudioSpawnTriggerMode={setAudioSpawnTriggerMode}
                audioSpawnRepeatWhileAbove={audioSpawnRepeatWhileAbove}
                setAudioSpawnRepeatWhileAbove={setAudioSpawnRepeatWhileAbove}
                audioSpawnHysteresis={audioSpawnHysteresis}
                setAudioSpawnHysteresis={setAudioSpawnHysteresis}
                audioSpawnBand={audioSpawnBand}
                setAudioSpawnBand={setAudioSpawnBand}
                audioSpawnThreshold={audioSpawnThreshold}
                setAudioSpawnThreshold={setAudioSpawnThreshold}
                audioSpawnCooldownMs={audioSpawnCooldownMs}
                setAudioSpawnCooldownMs={setAudioSpawnCooldownMs}
                audioSpawnHalfLifeMs={audioSpawnHalfLifeMs}
                setAudioSpawnHalfLifeMs={setAudioSpawnHalfLifeMs}
                audioSpawnHalfLifeEnergyFactor={audioSpawnHalfLifeEnergyFactor}
                setAudioSpawnHalfLifeEnergyFactor={setAudioSpawnHalfLifeEnergyFactor}
                audioSpawnMaxLayers={audioSpawnMaxLayers}
                setAudioSpawnMaxLayers={setAudioSpawnMaxLayers}
                audioSpawnMicReactive={audioSpawnMicReactive}
                setAudioSpawnMicReactive={setAudioSpawnMicReactive}
                audioSpawnMicReactiveAmount={audioSpawnMicReactiveAmount}
                setAudioSpawnMicReactiveAmount={setAudioSpawnMicReactiveAmount}
                audioSpawnForceContourMode={audioSpawnForceContourMode}
                setAudioSpawnForceContourMode={setAudioSpawnForceContourMode}
                audioSpawnDirectionMode={audioSpawnDirectionMode}
                setAudioSpawnDirectionMode={setAudioSpawnDirectionMode}
                audioSpawnDirectionSpread={audioSpawnDirectionSpread}
                setAudioSpawnDirectionSpread={setAudioSpawnDirectionSpread}
                audioSpawnUseGlobalPalette={audioSpawnUseGlobalPalette}
                setAudioSpawnUseGlobalPalette={setAudioSpawnUseGlobalPalette}
              />
              <AudioSpawnSection
                isActiveTab={activeTab === 'audio'}
                timelineMode={timelineMode}
                layers={layers}
                selectedLayerIndex={selectedLayerIndex}
                energyInfluence={energyInfluence}
                setEnergyInfluence={setEnergyInfluence}
                audioSpawnEnabled={audioSpawnEnabled}
                setAudioSpawnEnabled={setAudioSpawnEnabled}
                audioSpawnTriggerMode={audioSpawnTriggerMode}
                setAudioSpawnTriggerMode={setAudioSpawnTriggerMode}
                audioSpawnRepeatWhileAbove={audioSpawnRepeatWhileAbove}
                setAudioSpawnRepeatWhileAbove={setAudioSpawnRepeatWhileAbove}
                audioSpawnHysteresis={audioSpawnHysteresis}
                setAudioSpawnHysteresis={setAudioSpawnHysteresis}
                audioSpawnBand={audioSpawnBand}
                setAudioSpawnBand={setAudioSpawnBand}
                audioSpawnThreshold={audioSpawnThreshold}
                setAudioSpawnThreshold={setAudioSpawnThreshold}
                audioSpawnCooldownMs={audioSpawnCooldownMs}
                setAudioSpawnCooldownMs={setAudioSpawnCooldownMs}
                audioSpawnHalfLifeMs={audioSpawnHalfLifeMs}
                setAudioSpawnHalfLifeMs={setAudioSpawnHalfLifeMs}
                audioSpawnHalfLifeEnergyFactor={audioSpawnHalfLifeEnergyFactor}
                setAudioSpawnHalfLifeEnergyFactor={setAudioSpawnHalfLifeEnergyFactor}
                audioSpawnMaxLayers={audioSpawnMaxLayers}
                setAudioSpawnMaxLayers={setAudioSpawnMaxLayers}
                audioSpawnMicReactive={audioSpawnMicReactive}
                setAudioSpawnMicReactive={setAudioSpawnMicReactive}
                audioSpawnMicReactiveAmount={audioSpawnMicReactiveAmount}
                setAudioSpawnMicReactiveAmount={setAudioSpawnMicReactiveAmount}
                audioSpawnForceContourMode={audioSpawnForceContourMode}
                setAudioSpawnForceContourMode={setAudioSpawnForceContourMode}
                audioSpawnDirectionMode={audioSpawnDirectionMode}
                setAudioSpawnDirectionMode={setAudioSpawnDirectionMode}
                audioSpawnDirectionSpread={audioSpawnDirectionSpread}
                setAudioSpawnDirectionSpread={setAudioSpawnDirectionSpread}
                audioSpawnUseGlobalPalette={audioSpawnUseGlobalPalette}
                setAudioSpawnUseGlobalPalette={setAudioSpawnUseGlobalPalette}
              />
              <BPMSection />
            </div>
          </div>
        );
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
      {/* Floating peek bar (not used in top-docked non-peek states) */}
      {showFloatingPeekBar && (
        <div
          className="panel-peek-bar"
          style={{
            width: `${panelWidthVW}vw`,
            transform: dockH === 'center' ? `translateX(${panelOffsetVW}vw)` : undefined,
          }}
          onMouseDown={onDockDragStart}
          onClick={handlePeekBarClick}
        >
          <div className="peek-indicator">
            <span className="peek-line"></span>
            <span className="peek-text">Controls</span>
            <span className="peek-line"></span>
          </div>
        </div>
      )}

      {/* Main panel content */}
      <div
        className="panel-content"
        style={{
          height: panelHeight,
          width: `${panelWidthVW}vw`,
          transform: dockH === 'center' ? `translateX(${panelOffsetVW}vw)` : undefined,
        }}
      >
        {/* Resize handle at the free vertical edge (opposite of docked edge) */}
        <div
          className={`panel-resize-handle ${dockV === 'top' ? 'bottom-edge' : 'top-edge'}`}
          onMouseDown={onResizeStart}
          title="Drag up/down to resize"
        />
        {/* Side handles for width resize */}
        <div
          className={`panel-resize-handle-side left ${dockH === 'left' ? 'disabled' : ''}`}
          onMouseDown={onSideResizeStart('left')}
          title={dockH === 'left' ? 'Edge handle disabled when docked left' : 'Drag left/right to resize'}
        />
        <div
          className={`panel-resize-handle-side right ${dockH === 'right' ? 'disabled' : ''}`}
          onMouseDown={onSideResizeStart('right')}
          title={dockH === 'right' ? 'Edge handle disabled when docked right' : 'Drag left/right to resize'}
        />
        {showInlineTitleBar && (
          <div
            className="panel-title-bar-inline"
            onMouseDown={(e) => {
              e.stopPropagation();
              onDockDragStart(e);
            }}
            onClick={handlePeekBarClick}
            title="Drag to move panel · Click to minimize"
          >
            <div className="panel-title-inline-content">
              <span className="panel-title-inline-line"></span>
              <span className="panel-title-inline-text">Controls</span>
              <span className="panel-title-inline-line"></span>
            </div>
          </div>
        )}
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
          <button
            type="button"
            className="icon-btn sm"
            disabled={typeof setTimelineMode !== 'function'}
            onClick={(e) => {
              e.stopPropagation();
              handlePanelInteraction();
              setTimelineMode?.((v) => !v);
            }}
            title={timelineMode ? 'Timeline mode (BPM + Audio disabled)' : 'Free mode (no timeline)'}
            aria-label={timelineMode ? 'Disable timeline mode' : 'Enable timeline mode'}
            style={{ opacity: timelineMode ? 1 : 0.35 }}
          >
            {timelineMode ? '🕒' : '⏱️'}
          </button>
          <button
            type="button"
            className="icon-btn sm"
            disabled={!midiSupported || !(Array.isArray(midiInputs) && midiInputs.length > 0)}
            onClick={(e) => {
              e.stopPropagation();
              handlePanelInteraction();
              if (midiInputId) {
                setMidiInputId?.('');
                return;
              }
              const preferred = lastMidiInputIdRef.current;
              const candidate = (midiInputs || []).find(inp => inp?.id === preferred)?.id
                || (midiInputs || [])[0]?.id
                || '';
              if (candidate) setMidiInputId?.(candidate);
            }}
            title={midiInputId ? 'Disable MIDI Learn' : 'Enable MIDI Learn'}
            aria-label={midiInputId ? 'Disable MIDI Learn' : 'Enable MIDI Learn'}
            style={{ opacity: midiInputId ? 1 : 0.45 }}
          >
            🎹
          </button>
          <BeatIndicator panelExpanded={panelState === 'expanded'} />
          <AudioIndicator panelExpanded={panelState === 'expanded'} />
          <AudioLEDMeter panelExpanded={panelState === 'expanded'} />
          <ClearMappingsButton />
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
  if (!Object.is(prev.enableBreathing, next.enableBreathing)) return fail('enableBreathing changed');
  if (!Object.is(prev.energyInfluence, next.energyInfluence)) return fail('energyInfluence changed');
	  if (!Object.is(prev.audioSpawnEnabled, next.audioSpawnEnabled)) return fail('audioSpawnEnabled changed');
  if (!Object.is(prev.audioSpawnPresetActive, next.audioSpawnPresetActive)) return fail('audioSpawnPresetActive changed');
	  if (!Object.is(prev.audioSpawnTriggerMode, next.audioSpawnTriggerMode)) return fail('audioSpawnTriggerMode changed');
	  if (!Object.is(prev.audioSpawnRepeatWhileAbove, next.audioSpawnRepeatWhileAbove)) return fail('audioSpawnRepeatWhileAbove changed');
	  if (!Object.is(prev.audioSpawnHysteresis, next.audioSpawnHysteresis)) return fail('audioSpawnHysteresis changed');
	  if (!Object.is(prev.audioSpawnUseGlobalPalette, next.audioSpawnUseGlobalPalette)) return fail('audioSpawnUseGlobalPalette changed');
	  if (!Object.is(prev.audioSpawnBand, next.audioSpawnBand)) return fail('audioSpawnBand changed');
  if (!Object.is(prev.audioSpawnThreshold, next.audioSpawnThreshold)) return fail('audioSpawnThreshold changed');
  if (!Object.is(prev.audioSpawnCooldownMs, next.audioSpawnCooldownMs)) return fail('audioSpawnCooldownMs changed');
  if (!Object.is(prev.audioSpawnHalfLifeMs, next.audioSpawnHalfLifeMs)) return fail('audioSpawnHalfLifeMs changed');
  if (!Object.is(prev.audioSpawnHalfLifeEnergyFactor, next.audioSpawnHalfLifeEnergyFactor)) return fail('audioSpawnHalfLifeEnergyFactor changed');
  if (!Object.is(prev.audioSpawnMaxLayers, next.audioSpawnMaxLayers)) return fail('audioSpawnMaxLayers changed');
  if (!Object.is(prev.audioSpawnMicReactive, next.audioSpawnMicReactive)) return fail('audioSpawnMicReactive changed');
  if (!Object.is(prev.audioSpawnMicReactiveAmount, next.audioSpawnMicReactiveAmount)) return fail('audioSpawnMicReactiveAmount changed');
  if (!Object.is(prev.audioSpawnForceContourMode, next.audioSpawnForceContourMode)) return fail('audioSpawnForceContourMode changed');
  if (!Object.is(prev.audioSpawnDirectionMode, next.audioSpawnDirectionMode)) return fail('audioSpawnDirectionMode changed');
  if (!Object.is(prev.audioSpawnDirectionSpread, next.audioSpawnDirectionSpread)) return fail('audioSpawnDirectionSpread changed');
  if (!Object.is(prev.colorFadeWhileFrozen, next.colorFadeWhileFrozen)) return fail('colorFadeWhileFrozen changed');
  if (!Object.is(prev.classicMode, next.classicMode)) return fail('classicMode changed');
  if (!Object.is(prev.zIgnore, next.zIgnore)) return fail('zIgnore changed');
  if (!Object.is(prev.globalSeed, next.globalSeed)) return fail('globalSeed changed');
  if (!Object.is(prev.globalSpeedMultiplier, next.globalSpeedMultiplier)) return fail('globalSpeedMultiplier changed');
  if (!Object.is(prev.globalBlendMode, next.globalBlendMode)) return fail('globalBlendMode changed');
  if (!Object.is(prev.globalPaletteIndex, next.globalPaletteIndex)) return fail('globalPaletteIndex changed');
  if (!Object.is(prev.timelineMode, next.timelineMode)) return fail('timelineMode changed');
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
    'setEnableBreathing',
    'setEnergyInfluence',
    'setAudioSpawnEnabled',
    'setAudioSpawnPresetActive',
    'setAudioSpawnUseGlobalPalette',
    'setAudioSpawnBand',
    'setAudioSpawnThreshold',
    'setAudioSpawnCooldownMs',
    'setAudioSpawnHalfLifeMs',
    'setAudioSpawnHalfLifeEnergyFactor',
    'setAudioSpawnMaxLayers',
    'setAudioSpawnMicReactive',
    'setColorFadeWhileFrozen',
    'setClassicMode',
    'setZIgnore',
    'setGlobalSeed',
    'setGlobalSpeedMultiplier',
    'setGlobalBlendMode',
    'setGlobalPaletteIndex',
    'setTimelineMode',
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
