import React, { createContext, useState, useContext } from 'react';
import { PARAMETERS } from '../config/parameters';

// Create the context
const ParameterContext = createContext();

// Create a custom hook for easy access to the context
export const useParameters = () => useContext(ParameterContext);

// Create the provider component
export const ParameterProvider = ({ children }) => {
  const [parameters, setParameters] = useState(PARAMETERS);

  const updateParameter = (id, field, value) => {
    setParameters(prevParams =>
      prevParams.map(p => {
        if (p.id === id) {
          // Ensure numeric values are stored as numbers
          const newValue = (field === 'min' || field === 'max' || field === 'step' || field === 'defaultValue') 
            ? parseFloat(value) 
            : value;
          return { ...p, [field]: newValue };
        }
        return p;
      })
    );
  };

  const value = {
    parameters,
    updateParameter,
  };

  return (
    <ParameterContext.Provider value={value}>
      {children}
    </ParameterContext.Provider>
  );
};
