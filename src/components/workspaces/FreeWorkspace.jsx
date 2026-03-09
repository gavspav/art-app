import React from 'react';
import { Clock3 } from 'lucide-react';
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
    <>
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
          className="workspace-toggle-btn"
          onClick={onToggleTimelineMode}
          title="Toggle Timeline (T)"
        >
          <Clock3 size={16} />
          Timeline
        </button>
      </div>

      <BottomPanel {...bottomPanelProps} />
    </>
  );
};

export default FreeWorkspace;
