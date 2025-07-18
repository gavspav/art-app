// src/components/Canvas.jsx
import React, { useRef, useEffect } from 'react';
import { getPixelRatio } from '../utils/pixelRatio';

const Canvas = React.forwardRef(({
  isFullscreen,
  speed,
  variation,
  numLayers,
  colors,
  guideWidth,
  guideHeight,
  curviness,
  noiseAmount,
  numSides,
  globalOpacity,
  blendMode,
  backgroundColor,
  layerParams,
  isFrozen,
  shapeType
}, ref) => {
  const localRef = useRef();
  const canvasRef = ref || localRef;
  const animationRef = useRef();
  const timeRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    const handleResize = () => {
      if (isFullscreen) {
        canvas.style.width = '100vw';
        canvas.style.height = '100vh';
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      } else {
        const size = Math.min(window.innerWidth * 0.8, window.innerHeight * 0.8);
        canvas.style.width = size + 'px';
        canvas.style.height = size + 'px';
        canvas.width = size;
        canvas.height = size;
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isFullscreen, canvasRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    function drawShape(t, layerParam) {

      
      // Clear the canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Set basic drawing properties
      ctx.strokeStyle = 'red';
      ctx.lineWidth = 2;
      ctx.fillStyle = 'blue';
      
      if (shapeType === 'circle') {
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = 100;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.fill();
        return;
      }

      // Draw a simple triangle to test
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const size = 100;
      
      ctx.beginPath();

      
      // Always draw straight lines for now to test
      ctx.moveTo(centerX, centerY - size); // Top
      ctx.lineTo(centerX - size, centerY + size); // Bottom left  
      ctx.lineTo(centerX + size, centerY + size); // Bottom right
      ctx.closePath();
      
      ctx.fill();
      ctx.stroke();
    }

    function animate() {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = "source-over";
      ctx.filter = "blur(1px)";
      for (let i = 0; i < numLayers; i++) {
        ctx.globalCompositeOperation = i === 0 ? "source-over" : blendMode;
        drawShape(timeRef.current, layerParams[i]);
        const color = colors[i % colors.length];
        const gradient = ctx.createRadialGradient(
          canvas.width / 2,
          canvas.height / 2,
          0,
          canvas.width / 2,
          canvas.height / 2,
          200 + i * 50
        );
        gradient.addColorStop(
          0,
          color + Math.floor(globalOpacity * 255).toString(16).padStart(2, "0")
        );
        gradient.addColorStop(
          1,
          color + Math.floor(globalOpacity * 180).toString(16).padStart(2, "0")
        );
        ctx.fillStyle = gradient;
        ctx.fill();
      }
      ctx.filter = "none";
      ctx.globalCompositeOperation = "source-over";
      timeRef.current += isFrozen ? 0 : speed;
      animationRef.current = requestAnimationFrame(animate);
    }
    animate();
    return () => cancelAnimationFrame(animationRef.current);
  }, [speed, variation, numLayers, colors, guideWidth, guideHeight, curviness, noiseAmount, numSides, globalOpacity, blendMode, backgroundColor, layerParams, isFrozen]);

  return <canvas ref={canvasRef} />;
});

export default Canvas;
