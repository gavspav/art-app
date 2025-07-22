/**
 * Tests for AppStateContext
 */

import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AppStateProvider, useAppState } from '../AppStateContext.jsx';

// Test component to access context
const TestComponent = () => {
  const { isFrozen, globalSeed, setIsFrozen, setGlobalSeed } = useAppState();
  
  return (
    <div>
      <div data-testid="frozen">{isFrozen ? 'frozen' : 'not-frozen'}</div>
      <div data-testid="seed">{globalSeed}</div>
      <button 
        data-testid="toggle-frozen" 
        onClick={() => setIsFrozen(!isFrozen)}
      >
        Toggle Frozen
      </button>
      <button 
        data-testid="set-seed" 
        onClick={() => setGlobalSeed(12345)}
      >
        Set Seed
      </button>
    </div>
  );
};

describe('AppStateContext', () => {
  it('should provide initial state', () => {
    render(
      <AppStateProvider>
        <TestComponent />
      </AppStateProvider>
    );

    expect(screen.getByTestId('frozen')).toHaveTextContent('not-frozen');
    expect(screen.getByTestId('seed')).toHaveTextContent('1');
  });

  it('should handle frozen state toggle', () => {
    render(
      <AppStateProvider>
        <TestComponent />
      </AppStateProvider>
    );

    const toggleButton = screen.getByTestId('toggle-frozen');
    
    act(() => {
      toggleButton.click();
    });

    expect(screen.getByTestId('frozen')).toHaveTextContent('frozen');

    act(() => {
      toggleButton.click();
    });

    expect(screen.getByTestId('frozen')).toHaveTextContent('not-frozen');
  });

  it('should handle seed update', () => {
    render(
      <AppStateProvider>
        <TestComponent />
      </AppStateProvider>
    );

    const setSeedButton = screen.getByTestId('set-seed');
    
    act(() => {
      setSeedButton.click();
    });

    expect(screen.getByTestId('seed')).toHaveTextContent('12345');
  });

  it('should handle context usage outside provider', () => {
    // Mock console.error to avoid noise in test output
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    expect(() => {
      render(<TestComponent />);
    }).toThrow();
    
    consoleSpy.mockRestore();
  });
});