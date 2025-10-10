import React from 'react';
import { useMobileArtState } from '../state/useMobileArtState.js';
import '../styles/header.css';

const HeaderBar = () => {
  const {
    isDrawerOpen,
    toggleDrawer,
    resetShape,
    randomizeShape,
    palette,
  } = useMobileArtState();

  return (
    <header className="header-bar">
      <div className="header-title">
        <span className="brand-badge">gav</span>
        <span className="brand-text">gavxflx</span>
      </div>
      <div className="header-actions">
        <button type="button" className="header-btn" onClick={resetShape}>
          Reset
        </button>
        <button type="button" className="header-btn" onClick={randomizeShape}>
          Randomize
        </button>
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
      <div className="header-palette">
        {palette?.name}
      </div>
    </header>
  );
};

export default HeaderBar;
