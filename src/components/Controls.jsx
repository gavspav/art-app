// src/components/Controls.jsx
import React from 'react';

const Controls = ({
  speed, setSpeed,
  isFrozen, setIsFrozen,
  variation, setVariation,
  numLayers, setNumLayers,
  seed, setSeed,
  curviness, setCurviness,
  noiseAmount, setNoiseAmount,
  numSides, setNumSides,
  globalOpacity, setGlobalOpacity,
  blendMode, setBlendMode,
  blendModes,
  backgroundColor, setBackgroundColor,
  randomizeAll,
  shapeType, setShapeType,
  centerX, setCenterX,
  centerY, setCenterY,
  shapeWidth, setShapeWidth,
  shapeHeight, setShapeHeight
}) => (
  <div className="mb-4 flex gap-4 items-center flex-wrap">
    {/* Shape Type */}
    <div>
      <label className="text-white mr-2">Shape:</label>
      <select
        value={shapeType}
        onChange={e => setShapeType(e.target.value)}
        className="w-28"
      >
        <option value="polygon">Polygon</option>
        <option value="circle">Circle</option>
      </select>
    </div>
    {/* Speed */}
    <div>
      <label className="text-white mr-2">Speed:</label>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={Math.pow(speed/0.1, 1/4)}
        onChange={(e) => {
          const sliderValue = parseFloat(e.target.value);
          setSpeed(Math.pow(sliderValue, 4) * 0.1);
        }}
        className="w-32"
      />
      <span className="text-white ml-2">{speed.toFixed(4)}</span>
      <label className="text-white mx-2">
        <input
          type="checkbox"
          checked={isFrozen}
          onChange={(e) => setIsFrozen(e.target.checked)}
          className="mr-1 w-6 h-6 transform scale-125"
        />
        Freeze
      </label>
    </div>
    {/* Variation */}
    <div>
      <label className="text-white mr-2">Layer Variation:</label>
      <input
        type="range"
        min="0"
        max="3"
        step="0.1"
        value={variation}
        onChange={(e) => setVariation(parseFloat(e.target.value))}
        className="w-32"
      />
    </div>
    {/* Num Layers */}
    <div>
      <label className="text-white mr-2">Number of Layers:</label>
      <input
        type="range"
        min="1"
        max="20"
        step="1"
        value={numLayers}
        onChange={(e) => setNumLayers(parseInt(e.target.value))}
        className="w-32"
      />
      <span className="text-white ml-2">{numLayers}</span>
    </div>
    {/* Seed */}
    <div>
      <label className="text-white mr-2">Seed: {seed}</label>
      <button 
        onClick={() => setSeed(Math.floor(Math.random() * 10000))}
        className="px-3 py-1 bg-gray-700 rounded hover:bg-gray-600 text-white"
      >Randomize Seed</button>
    </div>
    {/* Curviness (Polygon only) */}
    {shapeType === 'polygon' && (
      <div>
        <label className="text-white mr-2">Curviness:</label>
        <input
          type="range"
          min="-1"
          max="1"
          step="0.01"
          value={curviness}
          onChange={(e) => setCurviness(parseFloat(e.target.value))}
          className="w-32"
        />
        <span className="text-white ml-2">{curviness.toFixed(2)}</span>
        <button 
          onClick={() => setCurviness(0)}
          className="px-2 py-1 ml-2 bg-gray-700 rounded hover:bg-gray-600 text-white text-xs"
        >Reset to 0</button>
      </div>
    )}

    {/* Noise Amount */}
    <div>
      <label className="text-white mr-2">Noise Amount:</label>
      <input
        type="range"
        min="0"
        max="8"
        step="0.01"
        value={noiseAmount}
        onChange={(e) => setNoiseAmount(parseFloat(e.target.value))}
        className="w-32"
      />
    </div>
    {/* Num Sides (Polygon only) */}
    {shapeType === 'polygon' && (
      <div>
        <label className="text-white mr-2">Sides:</label>
        <input
          type="range"
          min="3"
          max="20"
          step="1"
          value={numSides}
          onChange={(e) => setNumSides(parseInt(e.target.value))}
          className="w-32"
        />
        <span className="text-white ml-2">{numSides}</span>
      </div>
    )}

    {/* Center X */}
    <div>
      <label className="text-white mr-2">Center X:</label>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={centerX}
        onChange={(e) => setCenterX(parseFloat(e.target.value))}
        className="w-32"
      />
      <span className="text-white ml-2">{centerX.toFixed(2)}</span>
    </div>

    {/* Center Y */}
    <div>
      <label className="text-white mr-2">Center Y:</label>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={centerY}
        onChange={(e) => setCenterY(parseFloat(e.target.value))}
        className="w-32"
      />
      <span className="text-white ml-2">{centerY.toFixed(2)}</span>
    </div>

    {/* Shape Width */}
    <div>
      <label className="text-white mr-2">Width:</label>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={shapeWidth}
        onChange={(e) => setShapeWidth(parseFloat(e.target.value))}
        className="w-32"
      />
      <span className="text-white ml-2">{shapeWidth.toFixed(2)}</span>
    </div>

    {/* Shape Height */}
    <div>
      <label className="text-white mr-2">Height:</label>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={shapeHeight}
        onChange={(e) => setShapeHeight(parseFloat(e.target.value))}
        className="w-32"
      />
      <span className="text-white ml-2">{shapeHeight.toFixed(2)}</span>
    </div>

    {/* Opacity */}
    <div>
      <label className="text-white mr-2">Opacity:</label>
      <input
        type="range"
        min="0.1"
        max="1"
        step="0.01"
        value={globalOpacity}
        onChange={(e) => setGlobalOpacity(parseFloat(e.target.value))}
        className="w-32"
      />
      <span className="text-white ml-2">{globalOpacity.toFixed(2)}</span>
    </div>
    {/* Blend Mode */}
    <div>
      <label className="text-white mr-2">Blend Mode:</label>
      <select
        value={blendMode}
        onChange={e => setBlendMode(e.target.value)}
        className="w-32"
      >
        {blendModes.map(mode => (
          <option key={mode} value={mode}>{mode}</option>
        ))}
      </select>
    </div>
    {/* Background Color */}
    <div>
      <label className="text-white mr-2">Background:</label>
      <input
        type="color"
        value={backgroundColor}
        onChange={e => setBackgroundColor(e.target.value)}
        className="w-10 h-10 p-0 border-0"
      />
    </div>
    {/* Randomize All */}
    <div>
      <button
        onClick={randomizeAll}
        className="px-3 py-1 bg-blue-700 rounded hover:bg-blue-600 text-white"
      >Randomize All</button>
    </div>
  </div>
);

export default Controls;
