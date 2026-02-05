import React from 'react';
import Canvas from '../Canvas';
import BottomPanel from '../BottomPanel.jsx';
import FloatingActionButtons from '../global/FloatingActionButtons.jsx';
import ImportAdjustPanel from '../global/ImportAdjustPanel.jsx';

const FreeWorkspace = ({
  canvasRef,
  canvasProps,
  importAdjustProps,
  floatingActionProps,
  onToggleTimelineMode,
  bottomPanelProps,
}) => {
  const {
    showImportAdjust,
    importAdjust,
    applyImportAdjust,
    importFitEnabled,
    setImportFitEnabled,
    importDebug,
    setImportDebug,
    setShowImportAdjust,
  } = importAdjustProps;

  return (
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

      {showImportAdjust && (
        <div style={{ position: 'absolute', right: 16, bottom: 80, zIndex: 10 }}>
          <ImportAdjustPanel
            importAdjust={importAdjust}
            onChange={(adj) => applyImportAdjust(adj)}
            fitEnabled={importFitEnabled}
            onToggleFit={() => setImportFitEnabled(v => !v)}
            debug={importDebug}
            onToggleDebug={() => {
              const v = !importDebug;
              setImportDebug(v);
              window.__artapp_debug_import = v;
            }}
            onReset={() => applyImportAdjust({ dx: 0, dy: 0, s: 1 })}
            onClose={() => setShowImportAdjust(false)}
          />
        </div>
      )}

      <FloatingActionButtons {...floatingActionProps} />

      <button
        type="button"
        onClick={onToggleTimelineMode}
        style={{
          position: 'absolute',
          bottom: 16,
          left: 16,
          background: 'rgba(0, 0, 0, 0.5)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          borderRadius: 8,
          padding: '8px 16px',
          color: 'white',
          fontSize: '0.8rem',
          cursor: 'pointer',
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
        title="Toggle Timeline (T)"
      >
        Timeline
      </button>

      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: '55vh',
          overflowY: 'auto',
          background: 'rgba(20, 20, 30, 0.95)',
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        <BottomPanel {...bottomPanelProps} />
      </div>
    </div>
  );
};

export default FreeWorkspace;
