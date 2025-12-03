import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
// NOTE: useAppState removed to prevent context subscription causing re-renders on every frame
// Morph-related values are now passed as props from BottomPanel
import { useParameters } from '../../context/ParameterContext.jsx';
import { useMidi } from '../../context/MidiContext.jsx';
import { useAudioReactive } from '../../context/AudioContext.jsx';
import { useBPM } from '../../context/BPMContext.jsx';
import { hexToRgb, rgbToHex } from '../../utils/colorUtils.js';
import BackgroundColorPicker from '../BackgroundColorPicker.jsx';
import PresetControls from './PresetControls.jsx';
import BufferedNumberInput from '../common/BufferedNumberInput.jsx';
import AutosaveRecovery from './AutosaveRecovery.jsx';
import { isSettingsDebugEnabled, throttledSettingsDebugLog } from '../../utils/settingsDebug.js';

const GLOBAL_SEED_MIN = 1;
const GLOBAL_SEED_MAX = 2147483646;
const AUTOSAVE_META_KEY = 'artapp-autosave-meta';
const AUTOSAVE_SLOT_PREFIX = 'artapp-autosave-';
const AUTOSAVE_SLOT_COUNT = 3;

// Range mapping editor sub-component
const RangeMappingEditor = ({ label, range, band, onRangeChange, onBandChange }) => {
  const [expanded, setExpanded] = useState(false);
  const bands = ['rms', 'bass', 'mids', 'highs'];
  
  return (
    <div style={{ marginBottom: '0.5rem', padding: '0.25rem', borderRadius: 4, background: 'rgba(255,255,255,0.03)' }}>
      <div 
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
        onClick={() => setExpanded(e => !e)}
      >
        <span className="compact-label" style={{ fontSize: '0.75rem' }}>{label}</span>
        <span style={{ fontSize: '0.7rem', opacity: 0.6 }}>{expanded ? '▼' : '▶'}</span>
      </div>
      {expanded && (
        <div style={{ marginTop: '0.25rem', paddingLeft: '0.25rem' }}>
          {/* Band selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '0.7rem', opacity: 0.7, width: '2.5rem' }}>Band:</span>
            <select
              className="compact-select"
              style={{ fontSize: '0.7rem', padding: '2px 4px', flex: 1 }}
              value={band}
              onChange={(e) => onBandChange(e.target.value)}
            >
              {bands.map(b => <option key={b} value={b}>{b.toUpperCase()}</option>)}
            </select>
          </div>
          {/* Input range (audio level threshold) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '0.7rem', opacity: 0.7, width: '2.5rem' }}>In:</span>
            <input
              type="number"
              step="0.05"
              min="0"
              max="1"
              value={range.inputMin}
              onChange={(e) => onRangeChange({ inputMin: parseFloat(e.target.value) || 0 })}
              style={{ width: '3rem', fontSize: '0.7rem', padding: '2px 4px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 3, color: 'white' }}
            />
            <span style={{ fontSize: '0.7rem', opacity: 0.5 }}>→</span>
            <input
              type="number"
              step="0.05"
              min="0"
              max="1"
              value={range.inputMax}
              onChange={(e) => onRangeChange({ inputMax: parseFloat(e.target.value) || 1 })}
              style={{ width: '3rem', fontSize: '0.7rem', padding: '2px 4px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 3, color: 'white' }}
            />
          </div>
          {/* Output range (parameter value) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.7rem', opacity: 0.7, width: '2.5rem' }}>Out:</span>
            <input
              type="number"
              step="0.1"
              value={range.outputMin}
              onChange={(e) => onRangeChange({ outputMin: parseFloat(e.target.value) || 0 })}
              style={{ width: '3rem', fontSize: '0.7rem', padding: '2px 4px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 3, color: 'white' }}
            />
            <span style={{ fontSize: '0.7rem', opacity: 0.5 }}>→</span>
            <input
              type="number"
              step="0.1"
              value={range.outputMax}
              onChange={(e) => onRangeChange({ outputMax: parseFloat(e.target.value) || 1 })}
              style={{ width: '3rem', fontSize: '0.7rem', padding: '2px 4px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 3, color: 'white' }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

// Audio Reactive Section Component - Global audio settings only
// Per-parameter audio mappings are shown alongside MIDI controls on each parameter
const AudioReactiveSection = () => {
  const audio = useAudioReactive();
  const [showSettings, setShowSettings] = useState(false);
  const [features, setFeatures] = useState({ rms: 0, bass: 0, mids: 0, highs: 0 });

  // Destructure with defaults to avoid conditional hook issues
  const {
    isActive = false,
    error = null,
    getFeatures = null,
    settings = { enabled: false, sensitivity: 1, smoothing: 0.7, release: 0.85 },
    availableDevices = [],
    currentDeviceId = null,
    toggleAudio = null,
    setSensitivity = null,
    setSmoothing = null,
    setRelease = null,
    setDeviceId = null,
    // File playback
    isFileMode = false,
    isFilePlaying = false,
    fileInfo = null,
    fileProgress = 0,
    hasStoredFile = false,
    loadAudioFile = null,
    toggleFilePlayback = null,
    seekFile = null,
    stopFilePlayback = null,
  } = audio || {};
  
  // File input ref
  const fileInputRef = useRef(null);
  
  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (file && loadAudioFile) {
      await loadAudioFile(file);
    }
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  const formatTime = (seconds) => {
    if (!seconds || !Number.isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  // Poll audio features for visual meters when active
  // This hook must be called unconditionally (before any early returns)
  useEffect(() => {
    if (!isActive || !getFeatures) return;
    
    let rafId;
    const updateMeters = () => {
      const f = getFeatures();
      setFeatures(f);
      rafId = requestAnimationFrame(updateMeters);
    };
    
    rafId = requestAnimationFrame(updateMeters);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [isActive, getFeatures]);

  if (!audio) {
    return null;
  }

  return (
    <div className="compact-field" style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '0.5rem', marginTop: '0.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="compact-label" style={{ fontWeight: 600 }}>🎵 Audio Input</span>
        <button
          type="button"
          className="icon-btn sm"
          title="Audio settings"
          aria-label="Audio settings"
          onClick={(e) => { e.stopPropagation(); setShowSettings(s => !s); }}
        >⚙</button>
      </div>

      {/* Enable/Disable toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
        <label className="compact-label" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={() => toggleAudio()}
          />
          {settings.enabled 
            ? (isActive ? (isFileMode ? 'Playing File' : 'Listening') : 'Starting...') 
            : (hasStoredFile ? 'Enable Audio (file saved)' : 'Enable Audio')}
        </label>
        {error && <span style={{ color: '#ff6b6b', fontSize: '0.75rem' }}>{error}</span>}
      </div>

      {/* Device selector (shown when enabled and not in file mode) */}
      {settings.enabled && !isFileMode && (
        <div style={{ marginTop: '0.25rem' }}>
          <select
            className="compact-select"
            style={{ fontSize: '0.75rem', width: '100%' }}
            value={currentDeviceId || ''}
            onChange={(e) => setDeviceId(e.target.value || null)}
          >
            <option value="">Default Input Device</option>
            {availableDevices.map(device => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Device ${device.deviceId.slice(0, 8)}`}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* File playback controls */}
      {isFileMode && fileInfo && (
        <div style={{ marginTop: '0.5rem', padding: '0.5rem', borderRadius: 6, background: 'rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>🎵</span>
            <span style={{ fontSize: '0.75rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {fileInfo.name}
            </span>
            <button
              type="button"
              className="btn-compact-secondary"
              style={{ fontSize: '0.7rem', padding: '2px 6px' }}
              onClick={stopFilePlayback}
              title="Close file and return to mic input"
            >
              ✕
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn-compact-secondary"
              style={{ fontSize: '0.8rem', padding: '4px 8px', minWidth: '2rem' }}
              onClick={toggleFilePlayback}
              title={isFilePlaying ? 'Pause' : 'Play'}
            >
              {isFilePlaying ? '⏸' : '▶'}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.001}
              value={fileProgress}
              onChange={(e) => seekFile(parseFloat(e.target.value))}
              style={{ flex: 1, height: 4 }}
              className="compact-range"
            />
            <span style={{ fontSize: '0.7rem', opacity: 0.7, minWidth: '3rem', textAlign: 'right' }}>
              {formatTime(fileProgress * fileInfo.duration)} / {formatTime(fileInfo.duration)}
            </span>
          </div>
        </div>
      )}

      {/* Load file button (shown when enabled) */}
      {settings.enabled && (
        <div style={{ marginTop: '0.25rem' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            className="btn-compact-secondary"
            style={{ fontSize: '0.75rem', width: '100%' }}
            onClick={() => fileInputRef.current?.click()}
          >
            {isFileMode ? '🎵 Load Different File' : '📁 Play from File'}
          </button>
        </div>
      )}

      {/* Audio level meters */}
      {isActive && (
        <div style={{ marginTop: '0.5rem', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.25rem 0.5rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>Level</span>
          <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${features.rms * 100}%`, background: '#4fc3f7', transition: 'width 0.05s' }} />
          </div>
          <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>Bass</span>
          <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${features.bass * 100}%`, background: '#ff6b6b', transition: 'width 0.05s' }} />
          </div>
          <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>Mids</span>
          <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${features.mids * 100}%`, background: '#ffd93d', transition: 'width 0.05s' }} />
          </div>
          <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>Highs</span>
          <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${features.highs * 100}%`, background: '#6bcb77', transition: 'width 0.05s' }} />
          </div>
        </div>
      )}

      {/* Settings panel */}
      {showSettings && (
        <div style={{ marginTop: '0.5rem', padding: '0.5rem', borderRadius: 6, background: 'rgba(255,255,255,0.05)' }}>
          {/* Sensitivity slider */}
          <div style={{ marginBottom: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
              <span className="compact-label">Sensitivity</span>
              <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>{settings.sensitivity.toFixed(2)}</span>
            </div>
            <input
              className="compact-range"
              type="range"
              min={0}
              max={3}
              step={0.05}
              value={settings.sensitivity}
              onChange={(e) => setSensitivity(parseFloat(e.target.value))}
            />
          </div>

          {/* Smoothing slider */}
          <div style={{ marginBottom: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
              <span className="compact-label">Smoothing (Attack)</span>
              <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>{settings.smoothing.toFixed(2)}</span>
            </div>
            <input
              className="compact-range"
              type="range"
              min={0.05}
              max={1}
              step={0.05}
              value={settings.smoothing}
              onChange={(e) => setSmoothing(parseFloat(e.target.value))}
            />
          </div>

          {/* Release slider */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
              <span className="compact-label">Release (Falloff)</span>
              <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>{settings.release.toFixed(2)}</span>
            </div>
            <input
              className="compact-range"
              type="range"
              min={0.05}
              max={0.98}
              step={0.05}
              value={settings.release}
              onChange={(e) => setRelease(parseFloat(e.target.value))}
            />
          </div>

          <div style={{ marginTop: '0.5rem', fontSize: '0.7rem', opacity: 0.6 }}>
            Higher smoothing = faster response. Higher release = slower decay. Map audio to parameters using the Audio dropdown on each control.
          </div>
        </div>
      )}
    </div>
  );
};

// BPM/Beat Sync Section Component - Master BPM controls
const BPMSection = ({ showBeatCounter = false }) => {
  const bpm = useBPM();

  if (!bpm) {
    return null;
  }

  const {
    bpm: currentBPM,
    isPlaying,
    setBPM,
    togglePlay,
    reset,
    tap,
  } = bpm;

  return (
    <div className="compact-field" style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '0.5rem', marginTop: '0.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="compact-label" style={{ fontWeight: 600 }}>♪ BPM / Beat Sync</span>
      </div>

      {/* BPM and controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <span className="compact-label" style={{ fontSize: '0.75rem' }}>BPM:</span>
          <input
            type="number"
            min="20"
            max="300"
            step="1"
            value={currentBPM}
            onChange={(e) => setBPM(parseFloat(e.target.value))}
            style={{ width: '4rem', fontSize: '0.75rem', padding: '2px 4px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 3, color: 'white' }}
          />
        </div>
        
        <button
          className="btn-compact-secondary"
          onClick={togglePlay}
          style={{ fontSize: '0.75rem', padding: '2px 6px' }}
        >
          {isPlaying ? '⏸ Pause' : '▶ Play'}
        </button>
        
        <button
          className="btn-compact-secondary"
          onClick={reset}
          style={{ fontSize: '0.75rem', padding: '2px 6px' }}
        >
          ⏹ Reset
        </button>
        
        <button
          className="btn-compact-secondary"
          onClick={tap}
          style={{ fontSize: '0.75rem', padding: '2px 6px' }}
          title="Tap tempo - tap 2-4 times to set BPM"
        >
          Tap
        </button>
        
      </div>

      <div style={{ marginTop: '0.5rem', fontSize: '0.7rem', opacity: 0.6 }}>
        Map parameters to beats using the BPM checkbox on each control (when "BPM Learn" is enabled above).
      </div>
    </div>
  );
};

// Audio control row component - shown per parameter in settings panel
const AudioControlRow = ({ paramId, label }) => {
  const audio = useAudioReactive();
  const bpm = useBPM();
  const midi = useMidi();
  const [showRange, setShowRange] = useState(false);
  
  if (!audio) return null;
  
  const { 
    isActive, 
    mappings, 
    setMapping, 
    clearMapping,
    learnParamId,
    beginLearn,
    cancelLearn,
    AUDIO_BANDS,
    DEFAULT_RANGE,
  } = audio;
  
  const mapping = mappings?.[paramId];
  const currentBand = mapping?.band || 'none';
  const currentRange = mapping?.range || DEFAULT_RANGE;
  const isLearning = learnParamId === paramId;
  
  const handleBandChange = (band) => {
    if (band === 'none') {
      setMapping(paramId, { band: 'none', range: DEFAULT_RANGE });
    } else {
      // Enable Audio and disable MIDI/BPM for this parameter (mutual exclusivity)
      setMapping(paramId, { band, range: currentRange });
      // Clear MIDI mapping
      if (midi?.clearMapping) midi.clearMapping(paramId);
      // Clear BPM mapping
      if (bpm?.setMapping) bpm.setMapping(paramId, { enabled: false, speed: 1, loopMode: 'forward', range: bpm.DEFAULT_RANGE || { outputMin: 0, outputMax: 1 } });
    }
    if (isLearning) cancelLearn();
  };
  
  const handleRangeChange = (update) => {
    if (currentBand === 'none') return;
    setMapping(paramId, { band: currentBand, range: { ...currentRange, ...update } });
  };
  
  return (
    <div style={{ marginTop: '0.25rem' }}>
      <div className="compact-row" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <span className="compact-label" style={{ opacity: 0.8, fontSize: '0.7rem' }}>Audio:</span>
        <select
          className="compact-select"
          style={{ fontSize: '0.7rem', padding: '2px 4px', minWidth: '4rem' }}
          value={currentBand}
          onChange={(e) => handleBandChange(e.target.value)}
        >
          {AUDIO_BANDS.map(b => (
            <option key={b} value={b}>
              {b === 'none' ? 'None' : b === 'rms' ? 'Level' : b.charAt(0).toUpperCase() + b.slice(1)}
            </option>
          ))}
        </select>
        {currentBand !== 'none' && (
          <>
            <button
              className="btn-compact-secondary"
              style={{ fontSize: '0.65rem', padding: '2px 4px' }}
              onClick={() => setShowRange(r => !r)}
              title="Edit range mapping"
            >
              Range
            </button>
            <button
              className="btn-compact-secondary"
              style={{ fontSize: '0.65rem', padding: '2px 4px' }}
              onClick={() => clearMapping(paramId)}
              title="Clear audio mapping"
            >
              Clear
            </button>
          </>
        )}
        {isActive && currentBand !== 'none' && (
          <span style={{ fontSize: '0.65rem', color: '#4fc3f7' }}>●</span>
        )}
      </div>
      
      {/* Range editor */}
      {showRange && currentBand !== 'none' && (
        <div style={{ marginTop: '0.25rem', marginLeft: '0.5rem', padding: '0.25rem', borderRadius: 4, background: 'rgba(255,255,255,0.03)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '0.65rem', opacity: 0.7, width: '2rem' }}>In:</span>
            <input
              type="number"
              step="0.05"
              min="0"
              max="1"
              value={currentRange.inputMin}
              onChange={(e) => handleRangeChange({ inputMin: parseFloat(e.target.value) || 0 })}
              style={{ width: '2.5rem', fontSize: '0.65rem', padding: '2px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 3, color: 'white' }}
            />
            <span style={{ fontSize: '0.65rem', opacity: 0.5 }}>→</span>
            <input
              type="number"
              step="0.05"
              min="0"
              max="1"
              value={currentRange.inputMax}
              onChange={(e) => handleRangeChange({ inputMax: parseFloat(e.target.value) || 1 })}
              style={{ width: '2.5rem', fontSize: '0.65rem', padding: '2px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 3, color: 'white' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.65rem', opacity: 0.7, width: '2rem' }}>Out:</span>
            <input
              type="number"
              step="0.1"
              value={currentRange.outputMin}
              onChange={(e) => handleRangeChange({ outputMin: parseFloat(e.target.value) || 0 })}
              style={{ width: '2.5rem', fontSize: '0.65rem', padding: '2px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 3, color: 'white' }}
            />
            <span style={{ fontSize: '0.65rem', opacity: 0.5 }}>→</span>
            <input
              type="number"
              step="0.1"
              value={currentRange.outputMax}
              onChange={(e) => handleRangeChange({ outputMax: parseFloat(e.target.value) || 1 })}
              style={{ width: '2.5rem', fontSize: '0.65rem', padding: '2px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 3, color: 'white' }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

// BPM control row component - shown per parameter in settings panel
const BPMControlRow = ({ paramId }) => {
  const bpm = useBPM();
  const audio = useAudioReactive();
  const midi = useMidi();
  const [showSettings, setShowSettings] = useState(false);
  
  if (!bpm) return null;
  
  const { 
    isPlaying,
    mappings, 
    setMapping, 
    clearMapping,
    BEAT_SPEEDS,
    LOOP_MODES,
    DEFAULT_RANGE,
  } = bpm;
  
  const mapping = mappings?.[paramId];
  const isEnabled = mapping?.enabled || false;
  const currentSpeed = mapping?.speed || 1;
  const currentLoopMode = mapping?.loopMode || 'forward';
  const currentRange = mapping?.range || DEFAULT_RANGE;
  
  const handleToggle = () => {
    if (isEnabled) {
      setMapping(paramId, { enabled: false, speed: currentSpeed, loopMode: currentLoopMode, range: currentRange });
    } else {
      // Enable BPM and disable MIDI/Audio for this parameter (mutual exclusivity)
      setMapping(paramId, { enabled: true, speed: currentSpeed, loopMode: currentLoopMode, range: currentRange });
      // Clear MIDI mapping
      if (midi?.clearMapping) midi.clearMapping(paramId);
      // Clear Audio mapping
      if (audio?.setMapping) audio.setMapping(paramId, { band: 'none', range: audio.DEFAULT_RANGE || { outputMin: 0, outputMax: 1 } });
    }
  };
  
  const handleSpeedChange = (speed) => {
    setMapping(paramId, { enabled: isEnabled, speed: Number(speed), loopMode: currentLoopMode, range: currentRange });
  };
  
  const handleLoopModeChange = (loopMode) => {
    setMapping(paramId, { enabled: isEnabled, speed: currentSpeed, loopMode, range: currentRange });
  };
  
  const handleRangeChange = (update) => {
    setMapping(paramId, { enabled: isEnabled, speed: currentSpeed, loopMode: currentLoopMode, range: { ...currentRange, ...update } });
  };
  
  return (
    <div style={{ marginTop: '0.25rem' }}>
      <div className="compact-row" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <span className="compact-label" style={{ opacity: 0.8, fontSize: '0.7rem' }}>BPM:</span>
        <input
          type="checkbox"
          checked={isEnabled}
          onChange={handleToggle}
          style={{ cursor: 'pointer' }}
        />
        {isEnabled && (
          <>
            <select
              className="compact-select"
              style={{ fontSize: '0.7rem', padding: '2px 4px', minWidth: '3rem' }}
              value={currentSpeed}
              onChange={(e) => handleSpeedChange(e.target.value)}
            >
              {BEAT_SPEEDS.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <select
              className="compact-select"
              style={{ fontSize: '0.7rem', padding: '2px 4px', minWidth: '4rem' }}
              value={currentLoopMode}
              onChange={(e) => handleLoopModeChange(e.target.value)}
            >
              {LOOP_MODES.map(mode => (
                <option key={mode} value={mode}>
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </option>
              ))}
            </select>
            <button
              className="btn-compact-secondary"
              style={{ fontSize: '0.65rem', padding: '2px 4px' }}
              onClick={() => setShowSettings(s => !s)}
              title="Edit range"
            >
              Range
            </button>
            <button
              className="btn-compact-secondary"
              style={{ fontSize: '0.65rem', padding: '2px 4px' }}
              onClick={() => clearMapping(paramId)}
              title="Clear BPM mapping"
            >
              Clear
            </button>
          </>
        )}
        {isPlaying && isEnabled && (
          <span style={{ fontSize: '0.65rem', color: '#4fc3f7' }}>♪</span>
        )}
      </div>
      
      {/* Range editor */}
      {showSettings && isEnabled && (
        <div style={{ marginTop: '0.25rem', marginLeft: '0.5rem', padding: '0.25rem', borderRadius: 4, background: 'rgba(255,255,255,0.03)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.65rem', opacity: 0.7, width: '2rem' }}>Out:</span>
            <input
              type="number"
              step="0.1"
              value={currentRange.outputMin}
              onChange={(e) => handleRangeChange({ outputMin: parseFloat(e.target.value) || 0 })}
              style={{ width: '2.5rem', fontSize: '0.65rem', padding: '2px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 3, color: 'white' }}
            />
            <span style={{ fontSize: '0.65rem', opacity: 0.5 }}>→</span>
            <input
              type="number"
              step="0.1"
              value={currentRange.outputMax}
              onChange={(e) => handleRangeChange({ outputMax: parseFloat(e.target.value) || 1 })}
              style={{ width: '2.5rem', fontSize: '0.65rem', padding: '2px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 3, color: 'white' }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

// A full-featured Global Controls panel, mirroring the original inline UI
const GlobalControls = ({
  // State and actions
  backgroundColor,
  setBackgroundColor,
  backgroundImage,
  setBackgroundImage,
  isFrozen,
  setIsFrozen,
  zIgnore,
  setZIgnore,
  classicMode,
  setClassicMode,
  globalSeed,
  setGlobalSeed,
  globalSpeedMultiplier,
  setGlobalSpeedMultiplier,
  getIsRnd,
  setIsRnd,
  // Fade while frozen
  colorFadeWhileFrozen,
  setColorFadeWhileFrozen,
  syncLayerColorsToFirst,
  setSyncLayerColorsToFirst,
  // MIDI
  midiSupported,
  beginLearn,
  clearMapping,
  midiMappings,
  mappingLabel,
  learnParamId,
  // Palettes/Blend
  palettes,
  blendModes,
  globalBlendMode,
  setGlobalBlendMode,
  parameterTargetMode,
  setParameterTargetMode,
  // MIDI input
  midiInputs,
  midiInputId,
  setMidiInputId,
  // Layers + helpers
  layers,
  sampleColorsEven,
  assignOneColorPerLayer,
  setLayers,
  DEFAULT_LAYER,
  buildVariedLayerFrom,
  // Actions
  handleRandomizeAll,
  // UI options
  hidePresets = false,
  autosaveToggleToken = 0,
  // Morph props (passed from BottomPanel to avoid useAppState subscription)
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
  const layerSeedNonceRef = useRef(0);
  const generateLayerSeed = useCallback(() => {
    const MOD = 2147483646;
    let randomValue = 0;
    try {
      if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
        const arr = new Uint32Array(1);
        window.crypto.getRandomValues(arr);
        randomValue = arr[0] % MOD;
      }
    } catch {
      // noop — fallback to Math.random below
    }
    if (!randomValue) {
      randomValue = Math.floor(Math.random() * MOD);
    }
    if (randomValue === 0) randomValue = 1;
    layerSeedNonceRef.current = (layerSeedNonceRef.current + 1013904223) % MOD;
    let seed = (randomValue + layerSeedNonceRef.current) % MOD;
    if (seed <= 0) seed += MOD - 1;
    return seed;
  }, []);

  // Keep Canvas background image renderer in sync
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const enabled = !!(backgroundImage && backgroundImage.enabled);
        const src = backgroundImage?.src || null;
        const opacity = Math.max(0, Math.min(1, Number(backgroundImage?.opacity ?? 1)));
        const fit = backgroundImage?.fit || 'cover';
        window.__artapp_bgimg = { enabled, src, opacity, fit };
      }
    } catch { /* noop */ }
  }, [backgroundImage]);
  // Presets: these values are now passed as props to avoid useAppState() subscription
  // which causes re-renders on every animation frame
  const { loadFullConfiguration, applyParametersSnapshot } = useParameters() || {};
  const { registerParamHandler } = useMidi() || {};

  // Autosave recovery state
  const [showAutosaveRecovery, setShowAutosaveRecovery] = useState(false);
  const [autosaveSlots, setAutosaveSlots] = useState([]);
  const [autosaveMessage, setAutosaveMessage] = useState('');
  const [autosaveError, setAutosaveError] = useState('');

  const refreshAutosaveSlots = useCallback(() => {
    if (typeof window === 'undefined' || !window.localStorage) {
      setAutosaveSlots([]);
      setAutosaveError('Autosave storage is unavailable in this environment.');
      return;
    }
    try {
      const metaRaw = window.localStorage.getItem(AUTOSAVE_META_KEY);
      const meta = metaRaw ? JSON.parse(metaRaw) : {};
      const slotsMeta = Array.isArray(meta?.slots) ? meta.slots : [];
      const map = new Map();

      const ensureSlotEntry = (key, timestamp) => {
        if (!key) return;
        if (!map.has(key)) {
          map.set(key, { key, timestamp: timestamp || null, hasData: false });
        } else if (timestamp && !map.get(key).timestamp) {
          map.set(key, { ...map.get(key), timestamp });
        }
      };

      slotsMeta.forEach((slot, idx) => {
        const key = slot?.key || `${AUTOSAVE_SLOT_PREFIX}${idx}`;
        ensureSlotEntry(key, slot?.timestamp || null);
      });

      for (let i = 0; i < AUTOSAVE_SLOT_COUNT; i += 1) {
        const key = `${AUTOSAVE_SLOT_PREFIX}${i}`;
        ensureSlotEntry(key, null);
      }

      const entries = Array.from(map.values()).map((entry) => {
        let timestamp = entry.timestamp;
        let hasData = false;
        try {
          const raw = window.localStorage.getItem(entry.key);
          if (raw) {
            hasData = true;
            if (!timestamp) {
              const payload = JSON.parse(raw);
              if (payload?.savedAt) {
                timestamp = payload.savedAt;
              }
            }
          }
        } catch (error) {
          console.warn('[Autosave] Failed to inspect slot', entry.key, error);
        }
        return { key: entry.key, timestamp, hasData };
      }).filter((entry) => entry.hasData);

      entries.sort((a, b) => {
        const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return tb - ta;
      });

      setAutosaveSlots(entries);
      if (!entries.length) {
        setAutosaveMessage('');
      }
      setAutosaveError('');
    } catch (error) {
      console.warn('[Autosave] Failed to load autosave metadata', error);
      setAutosaveSlots([]);
      setAutosaveError('Failed to read autosave metadata.');
    }
  }, []);

  const handleRestoreAutosave = useCallback((slotKey) => {
    if (!slotKey) return;
    if (typeof window === 'undefined' || !window.localStorage) {
      setAutosaveError('Autosave storage is unavailable.');
      return;
    }
    try {
      const raw = window.localStorage.getItem(slotKey);
      if (!raw) {
        setAutosaveError('Selected autosave could not be found.');
        refreshAutosaveSlots();
        return;
      }
      const data = JSON.parse(raw);
      if (data?.parameters && applyParametersSnapshot) {
        applyParametersSnapshot(data.parameters);
      }
      if (data?.appState && loadAppState) {
        loadAppState(data.appState);
      }
      setAutosaveMessage('Autosave restored successfully.');
      setAutosaveError('');
    } catch (error) {
      console.warn('[Autosave] Failed to restore autosave', slotKey, error);
      setAutosaveError('Failed to restore autosave. Check console for details.');
    }
  }, [applyParametersSnapshot, loadAppState, refreshAutosaveSlots]);

  const handleClearAutosaves = useCallback(() => {
    if (typeof window === 'undefined' || !window.localStorage) {
      setAutosaveError('Autosave storage is unavailable.');
      return;
    }
    if (!window.confirm('Clear all autosave snapshots? This cannot be undone.')) {
      return;
    }
    try {
      for (let i = 0; i < AUTOSAVE_SLOT_COUNT; i += 1) {
        window.localStorage.removeItem(`${AUTOSAVE_SLOT_PREFIX}${i}`);
      }
      window.localStorage.removeItem(AUTOSAVE_META_KEY);
      setAutosaveSlots([]);
      setAutosaveMessage('Autosaves cleared.');
      setAutosaveError('');
    } catch (error) {
      console.warn('[Autosave] Failed to clear autosaves', error);
      setAutosaveError('Failed to clear autosaves.');
    }
  }, []);

  const handleRefreshAutosaves = useCallback(() => {
    setAutosaveMessage('');
    refreshAutosaveSlots();
  }, [refreshAutosaveSlots]);

  const handleToggleAutosaveRecovery = useCallback(() => {
    setAutosaveMessage('');
    setAutosaveError('');
    setShowAutosaveRecovery((prev) => {
      const next = !prev;
      if (!prev && !next) {
        return next;
      }
      if (!prev && next) {
        refreshAutosaveSlots();
      }
      return next;
    });
  }, [refreshAutosaveSlots]);

  const handleCloseAutosaveRecovery = useCallback(() => {
    setShowAutosaveRecovery(false);
    setAutosaveMessage('');
    setAutosaveError('');
  }, []);

  useEffect(() => {
    if (showAutosaveRecovery) {
      refreshAutosaveSlots();
    }
  }, [showAutosaveRecovery, refreshAutosaveSlots]);

  const autosaveSignalRef = useRef(autosaveToggleToken);
  useEffect(() => {
    if (autosaveToggleToken !== autosaveSignalRef.current) {
      autosaveSignalRef.current = autosaveToggleToken;
      handleToggleAutosaveRecovery();
    }
  }, [autosaveToggleToken, handleToggleAutosaveRecovery]);

  const getExportMeta = useCallback(() => {
    if (typeof window === 'undefined') {
      return {
        version: '2.0',
        canvasWidth: 0,
        canvasHeight: 0,
        exportedAt: new Date().toISOString(),
      };
    }
    const meta = window.__artapp_canvasMeta || {};
    const width = Math.round(Number(meta.width ?? window.innerWidth ?? 0));
    const height = Math.round(Number(meta.height ?? window.innerHeight ?? 0));
    return {
      version: '2.0',
      canvasWidth: width,
      canvasHeight: height,
      exportedAt: new Date().toISOString(),
    };
  }, []);

  const paletteValue = useMemo(() => {
    try {
      const colorsNow = (layers || []).map(l => (Array.isArray(l?.colors) && l.colors[0]) ? l.colors[0].toLowerCase() : '#000000');
      const idx = palettes.findIndex(p => {
        const src = Array.isArray(p) ? p : (p?.colors || []);
        const sampled = sampleColorsEven(src, Math.max(1, layers.length));
        return sampled.length === colorsNow.length && sampled.every((c, i) => (c || '').toLowerCase() === (colorsNow[i] || ''));
      });
      return idx === -1 ? 'custom' : String(idx);
    } catch {
      return 'custom';
    }
  }, [palettes, layers, sampleColorsEven]);

  const targetMode = parameterTargetMode === 'global' ? 'global' : 'individual';

  const handleTargetModeChange = useCallback((event) => {
    if (!setParameterTargetMode) return;
    const raw = typeof event === 'string' ? event : event?.target?.value;
    const normalized = (typeof raw === 'string' && raw.toLowerCase() === 'global') ? 'global' : 'individual';
    try { console.debug('[GlobalControls] Target mode ->', normalized); } catch { /* noop */ }
    setParameterTargetMode(normalized);
  }, [setParameterTargetMode]);

  // Settings panel visibility toggles
  const [showSpeedSettings, setShowSpeedSettings] = useState(false);
  const [showPaletteSettings, setShowPaletteSettings] = useState(false);
  const [showBlendModeSettings, setShowBlendModeSettings] = useState(false);
  const [showOpacitySettings, setShowOpacitySettings] = useState(false);
  const [showLayersSettings, setShowLayersSettings] = useState(false);
  const [showVariationPositionSettings, setShowVariationPositionSettings] = useState(false);
  const [showVariationShapeSettings, setShowVariationShapeSettings] = useState(false);
  const [showVariationAnimSettings, setShowVariationAnimSettings] = useState(false);
  const [showVariationColorSettings, setShowVariationColorSettings] = useState(false);
  const [showVariationScaleSettings, setShowVariationScaleSettings] = useState(false);

  const numericSeed = Number(globalSeed);
  const seedValue = Number.isFinite(numericSeed)
    ? Math.max(GLOBAL_SEED_MIN, Math.min(GLOBAL_SEED_MAX, Math.floor(numericSeed)))
    : GLOBAL_SEED_MIN;

  const updateSeed = useCallback((value) => {
    if (!Number.isFinite(value)) return;
    const clamped = Math.max(GLOBAL_SEED_MIN, Math.min(GLOBAL_SEED_MAX, Math.floor(value)));
    if (clamped === seedValue) return;
    setGlobalSeed(clamped);
  }, [seedValue, setGlobalSeed]);

  const handleSeedSliderChange = useCallback((e) => {
    updateSeed(Number(e.target.value));
  }, [updateSeed]);

  const handleSeedInputChange = useCallback((e) => {
    const val = e.target.value;
    if (val === '') return;
    updateSeed(Number(val));
  }, [updateSeed]);

  // Numeric bounds (min/max/step) for sliders
  const [speedMin, setSpeedMin] = useState(0);
  const [speedMax, setSpeedMax] = useState(5);
  const [speedStep, setSpeedStep] = useState(0.01);

  const [opacityMin, setOpacityMin] = useState(0);
  const [opacityMax, setOpacityMax] = useState(1);
  const [opacityStep, setOpacityStep] = useState(0.01);

  const [layersMin, setLayersMin] = useState(1);
  const [layersMax, setLayersMax] = useState(1000);
  const [layersStep, setLayersStep] = useState(1);

  // Helper to set layer count uniformly from slider or number box
  const setLayerCount = (targetRaw) => {
    let target = Number(targetRaw);
    if (!Number.isFinite(target)) return;
    target = Math.round(target);
    target = Math.max(layersMin, Math.min(layersMax, target));
    setLayers(prev => {
      let next = prev;
      if (target > prev.length) {
        const addCount = target - prev.length;
        const baseVar = {
          shape: (typeof prev?.[0]?.variationShape === 'number') ? prev[0].variationShape : (typeof prev?.[0]?.variation === 'number' ? prev[0].variation : DEFAULT_LAYER.variationShape),
          anim: (typeof prev?.[0]?.variationAnim === 'number') ? prev[0].variationAnim : (typeof prev?.[0]?.variation === 'number' ? prev[0].variation : DEFAULT_LAYER.variationAnim),
          color: (typeof prev?.[0]?.variationColor === 'number') ? prev[0].variationColor : (typeof prev?.[0]?.variation === 'number' ? prev[0].variation : DEFAULT_LAYER.variationColor),
          position: (typeof prev?.[0]?.variationPosition === 'number') ? prev[0].variationPosition : (typeof prev?.[0]?.variation === 'number' ? prev[0].variation : DEFAULT_LAYER.variationPosition),
        };
        const additions = [];
        let prevLayerRef = prev[prev.length - 1] || DEFAULT_LAYER;
        for (let i = 0; i < addCount; i += 1) {
          const randomSeed = generateLayerSeed();
          const nameIndex = prev.length + additions.length + 1;
          const layer = buildVariedLayerFrom(prevLayerRef, nameIndex, baseVar, { randomSeed });
          additions.push(layer);
          prevLayerRef = layer;
        }
        next = [...prev, ...additions];
      } else if (target < prev.length) {
        next = prev.slice(0, target).map((l, i) => ({ ...l, name: `Layer ${i + 1}` }));
        if (target === 1) {
          const [first] = next;
          const reseeded = {
            ...first,
            seed: generateLayerSeed(),
            noiseSeed: generateLayerSeed(),
          };
          next[0] = reseeded;
        }
      }
      return next;
    });
  };

  // Independent ranges for each Variation slider
  const [variationPositionMin, setVariationPositionMin] = useState(0);
  const [variationPositionMax, setVariationPositionMax] = useState(3);
  const [variationPositionStep, setVariationPositionStep] = useState(0.01);
  const [variationShapeMin, setVariationShapeMin] = useState(0);
  const [variationShapeMax, setVariationShapeMax] = useState(3);
  const [variationShapeStep, setVariationShapeStep] = useState(0.01);
  const [variationAnimMin, setVariationAnimMin] = useState(0);
  const [variationAnimMax, setVariationAnimMax] = useState(3);
  const [variationAnimStep, setVariationAnimStep] = useState(0.01);
  const [variationColorMin, setVariationColorMin] = useState(0);
  const [variationColorMax, setVariationColorMax] = useState(3);
  const [variationColorStep, setVariationColorStep] = useState(0.01);
  const [variationScaleMin, setVariationScaleMin] = useState(-3);
  const [variationScaleMax, setVariationScaleMax] = useState(3);
  const [variationScaleStep, setVariationScaleStep] = useState(0.01);

  const applyVariationValue = useCallback((prop, rawValue) => {
    setLayers(prev => {
      if (!Array.isArray(prev) || !prev.length) return prev;

      let anyChange = false;
      const updated = prev.map((layer, idx) => {
        const shouldApply = applyVariationInstantly || idx === 0;
        const nextValue = shouldApply ? rawValue : layer?.[prop];
        if (layer?.[prop] === nextValue) return layer;
        anyChange = true;
        return { ...layer, [prop]: nextValue };
      });

      if (!anyChange) return prev;
      if (!applyVariationInstantly || updated.length <= 1) {
        return updated;
      }

      const firstLayer = updated[0];
      const baseVar = {
        shape: Number(firstLayer?.variationShape ?? DEFAULT_LAYER.variationShape),
        anim: Number(firstLayer?.variationAnim ?? DEFAULT_LAYER.variationAnim),
        color: Number(firstLayer?.variationColor ?? DEFAULT_LAYER.variationColor),
        position: Number(firstLayer?.variationPosition ?? DEFAULT_LAYER.variationPosition),
        scale: Number(firstLayer?.variationScale ?? DEFAULT_LAYER.variationScale ?? 0),
      };

      const rebuilt = [firstLayer];
      let prevLayer = firstLayer;
      const categoryMap = {
        variationPosition: ['position'],
        variationShape: ['shape'],
        variationAnim: ['anim'],
        variationColor: ['color'],
        variationScale: ['scale'],
      };
      const affectCategories = categoryMap[prop] || null;
      for (let i = 1; i < updated.length; i += 1) {
        const original = updated[i];
        const varied = buildVariedLayerFrom(prevLayer, i + 1, baseVar, {
          affectCategories,
          preserveSeeds: true,
        }) || original;
        const merged = {
          ...original,
          ...varied,
          id: original.id ?? varied.id,
          name: original.name || varied.name,
        };
        const categorySet = affectCategories ? new Set(affectCategories) : null;
        if (categorySet) {
          if (!categorySet.has('color')) {
            if (Array.isArray(original.colors)) {
              merged.colors = [...original.colors];
            } else {
              merged.colors = original.colors;
            }
            if (typeof original.numColors !== 'undefined') {
              merged.numColors = original.numColors;
            }
          }
          if (!categorySet.has('position') && !categorySet.has('scale')) {
            if (typeof original.xOffset !== 'undefined') merged.xOffset = original.xOffset;
            if (typeof original.yOffset !== 'undefined') merged.yOffset = original.yOffset;
            if (original.position && typeof original.position === 'object') {
              merged.position = { ...original.position };
            }
          }
          if (!categorySet.has('shape')) {
            const shapeFields = [
              'numSides',
              'curviness',
              'wobble',
              'noiseAmount',
              'width',
              'height',
              'radiusFactor',
              'radiusFactorX',
              'radiusFactorY',
              'nodes',
              'syncNodesToNumSides',
              'viewBoxMapped',
            ];
            shapeFields.forEach((field) => {
              if (field in original) {
                merged[field] = Array.isArray(original[field])
                  ? [...original[field]]
                  : (original[field] && typeof original[field] === 'object'
                    ? { ...original[field] }
                    : original[field]);
              }
            });
          }
          if (!categorySet.has('anim')) {
            const animFields = [
              'movementStyle',
              'movementSpeed',
              'movementAngle',
              'scaleSpeed',
              'scaleMin',
              'scaleMax',
              'imageBlur',
              'imageBrightness',
              'imageContrast',
              'imageHue',
              'imageSaturation',
              'imageDistortion',
              'vx',
              'vy',
              'orbitCenterX',
              'orbitCenterY',
              'orbitAngle',
              'orbitRadiusX',
              'orbitRadiusY',
            ];
            animFields.forEach((field) => {
              if (field in original) {
                merged[field] = original[field];
              }
            });
          }
          if (!categorySet.has('scale')) {
            if (typeof original.variationScale !== 'undefined') {
              merged.variationScale = original.variationScale;
            }
            if (original.position && typeof original.position === 'object') {
              const originalScale = original.position.scale;
              const originalScaleDirection = original.position.scaleDirection;
              merged.position = {
                ...(merged.position || {}),
                ...(original.position || {}),
                scale: originalScale,
                scaleDirection: originalScaleDirection,
              };
            }
          }
        }
        rebuilt.push(merged);
        prevLayer = merged;
      }

      return rebuilt;
    });
  }, [applyVariationInstantly, buildVariedLayerFrom, DEFAULT_LAYER.variationAnim, DEFAULT_LAYER.variationColor, DEFAULT_LAYER.variationPosition, DEFAULT_LAYER.variationShape, setLayers]);

  // Presets: helpers
  const TEMP_PRESET_PREFIX = 'preset-slot-';

  const recallPreset = useCallback(async (slotId) => {
    const slot = getPresetSlot ? getPresetSlot(slotId) : null;
    if (!slot) return;
    try {
      if (!slot.payload) return;
      const preservedMorph = {
        enabled: !!morphEnabled,
        route: Array.isArray(morphRoute) ? [...morphRoute] : morphRoute,
        duration: morphDurationPerLeg,
        easing: morphEasing,
        loopMode: morphLoopMode,
        mode: morphMode,
      };
      const key = `${TEMP_PRESET_PREFIX}${slotId}`;
      const exportMeta = slot.payload?.exportMeta || getExportMeta();
      const saveObj = { parameters: slot.payload.parameters || [], appState: slot.payload.appState || null, savedAt: slot.payload.savedAt || new Date().toISOString(), version: '2.0', exportMeta };
      localStorage.setItem(`artapp-config-${key}`, JSON.stringify(saveObj));
      if (typeof loadFullConfiguration === 'function') {
        const res = await loadFullConfiguration(key);
        if (res && res.appState && typeof loadAppState === 'function') {
          const {
            morphEnabled: _me,
            morphRoute: _mr,
            morphDurationPerLeg: _md,
            morphEasing: _meas,
            morphLoopMode: _ml,
            morphMode: _mm,
            ...rest
          } = res.appState || {};
          loadAppState(rest);
          if (res.exportMeta && typeof window !== 'undefined') {
            window.__artapp_lastImportMeta = res.exportMeta;
          }
          setMorphEnabled?.(preservedMorph.enabled);
          const routeToRestore = Array.isArray(preservedMorph.route)
            ? preservedMorph.route
            : (Array.isArray(morphRoute) ? morphRoute : []);
          setMorphRoute?.(routeToRestore);
          if (typeof preservedMorph.duration !== 'undefined') {
            setMorphDurationPerLeg?.(preservedMorph.duration);
          }
          if (typeof preservedMorph.easing !== 'undefined') {
            setMorphEasing?.(preservedMorph.easing);
          }
          if (typeof preservedMorph.loopMode !== 'undefined') {
            setMorphLoopMode?.(preservedMorph.loopMode);
          }
          if (typeof preservedMorph.mode !== 'undefined') {
            setMorphMode?.(preservedMorph.mode);
          }
        }
      }
    } catch (e) {
      console.warn('[Presets] Failed to recall preset', slotId, e);
    }
  }, [
    getExportMeta,
    getPresetSlot,
    loadFullConfiguration,
    loadAppState,
    morphRoute,
    morphEnabled,
    morphDurationPerLeg,
    morphEasing,
    morphLoopMode,
    morphMode,
    setMorphEnabled,
    setMorphRoute,
    setMorphDurationPerLeg,
    setMorphEasing,
    setMorphLoopMode,
    setMorphMode,
  ]);

  // MIDI: learnable preset recall (maps 0..1 to buckets 1..8)
  useEffect(() => {
    if (!registerParamHandler) return;
    const unsub = registerParamHandler('global:presetRecall', ({ value01 }) => {
      const bucket = Math.max(1, Math.min(8, Math.floor(value01 * 8) + 1));
      recallPreset(bucket);
    });
    return () => { if (typeof unsub === 'function') unsub(); };
  }, [registerParamHandler, recallPreset]);

  // Morph UI controls
  const [morphStatus, setMorphStatus] = useState(null);
  const [morphError, setMorphError] = useState('');
  const [routeDraft, setRouteDraft] = useState(Array.isArray(morphRoute) ? morphRoute.join(',') : '');
  useEffect(() => {
    setRouteDraft(Array.isArray(morphRoute) ? morphRoute.join(',') : '');
  }, [morphRoute]);
  const applyRouteFromInput = useCallback(() => {
    const vals = (routeDraft || '')
      .split(',')
      .map(s => parseInt(s.trim(), 10))
      .filter(n => Number.isFinite(n) && n >= 1 && n <= 8);
    setMorphRoute && setMorphRoute(vals);
  }, [routeDraft, setMorphRoute]);
  const _renderMorphControls = () => {
    const route = Array.isArray(morphRoute) ? morphRoute : [];
    const missing = (route || []).filter(id => {
      const s = getPresetSlot ? getPresetSlot(id) : null;
      return !(s && s.payload && s.payload.appState);
    });
    return (
      <div className="control-card" style={{ marginTop: '0.5rem' }}>
        <div className="control-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontWeight: 600 }}>Preset Morph</span>
            <label className="compact-label" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <input
                type="checkbox"
                checked={!!morphEnabled}
                onChange={() => {
                  const next = !morphEnabled;
                  console.debug('[Morph] set enabled ->', next);
                  if (!next) {
                    setMorphEnabled && setMorphEnabled(false);
                    setMorphError('');
                    return;
                  }
                  let route = Array.isArray(morphRoute) ? morphRoute : [];
                  if (route.length < 2) {
                    const savedIds = (presetSlots || []).filter(s => s && s.payload).map(s => s.id);
                    if (savedIds.length >= 2 && setMorphRoute) {
                      route = [savedIds[0], savedIds[1]];
                      setMorphRoute(route);
                      setRouteDraft(route.join(','));
                    }
                  }
                  const missing = (route || []).filter(id => {
                    const s = getPresetSlot ? getPresetSlot(id) : null;
                    return !(s && s.payload && s.payload.appState);
                  });
                  if (missing.length > 0) {
                    console.warn('[Morph] Cannot enable; missing saved presets:', missing);
                    setMorphError(`Cannot enable: save presets ${missing.join(', ')} first (Shift+Click on circles).`);
                    // Do NOT enable
                    return;
                  }
                  setMorphEnabled && setMorphEnabled(true);
                  setMorphError('');
                }}
              />
              Enable
              <span style={{
                padding: '0.1rem 0.4rem',
                borderRadius: 999,
                background: morphEnabled ? 'rgba(76,175,80,0.25)' : 'rgba(255,255,255,0.08)',
                border: morphEnabled ? '1px solid #4caf50' : '1px solid rgba(255,255,255,0.15)',
                fontSize: '0.75rem',
                color: morphEnabled ? '#a5d6a7' : 'rgba(255,255,255,0.7)'
              }}>{morphEnabled ? 'On' : 'Off'}</span>
            </label>
          </div>
        </div>
        {missing.length > 0 && (
          <div style={{ marginTop: '0.4rem', color: '#ff9e80', fontSize: '0.85rem' }}>
            Save these presets first (Shift+Click on their circles): {missing.join(', ')}
          </div>
        )}
        {morphError && (
          <div style={{ marginTop: '0.35rem', color: '#ef5350', fontSize: '0.85rem' }}>{morphError}</div>
        )}
        <div className="compact-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.5rem' }}>
          <label className="compact-label" title="Route of presets to morph through, comma-separated (e.g., 1,3,5)">
            Route
            <input
              type="text"
              className="compact-input"
              value={routeDraft}
              onChange={(e) => setRouteDraft(e.target.value)}
              onBlur={applyRouteFromInput}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyRouteFromInput(); } }}
            />
          </label>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem' }}>
            <button type="button" className="btn-compact-secondary" onClick={applyRouteFromInput} title="Apply route">Apply</button>
          </div>
          <label className="compact-label" title="Seconds per leg">
            Duration
            <BufferedNumberInput
              value={Number.isFinite(morphDurationPerLeg) ? morphDurationPerLeg : 5}
              min={0.2}
              max={120}
              step={0.1}
              onCommit={(next) => setMorphDurationPerLeg?.(next)}
              className="compact-input"
              inputMode="decimal"
            />
          </label>
          <label className="compact-label" title="Easing">
            Easing
            <select className="compact-select" value={morphEasing || 'linear'} onChange={(e) => setMorphEasing && setMorphEasing(e.target.value)}>
              <option value="linear">linear</option>
            </select>
          </label>
          <label className="compact-label" title="Loop mode">
            Mode
            <select className="compact-select" value={morphLoopMode || 'loop'} onChange={(e) => setMorphLoopMode && setMorphLoopMode(e.target.value)}>
              <option value="loop">loop</option>
              <option value="pingpong">pingpong</option>
            </select>
          </label>
          <label className="compact-label" title="Morph algorithm">
            Morph
            <select className="compact-select" value={morphMode || 'tween'} onChange={(e) => setMorphMode && setMorphMode(e.target.value)}>
              <option value="tween">tween</option>
              <option value="fade">fade</option>
            </select>
          </label>
        </div>
        {morphEnabled && morphStatus && (
          <div style={{ marginTop: '0.35rem', fontSize: '0.85rem', opacity: 0.8 }}>
            Morph: {morphStatus.from} → {morphStatus.to} ({Math.round(morphStatus.t * 100)}%)
          </div>
        )}
      </div>
    );
  };

  // Refs to stabilize morph engine
  const rafRef = useRef(0);
  const routeRef = useRef([]);
  const durRef = useRef(5);
  const easingRef = useRef('linear');
  const loopModeRef = useRef('loop');
  const getPresetSlotRef = useRef(getPresetSlot);
  const loadAppStateRef = useRef(loadAppState);
  const fadePrepRef = useRef({ key: null, lenA: 0, lenB: 0, baseA: [], baseB: [] });
  const tweenPrepRef = useRef({ key: null, baseA: [], baseB: [] });

  // Sync current settings into refs
  useEffect(() => { routeRef.current = Array.isArray(morphRoute) ? [...morphRoute] : []; }, [morphRoute]);
  useEffect(() => { durRef.current = Number(morphDurationPerLeg || 5); }, [morphDurationPerLeg]);
  useEffect(() => { easingRef.current = morphEasing || 'linear'; }, [morphEasing]);
  useEffect(() => { loopModeRef.current = morphLoopMode || 'loop'; }, [morphLoopMode]);
  const modeRef = useRef('tween');
  useEffect(() => { modeRef.current = morphMode || 'tween'; }, [morphMode]);
  useEffect(() => { getPresetSlotRef.current = getPresetSlot; }, [getPresetSlot]);
  useEffect(() => { loadAppStateRef.current = loadAppState; }, [loadAppState]);

  // Morph engine: interpolate between consecutive presets' appState
  useEffect(() => {
    // Stop any existing loop
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (!morphEnabled) return;
    const route = routeRef.current;
    if (!Array.isArray(route) || route.length < 2) return;

    let legIndex = 0;
    let forward = true;
    let startTime = performance.now();

    const lerp = (a, b, t) => a + (b - a) * t;
    const sanitizeHex = (val) => (typeof val === 'string' && /^#([0-9a-fA-F]{6})$/.test(val) ? val : '#000000');
    const lerpColor = (ca, cb, t) => {
      const ra = hexToRgb(sanitizeHex(ca));
      const rb = hexToRgb(sanitizeHex(cb));
      return rgbToHex({ r: Math.round(lerp(ra.r, rb.r, t)), g: Math.round(lerp(ra.g, rb.g, t)), b: Math.round(lerp(ra.b, rb.b, t)) });
    };
    const stripMorphFields = (state) => {
      if (!state || typeof state !== 'object') return state;
      const { morphEnabled: _me, morphRoute: _mr, morphDurationPerLeg: _md, morphEasing: _meas, morphLoopMode: _ml, ...rest } = state;
      return rest;
    };

    // Do not hard-load the starting preset; keep live animation running.
    // We'll blend visuals in-place each frame instead.
    setMorphStatus && setMorphStatus({ from: route[0], to: route[1], t: 0 });

    const step = () => {
      const now = performance.now();
      const durMs = Math.max(200, Number(durRef.current || 5) * 1000);
      const tRaw = Math.min(1, (now - startTime) / durMs);
      let t = tRaw;
      if (easingRef.current === 'linear') {
        // no-op
      }

      const routeNow = routeRef.current;
      const fromId = routeNow[legIndex];
      const toId = routeNow[(legIndex + 1) % routeNow.length];
      const legKey = `${fromId}->${toId}`;
      const fromSlot = getPresetSlotRef.current ? getPresetSlotRef.current(fromId) : null;
      const toSlot = getPresetSlotRef.current ? getPresetSlotRef.current(toId) : null;
      const fromState = fromSlot?.payload?.appState;
      const toState = toSlot?.payload?.appState;
      setMorphStatus && setMorphStatus({ from: fromId, to: toId, t });
      if (fromState && toState) {
        try {
          const a = stripMorphFields(fromState);
          const b = stripMorphFields(toState);
          if (modeRef.current === 'fade') {
            // Prepare once per leg: construct A+B layer stack with baseline opacities
            if (fadePrepRef.current.key !== legKey) {
              const layersA = Array.isArray(a.layers) ? a.layers : [];
              const layersB = Array.isArray(b.layers) ? b.layers : [];
              fadePrepRef.current = {
                key: legKey,
                lenA: layersA.length,
                lenB: layersB.length,
                baseA: layersA.map(l => Number(l?.opacity ?? 1)),
                baseB: layersB.map(l => Number(l?.opacity ?? 1)),
              };
              // Initialize combined stack: A visible, B hidden
              setLayers(() => [
                ...layersA.map(l => ({ ...l, opacity: Number(l.opacity ?? 1) })),
                ...layersB.map(l => ({ ...l, opacity: 0 })),
              ]);
            }
            // Blend background and opacities in place using baseline values (no compounding)
            setBackgroundColor && setBackgroundColor(lerpColor(a.backgroundColor || '#000000', b.backgroundColor || '#000000', t));
            const { lenA, baseA, baseB } = fadePrepRef.current;
            setLayers(prev => prev.map((l, i) => {
              let nextOpacity = Number(l.opacity ?? 1);
              if (i < lenA) {
                const oa0 = Number(baseA[i] ?? 0);
                nextOpacity = Math.max(0, Math.min(1, oa0 * (1 - t)));
              } else {
                const j = i - lenA;
                const ob0 = Number(baseB[j] ?? 0);
                nextOpacity = Math.max(0, Math.min(1, ob0 * t));
              }
              return nextOpacity !== l.opacity ? { ...l, opacity: nextOpacity } : l;
            }));
          } else {
            // Tween mode (default): interpolate from cached leg endpoints to avoid accumulated drift
            if (tweenPrepRef.current.key !== legKey) {
              tweenPrepRef.current = {
                key: legKey,
                baseA: Array.isArray(a.layers) ? a.layers.map(l => ({ ...l })) : [],
                baseB: Array.isArray(b.layers) ? b.layers.map(l => ({ ...l })) : [],
              };
            }
            const baseA = tweenPrepRef.current.baseA || [];
            const baseB = tweenPrepRef.current.baseB || [];
            setBackgroundColor && setBackgroundColor(lerpColor(a.backgroundColor || '#000000', b.backgroundColor || '#000000', t));
            const maxLen = Math.max(baseA.length, baseB.length, 1);
            setLayers(() => {
              const out = [];
              for (let i = 0; i < maxLen; i++) {
                const la = baseA[i] || baseA[Math.max(0, baseA.length - 1)] || {};
                const lb = baseB[i] || baseB[Math.max(0, baseB.length - 1)] || {};
                const pa = la.position || { x: 0.5, y: 0.5, scale: 1 };
                const pb = lb.position || { x: 0.5, y: 0.5, scale: 1 };
                const colorsA = Array.isArray(la.colors) ? la.colors : [];
                const colorsB = Array.isArray(lb.colors) ? lb.colors : [];
                const colorCount = Math.max(colorsA.length, colorsB.length);
                const blendedColors = colorCount > 0
                  ? Array.from({ length: colorCount }, (_, idx) => {
                      const ca = colorsA[idx] || colorsA[Math.max(0, colorsA.length - 1)] || '#000000';
                      const cb = colorsB[idx] || colorsB[Math.max(0, colorsB.length - 1)] || '#000000';
                      return lerpColor(ca, cb, t);
                    })
                  : undefined;
                out.push({
                  ...lb,
                  opacity: lerp(Number(la.opacity || 1), Number(lb.opacity || 1), t),
                  rotation: lerp(Number(la.rotation || 0), Number(lb.rotation || 0), t),
                  radiusFactor: lerp(Number(la.radiusFactor || 0.125), Number(lb.radiusFactor || 0.125), t),
                  movementSpeed: lerp(Number(la.movementSpeed || 1), Number(lb.movementSpeed || 1), t),
                  colors: blendedColors || lb.colors,
                  numColors: blendedColors ? blendedColors.length : lb.numColors,
                  position: {
                    x: lerp(Number(pa.x || 0.5), Number(pb.x || 0.5), t),
                    y: lerp(Number(pa.y || 0.5), Number(pb.y || 0.5), t),
                    scale: lerp(Number(pa.scale || 1), Number(pb.scale || 1), t),
                    vx: 0,
                    vy: 0,
                    scaleDirection: 1,
                  },
                });
              }
              return out;
            });
          }
        } catch { /* noop */ }
      }

      if (tRaw >= 1) {
        // Snap to the exact target of the just-finished leg (avoids 1-frame lag and visible pauses)
        try {
          const snapSlot = getPresetSlotRef.current ? getPresetSlotRef.current(toId) : null;
          const snapState = snapSlot?.payload?.appState;
          const b2 = stripMorphFields(snapState || {});
          const bLayers2 = Array.isArray(b2.layers) ? b2.layers : [];
          setLayers(() => bLayers2.map(l => ({ ...l })));
          setBackgroundColor && setBackgroundColor(b2.backgroundColor || '#000000');
        } catch { /* noop */ }
        if (loopModeRef.current === 'pingpong') {
          if (forward) {
            if (legIndex + 1 >= routeNow.length - 1) {
              forward = false;
            } else {
              legIndex += 1;
            }
          } else {
            if (legIndex <= 0) {
              forward = true;
            } else {
              legIndex -= 1;
            }
          }
        } else {
          legIndex = (legIndex + 1) % routeNow.length;
        }
        startTime = now;
        // On leg boundary for fade mode: snap to target preset's layer list
        if (modeRef.current === 'fade') {
          const routeNow2 = routeRef.current;
          const toId2 = routeNow2[(legIndex) % routeNow2.length];
          const toSlot2 = getPresetSlotRef.current ? getPresetSlotRef.current(toId2) : null;
          const toState2 = toSlot2?.payload?.appState;
          const b2 = stripMorphFields(toState2 || {});
          const bLayers2 = Array.isArray(b2.layers) ? b2.layers : [];
          setLayers(() => bLayers2.map(l => ({ ...l })));
        }
        // Reset prep for next leg
        fadePrepRef.current = { key: null, lenA: 0, lenB: 0, baseA: [], baseB: [] };
        tweenPrepRef.current = { key: null, baseA: [], baseB: [] };
      }
      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [morphEnabled, setBackgroundColor, setLayers]);

  return (
    <div className="control-card">
      <h3 style={{ marginTop: 0, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <span>Global</span>
        <button className="icon-btn sm" onClick={handleRandomizeAll} title="Randomise everything" aria-label="Randomise everything">🎲</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flex: '1 1 220px', minWidth: 0 }}>
          <span className="compact-label" style={{ whiteSpace: 'nowrap' }}>Seed</span>
          <input
            className="compact-range"
            type="range"
            min={GLOBAL_SEED_MIN}
            max={GLOBAL_SEED_MAX}
            step={1}
            value={seedValue}
            onChange={handleSeedSliderChange}
            title="Adjust global seed"
            aria-label="Adjust global seed"
            style={{ flex: '1 1 auto' }}
          />
          <BufferedNumberInput
            value={seedValue}
            min={GLOBAL_SEED_MIN}
            max={GLOBAL_SEED_MAX}
            step={1}
            onCommit={updateSeed}
            title="Global seed value"
            className="compact-number"
            style={{ width: 80 }}
            inputMode="numeric"
          />
        </div>
        {(
          <>
            <button
              className="btn-compact-secondary"
              onClick={(e) => { e.stopPropagation(); beginLearn && beginLearn('randomizeAll'); }}
              disabled={!midiSupported}
              title="MIDI Learn: Randomize All"
            >
              Learn
            </button>
            <button
              className="btn-compact-secondary"
              onClick={(e) => { e.stopPropagation(); clearMapping && clearMapping('randomizeAll'); }}
              disabled={!midiSupported || !midiMappings?.randomizeAll}
              title="Clear MIDI for Randomize All"
            >
              Clear
            </button>
            {midiSupported && (
              <span className="compact-label" style={{ opacity: 0.8 }}>
                {midiMappings?.randomizeAll ? (mappingLabel ? mappingLabel(midiMappings.randomizeAll) : 'Mapped') : 'Not mapped'}
                {learnParamId === 'randomizeAll' && <span style={{ marginLeft: '0.35rem', color: '#4fc3f7' }}>Listening…</span>}
              </span>
            )}
          </>
        )}
      </h3>
      {/* Presets & Morph Controls (optional) */}
      {!hidePresets && (
        <PresetControls
          setLayers={setLayers}
          setBackgroundColor={setBackgroundColor}
          setGlobalSpeedMultiplier={setGlobalSpeedMultiplier}
        />
      )}
      {showAutosaveRecovery && (
        <AutosaveRecovery
          slots={autosaveSlots}
          onRestore={handleRestoreAutosave}
          onClearAll={handleClearAutosaves}
          onRefresh={handleRefreshAutosaves}
          onClose={handleCloseAutosaveRecovery}
          message={autosaveMessage}
          error={autosaveError}
        />
      )}
      <div className="control-group" style={{ margin: 0 }}>
        <div className="compact-field" style={{ marginBottom: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
            <label className="compact-label" htmlFor="global-target-mode">Target</label>
            <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>
              {targetMode === 'global' ? 'Apply changes to every layer' : 'Edit only the active layer/selection'}
            </span>
          </div>
          <select
            id="global-target-mode"
            className="compact-select"
            value={targetMode}
            onChange={handleTargetModeChange}
          >
            <option value="individual">Individual</option>
            <option value="global">Global</option>
          </select>
        </div>
        {/* Background Color with inline include toggle */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.25rem', gap: '0.5rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: '1 1 auto', minWidth: 0, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600 }}>Background</span>
            <BackgroundColorPicker compact inline hideLabel color={backgroundColor} onChange={setBackgroundColor} />
            <label className="compact-label" title="Enable background image">
              <input
                type="checkbox"
                checked={!!backgroundImage?.enabled}
                onChange={(e) => setBackgroundImage(prev => ({ ...(prev || {}), enabled: !!e.target.checked }))}
              />
              Img
            </label>
            {backgroundImage?.enabled && (
              <>
                <input
                  type="file"
                  accept="image/png, image/jpeg"
                  title="Set background image"
                  aria-label="Set background image"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      const src = String(ev.target?.result || '');
                      setBackgroundImage(prev => ({ ...(prev || {}), src, enabled: true }));
                    };
                    reader.readAsDataURL(file);
                    e.target.value = '';
                  }}
                  style={{ width: 24 }}
                />
                <label className="compact-label" title="Background image opacity">
                  Opac
                  <input
                    type="range"
                    className="compact-range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={Math.max(0, Math.min(1, Number(backgroundImage?.opacity ?? 1)))}
                    onChange={(e) => setBackgroundImage(prev => ({ ...(prev || {}), opacity: parseFloat(e.target.value) }))}
                    style={{ width: 80 }}
                  />
                </label>
                <select
                  className="compact-select"
                  value={backgroundImage?.fit || 'cover'}
                  onChange={(e) => setBackgroundImage(prev => ({ ...(prev || {}), fit: e.target.value }))}
                  title="Background image fit"
                  aria-label="Background image fit"
                >
                  <option value="cover">cover</option>
                  <option value="contain">contain</option>
                  <option value="stretch">stretch</option>
                  <option value="center">center</option>
                </select>
                <button
                  type="button"
                  className="btn-compact-secondary"
                  title="Clear background image"
                  onClick={() => setBackgroundImage({ src: null, enabled: false, opacity: 1, fit: 'cover' })}
                >
                  Clear
                </button>
              </>
            )}
          </div>
          <label className="compact-label" title="Include Background Color in Randomize All" style={{ marginLeft: 'auto' }}>
            <input type="checkbox" checked={Boolean(getIsRnd('backgroundColor'))} onChange={(e) => setIsRnd('backgroundColor', Boolean(e.target.checked))} />
            Include
          </label>
        </div>
        {/* No settings panel for Background (non-numeric) */}

        <div className="global-compact-row">
          <label className="compact-label">
            <input type="checkbox" checked={isFrozen} onChange={(e) => setIsFrozen(e.target.checked)} /> Freeze
          </label>
          <label className="compact-label" title="Continue palette colour fading while frozen">
            <input type="checkbox" checked={!!colorFadeWhileFrozen} onChange={(e) => setColorFadeWhileFrozen(!!e.target.checked)} /> Fade while frozen
          </label>
          <label className="compact-label" title="Ignore Z movement (disable scaling animation)">
            <input type="checkbox" checked={!!zIgnore} onChange={(e) => setZIgnore(!!e.target.checked)} /> Z-Ignore
          </label>
          <label className="compact-label">
            <input type="checkbox" checked={classicMode} onChange={(e) => setClassicMode(e.target.checked)} /> Classic Mode
          </label>

          <div className="compact-field">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="compact-label">Global Speed: {globalSpeedMultiplier.toFixed(2)}</span>
              <button
                type="button"
                className="icon-btn sm"
                title="Global Speed settings"
                aria-label="Global Speed settings"
                onClick={(e) => { e.stopPropagation(); setShowSpeedSettings(s => !s); }}
              >⚙</button>
              <label className="compact-label" title="Include Global Speed in Randomize All">
                <input type="checkbox" checked={!!getIsRnd('globalSpeedMultiplier')} onChange={(e) => setIsRnd('globalSpeedMultiplier', e.target.checked)} /> Include
              </label>
            </div>
            <input className="compact-range" type="range" min={speedMin} max={speedMax} step={speedStep} value={globalSpeedMultiplier} onChange={(e) => setGlobalSpeedMultiplier(parseFloat(e.target.value))} />
            {showSpeedSettings && (
              <div className="dc-settings" style={{ marginTop: '0.25rem', padding: '0.5rem', borderRadius: 6, background: 'rgba(255,255,255,0.05)' }}>
                <div className="compact-row" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                  <span className="compact-label" style={{ opacity: 0.8 }}>MIDI: {midiSupported ? (midiMappings?.globalSpeedMultiplier ? (mappingLabel ? mappingLabel(midiMappings.globalSpeedMultiplier) : 'Mapped') : 'Not mapped') : 'Not supported'}</span>
                  {learnParamId === 'globalSpeedMultiplier' && midiSupported && <span style={{ color: '#4fc3f7' }}>Listening…</span>}
                  <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); beginLearn && beginLearn('globalSpeedMultiplier'); }} disabled={!midiSupported}>Learn</button>
                  <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); clearMapping && clearMapping('globalSpeedMultiplier'); }} disabled={!midiSupported || !midiMappings?.globalSpeedMultiplier}>Clear</button>
                </div>
                <AudioControlRow paramId="globalSpeedMultiplier" />
                <BPMControlRow paramId="globalSpeedMultiplier" />
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 5rem auto 5rem auto 5rem', gap: '0.4rem', alignItems: 'center', marginTop: '0.5rem' }}>
                  <label className="compact-label">Min</label>
                  <BufferedNumberInput
                    value={speedMin}
                    step={0.01}
                    min={0}
                    onCommit={setSpeedMin}
                    className="compact-number"
                    style={{ width: '5rem' }}
                  />
                  <label className="compact-label">Max</label>
                  <BufferedNumberInput
                    value={speedMax}
                    step={0.01}
                    min={0}
                    onCommit={setSpeedMax}
                    className="compact-number"
                    style={{ width: '5rem' }}
                  />
                  <label className="compact-label">Step</label>
                  <BufferedNumberInput
                    value={speedStep}
                    step={0.001}
                    min={0.001}
                    onCommit={(next) => setSpeedStep(next || 0.01)}
                    className="compact-number"
                    style={{ width: '5rem' }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="compact-field">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label className="compact-label">Palette</label>
              <button
                type="button"
                className="icon-btn sm"
                title="Palette settings"
                aria-label="Palette settings"
                onClick={(e) => { e.stopPropagation(); setShowPaletteSettings(s => !s); }}
              >⚙</button>
              <label className="compact-label" title="Allow Randomize All to change the palette">
                <input type="checkbox" checked={!!getIsRnd('globalPaletteIndex')} onChange={(e) => setIsRnd('globalPaletteIndex', e.target.checked)} /> Include
              </label>
            </div>
            <select
              className="compact-select"
              value={paletteValue}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'custom') return;
                const idx = parseInt(val, 10);
                if (!Number.isFinite(idx) || !palettes[idx]) return;
                const pick = palettes[idx];
                const src = Array.isArray(pick) ? pick : (pick?.colors || []);
                const nextColors = sampleColorsEven(src, Math.max(1, layers.length));
                assignOneColorPerLayer(nextColors);
              }}
            >
              <option value="custom">Custom</option>
              {palettes.map((p, i) => (
                <option key={i} value={i}>{p.name || `Palette ${i+1}`}</option>
              ))}
            </select>
            {showPaletteSettings && (
              <div className="dc-settings" style={{ marginTop: '0.25rem', padding: '0.5rem', borderRadius: 6, background: 'rgba(255,255,255,0.05)' }}>
                <div className="compact-row" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                  <span className="compact-label" style={{ opacity: 0.8 }}>MIDI: {midiSupported ? (midiMappings?.globalPaletteIndex ? (mappingLabel ? mappingLabel(midiMappings.globalPaletteIndex) : 'Mapped') : 'Not mapped') : 'Not supported'}</span>
                  {learnParamId === 'globalPaletteIndex' && midiSupported && <span style={{ color: '#4fc3f7' }}>Listening…</span>}
                  <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); beginLearn && beginLearn('globalPaletteIndex'); }} disabled={!midiSupported} title="MIDI Learn: Palette Preset (applies to selected layer)">Learn</button>
                  <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); clearMapping && clearMapping('globalPaletteIndex'); }} disabled={!midiSupported || !midiMappings?.globalPaletteIndex} title="Clear MIDI for Palette Preset">Clear</button>
                </div>
                <AudioControlRow paramId="globalPaletteIndex" />
                <BPMControlRow paramId="globalPaletteIndex" />
              </div>
            )}
          </div>

          <div className="compact-field">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label className="compact-label">Style</label>
              <button
                type="button"
                className="icon-btn sm"
                title="Style settings"
                aria-label="Style settings"
                onClick={(e) => { e.stopPropagation(); setShowBlendModeSettings(s => !s); }}
              >⚙</button>
              <label className="compact-label" title="Include Style in Randomize All">
                <input type="checkbox" checked={!!getIsRnd('globalBlendMode')} onChange={(e) => setIsRnd('globalBlendMode', e.target.checked)} /> Include
              </label>
            </div>
            <select className="compact-select" value={globalBlendMode} onChange={(e) => setGlobalBlendMode(e.target.value)}>
              {blendModes.map(m => (<option key={m} value={m}>{m}</option>))}
            </select>
            {showBlendModeSettings && (
              <div className="dc-settings" style={{ marginTop: '0.25rem', padding: '0.5rem', borderRadius: 6, background: 'rgba(255,255,255,0.05)' }}>
                <div className="compact-row" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                  <span className="compact-label" style={{ opacity: 0.8 }}>MIDI: {midiSupported ? (midiMappings?.globalBlendMode ? (mappingLabel ? mappingLabel(midiMappings.globalBlendMode) : 'Mapped') : 'Not mapped') : 'Not supported'}</span>
                  {learnParamId === 'globalBlendMode' && midiSupported && <span style={{ color: '#4fc3f7' }}>Listening…</span>}
                  <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); beginLearn && beginLearn('globalBlendMode'); }} disabled={!midiSupported}>Learn</button>
                  <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); clearMapping && clearMapping('globalBlendMode'); }} disabled={!midiSupported || !midiMappings?.globalBlendMode}>Clear</button>
                </div>
                <AudioControlRow paramId="globalBlendMode" />
                <BPMControlRow paramId="globalBlendMode" />
              </div>
            )}
          </div>

          <div className="compact-field">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="compact-label">MIDI Input</span>
            </div>
            {!midiSupported ? (
              <div style={{ opacity: 0.7 }}>No Web MIDI</div>
            ) : (
              <select className="compact-select" value={midiInputId || ''} onChange={(e) => setMidiInputId(e.target.value)}>
                <option value="">None</option>
                {(midiInputs || []).map(inp => (<option key={inp.id} value={inp.id}>{inp.name || inp.id}</option>))}
              </select>
            )}
            {/* No settings panel for MIDI Input (non-numeric) */}
          </div>

          {/* Audio Reactive Section */}
          <AudioReactiveSection />

          {/* BPM/Beat Sync Section */}
          <BPMSection />

          <div className="compact-field">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="compact-label">Global Opacity</span>
              <button
                type="button"
                className="icon-btn sm"
                title="Global Opacity settings"
                aria-label="Global Opacity settings"
                onClick={(e) => { e.stopPropagation(); setShowOpacitySettings(s => !s); }}
              >⚙</button>
              <label className="compact-label" title="Include Opacity in Randomize All">
                <input type="checkbox" checked={!!getIsRnd('globalOpacity')} onChange={(e) => setIsRnd('globalOpacity', e.target.checked)} /> Include
              </label>
            </div>
            <input
              className="compact-range"
              type="range"
              min={opacityMin}
              max={opacityMax}
              step={opacityStep}
              value={Number.isFinite(layers?.[0]?.opacity) ? layers[0].opacity : 1}
              onChange={(e) => {
                const v = Math.max(0, Math.min(1, parseFloat(e.target.value)));
                setLayers(prev => prev.map(l => ({ ...l, opacity: v })));
              }}
            />
            {showOpacitySettings && (
              <div className="dc-settings" style={{ marginTop: '0.25rem', padding: '0.5rem', borderRadius: 6, background: 'rgba(255,255,255,0.05)' }}>
                <div className="compact-row" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                  <span className="compact-label" style={{ opacity: 0.8 }}>MIDI: {midiSupported ? (midiMappings?.globalOpacity ? (mappingLabel ? mappingLabel(midiMappings.globalOpacity) : 'Mapped') : 'Not mapped') : 'Not supported'}</span>
                  {learnParamId === 'globalOpacity' && midiSupported && <span style={{ color: '#4fc3f7' }}>Listening…</span>}
                  <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); beginLearn && beginLearn('globalOpacity'); }} disabled={!midiSupported}>Learn</button>
                  <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); clearMapping && clearMapping('globalOpacity'); }} disabled={!midiSupported || !midiMappings?.globalOpacity}>Clear</button>
                </div>
                <AudioControlRow paramId="globalOpacity" />
                <BPMControlRow paramId="globalOpacity" />
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 5rem auto 5rem auto 5rem', gap: '0.4rem', alignItems: 'center', marginTop: '0.5rem' }}>
                  <label className="compact-label">Min</label>
                  <BufferedNumberInput
                    value={opacityMin}
                    step={0.01}
                    min={0}
                    max={1}
                    onCommit={setOpacityMin}
                    className="compact-number"
                    style={{ width: '5rem' }}
                  />
                  <label className="compact-label">Max</label>
                  <BufferedNumberInput
                    value={opacityMax}
                    step={0.01}
                    min={0}
                    max={1}
                    onCommit={setOpacityMax}
                    className="compact-number"
                    style={{ width: '5rem' }}
                  />
                  <label className="compact-label">Step</label>
                  <BufferedNumberInput
                    value={opacityStep}
                    step={0.001}
                    min={0.001}
                    onCommit={(next) => setOpacityStep(next || 0.01)}
                    className="compact-number"
                    style={{ width: '5rem' }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="compact-field">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="compact-label">Layers</span>
              <button
                type="button"
                className="icon-btn sm"
                title="Layers settings"
                aria-label="Layers settings"
                onClick={(e) => { e.stopPropagation(); setShowLayersSettings(s => !s); }}
              >⚙</button>
              <label className="compact-label" title="Include Layer Count in Randomize All">
                <input type="checkbox" checked={!!getIsRnd('layersCount')} onChange={(e) => setIsRnd('layersCount', e.target.checked)} /> Include
              </label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 64px', gap: '8px', alignItems: 'center' }}>
              <input
                className="compact-range"
                type="range"
                min={layersMin}
                max={layersMax}
                step={layersStep}
                value={layers.length}
                onChange={(e) => setLayerCount(e.target.value)}
              />
              <BufferedNumberInput
                value={layers.length}
                min={layersMin}
                max={layersMax}
                step={layersStep}
                onCommit={setLayerCount}
                className="compact-number"
                style={{ width: '5.5rem', padding: '2px 6px', borderRadius: 6, background: 'rgba(255,255,255,0.08)', color: 'white', border: '1px solid rgba(255,255,255,0.12)' }}
                inputMode="numeric"
              />
            </div>
            {showLayersSettings && (
              <div className="dc-settings" style={{ marginTop: '0.25rem', padding: '0.5rem', borderRadius: 6, background: 'rgba(255,255,255,0.05)' }}>
                <div className="compact-row" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                  <span className="compact-label" style={{ opacity: 0.8 }}>MIDI: {midiSupported ? (midiMappings?.layersCount ? (mappingLabel ? mappingLabel(midiMappings.layersCount) : 'Mapped') : 'Not mapped') : 'Not supported'}</span>
                  {learnParamId === 'layersCount' && midiSupported && <span style={{ color: '#4fc3f7' }}>Listening…</span>}
                  <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); beginLearn && beginLearn('layersCount'); }} disabled={!midiSupported}>Learn</button>
                  <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); clearMapping && clearMapping('layersCount'); }} disabled={!midiSupported || !midiMappings?.layersCount}>Clear</button>
                </div>
                <AudioControlRow paramId="layersCount" />
                <BPMControlRow paramId="layersCount" />
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 5rem auto 5rem auto 5rem', gap: '0.4rem', alignItems: 'center', marginTop: '0.5rem' }}>
                  <label className="compact-label">Min</label>
                  <BufferedNumberInput
                    value={layersMin}
                    step={1}
                    min={1}
                    onCommit={(next) => setLayersMin(Math.max(1, Math.round(next)))}
                    className="compact-number"
                    style={{ width: '5rem' }}
                    inputMode="numeric"
                  />
                  <label className="compact-label">Max</label>
                  <BufferedNumberInput
                    value={layersMax}
                    step={1}
                    min={layersMin}
                    onCommit={(next) => setLayersMax(Math.max(layersMin, Math.round(next)))}
                    className="compact-number"
                    style={{ width: '5rem' }}
                    inputMode="numeric"
                  />
                  <label className="compact-label">Step</label>
                  <BufferedNumberInput
                    value={layersStep}
                    step={1}
                    min={1}
                    onCommit={(next) => setLayersStep(Math.max(1, Math.round(next)))}
                    className="compact-number"
                    style={{ width: '5rem' }}
                    inputMode="numeric"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="compact-field">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
              <label
                className="compact-label"
                title="When enabled, every layer copies Layer 1 colours"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <span>Match colours to Layer 1</span>
                <input
                  type="checkbox"
                  checked={!!syncLayerColorsToFirst}
                  onChange={(e) => setSyncLayerColorsToFirst?.(e.target.checked)}
                />
              </label>
              <label
                className="compact-label"
                title="Apply variation sliders to every layer in real time"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <span>Instant variation</span>
                <input
                  type="checkbox"
                  checked={!!applyVariationInstantly}
                  onChange={(e) => setApplyVariationInstantly?.(!!e.target.checked)}
                />
              </label>
            </div>
          </div>

          <div className="compact-field">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="compact-label">Position Variation: {Number(layers?.[0]?.variationPosition ?? DEFAULT_LAYER.variationPosition).toFixed(2)}</span>
              <button
                type="button"
                className="icon-btn sm"
                title="Variation settings"
                aria-label="Variation settings"
                onClick={(e) => { e.stopPropagation(); setShowVariationPositionSettings(s => !s); }}
              >⚙</button>
              <label className="compact-label" title="Include Position Variation in Randomize All">
                <input type="checkbox" checked={!!getIsRnd('variationPosition')} onChange={(e) => setIsRnd('variationPosition', e.target.checked)} /> Include
              </label>
            </div>
            <input
              className="compact-range"
              type="range"
              min={variationPositionMin}
              max={variationPositionMax}
              step={variationPositionStep}
              value={Number(layers?.[0]?.variationPosition ?? DEFAULT_LAYER.variationPosition)}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                applyVariationValue('variationPosition', v);
              }}
            />
            {showVariationPositionSettings && (
              <div className="dc-settings" style={{ marginTop: '0.25rem', padding: '0.5rem', borderRadius: 6, background: 'rgba(255,255,255,0.05)' }}>
                <div className="compact-row" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                  <span className="compact-label" style={{ opacity: 0.8 }}>MIDI: {midiSupported ? (midiMappings?.variationPosition ? (mappingLabel ? mappingLabel(midiMappings.variationPosition) : 'Mapped') : 'Not mapped') : 'Not supported'}</span>
                  {learnParamId === 'variationPosition' && midiSupported && <span style={{ color: '#4fc3f7' }}>Listening…</span>}
                  <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); beginLearn && beginLearn('variationPosition'); }} disabled={!midiSupported}>Learn</button>
                  <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); clearMapping && clearMapping('variationPosition'); }} disabled={!midiSupported || !midiMappings?.variationPosition}>Clear</button>
                </div>
                <AudioControlRow paramId="variationPosition" />
                <BPMControlRow paramId="variationPosition" />
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 5rem auto 5rem auto 5rem', gap: '0.4rem', alignItems: 'center', marginTop: '0.5rem' }}>
                  <label className="compact-label">Min</label>
                  <BufferedNumberInput
                    value={variationPositionMin}
                    step={0.01}
                    onCommit={setVariationPositionMin}
                    className="compact-number"
                    style={{ width: '5rem' }}
                  />
                  <label className="compact-label">Max</label>
                  <BufferedNumberInput
                    value={variationPositionMax}
                    step={0.01}
                    onCommit={setVariationPositionMax}
                    className="compact-number"
                    style={{ width: '5rem' }}
                  />
                  <label className="compact-label">Step</label>
                  <BufferedNumberInput
                    value={variationPositionStep}
                    step={0.001}
                    min={0.0001}
                    onCommit={(next) => setVariationPositionStep(next || 0.01)}
                    className="compact-number"
                    style={{ width: '5rem' }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="compact-field">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="compact-label">Shape Variation: {Number(layers?.[0]?.variationShape ?? DEFAULT_LAYER.variationShape).toFixed(2)}</span>
              <button type="button" className="icon-btn sm" title="Variation settings" aria-label="Variation settings" onClick={(e) => { e.stopPropagation(); setShowVariationShapeSettings(s => !s); }}>⚙</button>
              <label className="compact-label" title="Include Shape Variation in Randomize All">
                <input type="checkbox" checked={!!getIsRnd('variationShape')} onChange={(e) => setIsRnd('variationShape', e.target.checked)} /> Include
              </label>
            </div>
            <input
              className="compact-range"
              type="range"
              min={variationShapeMin}
              max={variationShapeMax}
              step={variationShapeStep}
              value={Number(layers?.[0]?.variationShape ?? DEFAULT_LAYER.variationShape)}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                applyVariationValue('variationShape', v);
              }}
            />
            {showVariationShapeSettings && (
              <div className="dc-settings" style={{ marginTop: '0.25rem', padding: '0.5rem', borderRadius: 6, background: 'rgba(255,255,255,0.05)' }}>
                <div className="compact-row" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                  <span className="compact-label" style={{ opacity: 0.8 }}>MIDI: {midiSupported ? (midiMappings?.variationShape ? (mappingLabel ? mappingLabel(midiMappings.variationShape) : 'Mapped') : 'Not mapped') : 'Not supported'}</span>
                  {learnParamId === 'variationShape' && midiSupported && <span style={{ color: '#4fc3f7' }}>Listening…</span>}
                  <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); beginLearn && beginLearn('variationShape'); }} disabled={!midiSupported}>Learn</button>
                  <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); clearMapping && clearMapping('variationShape'); }} disabled={!midiSupported || !midiMappings?.variationShape}>Clear</button>
                </div>
                <AudioControlRow paramId="variationShape" />
                <BPMControlRow paramId="variationShape" />
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 5rem auto 5rem auto 5rem', gap: '0.4rem', alignItems: 'center', marginTop: '0.5rem' }}>
                  <label className="compact-label">Min</label>
                  <BufferedNumberInput
                    value={variationShapeMin}
                    step={0.01}
                    onCommit={setVariationShapeMin}
                    className="compact-number"
                    style={{ width: '5rem' }}
                  />
                  <label className="compact-label">Max</label>
                  <BufferedNumberInput
                    value={variationShapeMax}
                    step={0.01}
                    onCommit={setVariationShapeMax}
                    className="compact-number"
                    style={{ width: '5rem' }}
                  />
                  <label className="compact-label">Step</label>
                  <BufferedNumberInput
                    value={variationShapeStep}
                    step={0.001}
                    min={0.0001}
                    onCommit={(next) => setVariationShapeStep(next || 0.01)}
                    className="compact-number"
                    style={{ width: '5rem' }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="compact-field">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="compact-label">Animation Variation: {Number(layers?.[0]?.variationAnim ?? DEFAULT_LAYER.variationAnim).toFixed(2)}</span>
              <button
                type="button"
                className="icon-btn sm"
                title="Variation settings"
                aria-label="Variation settings"
                onClick={(e) => { e.stopPropagation(); setShowVariationAnimSettings(s => !s); }}
              >⚙</button>
              <label className="compact-label" title="Include Animation Variation in Randomize All">
                <input type="checkbox" checked={!!getIsRnd('variationAnim')} onChange={(e) => setIsRnd('variationAnim', e.target.checked)} /> Include
              </label>
            </div>
            <input
              className="compact-range"
              type="range"
              min={variationAnimMin}
              max={variationAnimMax}
              step={variationAnimStep}
              value={Number(layers?.[0]?.variationAnim ?? DEFAULT_LAYER.variationAnim)}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                applyVariationValue('variationAnim', v);
              }}
            />
            {showVariationAnimSettings && (
              <div className="dc-settings" style={{ marginTop: '0.25rem', padding: '0.5rem', borderRadius: 6, background: 'rgba(255,255,255,0.05)' }}>
                <div className="compact-row" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                  <span className="compact-label" style={{ opacity: 0.8 }}>MIDI: {midiSupported ? (midiMappings?.variationAnim ? (mappingLabel ? mappingLabel(midiMappings.variationAnim) : 'Mapped') : 'Not mapped') : 'Not supported'}</span>
                  {learnParamId === 'variationAnim' && midiSupported && <span style={{ color: '#4fc3f7' }}>Listening…</span>}
                  <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); beginLearn && beginLearn('variationAnim'); }} disabled={!midiSupported}>Learn</button>
                  <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); clearMapping && clearMapping('variationAnim'); }} disabled={!midiSupported || !midiMappings?.variationAnim}>Clear</button>
                </div>
                <AudioControlRow paramId="variationAnim" />
                <BPMControlRow paramId="variationAnim" />
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 5rem auto 5rem auto 5rem', gap: '0.4rem', alignItems: 'center', marginTop: '0.5rem' }}>
                  <label className="compact-label">Min</label>
                  <BufferedNumberInput
                    value={variationAnimMin}
                    step={0.01}
                    onCommit={setVariationAnimMin}
                    className="compact-number"
                    style={{ width: '5rem' }}
                  />
                  <label className="compact-label">Max</label>
                  <BufferedNumberInput
                    value={variationAnimMax}
                    step={0.01}
                    onCommit={setVariationAnimMax}
                    className="compact-number"
                    style={{ width: '5rem' }}
                  />
                  <label className="compact-label">Step</label>
                  <BufferedNumberInput
                    value={variationAnimStep}
                    step={0.001}
                    min={0.0001}
                    onCommit={(next) => setVariationAnimStep(next || 0.01)}
                    className="compact-number"
                    style={{ width: '5rem' }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="compact-field">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="compact-label">Colour Variation: {Number(layers?.[0]?.variationColor ?? DEFAULT_LAYER.variationColor).toFixed(2)}</span>
              <button
                type="button"
                className="icon-btn sm"
                title="Variation settings"
                aria-label="Variation settings"
                onClick={(e) => { e.stopPropagation(); setShowVariationColorSettings(s => !s); }}
              >⚙</button>
              <label className="compact-label" title="Include Colour Variation in Randomize All">
                <input type="checkbox" checked={!!getIsRnd('variationColor')} onChange={(e) => setIsRnd('variationColor', e.target.checked)} /> Include
              </label>
            </div>
            <input
              className="compact-range"
              type="range"
              min={variationColorMin}
              max={variationColorMax}
              step={variationColorStep}
              value={Number(layers?.[0]?.variationColor ?? DEFAULT_LAYER.variationColor)}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                applyVariationValue('variationColor', v);
              }}
            />
            {showVariationColorSettings && (
              <div className="dc-settings" style={{ marginTop: '0.25rem', padding: '0.5rem', borderRadius: 6, background: 'rgba(255,255,255,0.05)' }}>
                <div className="compact-row" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                  <span className="compact-label" style={{ opacity: 0.8 }}>MIDI: {midiSupported ? (midiMappings?.variationColor ? (mappingLabel ? mappingLabel(midiMappings.variationColor) : 'Mapped') : 'Not mapped') : 'Not supported'}</span>
                  {learnParamId === 'variationColor' && midiSupported && <span style={{ color: '#4fc3f7' }}>Listening…</span>}
                  <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); beginLearn && beginLearn('variationColor'); }} disabled={!midiSupported}>Learn</button>
                  <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); clearMapping && clearMapping('variationColor'); }} disabled={!midiSupported || !midiMappings?.variationColor}>Clear</button>
                </div>
                <AudioControlRow paramId="variationColor" />
                <BPMControlRow paramId="variationColor" />
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 5rem auto 5rem auto 5rem', gap: '0.4rem', alignItems: 'center', marginTop: '0.5rem' }}>
                  <label className="compact-label">Min</label>
                  <BufferedNumberInput
                    value={variationColorMin}
                    step={0.01}
                    onCommit={setVariationColorMin}
                    className="compact-number"
                    style={{ width: '5rem' }}
                  />
                  <label className="compact-label">Max</label>
                  <BufferedNumberInput
                    value={variationColorMax}
                    step={0.01}
                    onCommit={setVariationColorMax}
                    className="compact-number"
                    style={{ width: '5rem' }}
                  />
                  <label className="compact-label">Step</label>
                  <BufferedNumberInput
                    value={variationColorStep}
                    step={0.001}
                    min={0.0001}
                    onCommit={(next) => setVariationColorStep(next || 0.01)}
                    className="compact-number"
                    style={{ width: '5rem' }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="compact-field">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="compact-label">Scale Variation: {Number(layers?.[0]?.variationScale ?? DEFAULT_LAYER.variationScale ?? 0).toFixed(2)}</span>
              <button
                type="button"
                className="icon-btn sm"
                title="Variation settings"
                aria-label="Variation settings"
                onClick={(e) => { e.stopPropagation(); setShowVariationScaleSettings(s => !s); }}
              >⚙</button>
              <label className="compact-label" title="Include Scale Variation in Randomize All">
                <input type="checkbox" checked={!!getIsRnd('variationScale')} onChange={(e) => setIsRnd('variationScale', e.target.checked)} /> Include
              </label>
            </div>
            <input
              className="compact-range"
              type="range"
              min={variationScaleMin}
              max={variationScaleMax}
              step={variationScaleStep}
              value={Number(layers?.[0]?.variationScale ?? DEFAULT_LAYER.variationScale ?? 0)}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                applyVariationValue('variationScale', v);
              }}
            />
            {showVariationScaleSettings && (
              <div className="dc-settings" style={{ marginTop: '0.25rem', padding: '0.5rem', borderRadius: 6, background: 'rgba(255,255,255,0.05)' }}>
                <div className="compact-row" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                  <span className="compact-label" style={{ opacity: 0.8 }}>MIDI: {midiSupported ? (midiMappings?.variationScale ? (mappingLabel ? mappingLabel(midiMappings.variationScale) : 'Mapped') : 'Not mapped') : 'Not supported'}</span>
                  {learnParamId === 'variationScale' && midiSupported && <span style={{ color: '#4fc3f7' }}>Listening…</span>}
                  <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); beginLearn && beginLearn('variationScale'); }} disabled={!midiSupported}>Learn</button>
                  <button className="btn-compact-secondary" onClick={(e) => { e.stopPropagation(); clearMapping && clearMapping('variationScale'); }} disabled={!midiSupported || !midiMappings?.variationScale}>Clear</button>
                </div>
                <AudioControlRow paramId="variationScale" />
                <BPMControlRow paramId="variationScale" />
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 5rem auto 5rem auto 5rem', gap: '0.4rem', alignItems: 'center', marginTop: '0.5rem' }}>
                  <label className="compact-label">Min</label>
                  <BufferedNumberInput
                    value={variationScaleMin}
                    step={0.01}
                    onCommit={setVariationScaleMin}
                    className="compact-number"
                    style={{ width: '5rem' }}
                  />
                  <label className="compact-label">Max</label>
                  <BufferedNumberInput
                    value={variationScaleMax}
                    step={0.01}
                    onCommit={setVariationScaleMax}
                    className="compact-number"
                    style={{ width: '5rem' }}
                  />
                  <label className="compact-label">Step</label>
                  <BufferedNumberInput
                    value={variationScaleStep}
                    step={0.001}
                    min={0.0001}
                    onCommit={(next) => setVariationScaleStep(next || 0.01)}
                    className="compact-number"
                    style={{ width: '5rem' }}
                  />
                  </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const isLayerEqualForUI = (a, b) => {
  if (a === b) return true;
  if (!a || !b) return false;
  const ignoreTop = new Set(['position', 'movementAngle', 'orbitAngle', 'spinAngle']);
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  keys.forEach(k => { if (ignoreTop.has(k)) keys.delete(k); });
  for (const key of keys) {
    if (!Object.is(a[key], b[key])) return false;
  }
  const posA = a.position || {};
  const posB = b.position || {};
  const ignorePos = new Set(['x', 'y', 'vx', 'vy', 'scale', 'scaleDirection']);
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

// Simple render profiler for the Global tab (opt-in via window.__artapp_debugSettings = true)
const useGlobalRenderDebug = (props) => {
  const debug = isSettingsDebugEnabled();
  const renderCountRef = useRef(0);
  const lastMarkRef = useRef(0);
  useEffect(() => {
    if (!debug) return;
    renderCountRef.current += 1;
    const now = performance.now ? performance.now() : Date.now();
    if (now - lastMarkRef.current > 1000) {
      lastMarkRef.current = now;
      const log = throttledSettingsDebugLog;
      log(`[global-debug] render #${renderCountRef.current}`, {
        layersLen: Array.isArray(props.layers) ? props.layers.length : 'n/a',
        isFrozen: props.isFrozen,
      });
    }
  });
};

const areGlobalPropsEqual = (prev, next) => {
  const debug = isSettingsDebugEnabled();
  const log = throttledSettingsDebugLog;
  const prevBGI = prev.backgroundImage || {};
  const nextBGI = next.backgroundImage || {};
  const diff = (reason) => {
    if (debug) {
      log(`[global-debug] re-render: ${reason}`);
    }
    return false;
  };

  // isActiveTab is only used for visibility, not for rendering content changes
  // Do NOT force re-render just because the tab is active - that causes stutter

  if (prev.backgroundColor !== next.backgroundColor) return diff('backgroundColor');
  if (prev.getIsRnd !== next.getIsRnd) return diff('getIsRnd changed');
  if (prevBGI.enabled !== nextBGI.enabled) return diff('backgroundImage.enabled');
  if (prevBGI.src !== nextBGI.src) return diff('backgroundImage.src');
  if (!Object.is(prevBGI.opacity, nextBGI.opacity)) return diff('backgroundImage.opacity');
  if (prevBGI.fit !== nextBGI.fit) return diff('backgroundImage.fit');
  if (prev.isFrozen !== next.isFrozen) return diff('isFrozen');
  if (prev.zIgnore !== next.zIgnore) return diff('zIgnore');
  if (prev.colorFadeWhileFrozen !== next.colorFadeWhileFrozen) return diff('colorFadeWhileFrozen');
  if (prev.syncLayerColorsToFirst !== next.syncLayerColorsToFirst) return diff('syncLayerColorsToFirst');
  if (prev.classicMode !== next.classicMode) return diff('classicMode');
  if (!Object.is(prev.globalSeed, next.globalSeed)) return diff('globalSeed');
  if (!Object.is(prev.globalSpeedMultiplier, next.globalSpeedMultiplier)) return diff('globalSpeedMultiplier');
  if (prev.globalBlendMode !== next.globalBlendMode) return diff('globalBlendMode');
  if (prev.midiInputId !== next.midiInputId) return diff('midiInputId');
  if (!areLayersEqualForUI(prev.layers, next.layers)) return diff('layers changed');

  return true;
};

export default React.memo((props) => {
  useGlobalRenderDebug(props);
  return <GlobalControls {...props} />;
}, areGlobalPropsEqual);
