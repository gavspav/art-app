/**
 * AppLayout Component Tests
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import AppLayout from '../AppLayout';

describe('AppLayout Component', () => {
  it('renders children correctly', () => {
    render(
      <AppLayout>
        <div data-testid="test-content">Test Content</div>
      </AppLayout>
    );
    
    expect(screen.getByTestId('test-content')).toBeInTheDocument();
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });
  
  it('renders header when provided', () => {
    render(
      <AppLayout header={<div data-testid="test-header">Header</div>}>
        <div>Content</div>
      </AppLayout>
    );
    
    expect(screen.getByTestId('test-header')).toBeInTheDocument();
  });
  
  it('renders footer when provided', () => {
    render(
      <AppLayout footer={<div data-testid="test-footer">Footer</div>}>
        <div>Content</div>
      </AppLayout>
    );
    
    expect(screen.getByTestId('test-footer')).toBeInTheDocument();
  });
  
  it('applies custom className', () => {
    render(
      <AppLayout className="custom-class">
        <div>Content</div>
      </AppLayout>
    );
    
    const layoutElement = screen.getByText('Content').closest('div.custom-class');
    expect(layoutElement).toBeInTheDocument();
    expect(layoutElement).toHaveClass('custom-class');
  });
});