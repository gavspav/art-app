/**
 * Settings Integration Tests
 * Tests for the integration of Settings components with the application
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SettingsIntegrationExample from '../SettingsIntegrationExample.jsx';

// Mock the configuration hook
vi.mock('../../../hooks/useConfiguration.js', () => ({
  default: () => ({
    savedConfigs: [],
    save: vi.fn().mockResolvedValue({ success: true, message: 'Saved successfully' }),
    load: vi.fn().mockResolvedValue({ 
      success: true, 
      message: 'Loaded successfully',
      data: { parameters: [], appState: {} }
    }),
    delete: vi.fn().mockResolvedValue({ success: true, message: 'Deleted successfully' }),
    export: vi.fn().mockResolvedValue({ success: true, data: '{}' }),
    import: vi.fn().mockResolvedValue({ success: true, message: 'Imported successfully' }),
    message: '',
    isLoading: false,
    refreshConfigList: vi.fn(),
    clearMessage: vi.fn()
  })
}));

describe('Settings Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the integration example', () => {
    render(<SettingsIntegrationExample />);
    
    expect(screen.getByText('Settings Integration Example')).toBeInTheDocument();
    expect(screen.getByText('Open Settings')).toBeInTheDocument();
    expect(screen.getByText('Current Parameter Values:')).toBeInTheDocument();
  });

  it('opens and closes settings modal', async () => {
    render(<SettingsIntegrationExample />);
    
    // Settings should not be visible initially
    expect(screen.queryByText('Settings')).not.toBeInTheDocument();
    
    // Click open settings button
    const openButton = screen.getByText('Open Settings');
    fireEvent.click(openButton);
    
    // Settings modal should now be visible
    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });
    
    // Close the modal
    const closeButton = screen.getByLabelText('Close settings');
    fireEvent.click(closeButton);
    
    // Settings should be hidden again
    await waitFor(() => {
      expect(screen.queryByText('Settings')).not.toBeInTheDocument();
    });
  });

  it('displays current parameter values', () => {
    render(<SettingsIntegrationExample />);
    
    // Should show parameter values in JSON format
    const jsonDisplay = screen.getByText((content, element) => {
      return element?.tagName.toLowerCase() === 'pre' && content.includes('{');
    });
    
    expect(jsonDisplay).toBeInTheDocument();
  });

  it('updates parameter values through settings', async () => {
    render(<SettingsIntegrationExample />);
    
    // Open settings
    const openButton = screen.getByText('Open Settings');
    fireEvent.click(openButton);
    
    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });
    
    // Find a parameter slider and change its value
    const sliders = screen.getAllByRole('slider');
    if (sliders.length > 0) {
      fireEvent.change(sliders[0], { target: { value: '0.5' } });
      
      // The parameter value should be updated
      // Note: This test verifies the UI interaction works
      expect(sliders[0].value).toBe('0.5');
    }
  });

  it('handles parameter randomization', async () => {
    render(<SettingsIntegrationExample />);
    
    // Open settings
    const openButton = screen.getByText('Open Settings');
    fireEvent.click(openButton);
    
    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });
    
    // Find and click a randomize button
    const randomizeButtons = screen.getAllByText('🎲');
    if (randomizeButtons.length > 0) {
      fireEvent.click(randomizeButtons[0]);
      
      // Should show a randomization message
      await waitFor(() => {
        expect(screen.getByText(/Randomized/)).toBeInTheDocument();
      });
    }
  });

  it('handles parameter reset', async () => {
    render(<SettingsIntegrationExample />);
    
    // Open settings
    const openButton = screen.getByText('Open Settings');
    fireEvent.click(openButton);
    
    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });
    
    // Find and click a reset button
    const resetButtons = screen.getAllByText('↺');
    if (resetButtons.length > 0) {
      fireEvent.click(resetButtons[0]);
      
      // Should show a reset message
      await waitFor(() => {
        expect(screen.getByText(/Reset.*to default/)).toBeInTheDocument();
      });
    }
  });
});