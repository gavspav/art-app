import React, { useEffect, useRef } from 'react';
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
    backgroundColor, setBackgroundColor,
    globalSeed,
    globalSpeedMultiplier, setGlobalSpeedMultiplier,
    globalBlendMode, setGlobalBlendMode,
    layers, setLayers,
    selectedLayerIndex, setSelectedLayerIndex,
    isOverlayVisible, setIsOverlayVisible,
    isNodeEditMode, setIsNodeEditMode,
    classicMode, setClassicMode,
  } = useAppState();

  const canvasRef = useRef();
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(canvasRef);

  // Remember prior frozen state when entering node edit mode
  const prevFrozenRef = useRef(null);

  useEffect(() => {
    setLayers(prevLayers => 
      prevLayers.map(layer => {
        if (layer.vx === 0 && layer.vy === 0) {
          const angleRad = layer.movementAngle * (Math.PI / 180);
          return {
            ...layer,
            // Map UI movementSpeed (0..5) to engine units
            vx: Math.cos(angleRad) * (layer.movementSpeed * 0.001) * 1.0,
            vy: Math.sin(angleRad) * (layer.movementSpeed * 0.001) * 1.0,
          };
        }
        return layer;
      })
    );
  }, []);

  // Normalize any persisted out-of-range values (e.g., curviness) once on load
  useEffect(() => {
    setLayers(prevLayers =>
      prevLayers.map(layer => ({
        ...layer,
        curviness: Math.min(1, Math.max(0, typeof layer.curviness === 'number' ? layer.curviness : 1)),
      }))
    );
  }, []);

  // One-time migration: scale legacy movementSpeed values (<= 0.02) to new 0–5 UI scale
  useEffect(() => {
    setLayers(prevLayers =>
      prevLayers.map(layer => {
        const ms = layer.movementSpeed;
        if (typeof ms === 'number' && ms <= 0.02) {
          const scaled = Math.min(5, Math.max(0, ms * 1000));
          const angleRad = layer.movementAngle * (Math.PI / 180);
          return {
            ...layer,
            movementSpeed: scaled,
            vx: Math.cos(angleRad) * (scaled * 0.001) * 1.0,
            vy: Math.sin(angleRad) * (scaled * 0.001) * 1.0,
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

  // Auto-freeze while in Node Edit mode; restore previous state on exit
  useEffect(() => {
    if (isNodeEditMode) {
      if (prevFrozenRef.current === null) prevFrozenRef.current = isFrozen;
      if (!isFrozen) setIsFrozen(true);
    } else {
      if (prevFrozenRef.current !== null && isFrozen !== prevFrozenRef.current) {
        setIsFrozen(prevFrozenRef.current);
      }
      prevFrozenRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNodeEditMode, isFrozen]);

  const currentLayer = layers[selectedLayerIndex];

  const updateCurrentLayer = (newProps) => {
    setLayers(prevLayers => {
      const updatedLayers = [...prevLayers];
      const currentLayer = updatedLayers[selectedLayerIndex];
      const updatedLayer = { ...currentLayer, ...newProps };

      if (newProps.movementAngle !== undefined || newProps.movementSpeed !== undefined) {
        const angleRad = updatedLayer.movementAngle * (Math.PI / 180);
        // Map UI movementSpeed (0..5) to engine units
        updatedLayer.vx = Math.cos(angleRad) * (updatedLayer.movementSpeed * 0.001) * 1.0;
        updatedLayer.vy = Math.sin(angleRad) * (updatedLayer.movementSpeed * 0.001) * 1.0;
      }

      updatedLayers[selectedLayerIndex] = updatedLayer;
      return updatedLayers;
    });
  };

  const addNewLayer = () => {
    const prev = layers[layers.length - 1] || DEFAULT_LAYER;
    const v = typeof prev.variation === 'number' ? prev.variation : DEFAULT_LAYER.variation;
    const w = Math.max(0, Math.min(1, v / 3)); // normalize 0..3 -> 0..1

    const mixRandom = (prevVal, min, max, integer = false) => {
      const rnd = min + Math.random() * (max - min);
      let next = prevVal * (1 - w) + rnd * w;
      next = Math.min(max, Math.max(min, next));
      if (integer) next = Math.round(next);
      return next;
    };

    const clamp = (val, min, max) => Math.min(max, Math.max(min, val));

    const random = createSeededRandom(Math.random());
    const newSeed = random();

    // Build new layer by varying key properties from the previous layer
    const varied = { ...prev };
    varied.name = `Layer ${layers.length + 1}`;
    varied.seed = newSeed;
    varied.noiseSeed = newSeed;

    // Geometry and style
    varied.numSides = mixRandom(prev.numSides, 3, 20, true);
    varied.curviness = mixRandom(prev.curviness ?? 1.0, 0.0, 1.0);
    varied.wobble = mixRandom(prev.wobble ?? 0.5, 0.0, 1.0);
    varied.noiseAmount = mixRandom(prev.noiseAmount ?? 0.5, 0, 8);
    varied.width = mixRandom(prev.width ?? 250, 10, 900, true);
    varied.height = mixRandom(prev.height ?? 250, 10, 900, true);
    // Keep opacity as-is; user has a global opacity control

    // Movement
    // Occasionally change style when variation is high
    if (w > 0.7 && Math.random() < w) {
      varied.movementStyle = prev.movementStyle === 'bounce' ? 'drift' : 'bounce';
    }
    varied.movementSpeed = mixRandom(prev.movementSpeed ?? 1, 0, 5);
    const nextAngle = mixRandom(prev.movementAngle ?? 45, 0, 360);
    // Wrap angle to [0,360)
    varied.movementAngle = ((nextAngle % 360) + 360) % 360;

    // Z scaling
    varied.scaleSpeed = mixRandom(prev.scaleSpeed ?? 0.05, 0, 0.2);
    // Ensure min <= max after variation
    const nextScaleMin = mixRandom(prev.scaleMin ?? 0.2, 0.1, 2);
    const nextScaleMax = mixRandom(prev.scaleMax ?? 1.5, 0.5, 3);
    varied.scaleMin = Math.min(nextScaleMin, nextScaleMax);
    varied.scaleMax = Math.max(nextScaleMin, nextScaleMax);

    // Position: start at a nearby/random location
    const baseX = prev.position?.x ?? 0.5;
    const baseY = prev.position?.y ?? 0.5;
    const jitter = 0.15 * w; // up to 15% of canvas normalized space
    const jx = (Math.random() * 2 - 1) * jitter;
    const jy = (Math.random() * 2 - 1) * jitter;
    const nx = clamp(baseX + jx, 0.0, 1.0);
    const ny = clamp(baseY + jy, 0.0, 1.0);

    varied.position = {
      ...(prev.position || DEFAULT_LAYER.position),
      x: nx,
      y: ny,
      scale: prev.position?.scale ?? 1.0,
      scaleDirection: prev.position?.scaleDirection ?? 1,
    };

    // Recompute velocity from angle/speed
    const angleRad = varied.movementAngle * (Math.PI / 180);
    varied.vx = Math.cos(angleRad) * (varied.movementSpeed * 0.001) * 1.0;
    varied.vy = Math.sin(angleRad) * (varied.movementSpeed * 0.001) * 1.0;

    // Keep colors the same for small variation; swap palette for large variation
    if (Array.isArray(prev.colors) && prev.colors.length) {
      if (w >= 0.75) {
        // pick a random palette distinct from current when possible
        const currentKey = JSON.stringify(prev.colors);
        const candidates = palettes.filter(p => JSON.stringify(p) !== currentKey);
        const chosen = (candidates.length ? candidates : palettes)[Math.floor(Math.random() * (candidates.length ? candidates.length : palettes.length))];
        varied.colors = Array.isArray(chosen) ? chosen : (chosen.colors || prev.colors);
        varied.numColors = varied.colors.length;
      } else if (w >= 0.4) {
        // light shuffle
        const arr = [...prev.colors];
        for (let i = arr.length - 1; i > 0; i--) {
          if (Math.random() < 0.5 * w) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
          }
        }
        varied.colors = arr;
        varied.numColors = arr.length;
      } else {
        varied.colors = [...prev.colors];
        varied.numColors = prev.numColors ?? prev.colors.length;
      }
    }

    setLayers([...layers, { ...DEFAULT_LAYER, ...varied }]);
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
    const randomizableParams = parameters.filter(p => p.isRandomizable);
    const layer = layers[index];

    const newProps = {};
    randomizableParams.forEach(param => {
        // Do not randomize per-layer opacity; global opacity is controlled elsewhere
        if (param.id === 'opacity') return;
        if (layer.layerType === 'image' && param.group === 'Shape') {
            return; // Skip shape params for image layers
        }
        switch (param.type) {
            case 'slider': {
                const rawValue = param.min + Math.random() * (param.max - param.min);
                const finalValue = param.step === 1 ? Math.round(rawValue) : rawValue;
                newProps[param.id] = finalValue;
                
                // Debug logging for numSides
                if (param.id === 'numSides') {
                  console.log(`Randomizing numSides (randomizeLayer): min=${param.min}, max=${param.max}, rawValue=${rawValue}, finalValue=${finalValue}`);
                }
                break;
            }
            default:
                if (param.type === 'dropdown' && param.options) {
                    newProps[param.id] = param.options[Math.floor(Math.random() * param.options.length)];
                }
        }
    });

    // Always randomize colors for this layer by selecting a preset and a number of colors
    const preset = palettes[Math.floor(Math.random() * palettes.length)];
    const presetColors = Array.isArray(preset) ? preset : (preset.colors || []);
    if (presetColors.length > 0) {
      const maxN = Math.min(5, presetColors.length);
      const minN = Math.min(3, maxN);
      const n = Math.floor(Math.random() * (maxN - minN + 1)) + minN; // choose 3..5 or up to preset length
      const colors = presetColors.slice(0, n);
      newProps.colors = colors;
      newProps.numColors = colors.length;
      newProps.selectedColor = 0;
    }

    if (randomizePalette) {
      // If caller requests palette randomization, choose a (possibly different) preset and rebuild colors
      const p2 = palettes[Math.floor(Math.random() * palettes.length)];
      const p2Colors = Array.isArray(p2) ? p2 : (p2.colors || []);
      if (p2Colors.length > 0) {
        const maxN2 = Math.min(5, p2Colors.length);
        const minN2 = Math.min(3, maxN2);
        const n2 = Math.floor(Math.random() * (maxN2 - minN2 + 1)) + minN2;
        const colors2 = p2Colors.slice(0, n2);
        newProps.colors = colors2;
        newProps.numColors = colors2.length;
        newProps.selectedColor = 0;
      }
    }

    const updatedLayer = { ...layers[index], ...newProps };

    if (newProps.movementAngle !== undefined || newProps.movementSpeed !== undefined) {
        const angleRad = updatedLayer.movementAngle * (Math.PI / 180);
        // Map UI movementSpeed (0..5) to engine units
        updatedLayer.vx = Math.cos(angleRad) * (updatedLayer.movementSpeed * 0.001) * 1.0;
        updatedLayer.vy = Math.sin(angleRad) * (updatedLayer.movementSpeed * 0.001) * 1.0;
    }

    return updatedLayer;
  };

  const randomizeCurrentLayer = (randomizePalette = false) => {
    const updated = randomizeLayer(selectedLayerIndex, randomizePalette);
    setLayers(prev => prev.map((l, i) => (i === selectedLayerIndex ? updated : l)));
  };

  // --- Modern randomizer (existing) ---
  const modernRandomizeAll = () => {
    // Helper utilities
    const clamp = (val, min, max) => Math.min(max, Math.max(min, val));
    const mixRandom = (baseVal, min, max, w, integer = false) => {
      const rnd = min + Math.random() * (max - min);
      let next = baseVal * (1 - w) + rnd * w;
      next = clamp(next, min, max);
      if (integer) next = Math.round(next);
      return next;
    };

    // Decide number of layers
    const minLayers = 3;
    const maxLayers = 8;
    const layerCount = Math.floor(Math.random() * (maxLayers - minLayers + 1)) + minLayers;

    // Choose a base scene palette preset once
    const scenePreset = palettes[Math.floor(Math.random() * palettes.length)];
    const sceneColors = Array.isArray(scenePreset) ? scenePreset : (scenePreset.colors || []);
    const basePaletteName = scenePreset?.name;

    // Choose number of colors for the scene
    const sceneMaxN = Math.min(5, sceneColors.length || 5);
    const sceneMinN = Math.min(3, sceneMaxN);
    const sceneN = sceneMaxN > 0 ? Math.floor(Math.random() * (sceneMaxN - sceneMinN + 1)) + sceneMinN : 0;
    const baseColors = sceneN > 0 ? sceneColors.slice(0, sceneN) : ["#FFC300", "#FF5733", "#C70039"]; // fallback

    // Build the first (base) layer fully random
    const baseVariation = Number((Math.random() * 3).toFixed(2)); // 0..3
    const w = clamp(baseVariation / 3, 0, 1);

    const base = {
      ...DEFAULT_LAYER,
      name: 'Layer 1',
      seed: Math.random(),
      noiseSeed: Math.random(),
      variation: baseVariation,
      numSides: Math.floor(3 + Math.random() * (20 - 3 + 1)),
      curviness: Math.random(),
      wobble: Math.random(),
      noiseAmount: Number((Math.random() * 8).toFixed(2)),
      width: Math.floor(10 + Math.random() * (900 - 10)),
      height: Math.floor(10 + Math.random() * (900 - 10)),
      opacity: Number(Math.random().toFixed(2)),
      movementStyle: Math.random() < 0.5 ? 'bounce' : 'drift',
      movementSpeed: Number((Math.random() * 5).toFixed(2)),
      movementAngle: Math.floor(Math.random() * 360),
      scaleSpeed: Number((Math.random() * 0.2).toFixed(3)),
      colors: baseColors,
      numColors: baseColors.length,
      selectedColor: 0,
      position: {
        ...DEFAULT_LAYER.position,
        x: Math.random(),
        y: Math.random(),
      },
    };
    // Ensure scale min/max are valid
    const bScaleMin = Number((0.1 + Math.random() * (2 - 0.1)).toFixed(2));
    const bScaleMax = Number((0.5 + Math.random() * (3 - 0.5)).toFixed(2));
    base.scaleMin = Math.min(bScaleMin, bScaleMax);
    base.scaleMax = Math.max(bScaleMin, bScaleMax);
    // Compute velocity
    {
      const angleRad = base.movementAngle * (Math.PI / 180);
      base.vx = Math.cos(angleRad) * (base.movementSpeed * 0.001) * 1.0;
      base.vy = Math.sin(angleRad) * (base.movementSpeed * 0.001) * 1.0;
    }

    // Create remaining layers by varying from the base using its variation
    const layersOut = [base];
    for (let i = 1; i < layerCount; i++) {
      const varied = { ...base };
      varied.name = `Layer ${i + 1}`;
      // new seeds
      varied.seed = Math.random();
      varied.noiseSeed = Math.random();

      // Vary geometry and style relative to base
      varied.numSides = mixRandom(base.numSides, 3, 20, w, true);
      varied.curviness = mixRandom(base.curviness, 0.0, 1.0, w);
      varied.wobble = mixRandom(base.wobble, 0.0, 1.0, w);
      varied.noiseAmount = mixRandom(base.noiseAmount, 0, 8, w);
      varied.width = mixRandom(base.width, 10, 900, w, true);
      varied.height = mixRandom(base.height, 10, 900, w, true);
      // Opacity and movement
      varied.opacity = mixRandom(base.opacity, 0, 1, w);
      // Occasionally switch movement style for higher variation
      if (w > 0.7 && Math.random() < w) {
        varied.movementStyle = base.movementStyle === 'bounce' ? 'drift' : 'bounce';
      }
      varied.movementSpeed = mixRandom(base.movementSpeed, 0, 5, w);
      const nextAngle = mixRandom(base.movementAngle, 0, 360, w);
      varied.movementAngle = ((nextAngle % 360) + 360) % 360;

      // Scale
      const nextScaleMin = mixRandom(base.scaleMin, 0.1, 2, w);
      const nextScaleMax = mixRandom(base.scaleMax, 0.5, 3, w);
      varied.scaleMin = Math.min(nextScaleMin, nextScaleMax);
      varied.scaleMax = Math.max(nextScaleMin, nextScaleMax);
      varied.scaleSpeed = mixRandom(base.scaleSpeed, 0, 0.2, w);

      // Position jitter
      const jitter = 0.15 * w;
      const jx = (Math.random() * 2 - 1) * jitter;
      const jy = (Math.random() * 2 - 1) * jitter;
      const nx = clamp(base.position.x + jx, 0.0, 1.0);
      const ny = clamp(base.position.y + jy, 0.0, 1.0);
      varied.position = { ...base.position, x: nx, y: ny };

      // Colors: if variation > 1, switch palette for this layer; the higher it gets, the further it deviates
      if (baseVariation > 2) {
        // Fully different palette
        const candidates = palettes.filter(p => p.name !== basePaletteName);
        const picked = (candidates.length ? candidates : palettes)[Math.floor(Math.random() * (candidates.length || palettes.length))];
        const newCols = (picked?.colors || []).slice(0, base.numColors || base.colors.length || 3);
        varied.colors = newCols.length ? newCols : [...base.colors];
        varied.numColors = varied.colors.length;
      } else if (baseVariation > 1) {
        // Mixed palette: blend some colors from base with some from a different palette
        const candidates = palettes.filter(p => p.name !== basePaletteName);
        const picked = (candidates.length ? candidates : palettes)[Math.floor(Math.random() * (candidates.length || palettes.length))];
        const n = base.numColors || base.colors.length || 3;
        const keepCount = Math.max(1, Math.round(n * (2 - baseVariation))); // more deviation as variation approaches 2
        const newCount = Math.max(0, n - keepCount);
        const fromBase = [...base.colors].sort(() => Math.random() - 0.5).slice(0, keepCount);
        const fromPicked = (picked?.colors || []).slice(0, Math.max(newCount, 0));
        const mixed = [...fromBase, ...fromPicked];
        // Shuffle mixed result slightly
        for (let k = mixed.length - 1; k > 0; k--) {
          if (Math.random() < 0.5) {
            const j = Math.floor(Math.random() * (k + 1));
            [mixed[k], mixed[j]] = [mixed[j], mixed[k]];
          }
        }
        varied.colors = mixed.length ? mixed : [...base.colors];
        varied.numColors = varied.colors.length;
      } else {
        // Variation <= 1: keep same palette with optional shuffle based on w
        if (w >= 0.75) {
          const arr = [...base.colors];
          for (let k = arr.length - 1; k > 0; k--) {
            if (Math.random() < 0.8) {
              const j = Math.floor(Math.random() * (k + 1));
              [arr[k], arr[j]] = [arr[j], arr[k]];
            }
          }
          varied.colors = arr;
          varied.numColors = arr.length;
        } else if (w >= 0.4) {
          const arr = [...base.colors];
          for (let k = arr.length - 1; k > 0; k--) {
            if (Math.random() < 0.4) {
              const j = Math.floor(Math.random() * (k + 1));
              [arr[k], arr[j]] = [arr[j], arr[k]];
            }
          }
          varied.colors = arr;
          varied.numColors = arr.length;
        } else {
          varied.colors = [...base.colors];
          varied.numColors = base.numColors;
        }
      }

      // Recompute velocity
      {
        const angleRad = varied.movementAngle * (Math.PI / 180);
        varied.vx = Math.cos(angleRad) * (varied.movementSpeed * 0.001) * 1.0;
        varied.vy = Math.sin(angleRad) * (varied.movementSpeed * 0.001) * 1.0;
      }

      layersOut.push(varied);
    }

    setLayers(layersOut.map((l, idx) => ({ ...l, name: `Layer ${idx + 1}` })));
    setSelectedLayerIndex(0);

    // Background color from scene preset
    if (sceneColors.length > 0) {
      setBackgroundColor(sceneColors[Math.floor(Math.random() * sceneColors.length)]);
    }
    // Global blend mode
    setGlobalBlendMode(blendModes[Math.floor(Math.random() * blendModes.length)]);
  };

  // --- Classic randomizer (CodePen-like) ---
  const classicRandomizeAll = () => {
    const rnd = Math.random;

    // 1. Choose scene palette once
    const scenePreset = palettes[Math.floor(rnd() * palettes.length)];
    const sceneColors = Array.isArray(scenePreset) ? scenePreset : (scenePreset.colors || []);
    const baseColors = sceneColors.length ? sceneColors : ['#FF5733', '#C70039', '#900C3F'];

    // 2. Number of layers 1..20
    const layerCount = Math.floor(rnd() * 20) + 1;

    const buildLayer = (idx) => {
      const layer = { ...DEFAULT_LAYER };
      layer.name = `Layer ${idx + 1}`;
      layer.layerType = 'shape';
      layer.seed = rnd();
      layer.noiseSeed = rnd();

      // Geometry
      layer.numSides = Math.floor(3 + rnd() * 17); // 3..20
      layer.curviness = Number((0.3 + rnd() * 1.2).toFixed(3)); // 0.3..1.5
      layer.wobble = rnd();
      layer.noiseAmount = Number((rnd() * 8).toFixed(2));
      layer.width = Math.floor(10 + rnd() * 890);
      layer.height = Math.floor(10 + rnd() * 890);

      // Appearance
      layer.colors = baseColors;
      layer.numColors = baseColors.length;
      layer.opacity = 0.8; // Global opacity target

      // Movement (bounce only)
      layer.movementStyle = 'bounce';
      layer.movementAngle = Math.floor(rnd() * 360);
      layer.movementSpeed = Number((Math.pow(rnd(), 4) * 5).toFixed(3)); // quartic scaling mapped to 0..5 UI scale
      const angleRad = layer.movementAngle * (Math.PI / 180);
      layer.vx = Math.cos(angleRad) * (layer.movementSpeed * 0.001);
      layer.vy = Math.sin(angleRad) * (layer.movementSpeed * 0.001);

      // Scale / Z
      layer.scaleMin = 0.2;
      layer.scaleMax = 1.5;
      layer.scaleSpeed = 0.05;

      // Position centreish
      layer.position = { ...DEFAULT_LAYER.position, x: rnd(), y: rnd(), scale: 1, scaleDirection: 1 };

      return layer;
    };

    const newLayers = Array.from({ length: layerCount }, (_, idx) => buildLayer(idx));

    // 3. Commit state
    setLayers(newLayers);
    setSelectedLayerIndex(0);

    // 4. Global settings
    setBackgroundColor(baseColors[Math.floor(rnd() * baseColors.length)]);
    setGlobalBlendMode('source-over');

    // Ensure blur will be applied via classicMode flag, and opacity unified
  };

  // Wrapper that chooses algorithm based on classicMode flag
  const handleRandomizeAll = () => {
    if (classicMode) classicRandomizeAll();
    else modernRandomizeAll();
  };

  const randomizeScene = () => {
    if (classicMode) return classicRandomizeAll();

    // fallback to modern variant of per-layer randomization
    const newLayers = layers.map((layer, index) => randomizeLayer(index, true));
    setLayers(newLayers);
    const bgPreset = palettes[Math.floor(Math.random() * palettes.length)];
    const bgColors = Array.isArray(bgPreset) ? bgPreset : (bgPreset.colors || []);
    if (bgColors.length > 0) {
      const randomColor = bgColors[Math.floor(Math.random() * bgColors.length)];
      setBackgroundColor(randomColor);
    }
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
              randomizeCurrentLayer={randomizeCurrentLayer}
              randomizeAll={handleRandomizeAll}
              classicMode={classicMode}
              setClassicMode={setClassicMode}
              isFrozen={isFrozen}
              setIsFrozen={setIsFrozen}
              globalSpeedMultiplier={globalSpeedMultiplier}
              setGlobalSpeedMultiplier={setGlobalSpeedMultiplier}
              globalBlendMode={globalBlendMode}
              setGlobalBlendMode={setGlobalBlendMode}
              layers={layers}
              setLayers={setLayers}
              isNodeEditMode={isNodeEditMode}
              setIsNodeEditMode={setIsNodeEditMode}
            />
            <LayerList
              layers={layers}
              selectedLayerIndex={selectedLayerIndex}
              onSelectLayer={selectLayer}
              onAddLayer={addNewLayer}
              onDeleteLayer={deleteLayer}
              setLayers={setLayers}
            />
          </div>
        </aside>
        
        {/* Main Canvas Area */}
        <div className="canvas-container">
          <Canvas
            ref={canvasRef}
            layers={layers}
            isFrozen={isFrozen}
            backgroundColor={backgroundColor}
            globalSeed={globalSeed}
            globalBlendMode={globalBlendMode}
            isNodeEditMode={isNodeEditMode}
            selectedLayerIndex={selectedLayerIndex}
            setLayers={setLayers}
            classicMode={classicMode}
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