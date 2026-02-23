import React from 'react';

const formatTimestamp = (ts) => {
  if (!ts) return 'Unknown time';
  try {
    const date = new Date(ts);
    if (Number.isNaN(date.getTime())) return ts;
    return date.toLocaleString();
  } catch {
    return ts;
  }
};

const AutosaveRecovery = ({
  slots = [],
  onRestore,
  onClearAll,
  onRefresh,
  onClose,
  message,
  error,
}) => {
  return (
    <div className="control-card autosave-recovery" style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
        <h3 style={{ margin: 0 }}>Autosave Recovery</h3>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="button" className="control-button" onClick={onRefresh}>Refresh</button>
          <button type="button" className="control-button" onClick={onClose}>Close</button>
        </div>
      </div>
      {message && (
        <div style={{ padding: '0.5rem', borderRadius: '4px', background: 'rgba(76, 175, 80, 0.15)', color: '#2e7d32' }}>
          {message}
        </div>
      )}
      {error && (
        <div style={{ padding: '0.5rem', borderRadius: '4px', background: 'rgba(244, 67, 54, 0.15)', color: '#c62828' }}>
          {error}
        </div>
      )}
      {slots.length === 0 ? (
        <div style={{ fontSize: '0.9rem', opacity: 0.75 }}>No autosaves found.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {slots.map((slot, idx) => (
            <div key={slot.key || idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', borderRadius: '6px', background: 'rgba(255,255,255,0.04)' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontWeight: 600 }}>{formatTimestamp(slot.timestamp)}</span>
                <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>{slot.key}</span>
              </div>
              <button
                type="button"
                className="control-button"
                onClick={() => onRestore && onRestore(slot.key)}
              >
                Restore
              </button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{ fontSize: '0.85rem', opacity: 0.7 }}>Autosaves rotate through {slots.length > 0 ? slots.length : 3} slots.</span>
        <button type="button" className="control-button" onClick={onClearAll}>
          Clear All
        </button>
      </div>
    </div>
  );
};

export default AutosaveRecovery;
