import React from 'react';
import { act, render } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { AppStateProvider, useAppState } from '../AppStateContext.jsx';

let appStateApi = null;

function AppStateProbe() {
  appStateApi = useAppState();
  return null;
}

describe('AppStateContext interaction tracking', () => {
  test('treats cabinet MIDI activity as direct user interaction', () => {
    render(
      <AppStateProvider>
        <AppStateProbe />
      </AppStateProvider>,
    );

    expect(appStateApi.isUserInteracting()).toBe(false);

    act(() => {
      window.dispatchEvent(new CustomEvent('artapp:midi-activity'));
    });

    expect(appStateApi.isUserInteracting()).toBe(true);
  });
});
