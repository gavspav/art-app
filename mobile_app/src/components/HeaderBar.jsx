import React, { useState } from 'react';
import { useMobileArtState } from '../state/useMobileArtState.js';
import { isDesktop } from '../utils/platform.js';
import '../styles/header.css';

const HeaderBar = () => {
  const {
    isDrawerOpen,
    toggleDrawer,
    resetShape,
    randomizeShape,
    foregroundColor,
    isNodeEditMode,
    toggleNodeEditMode,
  } = useMobileArtState();

  const [isDesktopMode] = useState(isDesktop());

  return (
    <header className="header-bar">
      <div className="header-title">
        <span className="brand-text">gavxflx</span>
      </div>
      <div className="header-actions">
        <button type="button" className="header-btn" onClick={resetShape}>
          Reset
        </button>
        <button type="button" className="header-btn" onClick={randomizeShape} aria-label="Randomize">
          🎲
        </button>
        {isDesktopMode && (
          <button
            type="button"
            className={`header-btn ${isNodeEditMode ? 'active' : ''}`}
            onClick={toggleNodeEditMode}
            aria-pressed={isNodeEditMode}
            title="Toggle node editing mode"
          >
            {isNodeEditMode ? '✓ Edit Nodes' : 'Edit Nodes'}
          </button>
        )}
        <button
          type="button"
          className="header-btn primary"
          onClick={toggleDrawer}
          aria-expanded={isDrawerOpen}
          aria-label={isDrawerOpen ? 'Hide controls' : 'Show controls'}
        >
          {isDrawerOpen ? 'Hide' : 'Controls'}
        </button>
      </div>
      <div className="header-palette" style={{ color: foregroundColor }}>
        {isDesktopMode ? 'Desktop Mode' : 'Mobile Mode'}
      </div>
    </header>
  );
};

export default HeaderBar;
