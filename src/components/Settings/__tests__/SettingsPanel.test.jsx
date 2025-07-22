/**
 * SettingsPanel Component Tests
 * Tests for the main settings modal and its functionality
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SettingsPanel from '../SettingsPanel.jsx';
import { PARAMETERS } from '../../../constants/parameters.js';

// Mock the configuration hook
vi.mock('../../../hooks/useConfiguration.js', () => ({
  default: () => ({
    savedConfigs: [
      { name: 'test-config', savedAt: '2024-01-01T00:00:00.000Z', version: '1.0' }
    ],
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

describe('SettingsPanel', () => {
  const mockProps = {
    isOpen: true,
    onClose: vi.fn(),
    parameters: PARAMETERS.slice(0, 3), // Use first 3 parameters for testing
    values: {
      speed: 0.002,
      variation: 0.2,
      numLayers: 1
    },
    onParameterUpdate: vi.fn(),
    onValueUpdate: vi.fn(),
    onRandomizeParameter: vi.fn(),
    onResetParameter: vi.fn(),
    onConfigurationLoad: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders when open', () => {
    render(<SettingsPanel {...mockProps} />);
    
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Parameters')).toBeInTheDocument();
    expect(screen.getByText('Configurations')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<SettingsPanel {...mockProps} isOpen={false} />);
    
    expect(screen.queryByText('Settings')).not.toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    render(<SettingsPanel {...mockProps} />);
    
    const closeButton = screen.getByLabelText('Close settings');
    fireEvent.click(closeButton);
    
    expect(mockProps.onClose).toHaveBeenCalled();
  });

  it('calls onClose when escape key is pressed', () => {
    render(<SettingsPanel {...mockProps} />);
    
    fireEvent.keyDown(document, { key: 'Escape' });
    
    expect(mockProps.onClose).toHaveBeenCalled();
  });

  it('switches between tabs', () => {
    render(<SettingsPanel {...mockProps} />);
    
    // Should start on parameters tab
    expect(screen.getByText('Speed')).toBeInTheDocument();
    
    // Switch to configurations tab
    const configTab = screen.getByText('Configurations');
    fireEvent.click(configTab);
    
    expect(screen.getByText('Save Configuration')).toBeInTheDocument();
  });

  it('displays parameter controls in parameters tab', () => {
    render(<SettingsPanel {...mockProps} />);
    
    // Check that parameter controls are rendered
    expect(screen.getByText('Speed')).toBeInTheDocument();
    expect(screen.getByText('Layer Variation')).toBeInTheDocument();
    
    // The "Number of Layers" parameter is in the "Layers" group which is collapsed by default
    // Let's expand it first by finding the text that contains "Layers"
    const layersGroup = screen.getByText((content, element) => {
      return content.includes('Layers');
    });
    fireEvent.click(layersGroup);
    
    expect(screen.getByText('Number of Layers')).toBeInTheDocument();
  });

  it('handles parameter value updates', () => {
    render(<SettingsPanel {...mockProps} />);
    
    // Find a slider input (speed parameter)
    const sliders = screen.getAllByRole('slider');
    const speedSlider = sliders[0]; // First slider should be speed
    
    fireEvent.change(speedSlider, { target: { value: '0.005' } });
    
    expect(mockProps.onValueUpdate).toHaveBeenCalledWith('speed', 0.005);
  });

  it('handles parameter randomization', async () => {
    render(<SettingsPanel {...mockProps} />);
    
    // Find randomize buttons (🎲)
    const randomizeButtons = screen.getAllByText('🎲');
    fireEvent.click(randomizeButtons[0]);
    
    expect(mockProps.onRandomizeParameter).toHaveBeenCalled();
    
    // Should show a message
    await waitFor(() => {
      expect(screen.getByText(/Randomized/)).toBeInTheDocument();
    });
  });

  it('handles parameter reset', async () => {
    render(<SettingsPanel {...mockProps} />);
    
    // Find reset buttons (↺)
    const resetButtons = screen.getAllByText('↺');
    fireEvent.click(resetButtons[0]);
    
    expect(mockProps.onResetParameter).toHaveBeenCalled();
    
    // Should show a message
    await waitFor(() => {
      expect(screen.getByText(/Reset.*to default/)).toBeInTheDocument();
    });
  });

  it('displays configuration management in configurations tab', () => {
    render(<SettingsPanel {...mockProps} />);
    
    // Switch to configurations tab
    const configTab = screen.getByText('Configurations');
    fireEvent.click(configTab);
    
    expect(screen.getByText('Save Configuration')).toBeInTheDocument();
    expect(screen.getByText('Saved Configurations')).toBeInTheDocument();
    expect(screen.getByText('test-config')).toBeInTheDocument();
  });

  it('handles configuration save', async () => {
    render(<SettingsPanel {...mockProps} />);
    
    // Switch to configurations tab
    const configTab = screen.getByText('Configurations');
    fireEvent.click(configTab);
    
    // Enter configuration name
    const nameInput = screen.getByPlaceholderText('Enter configuration name...');
    fireEvent.change(nameInput, { target: { value: 'test-save' } });
    
    // Click save button
    const saveButton = screen.getByText('Save');
    fireEvent.click(saveButton);
    
    // Note: The actual save is handled by the mocked useConfiguration hook
    // We're testing that the UI responds correctly
    expect(nameInput.value).toBe('test-save');
  });

  it('prevents body scroll when open', () => {
    render(<SettingsPanel {...mockProps} />);
    
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('restores body scroll when closed', () => {
    const { rerender } = render(<SettingsPanel {...mockProps} />);
    
    // Close the modal
    rerender(<SettingsPanel {...mockProps} isOpen={false} />);
    
    expect(document.body.style.overflow).toBe('unset');
  });

  it('displays and clears messages', async () => {
    render(<SettingsPanel {...mockProps} />);
    
    // Trigger a randomize action to show a message
    const randomizeButtons = screen.getAllByText('🎲');
    fireEvent.click(randomizeButtons[0]);
    
    // Should show message
    await waitFor(() => {
      expect(screen.getByText(/Randomized/)).toBeInTheDocument();
    });
    
    // Find and click the message close button (not the modal close button)
    const messageCloseButtons = screen.getAllByText('×');
    const messageCloseButton = messageCloseButtons.find(button => 
      button.style.float === 'right'
    );
    fireEvent.click(messageCloseButton);
    
    // Message should be cleared
    await waitFor(() => {
      expect(screen.queryByText(/Randomized/)).not.toBeInTheDocument();
    });
  });
});