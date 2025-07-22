import React, { useRef, useEffect, forwardRef, useMemo } from 'react';
import { createSeededRandom } from '../utils/random';
import { calculateCompactVisualHash } from '../utils/layerHash';

// Gradient cache for memoization
const gradientCache = new Map();

// Create a cache key for gradients
const createGradientCacheKey = (colors, centerX, centerY, radiusX, radiusY) => {
    return `${colors.join(',')}-${centerX}-${centerY}-${radiusX}-${radiusY}`;
};

// --- Shape Drawing Logic (Superior Old Algorithm) ---
const drawShape = (ctx, layer, canvas, globalSeed, time = 0) => {
    // Destructure properties from the layer and its nested position object
    const {
        numSides: sides, curviness, width, height,
        colors, blendMode, opacity, noiseAmount, noiseSeed,
        // New parameters from old version
        freq1 = 2, freq2 = 3, freq3 = 4,
        baseRadiusFactor = 0.4
    } = layer;
    const { x, y, scale } = layer.position;
    const random = createSeededRandom(globalSeed + noiseSeed);

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.globalCompositeOperation = blendMode;

    const centerX = x * canvas.width;
    const centerY = y * canvas.height;

    // Scale width/height like the old version (absolute pixel values, not ratios)
    const radiusX = Math.min((width + layer.radiusBump * 20 || 0) * baseRadiusFactor, canvas.width * 0.4) * scale;
    const radiusY = Math.min((height + layer.radiusBump * 20 || 0) * baseRadiusFactor, canvas.height * 0.4) * scale;

    // Defensive check for non-finite values
    if (!isFinite(radiusX) || !isFinite(radiusY)) {
        console.error('Skipping shape draw due to non-finite radius:', { radiusX, radiusY, layer });
        ctx.restore();
        return;
    }

    ctx.beginPath();

    // Superior organic shape algorithm from old version
    // Multiple frequency layers for complex organic motion
    const actualFreq1 = freq1 + (random() - 0.5) * 3;
    const actualFreq2 = freq2 + (random() - 0.5) * 3;
    const actualFreq3 = freq3 + (random() - 0.5) * 30;

    // Symmetry factor from curviness (key insight from old version)
    const symmetryFactor = Math.abs(curviness);

    const points = [];
    for (let i = 0; i < sides; i++) {
        const angle = (i / sides) * Math.PI * 2;

        // Phase offset for symmetry control (from old version)
        const phase = (1 - symmetryFactor) * (i % 2) * Math.PI;

        // Multi-layered noise (the secret sauce from old version)
        const n1 = Math.sin(angle * actualFreq1 + time + phase) * Math.sin(time * 0.8 * symmetryFactor);
        const n2 = Math.cos(angle * actualFreq2 - time * 0.5 + phase) * Math.cos(time * 0.3 * symmetryFactor);
        const n3 = Math.sin(angle * actualFreq3 + time * 1.5 + phase) * Math.sin(time * 0.6 * symmetryFactor);

        // Apply noise to radius (not position) - key difference!
        const offsetX = (n1 * 20 + n2 * 15 + n3 * 10) * noiseAmount * symmetryFactor;
        const offsetY = (n1 * 20 + n2 * 15 + n3 * 10) * noiseAmount * symmetryFactor;

        const finalRadiusX = radiusX + offsetX;
        const finalRadiusY = radiusY + offsetY;

        const x = centerX + Math.cos(angle) * finalRadiusX;
        const y = centerY + Math.sin(angle) * finalRadiusY;

        points.push({ x, y });
    }

    // Superior curve drawing method - connects midpoints with quadratic curves
    const last = points[points.length - 1];
    const first = points[0];
    ctx.moveTo((last.x + first.x) / 2, (last.y + first.y) / 2);

    for (let i = 0; i < points.length; i++) {
        const current = points[i];
        const next = points[(i + 1) % points.length];
        const midX = (current.x + next.x) / 2;
        const midY = (current.y + next.y) / 2;

        // This is the key - quadratic curve TO the midpoint, WITH the vertex as control point
        ctx.quadraticCurveTo(current.x, current.y, midX, midY);
    }
    ctx.closePath();

    // Memoized gradient creation
    const gradientKey = createGradientCacheKey(colors, centerX, centerY, radiusX, radiusY);
    let gradient = gradientCache.get(gradientKey);

    if (!gradient) {
        gradient = ctx.createRadialGradient(
            centerX, centerY, 0,
            centerX, centerY, Math.max(radiusX, radiusY)
        );
        colors.forEach((color, index) => {
            gradient.addColorStop(index / (colors.length - 1 || 1), color);
        });

        // Cache the gradient, but limit cache size to prevent memory leaks
        if (gradientCache.size > 100) {
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
    const {
        image, opacity, blendMode,
        imageBlur = 0, imageBrightness = 100, imageContrast = 100,
        imageHue = 0, imageSaturation = 100, imageDistortion = 0,
        noiseSeed = 1
    } = layer;
    const { x, y, scale } = layer.position;

    if (!image || !image.src) return;

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.globalCompositeOperation = blendMode;

    // Apply image filters
    const filters = [];
    if (imageBlur > 0) filters.push(`blur(${imageBlur}px)`);
    if (imageBrightness !== 100) filters.push(`brightness(${imageBrightness}%)`);
    if (imageContrast !== 100) filters.push(`contrast(${imageContrast}%)`);
    if (imageHue !== 0) filters.push(`hue-rotate(${imageHue}deg)`);
    if (imageSaturation !== 100) filters.push(`saturate(${imageSaturation}%)`);

    if (filters.length > 0) {
        ctx.filter = filters.join(' ');
    }

    const img = new Image();
    img.src = image.src;

    const centerX = x * canvas.width;
    const centerY = y * canvas.height;
    const imgWidth = img.width * scale;
    const imgHeight = img.height * scale;

    // Apply distortion effect using transforms
    if (imageDistortion > 0) {
        const random = createSeededRandom(noiseSeed);

        // Create subtle wave distortion
        const waveAmplitude = imageDistortion * 0.01; // Scale down the distortion
        const waveFrequency = 0.02;

        // Apply transform for distortion
        ctx.translate(centerX, centerY);

        // Create a subtle skew/wave effect
        const skewX = Math.sin(random() * Math.PI * 2) * waveAmplitude;
        const skewY = Math.cos(random() * Math.PI * 2) * waveAmplitude;

        ctx.transform(1, skewY, skewX, 1, 0, 0);

        ctx.drawImage(img, -imgWidth / 2, -imgHeight / 2, imgWidth, imgHeight);
    } else {
        ctx.drawImage(img, centerX - imgWidth / 2, centerY - imgHeight / 2, imgWidth, imgHeight);
    }

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
                    // Pass time for animation (using Date.now() like the old version)
                    const time = Date.now() * 0.001;
                    drawShape(ctx, layer, canvas, globalSeed + index, time);
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
