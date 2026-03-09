import React from 'react';
import { Crosshair, Download, Dices, Globe, Maximize2, Radio, Square } from 'lucide-react';

const FloatingActionButtons = ({
  onDownload,
  onRandomize,
  onToggleFullscreen,
  isFullscreen,
  onStartRecording,
  onStopRecording,
  isRecording,
  onToggleTargetMode,
  parameterTargetMode,
}) => {
  const ModeIcon = parameterTargetMode === 'global' ? Globe : Crosshair;
  const modeTitle = parameterTargetMode === 'global'
    ? 'Target: Global (switch to Individual)'
    : 'Target: Individual (switch to Global)';
  
  // In fullscreen mode, only show the exit fullscreen button (minimal UI)
  if (isFullscreen) {
    return (
      <div 
        className="floating-actions floating-actions--fullscreen" 
        aria-label="Floating Actions"
      >
        <button 
          className="fab" 
          title="Exit Fullscreen (F)" 
          aria-label="Exit Fullscreen" 
          onClick={onToggleFullscreen}
        >
          <Maximize2 size={18} />
        </button>
      </div>
    );
  }
  
  return (
    <div className="floating-actions" aria-label="Floating Actions">
      {onToggleTargetMode && (
        <button
          className="fab"
          title={modeTitle}
          aria-label="Toggle parameter target scope"
          onClick={onToggleTargetMode}
        >
          <ModeIcon size={18} />
        </button>
      )}
      {onToggleTargetMode && <span className="fab-divider" aria-hidden="true" />}
      <button className="fab" title="Download image" aria-label="Download image" onClick={onDownload}><Download size={18} /></button>
      <button className="fab" title="Randomize scene" aria-label="Randomize scene" onClick={onRandomize}><Dices size={18} /></button>
      <button className="fab" title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'} aria-label="Toggle Fullscreen" onClick={onToggleFullscreen}><Maximize2 size={18} /></button>
      <button
        className={`fab${isRecording ? ' recording-active' : ''}`}
        title={isRecording ? 'Stop Recording' : 'Start Recording'}
        aria-label="Toggle Recording"
        aria-pressed={isRecording}
        data-recording={isRecording ? 'true' : 'false'}
        onClick={isRecording ? onStopRecording : onStartRecording}
      >
        {isRecording ? <Square size={18} /> : <Radio size={18} />}
      </button>
    </div>
  );
};

export default FloatingActionButtons;
