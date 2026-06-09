import { afterEach, describe, expect, test } from 'vitest';
import { getRuntimeProfile } from '../runtimeProfile.js';

const originalUrl = window.location.href;

afterEach(() => {
  window.history.replaceState({}, '', originalUrl);
});

describe('runtime profile', () => {
  test('recognizes explicit arcade launches', () => {
    window.history.replaceState({}, '', '/?arcade=1');
    expect(getRuntimeProfile().isArcade).toBe(true);
  });

  test('uses normal mode without the arcade query', () => {
    window.history.replaceState({}, '', '/');
    expect(getRuntimeProfile().isArcade).toBe(false);
  });
});

