import React, { useState, useEffect, useMemo, useRef } from 'react';

const HoverDropdown = ({ value, options, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredValue, setHoveredValue] = useState(value);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  useEffect(() => {
    setHoveredValue(value);
  }, [value]);

  const handleToggle = (e) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  const handleItemHover = (itemValue) => {
    setHoveredValue(itemValue);
    onChange(itemValue);
  };

  const handleItemClick = (e, itemValue) => {
    e.stopPropagation();
    onChange(itemValue);
    setHoveredValue(itemValue);
    setIsOpen(false);
  };

  const currentLabel = useMemo(() => {
    for (const group of options) {
      const item = group.items.find(i => i.value === value);
      if (item) return item.label;
    }
    return 'Select...';
  }, [value, options]);

  return (
    <div className="hover-dropdown" ref={dropdownRef} style={{ display: 'inline-block', width: '100%' }}>
      <button
        type="button"
        className="hover-dropdown-toggle compact-select"
        onClick={handleToggle}
        style={{
          padding: '0.25rem 0.5rem',
          cursor: 'pointer',
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: '4px',
          background: 'rgba(255,255,255,0.05)',
          color: 'inherit',
          fontSize: 'inherit',
          minWidth: '150px',
          width: '100%',
          textAlign: 'left',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>{currentLabel}</span>
        <span style={{ marginLeft: '0.5rem', opacity: 0.6 }}>{isOpen ? '▲' : '▼'}</span>
      </button>
      {isOpen && (
        <div
          className="hover-dropdown-menu"
          style={{
            marginTop: '2px',
            marginBottom: '0.5rem',
            width: '100%',
            maxHeight: '400px',
            overflowY: 'auto',
            background: 'rgba(20, 20, 30, 0.98)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            backdropFilter: 'blur(10px)',
          }}
        >
          {options.map((group, groupIdx) => (
            <div key={groupIdx} style={{ padding: '0.25rem 0' }}>
              {group.label && (
                <div
                  style={{
                    padding: '0.35rem 0.75rem',
                    fontSize: '0.75rem',
                    fontWeight: 'bold',
                    opacity: 0.6,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  {group.label}
                </div>
              )}
              {group.items.map((item) => (
                <div
                  key={item.value}
                  onMouseEnter={() => handleItemHover(item.value)}
                  onClick={(e) => handleItemClick(e, item.value)}
                  style={{
                    padding: '0.5rem 0.75rem',
                    cursor: 'pointer',
                    background: hoveredValue === item.value ? 'rgba(100, 150, 255, 0.3)' : 'transparent',
                    transition: 'background 0.1s ease',
                    borderLeft: value === item.value ? '3px solid rgba(100, 150, 255, 0.8)' : '3px solid transparent',
                  }}
                >
                  {item.label}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default HoverDropdown;
