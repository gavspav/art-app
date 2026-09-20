import React from 'react';
import { ParameterProvider } from '../../context/ParameterContext.jsx';
import { AppStateProvider } from '../../context/AppStateContext.jsx';
import { MidiProvider } from '../../context/MidiContext.jsx';
import { AudioProvider } from '../../context/AudioContext.jsx';
import { BPMProvider } from '../../context/BPMContext.jsx';

const AppProviders = ({ children }) => (
  <AppStateProvider>
    <ParameterProvider>
      <MidiProvider>
        <AudioProvider>
          <BPMProvider>{children}</BPMProvider>
        </AudioProvider>
      </MidiProvider>
    </ParameterProvider>
  </AppStateProvider>
);

export default AppProviders;
