import React, { useRef, useEffect, forwardRef, useMemo, useState } from 'react';
import { createSeededRandom } from '../utils/random';
import { calculateCompactVisualHash } from '../utils/layerHash';

// Gradient cache for memoization
const gradientCache = new Map();

// Create a cache key for gradients
const createGradientCacheKey = (colors, centerX, centerY, radiusX, radiusY) => {
    return `${colors.join(',')}-${centerX}-${centerY}-${radiusX}-${radiusY}`;
};

// --- Shape Drawing Logic (supports node-based shapes) ---
const drawShape = (ctx, layer, canvas, globalSeed, time = 0, isNodeEditMode = false, globalBlendMode = 'source-over') => {
    // Destructure properties from the layer and its nested position object
    const {
        numSides: sides, curviness, wobble = 0.5, width, height,
        colors, /*blendMode,*/ opacity, noiseAmount, noiseSeed,
        // New parameters from old version
        freq1 = 2, freq2 = 3, freq3 = 4,
        baseRadiusFactor = 0.4
    } = layer;
    const { x, y, scale } = layer.position;
    const random = createSeededRandom(globalSeed + noiseSeed);

    // Precompute frequencies and symmetry factor for noise deformation (shared between node and procedural shapes)
    const actualFreq1 = freq1 + (random() - 0.5) * 3;
    const actualFreq2 = freq2 + (random() - 0.5) * 3;
    const actualFreq3 = freq3 + (random() - 0.5) * 30;
    const amplitudeFactor = Math.max(0, Math.min(1, wobble));
    const symmetryFactor = amplitudeFactor; // preserve existing variable usages

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.globalCompositeOperation = globalBlendMode;

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

    let points = [];
    let usedNodes = false;

    // Use explicit nodes whenever present so edits persist after exiting node mode
    if (Array.isArray(layer.nodes) && layer.nodes.length >= 3) {
        usedNodes = true;
        // Apply wobble/noise to each stored node so node-edited shapes animate too
        points = layer.nodes.map((n, i) => {
            // Base position from stored normalized coords
            const baseX = centerX + n.x * radiusX;
            const baseY = centerY + n.y * radiusY;

            // Calculate angle roughly by index to reuse existing noise pattern
            const angle = (i / layer.nodes.length) * Math.PI * 2;
            const phase = (1 - symmetryFactor) * (i % 2) * Math.PI;
            const n1 = Math.sin(angle * actualFreq1 + time + phase) * Math.sin(time * 0.8 * amplitudeFactor);
            const n2 = Math.cos(angle * actualFreq2 - time * 0.5 + phase) * Math.cos(time * 0.3 * amplitudeFactor);
            const n3 = Math.sin(angle * actualFreq3 + time * 1.5 + phase) * Math.sin(time * 0.6 * amplitudeFactor);
            const offset = (n1 * 20 + n2 * 15 + n3 * 10) * noiseAmount * amplitudeFactor;

            // Direction from center to vertex
            const dx = baseX - centerX;
            const dy = baseY - centerY;
            const dist = Math.hypot(dx, dy) || 1;
            const normX = dx / dist;
            const normY = dy / dist;

            return { x: baseX + normX * offset, y: baseY + normY * offset };
        });
    } else {
        // Organic procedural shape (legacy) - uses precomputed actualFreq1/2/3 and symmetryFactor

        for (let i = 0; i < sides; i++) {
            const angle = (i / sides) * Math.PI * 2;

            // Phase offset for symmetry control (from old version)
            const phase = (1 - symmetryFactor) * (i % 2) * Math.PI;

            // Multi-layered noise
            const n1 = Math.sin(angle * actualFreq1 + time + phase) * Math.sin(time * 0.8 * amplitudeFactor);
            const n2 = Math.cos(angle * actualFreq2 - time * 0.5 + phase) * Math.cos(time * 0.3 * amplitudeFactor);
            const n3 = Math.sin(angle * actualFreq3 + time * 1.5 + phase) * Math.sin(time * 0.6 * amplitudeFactor);

            // Apply noise to radius
            const offsetX = (n1 * 20 + n2 * 15 + n3 * 10) * noiseAmount * amplitudeFactor;
            const offsetY = (n1 * 20 + n2 * 15 + n3 * 10) * noiseAmount * amplitudeFactor;

            const finalRadiusX = radiusX + offsetX;
            const finalRadiusY = radiusY + offsetY;

            const px = centerX + Math.cos(angle) * finalRadiusX;
            const py = centerY + Math.sin(angle) * finalRadiusY;

            points.push({ x: px, y: py });
        }
    }

    const last = points[points.length - 1];
    const first = points[0];

    if (usedNodes) {
        // Curviness controls smoothing amount between straight edges and full midpoint smoothing
        // t=0 -> straight polygon; t=1 -> classic midpoint quadratic smoothing
        const t = Math.max(0, Math.min(1, (curviness ?? 0)));

        if (t <= 1e-4) {
            // Straight lines between nodes
            ctx.moveTo(first.x, first.y);
            for (let i = 1; i < points.length; i++) {
                ctx.lineTo(points[i].x, points[i].y);
            }
            ctx.closePath();
        } else if (t >= 1 - 1e-4) {
            // Full midpoint smoothing
            ctx.moveTo((last.x + first.x) / 2, (last.y + first.y) / 2);
            for (let i = 0; i < points.length; i++) {
                const current = points[i];
                const next = points[(i + 1) % points.length];
                const midX = (current.x + next.x) / 2;
                const midY = (current.y + next.y) / 2;
                ctx.quadraticCurveTo(current.x, current.y, midX, midY);
            }
            ctx.closePath();
        } else {
            // Blended: start point and endpoints interpolate between polygon vertices and midpoints
            const startX = first.x * (1 - t) + ((last.x + first.x) / 2) * t;
            const startY = first.y * (1 - t) + ((last.y + first.y) / 2) * t;
            ctx.moveTo(startX, startY);
            for (let i = 0; i < points.length; i++) {
                const current = points[i];
                const next = points[(i + 1) % points.length];
                const midX = (current.x + next.x) / 2;
                const midY = (current.y + next.y) / 2;
                const endX = next.x * (1 - t) + midX * t;
                const endY = next.y * (1 - t) + midY * t;
                ctx.quadraticCurveTo(current.x, current.y, endX, endY);
            }
            ctx.closePath();
        }
    } else {
        // Legacy smoothing for procedural shapes
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

    // Compute gradient center and radius based on current shape geometry so it follows node pulling
    let gCenterX = centerX;
    let gCenterY = centerY;
    let gRadius = Math.max(radiusX, radiusY);
    if (points && points.length >= 3) {
        let sx = 0, sy = 0;
        for (let i = 0; i < points.length; i++) { sx += points[i].x; sy += points[i].y; }
        gCenterX = sx / points.length;
        gCenterY = sy / points.length;
        let maxDist = 0;
        for (let i = 0; i < points.length; i++) {
            const dx = points[i].x - gCenterX;
            const dy = points[i].y - gCenterY;
            const d = Math.hypot(dx, dy);
            if (d > maxDist) maxDist = d;
        }
        gRadius = Math.max(1, maxDist);
    }

    // Memoized gradient creation (keyed by derived center/radius)
    const gradientKey = createGradientCacheKey(colors, gCenterX, gCenterY, gRadius, gRadius);
    let gradient = gradientCache.get(gradientKey);

    if (!gradient) {
        gradient = ctx.createRadialGradient(
            gCenterX, gCenterY, 0,
            gCenterX, gCenterY, gRadius
        );
        colors.forEach((color, index) => {
            gradient.addColorStop(index / (colors.length - 1 || 1), color);
        });

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
const drawImage = (ctx, layer, canvas, globalBlendMode = 'source-over') => {
    const {
        image, opacity, /*blendMode,*/
        imageBlur = 0, imageBrightness = 100, imageContrast = 100,
        imageHue = 0, imageSaturation = 100, imageDistortion = 0,
        noiseSeed = 1
    } = layer;
    const { x, y, scale } = layer.position;

    if (!image || !image.src) return;

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.globalCompositeOperation = globalBlendMode;

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

    if (imageDistortion > 0) {
        const random = createSeededRandom(noiseSeed);

        const waveAmplitude = imageDistortion * 0.01;
        const waveFrequency = 0.02;

        ctx.translate(centerX, centerY);

        const skewX = Math.sin(random() * Math.PI * 2) * waveAmplitude;
        const skewY = Math.cos(random() * Math.PI * 2) * waveAmplitude;

        ctx.transform(1, skewY, skewX, 1, 0, 0);

        ctx.drawImage(img, -imgWidth / 2, -imgHeight / 2, imgWidth, imgHeight);
    } else {
        ctx.drawImage(img, centerX - imgWidth / 2, centerY - imgHeight / 2, imgWidth, imgHeight);
    }

    ctx.restore();
};

// Helper to compute initial regular polygon nodes in layer-local unit circle ([-1,1])
// Resizes existing node array to desired length while preserving as many positions as possible
const resizeNodes = (nodes, desired) => {
    if (!Array.isArray(nodes) || desired < 3) return computeInitialNodes({ numSides: desired }, {});
    let curr = [...nodes];
    if (curr.length === desired) return curr;
    if (curr.length > desired) {
        // Keep first desired nodes
        return curr.slice(0, desired);
    }
    // Need to add nodes
    while (curr.length < desired) {
        const insertions = desired - curr.length;
        // Distribute insertions over edges
        for (let i = 0; i < curr.length && curr.length < desired; i++) {
            const next = (i + 1) % curr.length;
            const mid = {
                x: (curr[i].x + curr[next].x) / 2,
                y: (curr[i].y + curr[next].y) / 2,
            };
            curr.splice(next, 0, mid);
            i++; // skip over newly inserted node
        }
    }
    return curr;
};
const computeInitialNodes = (layer, canvas) => {
    const { numSides: sides = 6 } = layer;
    const count = Math.max(3, sides);
    const nodes = [];
    for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        nodes.push({ x: Math.cos(angle), y: Math.sin(angle) });
    }
    return nodes;
};

// --- Canvas Component ---
const Canvas = forwardRef(({ layers, backgroundColor, globalSeed, globalBlendMode, isNodeEditMode, selectedLayerIndex, setLayers, classicMode = false }, ref) => {
    const localCanvasRef = useRef(null);
    const layerHashesRef = useRef(new Map());
    const backgroundHashRef = useRef('');
    const draggingNodeIndexRef = useRef(null);
    const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

    // Keep canvas sized to its container (the .canvas-container)
    useEffect(() => {
        const canvas = localCanvasRef.current;
        if (!canvas) return;
        const container = canvas.parentElement;
        if (!container) return;

        const applySize = () => {
            const rect = container.getBoundingClientRect();
            const w = Math.max(1, Math.floor(rect.width));
            const h = Math.max(1, Math.floor(rect.height));
            if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w;
                canvas.height = h;
                setCanvasSize({ width: w, height: h });
            }
        };

        applySize();
        const ro = new ResizeObserver(() => applySize());
        ro.observe(container);
        window.addEventListener('resize', applySize);
        return () => {
            ro.disconnect();
            window.removeEventListener('resize', applySize);
        };
    }, []);

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

        layerHashesRef.current = currentHashes;

        return changes;
    }, [layers]);

    // Check if background has changed
    const backgroundChanged = useMemo(() => {
        const currentBgHash = `${backgroundColor}-${globalSeed}-${globalBlendMode}`;
        const hasChanged = currentBgHash !== backgroundHashRef.current;
        backgroundHashRef.current = currentBgHash;
        return hasChanged;
    }, [backgroundColor, globalSeed, globalBlendMode]);

    // Optimized render effect with selective updates
    useEffect(() => {
        const canvas = localCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const { width, height } = canvas;

        const renderStart = performance.now();

        const needsFullRender = backgroundChanged ||
            Array.from(layerChanges.values()).some(change => change.hasChanged) ||
            layerHashesRef.current.size === 0;

        if (!needsFullRender) {
            console.debug('Canvas render skipped - no visual changes detected');
            return;
        }

        const changedLayers = Array.from(layerChanges.entries())
            .filter(([_, change]) => change.hasChanged)
            .map(([index, change]) => ({ index, reason: change.reason }));

        if (changedLayers.length > 0) {
            console.debug('Canvas rendering layers:', changedLayers);
        }

        if (backgroundChanged || layerHashesRef.current.size === 0) {
            ctx.clearRect(0, 0, width, height);
            ctx.fillStyle = backgroundColor;
            ctx.fillRect(0, 0, width, height);
        }

        if (classicMode) {
            ctx.filter = 'blur(1px)';
        }

        layers.forEach((layer, index) => {
            if (!layer || !layer.position) {
                console.error('Skipping render for malformed layer:', layer);
                return;
            }
            if (!layer.visible) return;

            const layerChange = layerChanges.get(index);

            if (backgroundChanged || layerHashesRef.current.size === 0 || layerChange?.hasChanged) {
                if (layer.image && layer.image.src) {
                    drawImage(ctx, layer, canvas, globalBlendMode);
                } else {
                    const time = Date.now() * 0.001;
                    drawShape(ctx, layer, canvas, globalSeed + index, time, isNodeEditMode, globalBlendMode);
                }
            }
        });

        if (classicMode) {
            ctx.filter = 'none';
        }

        // Draw draggable node handles for selected layer when in node edit mode (layer-local mapping)
        if (isNodeEditMode && selectedLayerIndex != null && layers[selectedLayerIndex]) {
            const sel = layers[selectedLayerIndex];
            if (sel.layerType === 'shape' && Array.isArray(sel.nodes) && sel.nodes.length >= 1) {
                const { x, y, scale } = sel.position || { x: 0.5, y: 0.5, scale: 1 };
                const centerX = x * width;
                const centerY = y * height;
                const baseRadiusFactor = sel.baseRadiusFactor ?? 0.4;
                const radiusX = Math.min((sel.width + (sel.radiusBump || 0) * 20) * baseRadiusFactor, width * 0.4) * scale;
                const radiusY = Math.min((sel.height + (sel.radiusBump || 0) * 20) * baseRadiusFactor, height * 0.4) * scale;
                ctx.save();
                ctx.fillStyle = '#ffffff';
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 2;
                const r = 6;
                sel.nodes.forEach(n => {
                    const px = centerX + n.x * radiusX;
                    const py = centerY + n.y * radiusY;
                    ctx.beginPath();
                    ctx.arc(px, py, r, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                });
                ctx.restore();
            }
        }

        const renderEnd = performance.now();
        const renderTime = renderEnd - renderStart;

        if (renderTime > 16) {
            console.warn(`Canvas render took ${renderTime.toFixed(2)}ms - may impact performance`);
        }

    }, [layerChanges, backgroundChanged, isNodeEditMode, selectedLayerIndex, classicMode, canvasSize]);

    useEffect(() => {
        if (ref) {
            ref.current = localCanvasRef.current;
        }
    }, [ref]);

    // Initialize nodes when entering node edit mode if missing
    useEffect(() => {
        const canvas = localCanvasRef.current;
        if (!canvas || !isNodeEditMode) return;
        const layer = layers[selectedLayerIndex];
        if (!layer || layer.layerType !== 'shape') return;
        if (!Array.isArray(layer.nodes) || layer.nodes.length < 3) {
            const nodes = computeInitialNodes(layer, canvas);
            setLayers(prev => prev.map((l, i) => i === selectedLayerIndex ? { ...l, nodes } : l));
        }
    }, [isNodeEditMode, selectedLayerIndex, layers, setLayers]);

    // Keep nodes count in sync with numSides while in node edit mode without resetting shape
    useEffect(() => {
        const canvas = localCanvasRef.current;
        if (!canvas || !isNodeEditMode) return;
        const layer = layers[selectedLayerIndex];
        if (!layer || layer.layerType !== 'shape') return;
        const desired = Math.max(3, layer.numSides || 3);
        if (!Array.isArray(layer.nodes) || layer.nodes.length === 0) {
            const nodes = computeInitialNodes(layer, canvas);
            setLayers(prev => prev.map((l, i) => i === selectedLayerIndex ? { ...l, nodes } : l));
        } else if (layer.nodes.length !== desired) {
            const nodes = resizeNodes(layer.nodes, desired);
            setLayers(prev => prev.map((l, i) => i === selectedLayerIndex ? { ...l, nodes } : l));
        }
    }, [isNodeEditMode, selectedLayerIndex, layers, setLayers]);

    // Mouse interaction for dragging nodes
    const getMousePos = (evt) => {
        const canvas = localCanvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (evt.clientX - rect.left) * scaleX,
            y: (evt.clientY - rect.top) * scaleY,
        };
    };

    const onMouseDown = (e) => {
        if (!isNodeEditMode) return;
        const canvas = localCanvasRef.current;
        if (!canvas) return;
        const layer = layers[selectedLayerIndex];
        if (!layer || layer.layerType !== 'shape' || !Array.isArray(layer.nodes)) return;
        const { x, y, scale } = layer.position || { x: 0.5, y: 0.5, scale: 1 };
        const centerX = x * canvas.width;
        const centerY = y * canvas.height;
        const baseRadiusFactor = layer.baseRadiusFactor ?? 0.4;
        const radiusX = Math.min((layer.width + (layer.radiusBump || 0) * 20) * baseRadiusFactor, canvas.width * 0.4) * scale;
        const radiusY = Math.min((layer.height + (layer.radiusBump || 0) * 20) * baseRadiusFactor, canvas.height * 0.4) * scale;

        const pos = getMousePos(e);
        const hitRadius = 10;
        const idx = layer.nodes.findIndex(n => {
            const px = centerX + n.x * radiusX;
            const py = centerY + n.y * radiusY;
            const dx = px - pos.x;
            const dy = py - pos.y;
            return (dx * dx + dy * dy) <= hitRadius * hitRadius;
        });
        if (idx !== -1) {
            draggingNodeIndexRef.current = idx;
        }
    };

    const onMouseMove = (e) => {
        if (!isNodeEditMode) return;
        const idx = draggingNodeIndexRef.current;
        if (idx == null) return;
        const canvas = localCanvasRef.current;
        if (!canvas) return;
        const layer = layers[selectedLayerIndex];
        if (!layer || !layer.position) return;
        const { x, y, scale } = layer.position;
        const centerX = x * canvas.width;
        const centerY = y * canvas.height;
        const baseRadiusFactor = layer.baseRadiusFactor ?? 0.4;
        const radiusX = Math.max(1e-6, Math.min((layer.width + (layer.radiusBump || 0) * 20) * baseRadiusFactor, canvas.width * 0.4) * scale);
        const radiusY = Math.max(1e-6, Math.min((layer.height + (layer.radiusBump || 0) * 20) * baseRadiusFactor, canvas.height * 0.4) * scale);

        const pos = getMousePos(e);
        const nx = (pos.x - centerX) / radiusX;
        const ny = (pos.y - centerY) / radiusY;
        setLayers(prev => prev.map((l, i) => {
            if (i !== selectedLayerIndex) return l;
            const nodes = [...(l.nodes || [])];
            nodes[idx] = { x: nx, y: ny };
            return { ...l, nodes };
        }));
    };

    const onMouseUp = () => {
        draggingNodeIndexRef.current = null;
    };

    return (
        <canvas
            ref={localCanvasRef}
            style={{ display: 'block', pointerEvents: isNodeEditMode ? 'auto' : 'none' }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
        />
    );
});

export default Canvas;
