/**
 * Tests for ParameterContext
 */

import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ParameterProvider, useParameters } from '../ParameterContext.jsx';

// Test component to access context
const TestComponent = () => {
  const { 
    parameters, 
    values, 
    updateParameter, 
    randomizeAll, 
    resetAll,
    getParameterValue 
  } = useParameters();
  
  return (
    <div>
      <div data-testid="parameter-count">{parameters.length}</div>
      <div data-testid="speed-value">{values.speed}</div>
      <div data-testid="variation-value">{values.variation}</div>
      <button 
        data-testid="update-speed" 
        onClick={() => updateParameter('speed', 0.5)}
      >
        Update Speed
      </button>
      <button 
        data-testid="randomize-all" 
        onClick={randomizeAll}
      >
        Randomize All
      </button>
      <button 
        data-testid="reset-all" 
        onClick={resetAll}
      >
        Reset All
      </button>
      <div data-testid="get-speed">{getParameterValue('speed')}</div>
    </div>
  );
};

describe('ParameterContext', () => {
  it('should provide initial parameter state', () => {
    render(
      <ParameterProvider>
        <TestComponent />
      </ParameterProvider>
    );

    expect(screen.getByTestId('parameter-count')).toHaveTextContent('15'); // Assuming 15 parameters
    expect(screen.getByTestId('speed-value')).toHaveTextContent('0.002'); // Default speed value
    expect(screen.getByTestId('variation-value')).toHaveTextContent('0.2'); // Default variation value
  });

  it('should update parameter values', () => {
    render(
      <ParameterProvider>
        <TestComponent />
      </ParameterProvider>
    );

    const updateButton = screen.getByTestId('update-speed');
    
    act(() => {
      updateButton.click();
    });

    expect(screen.getByTestId('speed-value')).toHaveTextContent('0.5');
    expect(screen.getByTestId('get-speed')).toHaveTextContent('0.5');
  });

  it('should randomize all parameters', () => {
    render(
      <ParameterProvider>
        <TestComponent />
      </ParameterProvider>
    );

    const initialSpeed = screen.getByTestId('speed-value').textContent;
    const randomizeButton = screen.getByTestId('randomize-all');
    
    act(() => {
      randomizeButton.click();
    });

    // Values should be different after randomization (with high probability)
    const newSpeed = screen.getByTestId('speed-value').textContent;
    expect(newSpeed).not.toBe(initialSpeed);
  });

  it('should reset all parameters to defaults', () => {
    render(
      <ParameterProvider>
        <TestComponent />
      </ParameterProvider>
    );

    // First update a parameter
    const updateButton = screen.getByTestId('update-speed');
    act(() => {
      updateButton.click();
    });

    expect(screen.getByTestId('speed-value')).toHaveTextContent('0.5');

    // Then reset all
    const resetButton = screen.getByTestId('reset-all');
    act(() => {
      resetButton.click();
    });

    expect(screen.getByTestId('speed-value')).toHaveTextContent('0.002'); // Back to default
  });

  it('should throw error when useParameters is used outside provider', () => {
    // Mock console.error to avoid noise in test output
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    expect(() => {
      render(<TestComponent />);
    }).toThrow('useParameters must be used within a ParameterProvider');
    
    consoleSpy.mockRestore();
  });
});