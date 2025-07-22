/**
 * ContentContainer Component Tests
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import ContentContainer from '../ContentContainer';

describe('ContentContainer Component', () => {
  it('renders children correctly', () => {
    render(
      <ContentContainer>
        <div data-testid="test-content">Test Content</div>
      </ContentContainer>
    );
    
    expect(screen.getByTestId('test-content')).toBeInTheDocument();
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });
  
  it('applies custom className', () => {
    render(
      <ContentContainer className="custom-class">
        <div>Content</div>
      </ContentContainer>
    );
    
    const containerElement = screen.getByText('Content').closest('div.custom-class');
    expect(containerElement).toBeInTheDocument();
    expect(containerElement).toHaveClass('custom-class');
  });
  
  it('applies noPadding class when noPadding is true', () => {
    render(
      <ContentContainer noPadding>
        <div>Content</div>
      </ContentContainer>
    );
    
    // Find the container element that contains the text 'Content'
    const containerElement = screen.getByText('Content').parentElement;
    expect(containerElement.className).toContain('noPadding');
  });
});