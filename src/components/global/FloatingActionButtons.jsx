import React from 'react';

const FloatingActionButtons = ({ onDownload, onRandomize, onToggleFullscreen, isFullscreen }) => {
  return (
    <div className="fab-container">
      <button onClick={onDownload}>Download</button>
      <button onClick={onRandomize}>Randomize</button>
      <button onClick={onToggleFullscreen}>{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</button>
    </div>
  );
};

export default FloatingActionButtons;

