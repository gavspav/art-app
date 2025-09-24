export default function ImportExportControls({
  onQuickSave,
  onQuickLoad,
  onImportSVG,
  onDownload,
  disabled = false,
}) {
  return (
    <div className="import-export-controls" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
      <button
        type="button"
        className="control-button"
        onClick={onQuickSave}
        disabled={disabled}
      >
        Quick Save
      </button>
      <button
        type="button"
        className="control-button"
        onClick={onQuickLoad}
        disabled={disabled}
      >
        Quick Load
      </button>
      <button
        type="button"
        className="control-button"
        onClick={onImportSVG}
        disabled={disabled}
      >
        Import SVG
      </button>
      <button
        type="button"
        className="control-button"
        onClick={onDownload}
        disabled={disabled}
      >
        Export PNG
      </button>
    </div>
  );
}
