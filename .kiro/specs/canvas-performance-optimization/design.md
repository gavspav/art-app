# Design Document

## Overview

This design addresses two critical performance issues in the generative art application:
1. **Canvas Re-render Performance**: Excessive re-renders caused by broad useEffect dependencies
2. **Animation Mutation Issues**: Direct state mutations in animation logic causing unpredictable behavior

The solution implements intelligent dirty checking, memoization strategies, and immutable animation updates while maintaining the existing API surface.

## Architecture

### Canvas Rendering Optimization

The current canvas rendering system re-renders on every state change. We'll implement:

1. **Dirty Checking System**: Track which layers have actually changed visually
2. **Selective Re-rendering**: Only redraw layers that have changed
3. **Memoized Calculations**: Cache expensive gradient and path calculations
4. **Render Batching**: Group multiple updates into single render cycles

### Animation System Refactor

The current animation system directly mutates layer objects. We'll implement:

1. **Immutable Updates**: All animation calculations return new objects
2. **Pure Functions**: Animation logic becomes side-effect free
3. **State Isolation**: Each layer's animation state is independently managed
4. **Predictable Transitions**: Smooth state transitions without corruption

## Components and Interfaces

### Enhanced Canvas Component

```typescript
interface CanvasProps {
  layers: Layer[];
  backgroundColor: string;
  globalSeed: number;
  // New optimization props
  renderQuality?: 'high' | 'medium' | 'low';
  enableOptimizations?: boolean;
}

interface LayerRenderState {
  lastRenderedHash: string;
  cachedGradient?: CanvasGradient;
  cachedPath?: Path2D;
  needsRedraw: boolean;
}
```

### Optimized Animation Hook

```typescript
interface AnimationState {
  position: Position;
  velocity: Velocity;
  scale: ScaleState;
  lastUpdate: number;
}

interface AnimationUpdate {
  layerId: string;
  newState: AnimationState;
  hasChanged: boolean;
}
```

### Dirty Checking System

```typescript
interface LayerChangeDetector {
  getVisualHash(layer: Layer): string;
  hasVisuallyChanged(layer: Layer, previousHash: string): boolean;
  getChangedProperties(layer: Layer, previousLayer: Layer): string[];
}
```

## Data Models

### Layer Visual Hash
A lightweight hash representing only visual properties:
- Position (x, y, scale)
- Appearance (colors, opacity, blendMode)
- Shape properties (numSides, curviness, width, height)
- Excludes: animation metadata, internal state

### Render Cache Entry
```typescript
interface RenderCacheEntry {
  layerId: string;
  visualHash: string;
  cachedElements: {
    gradient?: CanvasGradient;
    path?: Path2D;
    bounds?: DOMRect;
  };
  timestamp: number;
}
```

### Animation State Snapshot
```typescript
interface AnimationSnapshot {
  layerId: string;
  position: Readonly<Position>;
  velocity: Readonly<Velocity>;
  scale: Readonly<ScaleState>;
  metadata: Readonly<AnimationMetadata>;
}
```

## Error Handling

### Canvas Rendering Errors
- **Invalid Layer Data**: Skip malformed layers with console warnings
- **Canvas Context Loss**: Implement context restoration
- **Memory Pressure**: Automatic cache cleanup when memory is low
- **Render Failures**: Fallback to basic rendering without optimizations

### Animation Errors
- **Invalid State Transitions**: Validate state before applying updates
- **Boundary Calculation Errors**: Clamp values to valid ranges
- **Performance Degradation**: Automatic quality reduction under load
- **State Corruption**: Reset to last known good state

## Testing Strategy

### Performance Testing
1. **Render Performance**: Measure FPS with varying layer counts
2. **Memory Usage**: Monitor memory consumption over time
3. **Cache Efficiency**: Track cache hit/miss ratios
4. **Animation Smoothness**: Measure frame timing consistency

### Functional Testing
1. **Visual Regression**: Ensure optimizations don't change appearance
2. **Animation Behavior**: Verify all movement patterns work correctly
3. **Parameter Updates**: Test real-time parameter changes
4. **Edge Cases**: Test with extreme values and configurations

### Integration Testing
1. **Context Integration**: Verify state management still works
2. **Component Communication**: Test prop passing and callbacks
3. **Performance Under Load**: Test with maximum layer counts
4. **Memory Leak Detection**: Long-running animation tests

## Implementation Strategy

### Phase 1: Canvas Optimization
1. Implement visual hash calculation
2. Add dirty checking to Canvas component
3. Implement selective layer re-rendering
4. Add basic memoization for gradients

### Phase 2: Animation Refactor
1. Refactor animation logic to pure functions
2. Implement immutable state updates
3. Add boundary collision handling without mutations
4. Update useAnimation hook with new logic

### Phase 3: Advanced Optimizations
1. Add render caching system
2. Implement performance monitoring
3. Add automatic quality adjustment
4. Optimize for mobile devices

### Phase 4: Testing and Validation
1. Performance benchmarking
2. Visual regression testing
3. Memory leak testing
4. User acceptance testing

## Performance Targets

### Rendering Performance
- **60 FPS** with up to 10 layers
- **30 FPS** with up to 25 layers
- **Smooth interaction** during parameter changes
- **<100ms** response time for control updates

### Memory Usage
- **<50MB** baseline memory usage
- **<5MB** per additional layer
- **Automatic cleanup** when cache exceeds 100MB
- **No memory leaks** during extended use

### Animation Quality
- **Consistent frame timing** (±2ms variance)
- **Smooth transitions** during parameter changes
- **Predictable behavior** across all movement styles
- **No visual artifacts** during state updates