import React from 'react';
import Canvas from '../Canvas';
import FloatingActionButtons from '../global/FloatingActionButtons.jsx';

const FullscreenWorkspace = ({
  canvasRef,
  canvasProps,
  floatingActionProps,
}) => (
  <div
    className="canvas-container"
    style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: '100%',
      height: '100%',
    }}
  >
    <Canvas
      ref={canvasRef}
      {...canvasProps}
    />
    <FloatingActionButtons {...floatingActionProps} />
  </div>
);

export default FullscreenWorkspace;
