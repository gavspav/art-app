import React, { createContext, useContext, useMemo, useState } from 'react';

/**
 * UiPreferencesContext - per-browser UI preferences.
 *
 * Holds:
 * - `controlStyle`: 'sliders' (default) or 'dials', which swaps range inputs
 *   for rotary dials across the studio UI. Aimed at iPad + Pencil use where
 *   vertical drags on a dial save space and feel better than sliders.
 * - `dialLayout`: 'rows' (default) or 'grid' (three dials per row).
 * - `showLabels`: adds text labels to icon-only rail/top-bar buttons.
 *   Defaults on for coarse-pointer (touch) devices.
 * Persisted to localStorage under `artapp-studio-v1-ui-prefs`.
 */

const UiPreferencesContext = createContext(null);

const LS_UI_PREFS = 'artapp-studio-v1-ui-prefs';

const isCoarsePointer = () => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
};

const defaultPrefs = () => ({
  controlStyle: 'sliders',
  dialLayout: 'rows',
  showLabels: isCoarsePointer(),
});

const normaliseStyle = value => (value === 'dials' ? 'dials' : 'sliders');
const normaliseLayout = value => (value === 'grid' ? 'grid' : 'rows');
const normaliseLabels = value => !!value;

// Returned when no provider is mounted — tests render bare components.
const FALLBACK = {
  controlStyle: 'sliders',
  dialLayout: 'rows',
  showLabels: false,
  setControlStyle: () => {},
  setPreference: () => {},
  resetPreferences: () => {},
};

const readPrefs = () => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(LS_UI_PREFS);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writePrefs = (prefs) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LS_UI_PREFS, JSON.stringify(prefs));
  } catch {
    // Storage unavailable (private mode, quota) — keep the session value.
  }
};

const resolvePrefs = (stored, overrides) => {
  const defaults = defaultPrefs();
  const merged = { ...stored, ...overrides };
  return {
    controlStyle: merged.controlStyle !== undefined ? normaliseStyle(merged.controlStyle) : defaults.controlStyle,
    dialLayout: merged.dialLayout !== undefined ? normaliseLayout(merged.dialLayout) : defaults.dialLayout,
    showLabels: merged.showLabels !== undefined ? normaliseLabels(merged.showLabels) : defaults.showLabels,
  };
};

export function UiPreferencesProvider({ children, initialControlStyle, initialPreferences }) {
  const [prefs, setPrefs] = useState(() => {
    const overrides = { ...initialPreferences };
    const style = initialControlStyle ?? initialPreferences?.controlStyle;
    if (style !== undefined) overrides.controlStyle = style;
    return resolvePrefs(readPrefs(), overrides);
  });

  const value = useMemo(() => ({
    ...prefs,
    setControlStyle: (next) => {
      setPrefs((prev) => {
        const updated = { ...prev, controlStyle: normaliseStyle(next) };
        writePrefs(updated);
        return updated;
      });
    },
    setPreference: (key, next) => {
      setPrefs((prev) => {
        let value;
        if (key === 'controlStyle') value = normaliseStyle(next);
        else if (key === 'dialLayout') value = normaliseLayout(next);
        else if (key === 'showLabels') value = normaliseLabels(next);
        else return prev;
        const updated = { ...prev, [key]: value };
        writePrefs(updated);
        return updated;
      });
    },
    resetPreferences: () => {
      if (typeof window !== 'undefined') {
        try { window.localStorage.removeItem(LS_UI_PREFS); } catch { /* ignore */ }
      }
      setPrefs(defaultPrefs());
    },
  }), [prefs]);

  return <UiPreferencesContext.Provider value={value}>{children}</UiPreferencesContext.Provider>;
}

export const useUiPreferences = () => useContext(UiPreferencesContext) || FALLBACK;
