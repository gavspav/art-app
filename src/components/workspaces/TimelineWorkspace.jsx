import React from 'react';
import Canvas from '../Canvas';
import BottomPanel from '../BottomPanel.jsx';
import { TimelinePanel } from '../timeline/index.js';
import FloatingActionButtons from '../global/FloatingActionButtons.jsx';
import ImportAdjustPanel from '../global/ImportAdjustPanel.jsx';
import DraggableDivider from '../common/DraggableDivider.jsx';

const TimelineWorkspace = ({
  topBarHeight,
  topPanelHeightExpr,
  timelineHeightExpr,
  leftPanelRatio,
  setLeftPanelRatio,
  topPanelRatio,
  setTopPanelRatio,
  canvasRef,
  canvasProps,
  importAdjustProps,
  floatingActionProps,
  onToggleTimelineMode,
  bottomPanelProps,
  timelinePanelProps,
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
        style={{
          position: 'fixed',
          top: `${topBarHeight}px`,
          left: 0,
          right: 0,
          height: topPanelHeightExpr,
          display: 'flex',
          flexDirection: 'row',
          zIndex: 150,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${leftPanelRatio * 100}%`,
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            background: 'rgba(20, 20, 30, 0.95)',
            borderRight: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          <div
            style={{
              height: '100%',
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              padding: '0 12px 0 12px',
              boxSizing: 'border-box',
            }}
          >
            <BottomPanel {...bottomPanelProps} />
          </div>
        </div>

        <DraggableDivider
          direction="horizontal"
          onResize={setLeftPanelRatio}
          initialRatio={leftPanelRatio}
          minRatio={0.15}
          maxRatio={0.5}
        />

        <div
          className="canvas-container"
          style={{
            flex: 1,
            height: '100%',
            position: 'relative',
            overflow: 'hidden',
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
              background: 'rgba(79, 195, 247, 0.3)',
              border: '1px solid rgba(79, 195, 247, 0.5)',
              borderRadius: 8,
              padding: '8px 16px',
              color: '#4fc3f7',
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
        </div>
      </div>

      <DraggableDivider
        direction="vertical"
        onResize={setTopPanelRatio}
        initialRatio={topPanelRatio}
        minRatio={0.2}
        maxRatio={0.8}
        style={{
          position: 'fixed',
          top: `calc(${topBarHeight}px + ${topPanelHeightExpr})`,
          left: 0,
          right: 0,
          zIndex: 201,
        }}
      />
      <div
        style={{
          position: 'fixed',
          top: `calc(${topBarHeight}px + ${topPanelHeightExpr})`,
          left: 0,
          right: 0,
          height: timelineHeightExpr,
          zIndex: 200,
        }}
      >
        <TimelinePanel {...timelinePanelProps} />
      </div>
    </>
  );
};

export default TimelineWorkspace;
