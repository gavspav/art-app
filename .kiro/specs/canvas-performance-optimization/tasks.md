# Implementation Plan

- [x] 1. Implement visual hash calculation system
  - Create utility function to generate hash from layer visual properties only
  - Exclude animation metadata and internal state from hash calculation
  - Add hash comparison logic to detect actual visual changes
  - _Requirements: 1.1, 1.2, 3.2_

- [x] 2. Add dirty checking to Canvas component
  - Implement layer change detection using visual hashes
  - Track previous render state for each layer
  - Only trigger re-renders when visual properties actually change
  - _Requirements: 1.1, 1.2, 4.2_

- [x] 3. Implement selective layer re-rendering
  - Modify Canvas useEffect to use dirty checking results
  - Only redraw layers that have visually changed
  - Preserve unchanged layers on canvas during partial updates
  - _Requirements: 1.5, 3.2, 4.1_

- [x] 4. Add memoization for expensive canvas operations
  - Memoize gradient creation using useMemo
  - Cache path calculations for complex shapes
  - Implement intelligent cache invalidation
  - _Requirements: 1.4, 4.1_

- [x] 5. Refactor animation logic to use immutable updates
  - Convert useAnimation hook to return new objects instead of mutations
  - Implement pure functions for position and velocity calculations
  - Remove all direct property assignments in animation logic
  - _Requirements: 2.1, 2.3, 3.4_

- [x] 6. Fix boundary collision handling without mutations
  - Rewrite bounce logic to calculate new angles without mutating layer.movementAngle
  - Implement immutable angle calculation functions
  - Ensure drift mode wrapping uses immutable updates
  - _Requirements: 2.2, 2.4, 3.4_

- [x] 7. Add animation state isolation
  - Ensure each layer's animation state is independently calculated
  - Prevent cross-layer state contamination
  - Implement proper state copying for animation updates
  - _Requirements: 2.4, 2.5_

- [x] 8. Optimize Canvas component useEffect dependencies
  - Replace broad dependency array with specific change detection
  - Implement custom comparison function for layer changes
  - Reduce unnecessary effect triggers
  - _Requirements: 1.1, 1.2, 4.4_

- [x] 9. Add performance monitoring and debugging tools
  - Implement render timing measurements
  - Add layer change tracking for debugging
  - Create performance metrics logging
  - _Requirements: 1.3, 4.1_

- [ ] 10. Create comprehensive test suite for optimizations
  - Write unit tests for visual hash calculation
  - Add integration tests for canvas rendering performance
  - Create animation behavior regression tests
  - Test memory usage and cleanup
  - _Requirements: 3.1, 3.3, 3.5_