/**
 * Performance monitoring and optimization utilities
 * Provides tools for measuring and optimizing application performance
 */

/**
 * Performance monitor class for tracking metrics
 */
export class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
    this.observers = new Map();
    this.isEnabled = process.env.NODE_ENV === 'development';
  }

  /**
   * Start timing a performance metric
   * @param {string} name - Metric name
   */
  startTiming(name) {
    if (!this.isEnabled) return;
    
    this.metrics.set(name, {
      startTime: performance.now(),
      endTime: null,
      duration: null
    });
  }

  /**
   * End timing a performance metric
   * @param {string} name - Metric name
   * @returns {number} Duration in milliseconds
   */
  endTiming(name) {
    if (!this.isEnabled) return 0;
    
    const metric = this.metrics.get(name);
    if (!metric) {
      console.warn(`Performance metric '${name}' was not started`);
      return 0;
    }

    metric.endTime = performance.now();
    metric.duration = metric.endTime - metric.startTime;
    
    return metric.duration;
  }

  /**
   * Get performance metric
   * @param {string} name - Metric name
   * @returns {Object|null} Metric data
   */
  getMetric(name) {
    return this.metrics.get(name) || null;
  }

  /**
   * Get all performance metrics
   * @returns {Object} All metrics
   */
  getAllMetrics() {
    const result = {};
    this.metrics.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  /**
   * Clear all metrics
   */
  clearMetrics() {
    this.metrics.clear();
  }

  /**
   * Log performance summary
   */
  logSummary() {
    if (!this.isEnabled) return;
    
    console.group('Performance Summary');
    this.metrics.forEach((metric, name) => {
      if (metric.duration !== null) {
        console.log(`${name}: ${metric.duration.toFixed(2)}ms`);
      }
    });
    console.groupEnd();
  }
}

/**
 * Frame rate monitor for animation performance
 */
export class FrameRateMonitor {
  constructor() {
    this.frames = [];
    this.maxSamples = 60; // Track last 60 frames
    this.lastFrameTime = 0;
  }

  /**
   * Record a frame
   */
  recordFrame() {
    const now = performance.now();
    
    if (this.lastFrameTime > 0) {
      const frameTime = now - this.lastFrameTime;
      this.frames.push(frameTime);
      
      // Keep only the last N samples
      if (this.frames.length > this.maxSamples) {
        this.frames.shift();
      }
    }
    
    this.lastFrameTime = now;
  }

  /**
   * Get current FPS
   * @returns {number} Current FPS
   */
  getCurrentFPS() {
    if (this.frames.length === 0) return 0;
    
    const avgFrameTime = this.frames.reduce((sum, time) => sum + time, 0) / this.frames.length;
    return Math.round(1000 / avgFrameTime);
  }

  /**
   * Get frame time statistics
   * @returns {Object} Frame time stats
   */
  getFrameStats() {
    if (this.frames.length === 0) {
      return { min: 0, max: 0, avg: 0, fps: 0 };
    }

    const min = Math.min(...this.frames);
    const max = Math.max(...this.frames);
    const avg = this.frames.reduce((sum, time) => sum + time, 0) / this.frames.length;
    const fps = Math.round(1000 / avg);

    return { min, max, avg, fps };
  }

  /**
   * Reset frame tracking
   */
  reset() {
    this.frames = [];
    this.lastFrameTime = 0;
  }
}

/**
 * Memory usage monitor
 */
export class MemoryMonitor {
  constructor() {
    this.samples = [];
    this.maxSamples = 100;
  }

  /**
   * Record current memory usage
   */
  recordUsage() {
    if (!performance.memory) return;

    const usage = {
      timestamp: Date.now(),
      used: performance.memory.usedJSHeapSize,
      total: performance.memory.totalJSHeapSize,
      limit: performance.memory.jsHeapSizeLimit
    };

    this.samples.push(usage);

    // Keep only the last N samples
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }
  }

  /**
   * Get current memory usage
   * @returns {Object|null} Memory usage data
   */
  getCurrentUsage() {
    if (!performance.memory) return null;

    return {
      used: performance.memory.usedJSHeapSize,
      total: performance.memory.totalJSHeapSize,
      limit: performance.memory.jsHeapSizeLimit,
      usedMB: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
      totalMB: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024)
    };
  }

  /**
   * Get memory usage trend
   * @returns {Object} Memory trend data
   */
  getTrend() {
    if (this.samples.length < 2) return null;

    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    const change = last.used - first.used;
    const changePercent = (change / first.used) * 100;

    return {
      change,
      changePercent,
      isIncreasing: change > 0,
      samples: this.samples.length
    };
  }
}

/**
 * Performance optimization utilities
 */
export const performanceUtils = {
  /**
   * Debounce function calls for performance
   * @param {Function} func - Function to debounce
   * @param {number} wait - Wait time in milliseconds
   * @returns {Function} Debounced function
   */
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  /**
   * Throttle function calls for performance
   * @param {Function} func - Function to throttle
   * @param {number} limit - Time limit in milliseconds
   * @returns {Function} Throttled function
   */
  throttle(func, limit) {
    let inThrottle;
    return function executedFunction(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  },

  /**
   * Request idle callback with fallback
   * @param {Function} callback - Callback function
   * @param {Object} options - Options object
   */
  requestIdleCallback(callback, options = {}) {
    if (window.requestIdleCallback) {
      return window.requestIdleCallback(callback, options);
    } else {
      // Fallback for browsers without requestIdleCallback
      return setTimeout(() => {
        const start = Date.now();
        callback({
          didTimeout: false,
          timeRemaining() {
            return Math.max(0, 50 - (Date.now() - start));
          }
        });
      }, 1);
    }
  },

  /**
   * Cancel idle callback with fallback
   * @param {number} id - Callback ID
   */
  cancelIdleCallback(id) {
    if (window.cancelIdleCallback) {
      window.cancelIdleCallback(id);
    } else {
      clearTimeout(id);
    }
  },

  /**
   * Measure function execution time
   * @param {Function} func - Function to measure
   * @param {string} name - Measurement name
   * @returns {*} Function result
   */
  measureExecution(func, name = 'execution') {
    const start = performance.now();
    const result = func();
    const end = performance.now();
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`${name}: ${(end - start).toFixed(2)}ms`);
    }
    
    return result;
  },

  /**
   * Check if device has good performance characteristics
   * @returns {Object} Device performance info
   */
  getDevicePerformance() {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    
    const info = {
      hardwareConcurrency: navigator.hardwareConcurrency || 1,
      deviceMemory: navigator.deviceMemory || 'unknown',
      webglSupported: !!gl,
      webglRenderer: gl ? gl.getParameter(gl.RENDERER) : 'unknown',
      pixelRatio: window.devicePixelRatio || 1,
      isHighPerformance: false
    };

    // Determine if device is high performance
    info.isHighPerformance = (
      info.hardwareConcurrency >= 4 &&
      (info.deviceMemory >= 4 || info.deviceMemory === 'unknown') &&
      info.webglSupported
    );

    return info;
  }
};

// Global performance monitor instance
export const globalPerformanceMonitor = new PerformanceMonitor();
export const globalFrameRateMonitor = new FrameRateMonitor();
export const globalMemoryMonitor = new MemoryMonitor();

// Auto-start memory monitoring in development
if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
  setInterval(() => {
    globalMemoryMonitor.recordUsage();
  }, 5000); // Record every 5 seconds
}