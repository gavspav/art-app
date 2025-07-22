/**
 * useFullscreen Hook - Manages fullscreen functionality
 * Provides cross-browser fullscreen API abstraction
 */

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Custom hook for managing fullscreen functionality
 * @param {HTMLElement} targetElement - Element to make fullscreen (optional)
 * @returns {Object} Fullscreen management interface
 */
export const useFullscreen = (targetElement = null) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [error, setError] = useState(null);
  const elementRef = useRef(targetElement);

  // Update target element ref
  useEffect(() => {
    elementRef.current = targetElement;
  }, [targetElement]);

  // Check fullscreen API support
  useEffect(() => {
    const checkSupport = () => {
      const element = document.documentElement;
      const supported = !!(
        element.requestFullscreen ||
        element.webkitRequestFullscreen ||
        element.mozRequestFullScreen ||
        element.msRequestFullscreen
      );
      setIsSupported(supported);
    };

    checkSupport();
  }, []);

  // Get the appropriate fullscreen methods for current browser
  const getFullscreenMethods = useCallback(() => {
    const element = elementRef.current || document.documentElement;
    
    // Request fullscreen methods
    const requestMethod = 
      element.requestFullscreen ||
      element.webkitRequestFullscreen ||
      element.mozRequestFullScreen ||
      element.msRequestFullscreen;

    // Exit fullscreen methods
    const exitMethod = 
      document.exitFullscreen ||
      document.webkitExitFullscreen ||
      document.mozCancelFullScreen ||
      document.msExitFullscreen;

    // Fullscreen element properties
    const fullscreenElement = 
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement;

    return {
      request: requestMethod ? requestMethod.bind(element) : null,
      exit: exitMethod ? exitMethod.bind(document) : null,
      element: fullscreenElement
    };
  }, []);

  // Update fullscreen state
  const updateFullscreenState = useCallback(() => {
    const methods = getFullscreenMethods();
    const isCurrentlyFullscreen = !!methods.element;
    setIsFullscreen(isCurrentlyFullscreen);
    
    // Clear any previous errors when state changes
    if (error) {
      setError(null);
    }
  }, [getFullscreenMethods, error]);

  // Handle fullscreen change events
  useEffect(() => {
    const events = [
      'fullscreenchange',
      'webkitfullscreenchange',
      'mozfullscreenchange',
      'MSFullscreenChange'
    ];

    const handleFullscreenChange = () => {
      updateFullscreenState();
    };

    // Add event listeners
    events.forEach(event => {
      document.addEventListener(event, handleFullscreenChange);
    });

    // Initial state check
    updateFullscreenState();

    // Cleanup
    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleFullscreenChange);
      });
    };
  }, [updateFullscreenState]);

  // Handle fullscreen errors
  useEffect(() => {
    const events = [
      'fullscreenerror',
      'webkitfullscreenerror',
      'mozfullscreenerror',
      'MSFullscreenError'
    ];

    const handleFullscreenError = (event) => {
      console.error('Fullscreen error:', event);
      setError('Failed to enter fullscreen mode');
    };

    // Add error event listeners
    events.forEach(event => {
      document.addEventListener(event, handleFullscreenError);
    });

    // Cleanup
    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleFullscreenError);
      });
    };
  }, []);

  // Enter fullscreen mode
  const enter = useCallback(async () => {
    if (!isSupported) {
      const errorMsg = 'Fullscreen is not supported in this browser';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    }

    if (isFullscreen) {
      return { success: true, message: 'Already in fullscreen mode' };
    }

    try {
      const methods = getFullscreenMethods();
      if (!methods.request) {
        const errorMsg = 'Fullscreen request method not available';
        setError(errorMsg);
        return { success: false, error: errorMsg };
      }

      await methods.request();
      return { success: true, message: 'Entered fullscreen mode' };
    } catch (err) {
      console.error('Failed to enter fullscreen:', err);
      const errorMsg = 'Failed to enter fullscreen mode';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    }
  }, [isSupported, isFullscreen, getFullscreenMethods]);

  // Exit fullscreen mode
  const exit = useCallback(async () => {
    if (!isSupported) {
      const errorMsg = 'Fullscreen is not supported in this browser';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    }

    if (!isFullscreen) {
      return { success: true, message: 'Not in fullscreen mode' };
    }

    try {
      const methods = getFullscreenMethods();
      if (!methods.exit) {
        const errorMsg = 'Fullscreen exit method not available';
        setError(errorMsg);
        return { success: false, error: errorMsg };
      }

      await methods.exit();
      return { success: true, message: 'Exited fullscreen mode' };
    } catch (err) {
      console.error('Failed to exit fullscreen:', err);
      const errorMsg = 'Failed to exit fullscreen mode';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    }
  }, [isSupported, isFullscreen, getFullscreenMethods]);

  // Toggle fullscreen mode
  const toggle = useCallback(async () => {
    if (isFullscreen) {
      return await exit();
    } else {
      return await enter();
    }
  }, [isFullscreen, enter, exit]);

  // Clear error message
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Handle escape key to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && isFullscreen) {
        // The browser will handle the escape key automatically,
        // but we can add custom logic here if needed
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullscreen]);

  return {
    // State
    isFullscreen,
    isSupported,
    error,
    
    // Actions
    enter,
    exit,
    toggle,
    
    // Utilities
    clearError,
    
    // Browser compatibility info
    methods: getFullscreenMethods()
  };
};

export default useFullscreen;