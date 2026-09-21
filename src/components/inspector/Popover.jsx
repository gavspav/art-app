import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

// Inline disclosure panel anchored beneath a control. Closes on Escape or an
// outside pointer press. Rendered in flow so it scrolls with the inspector.
export default function Popover({ open, onClose, title, children, id, anchorRef }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = event => { if (event.key === 'Escape') onClose?.(); };
    const onPointer = event => {
      const node = ref.current;
      if (!node || node.contains(event.target) || anchorRef?.current?.contains(event.target)) return;
      onClose?.();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer, true);
    };
  }, [anchorRef, onClose, open]);
  if (!open) return null;
  return (
    <div className="insp-popover" ref={ref} id={id} role="group" aria-label={title}>
      <div className="insp-popover-head">
        <span>{title}</span>
        <button type="button" onClick={onClose} aria-label={`Close ${title}`}><X size={14} /></button>
      </div>
      {children}
    </div>
  );
}
