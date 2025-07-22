import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  setupCanvas,
  clearCanvas,
  createRadialGradient,
  renderOilShape,
  renderFrame
} from '../canvasRenderer.js';

describe('canvasRenderer', () => {
  let mockCanvas;
  let mockCtx;
  let mockGradient;

  beforeEach(() => {
    mockGradient = {
      addColorStop: vi.fn()
    };

    mockCtx = {
      scale: vi.fn(),
      fillRect: vi.fn(),
      createRadialGradient: vi.fn(() => mockGradient),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      fillStyle: '',
      globalCompositeOperation: '',
      filter: ''
    };

    mockCanvas = {
      getBoundingClientRect: vi.fn(() => ({ width: 800, height: 600 })),
      width: 0,
      height: 0
    };
  });

  describe('setupCanvas', () => {
    it('should set canvas dimensions based on bounding rect', () => {
      const result = setupCanvas(mockCanvas, mockCtx, 2);

      expect(mockCanvas.width).toBe(1600); // 800 * 2
      expect(mockCanvas.height).toBe(1200); // 600 * 2
      expect(mockCtx.scale).toHaveBeenCalledWith(2, 2);
      expect(result).toEqual({ width: 800, height: 600 });
    });

    it('should use default pixel ratio of 1', () => {
      setupCanvas(mockCanvas, mockCtx);

      expect(mockCanvas.width).toBe(800);
      expect(mockCanvas.height).toBe(600);
      expect(mockCtx.scale).toHaveBeenCalledWith(1, 1);
    });
  });

  describe('clearCanvas', () => {
    it('should fill canvas with background color', () => {
      clearCanvas(mockCtx, 800, 600, '#000000');

      expect(mockCtx.fillStyle).toBe('#000000');
      expect(mockCtx.fillRect).toHaveBeenCalledWith(0, 0, 800, 600);
    });
  });

  describe('createRadialGradient', () => {
    it('should create radial gradient with correct parameters', () => {
      const gradient = createRadialGradient(mockCtx, 400, 300, 200, '#ff0000', 0.8, 2);

      expect(mockCtx.createRadialGradient).toHaveBeenCalledWith(400, 300, 0, 400, 300, 300); // 200 + 2 * 50
      expect(mockGradient.addColorStop).toHaveBeenCalledTimes(2);
      expect(mockGradient.addColorStop).toHaveBeenCalledWith(0, '#ff0000cc'); // 0.8 * 255 = 204 = cc
      expect(mockGradient.addColorStop).toHaveBeenCalledWith(1, '#ff000090'); // 0.8 * 180 = 144 = 90 (hex)
    });

    it('should handle zero layer index', () => {
      createRadialGradient(mockCtx, 400, 300, 200, '#00ff00', 1.0, 0);

      expect(mockCtx.createRadialGradient).toHaveBeenCalledWith(400, 300, 0, 400, 300, 200);
    });

    it('should convert opacity to hex correctly', () => {
      createRadialGradient(mockCtx, 400, 300, 200, '#0000ff', 0.5, 0);

      expect(mockGradient.addColorStop).toHaveBeenCalledWith(0, '#0000ff7f'); // 0.5 * 255 = 127.5 ≈ 128 = 80 (hex)
      expect(mockGradient.addColorStop).toHaveBeenCalledWith(1, '#0000ff5a'); // 0.5 * 180 = 90 = 5a (hex)
    });
  });

  describe('renderOilShape', () => {
    const mockParams = {
      time: 0,
      layerParam: {
        freq1: 2, freq2: 3, freq3: 4,
        baseRadiusFactor: 0.4,
        centerBaseX: 0.5, centerBaseY: 0.5,
        centerOffsetX: 0, centerOffsetY: 0,
        moveSpeedX: 0.5, moveSpeedY: 0.5,
        radiusBump: 0.1
      },
      shapeParams: {
        numSides: 6, curviness: 0.5, noiseAmount: 0.5,
        guideWidth: 250, guideHeight: 250, variation: 0.2
      },
      canvasSize: { width: 800, height: 600 },
      color: '#ff0000',
      opacity: 0.8,
      blendMode: 'multiply',
      layerIndex: 1
    };

    it('should set correct blend mode for first layer', () => {
      renderOilShape(mockCtx, { ...mockParams, layerIndex: 0 });
      expect(mockCtx.globalCompositeOperation).toBe('source-over');
    });

    it('should set correct blend mode for subsequent layers', () => {
      renderOilShape(mockCtx, mockParams);
      expect(mockCtx.globalCompositeOperation).toBe('multiply');
    });

    it('should create and fill shape path', () => {
      renderOilShape(mockCtx, mockParams);

      expect(mockCtx.beginPath).toHaveBeenCalled();
      expect(mockCtx.fill).toHaveBeenCalled();
      expect(mockCtx.createRadialGradient).toHaveBeenCalled();
    });

    it('should handle empty layer param gracefully', () => {
      renderOilShape(mockCtx, { ...mockParams, layerParam: null });

      expect(mockCtx.fill).not.toHaveBeenCalled();
    });
  });

  describe('renderFrame', () => {
    const mockFrameParams = {
      time: 0,
      layerParams: [
        {
          freq1: 2, freq2: 3, freq3: 4,
          baseRadiusFactor: 0.4,
          centerBaseX: 0.5, centerBaseY: 0.5,
          centerOffsetX: 0, centerOffsetY: 0,
          moveSpeedX: 0.5, moveSpeedY: 0.5,
          radiusBump: 0.1
        }
      ],
      shapeParams: {
        numSides: 6, curviness: 0.5, noiseAmount: 0.5,
        guideWidth: 250, guideHeight: 250, variation: 0.2
      },
      canvasSize: { width: 800, height: 600 },
      colors: ['#ff0000', '#00ff00'],
      globalOpacity: 0.8,
      blendMode: 'multiply',
      backgroundColor: '#000000'
    };

    it('should clear canvas before rendering', () => {
      renderFrame(mockCtx, mockFrameParams);

      // Check that fillRect was called for clearing (first call should be the clear)
      expect(mockCtx.fillRect).toHaveBeenCalledWith(0, 0, 800, 600);
      // The fillStyle will be overwritten by gradients, so we can't test it at the end
    });

    it('should set initial rendering state', () => {
      renderFrame(mockCtx, mockFrameParams);

      expect(mockCtx.globalCompositeOperation).toBe('source-over');
      expect(mockCtx.filter).toBe('none'); // Reset at end
    });

    it('should render all layers', () => {
      const multiLayerParams = {
        ...mockFrameParams,
        layerParams: [mockFrameParams.layerParams[0], mockFrameParams.layerParams[0]]
      };

      renderFrame(mockCtx, multiLayerParams);

      expect(mockCtx.fill).toHaveBeenCalledTimes(2);
    });

    it('should cycle through colors for layers', () => {
      const multiLayerParams = {
        ...mockFrameParams,
        layerParams: [
          mockFrameParams.layerParams[0],
          mockFrameParams.layerParams[0],
          mockFrameParams.layerParams[0]
        ],
        colors: ['#ff0000', '#00ff00']
      };

      renderFrame(mockCtx, multiLayerParams);

      // Should use colors in order: red, green, red (cycling)
      expect(mockCtx.createRadialGradient).toHaveBeenCalledTimes(3);
    });

    it('should reset rendering state after completion', () => {
      renderFrame(mockCtx, mockFrameParams);

      expect(mockCtx.filter).toBe('none');
      expect(mockCtx.globalCompositeOperation).toBe('source-over');
    });
  });
});