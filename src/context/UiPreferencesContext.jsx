import React, { createContext, useContext, useMemo, useState } from 'react';

/**
 * UiPreferencesContext - per-browser UI preferences.
 *
 * Currently holds `controlStyle`: 'sliders' (default) or 'dials', which swaps
 * range inputs for rotary dials across the studio UI. Aimed at iPad + Pencil
 * use where vertical drags on a dial save space and feel better than sliders.
 * Persisted to localStorage under `artapp-studio-v1-ui-prefs`.
 */

const UiPreferencesContext = createContext(null);

const LS_UI_PREFS = 'artapp-studio-v1-ui-prefs';

// Returned when no provider is mounted — tests render bare components.
const FALLBACK = { controlStyle: 'sliders', setControlStyle: () => {} };

const normalise = value => (value === 'dials' ? 'dials' : 'sliders');

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

export function UiPreferencesProvider({ children, initialControlStyle }) {
  const [controlStyle, setControlStyleState] = useState(() => (
    initialControlStyle ? normalise(initialControlStyle) : normalise(readPrefs().controlStyle)
  ));

  const value = useMemo(() => ({
    controlStyle,
    setControlStyle: (next) => {
      const style = normalise(next);
      setControlStyleState(style);
      writePrefs({ ...readPrefs(), controlStyle: style });
    },
  }), [controlStyle]);

  return <UiPreferencesContext.Provider value={value}>{children}</UiPreferencesContext.Provider>;
}

export const useUiPreferences = () => useContext(UiPreferencesContext) || FALLBACK;
