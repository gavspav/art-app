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

    // Radius mapping: if viewBoxMapped, map unit nodes to canvas half-size so SVG viewBox normalization aligns
    const radiusX = layer.viewBoxMapped
        ? (canvas.width / 2) * scale
        : Math.min((width + layer.radiusBump * 20 || 0) * baseRadiusFactor, canvas.width * 0.4) * scale;
    const radiusY = layer.viewBoxMapped
        ? (canvas.height / 2) * scale
        : Math.min((height + layer.radiusBump * 20 || 0) * baseRadiusFactor, canvas.height * 0.4) * scale;

    // Defensive check for non-finite values
    if (!isFinite(radiusX) || !isFinite(radiusY)) {
        console.error('Skipping shape draw due to non-finite radius:', { radiusX, radiusY, layer });
        ctx.restore();
        return;
    }

    ctx.beginPath();

    let points = [];
    let usedNodes = false;

    const buildDeformedPoints = (nodes) => nodes.map((n, i) => {
        const baseX = centerX + n.x * radiusX;
        const baseY = centerY + n.y * radiusY;
        const angle = (i / nodes.length) * Math.PI * 2;
        const phase = (1 - symmetryFactor) * (i % 2) * Math.PI;
        const n1 = Math.sin(angle * actualFreq1 + time + phase) * Math.sin(time * 0.8 * amplitudeFactor);
        const n2 = Math.cos(angle * actualFreq2 - time * 0.5 + phase) * Math.cos(time * 0.3 * amplitudeFactor);
        const n3 = Math.sin(angle * actualFreq3 + time * 1.5 + phase) * Math.sin(time * 0.6 * amplitudeFactor);
        const offset = (n1 * 20 + n2 * 15 + n3 * 10) * noiseAmount * amplitudeFactor;
        const dx = baseX - centerX;
        const dy = baseY - centerY;
        const dist = Math.hypot(dx, dy) || 1;
        const normX = dx / dist;
        const normY = dy / dist;
        return { x: baseX + normX * offset, y: baseY + normY * offset };
    });

    const drawSmoothClosed = (pts, t) => {
        const last = pts[pts.length - 1];
        const first = pts[0];
        if (t <= 1e-4) {
            ctx.moveTo(first.x, first.y);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
            ctx.closePath();
        } else if (t >= 1 - 1e-4) {
            ctx.moveTo((last.x + first.x) / 2, (last.y + first.y) / 2);
            for (let i = 0; i < pts.length; i++) {
                const current = pts[i];
                const next = pts[(i + 1) % pts.length];
                const midX = (current.x + next.x) / 2;
                const midY = (current.y + next.y) / 2;
                ctx.quadraticCurveTo(current.x, current.y, midX, midY);
            }
            ctx.closePath();
        } else {
            const last = pts[pts.length - 1];
            const first = pts[0];
            const startX = first.x * (1 - t) + ((last.x + first.x) / 2) * t;
            const startY = first.y * (1 - t) + ((last.y + first.y) / 2) * t;
            ctx.moveTo(startX, startY);
            for (let i = 0; i < pts.length; i++) {
                const current = pts[i];
                const next = pts[(i + 1) % pts.length];
                const midX = (current.x + next.x) / 2;
                const midY = (current.y + next.y) / 2;
                const endX = next.x * (1 - t) + midX * t;
                const endY = next.y * (1 - t) + midY * t;
                ctx.quadraticCurveTo(current.x, current.y, endX, endY);
            }
            ctx.closePath();
        }
    };

    // Use explicit nodes whenever present so edits persist after exiting node mode
    if (Array.isArray(layer.subpaths) && layer.subpaths.length > 0) {
        usedNodes = true;
        // Draw each subpath separately to avoid connecting lines between them
        const t = Math.max(0, Math.min(1, (curviness ?? 0)));
        let all = [];
        for (const sp of layer.subpaths) {
            if (!Array.isArray(sp) || sp.length < 3) continue;
            const pts = buildDeformedPoints(sp);
            all = all.concat(pts);
            drawSmoothClosed(pts, t);
        }
        points = all.length ? all : points;
    } else if (Array.isArray(layer.nodes) && layer.nodes.length >= 3) {
        usedNodes = true;
        points = buildDeformedPoints(layer.nodes);
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

    if (usedNodes) {
        // If subpaths were handled, drawing already occurred; otherwise draw single node loop
        if (!(Array.isArray(layer.subpaths) && layer.subpaths.length > 0)) {
            const last = points[points.length - 1];
            const first = points[0];
            const t = Math.max(0, Math.min(1, (curviness ?? 0)));
            drawSmoothClosed(points, t);
        }
    } else {
        // Legacy smoothing for procedural shapes
        if (points.length >= 2) {
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
        } else if (points.length === 1) {
            // Single point; nothing to draw as shape
            ctx.moveTo(points[0].x, points[0].y);
        }
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
    const draggingMidIndexRef = useRef(null);
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
        // Try to read background image settings from a parent state if provided via props through closure
        // We cannot access appState directly here; we derive from canvas container dataset in future if needed.
        // For now, include only known props; background image draw will still re-render when layers hash invalidates on first mount.
        // Note: A better approach is to pass backgroundImage via props; keeping minimal changes here.
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
            // Background image rendering is handled by dedicated function if provided via global state through window variable
            // This is a lightweight hook-in: Main app can set window.__artapp_bgimg to { src, opacity, fit, enabled }
            const bg = (typeof window !== 'undefined' && window.__artapp_bgimg) || null;
            if (bg && bg.enabled && bg.src) {
                try {
                    const img = new Image();
                    img.src = bg.src;
                    // If image might not be loaded yet, draw synchronously when natural sizes are available
                    const drawIt = () => {
                        ctx.save();
                        ctx.globalAlpha = Math.max(0, Math.min(1, Number(bg.opacity) || 1));
                        const cw = width, ch = height;
                        const iw = img.naturalWidth || img.width || 0;
                        const ih = img.naturalHeight || img.height || 0;
                        if (iw > 0 && ih > 0) {
                            let dw = cw, dh = ch, dx = 0, dy = 0;
                            const fit = bg.fit || 'cover';
                            if (fit === 'stretch') {
                                dw = cw; dh = ch; dx = 0; dy = 0;
                            } else if (fit === 'contain' || fit === 'cover') {
                                const cr = cw / ch;
                                const ir = iw / ih;
                                let scale;
                                if (fit === 'contain') {
                                    scale = ir > cr ? (cw / iw) : (ch / ih);
                                } else {
                                    scale = ir > cr ? (ch / ih) : (cw / iw);
                                }
                                dw = iw * scale;
                                dh = ih * scale;
                                dx = (cw - dw) / 2;
                                dy = (ch - dh) / 2;
                            } else if (fit === 'center') {
                                dw = iw; dh = ih; dx = (cw - dw) / 2; dy = (ch - dh) / 2;
                            }
                            ctx.drawImage(img, dx, dy, dw, dh);
                        }
                        ctx.restore();
                    };
                    if ((img.naturalWidth || 0) > 0) {
                        drawIt();
                    } else {
                        img.onload = drawIt;
                    }
                } catch {}
            }
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

        // Debug overlay for imported positions (draw after content)
        if (typeof window !== 'undefined' && window.__artapp_debug_import) {
            ctx.save();
            ctx.strokeStyle = 'rgba(255,255,255,0.3)';
            ctx.lineWidth = 1;
            for (let i = 1; i < 10; i++) {
                const x = (i / 10) * width;
                const y = (i / 10) * height;
                ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
            }
            layers.forEach(l => {
                const x = (l?.position?.x || 0.5) * width;
                const y = (l?.position?.y || 0.5) * height;
                ctx.beginPath();
                ctx.moveTo(x - 8, y); ctx.lineTo(x + 8, y);
                ctx.moveTo(x, y - 8); ctx.lineTo(x, y + 8);
                ctx.stroke();
            });
            ctx.restore();
        }

        // Draw draggable node + midpoint handles for selected layer when in node edit mode
        if (isNodeEditMode && selectedLayerIndex != null && layers[selectedLayerIndex]) {
            const sel = layers[selectedLayerIndex];
            if (Array.isArray(sel.nodes) && sel.nodes.length >= 1) {
                const { x, y, scale } = sel.position || { x: 0.5, y: 0.5, scale: 1 };
                const centerX = x * width;
                const centerY = y * height;
                // Use the exact same mapping as drawShape so handles sit on the edge
                const radiusX = sel.viewBoxMapped ? (width / 2) * scale : Math.min((sel.width + (sel.radiusBump || 0) * 20) * (sel.baseRadiusFactor ?? 0.4), width * 0.4) * scale;
                const radiusY = sel.viewBoxMapped ? (height / 2) * scale : Math.min((sel.height + (sel.radiusBump || 0) * 20) * (sel.baseRadiusFactor ?? 0.4), height * 0.4) * scale;
                ctx.save();
                // Vertex handles
                ctx.fillStyle = '#ffffff';
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 2;
                const r = 6;
                const points = sel.nodes.map(n => ({ x: centerX + n.x * radiusX, y: centerY + n.y * radiusY }));
                points.forEach(p => {
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                });
                // Midpoint handles on the smoothed curve midpoints
                const rMid = 5;
                ctx.fillStyle = '#222';
                ctx.strokeStyle = '#ffffff';
                for (let i = 0; i < points.length; i++) {
                    const a = points[i];
                    const b = points[(i + 1) % points.length];
                    const mx = (a.x + b.x) / 2;
                    const my = (a.y + b.y) / 2;
                    ctx.beginPath();
                    ctx.arc(mx, my, rMid, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                }
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
        if (layer.syncNodesToNumSides === false) return; // preserve imported SVG node counts
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
        if (!layer || !Array.isArray(layer.nodes)) return;
        const { x, y, scale } = layer.position || { x: 0.5, y: 0.5, scale: 1 };
        const centerX = x * canvas.width;
        const centerY = y * canvas.height;
        const radiusX = layer.viewBoxMapped ? (canvas.width / 2) * scale : Math.min((layer.width + (layer.radiusBump || 0) * 20) * (layer.baseRadiusFactor ?? 0.4), canvas.width * 0.4) * scale;
        const radiusY = layer.viewBoxMapped ? (canvas.height / 2) * scale : Math.min((layer.height + (layer.radiusBump || 0) * 20) * (layer.baseRadiusFactor ?? 0.4), canvas.height * 0.4) * scale;

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
            draggingMidIndexRef.current = null;
            return;
        }
        // Try midpoints next
        const pts = layer.nodes.map(n => ({ x: centerX + n.x * radiusX, y: centerY + n.y * radiusY }));
        const midIdx = pts.findIndex((_, i) => {
            const a = pts[i];
            const b = pts[(i + 1) % pts.length];
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            const dx = mx - pos.x; const dy = my - pos.y;
            return (dx * dx + dy * dy) <= hitRadius * hitRadius;
        });
        if (midIdx !== -1) {
            draggingMidIndexRef.current = midIdx;
            draggingNodeIndexRef.current = null;
        }
    };

    const onMouseMove = (e) => {
        if (!isNodeEditMode) return;
        const idx = draggingNodeIndexRef.current;
        const mid = draggingMidIndexRef.current;
        if (idx == null && mid == null) return;
        const canvas = localCanvasRef.current;
        if (!canvas) return;
        const layer = layers[selectedLayerIndex];
        if (!layer || !layer.position) return;
        const { x, y, scale } = layer.position;
        const centerX = x * canvas.width;
        const centerY = y * canvas.height;
        const radiusX = Math.max(1e-6, (layer.viewBoxMapped ? (canvas.width / 2) * scale : Math.min((layer.width + (layer.radiusBump || 0) * 20) * (layer.baseRadiusFactor ?? 0.4), canvas.width * 0.4) * scale));
        const radiusY = Math.max(1e-6, (layer.viewBoxMapped ? (canvas.height / 2) * scale : Math.min((layer.height + (layer.radiusBump || 0) * 20) * (layer.baseRadiusFactor ?? 0.4), canvas.height * 0.4) * scale));

        const pos = getMousePos(e);
        if (idx != null) {
            const nx = (pos.x - centerX) / radiusX;
            const ny = (pos.y - centerY) / radiusY;
            setLayers(prev => prev.map((l, i) => {
                if (i !== selectedLayerIndex) return l;
                const nodes = [...(l.nodes || [])];
                nodes[idx] = { x: nx, y: ny };
                return { ...l, nodes };
            }));
        } else if (mid != null) {
            setLayers(prev => prev.map((l, i) => {
                if (i !== selectedLayerIndex) return l;
                const nodes = [...(l.nodes || [])];
                const N = nodes.length;
                const aIdx = mid;
                const bIdx = (mid + 1) % N;
                // current midpoint in canvas space
                const ax = centerX + nodes[aIdx].x * radiusX;
                const ay = centerY + nodes[aIdx].y * radiusY;
                const bx = centerX + nodes[bIdx].x * radiusX;
                const by = centerY + nodes[bIdx].y * radiusY;
                const mx = (ax + bx) / 2;
                const my = (ay + by) / 2;
                const dx = (pos.x - mx) / radiusX;
                const dy = (pos.y - my) / radiusY;
                nodes[aIdx] = { x: nodes[aIdx].x + dx, y: nodes[aIdx].y + dy };
                nodes[bIdx] = { x: nodes[bIdx].x + dx, y: nodes[bIdx].y + dy };
                return { ...l, nodes };
            }));
        }
    };

    const onMouseUp = () => {
        draggingNodeIndexRef.current = null;
        draggingMidIndexRef.current = null;
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
