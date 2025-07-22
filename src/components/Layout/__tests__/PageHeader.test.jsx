/**
 * PageHeader Component Tests
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import PageHeader from '../PageHeader';

describe('PageHeader Component', () => {
  it('renders title correctly', () => {
    render(<PageHeader title="Test Title" />);
    
    expect(screen.getByText('Test Title')).toBeInTheDocument();
  });
  
  it('renders actions when provided', () => {
    render(
      <PageHeader 
        title="Test Title" 
        actions={<button data-testid="test-action">Action</button>}
      />
    );
    
    expect(screen.getByTestId('test-action')).toBeInTheDocument();
  });
  
  it('applies custom className', () => {
    render(
      <PageHeader 
        title="Test Title" 
        className="custom-class"
      />
    );
    
    const headerElement = screen.getByText('Test Title').closest('div.custom-class');
    expect(headerElement).toBeInTheDocument();
    expect(headerElement).toHaveClass('custom-class');
  });
});