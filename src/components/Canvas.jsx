import React, { useRef, useEffect, forwardRef, useMemo } from 'react';
import { createSeededRandom } from '../utils/random';
import { calculateCompactVisualHash } from '../utils/layerHash';

// Gradient cache for memoization
const gradientCache = new Map();

// Create a cache key for gradients
const createGradientCacheKey = (colors, centerX, centerY, radiusX, radiusY) => {
    return `${colors.join(',')}-${centerX}-${centerY}-${radiusX}-${radiusY}`;
};

// --- Shape Drawing Logic ---
const drawShape = (ctx, layer, canvas, globalSeed) => {
    // Destructure properties from the layer and its nested position object
    const {
        numSides: sides, curviness, width, height,
        colors, blendMode, opacity, noiseAmount, noiseSeed
    } = layer;
    const { x, y, scale } = layer.position;
    const random = createSeededRandom(globalSeed + noiseSeed);

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.globalCompositeOperation = blendMode;

    const centerX = x * canvas.width;
    const centerY = y * canvas.height;

    const radiusX = (canvas.width / 2) * width * scale;
    const radiusY = (canvas.height / 2) * height * scale;

    // Defensive check for non-finite values that crash createLinearGradient
    if (!isFinite(radiusX) || !isFinite(radiusY)) {
        console.error('Skipping shape draw due to non-finite radius:', { radiusX, radiusY, layer });
        ctx.restore();
        return;
    }

    ctx.beginPath();

    for (let i = 0; i <= sides; i++) {
        const angle = (i / sides) * Math.PI * 2;

        // Apply noise to radius for organic variation
        const noiseVariation = (random() - 0.5) * noiseAmount * 0.1;
        const noisyRadiusX = radiusX * (1 + noiseVariation);
        const noisyRadiusY = radiusY * (1 + noiseVariation);

        const x1 = centerX + Math.cos(angle) * noisyRadiusX;
        const y1 = centerY + Math.sin(angle) * noisyRadiusY;

        if (i === 0) {
            ctx.moveTo(x1, y1);
        } else {
            const prevAngle = ((i - 1) / sides) * Math.PI * 2;
            if (curviness === 0) {
                ctx.lineTo(x1, y1);
            } else {
                const midAngle = (angle + prevAngle) / 2;
                const midNoiseVariation = (random() - 0.5) * noiseAmount * 0.1;
                const midNoisyRadiusX = radiusX * (1 + midNoiseVariation);
                const midNoisyRadiusY = radiusY * (1 + midNoiseVariation);

                const midX = centerX + Math.cos(midAngle) * midNoisyRadiusX;
                const midY = centerY + Math.sin(midAngle) * midNoisyRadiusY;

                const cpx = midX + (centerX - midX) * curviness;
                const cpy = midY + (centerY - midY) * curviness;

                ctx.quadraticCurveTo(cpx, cpy, x1, y1);
            }
        }
    }
    ctx.closePath();

    // Memoized gradient creation
    const gradientKey = createGradientCacheKey(colors, centerX, centerY, radiusX, radiusY);
    let gradient = gradientCache.get(gradientKey);

    if (!gradient) {
        gradient = ctx.createLinearGradient(centerX - radiusX, centerY - radiusY, centerX + radiusX, centerY + radiusY);
        colors.forEach((color, index) => {
            gradient.addColorStop(index / (colors.length - 1 || 1), color);
        });

        // Cache the gradient, but limit cache size to prevent memory leaks
        if (gradientCache.size > 100) {
            // Clear oldest entries when cache gets too large
            const firstKey = gradientCache.keys().next().value;
            gradientCache.delete(firstKey);
        }
        gradientCache.set(gradientKey, gradient);
    }

    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.restore();
};

// --- Image Drawing Logic ---
const drawImage = (ctx, layer, canvas) => {
    const { image, opacity, blendMode } = layer;
    const { x, y, scale } = layer.position;

    if (!image || !image.src) return;

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.globalCompositeOperation = blendMode;

    const img = new Image();
    img.src = image.src;

    const centerX = x * canvas.width;
    const centerY = y * canvas.height;
    const imgWidth = img.width * scale;
    const imgHeight = img.height * scale;

    ctx.drawImage(img, centerX - imgWidth / 2, centerY - imgHeight / 2, imgWidth, imgHeight);

    ctx.restore();
};


// --- Canvas Component ---
const Canvas = forwardRef(({ layers, backgroundColor, globalSeed }, ref) => {
    const localCanvasRef = useRef(null);
    const layerHashesRef = useRef(new Map());
    const backgroundHashRef = useRef('');

    // Memoize layer change detection
    const layerChanges = useMemo(() => {
        const changes = new Map();
        const currentHashes = new Map();

        layers.forEach((layer, index) => {
            if (!layer || !layer.position) {
                changes.set(index, { hasChanged: true, reason: 'malformed' });
                return;
            }

            const currentHash = calculateCompactVisualHash(layer);
            const previousHash = layerHashesRef.current.get(index);
            const hasChanged = currentHash !== previousHash;

            currentHashes.set(index, currentHash);
            changes.set(index, {
                hasChanged,
                reason: hasChanged ? 'visual-change' : 'no-change',
                currentHash,
                previousHash
            });
        });

        // Update stored hashes
        layerHashesRef.current = currentHashes;

        return changes;
    }, [layers]);

    // Check if background has changed
    const backgroundChanged = useMemo(() => {
        const currentBgHash = `${backgroundColor}-${globalSeed}`;
        const hasChanged = currentBgHash !== backgroundHashRef.current;
        backgroundHashRef.current = currentBgHash;
        return hasChanged;
    }, [backgroundColor, globalSeed]);

    // Optimized render effect with selective updates
    useEffect(() => {
        const canvas = localCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const { width, height } = canvas;

        // Performance monitoring
        const renderStart = performance.now();

        // Check if we need a full re-render
        const needsFullRender = backgroundChanged ||
            Array.from(layerChanges.values()).some(change => change.hasChanged) ||
            layerHashesRef.current.size === 0; // First render

        if (!needsFullRender) {
            // No visual changes detected, skip render
            console.debug('Canvas render skipped - no visual changes detected');
            return;
        }

        // Debug logging for performance monitoring
        const changedLayers = Array.from(layerChanges.entries())
            .filter(([_, change]) => change.hasChanged)
            .map(([index, change]) => ({ index, reason: change.reason }));

        if (changedLayers.length > 0) {
            console.debug('Canvas rendering layers:', changedLayers);
        }

        // Clear and redraw background if it changed
        if (backgroundChanged || layerHashesRef.current.size === 0) {
            ctx.clearRect(0, 0, width, height);
            ctx.fillStyle = backgroundColor;
            ctx.fillRect(0, 0, width, height);
        }

        // Selective layer rendering - only redraw changed layers
        layers.forEach((layer, index) => {
            if (!layer || !layer.position) {
                console.error('Skipping render for malformed layer:', layer);
                return;
            }
            if (!layer.visible) return;

            const layerChange = layerChanges.get(index);

            // Only render if layer has changed or this is a full re-render
            if (backgroundChanged || layerHashesRef.current.size === 0 || layerChange?.hasChanged) {
                if (layer.image && layer.image.src) {
                    drawImage(ctx, layer, canvas);
                } else {
                    drawShape(ctx, layer, canvas, globalSeed + index);
                }
            }
        });

        // Performance monitoring completion
        const renderEnd = performance.now();
        const renderTime = renderEnd - renderStart;

        if (renderTime > 16) { // Warn if render takes longer than 16ms (60fps threshold)
            console.warn(`Canvas render took ${renderTime.toFixed(2)}ms - may impact performance`);
        }

    }, [layerChanges, backgroundChanged]); // Removed broad dependencies, using memoized change detection

    useEffect(() => {
        if (ref) {
            ref.current = localCanvasRef.current;
        }
    }, [ref]);

    return (
        <canvas
            ref={localCanvasRef}
            width={window.innerWidth}
            height={window.innerHeight}
            style={{ display: 'block' }}
        />
    );
});

export default Canvas;
