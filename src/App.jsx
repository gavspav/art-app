import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import { ParameterProvider, useParameters } from './context/ParameterContext.jsx';
import { palettes } from './constants/palettes';
import { blendModes } from './constants/blendModes';
import { DEFAULTS, DEFAULT_LAYER } from './constants/defaults';
import { createSeededRandom } from './utils/random';
import { useFullscreen } from './hooks/useFullscreen';
import { useAnimation } from './hooks/useAnimation.js';

import Canvas from './components/Canvas';
import Controls from './components/Controls';
import BackgroundColorPicker from './components/BackgroundColorPicker';
import LayerList from './components/LayerList';
import Settings from './pages/Settings';

// The MainApp component now contains all the core application logic
const MainApp = () => {
  const { parameters } = useParameters(); // Get parameters from context
  // --- STATE MANAGEMENT ---
  const [isFrozen, setIsFrozen] = useState(DEFAULTS.isFrozen);
  const [variation, setVariation] = useState(DEFAULTS.variation);
  const [backgroundColor, setBackgroundColor] = useState(DEFAULTS.backgroundColor);
  const [globalSeed, setGlobalSeed] = useState(DEFAULTS.globalSeed);
  const [globalSpeedMultiplier, setGlobalSpeedMultiplier] = useState(DEFAULTS.globalSpeedMultiplier);
  const [layers, setLayers] = useState([{
    ...DEFAULT_LAYER,
    position: { ...DEFAULT_LAYER.position }
  }]);
  const [selectedLayerIndex, setSelectedLayerIndex] = useState(DEFAULTS.selectedLayerIndex);
  const [isOverlayVisible, setIsOverlayVisible] = useState(true);

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
                newProps[param.id] = palettes[Math.floor(Math.random() * palettes.length)];
                break;
            default:
                if (param.type === 'dropdown' && param.options) {
                    newProps[param.id] = param.options[Math.floor(random() * param.options.length)];
                }
          }
        });

        // Also randomize a few non-configurable things for more variety
        newProps.colors = palettes[Math.floor(Math.random() * palettes.length)];
        newProps.blendMode = blendModes[Math.floor(Math.random() * blendModes.length)];

        // Recalculate velocity if movement params were randomized
        const finalMovementSpeed = newProps.movementSpeed ?? layer.movementSpeed;
        const finalMovementAngle = newProps.movementAngle ?? layer.movementAngle;
        const angleRad = finalMovementAngle * (Math.PI / 180);
        const vx = Math.cos(angleRad) * finalMovementSpeed * 1.0;
        const vy = Math.sin(angleRad) * finalMovementSpeed * 1.0;

        return { ...layer, ...newProps, vx, vy };
      })
    );
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
    <div className="App">
      <main>
        <Canvas
          ref={canvasRef}
          layers={layers}
          isFrozen={isFrozen}
          variation={variation}
          backgroundColor={backgroundColor}
          globalSeed={globalSeed}
        />
        <div className={`controls-container ${isOverlayVisible ? '' : 'hidden'}`}>
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
      </main>
      <footer>
        <button onClick={downloadImage}>Download as PNG</button>
        <button onClick={randomizeScene}>Randomize Scene</button>
        <button onClick={toggleFullscreen}>
          {isFullscreen ? 'Exit Fullscreen' : 'Go Fullscreen'}
        </button>
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
function App() {
  return (
    <ParameterProvider>
      <Routes>
        <Route path="/" element={<MainApp />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </ParameterProvider>
  );
}

export default App;