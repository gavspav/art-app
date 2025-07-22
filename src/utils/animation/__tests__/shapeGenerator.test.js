import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateLayerParams,
  generateOilShapePoints,
  createSmoothPath
} from '../shapeGenerator.js';

describe('shapeGenerator', () => {
  describe('generateLayerParams', () => {
    it('should generate correct number of layer parameters', () => {
      const params = generateLayerParams(3, 0.5, 12345);
      expect(params).toHaveLength(3);
    });

    it('should generate deterministic parameters with same seed', () => {
      const params1 = generateLayerParams(2, 0.5, 12345);
      const params2 = generateLayerParams(2, 0.5, 12345);
      
      expect(params1).toEqual(params2);
    });

    it('should generate different parameters with different seeds', () => {
      const params1 = generateLayerParams(1, 0.5, 12345);
      const params2 = generateLayerParams(1, 0.5, 54321);
      
      expect(params1[0]).not.toEqual(params2[0]);
    });

    it('should include all required parameter properties', () => {
      const params = generateLayerParams(1, 0.5, 12345);
      const param = params[0];
      
      expect(param).toHaveProperty('freq1');
      expect(param).toHaveProperty('freq2');
      expect(param).toHaveProperty('freq3');
      expect(param).toHaveProperty('baseRadiusFactor');
      expect(param).toHaveProperty('centerBaseX');
      expect(param).toHaveProperty('centerBaseY');
      expect(param).toHaveProperty('centerOffsetX');
      expect(param).toHaveProperty('centerOffsetY');
      expect(param).toHaveProperty('moveSpeedX');
      expect(param).toHaveProperty('moveSpeedY');
      expect(param).toHaveProperty('radiusBump');
    });

    it('should respect variation parameter', () => {
      const lowVariation = generateLayerParams(1, 0.1, 12345)[0];
      const highVariation = generateLayerParams(1, 2.0, 12345)[0];
      
      // Higher variation should produce more extreme values
      expect(Math.abs(lowVariation.freq1 - 2)).toBeLessThan(Math.abs(highVariation.freq1 - 2));
    });

    it('should clamp center values within valid range', () => {
      const params = generateLayerParams(10, 2.0, 12345);
      
      params.forEach(param => {
        expect(param.centerBaseX).toBeGreaterThanOrEqual(0.3);
        expect(param.centerBaseX).toBeLessThanOrEqual(0.7);
        expect(param.centerBaseY).toBeGreaterThanOrEqual(0.3);
        expect(param.centerBaseY).toBeLessThanOrEqual(0.7);
        expect(param.centerOffsetX).toBeGreaterThanOrEqual(-0.1);
        expect(param.centerOffsetX).toBeLessThanOrEqual(0.1);
        expect(param.centerOffsetY).toBeGreaterThanOrEqual(-0.1);
        expect(param.centerOffsetY).toBeLessThanOrEqual(0.1);
      });
    });
  });

  describe('generateOilShapePoints', () => {
    const mockLayerParam = {
      freq1: 2,
      freq2: 3,
      freq3: 4,
      baseRadiusFactor: 0.4,
      centerBaseX: 0.5,
      centerBaseY: 0.5,
      centerOffsetX: 0,
      centerOffsetY: 0,
      moveSpeedX: 0.5,
      moveSpeedY: 0.5,
      radiusBump: 0.1
    };

    const mockShapeParams = {
      numSides: 6,
      curviness: 0.5,
      noiseAmount: 0.5,
      guideWidth: 250,
      guideHeight: 250,
      variation: 0.2
    };

    const mockCanvasSize = {
      width: 800,
      height: 600
    };

    it('should generate correct number of points', () => {
      const points = generateOilShapePoints({
        time: 0,
        layerParam: mockLayerParam,
        shapeParams: mockShapeParams,
        canvasSize: mockCanvasSize
      });

      expect(points).toHaveLength(6);
    });

    it('should return empty array for null layerParam', () => {
      const points = generateOilShapePoints({
        time: 0,
        layerParam: null,
        shapeParams: mockShapeParams,
        canvasSize: mockCanvasSize
      });

      expect(points).toEqual([]);
    });

    it('should generate points with x and y properties', () => {
      const points = generateOilShapePoints({
        time: 0,
        layerParam: mockLayerParam,
        shapeParams: mockShapeParams,
        canvasSize: mockCanvasSize
      });

      points.forEach(point => {
        expect(point).toHaveProperty('x');
        expect(point).toHaveProperty('y');
        expect(typeof point.x).toBe('number');
        expect(typeof point.y).toBe('number');
      });
    });

    it('should generate different points for different times', () => {
      const points1 = generateOilShapePoints({
        time: 0,
        layerParam: mockLayerParam,
        shapeParams: mockShapeParams,
        canvasSize: mockCanvasSize
      });

      const points2 = generateOilShapePoints({
        time: 1,
        layerParam: mockLayerParam,
        shapeParams: mockShapeParams,
        canvasSize: mockCanvasSize
      });

      expect(points1).not.toEqual(points2);
    });

    it('should respect numSides parameter', () => {
      const trianglePoints = generateOilShapePoints({
        time: 0,
        layerParam: mockLayerParam,
        shapeParams: { ...mockShapeParams, numSides: 3 },
        canvasSize: mockCanvasSize
      });

      const octagonPoints = generateOilShapePoints({
        time: 0,
        layerParam: mockLayerParam,
        shapeParams: { ...mockShapeParams, numSides: 8 },
        canvasSize: mockCanvasSize
      });

      expect(trianglePoints).toHaveLength(3);
      expect(octagonPoints).toHaveLength(8);
    });
  });

  describe('createSmoothPath', () => {
    let mockCtx;

    beforeEach(() => {
      mockCtx = {
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        quadraticCurveTo: vi.fn(),
        closePath: vi.fn()
      };
    });

    it('should not create path for insufficient points', () => {
      createSmoothPath(mockCtx, []);
      expect(mockCtx.beginPath).not.toHaveBeenCalled();

      createSmoothPath(mockCtx, [{ x: 0, y: 0 }]);
      expect(mockCtx.beginPath).not.toHaveBeenCalled();

      createSmoothPath(mockCtx, [{ x: 0, y: 0 }, { x: 1, y: 1 }]);
      expect(mockCtx.beginPath).not.toHaveBeenCalled();
    });

    it('should create smooth path for valid points', () => {
      const points = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 }
      ];

      createSmoothPath(mockCtx, points);

      expect(mockCtx.beginPath).toHaveBeenCalledOnce();
      expect(mockCtx.moveTo).toHaveBeenCalledOnce();
      expect(mockCtx.quadraticCurveTo).toHaveBeenCalledTimes(4);
      expect(mockCtx.closePath).toHaveBeenCalledOnce();
    });

    it('should start from midpoint between last and first point', () => {
      const points = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 50, y: 100 }
      ];

      createSmoothPath(mockCtx, points);

      // Should start from midpoint between last (50, 100) and first (0, 0)
      expect(mockCtx.moveTo).toHaveBeenCalledWith(25, 50);
    });
  });
});