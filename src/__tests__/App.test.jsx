/**
 * Integration tests for the main App component
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import App from '../App.jsx';

// Mock the Canvas component since it requires complex setup
vi.mock('../components/Canvas/Canvas.jsx', () => ({
  default: ({ className, ...props }) => (
    <div data-testid="canvas" className={className} {...props}>
      Canvas Component
    </div>
  )
}));

// Mock the ControlPanel component
vi.mock('../components/Controls/ControlPanel.jsx', () => ({
  default: (props) => (
    <div data-testid="control-panel" {...props}>
      Control Panel
    </div>
  )
}));

// Mock the SettingsPanel component
vi.mock('../components/Settings/SettingsPanel.jsx', () => ({
  default: (props) => (
    <div data-testid="settings-panel" {...props}>
      Settings Panel
    </div>
  )
}));

describe('App Integration', () => {
  it('should render the main application layout', () => {
    render(<App />);
    
    // Should render the main app container
    expect(screen.getByTestId('canvas')).toBeInTheDocument();
    expect(screen.getByTestId('control-panel')).toBeInTheDocument();
    expect(screen.getByTestId('settings-panel')).toBeInTheDocument();
  });

  it('should apply the correct CSS module classes', () => {
    render(<App />);
    
    const canvas = screen.getByTestId('canvas');
    expect(canvas).toHaveClass('canvas');
  });

  it('should handle the application state correctly', () => {
    render(<App />);
    
    // The app should render without crashing and show the main components
    expect(screen.getByTestId('canvas')).toBeInTheDocument();
    expect(screen.getByTestId('control-panel')).toBeInTheDocument();
    expect(screen.getByTestId('settings-panel')).toBeInTheDocument();
  });
});