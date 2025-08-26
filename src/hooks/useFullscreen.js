import { useState, useEffect, useCallback } from 'react';

// Cross-browser helpers
const getFullscreenElement = () =>
  document.fullscreenElement ||
  document.webkitFullscreenElement ||
  document.mozFullScreenElement ||
  document.msFullscreenElement ||
  null;

const requestFullscreen = (el) => {
  if (!el) return;
  const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
  if (req) {
    try {
      const ret = req.call(el);
      // Some browsers return a promise
      if (ret && typeof ret.then === 'function') return ret;
    } catch (err) {
      console.error(`Error attempting to enable full-screen mode: ${err?.message} (${err?.name})`);
    }
  }
};

const exitFullscreen = () => {
  const exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
  if (exit) {
    try {
      const ret = exit.call(document);
      if (ret && typeof ret.then === 'function') return ret;
    } catch (err) {
      console.error(`Error attempting to exit full-screen mode: ${err?.message} (${err?.name})`);
    }
  }
};

export const useFullscreen = (ref) => {
  const [isFullscreen, setIsFullscreen] = useState(!!getFullscreenElement());

  const toggle = useCallback(() => {
    if (getFullscreenElement()) {
      exitFullscreen();
    } else if (ref?.current) {
      requestFullscreen(ref.current);
    }
  }, [ref]);

  useEffect(() => {
    const handleChange = () => setIsFullscreen(!!getFullscreenElement());

    document.addEventListener('fullscreenchange', handleChange);
    document.addEventListener('webkitfullscreenchange', handleChange);
    document.addEventListener('mozfullscreenchange', handleChange);
    document.addEventListener('MSFullscreenChange', handleChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleChange);
      document.removeEventListener('webkitfullscreenchange', handleChange);
      document.removeEventListener('mozfullscreenchange', handleChange);
      document.removeEventListener('MSFullscreenChange', handleChange);
    };
  }, []);

  return { isFullscreen, toggle };
};
