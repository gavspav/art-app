import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock canvas context for tests
HTMLCanvasElement.prototype.getContext = () => ({
  fillRect: () => {},
  clearRect: () => {},
  getImageData: () => ({ data: new Array(4) }),
  putImageData: () => {},
  createImageData: () => ({ data: new Array(4) }),
  setTransform: () => {},
  drawImage: () => {},
  save: () => {},
  fillText: () => {},
  restore: () => {},
  beginPath: () => {},
  moveTo: () => {},
  lineTo: () => {},
  closePath: () => {},
  stroke: () => {},
  translate: () => {},
  scale: () => {},
  rotate: () => {},
  arc: () => {},
  fill: () => {},
  measureText: () => ({ width: 0 }),
  transform: () => {},
  rect: () => {},
  clip: () => {}
})

// Mock requestAnimationFrame
global.requestAnimationFrame = (cb) => setTimeout(cb, 16)
global.cancelAnimationFrame = (id) => clearTimeout(id)

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock fullscreen API
Object.defineProperty(document, 'fullscreenElement', {
  writable: true,
  value: null
});

Object.defineProperty(document, 'webkitFullscreenElement', {
  writable: true,
  value: null
});

Object.defineProperty(document, 'mozFullScreenElement', {
  writable: true,
  value: null
});

Object.defineProperty(document, 'msFullscreenElement', {
  writable: true,
  value: null
});

// Mock fullscreen methods on document element
Object.defineProperty(document.documentElement, 'requestFullscreen', {
  writable: true,
  value: vi.fn().mockResolvedValue()
});

Object.defineProperty(document.documentElement, 'webkitRequestFullscreen', {
  writable: true,
  value: vi.fn().mockResolvedValue()
});

Object.defineProperty(document.documentElement, 'mozRequestFullScreen', {
  writable: true,
  value: vi.fn().mockResolvedValue()
});

Object.defineProperty(document.documentElement, 'msRequestFullscreen', {
  writable: true,
  value: vi.fn().mockResolvedValue()
});

// Mock fullscreen exit methods on document
Object.defineProperty(document, 'exitFullscreen', {
  writable: true,
  value: vi.fn().mockResolvedValue()
});

Object.defineProperty(document, 'webkitExitFullscreen', {
  writable: true,
  value: vi.fn().mockResolvedValue()
});

Object.defineProperty(document, 'mozCancelFullScreen', {
  writable: true,
  value: vi.fn().mockResolvedValue()
});

Object.defineProperty(document, 'msExitFullscreen', {
  writable: true,
  value: vi.fn().mockResolvedValue()
});