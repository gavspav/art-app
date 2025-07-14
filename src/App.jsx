import React, { useState, useEffect, useRef } from 'react';
import { palettes } from './constants/palettes';
import { blendModes } from './constants/blendModes';
import { DEFAULTS } from './constants/defaults';
import { createSeededRandom, randomColor } from './utils/random';
import { getPixelRatio } from './utils/pixelRatio';
import { toggleFullScreen } from './utils/fullscreen';
import { useFullscreen } from './hooks/useFullscreen';
import { useSeededRandom } from './hooks/useSeededRandom';
import Canvas from './components/Canvas';
import Controls from './components/Controls';
import ColorPicker from './components/ColorPicker';
import LayerList from './components/LayerList';


function App() {
  // States
  const [speed, setSpeed] = useState(DEFAULTS.speed);
  const [isFrozen, setIsFrozen] = useState(DEFAULTS.isFrozen);
  const [variation, setVariation] = useState(DEFAULTS.variation);
  const [numLayers, setNumLayers] = useState(DEFAULTS.numLayers);
  const [colors, setColors] = useState(DEFAULTS.colors);
  const [selectedColor, setSelectedColor] = useState(DEFAULTS.selectedColor);
  const [guideWidth, setGuideWidth] = useState(DEFAULTS.guideWidth);
  const [guideHeight, setGuideHeight] = useState(DEFAULTS.guideHeight);
  const [curviness, setCurviness] = useState(DEFAULTS.curviness);
  const [noiseAmount, setNoiseAmount] = useState(DEFAULTS.noiseAmount);
  const [numSides, setNumSides] = useState(DEFAULTS.numSides);
  const [globalOpacity, setGlobalOpacity] = useState(DEFAULTS.globalOpacity);
  const [blendMode, setBlendMode] = useState(DEFAULTS.blendMode);
  const [backgroundColor, setBackgroundColor] = useState(DEFAULTS.backgroundColor);
  const [layerParams, setLayerParams] = useState([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [seed, setSeed] = useState(Math.floor(Math.random() * 10000));

  // Hooks
  useFullscreen(setIsFullscreen);
  const seededRandom = useSeededRandom(seed);

  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const timeRef = useRef(0);


  const getPixelRatio = (context) => {
    const devicePixelRatio = window.devicePixelRatio || 1;
    const backingStoreRatio = context.webkitBackingStorePixelRatio ||
                             context.mozBackingStorePixelRatio ||
                             context.msBackingStorePixelRatio ||
                             context.oBackingStorePixelRatio ||
                             context.backingStorePixelRatio || 1;
    return devicePixelRatio / backingStoreRatio;
  };
  const toggleFullScreen = (elem) => {
  // If we're already in fullscreen, exit first
  if (document.fullscreenElement) {
    document.exitFullscreen().then(() => {
      // After exiting, enter fullscreen with the new element
      if (elem !== document.fullscreenElement) {
        if (elem.requestFullscreen) {
          elem.requestFullscreen();
        } else if (elem.mozRequestFullScreen) {
          elem.mozRequestFullScreen();
        } else if (elem.webkitRequestFullscreen) {
          elem.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT);
        } else if (elem.msRequestFullscreen) {
          elem.msRequestFullscreen();
        }
      }
    });
  } else {
    // If we're not in fullscreen, just enter fullscreen with the requested element
    if (elem.requestFullscreen) {
      elem.requestFullscreen();
    } else if (elem.mozRequestFullScreen) {
      elem.mozRequestFullScreen();
    } else if (elem.webkitRequestFullscreen) {
      elem.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT);
    } else if (elem.msRequestFullscreen) {
      elem.msRequestFullscreen();
    }
  }
};

// Add this function to create a seeded random number generator
const createSeededRandom = (seed) => {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
};

const randomizeAll = () => {
  // Set a new random seed first
  const newSeed = Math.floor(Math.random() * 10000);
  setSeed(newSeed);

  // Use the new seed for all other randomization
  const seededRandom = createSeededRandom(newSeed);

  setSpeed(0.0001 + seededRandom() * 0.6);
  setVariation(seededRandom() * 3);
  setNumLayers(1 + Math.floor(seededRandom() * 20));
  setGuideWidth(10 + Math.floor(seededRandom() * 890));
  setGuideHeight(10 + Math.floor(seededRandom() * 890));
  setCurviness(0.3 + seededRandom() * 1.2);
  setNoiseAmount(seededRandom() * 8);
  setNumSides(3 + Math.floor(seededRandom() * 18));
 /* setGlobalOpacity(0.1 + seededRandom() * 0.9);

  // Random blend mode
  const blendModes = [
    "source-over", "multiply", "screen", "overlay",
    "lighter", "soft-light", "hard-light", "color-dodge"
  ];
  setBlendMode(blendModes[Math.floor(seededRandom() * blendModes.length)]);*/

  // Random background color
  // Random palette selection
  const paletteNames = Object.keys(palettes);
  const randomPalette = paletteNames[Math.floor(seededRandom() * paletteNames.length)];
  setColors(palettes[randomPalette]);

  // Random background color
  const randomColor = () => {
    const hex = Math.floor(seededRandom() * 16777215).toString(16);
    return "#" + "0".repeat(6 - hex.length) + hex;
  };
  setBackgroundColor(randomColor());
};

  // Canvas sizing effect
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const ratio = getPixelRatio(ctx);

    const handleResize = () => {
      if (isFullscreen) {
        canvas.style.width = '100vw';
        canvas.style.height = '100vh';
        canvas.width = Math.floor(window.innerWidth * ratio);
        canvas.height = Math.floor(window.innerHeight * ratio);
      } else {
        const size = Math.min(window.innerWidth * 0.8, window.innerHeight * 0.8);
        canvas.style.width = size + 'px';
        canvas.style.height = size + 'px';
        canvas.width = Math.floor(size * ratio);
        canvas.height = Math.floor(size * ratio);
      }
      ctx.scale(ratio, ratio);
    };

    handleResize();

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isFullscreen]);

  // Fullscreen change tracking
  useEffect(() => {
    const handleFullscreenChange = () => {
      const currentlyFullscreen = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement
      );
      setIsFullscreen(currentlyFullscreen);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  // Layer parameters effect
  useEffect(() => {
    const seededRandom = createSeededRandom(seed);
    const newParams = Array.from({ length: numLayers }).map(() => {
      const clamp = (num, min, max) => Math.max(min, Math.min(max, num));
    
      const centerBase = {
        x: clamp(seededRandom() * 0.4 + 0.3, 0.3, 0.7),
        y: clamp(seededRandom() * 0.4 + 0.3, 0.3, 0.7)
      };
    
      return {
        freq1: 2 + (seededRandom() - 0.5) * 3 * variation,
        freq2: 3 + (seededRandom() - 0.5) * 3 * variation,
        freq3: 4 + (seededRandom() - 0.5) * 30 * variation,
        baseRadiusFactor: 0.4 + seededRandom() * 0.3,
        centerBaseX: centerBase.x,
        centerBaseY: centerBase.y,
        centerOffsetX: clamp((seededRandom() - 0.5) * 0.1 * variation, -0.1, 0.1),
        centerOffsetY: clamp((seededRandom() - 0.5) * 0.1 * variation, -0.1, 0.1),
        moveSpeedX: 0.3 + seededRandom() * 0.5,
        moveSpeedY: 0.3 + seededRandom() * 0.5,
        radiusBump: seededRandom() * 0.3
      };
    });
    setLayerParams(newParams);
  }, [numLayers, variation, seed]);
  // Animation effect
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    function drawOilShape(t, layerParam) {
      if (!layerParam) return;

      const {
        freq1, freq2, freq3,
        centerBaseX, centerBaseY,
        centerOffsetX, centerOffsetY,
        moveSpeedX, moveSpeedY,
        radiusBump, baseRadiusFactor
      } = layerParam;

      ctx.beginPath();

    const centerX = (canvas.width/2) * centerBaseX +
  Math.sin(t * moveSpeedX) * 0.1 * canvas.width * variation +
  centerOffsetX * canvas.width;
const centerY = (canvas.height/2) * centerBaseY +
  Math.cos(t * moveSpeedY) * 0.1 * canvas.height * variation +
  centerOffsetY * canvas.height;

      const sides = numSides;
      const points = [];

     for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2;

  // Use curviness as a symmetry factor (1 = more random, 0 = more symmetrical)
  const symmetryFactor = curviness;

  // Add phase offset for symmetry
  const phase = (1 - symmetryFactor) * (i % 2) * Math.PI;

  const n1 = Math.sin(angle * freq1 + t + phase) * Math.sin(t * 0.8 * symmetryFactor);
  const n2 = Math.cos(angle * freq2 - t * 0.5 + phase) * Math.cos(t * 0.3 * symmetryFactor);
  const n3 = Math.sin(angle * freq3 + t * 1.5 + phase) * Math.sin(t * 0.6 * symmetryFactor);
  // Calculate base radius similar to old version
  const baseRadiusX = Math.min((guideWidth + radiusBump * 20) * baseRadiusFactor, canvas.width * 0.4);
  const baseRadiusY = Math.min((guideHeight + radiusBump * 20) * baseRadiusFactor, canvas.height * 0.4);

  // Apply symmetry to offsets
  const offsetX = (n1 * 20 + n2 * 15 + n3 * 10) * noiseAmount * symmetryFactor;
  const offsetY = (n1 * 20 + n2 * 15 + n3 * 10) * noiseAmount * symmetryFactor;

  const rx = baseRadiusX + offsetX;
  const ry = baseRadiusY + offsetY;

  const x = centerX + Math.cos(angle) * rx;
  const y = centerY + Math.sin(angle) * ry;

  points.push({ x, y });
}

  // Draw smooth curves like in old version
  const last = points[points.length - 1];
  const first = points[0];
  ctx.moveTo((last.x + first.x) / 2, (last.y + first.y) / 2);

  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    const midX = (current.x + next.x) / 2;
    const midY = (current.y + next.y) / 2;
    ctx.quadraticCurveTo(current.x, current.y, midX, midY);
  }

  ctx.closePath();
}

    function animate() {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.globalCompositeOperation = "source-over";
      ctx.filter = "blur(1px)";

      for (let i = 0; i < numLayers; i++) {
        ctx.globalCompositeOperation = i === 0 ? "source-over" : blendMode;
        drawOilShape(timeRef.current, layerParams[i]);

        const color = colors[i % colors.length];
        const gradient = ctx.createRadialGradient(
          canvas.width / 2,
          canvas.height / 2,
          0,
          canvas.width / 2,
          canvas.height / 2,
          200 + i * 50
        );

        gradient.addColorStop(
          0,
          color + Math.floor(globalOpacity * 255).toString(16).padStart(2, "0")
        );
        gradient.addColorStop(
          1,
          color + Math.floor(globalOpacity * 180).toString(16).padStart(2, "0")
        );

        ctx.fillStyle = gradient;
        ctx.fill();
      }

      ctx.filter = "none";
      ctx.globalCompositeOperation = "source-over";

      timeRef.current += isFrozen ? 0 : speed;
      animationRef.current = requestAnimationFrame(animate);
    }

    animate();
    return () => cancelAnimationFrame(animationRef.current);
  }, [
    speed,
    variation,
    numLayers,
    colors,
    guideWidth,
    guideHeight,
    curviness,
    noiseAmount,
    numSides,
    globalOpacity,
    blendMode,
    backgroundColor,
    layerParams,
    isFrozen
  ]);
  const replaceColor = (index) => {
    const newColors = [...colors];
    newColors[index] = selectedColor;
    setColors(newColors);
  };

  return (
    <div className="p-4 bg-black min-h-screen">
      <Controls
        speed={speed} setSpeed={setSpeed}
        isFrozen={isFrozen} setIsFrozen={setIsFrozen}
        variation={variation} setVariation={setVariation}
        numLayers={numLayers} setNumLayers={setNumLayers}
        seed={seed} setSeed={setSeed}
        curviness={curviness} setCurviness={setCurviness}
        noiseAmount={noiseAmount} setNoiseAmount={setNoiseAmount}
        numSides={numSides} setNumSides={setNumSides}
        globalOpacity={globalOpacity} setGlobalOpacity={setGlobalOpacity}
        blendMode={blendMode} setBlendMode={setBlendMode}
        blendModes={blendModes}
        backgroundColor={backgroundColor} setBackgroundColor={setBackgroundColor}
        randomizeAll={randomizeAll}
      />
      <ColorPicker
        colors={colors}
        selectedColor={selectedColor}
        setSelectedColor={setSelectedColor}
        replaceColor={replaceColor}
      />
      <LayerList numLayers={numLayers} colors={colors} />
      <div className="flex justify-center mt-6">
        <Canvas
          ref={canvasRef}
          isFullscreen={isFullscreen}
          speed={speed}
          variation={variation}
          numLayers={numLayers}
          colors={colors}
          guideWidth={guideWidth}
          guideHeight={guideHeight}
          curviness={curviness}
          noiseAmount={noiseAmount}
          numSides={numSides}
          globalOpacity={globalOpacity}
          blendMode={blendMode}
          backgroundColor={backgroundColor}
          layerParams={layerParams}
          isFrozen={isFrozen}
        />
      </div>
    </div>
  );
}

export default App;