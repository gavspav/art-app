import { describe, expect, test } from 'vitest';
import { decimalsForStep, snapToStep } from '../stepPrecision.js';

describe('decimalsForStep', () => {
  test('integer steps need no decimals', () => {
    expect(decimalsForStep(1)).toBe(0);
    expect(decimalsForStep(5)).toBe(0);
  });

  test('fractional steps get their decimals', () => {
    expect(decimalsForStep(0.05)).toBe(2);
    expect(decimalsForStep(0.001)).toBe(3);
    expect(decimalsForStep(0.5)).toBe(1);
  });

  test('exponential notation is handled', () => {
    expect(decimalsForStep(1e-3)).toBe(3);
  });

  test('missing or invalid steps fall back to 2', () => {
    expect(decimalsForStep(undefined)).toBe(2);
    expect(decimalsForStep(0)).toBe(2);
    expect(decimalsForStep('x')).toBe(2);
  });
});

describe('snapToStep', () => {
  test('snaps to multiples of the step', () => {
    expect(snapToStep(0.911, 0.05)).toBe(0.9);
    expect(snapToStep(6.4, 1)).toBe(6);
  });

  test('respects the min offset', () => {
    expect(snapToStep(0.26, 0.1, 0.05)).toBe(0.25);
  });

  test('avoids float dust', () => {
    expect(snapToStep(0.61, 0.05)).toBe(0.6);
    expect(snapToStep(0.61, 0.05)).not.toBe(0.6000000000000001);
  });

  test('no step returns the value unchanged', () => {
    expect(snapToStep(0.911, 0)).toBe(0.911);
    expect(snapToStep(0.911, undefined)).toBe(0.911);
  });
});
