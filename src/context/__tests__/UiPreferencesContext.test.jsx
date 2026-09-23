import React from 'react';
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, test } from 'vitest';
import { UiPreferencesProvider, useUiPreferences } from '../UiPreferencesContext.jsx';

const LS_KEY = 'artapp-studio-v1-ui-prefs';

let latest;
function Probe() {
  latest = useUiPreferences();
  return null;
}

const renderPrefs = (props) => render(
  <UiPreferencesProvider {...props}><Probe /></UiPreferencesProvider>,
);

describe('UiPreferencesContext', () => {
  beforeEach(() => localStorage.clear());

  test('defaults to sliders/rows with labels off in tests', () => {
    renderPrefs();
    expect(latest.controlStyle).toBe('sliders');
    expect(latest.dialLayout).toBe('rows');
    expect(latest.showLabels).toBe(false);
  });

  test('setPreference persists dialLayout to localStorage', () => {
    renderPrefs();
    act(() => latest.setPreference('dialLayout', 'grid'));
    expect(latest.dialLayout).toBe('grid');
    expect(JSON.parse(localStorage.getItem(LS_KEY)).dialLayout).toBe('grid');
  });

  test('setPreference persists showLabels', () => {
    renderPrefs();
    act(() => latest.setPreference('showLabels', true));
    expect(latest.showLabels).toBe(true);
    expect(JSON.parse(localStorage.getItem(LS_KEY)).showLabels).toBe(true);
  });

  test('invalid values are normalised or ignored', () => {
    renderPrefs();
    act(() => latest.setPreference('dialLayout', 'banana'));
    expect(latest.dialLayout).toBe('rows');
    act(() => latest.setPreference('nonsense', 1));
    expect('nonsense' in latest).toBe(false);
    act(() => latest.setControlStyle('banana'));
    expect(latest.controlStyle).toBe('sliders');
  });

  test('stored preferences are restored on mount', () => {
    localStorage.setItem(LS_KEY, JSON.stringify({ controlStyle: 'dials', dialLayout: 'grid', showLabels: true }));
    renderPrefs();
    expect(latest.controlStyle).toBe('dials');
    expect(latest.dialLayout).toBe('grid');
    expect(latest.showLabels).toBe(true);
  });

  test('initialPreferences override stored values', () => {
    localStorage.setItem(LS_KEY, JSON.stringify({ controlStyle: 'sliders' }));
    renderPrefs({ initialPreferences: { controlStyle: 'dials', showLabels: true } });
    expect(latest.controlStyle).toBe('dials');
    expect(latest.showLabels).toBe(true);
  });

  test('resetPreferences clears storage and restores defaults', () => {
    renderPrefs({ initialPreferences: { controlStyle: 'dials', dialLayout: 'grid' } });
    act(() => latest.resetPreferences());
    expect(localStorage.getItem(LS_KEY)).toBeNull();
    expect(latest.controlStyle).toBe('sliders');
    expect(latest.dialLayout).toBe('rows');
  });
});
