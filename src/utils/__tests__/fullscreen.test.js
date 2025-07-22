import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isFullscreen,
  enterFullscreen,
  exitFullscreen,
  toggleFullscreen,
  onFullscreenChange
} from '../canvas/fullscreen.js';

// Mock DOM methods
const mockElement = {
  requestFullscreen: vi.fn(() => Promise.resolve()),
  mozRequestFullScreen: vi.fn(() => Promise.resolve()),
  webkitRequestFullscreen: vi.fn(() => Promise.resolve()),
  msRequestFullscreen: vi.fn(() => Promise.resolve())
};

describe('fullscreen utilities', () => {
  beforeEach(() => {
    // Reset document properties
    Object.defineProperty(document, 'fullscreenElement', {
      writable: true,
      value: null
    });
    Object.defineProperty(document, 'webkitFullscreenElement', {
      writable: true,
      value: null
    });
    Object.defineProperty(document, 'mozFullScreenElement', {
      writable: true,
      value: null
    });
    Object.defineProperty(document, 'msFullscreenElement', {
      writable: true,
      value: null
    });

    // Mock document methods
    document.exitFullscreen = vi.fn(() => Promise.resolve());
    document.mozCancelFullScreen = vi.fn(() => Promise.resolve());
    document.webkitExitFullscreen = vi.fn(() => Promise.resolve());
    document.msExitFullscreen = vi.fn(() => Promise.resolve());

    // Reset element mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isFullscreen', () => {
    it('should return false when not in fullscreen', () => {
      expect(isFullscreen()).toBe(false);
    });

    it('should return true when fullscreenElement is set', () => {
      document.fullscreenElement = mockElement;
      expect(isFullscreen()).toBe(true);
    });

    it('should return true when webkitFullscreenElement is set', () => {
      document.webkitFullscreenElement = mockElement;
      expect(isFullscreen()).toBe(true);
    });

    it('should return true when mozFullScreenElement is set', () => {
      document.mozFullScreenElement = mockElement;
      expect(isFullscreen()).toBe(true);
    });

    it('should return true when msFullscreenElement is set', () => {
      document.msFullscreenElement = mockElement;
      expect(isFullscreen()).toBe(true);
    });
  });

  describe('enterFullscreen', () => {
    it('should call requestFullscreen when available', async () => {
      await enterFullscreen(mockElement);
      expect(mockElement.requestFullscreen).toHaveBeenCalled();
    });

    it('should call mozRequestFullScreen when requestFullscreen not available', async () => {
      const element = { ...mockElement };
      delete element.requestFullscreen;
      
      await enterFullscreen(element);
      expect(element.mozRequestFullScreen).toHaveBeenCalled();
    });

    it('should call webkitRequestFullscreen when others not available', async () => {
      const element = { ...mockElement };
      delete element.requestFullscreen;
      delete element.mozRequestFullScreen;
      
      await enterFullscreen(element);
      expect(element.webkitRequestFullscreen).toHaveBeenCalledWith(Element.ALLOW_KEYBOARD_INPUT);
    });

    it('should call msRequestFullscreen as fallback', async () => {
      const element = { ...mockElement };
      delete element.requestFullscreen;
      delete element.mozRequestFullScreen;
      delete element.webkitRequestFullscreen;
      
      await enterFullscreen(element);
      expect(element.msRequestFullscreen).toHaveBeenCalled();
    });

    it('should reject when no fullscreen methods available', async () => {
      const element = {};
      
      await expect(enterFullscreen(element)).rejects.toThrow('Fullscreen not supported');
    });
  });

  describe('exitFullscreen', () => {
    it('should call document.exitFullscreen when available', async () => {
      await exitFullscreen();
      expect(document.exitFullscreen).toHaveBeenCalled();
    });

    it('should call mozCancelFullScreen when exitFullscreen not available', async () => {
      const originalExitFullscreen = document.exitFullscreen;
      document.exitFullscreen = undefined;
      
      await exitFullscreen();
      expect(document.mozCancelFullScreen).toHaveBeenCalled();
      
      document.exitFullscreen = originalExitFullscreen;
    });

    it('should call webkitExitFullscreen when others not available', async () => {
      const originalExitFullscreen = document.exitFullscreen;
      const originalMozCancel = document.mozCancelFullScreen;
      document.exitFullscreen = undefined;
      document.mozCancelFullScreen = undefined;
      
      await exitFullscreen();
      expect(document.webkitExitFullscreen).toHaveBeenCalled();
      
      document.exitFullscreen = originalExitFullscreen;
      document.mozCancelFullScreen = originalMozCancel;
    });

    it('should call msExitFullscreen as fallback', async () => {
      const originalExitFullscreen = document.exitFullscreen;
      const originalMozCancel = document.mozCancelFullScreen;
      const originalWebkitExit = document.webkitExitFullscreen;
      document.exitFullscreen = undefined;
      document.mozCancelFullScreen = undefined;
      document.webkitExitFullscreen = undefined;
      
      await exitFullscreen();
      expect(document.msExitFullscreen).toHaveBeenCalled();
      
      document.exitFullscreen = originalExitFullscreen;
      document.mozCancelFullScreen = originalMozCancel;
      document.webkitExitFullscreen = originalWebkitExit;
    });

    it('should reject when no exit methods available', async () => {
      const originalExitFullscreen = document.exitFullscreen;
      const originalMozCancel = document.mozCancelFullScreen;
      const originalWebkitExit = document.webkitExitFullscreen;
      const originalMsExit = document.msExitFullscreen;
      
      document.exitFullscreen = undefined;
      document.mozCancelFullScreen = undefined;
      document.webkitExitFullscreen = undefined;
      document.msExitFullscreen = undefined;
      
      await expect(exitFullscreen()).rejects.toThrow('Exit fullscreen not supported');
      
      document.exitFullscreen = originalExitFullscreen;
      document.mozCancelFullScreen = originalMozCancel;
      document.webkitExitFullscreen = originalWebkitExit;
      document.msExitFullscreen = originalMsExit;
    });
  });

  describe('toggleFullscreen', () => {
    it('should enter fullscreen when not in fullscreen', async () => {
      document.fullscreenElement = null;
      
      await toggleFullscreen(mockElement);
      expect(mockElement.requestFullscreen).toHaveBeenCalled();
    });

    it('should exit fullscreen when in fullscreen', async () => {
      document.fullscreenElement = mockElement;
      
      await toggleFullscreen(mockElement);
      expect(document.exitFullscreen).toHaveBeenCalled();
    });
  });

  describe('onFullscreenChange', () => {
    it('should add event listeners for all fullscreen events', () => {
      const callback = vi.fn();
      const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
      
      onFullscreenChange(callback);
      
      expect(addEventListenerSpy).toHaveBeenCalledWith('fullscreenchange', expect.any(Function));
      expect(addEventListenerSpy).toHaveBeenCalledWith('webkitfullscreenchange', expect.any(Function));
      expect(addEventListenerSpy).toHaveBeenCalledWith('mozfullscreenchange', expect.any(Function));
      expect(addEventListenerSpy).toHaveBeenCalledWith('MSFullscreenChange', expect.any(Function));
    });

    it('should call callback with fullscreen state', () => {
      const callback = vi.fn();
      const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
      
      onFullscreenChange(callback);
      
      // Get the handler function that was registered
      const handler = addEventListenerSpy.mock.calls[0][1];
      
      // Simulate fullscreen change
      document.fullscreenElement = mockElement;
      handler();
      
      expect(callback).toHaveBeenCalledWith(true);
    });

    it('should return cleanup function that removes event listeners', () => {
      const callback = vi.fn();
      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');
      
      const cleanup = onFullscreenChange(callback);
      cleanup();
      
      expect(removeEventListenerSpy).toHaveBeenCalledWith('fullscreenchange', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('webkitfullscreenchange', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('mozfullscreenchange', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('MSFullscreenChange', expect.any(Function));
    });
  });
});