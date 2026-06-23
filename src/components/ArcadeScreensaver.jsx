import React, { useEffect, useMemo, useRef, useState } from 'react';
import { updateKioskDiagnostic } from '../utils/kioskDiagnostics.js';

const DEFAULT_IDLE_MS = 60_000;
const DEBUG_IDLE_MS = 10_000;
const DEFAULT_VIDEO_SRC = '/screensaver.mp4';

const readScreensaverVideoSrc = () => {
  if (typeof window === 'undefined') return DEFAULT_VIDEO_SRC;
  const params = new URLSearchParams(window.location.search || '');
  return params.get('screensaver') || DEFAULT_VIDEO_SRC;
};

const readScreensaverIdleMs = (fallback) => {
  if (typeof window === 'undefined') return fallback;
  const params = new URLSearchParams(window.location.search || '');
  const parsed = Number(params.get('screensaverIdleMs'));
  return Number.isFinite(parsed) && parsed >= 1_000 ? parsed : fallback;
};

export const isScreensaverForced = () => {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search || '');
  return ['1', 'true', 'yes', 'on'].includes((params.get('screensaverEnabled') || '').toLowerCase());
};

const isScreensaverDebug = () => {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search || '');
  return ['1', 'true', 'yes', 'on'].includes((params.get('screensaverDebug') || '').toLowerCase());
};

const ArcadeScreensaver = ({ enabled = false, idleMs = DEFAULT_IDLE_MS, onActiveChange }) => {
  const [active, setActive] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(Math.ceil(idleMs / 1000));
  const [videoAvailable, setVideoAvailable] = useState(true);
  const deadlineRef = useRef(0);
  const timeoutRef = useRef(null);
  const tickerRef = useRef(null);
  const videoRef = useRef(null);
  const videoSrc = useMemo(readScreensaverVideoSrc, []);
  const debug = useMemo(isScreensaverDebug, []);
  const resolvedIdleMs = useMemo(
    () => readScreensaverIdleMs(debug ? DEBUG_IDLE_MS : idleMs),
    [debug, idleMs],
  );

  useEffect(() => {
    if (!enabled) {
      setActive(false);
      onActiveChange?.(false);
      return undefined;
    }

    const clearTimer = () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };

    const armTimer = () => {
      clearTimer();
      deadlineRef.current = Date.now() + resolvedIdleMs;
      setSecondsRemaining(Math.ceil(resolvedIdleMs / 1000));
      timeoutRef.current = window.setTimeout(() => setActive(true), resolvedIdleMs);
    };

    const markActivity = () => {
      setActive(false);
      armTimer();
    };

    window.addEventListener('keydown', markActivity, true);
    window.addEventListener('keyup', markActivity, true);
    window.addEventListener('artapp:midi-activity', markActivity);
    armTimer();
    tickerRef.current = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
      setSecondsRemaining(remaining);
    }, 250);

    return () => {
      clearTimer();
      if (tickerRef.current) window.clearInterval(tickerRef.current);
      window.removeEventListener('keydown', markActivity, true);
      window.removeEventListener('keyup', markActivity, true);
      window.removeEventListener('artapp:midi-activity', markActivity);
    };
  }, [enabled, onActiveChange, resolvedIdleMs]);

  useEffect(() => {
    if (!enabled) return;
    onActiveChange?.(active);
    updateKioskDiagnostic('screensaver', {
      active,
      videoAvailable,
      videoSrc,
      idleMs: resolvedIdleMs,
      changedAt: Date.now(),
    });
  }, [active, enabled, onActiveChange, resolvedIdleMs, videoAvailable, videoSrc]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!active || !videoAvailable) {
      video.pause();
      video.currentTime = 0;
      return;
    }
    video.play().catch(() => {
      // Muted video normally autoplays; keep the fallback visible if the browser refuses.
    });
  }, [active, videoAvailable]);

  if (!enabled) return null;

  return (
    <div className={`arcade-screensaver ${active ? 'active' : ''}`} aria-hidden={!active}>
      {videoAvailable ? (
        <video
          ref={videoRef}
          className="arcade-screensaver-video"
          src={videoSrc}
          loop
          muted
          playsInline
          preload="auto"
          onError={() => setVideoAvailable(false)}
        />
      ) : (
        <div className="arcade-screensaver-fallback" />
      )}
      {debug && (
        <div className="arcade-screensaver-debug">
          Screensaver {active ? 'active' : `in ${secondsRemaining}s`} | {videoAvailable ? videoSrc : 'video unavailable'}
        </div>
      )}
    </div>
  );
};

export default ArcadeScreensaver;
