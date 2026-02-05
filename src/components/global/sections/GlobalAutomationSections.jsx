import React, { useState, useEffect, useRef } from 'react';
import { useMidi } from '../../../context/MidiContext.jsx';
import { useAudioReactive } from '../../../context/AudioContext.jsx';
import { useBPM } from '../../../context/BPMContext.jsx';
import BufferedNumberInput from '../../common/BufferedNumberInput.jsx';
import BPMEnvelopeEditor, { DEFAULT_ENVELOPE } from '../../common/BPMEnvelopeEditor.jsx';

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
const AudioReactiveSection = ({ isActiveTab = true }) => {
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
  
  // Poll audio features for visual meters when active and tab is visible
  // This hook must be called unconditionally (before any early returns)
  useEffect(() => {
    // Only run when tab is active and audio is active
    if (!isActiveTab || !isActive || !getFeatures) return;
    
    let intervalId;
    const updateMeters = () => {
      const f = getFeatures();
      setFeatures(f);
    };
    
    // Run at ~20fps instead of RAF
    intervalId = setInterval(updateMeters, 50);
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isActiveTab, isActive, getFeatures]);

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

const AudioSpawnSection = ({
  isActiveTab = true,
  timelineMode = false,
  energyInfluence = 0,
  setEnergyInfluence = null,
  audioSpawnEnabled = false,
  setAudioSpawnEnabled = null,
  audioSpawnTriggerMode = 'level',
  setAudioSpawnTriggerMode = null,
  audioSpawnRepeatWhileAbove = true,
  setAudioSpawnRepeatWhileAbove = null,
  audioSpawnHysteresis = 0.08,
  setAudioSpawnHysteresis = null,
  audioSpawnBand = 'rms',
  setAudioSpawnBand = null,
  audioSpawnThreshold = 0.6,
  setAudioSpawnThreshold = null,
  audioSpawnCooldownMs = 250,
  setAudioSpawnCooldownMs = null,
  audioSpawnHalfLifeMs = 1500,
  setAudioSpawnHalfLifeMs = null,
  audioSpawnHalfLifeEnergyFactor = 1.0,
  setAudioSpawnHalfLifeEnergyFactor = null,
  audioSpawnMaxLayers = 12,
  setAudioSpawnMaxLayers = null,
} = {}) => {
  const audio = useAudioReactive();
  const [bandValue, setBandValue] = useState(0);

  const enabled = !!audio?.settings?.enabled;
  const getFeatures = audio?.getFeatures;

  useEffect(() => {
    if (!isActiveTab || !enabled || typeof getFeatures !== 'function') {
      setBandValue(0);
      return undefined;
    }

    let intervalId;
    const tick = () => {
      const features = getFeatures?.() || {};
      const v = typeof features?.[audioSpawnBand] === 'number' ? features[audioSpawnBand] : 0;
      setBandValue(v);
    };
    intervalId = setInterval(tick, 50);
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isActiveTab, enabled, getFeatures, audioSpawnBand]);

  const disabledByTimeline = !!timelineMode;
  const canRun = !disabledByTimeline && enabled;
  const mode = (audioSpawnTriggerMode === 'transient') ? 'transient' : 'level';

  return (
    <div className="compact-field" style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '0.5rem', marginTop: '0.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
        <span className="compact-label" style={{ fontWeight: 600 }}>⚡ Audio Spawn (Live)</span>
        <label className="compact-label" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }} title="Spawn temporary layers on audio threshold crossings (not exported)">
          <input
            type="checkbox"
            checked={!!audioSpawnEnabled}
            disabled={!setAudioSpawnEnabled || disabledByTimeline}
            onChange={(e) => setAudioSpawnEnabled?.(!!e.target.checked)}
          />
          Enabled
        </label>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem', opacity: canRun ? 1 : 0.7 }}>
        <span className="compact-label" style={{ width: 58 }}>Band</span>
        <select
          className="compact-select"
          style={{ fontSize: '0.75rem', flex: 1 }}
          value={audioSpawnBand || 'rms'}
          disabled={!setAudioSpawnBand || disabledByTimeline}
          onChange={(e) => setAudioSpawnBand?.(e.target.value)}
        >
          <option value="rms">Level</option>
          <option value="bass">Bass</option>
          <option value="mids">Mids</option>
          <option value="highs">Highs</option>
        </select>
        <span className="compact-label" style={{ fontSize: '0.75rem', opacity: 0.7, minWidth: 48, textAlign: 'right' }}>
          {Number.isFinite(bandValue) ? bandValue.toFixed(2) : '0.00'}
        </span>
      </div>

      <div style={{ marginTop: '0.35rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
          <span className="compact-label" style={{ width: 58 }}>Mode</span>
          <select
            className="compact-select"
            style={{ fontSize: '0.75rem', flex: 1 }}
            value={mode}
            disabled={!setAudioSpawnTriggerMode || disabledByTimeline}
            onChange={(e) => setAudioSpawnTriggerMode?.(e.target.value)}
          >
            <option value="level">Threshold</option>
            <option value="transient">Transients</option>
          </select>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="compact-label">{mode === 'transient' ? 'Sensitivity' : 'Threshold'}</span>
          <span className="compact-label" style={{ fontSize: '0.75rem', opacity: 0.7 }}>{Number(audioSpawnThreshold || 0).toFixed(2)}</span>
        </div>
        <input
          className="compact-range"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={Number.isFinite(audioSpawnThreshold) ? audioSpawnThreshold : 0.6}
          disabled={!setAudioSpawnThreshold || disabledByTimeline}
          onChange={(e) => setAudioSpawnThreshold?.(Number(e.target.value))}
          title={mode === 'transient'
            ? 'Lower = more sensitive (triggers on smaller transients)'
            : 'Spawn when the selected band reaches this level'}
        />
      </div>

      {mode === 'level' && (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.25rem', opacity: canRun ? 1 : 0.7 }}>
          <label className="compact-label" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }} title="If the audio stays above the threshold, spawn repeatedly using the cooldown interval">
            <input
              type="checkbox"
              checked={!!audioSpawnRepeatWhileAbove}
              disabled={!setAudioSpawnRepeatWhileAbove || disabledByTimeline}
              onChange={(e) => setAudioSpawnRepeatWhileAbove?.(!!e.target.checked)}
            />
            Repeat While Above
          </label>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span className="compact-label" title="Hysteresis reduces chatter when hovering near the threshold">Hyst</span>
            <BufferedNumberInput
              value={Number.isFinite(audioSpawnHysteresis) ? audioSpawnHysteresis : 0.08}
              step={0.01}
              min={0}
              max={0.5}
              onCommit={setAudioSpawnHysteresis}
              className="compact-number"
              style={{ width: '5.5rem' }}
              disabled={!setAudioSpawnHysteresis || disabledByTimeline}
            />
          </div>
        </div>
      )}

      <div style={{ marginTop: '0.35rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="compact-label">Energy → Variance</span>
          <span className="compact-label" style={{ fontSize: '0.75rem', opacity: 0.7 }}>{Number.isFinite(energyInfluence) ? Number(energyInfluence).toFixed(2) : '0.00'}</span>
        </div>
        <input
          className="compact-range"
          type="range"
          min="0"
          max="2"
          step="0.01"
          value={Number.isFinite(energyInfluence) ? energyInfluence : 0}
          disabled={!setEnergyInfluence || disabledByTimeline}
          onChange={(e) => setEnergyInfluence?.(Number(e.target.value))}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'auto 6rem', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem' }}>
        <span className="compact-label">Cooldown (ms)</span>
        <BufferedNumberInput
          value={Number.isFinite(audioSpawnCooldownMs) ? audioSpawnCooldownMs : 250}
          step={25}
          min={0}
          max={10000}
          onCommit={setAudioSpawnCooldownMs}
          className="compact-number"
          style={{ width: '6rem' }}
          disabled={!setAudioSpawnCooldownMs || disabledByTimeline}
        />

        <span className="compact-label">Half-life (ms)</span>
        <BufferedNumberInput
          value={Number.isFinite(audioSpawnHalfLifeMs) ? audioSpawnHalfLifeMs : 1500}
          step={50}
          min={50}
          max={60000}
          onCommit={setAudioSpawnHalfLifeMs}
          className="compact-number"
          style={{ width: '6rem' }}
          disabled={!setAudioSpawnHalfLifeMs || disabledByTimeline}
        />

        <span className="compact-label">Half-life Energy Factor</span>
        <BufferedNumberInput
          value={Number.isFinite(audioSpawnHalfLifeEnergyFactor) ? audioSpawnHalfLifeEnergyFactor : 1.0}
          step={0.1}
          min={0}
          max={4}
          onCommit={setAudioSpawnHalfLifeEnergyFactor}
          className="compact-number"
          style={{ width: '6rem' }}
          disabled={!setAudioSpawnHalfLifeEnergyFactor || disabledByTimeline}
        />

        <span className="compact-label">Max Layers</span>
        <BufferedNumberInput
          value={Number.isFinite(audioSpawnMaxLayers) ? audioSpawnMaxLayers : 12}
          step={1}
          min={0}
          max={200}
          onCommit={setAudioSpawnMaxLayers}
          className="compact-number"
          style={{ width: '6rem' }}
          disabled={!setAudioSpawnMaxLayers || disabledByTimeline}
        />
      </div>

      {!enabled && (
        <div style={{ marginTop: '0.35rem', fontSize: '0.75rem', opacity: 0.7 }}>
          Enable Audio Input above to use live spawning.
        </div>
      )}
      {disabledByTimeline && (
        <div style={{ marginTop: '0.35rem', fontSize: '0.75rem', opacity: 0.7 }}>
          Disabled while Timeline mode is active.
        </div>
      )}
    </div>
  );
};

// BPM/Beat Sync Section Component - Master BPM controls
const BPMSection = ({ showBeatCounter: _showBeatCounter = false }) => {
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
          <BufferedNumberInput
            value={currentBPM}
            min={20}
            max={300}
            step={1}
            onCommit={(next) => {
              const v = Number(next);
              if (!Number.isFinite(v)) return;
              setBPM(Math.max(20, Math.min(300, Math.round(v))));
            }}
            className="compact-number"
            style={{ width: '4rem', fontSize: '0.75rem', padding: '2px 4px' }}
            inputMode="numeric"
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
const AudioControlRow = ({ paramId, label: _label }) => {
  const audio = useAudioReactive();
  const bpm = useBPM();
  const midi = useMidi();
  const [showRange, setShowRange] = useState(false);

  const hasAudio = !!audio;
  const isActive = !!audio?.isActive;
  const mappings = audio?.mappings || {};
  const setMapping = audio?.setMapping;
  const clearMapping = audio?.clearMapping;
  const learnParamId = audio?.learnParamId;
  const _beginLearn = audio?.beginLearn;
  const cancelLearn = audio?.cancelLearn;
  const AUDIO_BANDS = audio?.AUDIO_BANDS || ['none'];
  const DEFAULT_RANGE = audio?.DEFAULT_RANGE || { outputMin: 0, outputMax: 1 };
  
  const mapping = mappings?.[paramId];
  const currentBand = mapping?.band || 'none';
  const fallbackRange = mapping?.range || DEFAULT_RANGE;
  const currentRange = fallbackRange;
  const isLearning = learnParamId === paramId;
  
  const handleBandChange = (band) => {
    if (!hasAudio || typeof setMapping !== 'function') return;
    if (band === 'none') {
      // Preserve the last-used range so re-enabling keeps the same min/max
      setMapping(paramId, { band: 'none', range: currentRange });
    } else {
      // Enable Audio and disable MIDI/BPM for this parameter (mutual exclusivity)
      const nextRange = mapping?.range || DEFAULT_RANGE;
      setMapping(paramId, { band, range: nextRange });
      // Clear MIDI mapping
      if (midi?.clearMapping) midi.clearMapping(paramId);
      // Clear BPM mapping
      if (bpm?.setMapping) bpm.setMapping(paramId, { enabled: false, speed: 1, loopMode: 'forward', range: bpm.DEFAULT_RANGE || { outputMin: 0, outputMax: 1 } });
    }
    if (isLearning) cancelLearn();
  };
  
  const handleRangeChange = (update) => {
    if (!hasAudio || typeof setMapping !== 'function') return;
    if (currentBand === 'none') return;
    setMapping(paramId, { band: currentBand, range: { ...currentRange, ...update } });
  };

  if (!hasAudio) return null;

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
      
      {/* Range editor - simplified to just output min/max */}
      {showRange && currentBand !== 'none' && (
        <div style={{ marginTop: '0.25rem', marginLeft: '0.5rem', padding: '0.25rem', borderRadius: 4, background: 'rgba(255,255,255,0.03)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.65rem', opacity: 0.7 }}>Min:</span>
            <input
              type="number"
              step="0.1"
              value={currentRange.outputMin}
              onChange={(e) => handleRangeChange({ outputMin: parseFloat(e.target.value) || 0 })}
              style={{ width: '3rem', fontSize: '0.65rem', padding: '2px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 3, color: 'white' }}
            />
            <span style={{ fontSize: '0.65rem', opacity: 0.7, marginLeft: '0.5rem' }}>Max:</span>
            <input
              type="number"
              step="0.1"
              value={currentRange.outputMax}
              onChange={(e) => handleRangeChange({ outputMax: parseFloat(e.target.value) || 1 })}
              style={{ width: '3rem', fontSize: '0.65rem', padding: '2px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 3, color: 'white' }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

// BPM control row component - shown per parameter in settings panel
const BPMControlRow = React.memo(({ paramId }) => {
  const bpm = useBPM();
  const audio = useAudioReactive();
  const midi = useMidi();
  const [showSettings, setShowSettings] = useState(false);
  const [showEnvelope, setShowEnvelope] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      const stored = window.localStorage.getItem(`bpm-env-open-${paramId}`);
      return stored === 'true';
    } catch {
      return false;
    }
  });
  const [playheadPosition, setPlayheadPosition] = useState(null);
  const [indicatorPhase, setIndicatorPhase] = useState(0);

  const hasBpm = !!bpm;
  const isPlaying = !!bpm?.isPlaying;
  const mappings = bpm?.mappings || {};
  const setMapping = bpm?.setMapping;
  const clearMapping = bpm?.clearMapping;
  const getPhaseForParam = bpm?.getPhaseForParam;
  const BEAT_SPEEDS = bpm?.BEAT_SPEEDS || [];
  const LOOP_MODES = bpm?.LOOP_MODES || [];
  const DEFAULT_RANGE = bpm?.DEFAULT_RANGE || { outputMin: 0, outputMax: 1 };
  const beatsPerBar = bpm?.beatsPerBar;
  
  // Poll for playhead position when envelope is shown and playing
  useEffect(() => {
    if (!hasBpm) return;
    if (!showEnvelope || !isPlaying || !getPhaseForParam) return;
    
    let frameId;
    const updatePlayhead = () => {
      const phase = getPhaseForParam(paramId);
      setPlayheadPosition(phase);
      frameId = requestAnimationFrame(updatePlayhead);
    };
    frameId = requestAnimationFrame(updatePlayhead);
    
    return () => {
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [hasBpm, showEnvelope, isPlaying, getPhaseForParam, paramId]);
  // Persist envelope open state so remounts don't auto-close it
  useEffect(() => {
    try {
      window.localStorage.setItem(`bpm-env-open-${paramId}`, showEnvelope ? 'true' : 'false');
    } catch { /* ignore */ }
  }, [showEnvelope, paramId]);
  
  const mapping = mappings?.[paramId];
  const isEnabled = mapping?.enabled || false;
  const currentSpeed = mapping?.speed || 1;
  const currentLoopMode = mapping?.loopMode || 'forward';
  const currentRange = mapping?.range || DEFAULT_RANGE;
  const currentEnvelope = mapping?.envelope || DEFAULT_ENVELOPE;
  
  const handleToggle = () => {
    if (isEnabled) {
      setMapping(paramId, { enabled: false, speed: currentSpeed, loopMode: currentLoopMode, range: currentRange, envelope: currentEnvelope });
    } else {
      // Enable BPM and disable MIDI/Audio for this parameter (mutual exclusivity)
      setMapping(paramId, { enabled: true, speed: currentSpeed, loopMode: currentLoopMode, range: currentRange, envelope: currentEnvelope });
      // Clear MIDI mapping
      if (midi?.clearMapping) midi.clearMapping(paramId);
      // Clear Audio mapping
      if (audio?.setMapping) audio.setMapping(paramId, { band: 'none', range: audio.DEFAULT_RANGE || { outputMin: 0, outputMax: 1 } });
    }
  };
  
  const handleSpeedChange = (speed) => {
    setMapping(paramId, { enabled: isEnabled, speed: Number(speed), loopMode: currentLoopMode, range: currentRange, envelope: currentEnvelope });
  };
  
  const handleLoopModeChange = (loopMode) => {
    setMapping(paramId, { enabled: isEnabled, speed: currentSpeed, loopMode, range: currentRange, envelope: currentEnvelope });
  };
  
  const handleRangeChange = (update) => {
    setMapping(paramId, { enabled: isEnabled, speed: currentSpeed, loopMode: currentLoopMode, range: { ...currentRange, ...update }, envelope: currentEnvelope });
  };
  
  const handleEnvelopeChange = (newEnvelope) => {
    console.debug('[GlobalControls] handleEnvelopeChange', { paramId, newEnvelope });
    setMapping(paramId, { enabled: isEnabled, speed: currentSpeed, loopMode: currentLoopMode, range: currentRange, envelope: newEnvelope });
  };

  // Lightweight indicator (does not mutate actual slider values):
  // show current phase so users can see BPM automation is active even if UI controls are not animated.
  useEffect(() => {
    if (!hasBpm) return;
    if (!isEnabled || typeof getPhaseForParam !== 'function') {
      setIndicatorPhase(0);
      return undefined;
    }

    let frameId = null;
    let last = 0;
    const THROTTLE_MS = 50; // ~20fps

    const tick = () => {
      const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      if (now - last >= THROTTLE_MS) {
        last = now;
        const phase = getPhaseForParam(paramId);
        setIndicatorPhase(Number.isFinite(phase) ? phase : 0);
      }
      frameId = requestAnimationFrame(tick);
    };

    // Only animate when playing; otherwise keep a static snapshot.
    if (isPlaying) {
      frameId = requestAnimationFrame(tick);
      return () => { if (frameId) cancelAnimationFrame(frameId); };
    }

    const phase = getPhaseForParam(paramId);
    setIndicatorPhase(Number.isFinite(phase) ? phase : 0);
    return undefined;
  }, [hasBpm, isEnabled, isPlaying, getPhaseForParam, paramId]);

  if (!hasBpm) return null;

  return (
    <div style={{ marginTop: '0.25rem' }}>
      <div className="compact-row" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
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
              style={{ fontSize: '0.65rem', padding: '2px 4px', background: showEnvelope ? 'rgba(79, 195, 247, 0.3)' : undefined }}
              onClick={() => setShowEnvelope(s => !s)}
              title="Edit envelope curve"
            >
              Env
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
        {isEnabled && (
          <span
            title={isPlaying ? 'BPM automation active' : 'BPM automation enabled (paused)'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              width: 44,
              height: 6,
              borderRadius: 6,
              background: 'rgba(255,255,255,0.12)',
              overflow: 'hidden',
              border: '1px solid rgba(255,255,255,0.12)',
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 6,
                background: isPlaying ? '#4fc3f7' : 'rgba(79,195,247,0.55)',
                transform: `translateX(${Math.max(0, Math.min(1, indicatorPhase)) * 38}px)`,
                transition: isPlaying ? 'none' : 'transform 150ms ease',
              }}
            />
          </span>
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
      
      {/* Envelope editor */}
      {showEnvelope && isEnabled && (
        <div style={{ marginTop: '0.5rem' }}>
          <BPMEnvelopeEditor
            envelope={currentEnvelope}
            onChange={handleEnvelopeChange}
            beatsPerBar={beatsPerBar || 4}
            playheadPosition={playheadPosition}
          />
        </div>
      )}
    </div>
  );
});

// A full-featured Global Controls panel, mirroring the original inline UI

export { RangeMappingEditor, AudioReactiveSection, AudioSpawnSection, BPMSection, AudioControlRow, BPMControlRow };
