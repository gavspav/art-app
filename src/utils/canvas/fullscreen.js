/**
 * Fullscreen API utilities
 * Cross-browser fullscreen functionality for canvas elements
 */

/**
 * Checks if fullscreen mode is currently active
 * @returns {boolean} True if in fullscreen mode
 */
export const isFullscreen = () => {
  return !!(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement
  );
};

/**
 * Enters fullscreen mode for the specified element
 * @param {HTMLElement} element - Element to make fullscreen
 * @returns {Promise} Promise that resolves when fullscreen is entered
 */
export const enterFullscreen = (element) => {
  if (element.requestFullscreen) {
    return element.requestFullscreen();
  } else if (element.mozRequestFullScreen) {
    return element.mozRequestFullScreen();
  } else if (element.webkitRequestFullscreen) {
    return element.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT);
  } else if (element.msRequestFullscreen) {
    return element.msRequestFullscreen();
  }
  return Promise.reject(new Error('Fullscreen not supported'));
};

/**
 * Exits fullscreen mode
 * @returns {Promise} Promise that resolves when fullscreen is exited
 */
export const exitFullscreen = () => {
  if (document.exitFullscreen) {
    return document.exitFullscreen();
  } else if (document.mozCancelFullScreen) {
    return document.mozCancelFullScreen();
  } else if (document.webkitExitFullscreen) {
    return document.webkitExitFullscreen();
  } else if (document.msExitFullscreen) {
    return document.msExitFullscreen();
  }
  return Promise.reject(new Error('Exit fullscreen not supported'));
};

/**
 * Toggles fullscreen mode for the specified element
 * @param {HTMLElement} element - Element to toggle fullscreen for
 * @returns {Promise} Promise that resolves when toggle is complete
 */
export const toggleFullscreen = (element) => {
  if (isFullscreen()) {
    return exitFullscreen();
  } else {
    return enterFullscreen(element);
  }
};

/**
 * Adds event listeners for fullscreen change events
 * @param {function} callback - Function to call when fullscreen state changes
 * @returns {function} Cleanup function to remove event listeners
 */
export const onFullscreenChange = (callback) => {
  const events = [
    'fullscreenchange',
    'webkitfullscreenchange',
    'mozfullscreenchange',
    'MSFullscreenChange'
  ];
  
  const handler = () => callback(isFullscreen());
  
  events.forEach(event => {
    document.addEventListener(event, handler);
  });
  
  // Return cleanup function
  return () => {
    events.forEach(event => {
      document.removeEventListener(event, handler);
    });
  };
};