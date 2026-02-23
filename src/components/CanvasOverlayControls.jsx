import ImportAdjustPanel from './global/ImportAdjustPanel.jsx';
import FloatingActionButtons from './global/FloatingActionButtons.jsx';

export default function CanvasOverlayControls({
  showImportAdjust,
  importAdjust,
  onImportAdjustChange,
  importFitEnabled,
  onToggleFit,
  importDebug,
  onToggleDebug,
  onResetImportAdjust,
  onCloseImportAdjust,
  onDownload,
  onRandomize,
  onToggleFullscreen,
  isFullscreen,
  onStartRecording,
  onStopRecording,
  isRecording,
  onToggleTargetMode,
  parameterTargetMode,
}) {
  return (
    <>
      {showImportAdjust && (
        <div style={{ position: 'absolute', right: 16, bottom: 80, zIndex: 10 }}>
          <ImportAdjustPanel
            importAdjust={importAdjust}
            onChange={onImportAdjustChange}
            fitEnabled={importFitEnabled}
            onToggleFit={onToggleFit}
            debug={importDebug}
            onToggleDebug={onToggleDebug}
            onReset={onResetImportAdjust}
            onClose={onCloseImportAdjust}
          />
        </div>
      )}

      <FloatingActionButtons
        onDownload={onDownload}
        onRandomize={onRandomize}
        onToggleFullscreen={onToggleFullscreen}
        isFullscreen={isFullscreen}
        onStartRecording={onStartRecording}
        onStopRecording={onStopRecording}
        isRecording={isRecording}
        onToggleTargetMode={onToggleTargetMode}
        parameterTargetMode={parameterTargetMode}
      />
    </>
  );
}
