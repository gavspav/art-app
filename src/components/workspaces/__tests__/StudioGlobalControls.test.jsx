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

  test('shows persistent randomisation limits for every numeric global control', () => {
    render(<ParameterProvider><StudioGlobalControls props={props} /></ParameterProvider>);
    expect(screen.queryAllByText('Random min')).toHaveLength(0);
    const disclosureButtons = screen.getAllByRole('button', { name: /Show .* randomisation limits/ });
    expect(disclosureButtons).toHaveLength(8);
    fireEvent.click(disclosureButtons[0]);
    expect(screen.getAllByText('Random min')).toHaveLength(1);
    expect(screen.getAllByText('Random max')).toHaveLength(1);
    expect(screen.getAllByText('Step')).toHaveLength(1);

    const randomMax = screen.getAllByLabelText('Random max')[0];
    fireEvent.focus(randomMax);
    fireEvent.change(randomMax, { target: { value: '4' } });
    fireEvent.blur(randomMax);
    const stored = JSON.parse(localStorage.getItem('artapp-studio-v1-parameters'));
    expect(stored.find(parameter => parameter.id === 'globalSpeedMultiplier').randomMax).toBe(4);
  });
});
