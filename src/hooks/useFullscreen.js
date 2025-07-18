import { useState, useEffect } from 'react';

export const useFullscreen = (ref) => {
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggle = () => {
    if (!document.fullscreenElement) {
      ref.current?.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    const handleChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleChange);
    };
  }, []);

  return { isFullscreen, toggle };
};
