/**
 * Platform detection utilities
 */

export const isTouchDevice = () => {
  if (typeof window === 'undefined') return false;
  return (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    navigator.msMaxTouchPoints > 0
  );
};

export const isDesktop = () => {
  if (typeof window === 'undefined') return true;
  // Desktop if: not touch AND has reasonable screen size
  return !isTouchDevice() && window.innerWidth >= 768;
};

export const getPlatform = () => {
  if (isDesktop()) return 'desktop';
  return 'mobile';
};
