import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ParameterProvider } from '../../../context/ParameterContext.jsx';
import ParameterRow from '../ParameterRow.jsx';
import LayerStrip from '../LayerStrip.jsx';
import ShapeSection from '../sections/ShapeSection.jsx';
import MotionSection from '../sections/MotionSection.jsx';
import ColourSection from '../sections/ColourSection.jsx';
import { describeMappingId } from '../RoutingLists.jsx';

vi.mock('../../../context/MidiContext.jsx', () => ({
  useMidi: () => ({ supported: true, mappings: { 'layer:l1:numSides': { type: 'cc', number: 7, channel: 1 } }, mappingLabel: m => `CC ${m.number}`, beginLearn: vi.fn(), clearMapping: vi.fn(), learnParamId: null }),
}));
vi.mock('../../../context/AudioContext.jsx', () => ({ useAudioReactive: () => null }));
vi.mock('../../../context/BPMContext.jsx', () => ({ useBPM: () => null }));

const layers = [
  { id: 'l1', name: 'Layer 1', layerType: 'shape', numSides: 6, rotation: 10, colors: ['#ff0000'], numColors: 1, movementStyle: 'orbit', orbitRadiusX: 0.1, orbitRadiusY: 0.2, position: { scale: 1 } },
  { id: 'l2', name: 'Layer 2', layerType: 'shape', numSides: 4, colors: ['#00ff00'], numColors: 1, position: { scale: 1 } },
];
const baseProps = () => ({
  layers, currentLayer: layers[0], selectedLayerIndex: 0, selectedLayerIds: [], editTarget: { type: 'single' },
  parameterTargetMode: 'individual', getActiveTargetLayerIds: () => ['l1'],
  updateCurrentLayer: vi.fn(), setLayers: vi.fn(), selectLayer: vi.fn(), setEditTarget: vi.fn(), clearSelection: vi.fn(),
  toggleLayerSelection: vi.fn(), setParameterTargetMode: vi.fn(), addNewLayer: vi.fn(), deleteLayer: vi.fn(),
  moveSelectedLayerUp: vi.fn(), moveSelectedLayerDown: vi.fn(), handleImportSVGClick: vi.fn(), setIsNodeEditMode: vi.fn(),
  randomizeCurrentLayer: vi.fn(), randomizeAnimationForCurrentLayer: vi.fn(), randomizeCurrentLayerColors: vi.fn(),
  getIsRnd: () => true, setIsRnd: vi.fn(), palettes: [{ name: 'Warm', colors: ['#ff0000', '#ffaa00'] }],
});
const wrap = ui => render(<ParameterProvider>{ui}</ParameterProvider>);

beforeEach(() => localStorage.clear());

describe('ParameterRow', () => {
  it('shows random bounds handles on the track and opens details beneath the row', () => {
    const onChange = vi.fn();
    const { container } = render(<ParameterRow id="x" label="Size" value={0.5} min={0} max={1} step={0.01} onChange={onChange}
      randomMin={0.2} randomMax={0.8} onRandomMinChange={vi.fn()} onRandomMaxChange={vi.fn()} details={<p>Details body</p>} />);
    expect(container.querySelector('.range-slider-handle--min')).toBeTruthy();
    expect(container.querySelector('.range-slider-band')).toBeTruthy();
    expect(screen.queryByText('Details body')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Size details and mapping' }));
    expect(screen.getByText('Details body')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText('Details body')).toBeNull();
    fireEvent.change(screen.getByRole('slider', { name: 'Size' }), { target: { value: '0.7' } });
    expect(onChange).toHaveBeenCalledWith(0.7);
  });
});

describe('LayerStrip', () => {
  it('selects layers, switches scope and exposes management in one menu', () => {
    const props = baseProps();
    render(<LayerStrip props={props} />);
    fireEvent.change(screen.getByLabelText('Layer to edit'), { target: { value: '1' } });
    expect(props.selectLayer).toHaveBeenCalledWith(1);
    expect(props.setEditTarget).toHaveBeenCalledWith({ type: 'single' });
    fireEvent.click(screen.getByRole('button', { name: 'All layers' }));
    expect(props.setParameterTargetMode).toHaveBeenCalledWith('global');
    fireEvent.click(screen.getByRole('button', { name: 'Layer actions' }));
    const menu = screen.getByRole('menu');
    fireEvent.click(within(menu).getByText('Delete layer'));
    expect(props.deleteLayer).not.toHaveBeenCalled();
    fireEvent.click(within(menu).getByText('Confirm delete'));
    expect(props.deleteLayer).toHaveBeenCalledWith(0);
  });
});

describe('layer sections', () => {
  it('Shape renders every shape parameter with bounds, rotation, and a mapped indicator', () => {
    const props = baseProps();
    const { container } = wrap(<ShapeSection props={props} />);
    expect(screen.getByRole('slider', { name: 'Sides' })).toBeTruthy();
    expect(screen.getByRole('slider', { name: 'Rotation' })).toBeTruthy();
    expect(container.querySelectorAll('.range-slider-handle--min').length).toBeGreaterThan(5);
    expect(screen.getByRole('button', { name: 'Sides details and mapping' }).classList.contains('mapped')).toBe(true);
    fireEvent.change(screen.getByRole('slider', { name: 'Sides' }), { target: { value: '8' } });
    expect(props.setLayers).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Hide layer' }));
    expect(props.setLayers).toHaveBeenCalledTimes(2);
  });

  it('Motion shows orbit radii for orbit layers and randomises movement', () => {
    const props = baseProps();
    wrap(<MotionSection props={props} />);
    expect(screen.getByRole('slider', { name: 'Radius X' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Randomise/ }));
    expect(props.randomizeAnimationForCurrentLayer).toHaveBeenCalledTimes(1);
  });

  it('Colour keeps palette, count and swatches inline and moves randomisation settings to details', () => {
    const props = { ...baseProps(), randomizePalette: false, setRandomizePalette: vi.fn(), setRandomizeNumColors: vi.fn(), colorCountMin: 1, colorCountMax: 5 };
    wrap(<ColourSection props={props} />);
    expect(screen.getByLabelText('Number of colours')).toBeTruthy();
    expect(screen.queryByText('Change palette')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Colour randomisation and mapping settings' }));
    fireEvent.click(screen.getByLabelText('Change palette'));
    expect(props.setRandomizePalette).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole('button', { name: /Randomise/ }));
    expect(props.randomizeCurrentLayerColors).toHaveBeenCalledTimes(1);
  });
});

describe('describeMappingId', () => {
  it('translates stored ids into readable targets', () => {
    const params = [{ id: 'numSides', label: 'Sides' }];
    expect(describeMappingId('layer:l2:numSides', layers, params)).toEqual({ target: 'Layer 2', param: 'Sides', resolved: true });
    expect(describeMappingId('layer:missing:numSides', layers, params)).toMatchObject({ target: 'Missing layer', resolved: false });
    expect(describeMappingId('randomize:numSides', layers, params)).toMatchObject({ target: 'Trigger', param: 'Randomise sides' });
    expect(describeMappingId('globalOpacity', layers, params)).toEqual({ target: 'Scene', param: 'Opacity', resolved: true });
  });
});
