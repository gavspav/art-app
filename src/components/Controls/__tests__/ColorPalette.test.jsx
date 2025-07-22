import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import ColorPalette from '../ColorPalette.jsx';

// Mock the palettes
vi.mock('../../../constants/palettes.js', () => ({
  palettes: {
    blues: ['#1E3296', '#502CB4', '#6450C8'],
    neon: ['#FF00FF', '#00FF00', '#00FFFF']
  }
}));

describe('ColorPalette', () => {
  const mockProps = {
    selectedColors: ['#ff0000', '#00ff00'],
    onColorsChange: vi.fn(),
    selectedPalette: 'blues',
    onPaletteChange: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render color palette selector', () => {
    render(<ColorPalette {...mockProps} />);
    
    expect(screen.getByText('Color Palette')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('should render current colors', () => {
    render(<ColorPalette {...mockProps} />);
    
    expect(screen.getByText('Colors')).toBeInTheDocument();
    expect(screen.getByDisplayValue('#ff0000')).toBeInTheDocument();
    expect(screen.getByDisplayValue('#00ff00')).toBeInTheDocument();
  });

  it('should show palette preview when palette is selected', () => {
    const { container } = render(<ColorPalette {...mockProps} />);
    
    // Should show preview colors for blues palette
    const previewColors = container.querySelectorAll('[style*="background-color"]');
    expect(previewColors.length).toBeGreaterThan(0);
  });

  it('should call onPaletteChange when palette is selected', () => {
    render(<ColorPalette {...mockProps} />);
    
    const paletteSelect = screen.getByRole('combobox');
    fireEvent.change(paletteSelect, { target: { value: 'neon' } });
    
    expect(mockProps.onPaletteChange).toHaveBeenCalledWith('neon');
  });

  it('should call onColorsChange when color is modified', () => {
    render(<ColorPalette {...mockProps} />);
    
    const colorInput = screen.getByDisplayValue('#ff0000');
    fireEvent.change(colorInput, { target: { value: '#0000ff' } });
    
    expect(mockProps.onColorsChange).toHaveBeenCalledWith(['#0000ff', '#00ff00']);
  });

  it('should add new color when add button is clicked', () => {
    render(<ColorPalette {...mockProps} />);
    
    const addButton = screen.getByText('Add Color');
    fireEvent.click(addButton);
    
    expect(mockProps.onColorsChange).toHaveBeenCalledWith(['#ff0000', '#00ff00', '#ffffff']);
  });

  it('should remove color when remove button is clicked', () => {
    render(<ColorPalette {...mockProps} />);
    
    const removeButtons = screen.getAllByText('×');
    fireEvent.click(removeButtons[0]);
    
    expect(mockProps.onColorsChange).toHaveBeenCalledWith(['#00ff00']);
  });

  it('should disable add button when max colors reached', () => {
    const propsWithMaxColors = {
      ...mockProps,
      selectedColors: new Array(8).fill('#ffffff')
    };
    
    render(<ColorPalette {...propsWithMaxColors} />);
    
    const addButton = screen.getByText('Add Color');
    expect(addButton).toBeDisabled();
  });
});