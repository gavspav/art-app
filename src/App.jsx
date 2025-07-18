import React, { useState, useEffect, useRef } from 'react';
import { palettes } from './constants/palettes';
import { blendModes } from './constants/blendModes';
import { DEFAULTS, DEFAULT_LAYER } from './constants/defaults';
import { createSeededRandom } from './utils/random';
import { getPixelRatio } from './utils/pixelRatio';
import { useFullscreen } from './hooks/useFullscreen';
import { useAnimation } from './hooks/useAnimation';

import Canvas from './components/Canvas';
import Controls from './components/Controls';
import ColorPicker from './components/ColorPicker';
import LayerList from './components/LayerList';

function App() {
  // --- STATE MANAGEMENT ---
  // Global settings

  const [isFrozen, setIsFrozen] = useState(DEFAULTS.isFrozen);
  const [variation, setVariation] = useState(DEFAULTS.variation);
  const [backgroundColor, setBackgroundColor] = useState(DEFAULTS.backgroundColor);
  const [guideWidth, setGuideWidth] = useState(DEFAULTS.guideWidth);
  const [guideHeight, setGuideHeight] = useState(DEFAULTS.guideHeight);
  const [globalSeed, setGlobalSeed] = useState(DEFAULTS.globalSeed);

  // Layer-specific state
  const [layers, setLayers] = useState(DEFAULTS.layers);
  const [selectedLayerIndex, setSelectedLayerIndex] = useState(DEFAULTS.selectedLayerIndex);

  // Refs and Hooks
  const canvasRef = useRef();
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(canvasRef);

  // Initialize velocities for default layers on first load
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
  }, []); // Run only once on mount

  // --- ANIMATION ENGINE --- 
  // This custom hook will contain the animation loop and physics logic
  useAnimation(setLayers, isFrozen);

  // --- DERIVED STATE ---
  const currentLayer = layers[selectedLayerIndex];

  // --- HANDLERS ---
  // Updates properties of the currently selected layer
  const updateCurrentLayer = (newProps) => {
    setLayers(prevLayers => {
      const updatedLayers = [...prevLayers];
      const currentLayer = updatedLayers[selectedLayerIndex];
      const updatedLayer = { ...currentLayer, ...newProps };

      // If movement parameters change, recalculate velocity
      if (newProps.movementAngle !== undefined || newProps.movementSpeed !== undefined) {
        const angleRad = updatedLayer.movementAngle * (Math.PI / 180);
        updatedLayer.vx = Math.cos(angleRad) * updatedLayer.movementSpeed * 1.0;
        updatedLayer.vy = Math.sin(angleRad) * updatedLayer.movementSpeed * 1.0;
      }

      updatedLayers[selectedLayerIndex] = updatedLayer;
      return updatedLayers;
    });
  };

  // Adds a new layer with default settings
  const addLayer = () => {
    let newLayer = { 
      ...DEFAULT_LAYER, 
      name: `Layer ${layers.length + 1}`,
      seed: Math.floor(Math.random() * 1000), // Give it a new random seed
    };
    // Calculate initial velocity for the new layer
    const angleRad = newLayer.movementAngle * (Math.PI / 180);
    newLayer.vx = Math.cos(angleRad) * newLayer.movementSpeed * 1.0;
    newLayer.vy = Math.sin(angleRad) * newLayer.movementSpeed * 1.0;

    setLayers([...layers, newLayer]);
    setSelectedLayerIndex(layers.length);
  };

  // Deletes a layer by its index
  const deleteLayer = (index) => {
    if (layers.length <= 1) return; // Prevent deleting the last layer
    const newLayers = layers.filter((_, i) => i !== index);
    setLayers(newLayers);
    if (selectedLayerIndex >= index) {
      setSelectedLayerIndex(Math.max(0, selectedLayerIndex - 1));
    }
  };

  // Selects a layer to be edited
  const selectLayer = (index) => {
    setSelectedLayerIndex(index);
  };

  // Randomizes the properties of the currently selected layer
  const randomizeCurrentLayer = () => {
    const random = createSeededRandom(Math.random());
    updateCurrentLayer({
      curviness: random() * 2 - 1, // -1 to 1
      noiseAmount: random() * 2,
      numSides: 3 + Math.floor(random() * 10),
      shapeWidth: 0.2 + random() * 0.8,
      shapeHeight: 0.2 + random() * 0.8,
      seed: Math.floor(random() * 1000),
    });
  };

  return (
    <div className="App">
      <main>
        <Canvas
          ref={canvasRef}
          layers={layers}
          isFrozen={isFrozen}
          variation={variation} // Keep variation for static noise, but speed is now handled in App
          backgroundColor={backgroundColor}
          globalSeed={globalSeed}
        />
        <div className="controls-container">
          <Controls
            currentLayer={currentLayer}
            updateLayer={updateCurrentLayer}
            randomize={randomizeCurrentLayer}
            variation={variation}
            setVariation={setVariation}
            isFrozen={isFrozen}
            setIsFrozen={setIsFrozen}
          />
          <LayerList
            layers={layers}
            selectedLayerIndex={selectedLayerIndex}
            onSelectLayer={selectLayer}
            onAddLayer={addLayer}
            onDeleteLayer={deleteLayer}
          />
        </div>
      </main>
      <footer>
        <button onClick={toggleFullscreen}>
          {isFullscreen ? 'Exit Fullscreen' : 'Go Fullscreen'}
        </button>
        <ColorPicker 
          color={backgroundColor} 
          onChange={setBackgroundColor} 
        />
      </footer>
    </div>
  );
}

export default App;