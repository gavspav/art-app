import React from 'react';
import { renderHook } from '@testing-library/react';
import { DEFAULT_PARAMETERS } from '@art-app/core';
import { ParameterProvider, useParameters } from '../ParameterContext.jsx';

describe('ParameterContext', () => {
  const wrapper = ({ children }) => (
    <ParameterProvider>{children}</ParameterProvider>
  );

  test('exposes parameters seeded from core defaults', () => {
    const { result } = renderHook(() => useParameters(), { wrapper });
    expect(result.current.parameters.length).toBe(DEFAULT_PARAMETERS.length);
  });
});
