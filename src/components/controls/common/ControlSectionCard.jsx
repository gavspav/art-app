import React from 'react';

export default function ControlSectionCard({ title, actions = null, children, style = undefined }) {
  return (
    <div className="control-card" style={style}>
      {title ? (
        <div className="control-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 600 }}>{title}</div>
          {actions}
        </div>
      ) : null}
      {children}
    </div>
  );
}
