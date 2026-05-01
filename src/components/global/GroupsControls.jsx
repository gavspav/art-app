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
    parameterTargetMode,
    setParameterTargetMode,
    // actions
    createGroup,
    renameGroup,
    setGroupColor,
    addMembersToGroup,
    removeMembersFromGroup,
    deleteGroup,
    setEditTarget,
    toggleLayerSelection,
    clearSelection,
  } = useAppState() || {};

  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#7c84ff');
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('#7c84ff');
  const [memberText, setMemberText] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState(editTarget?.type === 'group' ? editTarget.groupId : null);

  const layerIndexToId = useMemo(() => (Array.isArray(layers) ? layers.map(l => l?.id).filter(Boolean) : []), [layers]);

  const currentGroup = useMemo(() => (Array.isArray(layerGroups) ? layerGroups.find(g => g.id === selectedGroupId) : null), [layerGroups, selectedGroupId]);
  const selectedLayerSet = useMemo(() => new Set(Array.isArray(selectedLayerIds) ? selectedLayerIds : []), [selectedLayerIds]);
  const currentMemberSet = useMemo(() => new Set(Array.isArray(currentGroup?.memberIds) ? currentGroup.memberIds : []), [currentGroup]);
  const layerRows = useMemo(() => (
    Array.isArray(layers)
      ? layers.map((layer, index) => ({
        id: layer?.id,
        index,
        name: layer?.name || `Layer ${index + 1}`,
      })).filter(layer => layer.id)
      : []
  ), [layers]);

  useEffect(() => {
    if (editTarget?.type === 'group' && editTarget.groupId) {
      setSelectedGroupId(editTarget.groupId);
      return;
    }
    setSelectedGroupId(prev => (
      prev && Array.isArray(layerGroups) && layerGroups.some(group => group.id === prev)
        ? prev
        : null
    ));
  }, [editTarget, layerGroups]);

  useEffect(() => {
    if (!currentGroup) {
      setEditName('');
      setEditColor('#7c84ff');
      return;
    }
    setEditName(currentGroup.name || 'Group');
    setEditColor(currentGroup.color || '#7c84ff');
  }, [currentGroup]);

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

  const toggleMember = (layerId) => {
    if (!currentGroup || !layerId) return;
    if (currentMemberSet.has(layerId)) {
      removeMembersFromGroup && removeMembersFromGroup(currentGroup.id, [layerId]);
    } else {
      addMembersToGroup && addMembersToGroup(currentGroup.id, [layerId]);
    }
  };

  const handleRenameCurrentGroup = () => {
    if (!currentGroup || !renameGroup) return;
    renameGroup(currentGroup.id, editName.trim() || 'Group');
  };

  const handleColorCurrentGroup = (color) => {
    setEditColor(color);
    if (!currentGroup || !setGroupColor) return;
    setGroupColor(currentGroup.id, color);
  };

  return (
    <div className="control-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div className="dc-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <strong>Layer Groups</strong>
        <span style={{ opacity: 0.8 }}>Shortcut: 6</span>
      </div>

      {/* Group List */}
      <div className="dc-inner" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div className="dc-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ opacity: 0.8 }}>Groups</span>
          {currentGroup && (
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button
                className="btn-compact-secondary"
                onClick={() => {
                  deleteGroup && deleteGroup(currentGroup.id);
                  setSelectedGroupId(null);
                }}
              >
                Delete
              </button>
              <button className="btn-compact-secondary" onClick={selectMembers}>Select members</button>
            </div>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.5rem' }}>
            {(layerGroups || []).length > 0 ? (layerGroups || []).map(g => (
              <button
                key={g.id}
                className={`btn-compact-secondary ${selectedGroupId === g.id ? 'active' : ''}`}
                onClick={() => {
                  setSelectedGroupId(g.id);
                  selectIdsExactly(g.memberIds || []);
                  setEditTarget && setEditTarget({ type: 'group', groupId: g.id });
                }}
                title={`${g.name || 'Group'} • ${g.memberIds?.length || 0} layers`}
                style={{
                  borderColor: selectedGroupId === g.id ? (g.color || '#7c84ff') : 'rgba(255,255,255,0.16)',
                  justifyContent: 'flex-start',
                  height: 'auto',
                  minHeight: 36,
                  padding: '0.35rem 0.5rem',
                }}
              >
                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 999, background: g.color || '#7c84ff', marginRight: 6 }} />
                {g.name || 'Group'} ({g.memberIds?.length || 0})
              </button>
            )) : (
              <span style={{ color: 'rgba(255,255,255,0.58)', fontSize: '0.86rem' }}>No groups yet</span>
            )}
        </div>
      </div>

      {/* Create */}
      <div className="dc-inner" style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '0.5rem', alignItems: 'center' }}>
        <input className="compact-input" placeholder="Group name" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <input title="Color" type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} style={{ width: 44, height: 28 }} />
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button
            className="btn-compact-secondary"
            onClick={handleCreateFromSelection}
            title="Create from current selection"
            disabled={selectedLayerSet.size === 0}
          >
            Create from Selection
          </button>
          <button className="btn-compact-secondary" onClick={handleCreateEmpty} title="Create empty group">Create Empty</button>
        </div>
      </div>

      {currentGroup && (
        <div className="dc-inner" style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '0.5rem', alignItems: 'center' }}>
          <input
            className="compact-input"
            placeholder="Rename selected group"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleRenameCurrentGroup}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur();
              }
            }}
          />
          <input
            title="Group color"
            type="color"
            value={editColor}
            onChange={(e) => handleColorCurrentGroup(e.target.value)}
            style={{ width: 44, height: 28 }}
          />
          <button className="btn-compact-secondary" onClick={handleRenameCurrentGroup}>Rename</button>
        </div>
      )}

      {currentGroup && (
        <div className="dc-inner" style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
          <div className="dc-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
            <strong>Members</strong>
            <span style={{ opacity: 0.72, fontSize: '0.82rem' }}>{currentMemberSet.size} selected</span>
          </div>
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
            {Array.from(currentMemberSet).map(memberId => {
              const row = layerRows.find(layer => layer.id === memberId);
              return (
                <button
                  key={memberId}
                  type="button"
                  className="btn-compact-secondary"
                  onClick={() => toggleMember(memberId)}
                  title="Remove from group"
                  style={{ height: 24, padding: '0 0.45rem', fontSize: '0.78rem' }}
                >
                  {row ? `${row.index + 1}. ${row.name}` : 'Missing layer'} x
                </button>
              );
            })}
            {currentMemberSet.size === 0 && (
              <span style={{ color: 'rgba(255,255,255,0.58)', fontSize: '0.86rem' }}>No members in this group</span>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.35rem' }}>
            {layerRows.map(layer => (
              <label
                key={layer.id}
                className="compact-label"
                title={layer.name}
                style={{
                  padding: '0.35rem 0.45rem',
                  border: `1px solid ${currentMemberSet.has(layer.id) ? (currentGroup.color || '#7c84ff') : 'rgba(255,255,255,0.12)'}`,
                  borderRadius: 6,
                  background: currentMemberSet.has(layer.id) ? 'rgba(124,132,255,0.14)' : 'rgba(255,255,255,0.035)',
                  minWidth: 0,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={currentMemberSet.has(layer.id)}
                  onChange={() => toggleMember(layer.id)}
                />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {layer.index + 1}. {layer.name}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Members from Text */}
      <div className="dc-inner" style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '0.5rem', alignItems: 'center' }}>
        <input className="compact-input" placeholder="Members (e.g., 1,3,5-7)" value={memberText} onChange={(e) => setMemberText(e.target.value)} />
        <button className="btn-compact-secondary" onClick={addMembersFromText} disabled={!currentGroup}>Add</button>
        <button className="btn-compact-secondary" onClick={removeMembersFromText} disabled={!currentGroup}>Remove</button>
      </div>

      <div className="compact-row" style={{ opacity: 0.8 }}>
        <span>Shift-click canvas shapes to build a selection. Select a group here or in the Layer tab to batch-edit its members.</span>
      </div>

      {/* Target Mode Selector for Group Parameter Changes */}
      <div className="dc-inner" style={{ marginTop: '0.75rem' }}>
        <div className="dc-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
          <strong>App Parameter Scope</strong>
        </div>
        <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
            <input
              type="radio"
              name="groupTargetMode"
              value="individual"
              checked={parameterTargetMode === 'individual'}
              onChange={() => setParameterTargetMode && setParameterTargetMode('individual')}
            />
            <span>Individual</span>
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
            <input
              type="radio"
              name="groupTargetMode"
              value="global"
              checked={parameterTargetMode === 'global'}
              onChange={() => setParameterTargetMode && setParameterTargetMode('global')}
            />
            <span>Global</span>
          </label>
        </div>
        <div style={{ fontSize: '0.85rem', opacity: 0.75, marginTop: '0.5rem' }}>
          <strong>Individual:</strong> controls edit the active layer, selection, or group.<br />
          <strong>Global:</strong> controls edit every layer.
        </div>
      </div>
    </div>
  );
}
