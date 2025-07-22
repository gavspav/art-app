/**
 * Main App Component
 * 
 * The root component of the application that sets up the overall structure
 * and manages the global state.
 */

import React, { useState, useEffect } from 'react';
import { AppLayout, PageHeader, SplitLayout, ContentContainer } from './components/Layout';
import Canvas from './components/Canvas/Canvas';

import ControlPanel from './components/Controls/ControlPanel';
import { loadConfiguration, saveConfiguration, getSavedConfigList } from './services/configurationService';
import styles from './App.module.css';

/**
 * Default animation parameters
 */
const DEFAULT_PARAMS = {
  numLayers: 3,
  speed: 0.005,
  colors: ['#ff0055', '#00aaff', '#22cc88'],
  globalOpacity: 0.5,
  blendMode: 'screen',
  variation: 1.0,
  seed: Math.floor(Math.random() * 1000000)
};

/**
 * Main App component
 * 
 * @returns {React.ReactElement} The rendered App component
 */
function App() {
  // Animation parameters state
  const [animationParams, setAnimationParams] = useState(DEFAULT_PARAMS);
  
  // UI state
  const [isFrozen, setIsFrozen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [configName, setConfigName] = useState('');
  const [savedConfigs, setSavedConfigs] = useState([]);
  const [selectedConfig, setSelectedConfig] = useState('');
  
  // Load default configuration and saved config list on startup
  useEffect(() => {
    const result = loadConfiguration('default');
    if (result.success) {
      setAnimationParams({
        ...DEFAULT_PARAMS,
        ...result.data.appState
      });
    }
    
    // Load list of saved configurations
    const configs = getSavedConfigList();
    setSavedConfigs(configs);
  }, []);
  
  // Handle parameter changes
  const handleParamChange = (paramName, value) => {
    setAnimationParams(prev => ({
      ...prev,
      [paramName]: value
    }));
  };
  
  // Handle saving the current configuration
  const handleSaveConfig = () => {
    if (!configName.trim()) return;
    
    const result = saveConfiguration(configName, [], animationParams);
    if (result.success) {
      // Update the saved configs list
      const configs = getSavedConfigList();
      setSavedConfigs(configs);
      setConfigName('');
    }
  };

  // Handle loading a saved configuration
  const handleLoadConfig = (configName) => {
    if (!configName) return;
    
    const result = loadConfiguration(configName);
    if (result.success) {
      setAnimationParams({
        ...DEFAULT_PARAMS,
        ...result.data.appState
      });
      setSelectedConfig(configName);
    }
  };
  
  // Create header with app title and actions
  const header = (
    <PageHeader 
      title="Art Generator" 
      actions={
        <div className={styles.headerActions}>
          <select
            value={selectedConfig}
            onChange={(e) => handleLoadConfig(e.target.value)}
            className={styles.configSelect}
          >
            <option value="">Load Configuration...</option>
            {savedConfigs.map(configName => (
              <option key={configName} value={configName}>
                {configName}
              </option>
            ))}
          </select>
          <input 
            type="text" 
            value={configName} 
            onChange={(e) => setConfigName(e.target.value)}
            placeholder="Configuration name"
            className={styles.configInput}
          />
          <button 
            onClick={handleSaveConfig}
            className={styles.saveButton}
            disabled={!configName.trim()}
          >
            Save
          </button>
        </div>
      }
    />
  );
  
  return (
    <AppLayout header={header}>
      <SplitLayout
        defaultSize={300}
        minSize={200}
        maxSize={600}
        left={
          <ContentContainer>
            <ControlPanel 
              values={animationParams} 
              onChange={handleParamChange}
              onRandomize={(randomValues) => setAnimationParams(prev => ({ ...prev, ...randomValues }))}
              colors={animationParams.colors || DEFAULT_PARAMS.colors}
              onColorsChange={(colors) => handleParamChange('colors', colors)}
              selectedPalette="custom"
              onPaletteChange={() => {}}
            />
          </ContentContainer>
        }
        right={
          <Canvas 
            animationParams={animationParams}
            backgroundColor={animationParams.backgroundColor || '#000000'}
            isFrozen={isFrozen}
            onFullscreenChange={setIsFullscreen}
            onParameterChange={handleParamChange}
          />
        }
      />
    </AppLayout>
  );
}

export default App;