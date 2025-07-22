/**
 * Canvas Error Boundary
 * Specialized error boundary for canvas-related errors with canvas-specific recovery options
 */

import React from 'react';
import ErrorBoundary from './ErrorBoundary.jsx';

const CanvasErrorBoundary = ({ children, onCanvasReset }) => {
  const handleCanvasError = (error, errorInfo) => {
    console.error('Canvas error:', error, errorInfo);
    
    // Log canvas-specific error details
    if (error.message.includes('canvas') || error.message.includes('WebGL') || error.message.includes('context')) {
      console.error('Canvas-related error detected:', {
        message: error.message,
        stack: error.stack,
        userAgent: navigator.userAgent,
        canvasSupport: !!document.createElement('canvas').getContext,
        webglSupport: !!document.createElement('canvas').getContext('webgl')
      });
    }
  };

  const canvasFallback = (error, retry, reset) => (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '400px',
      padding: '20px',
      backgroundColor: '#f8f9fa',
      border: '2px dashed #dee2e6',
      borderRadius: '8px',
      textAlign: 'center'
    }}>
      <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎨</div>
      <h3 style={{ color: '#495057', marginBottom: '12px' }}>Canvas Error</h3>
      <p style={{ color: '#6c757d', marginBottom: '20px', maxWidth: '400px' }}>
        The canvas component encountered an error and couldn't render the animation. 
        This might be due to browser compatibility or graphics issues.
      </p>
      
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
        <button
          onClick={retry}
          style={{
            padding: '10px 20px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Retry Canvas
        </button>
        
        <button
          onClick={() => {
            if (onCanvasReset) onCanvasReset();
            reset();
          }}
          style={{
            padding: '10px 20px',
            backgroundColor: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Reset Canvas
        </button>
      </div>

      <details style={{ marginTop: '20px', textAlign: 'left' }}>
        <summary style={{ cursor: 'pointer', color: '#6c757d' }}>Troubleshooting Tips</summary>
        <div style={{ marginTop: '10px', fontSize: '14px', color: '#6c757d' }}>
          <ul>
            <li>Try refreshing the page</li>
            <li>Check if hardware acceleration is enabled in your browser</li>
            <li>Update your browser to the latest version</li>
            <li>Try a different browser if the issue persists</li>
            <li>Disable browser extensions that might interfere with canvas</li>
          </ul>
        </div>
      </details>
    </div>
  );

  return (
    <ErrorBoundary
      title="Canvas Rendering Error"
      message="The canvas animation couldn't be displayed due to a rendering error."
      fallback={canvasFallback}
      onError={handleCanvasError}
      onReset={onCanvasReset}
      showDetails={true}
      showReset={true}
    >
      {children}
    </ErrorBoundary>
  );
};

export default CanvasErrorBoundary;