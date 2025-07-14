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
  isFrozen
}, ref) => {
  const localRef = useRef();
  const canvasRef = ref || localRef;
  const animationRef = useRef();
  const timeRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const ratio = getPixelRatio(ctx);

    const handleResize = () => {
      if (isFullscreen) {
        canvas.style.width = '100vw';
        canvas.style.height = '100vh';
        canvas.width = Math.floor(window.innerWidth * ratio);
        canvas.height = Math.floor(window.innerHeight * ratio);
      } else {
        const size = Math.min(window.innerWidth * 0.8, window.innerHeight * 0.8);
        canvas.style.width = size + 'px';
        canvas.style.height = size + 'px';
        canvas.width = Math.floor(size * ratio);
        canvas.height = Math.floor(size * ratio);
      }
      ctx.scale(ratio, ratio);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isFullscreen, canvasRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    function drawOilShape(t, layerParam) {
      if (!layerParam) return;
      const {
        freq1, freq2, freq3,
        centerBaseX, centerBaseY,
        centerOffsetX, centerOffsetY,
        moveSpeedX, moveSpeedY,
        radiusBump, baseRadiusFactor
      } = layerParam;
      ctx.beginPath();
      const centerX = (canvas.width/2) * centerBaseX +
        Math.sin(t * moveSpeedX) * 0.1 * canvas.width * variation +
        centerOffsetX * canvas.width;
      const centerY = (canvas.height/2) * centerBaseY +
        Math.cos(t * moveSpeedY) * 0.1 * canvas.height * variation +
        centerOffsetY * canvas.height;
      const sides = numSides;
      const points = [];
      for (let i = 0; i < sides; i++) {
        const angle = (i / sides) * Math.PI * 2;
        const symmetryFactor = curviness;
        const phase = (1 - symmetryFactor) * (i % 2) * Math.PI;
        const n1 = Math.sin(angle * freq1 + t + phase) * Math.sin(t * 0.8 * symmetryFactor);
        const n2 = Math.cos(angle * freq2 - t * 0.5 + phase) * Math.cos(t * 0.3 * symmetryFactor);
        const n3 = Math.sin(angle * freq3 + t * 1.5 + phase) * Math.sin(t * 0.6 * symmetryFactor);
        const baseRadiusX = Math.min((guideWidth + radiusBump * 20) * baseRadiusFactor, canvas.width * 0.4);
        const baseRadiusY = Math.min((guideHeight + radiusBump * 20) * baseRadiusFactor, canvas.height * 0.4);
        const offsetX = (n1 * 20 + n2 * 15 + n3 * 10) * noiseAmount * symmetryFactor;
        const offsetY = (n1 * 20 + n2 * 15 + n3 * 10) * noiseAmount * symmetryFactor;
        const rx = baseRadiusX + offsetX;
        const ry = baseRadiusY + offsetY;
        const x = centerX + Math.cos(angle) * rx;
        const y = centerY + Math.sin(angle) * ry;
        points.push({ x, y });
      }
      const last = points[points.length - 1];
      const first = points[0];
      ctx.moveTo((last.x + first.x) / 2, (last.y + first.y) / 2);
      for (let i = 0; i < points.length; i++) {
        const current = points[i];
        const next = points[(i + 1) % points.length];
        const midX = (current.x + next.x) / 2;
        const midY = (current.y + next.y) / 2;
        ctx.quadraticCurveTo(current.x, current.y, midX, midY);
      }
      ctx.closePath();
    }

    function animate() {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = "source-over";
      ctx.filter = "blur(1px)";
      for (let i = 0; i < numLayers; i++) {
        ctx.globalCompositeOperation = i === 0 ? "source-over" : blendMode;
        drawOilShape(timeRef.current, layerParams[i]);
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
