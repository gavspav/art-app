import React, { useRef, useEffect, forwardRef, useState } from 'react';
import { getPixelRatio } from '../utils/pixelRatio';
import { createSeededRandom } from '../utils/random';

const Canvas = forwardRef(({ 
  layers, 
  variation, 
  backgroundColor, 
  globalSeed 
}, ref) => {
  const imageCache = useRef(new Map());
  const [imagesLoaded, setImagesLoaded] = useState(0); // State to trigger re-render on image load

  // Main drawing effect
  useEffect(() => {
    // Pre-load images and trigger re-render when they're ready
    layers.forEach(layer => {
      if (layer.layerType === 'image' && layer.imageSrc && !imageCache.current.has(layer.imageSrc)) {
        const img = new Image();
        img.onload = () => {
          setImagesLoaded(prev => prev + 1); // Force re-render
        };
        img.src = layer.imageSrc;
        imageCache.current.set(layer.imageSrc, img);
      }
    });

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
        shapeWidth, shapeHeight, masterScale = 1,
        useGlobalSeed, seed 
      } = layer;

      const currentSeed = useGlobalSeed ? globalSeed : seed;
      const random = createSeededRandom(currentSeed);

      const noiseOffsets = [];
      for (let i = 0; i < numSides; i++) {
        noiseOffsets.push({
          x: (random() - 0.5) * 50,
          y: (random() - 0.5) * 50,
        });
      }

      const { width, height } = canvas.getBoundingClientRect();
      const finalCenterX = width * x;
      const finalCenterY = height * y;
      const radiusX = (width * shapeWidth * masterScale * scale) / 2;
      const radiusY = (height * shapeHeight * masterScale * scale) / 2;

      if (shapeType === 'circle') {
        ctx.beginPath();
        ctx.ellipse(finalCenterX, finalCenterY, radiusX, radiusY, 0, 0, Math.PI * 2);
        ctx.closePath();
        return;
      }

      const points = [];
      for (let i = 0; i < numSides; i++) {
        const angle = (i / numSides) * Math.PI * 2 - Math.PI / 2;
        const staticNoiseX = noiseOffsets[i] ? noiseOffsets[i].x * noiseAmount : 0;
        const staticNoiseY = noiseOffsets[i] ? noiseOffsets[i].y * noiseAmount : 0;
        const dynamicNoiseX = Math.cos(time + i * 0.5) * variation;
        const dynamicNoiseY = Math.sin(time + i * 0.5) * variation;
        const pointX = finalCenterX + Math.cos(angle) * radiusX + staticNoiseX + dynamicNoiseX;
        const pointY = finalCenterY + Math.sin(angle) * radiusY + staticNoiseY + dynamicNoiseY;
        points.push({ x: pointX, y: pointY });
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

    // --- Render Loop ---
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

        const { x, y, scale, shapeWidth, shapeHeight, masterScale = 1 } = layer;
        const finalCenterX = width * x;
        const finalCenterY = height * y;
        const finalWidth = width * shapeWidth * masterScale * scale;
        const finalHeight = height * shapeHeight * masterScale * scale;



        if (layer.layerType === 'image' && layer.imageSrc) {
          const img = imageCache.current.get(layer.imageSrc);
          if (img && img.complete) {
            ctx.drawImage(img, finalCenterX - finalWidth / 2, finalCenterY - finalHeight / 2, finalWidth, finalHeight);
          }
        } else {
          drawShape(ctx, layer, Date.now() * 0.001);

          const gradient = ctx.createLinearGradient(
            finalCenterX - finalWidth / 2, 
            finalCenterY - finalHeight / 2, 
            finalCenterX + finalWidth / 2, 
            finalCenterY + finalHeight / 2
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
        }
      });

      ctx.restore();
    };

    render();

    // --- Cleanup ---
    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [layers, variation, backgroundColor, globalSeed, ref, imagesLoaded]); // Add imagesLoaded to dependency array

  return <canvas ref={ref} style={{ width: '100%', height: '100%' }} />;
});

export default Canvas;
