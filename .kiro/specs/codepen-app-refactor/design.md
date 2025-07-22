# Design Document

## Overview

This design document outlines the refactoring of a monolithic React art application into a modular, maintainable Vite-based project. The current application is a single 1200+ line file that generates animated canvas art with configurable parameters. The refactored version will maintain identical functionality while improving code organization, testability, and developer experience.

The application generates animated geometric shapes on an HTML5 canvas using configurable parameters like speed, layer variation, shape properties, and color palettes. Users can save/load configurations, randomize parameters, and toggle fullscreen mode.

## Architecture

### Project Structure
```
art-app/
├── public/
│   └── vite.svg
├── src/
│   ├── components/
│   │   ├── Canvas/
│   │   │   ├── Canvas.jsx
│   │   │   └── Canvas.module.css
│   │   ├── Controls/
│   │   │   ├── ControlPanel.jsx
│   │   │   ├── ParameterControl.jsx
│   │   │   ├── ColorPalette.jsx
│   │   │   └── Controls.module.css
│   │   ├── Settings/
│   │   │   ├── SettingsPanel.jsx
│   │   │   ├── ParameterEditor.jsx
│   │   │   ├── ConfigurationManager.jsx
│   │   │   └── Settings.module.css
│   │   └── Layout/
│   │       ├── AppLayout.jsx
│   │       └── Layout.module.css
│   ├── hooks/
│   │   ├── useAnimation.js
│   │   ├── useCanvas.js
│   │   ├── useConfiguration.js
│   │   ├── useFullscreen.js
│   │   └── useParameters.js
│   ├── services/
│   │   ├── configurationService.js
│   │   └── storageService.js
│   ├── utils/
│   │   ├── animation/
│   │   │   ├── canvasRenderer.js
│   │   │   ├── shapeGenerator.js
│   │   │   └── animationLoop.js
│   │   ├── canvas/
│   │   │   ├── pixelRatio.js
│   │   │   └── fullscreen.js
│   │   ├── math/
│   │   │   ├── seededRandom.js
│   │   │   └── transformations.js
│   │   └── validation/
│   │       └── parameterValidation.js
│   ├── constants/
│   │   ├── parameters.js
│   │   ├── palettes.js
│   │   └── defaults.js
│   ├── App.jsx
│   ├── App.module.css
│   ├── main.jsx
│   └── index.css
├── package.json
├── vite.config.js
└── index.html
```

### Technology Stack
- **Build Tool**: Vite for fast development and optimized builds
- **Framework**: React 18 with hooks
- **Styling**: CSS Modules for component-scoped styles
- **Canvas**: HTML5 Canvas API for rendering
- **Storage**: localStorage for configuration persistence
- **Development**: ESLint for code quality

## Components and Interfaces

### Core Components

#### App.jsx
Main application component that orchestrates the entire application.
```javascript
// Props: None (root component)
// State: Global application state coordination
// Responsibilities:
// - Initialize application
// - Coordinate between major sections
// - Handle global state management
```

#### Canvas/Canvas.jsx
Dedicated canvas component for rendering animated art.
```javascript
// Props: 
// - animationParams: object
// - canvasSettings: object
// - isFullscreen: boolean
// State: Canvas-specific state (refs, animation frame)
// Responsibilities:
// - Canvas setup and sizing
// - Animation loop management
// - Rendering coordination
```

#### Controls/ControlPanel.jsx
Main control interface for parameter adjustment.
```javascript
// Props:
// - parameters: array
// - values: object
// - onChange: function
// - onRandomize: function
// State: UI interaction state
// Responsibilities:
// - Render parameter controls
// - Handle user input
// - Coordinate control updates
```

#### Controls/ParameterControl.jsx
Individual parameter control component.
```javascript
// Props:
// - parameter: object
// - value: any
// - onChange: function
// State: Control-specific state
// Responsibilities:
// - Render appropriate input type (slider, dropdown, color, etc.)
// - Handle value transformations
// - Validate input
```

#### Settings/SettingsPanel.jsx
Configuration and parameter management interface.
```javascript
// Props:
// - isOpen: boolean
// - onClose: function
// - parameters: array
// - onParameterUpdate: function
// State: Settings modal state
// Responsibilities:
// - Parameter configuration editing
// - Settings modal management
// - Configuration save/load interface
```

#### Settings/ConfigurationManager.jsx
Save/load configuration functionality.
```javascript
// Props:
// - configurations: array
// - onSave: function
// - onLoad: function
// - onDelete: function
// State: Configuration management state
// Responsibilities:
// - Configuration CRUD operations
// - File name management
// - Success/error messaging
```

### Custom Hooks

#### useAnimation.js
Manages animation loop and timing.
```javascript
// Returns: { timeRef, isRunning, start, stop, reset }
// Responsibilities:
// - Animation frame management
// - Time tracking
// - Animation state control
```

#### useCanvas.js
Handles canvas setup and management.
```javascript
// Returns: { canvasRef, context, dimensions, pixelRatio }
// Responsibilities:
// - Canvas initialization
// - Pixel ratio handling
// - Resize management
```

#### useConfiguration.js
Manages configuration save/load operations.
```javascript
// Returns: { save, load, delete, list, message }
// Responsibilities:
// - Configuration persistence
// - Error handling
// - Message management
```

#### useFullscreen.js
Handles fullscreen functionality.
```javascript
// Returns: { isFullscreen, toggle, enter, exit }
// Responsibilities:
// - Fullscreen API management
// - Cross-browser compatibility
// - State tracking
```

#### useParameters.js
Manages parameter state and updates.
```javascript
// Returns: { parameters, values, updateParameter, randomizeAll }
// Responsibilities:
// - Parameter state management
// - Value validation
// - Randomization logic
```

### Services

#### configurationService.js
Handles configuration data operations.
```javascript
// Functions:
// - saveConfiguration(name, data)
// - loadConfiguration(name)
// - deleteConfiguration(name)
// - listConfigurations()
// Responsibilities:
// - Configuration data serialization
// - Version management
// - Data validation
```

#### storageService.js
Abstracts localStorage operations.
```javascript
// Functions:
// - setItem(key, value)
// - getItem(key)
// - removeItem(key)
// - clear()
// Responsibilities:
// - Storage abstraction
// - Error handling
// - Data serialization
```

### Utility Modules

#### animation/canvasRenderer.js
Core canvas rendering functions.
```javascript
// Functions:
// - setupCanvas(canvas, context)
// - clearCanvas(context, width, height, backgroundColor)
// - renderFrame(context, layers, time)
// Responsibilities:
// - Canvas drawing operations
// - Rendering optimization
// - Graphics state management
```

#### animation/shapeGenerator.js
Geometric shape generation algorithms.
```javascript
// Functions:
// - generateOilShape(params, time)
// - calculatePoints(sides, radius, center, noise)
// - applyTransformations(points, params)
// Responsibilities:
// - Shape algorithm implementation
// - Point calculation
// - Geometric transformations
```

#### math/seededRandom.js
Seeded random number generation.
```javascript
// Functions:
// - createSeededRandom(seed)
// - randomInRange(min, max, random)
// - randomChoice(array, random)
// Responsibilities:
// - Deterministic randomization
// - Utility random functions
// - Seed management
```

## Data Models

### Parameter Definition
```javascript
{
  id: string,           // Unique identifier
  label: string,        // Display name
  type: string,         // 'slider' | 'dropdown' | 'color' | 'number'
  min?: number,         // Minimum value (for numeric types)
  max?: number,         // Maximum value (for numeric types)
  step?: number,        // Step increment (for numeric types)
  options?: string[],   // Available options (for dropdown)
  defaultValue: any,    // Default value
  isRandomizable: boolean, // Can be randomized
  showInOverlay: boolean,  // Show in main UI
  group: string,        // Parameter grouping
  transform?: {         // Value transformation functions
    toSlider: function,
    fromSlider: function
  }
}
```

### Application State
```javascript
{
  // Animation parameters
  speed: number,
  variation: number,
  numLayers: number,
  
  // Shape parameters
  guideWidth: number,
  guideHeight: number,
  curviness: number,
  noiseAmount: number,
  numSides: number,
  
  // Appearance parameters
  globalOpacity: number,
  blendMode: string,
  backgroundColor: string,
  colors: string[],
  selectedColor: string,
  
  // System state
  seed: number,
  isFrozen: boolean,
  isFullscreen: boolean,
  layerParams: object[]
}
```

### Configuration Data
```javascript
{
  parameters: Parameter[],  // Parameter definitions
  appState: AppState,      // Current application state
  savedAt: string,         // ISO timestamp
  version: string          // Configuration version
}
```

## Error Handling

### Storage Errors
- **localStorage unavailable**: Graceful degradation with in-memory storage
- **Quota exceeded**: User notification with cleanup suggestions
- **Corrupted data**: Fallback to default configuration with user notification

### Canvas Errors
- **Context creation failure**: Display error message with fallback UI
- **Animation frame errors**: Automatic recovery with error logging
- **Rendering errors**: Skip problematic frames and continue animation

### Parameter Validation
- **Invalid values**: Clamp to valid range with user notification
- **Type mismatches**: Convert or reset to default value
- **Missing parameters**: Use default values with warning

### Configuration Errors
- **Load failures**: Display error message and maintain current state
- **Save failures**: Retry mechanism with user feedback
- **Version mismatches**: Migration or fallback to compatible version

## Testing Strategy

### Unit Tests
- **Utility functions**: Math operations, random generation, transformations
- **Services**: Configuration management, storage operations
- **Hooks**: Parameter management, animation control
- **Components**: Individual component behavior and props handling

### Integration Tests
- **Canvas rendering**: Verify correct shape generation and animation
- **Configuration flow**: Save/load/delete operations end-to-end
- **Parameter updates**: Ensure UI changes reflect in canvas output
- **Fullscreen functionality**: Mode transitions and canvas resizing

### Performance Tests
- **Animation performance**: Frame rate consistency under various parameter combinations
- **Memory usage**: Check for memory leaks in long-running animations
- **Canvas operations**: Rendering performance with multiple layers
- **Storage operations**: Configuration save/load performance

### Browser Compatibility Tests
- **Canvas support**: Verify functionality across target browsers
- **Fullscreen API**: Cross-browser fullscreen behavior
- **localStorage**: Storage functionality and quota handling
- **Animation frames**: requestAnimationFrame compatibility

## Performance Considerations

### Canvas Optimization
- **Efficient rendering**: Minimize canvas operations per frame
- **Layer management**: Optimize multi-layer rendering
- **Memory management**: Proper cleanup of canvas resources
- **Pixel ratio handling**: Optimize for high-DPI displays

### React Optimization
- **Component memoization**: Prevent unnecessary re-renders
- **State management**: Minimize state updates and dependencies
- **Event handling**: Debounce parameter updates where appropriate
- **Bundle optimization**: Code splitting for better load times

### Animation Performance
- **Frame rate targeting**: Maintain consistent 60fps animation
- **Calculation optimization**: Cache expensive computations
- **Parameter interpolation**: Smooth parameter transitions
- **Background processing**: Offload heavy calculations where possible

## Migration Strategy

### Phase 1: Project Setup
1. Create new Vite project structure
2. Set up build configuration and dependencies
3. Establish development environment
4. Create basic project skeleton

### Phase 2: Core Utilities
1. Extract and modularize utility functions
2. Implement services layer
3. Create custom hooks
4. Set up constants and configuration

### Phase 3: Component Extraction
1. Break down monolithic component into focused components
2. Implement component interfaces
3. Add CSS modules for styling
4. Ensure component isolation

### Phase 4: Integration and Testing
1. Wire components together
2. Implement comprehensive testing
3. Performance optimization
4. Cross-browser validation

### Phase 5: Deployment Preparation
1. Build optimization
2. Documentation completion
3. Migration verification
4. Production deployment setup