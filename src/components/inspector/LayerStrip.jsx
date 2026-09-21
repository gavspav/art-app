import React, { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Dices, FilePlus2, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';

// Header strip shared by every layer section: pick the layer being edited,
// choose whether edits apply to it alone or to all layers, and manage layers.
export default function LayerStrip({ props }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const menuRef = useRef(null);
  const layers = props.layers || [];
  const index = Math.max(0, Math.min(Number(props.selectedLayerIndex) || 0, layers.length - 1));
  const selection = Array.isArray(props.selectedLayerIds) ? props.selectedLayerIds : [];
  const selectionActive = props.editTarget?.type === 'selection' && selection.length > 0;
  const global = props.parameterTargetMode === 'global';

  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = event => { if (!menuRef.current?.contains(event.target)) { setMenuOpen(false); setConfirmDelete(false); } };
    const key = event => { if (event.key === 'Escape') { setMenuOpen(false); setConfirmDelete(false); } };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('pointerdown', close, true); window.removeEventListener('keydown', key); };
  }, [menuOpen]);

  const choose = value => {
    if (value === 'selection') { props.setEditTarget?.({ type: 'selection' }); return; }
    const next = Number(value);
    props.selectLayer?.(next);
    props.clearSelection?.();
    const id = layers[next]?.id;
    if (id) props.toggleLayerSelection?.(id);
    props.setEditTarget?.({ type: 'single' });
  };
  const action = fn => () => { fn?.(); setMenuOpen(false); setConfirmDelete(false); };

  return (
    <div className="layer-strip" role="group" aria-label="Layer">
      <select className="layer-strip-select" aria-label="Layer to edit" value={selectionActive ? 'selection' : String(index)} onChange={event => choose(event.target.value)}>
        {layers.map((layer, i) => <option key={layer?.id || i} value={String(i)}>{`${i + 1} · ${layer?.name || `Layer ${i + 1}`}`}</option>)}
        {selection.length > 1 && <option value="selection">{`Selection (${selection.length})`}</option>}
      </select>
      <div className="scope-toggle" role="group" aria-label="Apply edits to">
        <button type="button" className={global ? '' : 'active'} aria-pressed={!global} onClick={() => props.setParameterTargetMode?.('individual')} title="Edit only the chosen layer (G toggles)">This layer</button>
        <button type="button" className={global ? 'active' : ''} aria-pressed={global} onClick={() => props.setParameterTargetMode?.('global')} title="Edit every layer together (G toggles)">All layers</button>
      </div>
      <button type="button" className="param-icon" onClick={() => props.addNewLayer?.()} aria-label="Add layer" title="Add layer"><Plus size={15} /></button>
      <div className="layer-strip-menu-wrap" ref={menuRef}>
        <button type="button" className={`param-icon${menuOpen ? ' active' : ''}`} aria-expanded={menuOpen} aria-label="Layer actions" title="Layer actions" onClick={() => setMenuOpen(value => !value)}><MoreHorizontal size={15} /></button>
        {menuOpen && (
          <div className="layer-strip-menu" role="menu">
            <button type="button" role="menuitem" onClick={action(props.moveSelectedLayerUp)} disabled={index >= layers.length - 1}><ArrowUp size={15} /> Move up</button>
            <button type="button" role="menuitem" onClick={action(props.moveSelectedLayerDown)} disabled={index <= 0}><ArrowDown size={15} /> Move down</button>
            <button type="button" role="menuitem" onClick={action(() => props.setIsNodeEditMode?.(!props.isNodeEditMode))}><Pencil size={15} /> {props.isNodeEditMode ? 'Finish editing nodes' : 'Edit nodes'}</button>
            <button type="button" role="menuitem" onClick={action(props.handleImportSVGClick)}><FilePlus2 size={15} /> Import SVG</button>
            <button type="button" role="menuitem" onClick={action(() => props.randomizeCurrentLayer?.(false))}><Dices size={15} /> Randomise layer</button>
            {confirmDelete
              ? <button type="button" role="menuitem" className="danger" onClick={action(() => props.deleteLayer?.(index))}><Trash2 size={15} /> Confirm delete</button>
              : <button type="button" role="menuitem" className="danger" disabled={layers.length <= 1} onClick={() => setConfirmDelete(true)}><Trash2 size={15} /> Delete layer</button>}
          </div>
        )}
      </div>
    </div>
  );
}
