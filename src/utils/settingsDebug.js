// Shared helpers for ad-hoc settings performance debugging.
// Enable by running in devtools: window.__artapp_debugSettings = true;
// or localStorage.setItem('artapp-debug-settings', 'true') then reload.

let lastLogTs = 0;
const LOG_THROTTLE_MS = 200;

export const isSettingsDebugEnabled = () => {
  if (typeof window === 'undefined') return false;
  if (window.__artapp_debugSettings === true) return true;
  try {
    return localStorage.getItem('artapp-debug-settings') === 'true';
  } catch {
    return false;
  }
};

export const throttledSettingsDebugLog = (message, details) => {
  if (!isSettingsDebugEnabled()) return;
  const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  if (now - lastLogTs < LOG_THROTTLE_MS) return;
  lastLogTs = now;
  try {
    if (details) {
      console.debug(message, details);
    } else {
      console.debug(message);
    }
  } catch {
    /* noop */
  }
};
