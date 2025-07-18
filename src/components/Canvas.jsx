import React, { useRef, useEffect, forwardRef } from 'react';
import { getPixelRatio } from '../utils/pixelRatio';
import { createSeededRandom } from '../utils/random';

const Canvas = forwardRef(({ 
  layers, 
  variation, 
  backgroundColor, 
  globalSeed 
}, ref) => {

  // Main drawing effect
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // --- Sizing --- 
    const ratio = getPixelRatio(ctx);
    const resizeCanvas = () => {
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      ctx.scale(ratio, ratio);
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // --- Drawing Logic ---
    const drawShape = (ctx, layer, time) => {
      const { 
        shapeType, numSides, curviness, noiseAmount, 
        x, y, scale, // Use dynamic position and scale
        shapeWidth, shapeHeight, 
        useGlobalSeed, seed 
      } = layer;

      const currentSeed = useGlobalSeed ? globalSeed : seed;
      const random = createSeededRandom(currentSeed);

      // Calculate noise offsets based on the layer's seed
      const noiseOffsets = [];
      for (let i = 0; i < numSides; i++) {
        noiseOffsets.push({
          x: (random() - 0.5) * 50, // Base magnitude
          y: (random() - 0.5) * 50,
        });
      }

      const { width, height } = canvas.getBoundingClientRect();
      const finalCenterX = width * x;
      const finalCenterY = height * y;
      const radiusX = (width * shapeWidth * scale) / 2;
      const radiusY = (height * shapeHeight * scale) / 2;

      if (shapeType === 'circle') {
        ctx.beginPath();
        ctx.ellipse(finalCenterX, finalCenterY, radiusX, radiusY, 0, 0, Math.PI * 2);
        ctx.closePath();
        return;
      }

      // Polygon drawing logic
      const points = [];
      for (let i = 0; i < numSides; i++) {
        const angle = (i / numSides) * Math.PI * 2 - Math.PI / 2;
        const staticNoiseX = noiseOffsets[i] ? noiseOffsets[i].x * noiseAmount : 0;
        const staticNoiseY = noiseOffsets[i] ? noiseOffsets[i].y * noiseAmount : 0;

        // Dynamic noise for wobble effect (time is now passed from App)
        const dynamicNoiseX = Math.cos(time + i * 0.5) * variation;
        const dynamicNoiseY = Math.sin(time + i * 0.5) * variation;

        const x = finalCenterX + Math.cos(angle) * radiusX + staticNoiseX + dynamicNoiseX;
        const y = finalCenterY + Math.sin(angle) * radiusY + staticNoiseY + dynamicNoiseY;
        points.push({ x, y });
      }

      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);

      if (curviness !== 0) {
        for (let i = 0; i < points.length; i++) {
          const current = points[i];
          const next = points[(i + 1) % points.length];
          const midX = (current.x + next.x) / 2;
          const midY = (current.y + next.y) / 2;
          const centerToMidX = midX - finalCenterX;
          const centerToMidY = midY - finalCenterY;
          const ctrlX = midX - centerToMidX * curviness * 0.5;
          const ctrlY = midY - centerToMidY * curviness * 0.5;
          ctx.quadraticCurveTo(ctrlX, ctrlY, next.x, next.y);
        }
      } else {
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i].x, points[i].y);
        }
      }
      ctx.closePath();
    };

    // --- Render Loop (called on every state change) ---
    const render = () => {
      const { width, height } = canvas.getBoundingClientRect();
      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, width, height);



      layers.forEach(layer => {
        if (!layer.visible) return;

        ctx.globalCompositeOperation = layer.blendMode;
        ctx.globalAlpha = layer.opacity;

        drawShape(ctx, layer, Date.now() * 0.001); // Pass a simple time value for wobble

        // Create a gradient from the layer's colors
        const { x, y, scale, shapeWidth, shapeHeight } = layer;
        const radiusX = (width * shapeWidth * scale) / 2;
        const radiusY = (height * shapeHeight * scale) / 2;
        const finalCenterX = width * x;
        const finalCenterY = height * y;

        const gradient = ctx.createLinearGradient(
          finalCenterX - radiusX, 
          finalCenterY - radiusY, 
          finalCenterX + radiusX, 
          finalCenterY + radiusY
        );

        if (layer.colors && layer.colors.length > 0) {
            if (layer.colors.length === 1) {
                gradient.addColorStop(0, layer.colors[0]);
                gradient.addColorStop(1, layer.colors[0]);
            } else {
                layer.colors.forEach((color, index) => {
                    gradient.addColorStop(index / (layer.colors.length - 1), color);
                });
            }
        }

        ctx.fillStyle = gradient;
        ctx.fill();
      });

      ctx.restore();
    };

    render();

    // --- Cleanup ---
    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [layers, variation, backgroundColor, globalSeed, ref]);

  return <canvas ref={ref} style={{ width: '100%', height: '100%' }} />;
});

export default Canvas;
