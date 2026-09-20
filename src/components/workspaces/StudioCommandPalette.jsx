import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';

export default function StudioCommandPalette({ open, commands, onClose }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return commands.filter(command => command.enabled !== false && (
      !needle || `${command.label} ${command.group || ''} ${command.shortcut || ''}`.toLowerCase().includes(needle)
    )).slice(0, 18);
  }, [commands, query]);

  if (!open) return null;
  const run = command => {
    command.run?.();
    onClose();
  };

  return (
    <div className="studio-command-backdrop" role="presentation" onPointerDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="studio-command-palette" role="dialog" aria-modal="true" aria-label="Command search">
        <div className="studio-command-input-row">
          <Search size={18} aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Escape') onClose();
              if (event.key === 'Enter' && matches[0]) run(matches[0]);
            }}
            placeholder="Search tools, panels, and actions…"
            aria-label="Search commands"
          />
          <button type="button" onClick={onClose} aria-label="Close command search"><X size={18} /></button>
        </div>
        <div className="studio-command-results" role="listbox">
          {matches.map(command => (
            <button key={command.id} type="button" role="option" onClick={() => run(command)}>
              <span><small>{command.group}</small>{command.label}</span>
              {command.shortcut && <kbd>{command.shortcut}</kbd>}
            </button>
          ))}
          {matches.length === 0 && <p>No matching commands</p>}
        </div>
      </section>
    </div>
  );
}
