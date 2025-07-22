import { describe, it, expect } from 'vitest';
import React from 'react';
import { ControlPanel, ParameterControl, ColorPalette } from '../index.js';

describe('Controls Integration', () => {
  it('should export all components correctly', () => {
    expect(ControlPanel).toBeDefined();
    expect(ParameterControl).toBeDefined();
    expect(ColorPalette).toBeDefined();
  });

  it('should be React components', () => {
    expect(typeof ControlPanel).toBe('function');
    expect(typeof ParameterControl).toBe('function');
    expect(typeof ColorPalette).toBe('function');
  });
});