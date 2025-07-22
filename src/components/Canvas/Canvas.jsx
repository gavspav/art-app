/**
 * Canvas Component - Dedicated canvas component for rendering animated art
 * Handles canvas setup, animation integration, resizing, and fullscreen functionality
 */

import React, { useRef, useEffect, useCallback, forwardRef, useMemo, memo, useState } from 'react';
import { useCanvasSimple as useCanvas } from '../../hooks/useCanvasSimple.js';
import { useFullscreen } from '../../hooks/useFullscreen.js';
import { useAnimation } from '../../hooks/useAnimation.js';
import { renderFrame } from '../../utils/animation/canvasRenderer.js';
import { generateLayerParams } from '../../utils/animation/shapeGenerator.js';
import { globalFrameRateMonitor, globalPerformanceMonitor } from '../../utils/performance.js';
import { PARAMETERS } from '../../constants/parameters.js';
import { palettes } from '../../constants/palettes.js';
import styles from './Canvas.module.css';

/**
 * Fullscreen Overlay Component
 * Displays all parameter controls in a scrollable overlay interface
 */
const FullscreenOverlay = memo(({ animationParams, onParameterChange, onClose }) => {
  // Group parameters by their group property, excluding Random group
  const groupedParameters = useMemo(() => {
    return PARAMETERS.filter(param => param.showInOverlay && param.group !== 'Random').reduce((groups, param) => {
      const group = param.group || 'Other';
      if (!groups[group]) {
        groups[group] = [];
      }
      groups[group].push(param);
      return groups;
    }, {});
  }, []);

  // Generate random value for a parameter
  const generateRandomValue = useCallback((param) => {
    switch (param.type) {
      case 'slider':
      case 'number':
        const range = param.max - param.min;
        return param.min + Math.random() * range;
      case 'dropdown':
        const randomIndex = Math.floor(Math.random() * param.options.length);
        return param.options[randomIndex];
      case 'color':
        return `#${Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')}`;
      default:
        return param.defaultValue;
    }
  }, []);

  // Randomize all parameters
  const handleRandomizeAll = useCallback(() => {
    const randomValues = {};
    PARAMETERS.forEach(param => {
      if (param.isRandomizable) {
        randomValues[param.id] = generateRandomValue(param);
      }
    });
    // Also randomize colors
    const randomColors = Array.from({ length: 3 }, () => 
      `#${Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')}`
    );
    randomValues.colors = randomColors;
    
    Object.entries(randomValues).forEach(([key, value]) => {
      onParameterChange(key, value);
    });
  }, [generateRandomValue, onParameterChange]);

  // Randomize specific group
  const handleRandomizeGroup = useCallback((groupName) => {
    const groupParams = groupedParameters[groupName] || [];
    const randomValues = {};
    
    groupParams.forEach(param => {
      if (param.isRandomizable) {
        randomValues[param.id] = generateRandomValue(param);
      }
    });
    
    Object.entries(randomValues).forEach(([key, value]) => {
      onParameterChange(key, value);
    });
  }, [groupedParameters, generateRandomValue, onParameterChange]);

  // Render individual parameter control
  const renderParameterControl = useCallback((param) => {
    const currentValue = animationParams[param.id] ?? param.defaultValue;
    
    const handleChange = (newValue) => {
      const transformedValue = param.transform?.fromSlider 
        ? param.transform.fromSlider(newValue)
        : newValue;
      onParameterChange(param.id, transformedValue);
    };

    const getDisplayValue = () => {
      return param.transform?.toSlider 
        ? param.transform.toSlider(currentValue)
        : currentValue;
    };

    const formatDisplayValue = (value) => {
      if (typeof value === 'number') {
        return param.step < 1 ? value.toFixed(3) : value.toString();
      }
      return value;
    };

    switch (param.type) {
      case 'slider':
        return (
          <div key={param.id} className={styles.overlayControl}>
            <label>{param.label}</label>
            <input
              type="range"
              min={param.min}
              max={param.max}
              step={param.step}
              value={getDisplayValue()}
              onChange={(e) => handleChange(parseFloat(e.target.value))}
            />
            <span>{formatDisplayValue(currentValue)}</span>
          </div>
        );
      
      case 'dropdown':
        return (
          <div key={param.id} className={styles.overlayControl}>
            <label>{param.label}</label>
            <select
              value={currentValue}
              onChange={(e) => handleChange(e.target.value)}
            >
              {param.options.map(option => (
                <option key={option} value={option}>
                  {option === 'source-over' ? 'Normal' : option.charAt(0).toUpperCase() + option.slice(1)}
                </option>
              ))}
            </select>
            <span>{currentValue}</span>
          </div>
        );
      
      case 'color':
        return (
          <div key={param.id} className={styles.overlayControl}>
            <label>{param.label}</label>
            <input
              type="color"
              value={currentValue}
              onChange={(e) => handleChange(e.target.value)}
            />
            <span>{currentValue}</span>
          </div>
        );
      
      case 'number':
        return (
          <div key={param.id} className={styles.overlayControl}>
            <label>{param.label}</label>
            <input
              type="number"
              min={param.min}
              max={param.max}
              step={param.step}
              value={currentValue}
              onChange={(e) => handleChange(parseInt(e.target.value))}
            />
            <span>{currentValue}</span>
          </div>
        );
      
      default:
        return null;
    }
  }, [animationParams, onParameterChange]);

  return (
    <div className={styles.fullscreenOverlay}>
      <div className={styles.overlayHeader}>
        <h3>Controls</h3>
        <div className={styles.overlayHints}>
          <span>Press H to hide • Press ESC to close</span>
        </div>
      </div>
      <div className={styles.overlayContent}>
        {/* Global controls */}
        <div className={styles.overlaySection}>
          <h4>Global</h4>
          <div className={styles.overlayControls}>
            <div className={styles.overlayControl}>
              <label>Color Palette</label>
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value && palettes[e.target.value]) {
                    onParameterChange('colors', palettes[e.target.value]);
                  }
                }}
              >
                <option value="">Custom</option>
                {Object.keys(palettes).map(paletteName => (
                  <option key={paletteName} value={paletteName}>
                    {paletteName.charAt(0).toUpperCase() + paletteName.slice(1)}
                  </option>
                ))}
              </select>
              <span>Palette</span>
            </div>
            <div className={styles.overlayControl}>
              <button
                className={styles.randomizeAllButton}
                onClick={handleRandomizeAll}
              >
                🎲 Randomize All
              </button>
            </div>
          </div>
        </div>

        {/* Parameter groups with dice icons */}
        {Object.entries(groupedParameters).map(([groupName, parameters]) => (
          <div key={groupName} className={styles.overlaySection}>
            <div className={styles.sectionHeader}>
              <h4>{groupName}</h4>
              <button
                className={styles.randomizeGroupButton}
                onClick={() => handleRandomizeGroup(groupName)}
                title={`Randomize ${groupName}`}
              >
                🎲
              </button>
            </div>
            <div className={styles.overlayControls}>
              {parameters.map(renderParameterControl)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

FullscreenOverlay.displayName = 'FullscreenOverlay';

const Canvas = memo(forwardRef(({ 
  layers = [], 
  backgroundColor = '#000000',
  globalSeed,
  isFrozen = false,
  variation,
  animationParams = {},
  isFullscreen = false,
  onFullscreenChange,
  onAnimationStateChange,
  onParameterChange,
  className = '',
  ...props 
}, ref) => {
  const containerRef = useRef(null);
  const layerParamsRef = useRef(null);
  const [showOverlay, setShowOverlay] = useState(false);
  
  // Canvas management hook
  const {
    canvasRef,
    context,
    dimensions,
    pixelRatio,
    isReady,
    error: canvasError,
    clear,
    resize
  } = useCanvas({
    autoResize: true,
    backgroundColor,
    contextType: '2d'
  });

  // Fullscreen management hook
  const {
    isFullscreen: fullscreenActive,
    toggle: toggleFullscreen,
    error: fullscreenError
  } = useFullscreen(containerRef.current);

  // Animation parameters with defaults - merge props and animationParams
  const {
    speed = 0.01,
    colors = ['#ff0000', '#00ff00', '#0000ff'],
    globalOpacity = 0.8,
    blendMode = 'multiply',
    numLayers = 3,
    numSides = 6,
    curviness = 0.5,
    noiseAmount = 1,
    guideWidth = 200,
    guideHeight = 200,
    seed = 1,
    ...otherAnimationParams
  } = animationParams;

  // Use globalSeed prop if provided, otherwise use seed from animationParams
  const finalGlobalSeed = globalSeed !== undefined ? globalSeed : seed;

  // Use props first, then animationParams, then defaults
  const finalIsFrozen = isFrozen !== undefined ? isFrozen : (animationParams.isFrozen !== undefined ? animationParams.isFrozen : false);
  const finalVariation = variation !== undefined ? variation : (animationParams.variation !== undefined ? animationParams.variation : 1);

  // Handle fullscreen state changes
  useEffect(() => {
    if (onFullscreenChange) {
      onFullscreenChange(fullscreenActive);
    }
  }, [fullscreenActive, onFullscreenChange]);

  // Memoize layer parameters generation
  const layerParams = useMemo(() => {
    if (layers.length > 0) {
      // Check if layers are in the old format (with position, colors, etc.) or new format (with freq1, freq2, etc.)
      const firstLayer = layers[0];
      if (firstLayer && firstLayer.position && firstLayer.colors) {
        // Old format - convert to new format for rendering
        return layers.map((layer, index) => ({
          freq1: 2 + (Math.sin(finalGlobalSeed + index) * 3 * finalVariation),
          freq2: 3 + (Math.cos(finalGlobalSeed + index) * 3 * finalVariation),
          freq3: 4 + (Math.sin(finalGlobalSeed + index * 2) * 30 * finalVariation),
          baseRadiusFactor: 0.4 + (Math.sin(finalGlobalSeed + index * 3) * 0.3),
          centerBaseX: layer.position.x,
          centerBaseY: layer.position.y,
          centerOffsetX: (Math.sin(finalGlobalSeed + index * 4) - 0.5) * 0.1 * finalVariation,
          centerOffsetY: (Math.cos(finalGlobalSeed + index * 4) - 0.5) * 0.1 * finalVariation,
          moveSpeedX: 0.3 + Math.sin(finalGlobalSeed + index * 5) * 0.5,
          moveSpeedY: 0.3 + Math.cos(finalGlobalSeed + index * 5) * 0.5,
          radiusBump: Math.sin(finalGlobalSeed + index * 6) * 0.3,
          // Include original layer data for rendering
          originalLayer: layer
        }));
      } else {
        // New format - use as is
        return layers;
      }
    }
    if (numLayers > 0) {
      return generateLayerParams(numLayers, finalVariation, finalGlobalSeed);
    }
    return [];
  }, [layers, numLayers, finalVariation, finalGlobalSeed]);

  // Update layer params ref when memoized value changes
  useEffect(() => {
    layerParamsRef.current = layerParams;
  }, [layerParams]);

  // Memoize shape parameters to avoid recreation on every render
  const shapeParams = useMemo(() => ({
    numSides,
    curviness,
    noiseAmount,
    guideWidth,
    guideHeight,
    variation: finalVariation
  }), [numSides, curviness, noiseAmount, guideWidth, guideHeight, finalVariation]);

  // Animation render callback with performance monitoring
  const renderAnimation = useCallback((time, deltaTime) => {
    if (!context || !isReady || !dimensions.width || !dimensions.height) {
      return;
    }

    // Performance monitoring: Record frame for FPS tracking
    globalFrameRateMonitor.recordFrame();

    try {
      // Performance monitoring: Start render timing
      globalPerformanceMonitor.startTiming('canvasRender');

      // Use generated or provided layer parameters
      const currentLayerParams = layerParamsRef.current || [];

      // Skip rendering if no layers
      if (currentLayerParams.length === 0) {
        globalPerformanceMonitor.endTiming('canvasRender');
        return;
      }

      // Extract colors and parameters from layers if available
      let renderColors = colors;
      let renderGlobalOpacity = globalOpacity;
      let renderBlendMode = blendMode;
      let renderShapeParams = shapeParams;

      // If we have original layers (old format), use their parameters
      if (currentLayerParams.length > 0 && currentLayerParams[0].originalLayer) {
        const firstLayer = currentLayerParams[0].originalLayer;
        renderColors = firstLayer.colors || colors;
        renderGlobalOpacity = firstLayer.opacity || globalOpacity;
        renderBlendMode = firstLayer.blendMode || blendMode;
        
        // Update shape parameters from layer
        renderShapeParams = {
          ...shapeParams,
          numSides: firstLayer.numSides || shapeParams.numSides,
          curviness: firstLayer.curviness || shapeParams.curviness,
          noiseAmount: firstLayer.noiseAmount || shapeParams.noiseAmount,
          guideWidth: firstLayer.width || shapeParams.guideWidth,
          guideHeight: firstLayer.height || shapeParams.guideHeight
        };
      }

      // Render the frame
      renderFrame(context, {
        time: time, // Time is already in the correct format from useAnimation
        layerParams: currentLayerParams,
        shapeParams: renderShapeParams,
        canvasSize: {
          width: dimensions.width,
          height: dimensions.height
        },
        colors: renderColors,
        globalOpacity: renderGlobalOpacity,
        blendMode: renderBlendMode,
        backgroundColor
      });

      // Performance monitoring: End render timing
      globalPerformanceMonitor.endTiming('canvasRender');
    } catch (error) {
      console.error('Animation render error:', error);
      globalPerformanceMonitor.endTiming('canvasRender');
    }
  }, [
    context,
    isReady,
    dimensions,
    shapeParams,
    colors,
    globalOpacity,
    blendMode,
    backgroundColor
  ]);

  // Use animation hook for managing animation loop
  const {
    isRunning: animationRunning,
    currentFPS,
    start: startAnimation,
    stop: stopAnimation,
    pause: pauseAnimation,
    resume: resumeAnimation,
    reset: resetAnimation
  } = useAnimation(renderAnimation, {
    speed,
    isFrozen: finalIsFrozen,
    autoStart: isReady,
    targetFPS: 60
  });

  // Start animation when canvas is ready
  useEffect(() => {
    if (isReady && !animationRunning) {
      startAnimation();
    }
  }, [isReady, animationRunning, startAnimation]);

  // Notify parent of animation state changes
  useEffect(() => {
    if (onAnimationStateChange) {
      onAnimationStateChange({
        isRunning: animationRunning,
        currentFPS,
        isFrozen: finalIsFrozen,
        controls: {
          start: startAnimation,
          stop: stopAnimation,
          pause: pauseAnimation,
          resume: resumeAnimation,
          reset: resetAnimation
        }
      });
    }
  }, [animationRunning, currentFPS, finalIsFrozen, onAnimationStateChange, startAnimation, stopAnimation, pauseAnimation, resumeAnimation, resetAnimation]);

  // Handle canvas resize
  useEffect(() => {
    if (isReady) {
      resize();
    }
  }, [isReady, resize, fullscreenActive]);

  // Handle window resize for fullscreen mode
  useEffect(() => {
    const handleResize = () => {
      if (fullscreenActive && isReady) {
        resize();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [fullscreenActive, isReady, resize]);

  // Expose canvas ref to parent
  useEffect(() => {
    if (ref) {
      if (typeof ref === 'function') {
        ref(canvasRef.current);
      } else {
        ref.current = canvasRef.current;
      }
    }
  }, [ref, canvasRef]);

  // Handle double-click to toggle fullscreen
  const handleDoubleClick = useCallback(() => {
    toggleFullscreen();
  }, [toggleFullscreen]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event) => {
      // F11 or F key to toggle fullscreen
      if (event.key === 'F11' || (event.key === 'f' && event.ctrlKey)) {
        event.preventDefault();
        toggleFullscreen();
      }
      // H key to toggle overlay interface in fullscreen mode
      else if (event.key === 'h' || event.key === 'H') {
        if (fullscreenActive) {
          event.preventDefault();
          setShowOverlay(prev => !prev);
        }
      }
      // Escape to exit fullscreen or hide overlay
      else if (event.key === 'Escape') {
        if (showOverlay && fullscreenActive) {
          event.preventDefault();
          setShowOverlay(false);
        }
        // Browser handles fullscreen exit automatically
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [toggleFullscreen, fullscreenActive, showOverlay]);

  // Error display
  if (canvasError || fullscreenError) {
    return (
      <div className={`${styles.canvasContainer} ${styles.error} ${className}`}>
        <div className={styles.errorMessage}>
          <h3>Canvas Error</h3>
          <p>{canvasError || fullscreenError}</p>
          <button onClick={() => window.location.reload()}>
            Reload Page
          </button>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className={`${styles.canvasContainer} ${fullscreenActive ? styles.fullscreen : ''} ${!isReady ? styles.loading : ''} ${className}`}
      onDoubleClick={handleDoubleClick}
      {...props}
    >
      {/* Canvas element - always rendered so useCanvas hook can initialize */}
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          visibility: isReady ? 'visible' : 'hidden'
        }}
      />
      
      {/* Loading overlay */}
      {!isReady && (
        <div className={styles.loadingMessage}>
          <div className={styles.spinner}></div>
          <p>Initializing Canvas... (isReady: {String(isReady)})</p>
        </div>
      )}
      
      {/* Fullscreen controls overlay */}
      {isReady && (
        <div className={styles.controls}>
          <button
            className={styles.fullscreenButton}
            onClick={toggleFullscreen}
            title={fullscreenActive ? 'Exit Fullscreen (F11)' : 'Enter Fullscreen (F11)'}
            aria-label={fullscreenActive ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          >
            {fullscreenActive ? '⛶' : '⛶'}
          </button>
          {fullscreenActive && (
            <div className={styles.fullscreenHint}>
              Press H to toggle controls
            </div>
          )}
        </div>
      )}

      {/* Fullscreen overlay interface */}
      {fullscreenActive && showOverlay && onParameterChange && (
        <FullscreenOverlay
          animationParams={animationParams}
          onParameterChange={onParameterChange}
          onClose={() => setShowOverlay(false)}
        />
      )}

    </div>
  );
}));

Canvas.displayName = 'Canvas';

export default Canvas;