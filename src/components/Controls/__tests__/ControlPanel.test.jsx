import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import ControlPanel from '../ControlPanel.jsx';

// Mock the parameters to avoid importing the full constants
vi.mock('../../../constants/parameters.js', () => ({
  PARAMETERS: [
    {
      id: 'speed',
      label: 'Speed',
      type: 'slider',
      min: 0,
      max: 1,
      step: 0.01,
      defaultValue: 0.5,
      isRandomizable: true,
      showInOverlay: true,
      group: 'Animation'
    },
    {
      id: 'numLayers',
      label: 'Layers',
      type: 'slider',
      min: 1,
      max: 10,
      step: 1,
      defaultValue: 3,
      isRandomizable: true,
      showInOverlay: true,
      group: 'Layers'
    }
  ]
}));

describe('ControlPanel', () => {
  const mockProps = {
    values: { speed: 0.5, numLayers: 3 },
    onChange: vi.fn(),
    onRandomize: vi.fn(),
    colors: ['#ff0000', '#00ff00'],
    onColorsChange: vi.fn(),
    selectedPalette: 'blues',
    onPaletteChange: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render control panel with title', () => {
    render(<ControlPanel {...mockProps} />);
    
    expect(screen.getByText('Controls')).toBeInTheDocument();
  });

  it('should render randomize all button', () => {
    render(<ControlPanel {...mockProps} />);
    
    expect(screen.getByText('Randomize All')).toBeInTheDocument();
  });

  it('should render group tabs', () => {
    render(<ControlPanel {...mockProps} />);
    
    expect(screen.getByRole('button', { name: 'Animation' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Layers' })).toBeInTheDocument();
  });

  it('should show parameters for active group', () => {
    render(<ControlPanel {...mockProps} />);
    
    // Animation group should be active by default
    expect(screen.getByText('Speed')).toBeInTheDocument();
  });

  it('should switch groups when tab is clicked', () => {
    render(<ControlPanel {...mockProps} />);
    
    // Click on Layers tab
    fireEvent.click(screen.getByRole('button', { name: 'Layers' }));
    
    // Should show Layers parameter label
    expect(screen.getByLabelText('Layers')).toBeInTheDocument();
  });

  it('should toggle color palette visibility', () => {
    render(<ControlPanel {...mockProps} />);
    
    const colorsButton = screen.getByText('Colors');
    fireEvent.click(colorsButton);
    
    // Color palette should be visible
    expect(screen.getByText('Color Palette')).toBeInTheDocument();
  });

  it('should call onRandomize when randomize all is clicked', () => {
    render(<ControlPanel {...mockProps} />);
    
    fireEvent.click(screen.getByText('Randomize All'));
    
    expect(mockProps.onRandomize).toHaveBeenCalled();
  });
});