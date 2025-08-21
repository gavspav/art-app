import { useEffect, useRef, useCallback } from 'react';

export const useAnimation = (setLayers, isFrozen, globalSpeedMultiplier) => {
  const animationFrameId = useRef(null);
  const timeRef = useRef(0);

  const animate = useCallback((timestamp) => {
    if (timeRef.current === 0) {
      timeRef.current = timestamp;
    }
    const deltaTime = (timestamp - timeRef.current) / 1000; // time in seconds
    timeRef.current = timestamp;

    if (isFrozen) {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
        animationFrameId.current = null;
      }
      return;
    }

    setLayers(prevLayers => {
      return prevLayers.map(layer => {
        const newLayer = { ...layer };

        // Movement Logic
        if (layer.movementSpeed > 0) {
          // Map UI movementSpeed (0..5) to engine units
          const speed = (layer.movementSpeed * 0.001) * globalSpeedMultiplier;
          const angleRad = layer.movementAngle * (Math.PI / 180);
          const vx = Math.cos(angleRad) * speed;
          const vy = Math.sin(angleRad) * speed;

          let newX = layer.position.x + vx;
          let newY = layer.position.y + vy;
          let newAngle = layer.movementAngle;

          if (layer.movementStyle === 'drift') {
            if (newX > 1.05) newX = -0.05;
            if (newX < -0.05) newX = 1.05;
            if (newY > 1.05) newY = -0.05;
            if (newY < -0.05) newY = 1.05;
          } else { // 'bounce'
            if (newX > 1 || newX < 0) {
              newAngle = 180 - layer.movementAngle;
              newX = Math.max(0, Math.min(1, newX));
            }
            if (newY > 1 || newY < 0) {
              newAngle = 360 - layer.movementAngle;
              newY = Math.max(0, Math.min(1, newY));
            }
          }
          newLayer.position = { x: newX, y: newY };
          newLayer.movementAngle = newAngle;
        }

        // Scale Logic
        if (layer.scaleSpeed > 0) {
          const baseScale = layer.baseScale ?? layer.scale ?? 1;
          const scaleFrequency = layer.scaleSpeed * globalSpeedMultiplier;
          // Use a cosine wave to oscillate between 0 and 1. (1 - cos(x)) / 2 maps the [-1, 1] range to [0, 1].
          const scaleMultiplier = (1 - Math.cos(timestamp / 500 * scaleFrequency)) / 2;
          // Multiply the original base scale by the multiplier
          newLayer.scale = baseScale * scaleMultiplier;
        }

        return newLayer;
      });
    });

    animationFrameId.current = requestAnimationFrame(animate);
  }, [setLayers, isFrozen, globalSpeedMultiplier]);

  useEffect(() => {
    if (!isFrozen) {
        animationFrameId.current = requestAnimationFrame(animate);
    }
    return () => {
        if (animationFrameId.current) {
            cancelAnimationFrame(animationFrameId.current);
        }
        timeRef.current = 0;
    };
  }, [animate, isFrozen]);
};
