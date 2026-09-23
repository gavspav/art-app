import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ParameterProvider } from '../../../context/ParameterContext.jsx';
import StudioGlobalControls from '../StudioGlobalControls.jsx';

const layer = {
  id: 'layer-one', opacity: 0.8, variationPosition: 0.2, variationShape: 0.2,
  variationAnim: 0.2, variationColor: 0.2, variationScale: 0,
};

const props = {
  layers: [layer],
  DEFAULT_LAYER: layer,
  setLayers: vi.fn(),
  getIsRnd: () => true,
  setIsRnd: vi.fn(),
  setGlobalSpeedMultiplier: vi.fn(),
  globalSpeedMultiplier: 1,
  backgroundColor: '#111111',
  palettes: [],
  blendModes: ['source-over'],
  globalBlendMode: 'source-over',
};

describe('StudioGlobalControls', () => {
  beforeEach(() => localStorage.clear());

  test('always shows randomisation bounds on every numeric control, with precise entry in details', () => {
    const { container } = render(<ParameterProvider><StudioGlobalControls props={props} /></ParameterProvider>);
    expect(screen.getAllByRole('slider')).toHaveLength(8);
    expect(container.querySelectorAll('.range-slider-handle--min')).toHaveLength(8);
    expect(container.querySelectorAll('.range-slider-handle--max')).toHaveLength(8);
    expect(screen.queryByRole('button', { name: /Show .* randomisation limits/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Speed details and mapping' }));
    const randomMax = screen.getByLabelText('Random max');
    fireEvent.focus(randomMax);
    fireEvent.change(randomMax, { target: { value: '4' } });
    fireEvent.blur(randomMax);
    const stored = JSON.parse(localStorage.getItem('artapp-studio-v1-parameters'));
    expect(stored.find(parameter => parameter.id === 'globalSpeedMultiplier').randomMax).toBe(4);
  });

  test('global palette select shows and chooses custom palettes', () => {
    const setGlobalPaletteIndex = vi.fn();
    const setGlobalPaletteRef = vi.fn();
    const assignOneColorPerLayer = vi.fn();
    const palettes = [
      { name: 'Warm', colors: ['#ff0000', '#ffaa00'], __source: 'builtin', __index: 0 },
      { name: 'Mine', id: 'c1', colors: ['#112233'], __source: 'custom' },
    ];
    render(<ParameterProvider><StudioGlobalControls props={{
      ...props, palettes, globalPaletteIndex: 'custom', globalPaletteRef: 'c1',
      setGlobalPaletteIndex, setGlobalPaletteRef, assignOneColorPerLayer,
    }} /></ParameterProvider>);

    const select = screen.getByLabelText('Palette');
    expect(select.value).toBe('custom:c1');

    fireEvent.change(select, { target: { value: 'builtin:0' } });
    expect(setGlobalPaletteIndex).toHaveBeenCalledWith(0);
    expect(assignOneColorPerLayer).toHaveBeenCalled();

    fireEvent.change(select, { target: { value: 'custom:c1' } });
    expect(setGlobalPaletteRef).toHaveBeenCalledWith('c1');
  });

  test('dice toggle reports inclusion changes', () => {
    const setIsRnd = vi.fn();
    render(<ParameterProvider><StudioGlobalControls props={{ ...props, getIsRnd: () => false, setIsRnd }} /></ParameterProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Include Opacity in randomisation' }));
    expect(setIsRnd).toHaveBeenCalledWith('globalOpacity', true);
  });

  test('scale variation keeps each layer’s colours, identity, and unrelated settings', () => {
    const layers = [
      { ...layer, colors: ['#111111'], position: { x: 0.2, y: 0.3, scale: 1 }, wobble: 0.1 },
      { ...layer, id: 'layer-two', name: 'Second', colors: ['#ff0000'], numColors: 1, position: { x: 0.4, y: 0.5, scale: 1.2 }, wobble: 0.4 },
      { ...layer, id: 'layer-three', name: 'Third', colors: ['#0000ff'], numColors: 1, position: { x: 0.6, y: 0.7, scale: 0.8 }, wobble: 0.8 },
    ];
    let current = layers;
    const setLayers = vi.fn(update => { current = update(current); });
    const buildVariedLayerFrom = vi.fn(previous => ({
      ...previous,
      colors: [...previous.colors],
      position: { ...previous.position, scale: previous.position.scale * 1.5 },
    }));
    render(<ParameterProvider><StudioGlobalControls props={{
      ...props, layers, setLayers, buildVariedLayerFrom, applyVariationInstantly: true,
    }} /></ParameterProvider>);

    fireEvent.change(screen.getByRole('slider', { name: 'Scale' }), { target: { value: '2' } });

    expect(current[0].position).toEqual(layers[0].position);
    expect(current.map(item => item.variationScale)).toEqual([2, 2, 2]);
    expect(current[1]).toMatchObject({ id: 'layer-two', name: 'Second', colors: ['#ff0000'], numColors: 1, wobble: 0.4 });
    expect(current[2]).toMatchObject({ id: 'layer-three', name: 'Third', colors: ['#0000ff'], numColors: 1, wobble: 0.8 });
    expect(current[1].position.x).toBe(0.4);
    expect(current[2].position.y).toBe(0.7);
    expect(current[1].position.scale).toBeCloseTo(1.8);
    expect(current[2].position.scale).toBeCloseTo(1.2);
    expect(buildVariedLayerFrom).toHaveBeenCalledTimes(2);
  });

  test('colour variation leaves geometry and existing layer settings alone', () => {
    const layers = [
      { ...layer, colors: ['#111111'], position: { x: 0.2, y: 0.3, scale: 1 } },
      { ...layer, id: 'layer-two', colors: ['#ff0000'], position: { x: 0.4, y: 0.5, scale: 1.2 }, wobble: 0.4 },
    ];
    let current = layers;
    render(<ParameterProvider><StudioGlobalControls props={{
      ...props, layers, applyVariationInstantly: true,
      setLayers: update => { current = update(current); },
      buildVariedLayerFrom: previous => ({ ...previous, colors: ['#00ff00'], position: { x: 0.9, y: 0.9, scale: 2 }, wobble: 0.9 }),
    }} /></ParameterProvider>);

    fireEvent.change(screen.getByRole('slider', { name: 'Colour' }), { target: { value: '2' } });

    expect(current[1].colors).toEqual(['#00ff00']);
    expect(current[1].position).toEqual(layers[1].position);
    expect(current[1].wobble).toBe(0.4);
  });
});
