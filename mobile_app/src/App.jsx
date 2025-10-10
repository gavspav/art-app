import React from 'react';
import { MobileArtProvider } from './state/useMobileArtState.js';
import TouchCanvas from './components/TouchCanvas.jsx';
import ControlsDrawer from './components/ControlsDrawer.jsx';
import HeaderBar from './components/HeaderBar.jsx';
import './styles/app.css';

const App = () => (
  <MobileArtProvider>
    <div className="app-shell">
      <HeaderBar />
      <TouchCanvas />
      <ControlsDrawer />
    </div>
  </MobileArtProvider>
);

export default App;
