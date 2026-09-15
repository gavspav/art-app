import './NodeEditorToolbar.css';

export default function NodeEditorToolbar({
  tool, onToolChange, pull, onPull, viewMode, onView, pencilOnly, onPencilOnly,
  sides, onSidesChange, onDuplicate, zoom, onZoom, onResetView,
  canUndo, canRedo, onUndo, onRedo, drafting, onFinish, onClose, canClose, onCancel, onDone, status,
}) {
  const toolButton = (value, label, title) => (
    <button type="button" aria-pressed={tool === value && !pull && !viewMode}
      title={title} onClick={() => onToolChange(tool === value ? 'select' : value)}>{label}</button>
  );
  return (
    <div className="node-editor-toolbar" role="region" aria-label="Node editor tools">
      <div className="node-editor-toolbar-row" role="group" aria-label="Interaction mode">
        {toolButton('select', 'Edit', 'Drag points or edge handles. Hold a point to remove it; hold an edge to add a point.')}
        <button type="button" aria-pressed={pull} onClick={onPull} title="Pull nearby points together in the direction you drag">Pull</button>
        <button type="button" aria-pressed={viewMode} onClick={onView} title="Drag to pan the canvas; pinch to zoom the canvas">View</button>
        <button type="button" aria-pressed={pencilOnly} onClick={onPencilOnly} title="Only the Pencil edits shapes; two fingers navigate the canvas">Pencil only</button>
        <span className="node-editor-toolbar-spacer" />
        <button type="button" onClick={onUndo} disabled={!canUndo} aria-label="Undo node edit">↶ Undo</button>
        <button type="button" onClick={onRedo} disabled={!canRedo} aria-label="Redo node edit">↷ Redo</button>
        {onDone && <button type="button" onClick={onDone}>Done editing</button>}
      </div>
      <div className="node-editor-toolbar-row" role="group" aria-label="Shape tools">
        {toolButton('add', '+ Node', 'Tap an edge to insert a node')}
        {toolButton('remove', '− Node', 'Tap a node to remove it')}
        {toolButton('newLine', 'Line', 'Drag on the canvas to start a new line; tap to extend it')}
        {toolButton('polygon', 'Polygon', 'Drag on the canvas to size a polygon; lift to finish on touch or Pencil')}
        <label className="node-editor-sides">Sides
          <input aria-label="Polygon sides" type="number" inputMode="numeric" min="3" max="96" step="1"
            value={sides} onChange={event => onSidesChange(event.target.value)} />
        </label>
        <button type="button" onClick={onDuplicate}>Copy</button>
        {drafting && <button type="button" onClick={onFinish}>Finish</button>}
        {canClose && <button type="button" onClick={onClose}>Close shape</button>}
        {drafting && <button type="button" onClick={onCancel}>Cancel</button>}
      </div>
      <div className="node-editor-toolbar-row">
        <p className="node-editor-gesture-hint" role="status">
          {status || (viewMode ? 'Drag to pan · Pinch to zoom the canvas'
            : pencilOnly ? 'Pencil edits · Two fingers pan and zoom the canvas'
              : pull ? 'Drag to pull nearby points · Two fingers resize, rotate and move the shape'
                : 'Drag points or edges · Two fingers resize, rotate and move · Hold a point to remove, or an edge to add')}
        </p>
        <div className="node-editor-zoom" role="group" aria-label="Canvas zoom">
          <button type="button" onClick={() => onZoom(1 / 1.2)} aria-label="Zoom out">−</button>
          <button type="button" onClick={onResetView} aria-label="Reset node edit zoom">{Math.round(zoom * 100)}%</button>
          <button type="button" onClick={() => onZoom(1.2)} aria-label="Zoom in">+</button>
        </div>
      </div>
    </div>
  );
}
