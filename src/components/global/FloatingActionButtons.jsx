import React from 'react';

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
  const modeIcon = parameterTargetMode === 'global' ? '🌐' : '🎯';
  const modeTitle = parameterTargetMode === 'global'
    ? 'Target: Global (switch to Individual)'
    : 'Target: Individual (switch to Global)';
  
  // In fullscreen mode, only show the exit fullscreen button (minimal UI)
  if (isFullscreen) {
    return (
      <div 
        className="floating-actions" 
        aria-label="Floating Actions"
        style={{ opacity: 0.3, transition: 'opacity 0.2s' }}
        onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
        onMouseLeave={(e) => e.currentTarget.style.opacity = '0.3'}
      >
        <button 
          className="fab" 
          title="Exit Fullscreen (F)" 
          aria-label="Exit Fullscreen" 
          onClick={onToggleFullscreen}
        >
          ⤢
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
          {modeIcon}
        </button>
      )}
      <button className="fab" title="Download image" aria-label="Download image" onClick={onDownload}>⬇</button>
      <button className="fab" title="Randomize scene" aria-label="Randomize scene" onClick={onRandomize}>🎲</button>
      <button className="fab" title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'} aria-label="Toggle Fullscreen" onClick={onToggleFullscreen}>{isFullscreen ? '⤢' : '⤢'}</button>
      <button
        className={`fab${isRecording ? ' recording-active' : ''}`}
        title={isRecording ? 'Stop Recording' : 'Start Recording'}
        aria-label="Toggle Recording"
        aria-pressed={isRecording}
        data-recording={isRecording ? 'true' : 'false'}
        onClick={isRecording ? onStopRecording : onStartRecording}
      >
        {isRecording ? '⏹' : '⏺'}
      </button>
    </div>
  );
};

export default FloatingActionButtons;
