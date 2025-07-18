import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import { ParameterProvider, useParameters } from './context/ParameterContext.jsx';
import { AppStateProvider, useAppState } from './context/AppStateContext.jsx';
import { palettes } from './constants/palettes';
import { blendModes } from './constants/blendModes';
import { DEFAULTS, DEFAULT_LAYER } from './constants/defaults';
import { createSeededRandom } from './utils/random';
import { useFullscreen } from './hooks/useFullscreen';
import { useAnimation } from './hooks/useAnimation.js';
import './App.css';

import Canvas from './components/Canvas';
import Controls from './components/Controls';
import BackgroundColorPicker from './components/BackgroundColorPicker';
import LayerList from './components/LayerList';
import Settings from './pages/Settings';

// The MainApp component now contains all the core application logic
const MainApp = () => {
  const { parameters } = useParameters(); // Get parameters from context
  // Get app state from context
  const {
    isFrozen, setIsFrozen,
    variation, setVariation,
    backgroundColor, setBackgroundColor,
    globalSeed, setGlobalSeed,
    globalSpeedMultiplier, setGlobalSpeedMultiplier,
    layers, setLayers,
    selectedLayerIndex, setSelectedLayerIndex,
    isOverlayVisible, setIsOverlayVisible
  } = useAppState();

  const canvasRef = useRef();
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(canvasRef);

  useEffect(() => {
    setLayers(prevLayers => 
      prevLayers.map(layer => {
        if (layer.vx === 0 && layer.vy === 0) {
          const angleRad = layer.movementAngle * (Math.PI / 180);
          return {
            ...layer,
            vx: Math.cos(angleRad) * layer.movementSpeed * 1.0,
            vy: Math.sin(angleRad) * layer.movementSpeed * 1.0,
          };
        }
        return layer;
      })
    );
  }, []);

  // Keyboard shortcut for hiding the overlay
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger if user is typing in an input
      if (e.code === 'Space' && e.target.tagName.toLowerCase() !== 'input' && e.target.tagName.toLowerCase() !== 'select') {
        e.preventDefault();
        setIsOverlayVisible(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useAnimation(setLayers, isFrozen, globalSpeedMultiplier);

  const currentLayer = layers[selectedLayerIndex];

  const updateCurrentLayer = (newProps) => {
    setLayers(prevLayers => {
      const updatedLayers = [...prevLayers];
      const currentLayer = updatedLayers[selectedLayerIndex];
      const updatedLayer = { ...currentLayer, ...newProps };

      if (newProps.movementAngle !== undefined || newProps.movementSpeed !== undefined) {
        const angleRad = updatedLayer.movementAngle * (Math.PI / 180);
        updatedLayer.vx = Math.cos(angleRad) * updatedLayer.movementSpeed * 1.0;
        updatedLayer.vy = Math.sin(angleRad) * updatedLayer.movementSpeed * 1.0;
      }

      updatedLayers[selectedLayerIndex] = updatedLayer;
      return updatedLayers;
    });
  };

  const addNewLayer = () => {
    const random = createSeededRandom(Math.random());
    const newSeed = random();
    const newLayer = {
      ...DEFAULT_LAYER,
      name: `Layer ${layers.length + 1}`,
      seed: newSeed,
      noiseSeed: newSeed,
      position: { 
        ...DEFAULT_LAYER.position,
        x: random(),
        y: random(),
      }
    };
    const angleRad = newLayer.movementAngle * (Math.PI / 180);
    newLayer.vx = Math.cos(angleRad) * newLayer.movementSpeed * 1.0;
    newLayer.vy = Math.sin(angleRad) * newLayer.movementSpeed * 1.0;

    setLayers([...layers, newLayer]);
    setSelectedLayerIndex(layers.length);
  };

  const deleteLayer = (index) => {
    if (layers.length <= 1) return;
    const newLayers = layers.filter((_, i) => i !== index);
    setLayers(newLayers);
    if (selectedLayerIndex >= index) {
      setSelectedLayerIndex(Math.max(0, selectedLayerIndex - 1));
    }
  };

  const selectLayer = (index) => {
    setSelectedLayerIndex(index);
  };

  const randomizeLayer = (index, randomizePalette = false) => {
    const random = createSeededRandom(Math.random());
    const randomizableParams = parameters.filter(p => p.isRandomizable);
    
    const newProps = {};
    randomizableParams.forEach(param => {
        if (currentLayer.layerType === 'image' && param.group === 'Shape') {
            return; // Skip shape params for image layers
        }
        switch (param.type) {
            case 'slider':
                newProps[param.id] = param.min + random() * (param.max - param.min);
                break;
            case 'palette':
                newProps[param.id] = palettes[Math.floor(Math.random() * palettes.length)];
                break;
            default:
                if (param.type === 'dropdown' && param.options) {
                    newProps[param.id] = param.options[Math.floor(random() * param.options.length)];
                }
        }
    });

    if (randomizePalette) {
        newProps.colors = palettes[Math.floor(Math.random() * palettes.length)];
    }

    const updatedLayer = { ...layers[index], ...newProps };

    if (newProps.movementAngle !== undefined || newProps.movementSpeed !== undefined) {
        const angleRad = updatedLayer.movementAngle * (Math.PI / 180);
        updatedLayer.vx = Math.cos(angleRad) * updatedLayer.movementSpeed * 1.0;
        updatedLayer.vy = Math.sin(angleRad) * updatedLayer.movementSpeed * 1.0;
    }

    return updatedLayer;
  };

  const handleRandomizeAll = () => {
    const random = createSeededRandom(Math.random());
    const randomizableParams = parameters.filter(p => p.isRandomizable);

    setLayers(prevLayers =>
      prevLayers.map(layer => {
        const newProps = {};
        randomizableParams.forEach(param => {
          if (layer.layerType === 'image' && param.group === 'Shape') {
            return; // Skip shape params for image layers
          }
          switch (param.type) {
            case 'slider':
                newProps[param.id] = param.min + random() * (param.max - param.min);
                break;
            case 'palette':
                newProps[param.id] = palettes[Math.floor(random() * palettes.length)];
                break;
            default:
                if (param.type === 'dropdown' && param.options) {
                    newProps[param.id] = param.options[Math.floor(random() * param.options.length)];
                }
          }
        });

        // Always randomize colors (palettes) for each layer - this is a core feature
        newProps.colors = palettes[Math.floor(random() * palettes.length)];
        
        // Only randomize blendMode if it's marked as randomizable (if such a parameter exists)
        const blendModeParam = parameters.find(p => p.id === 'blendMode');
        if (blendModeParam && blendModeParam.isRandomizable) {
          newProps.blendMode = blendModes[Math.floor(random() * blendModes.length)];
        } else {
          // If no blendMode parameter exists, randomize it anyway for variety
          newProps.blendMode = blendModes[Math.floor(random() * blendModes.length)];
        }

        // Recalculate velocity if movement params were randomized
        const finalMovementSpeed = newProps.movementSpeed ?? layer.movementSpeed;
        const finalMovementAngle = newProps.movementAngle ?? layer.movementAngle;
        const angleRad = finalMovementAngle * (Math.PI / 180);
        const vx = Math.cos(angleRad) * finalMovementSpeed * 1.0;
        const vy = Math.sin(angleRad) * finalMovementSpeed * 1.0;

        return { ...layer, ...newProps, vx, vy };
      })
    );
    
    // Also randomize background color
    const randomPalette = palettes[Math.floor(random() * palettes.length)];
    const randomColor = randomPalette[Math.floor(random() * randomPalette.length)];
    setBackgroundColor(randomColor);
  };

  const randomizeScene = () => {
    const newLayers = layers.map((layer, index) => randomizeLayer(index, true));
    setLayers(newLayers);
    
    const randomPalette = palettes[Math.floor(Math.random() * palettes.length)];
    const randomColor = randomPalette[Math.floor(Math.random() * randomPalette.length)];
    setBackgroundColor(randomColor);
  };

  const downloadImage = () => {
    const canvas = canvasRef.current;
    const link = document.createElement('a');
    link.download = 'layered-shape.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className={`App ${isFullscreen ? 'fullscreen' : ''}`}>
      <main className="main-layout">
        {/* Left Sidebar - Hidden in fullscreen */}
        <aside className={`sidebar ${isFullscreen ? 'hidden' : ''} ${isOverlayVisible ? '' : 'collapsed'}`}>
          <div className="sidebar-header">
            <h2>Controls</h2>
            <button 
              className="toggle-sidebar-btn"
              onClick={() => setIsOverlayVisible(!isOverlayVisible)}
              title={isOverlayVisible ? 'Hide Controls' : 'Show Controls'}
            >
              {isOverlayVisible ? '←' : '→'}
            </button>
          </div>
          <div className="sidebar-content">
            <Controls
              currentLayer={currentLayer}
              updateLayer={updateCurrentLayer}
              randomizeLayer={() => randomizeLayer(selectedLayerIndex)}
              randomizeAll={handleRandomizeAll}
              variation={variation}
              setVariation={setVariation}
              isFrozen={isFrozen}
              setIsFrozen={setIsFrozen}
              globalSpeedMultiplier={globalSpeedMultiplier}
              setGlobalSpeedMultiplier={setGlobalSpeedMultiplier}
            />
            <LayerList
              layers={layers}
              selectedLayerIndex={selectedLayerIndex}
              onSelectLayer={selectLayer}
              onAddLayer={addNewLayer}
              onDeleteLayer={deleteLayer}
            />
          </div>
        </aside>
        
        {/* Main Canvas Area */}
        <div className="canvas-container">
          <Canvas
            ref={canvasRef}
            layers={layers}
            isFrozen={isFrozen}
            variation={variation}
            backgroundColor={backgroundColor}
            globalSeed={globalSeed}
          />
          
          {/* Floating Action Buttons */}
          <div className="floating-actions">
            <button onClick={downloadImage} className="fab" title="Download PNG">
              ⬇
            </button>
            <button onClick={randomizeScene} className="fab" title="Randomize Scene">
              🎲
            </button>
            <button onClick={toggleFullscreen} className="fab" title={isFullscreen ? 'Exit Fullscreen' : 'Go Fullscreen'}>
              {isFullscreen ? '⤓' : '⤢'}
            </button>
          </div>
        </div>
      </main>
      <footer>
        <Link to="/settings">Settings</Link>
        <BackgroundColorPicker
              color={backgroundColor}
              onChange={setBackgroundColor}
            />
      </footer>
    </div>
  );
};

// The App component is now the router
const App = () => {
  return (
    <AppStateProvider>
      <ParameterProvider>
        <Routes>
          <Route path="/" element={<MainApp />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </ParameterProvider>
    </AppStateProvider>
  );
};

export default App;