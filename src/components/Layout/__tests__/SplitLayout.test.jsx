/**
 * SplitLayout Component Tests
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import SplitLayout from '../SplitLayout';

describe('SplitLayout Component', () => {
  it('renders left and right content correctly', () => {
    render(
      <SplitLayout
        left={<div data-testid="left-content">Left Content</div>}
        right={<div data-testid="right-content">Right Content</div>}
      />
    );
    
    expect(screen.getByTestId('left-content')).toBeInTheDocument();
    expect(screen.getByTestId('right-content')).toBeInTheDocument();
    expect(screen.getByText('Left Content')).toBeInTheDocument();
    expect(screen.getByText('Right Content')).toBeInTheDocument();
  });
  
  it('applies vertical split when vertical prop is true', () => {
    render(
      <SplitLayout
        left={<div>Left Content</div>}
        right={<div>Right Content</div>}
        vertical
      />
    );
    
    // Find the container element
    const splitLayoutElement = screen.getByText('Left Content').closest('div[class*="splitLayout"]');
    expect(splitLayoutElement.className).toContain('verticalSplit');
  });
  
  it('applies custom className', () => {
    render(
      <SplitLayout
        left={<div>Left Content</div>}
        right={<div>Right Content</div>}
        className="custom-class"
      />
    );
    
    const splitLayoutElement = screen.getByText('Left Content').closest('div.custom-class');
    expect(splitLayoutElement).toBeInTheDocument();
    expect(splitLayoutElement).toHaveClass('custom-class');
  });
});