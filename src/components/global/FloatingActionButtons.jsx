import React from 'react';

const FloatingActionButtons = ({ onDownload, onRandomize, onToggleFullscreen, isFullscreen, onStartRecording, onStopRecording, isRecording }) => {
  return (
    <div className="floating-actions" aria-label="Floating Actions">
      <button className="fab" title="Download image" aria-label="Download image" onClick={onDownload}>⬇</button>
      <button className="fab" title="Randomize scene" aria-label="Randomize scene" onClick={onRandomize}>🎲</button>
      <button className="fab" title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'} aria-label="Toggle Fullscreen" onClick={onToggleFullscreen}>{isFullscreen ? '⤢' : '⤢'}</button>
      <button className="fab" title={isRecording ? 'Stop Recording' : 'Start Recording'} aria-label="Toggle Recording" onClick={isRecording ? onStopRecording : onStartRecording}>
        {isRecording ? '⏹' : '⏺'}
      </button>
    </div>
  );
};

export default FloatingActionButtons;
