import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useMobileArtState } from '../state/useMobileArtState.js';
import { isDesktop } from '../utils/platform.js';
import PrintDialog from './PrintDialog.jsx';
import '../styles/header.css';

const HeaderBar = () => {
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);
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
  const [motionReady, setMotionReady] = useState(false);
  const lastMagnitude = useRef(null);
  const lastShakeTime = useRef(0);

  const ensureMotionPermission = useCallback(async () => {
    if (motionReady) return;
    if (typeof DeviceMotionEvent === 'undefined') return;
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      try {
        const status = await DeviceMotionEvent.requestPermission();
        if (status === 'granted') {
          setMotionReady(true);
        }
      } catch (error) {
        console.error(error);
      }
    } else {
      setMotionReady(true);
    }
  }, [motionReady]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (motionReady) return undefined;
    const handler = () => {
      ensureMotionPermission();
    };
    window.addEventListener('pointerdown', handler, { passive: true });
    window.addEventListener('touchstart', handler, { passive: true });
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('pointerdown', handler, { passive: true });
      window.removeEventListener('touchstart', handler, { passive: true });
      window.removeEventListener('keydown', handler);
    };
  }, [ensureMotionPermission, motionReady]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof DeviceMotionEvent === 'undefined') return undefined;
    if (typeof DeviceMotionEvent.requestPermission !== 'function') {
      if (!motionReady) {
        setMotionReady(true);
      }
    }
    if (!motionReady) return undefined;
    const handleMotion = (event) => {
      const data = event.acceleration ?? event.accelerationIncludingGravity;
      if (!data) return;
      const { x = 0, y = 0, z = 0 } = data;
      const magnitude = Math.sqrt(x * x + y * y + z * z);
      if (lastMagnitude.current == null) {
        lastMagnitude.current = magnitude;
        return;
      }
      const delta = Math.abs(magnitude - lastMagnitude.current);
      lastMagnitude.current = magnitude;
      const now = Date.now();
      if ((delta > 4 || magnitude > 20) && now - lastShakeTime.current > 800) {
        lastShakeTime.current = now;
        randomizeShape();
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          navigator.vibrate(50);
        }
      }
    };
    window.addEventListener('devicemotion', handleMotion);
    return () => {
      window.removeEventListener('devicemotion', handleMotion);
      lastMagnitude.current = null;
    };
  }, [motionReady, randomizeShape]);

  const handleRandomizeClick = useCallback(async () => {
    await ensureMotionPermission();
    randomizeShape();
  }, [ensureMotionPermission, randomizeShape]);

  return (
    <header className="header-bar">
      <div className="header-title">
        <button
          type="button"
          className="brand-text"
          onClick={resetShape}
          aria-label="Reset artwork"
        >
          gavxflx
        </button>
      </div>
      <div className="header-actions">
        <button type="button" className="header-btn" onClick={handleRandomizeClick} aria-label="Randomize">
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
          className="header-btn"
          onClick={() => setIsPrintDialogOpen(true)}
          aria-label="Order print"
        >
          🖼️ Print
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
      <div className="header-palette" style={{ color: foregroundColor }}>
        {isDesktopMode ? 'Desktop Mode' : 'Mobile Mode'}
      </div>
      <PrintDialog isOpen={isPrintDialogOpen} onClose={() => setIsPrintDialogOpen(false)} />
    </header>
  );
};

export default HeaderBar;
