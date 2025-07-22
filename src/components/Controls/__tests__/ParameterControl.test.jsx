import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import ParameterControl from '../ParameterControl.jsx';

describe('ParameterControl', () => {
  const mockOnChange = vi.fn();

  beforeEach(() => {
    mockOnChange.mockClear();
  });

  it('should render slider control correctly', () => {
    const parameter = {
      id: 'speed',
      label: 'Speed',
      type: 'slider',
      min: 0,
      max: 1,
      step: 0.01,
      defaultValue: 0.5
    };

    render(
      <ParameterControl
        parameter={parameter}
        value={0.5}
        onChange={mockOnChange}
      />
    );

    expect(screen.getByText('Speed')).toBeInTheDocument();
    expect(screen.getByRole('slider')).toBeInTheDocument();
    expect(screen.getByDisplayValue('0.5')).toBeInTheDocument();
  });

  it('should render dropdown control correctly', () => {
    const parameter = {
      id: 'blendMode',
      label: 'Blend Mode',
      type: 'dropdown',
      options: ['source-over', 'multiply', 'screen'],
      defaultValue: 'source-over'
    };

    render(
      <ParameterControl
        parameter={parameter}
        value="multiply"
        onChange={mockOnChange}
      />
    );

    expect(screen.getByText('Blend Mode')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByDisplayValue('multiply')).toBeInTheDocument();
  });

  it('should render color picker correctly', () => {
    const parameter = {
      id: 'backgroundColor',
      label: 'Background',
      type: 'color',
      defaultValue: '#000000'
    };

    render(
      <ParameterControl
        parameter={parameter}
        value="#ff0000"
        onChange={mockOnChange}
      />
    );

    expect(screen.getByText('Background')).toBeInTheDocument();
    const colorInput = screen.getByDisplayValue('#ff0000');
    expect(colorInput).toBeInTheDocument();
    expect(colorInput.type).toBe('color');
  });

  it('should render number input correctly', () => {
    const parameter = {
      id: 'seed',
      label: 'Seed',
      type: 'number',
      min: 0,
      max: 10000,
      step: 1,
      defaultValue: 1234
    };

    render(
      <ParameterControl
        parameter={parameter}
        value={5678}
        onChange={mockOnChange}
      />
    );

    expect(screen.getByText('Seed')).toBeInTheDocument();
    const numberInput = screen.getByDisplayValue('5678');
    expect(numberInput).toBeInTheDocument();
    expect(numberInput.type).toBe('number');
  });

  it('should handle slider changes correctly', () => {
    const parameter = {
      id: 'speed',
      label: 'Speed',
      type: 'slider',
      min: 0,
      max: 1,
      step: 0.01,
      defaultValue: 0.5
    };

    render(
      <ParameterControl
        parameter={parameter}
        value={0.5}
        onChange={mockOnChange}
      />
    );

    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '0.8' } });

    expect(mockOnChange).toHaveBeenCalledWith('speed', 0.8);
  });

  it('should handle transformation functions', () => {
    const parameter = {
      id: 'speed',
      label: 'Speed',
      type: 'slider',
      min: 0,
      max: 1,
      step: 0.01,
      defaultValue: 0.5,
      transform: {
        toSlider: (value) => Math.sqrt(value),
        fromSlider: (value) => value * value
      }
    };

    render(
      <ParameterControl
        parameter={parameter}
        value={0.25}
        onChange={mockOnChange}
      />
    );

    // Value should be transformed for display (sqrt(0.25) = 0.5)
    const slider = screen.getByRole('slider');
    expect(slider.value).toBe('0.5');

    // When changed, should apply inverse transform
    fireEvent.change(slider, { target: { value: '0.8' } });
    expect(mockOnChange).toHaveBeenCalledWith('speed', expect.closeTo(0.64, 5)); // 0.8^2 = 0.64
  });

  it('should handle dropdown changes correctly', () => {
    const parameter = {
      id: 'blendMode',
      label: 'Blend Mode',
      type: 'dropdown',
      options: ['source-over', 'multiply', 'screen'],
      defaultValue: 'source-over'
    };

    render(
      <ParameterControl
        parameter={parameter}
        value="multiply"
        onChange={mockOnChange}
      />
    );

    const dropdown = screen.getByRole('combobox');
    fireEvent.change(dropdown, { target: { value: 'screen' } });

    expect(mockOnChange).toHaveBeenCalledWith('blendMode', 'screen');
  });
});