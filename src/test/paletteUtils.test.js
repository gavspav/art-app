import { describe, it, expect } from 'vitest';
import { sampleColorsEven, distributeColorsAcrossLayers, assignOneColorPerLayer, getColorsFromPalette, pickPaletteColors } from '../utils/paletteUtils.js';

describe('paletteUtils', () => {
  it('sampleColorsEven samples endpoints when count <= palette length', () => {
    const base = ['#000000', '#111111', '#222222', '#333333'];
    expect(sampleColorsEven(base, 1)).toEqual(['#000000']);
    expect(sampleColorsEven(base, 2)).toEqual(['#000000', '#333333']);
    expect(sampleColorsEven(base, 3)).toEqual(['#000000', '#222222', '#333333']);
  });

  it('sampleColorsEven handles repeats with larger count (endpoint repeats)', () => {
    const base = ['#000000', '#ffffff'];
    // Implementation rounds evenly spaced indices, which with 2 endpoints yields edge repeats
    expect(sampleColorsEven(base, 4)).toEqual(['#000000', '#000000', '#ffffff', '#ffffff']);
  });

  it('distributeColorsAcrossLayers spreads as evenly as possible', () => {
    const colors = ['a', 'b', 'c', 'd', 'e'];
    const out = distributeColorsAcrossLayers(colors, 3);
    expect(out.length).toBe(3);
    expect(out[0].length + out[1].length + out[2].length).toBe(5);
  });

  it('assignOneColorPerLayer cycles colors', () => {
    const layers = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
    const cols = ['#a', '#b'];
    const assigned = assignOneColorPerLayer(layers, cols);
    expect(assigned.map(l => l.colors[0])).toEqual(['#a', '#b', '#a', '#b']);
  });

  it('getColorsFromPalette normalizes structures', () => {
    expect(getColorsFromPalette(['#1', '#2'])).toEqual(['#1', '#2']);
    expect(getColorsFromPalette({ colors: ['#1', '#2'] })).toEqual(['#1', '#2']);
    expect(getColorsFromPalette(null)).toEqual([]);
  });

  it('pickPaletteColors selects from list with fallback', () => {
    const palettes = [{ colors: ['#a', '#b'] }, { colors: ['#c'] }];
    const rnd = () => 0.0; // pick first
    expect(pickPaletteColors(palettes, rnd, ['#z'])).toEqual(['#a', '#b']);
    const rnd2 = () => 0.99; // pick last
    expect(pickPaletteColors(palettes, rnd2, ['#z'])).toEqual(['#c']);
  });
});
