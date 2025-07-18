import { useEffect, useRef, useCallback } from 'react';

export const useAnimation = (setLayers, isFrozen, globalSpeedMultiplier) => {
    const animationFrameId = useRef(null);

    const animate = useCallback(() => {
        if (isFrozen) {
            animationFrameId.current = requestAnimationFrame(animate);
            return;
        }

        setLayers(prevLayers =>
            prevLayers.map(layer => {
                const { 
                    movementStyle = 'bounce', 
                    movementSpeed = 0, 
                    movementAngle = 0,
                    scaleSpeed = 0,
                    scaleMin = 0.5,
                    scaleMax = 1.5
                } = layer;

                let { 
                    x, y, 
                    scale, scaleDirection 
                } = layer.position;

                // 1. Calculate velocity
                const effectiveSpeed = movementSpeed * globalSpeedMultiplier;
                let vx = Math.cos(movementAngle * (Math.PI / 180)) * effectiveSpeed;
                let vy = Math.sin(movementAngle * (Math.PI / 180)) * effectiveSpeed;

                // 2. Update position
                let newX = x + vx;
                let newY = y + vy;

                // 3. Handle screen boundaries
                if (movementStyle === 'bounce') {
                    if (newX > 1 || newX < 0) {
                        layer.movementAngle = 180 - layer.movementAngle;
                    }
                    if (newY > 1 || newY < 0) {
                        layer.movementAngle = 360 - layer.movementAngle;
                    }
                    newX = Math.max(0, Math.min(1, newX));
                    newY = Math.max(0, Math.min(1, newY));
                } else if (movementStyle === 'drift') {
                    if (newX > 1) newX = 0;
                    if (newX < 0) newX = 1;
                    if (newY > 1) newY = 0;
                    if (newY < 0) newY = 1;
                }

                // 4. Z-axis scaling
                let newScale = scale + (scaleDirection * scaleSpeed * globalSpeedMultiplier * 0.01);
                let newScaleDirection = scaleDirection;
                if (newScale > scaleMax || newScale < scaleMin) {
                    newScaleDirection *= -1;
                    newScale = Math.max(scaleMin, Math.min(scaleMax, newScale));
                }

                return {
                    ...layer,
                    position: {
                        ...layer.position,
                        x: newX,
                        y: newY,
                        vx,
                        vy,
                        scale: newScale,
                        scaleDirection: newScaleDirection
                    }
                };
            })
        );

        animationFrameId.current = requestAnimationFrame(animate);
    }, [isFrozen, setLayers, globalSpeedMultiplier]);

    useEffect(() => {
        animationFrameId.current = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(animationFrameId.current);
    }, [animate]);
};
