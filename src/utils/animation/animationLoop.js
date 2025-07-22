/**
 * Animation loop management utilities
 * Handles animation frame timing and loop control
 */

/**
 * Animation loop manager class (optimized)
 */
export class AnimationLoop {
  constructor() {
    this.animationId = null;
    this.isRunning = false;
    this.callbacks = new Set();
    this.time = 0;
    this.lastFrameTime = 0;
    this.targetFPS = 60;
    this.frameInterval = 1000 / this.targetFPS;
    this.lastRenderTime = 0;
  }

  /**
   * Add a callback to be executed on each frame
   * @param {Function} callback - Function to call on each frame
   */
  addCallback(callback) {
    this.callbacks.add(callback);
  }

  /**
   * Remove a callback from the animation loop
   * @param {Function} callback - Function to remove
   */
  removeCallback(callback) {
    this.callbacks.delete(callback);
  }

  /**
   * Start the animation loop
   */
  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.lastFrameTime = performance.now();
    this.animate();
  }

  /**
   * Stop the animation loop
   */
  stop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.isRunning = false;
  }

  /**
   * Reset animation time
   */
  reset() {
    this.time = 0;
    this.lastFrameTime = performance.now();
  }

  /**
   * Set animation time directly
   * @param {number} time - Time value to set
   */
  setTime(time) {
    this.time = time;
  }

  /**
   * Get current animation time
   * @returns {number} Current time
   */
  getTime() {
    return this.time;
  }

  /**
   * Internal animation frame handler (optimized with frame rate throttling)
   */
  animate = () => {
    if (!this.isRunning) return;

    const currentTime = performance.now();
    const deltaTime = currentTime - this.lastFrameTime;

    // Frame rate throttling: only render if enough time has passed
    if (currentTime - this.lastRenderTime >= this.frameInterval) {
      this.lastFrameTime = currentTime;
      this.lastRenderTime = currentTime;

      // Execute all callbacks with current time and delta
      this.callbacks.forEach(callback => {
        try {
          callback(this.time, deltaTime);
        } catch (error) {
          console.error('Animation callback error:', error);
        }
      });
    }

    this.animationId = requestAnimationFrame(this.animate);
  };

  /**
   * Set target FPS for frame rate throttling
   * @param {number} fps - Target frames per second
   */
  setTargetFPS(fps) {
    this.targetFPS = Math.max(1, Math.min(120, fps)); // Clamp between 1-120 FPS
    this.frameInterval = 1000 / this.targetFPS;
  }

  /**
   * Update time (typically called by animation callbacks)
   * @param {number} speed - Speed multiplier
   * @param {boolean} isFrozen - Whether animation is frozen
   */
  updateTime(speed, isFrozen = false) {
    if (!isFrozen) {
      this.time += speed;
    }
  }
}

/**
 * Create a simple animation loop function (legacy compatibility)
 * @param {Function} callback - Animation callback function
 * @param {Object} options - Animation options
 * @returns {Object} Animation control object
 */
export const createAnimationLoop = (callback, options = {}) => {
  const { autoStart = true } = options;
  
  let animationId = null;
  let isRunning = false;
  let time = 0;

  const animate = () => {
    if (!isRunning) return;

    try {
      callback(time);
    } catch (error) {
      console.error('Animation callback error:', error);
    }

    animationId = requestAnimationFrame(animate);
  };

  const start = () => {
    if (isRunning) return;
    isRunning = true;
    animate();
  };

  const stop = () => {
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
    isRunning = false;
  };

  const reset = () => {
    time = 0;
  };

  const updateTime = (speed, isFrozen = false) => {
    if (!isFrozen) {
      time += speed;
    }
  };

  if (autoStart) {
    start();
  }

  return {
    start,
    stop,
    reset,
    updateTime,
    getTime: () => time,
    setTime: (newTime) => { time = newTime; },
    isRunning: () => isRunning
  };
};

/**
 * Create animation frame manager for React components
 * @param {Function} animateCallback - Function to call on each frame
 * @param {Array} dependencies - Dependencies that trigger animation restart
 * @returns {Object} Animation control functions
 */
export const useAnimationFrame = (animateCallback, dependencies = []) => {
  let animationId = null;
  let time = 0;

  const animate = () => {
    try {
      animateCallback(time);
    } catch (error) {
      console.error('Animation frame error:', error);
    }
    animationId = requestAnimationFrame(animate);
  };

  const start = () => {
    if (animationId) return;
    animate();
  };

  const stop = () => {
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
  };

  const updateTime = (speed, isFrozen = false) => {
    if (!isFrozen) {
      time += speed;
    }
  };

  return {
    start,
    stop,
    updateTime,
    getTime: () => time,
    setTime: (newTime) => { time = newTime; }
  };
};