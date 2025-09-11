import { useEffect, useRef, useCallback } from 'react';

// Pure function to calculate new movement angle after boundary collision
const calculateBounceAngle = (currentAngle, hitVertical, hitHorizontal) => {
    let newAngle = currentAngle;
    
    if (hitVertical) {
        // Reflect across vertical axis (left/right boundaries)
        newAngle = 180 - currentAngle;
    }
    if (hitHorizontal) {
        // Reflect across horizontal axis (top/bottom boundaries)
        newAngle = 360 - currentAngle;
    }
    
    // Normalize angle to 0-360 range
    while (newAngle < 0) newAngle += 360;
    while (newAngle >= 360) newAngle -= 360;
    
    return newAngle;
};

// Pure function to update layer animation state
const updateLayerAnimation = (layer, globalSpeedMultiplier, zIgnore = false) => {
    const { 
        movementStyle = 'bounce', 
        movementSpeed = 0, 
        movementAngle = 0,
        scaleSpeed = 0,
        scaleMin = 0.5,
        scaleMax = 1.5
    } = layer;

    const { 
        x, y, 
        scale, scaleDirection 
    } = layer.position;

    // 1. Calculate velocity
    // Map UI movementSpeed (0..5) to engine's normalized units by scaling down
    const effectiveSpeed = (movementSpeed * 0.001) * globalSpeedMultiplier;
    const vx = Math.cos(movementAngle * (Math.PI / 180)) * effectiveSpeed;
    const vy = Math.sin(movementAngle * (Math.PI / 180)) * effectiveSpeed;

    // 2. Update position (unless style is 'still')
    let newX = x;
    let newY = y;
    let newMovementAngle = movementAngle;
    if (movementStyle !== 'still') {
        newX = x + vx;
        newY = y + vy;
    }

    // 3. Handle screen boundaries (immutable)
    if (movementStyle === 'bounce') {
        const hitVertical = newX > 1 || newX < 0;
        const hitHorizontal = newY > 1 || newY < 0;

        if (hitVertical || hitHorizontal) {
            newMovementAngle = calculateBounceAngle(movementAngle, hitVertical, hitHorizontal);
        }

        newX = Math.max(0, Math.min(1, newX));
        newY = Math.max(0, Math.min(1, newY));
    } else if (movementStyle === 'drift') {
        // Toroidal wrap using modulo for pixel-perfect continuity
        newX = ((newX % 1) + 1) % 1;
        newY = ((newY % 1) + 1) % 1;
    }

    // 4. Z-axis scaling (skip when style is 'still' or globally ignored)
    let newScale = scale;
    let newScaleDirection = scaleDirection;
    if (movementStyle !== 'still' && !zIgnore) {
        newScale = scale + (scaleDirection * scaleSpeed * globalSpeedMultiplier * 0.01);
        if (newScale > scaleMax || newScale < scaleMin) {
            newScaleDirection *= -1;
            newScale = Math.max(scaleMin, Math.min(scaleMax, newScale));
        }
    }

    // Return new layer object with updated properties
    return {
        ...layer,
        movementAngle: newMovementAngle, // Update angle if it changed due to bouncing
        position: {
            ...layer.position,
            x: newX,
            y: newY,
            vx: (movementStyle === 'still') ? 0 : vx,
            vy: (movementStyle === 'still') ? 0 : vy,
            scale: newScale,
            scaleDirection: newScaleDirection
        }
    };
};

export const useAnimation = (setLayers, isFrozen, globalSpeedMultiplier, zIgnore = false) => {
    const animationFrameId = useRef(null);

    const animate = useCallback(() => {
        if (isFrozen) {
            // Do not advance animation; let other UI changes trigger renders naturally
            return;
        }

        setLayers(prevLayers =>
            prevLayers.map(layer => updateLayerAnimation(layer, globalSpeedMultiplier, zIgnore))
        );

        animationFrameId.current = requestAnimationFrame(animate);
    }, [isFrozen, setLayers, globalSpeedMultiplier, zIgnore]);

    useEffect(() => {
        // Start loop only when not frozen
        if (!isFrozen) {
            animationFrameId.current = requestAnimationFrame(animate);
        }
        return () => {
            if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
            animationFrameId.current = null;
        };
    }, [animate, isFrozen]);
};
