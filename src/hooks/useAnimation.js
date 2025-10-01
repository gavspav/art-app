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
    if (movementStyle === 'orbit') {
        // Orbit around a center point with per-axis radii; use movementSpeed as angular speed
        const cx = Number.isFinite(layer.orbitCenterX) ? layer.orbitCenterX : 0.5;
        const cy = Number.isFinite(layer.orbitCenterY) ? layer.orbitCenterY : 0.5;
        const baseRx = Number.isFinite(layer.orbitRadiusX) ? layer.orbitRadiusX : 0.15;
        const baseRy = Number.isFinite(layer.orbitRadiusY) ? layer.orbitRadiusY : 0.15;
        // Influence ellipse by current linear components to stretch more along the dominant axis
        const stretch = Math.min(0.2, Math.hypot(vx, vy)); // cap stretch
        const rx = Math.max(0.01, baseRx + Math.abs(vx) * 2 + stretch * 0.3);
        const ry = Math.max(0.01, baseRy + Math.abs(vy) * 2 + stretch * 0.3);
        const dTheta = effectiveSpeed * Math.PI * 2; // radians per frame step
        const theta = (Number.isFinite(layer.orbitAngle) ? layer.orbitAngle : 0) + dTheta;
        newX = cx + rx * Math.cos(theta);
        newY = cy + ry * Math.sin(theta);
        // Keep within [0,1] softly by clamping centers and radii above
        return {
            ...layer,
            orbitAngle: theta,
            position: {
                ...layer.position,
                x: newX,
                y: newY,
                vx: 0,
                vy: 0,
                scale: layer.position.scale,
                scaleDirection: layer.position.scaleDirection,
            }
        };
    } else if (movementStyle !== 'still' && movementStyle !== 'spin') {
        newX = x + vx;
        newY = y + vy;
    }

    // 3. Handle screen boundaries (immutable)
    if (movementStyle === 'bounce') {
        // Simple bounce: detect when center point hits the boundary
        const hitVertical = newX > 1 || newX < 0;
        const hitHorizontal = newY > 1 || newY < 0;

        if (hitVertical || hitHorizontal) {
            newMovementAngle = calculateBounceAngle(movementAngle, hitVertical, hitHorizontal);
        }

        // Clamp position to keep center within bounds
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
    if (movementStyle !== 'still' && movementStyle !== 'spin' && !zIgnore) {
        newScale = scale + (scaleDirection * scaleSpeed * globalSpeedMultiplier * 0.01);
        if (newScale > scaleMax || newScale < scaleMin) {
            newScaleDirection *= -1;
            newScale = Math.max(scaleMin, Math.min(scaleMax, newScale));
        }
    }

    let nextRotation = Number(layer.rotation) || 0;
    let spinAngle = Number(layer.spinAngle) || 0;
    if (movementStyle === 'spin') {
        const effectiveSpinSpeed = Math.max(0, Number(layer.movementSpeed) || 0);
        const delta = effectiveSpinSpeed * globalSpeedMultiplier * 4;
        nextRotation = ((((nextRotation + delta) + 180) % 360) + 360) % 360 - 180;
        spinAngle = spinAngle + delta;
    }

    // Return new layer object with updated properties
    return {
        ...layer,
        movementAngle: newMovementAngle, // Update angle if it changed due to bouncing
        rotation: nextRotation,
        spinAngle,
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
