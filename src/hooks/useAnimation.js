import { useEffect, useRef, useCallback } from 'react';

export const useAnimation = (setLayers, isFrozen) => {
  const animationFrameId = useRef(null);

  const animate = useCallback(() => {
    if (isFrozen) {
      animationFrameId.current = requestAnimationFrame(animate);
      return;
    }

    setLayers(prevLayers => 
      prevLayers.map(layer => {
        let { 
          movementStyle, scale, scaleDirection, scaleSpeed, 
          scaleMin, scaleMax, x, y, vx, vy 
        } = layer;

        let newX = x + vx;
        let newY = y + vy;

        if (movementStyle === 'bounce') {
          if (newX <= 0 || newX >= 1) {
            vx *= -1;
            newX = x + vx;
          }
          if (newY <= 0 || newY >= 1) {
            vy *= -1;
            newY = y + vy;
          }
        } else if (movementStyle === 'drift') {
          if (newX > 1) newX = 0;
          if (newX < 0) newX = 1;
          if (newY > 1) newY = 0;
          if (newY < 0) newY = 1;
        }

        let newScale = scale + scaleDirection * scaleSpeed * 0.01;
        let newScaleDirection = scaleDirection;
        if (newScale > scaleMax || newScale < scaleMin) {
          newScaleDirection *= -1;
          newScale = scale + newScaleDirection * scaleSpeed * 0.01;
        }

        return {
          ...layer,
          x: newX,
          y: newY,
          vx,
          vy,
          scale: newScale,
          scaleDirection: newScaleDirection,
        };
      })
    );

    animationFrameId.current = requestAnimationFrame(animate);
  }, [isFrozen, setLayers]);

  useEffect(() => {
    animationFrameId.current = requestAnimationFrame(animate);
    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [animate]);
};
