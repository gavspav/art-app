import React, { useState, useEffect, useRef } from 'react';
import { palettes } from './constants/palettes';
import { blendModes } from './constants/blendModes';
import { DEFAULTS, DEFAULT_LAYER } from './constants/defaults';
import { createSeededRandom } from './utils/random';
import { getPixelRatio } from './utils/pixelRatio';
import { useFullscreen } from './hooks/useFullscreen';

import Canvas from './components/Canvas';
import Controls from './components/Controls';
import ColorPicker from './components/ColorPicker';
import LayerList from './components/LayerList';

function App() {
  // --- STATE MANAGEMENT ---
  // Global settings
  const [speed, setSpeed] = useState(DEFAULTS.speed);
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

  // --- DERIVED STATE ---
  const currentLayer = layers[selectedLayerIndex];

  // --- HANDLERS ---
  // Updates properties of the currently selected layer
  const updateCurrentLayer = (newProps) => {
    setLayers(prevLayers => {
      const updatedLayers = [...prevLayers];
      updatedLayers[selectedLayerIndex] = {
        ...updatedLayers[selectedLayerIndex],
        ...newProps,
      };
      return updatedLayers;
    });
  };

  // Adds a new layer with default settings
  const addLayer = () => {
    const newLayer = { 
      ...DEFAULT_LAYER, 
      name: `Layer ${layers.length + 1}`,
      seed: Math.floor(Math.random() * 1000), // Give it a new random seed
    };
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
          speed={speed}
          variation={variation}
          backgroundColor={backgroundColor}
          globalSeed={globalSeed}
        />
        <div className="controls-container">
          <Controls
            currentLayer={currentLayer}
            updateLayer={updateCurrentLayer}
            randomize={randomizeCurrentLayer}
            // Pass global settings as well
            speed={speed}
            setSpeed={setSpeed}
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