import React, { useEffect, useMemo, useState } from 'react';
import { useAppState } from '../../context/AppStateContext.jsx';

// Helper: parse comma/range list like "1,3,5-7" into 0-based indices
const parseIndexList = (text) => {
  const out = new Set();
  const parts = String(text || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  for (const p of parts) {
    if (p.includes('-')) {
      const [a, b] = p.split('-').map(v => parseInt(v.trim(), 10));
      if (Number.isFinite(a) && Number.isFinite(b)) {
        const start = Math.min(a, b);
        const end = Math.max(a, b);
        for (let i = start; i <= end; i++) out.add(i - 1);
      }
    } else {
      const n = parseInt(p, 10);
      if (Number.isFinite(n)) out.add(n - 1);
    }
  }
  return Array.from(out);
};

export default function GroupsControls() {
  const {
    layers,
    selectedLayerIds,
    layerGroups,
    editTarget,
    // actions
    createGroup,
    addMembersToGroup,
    removeMembersFromGroup,
    deleteGroup,
    setEditTarget,
    toggleLayerSelection,
    clearSelection,
  } = useAppState() || {};

  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#7c84ff');
  const [memberText, setMemberText] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState(editTarget?.type === 'group' ? editTarget.groupId : null);

  const layerIndexToId = useMemo(() => (Array.isArray(layers) ? layers.map(l => l?.id).filter(Boolean) : []), [layers]);

  const currentGroup = useMemo(() => (Array.isArray(layerGroups) ? layerGroups.find(g => g.id === selectedGroupId) : null), [layerGroups, selectedGroupId]);

  const selectIdsExactly = (ids = []) => {
    if (!toggleLayerSelection) return;
    clearSelection && clearSelection();
    const unique = Array.from(new Set(ids));
    for (const id of unique) toggleLayerSelection(id);
  };

  // Keep the manual member input aligned with the current canvas selection.
  useEffect(() => {
    const selection = Array.isArray(selectedLayerIds)
      ? selectedLayerIds
          .map(id => layerIndexToId.indexOf(id))
          .filter(idx => idx >= 0)
          .map(idx => idx + 1)
          .sort((a, b) => a - b)
      : [];
    const text = selection.length ? selection.join(',') : '';
    setMemberText(prev => (prev === text ? prev : text));
  }, [selectedLayerIds, layerIndexToId]);

  const handleCreateFromSelection = () => {
    if (!createGroup) return;
    const id = createGroup({ name: newName || 'Group', color: newColor, memberIds: Array.isArray(selectedLayerIds) ? selectedLayerIds : [] });
    setSelectedGroupId(id);
    setEditTarget && setEditTarget({ type: 'group', groupId: id });
  };

  const handleCreateEmpty = () => {
    if (!createGroup) return;
    const id = createGroup({ name: newName || 'Group', color: newColor, memberIds: [] });
    setSelectedGroupId(id);
    setEditTarget && setEditTarget({ type: 'group', groupId: id });
  };

  const parseMembersFromText = () => {
    const idxs = parseIndexList(memberText);
    const ids = idxs.map(i => layerIndexToId[i]).filter(Boolean);
    return ids;
  };

  const addMembersFromText = () => {
    if (!currentGroup) return;
    const ids = parseMembersFromText();
    addMembersToGroup && addMembersToGroup(currentGroup.id, ids);
  };

  const removeMembersFromText = () => {
    if (!currentGroup) return;
    const ids = parseMembersFromText();
    removeMembersFromGroup && removeMembersFromGroup(currentGroup.id, ids);
  };

  const selectMembers = () => {
    if (!currentGroup || !Array.isArray(currentGroup.memberIds)) return;
    selectIdsExactly(currentGroup.memberIds);
  };

  return (
    <div className="control-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div className="dc-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <strong>Layer Groups</strong>
        <span style={{ opacity: 0.8 }}>Shortcut: 6</span>
      </div>

      {/* Group List */}
      <div className="dc-inner" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto auto', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ opacity: 0.8 }}>Groups</span>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {(layerGroups || []).map(g => (
              <button
                key={g.id}
                className={`btn-compact-secondary ${selectedGroupId === g.id ? 'active' : ''}`}
                onClick={() => {
                  setSelectedGroupId(g.id);
                  selectIdsExactly(g.memberIds || []);
                  setEditTarget && setEditTarget({ type: 'group', groupId: g.id });
                }}
                title={`${g.name || 'Group'} • ${g.memberIds?.length || 0} layers`}
                style={{ borderColor: g.color || '#7c84ff' }}
              >
                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 999, background: g.color || '#7c84ff', marginRight: 6 }} />
                {g.name || 'Group'} ({g.memberIds?.length || 0})
              </button>
            ))}
          </div>
          {currentGroup && (
            <button className="btn-compact-secondary" onClick={() => deleteGroup && deleteGroup(currentGroup.id)}>Delete</button>
          )}
          {currentGroup && (
            <button className="btn-compact-secondary" onClick={selectMembers}>Select members</button>
          )}
          <div />
        </div>
      </div>

      {/* Create / Rename */}
      <div className="dc-inner" style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '0.5rem', alignItems: 'center' }}>
        <input className="compact-input" placeholder="Group name" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <input title="Color" type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} style={{ width: 44, height: 28 }} />
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button className="btn-compact-secondary" onClick={handleCreateFromSelection} title="Create from current selection">Create from Selection</button>
          <button className="btn-compact-secondary" onClick={handleCreateEmpty} title="Create empty group">Create Empty</button>
        </div>
      </div>

      {/* Members from Text */}
      <div className="dc-inner" style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '0.5rem', alignItems: 'center' }}>
        <input className="compact-input" placeholder="Members (e.g., 1,3,5-7)" value={memberText} onChange={(e) => setMemberText(e.target.value)} />
        <button className="btn-compact-secondary" onClick={addMembersFromText} disabled={!currentGroup}>Add</button>
        <button className="btn-compact-secondary" onClick={removeMembersFromText} disabled={!currentGroup}>Remove</button>
      </div>

      <div className="compact-row" style={{ opacity: 0.8 }}>
        <span>Tip: Shift+Click on the canvas to build a selection. The Layer tab dropdown lets you target that selection or a group for parameter edits.</span>
      </div>
    </div>
  );
}
