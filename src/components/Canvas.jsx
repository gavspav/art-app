import React, { useRef, useEffect, forwardRef, useMemo, useState } from 'react';
import { createSeededRandom } from '../utils/random';
import { calculateCompactVisualHash } from '../utils/layerHash';

// Image cache to avoid creating new Image() every frame
const imageCache = new Map(); // key: src -> { img: HTMLImageElement, loaded: boolean }

// --- Shape Drawing Logic (supports node-based shapes) ---
const drawShape = (ctx, layer, canvas, globalSeed, time = 0, isNodeEditMode = false, globalBlendMode = 'source-over') => {
    // Destructure properties from the layer and its nested position object
    const {
        numSides: sides,
        curviness,
        wobble = 0.5,
        width,
        height,
        colors = [],
        /*blendMode,*/
        opacity = 1,
        noiseAmount = 0,
        noiseSeed = 1,
        // New parameters from old version
        freq1 = 2,
        freq2 = 3,
        freq3 = 4,
        baseRadiusFactor = 0.4,
    } = layer || {};
    const pos = layer?.position || { x: 0.5, y: 0.5, scale: 1 };
    let px = Number(pos.x);
    let py = Number(pos.y);
    let ps = Number(pos.scale);
    if (!Number.isFinite(px)) px = 0.5;
    if (!Number.isFinite(py)) py = 0.5;
    if (!Number.isFinite(ps)) ps = 1;
    const x = px, y = py, scale = ps;
    const random = createSeededRandom((Number(globalSeed) || 1) + (Number(noiseSeed) || 0));

    // Precompute frequencies and symmetry factor for noise deformation (shared between node and procedural shapes)
    const actualFreq1 = freq1 + (random() - 0.5) * 3;
    const actualFreq2 = freq2 + (random() - 0.5) * 3;
    const actualFreq3 = freq3 + (random() - 0.5) * 30;
    const amplitudeFactor = Math.max(0, Math.min(1, wobble));
    const symmetryFactor = amplitudeFactor; // preserve existing variable usages

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, Number(opacity)));
    ctx.globalCompositeOperation = globalBlendMode;

    const centerX = x * canvas.width;
    const centerY = y * canvas.height;

    // Radius mapping: if viewBoxMapped, map unit nodes to canvas half-size so SVG viewBox normalization aligns
    const radiusX = layer?.viewBoxMapped
        ? (canvas.width / 2) * scale
        : Math.min((width + (layer?.radiusBump || 0) * 20 || 0) * baseRadiusFactor, canvas.width * 0.4) * scale;
    const radiusY = layer?.viewBoxMapped
        ? (canvas.height / 2) * scale
        : Math.min((height + (layer?.radiusBump || 0) * 20 || 0) * baseRadiusFactor, canvas.height * 0.4) * scale;

    // Defensive check for non-finite values
    if (!Number.isFinite(radiusX) || !Number.isFinite(radiusY) || !Number.isFinite(centerX) || !Number.isFinite(centerY)) {
        // Skip draw on invalid radius
        ctx.restore();
        return;
    }

    ctx.beginPath();

    let points = [];
    let usedNodes = false;

    // Allow rotation in range [-180,180]; treat values outside by modulo 360
    let rotDeg = Number(layer.rotation) || 0;
    // normalize to [-180,180]
    rotDeg = ((((rotDeg + 180) % 360) + 360) % 360) - 180;
    const rotRad = (rotDeg * Math.PI) / 180;
    const sinR = Math.sin(rotRad);
    const cosR = Math.cos(rotRad);

    const buildDeformedPoints = (nodes) => nodes.map((n, i) => {
        // apply layer rotation to node before deformation projection
        const rx = n.x * cosR - n.y * sinR;
        const ry = n.x * sinR + n.y * cosR;
        const baseX = centerX + rx * radiusX;
        const baseY = centerY + ry * radiusY;
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
            // angle accounts for layer rotation
            const angle = (i / sides) * Math.PI * 2 + rotRad;

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
            const _last3 = points[points.length - 1];
            const _first3 = points[0];
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

    // Create gradient for this frame. Prior caching by center/radius caused churn and GC.
    // Ensure we have at least 2 valid color stops
    const stops = (Array.isArray(colors) && colors.length >= 2)
        ? colors
        : (Array.isArray(colors) && colors.length === 1 ? [colors[0], colors[0]] : ['#000000', '#000000']);

    const gradient = ctx.createRadialGradient(
        gCenterX, gCenterY, 0,
        gCenterX, gCenterY, gRadius
    );
    const denom = (stops.length - 1) || 1;
    for (let i = 0; i < stops.length; i++) {
        gradient.addColorStop(i / denom, stops[i]);
    }
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.restore();
};

// --- Toroidal Wrapping Helpers ---
// Estimate half-extents of the drawn content for a layer in pixels
const estimateLayerHalfExtents = (layer, canvas) => {
    try {
        const w = canvas.width || 0;
        const h = canvas.height || 0;
        const scale = Number(layer?.position?.scale ?? 1);
        if (layer?.image?.src) {
            const cache = imageCache.get(layer.image.src);
            const img = cache?.img;
            const iw = (img?.naturalWidth || img?.width || 0) * scale;
            const ih = (img?.naturalHeight || img?.height || 0) * scale;
            return { rx: iw / 2, ry: ih / 2 };
        }
        // Shape: mirror radius computation from drawShape
        const baseRadiusFactor = Number(layer?.baseRadiusFactor ?? 0.4);
        const radiusX = layer?.viewBoxMapped
            ? (w / 2) * scale
            : Math.min(((layer?.width || 0) + (layer?.radiusBump || 0) * 20) * baseRadiusFactor, w * 0.4) * scale;
        const radiusY = layer?.viewBoxMapped
            ? (h / 2) * scale
            : Math.min(((layer?.height || 0) + (layer?.radiusBump || 0) * 20) * baseRadiusFactor, h * 0.4) * scale;
        return { rx: Math.max(0, radiusX), ry: Math.max(0, radiusY) };
    } catch {
        return { rx: 0, ry: 0 };
    }
};

// Draw a layer with toroidal wrapping for 'drift' movement
const drawLayerWithWrap = (ctx, layer, canvas, drawFn, args = []) => {
    const w = canvas.width;
    const h = canvas.height;
    // Only wrap when drifting; otherwise a single draw is sufficient
    const isDrift = (layer?.movementStyle === 'drift');
    if (!isDrift) {
        drawFn(ctx, layer, canvas, ...args);
        return;
    }

    const { x = 0.5, y = 0.5 } = layer?.position || {};
    const cx = x * w;
    const cy = y * h;
    const { rx, ry } = estimateLayerHalfExtents(layer, canvas);

    // Determine which neighbor offsets are needed
    const offsetsX = [0];
    const offsetsY = [0];
    if (cx - rx < 0) offsetsX.push(w);      // needs +W copy
    if (cx + rx > w) offsetsX.push(-w);     // needs -W copy
    if (cy - ry < 0) offsetsY.push(h);      // needs +H copy
    if (cy + ry > h) offsetsY.push(-h);     // needs -H copy

    for (let oy of offsetsY) {
        for (let ox of offsetsX) {
            ctx.save();
            ctx.translate(ox, oy);
            drawFn(ctx, layer, canvas, ...args);
            ctx.restore();
        }
    }
};

// --- Image Drawing Logic ---
const drawImage = (ctx, layer, canvas, globalBlendMode = 'source-over') => {
    const {
        image, opacity, /*blendMode,*/
        imageBlur = 0, imageBrightness = 100, imageContrast = 100,
        imageHue = 0, imageSaturation = 100, imageDistortion = 0,
        noiseSeed = 1
    } = layer;
    const pos = layer?.position || { x: 0.5, y: 0.5, scale: 1 };
    const x = Number.isFinite(Number(pos.x)) ? Number(pos.x) : 0.5;
    const y = Number.isFinite(Number(pos.y)) ? Number(pos.y) : 0.5;
    const scale = Number.isFinite(Number(pos.scale)) ? Number(pos.scale) : 1;

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

    // Reuse cached HTMLImageElement per src to avoid allocations and decode thrash
    let cache = imageCache.get(image.src);
    if (!cache) {
        const img = new Image();
        cache = { img, loaded: false };
        img.onload = () => { cache.loaded = true; };
        img.src = image.src;
        imageCache.set(image.src, cache);
    }
    const img = cache.img;

    const centerX = x * canvas.width;
    const centerY = y * canvas.height;
    const iw0 = img.naturalWidth || img.width || 0;
    const ih0 = img.naturalHeight || img.height || 0;
    if (iw0 <= 0 || ih0 <= 0) { ctx.restore(); return; }
    const imgWidth = iw0 * scale;
    const imgHeight = ih0 * scale;

    if (imageDistortion > 0) {
        const random = createSeededRandom(noiseSeed);

        const waveAmplitude = imageDistortion * 0.01;
        const _waveFrequency = 0.02;

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
        const _insertions = desired - curr.length;
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

// Compute deformed node points exactly like drawShape's node path, so handles align.
// Uses same seeded randomization for frequencies to avoid drift when noise is high.
const computeDeformedNodePoints = (layer, canvas, globalSeedBase, time) => {
    try {
        if (!layer || !Array.isArray(layer.nodes) || layer.nodes.length < 3) return [];
        const { x, y, scale } = layer.position || { x: 0.5, y: 0.5, scale: 1 };
        const centerX = x * (canvas?.width || 0);
        const centerY = y * (canvas?.height || 0);
        const radiusX = layer.viewBoxMapped
            ? ((canvas?.width || 0) / 2) * scale
            : Math.min(((layer.width || 0) + (layer.radiusBump || 0) * 20) * (layer.baseRadiusFactor ?? 0.4), (canvas?.width || 0) * 0.4) * scale;
        const radiusY = layer.viewBoxMapped
            ? ((canvas?.height || 0) / 2) * scale
            : Math.min(((layer.height || 0) + (layer.radiusBump || 0) * 20) * (layer.baseRadiusFactor ?? 0.4), (canvas?.height || 0) * 0.4) * scale;

        const rotDeg = ((((Number(layer.rotation) || 0) + 180) % 360 + 360) % 360) - 180;
        const rotRad = (rotDeg * Math.PI) / 180;
        const sinR = Math.sin(rotRad);
        const cosR = Math.cos(rotRad);

        const wobble = Number(layer.wobble ?? 0.5);
        const amplitudeFactor = Math.max(0, Math.min(1, wobble));
        const symmetryFactor = amplitudeFactor;
        const freq1 = Number(layer.freq1 ?? 2);
        const freq2 = Number(layer.freq2 ?? 3);
        const freq3 = Number(layer.freq3 ?? 4);
        const rnd = createSeededRandom((globalSeedBase || 0) + (Number(layer.noiseSeed) || 0));
        const actualFreq1 = freq1 + (rnd() - 0.5) * 3;
        const actualFreq2 = freq2 + (rnd() - 0.5) * 3;
        const actualFreq3 = freq3 + (rnd() - 0.5) * 30;
        const noiseAmount = Number(layer.noiseAmount ?? 0);

        const pts = [];
        const count = layer.nodes.length;
        for (let i = 0; i < count; i++) {
            const n = layer.nodes[i];
            // rotate base node
            const rx = n.x * cosR - n.y * sinR;
            const ry = n.x * sinR + n.y * cosR;
            const baseX = centerX + rx * radiusX;
            const baseY = centerY + ry * radiusY;
            const angle = (i / count) * Math.PI * 2;
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
            pts.push({ x: baseX + normX * offset, y: baseY + normY * offset });
        }
        return pts;
    } catch {
        return [];
    }
};

// --- Canvas Component ---
const Canvas = forwardRef(({ layers, backgroundColor, globalSeed, globalBlendMode, isNodeEditMode, isFrozen = false, selectedLayerIndex, setLayers, setSelectedLayerIndex, classicMode = false }, ref) => {
    const localCanvasRef = useRef(null);
    const frozenTimeRef = useRef(0);
    const layerHashesRef = useRef(new Map());
    const backgroundHashRef = useRef('');
    const draggingNodeIndexRef = useRef(null);
    const draggingMidIndexRef = useRef(null);
    const draggingCenterRef = useRef(false);
    // Cache original nodes during node-edit numSides changes so we can restore when coming back
    const nodesCacheRef = useRef(new Map()); // key: selectedLayerIndex -> nodes array snapshot
    const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
    const modeHashRef = useRef({ isNodeEditMode: false, selectedLayerIndex: -1 });
    // Track previous layer count to force a redraw when layers are added/removed via slider
    const prevLayersCountRef = useRef(layers.length);

    // Cache of last rendered edge-points per layer index
    const renderedPointsRef = useRef(new Map()); // Map<number, Array<{x,y}>>

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

    // Keep a stable time snapshot when entering frozen state so re-renders are identical
    useEffect(() => {
        if (isFrozen) {
            frozenTimeRef.current = Date.now() * 0.001;
        }
    }, [isFrozen]);

    // Optimized render effect with selective updates
    useEffect(() => {
        const canvas = localCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const { width, height } = canvas;

        const renderStart = performance.now();

        // Force a render when node edit mode toggles or selected layer changes
        const modeChanged = (modeHashRef.current.isNodeEditMode !== isNodeEditMode) || (modeHashRef.current.selectedLayerIndex !== selectedLayerIndex);

        const countChanged = prevLayersCountRef.current !== layers.length;
        // Always repaint the background so color changes show immediately (even when frozen)
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, width, height);

        // Redraw on selection/mode toggles too; stable frozen time keeps appearance identical while frozen
        const needsFullRender = modeChanged || countChanged ||
            Array.from(layerChanges.values()).some(change => change.hasChanged) ||
            layerHashesRef.current.size === 0;

        if (!needsFullRender) {
            // Safety: after clearing the canvas, ensure content is drawn at least once
            const timeNow = isFrozen ? frozenTimeRef.current : (Date.now() * 0.001);
            const bg = (typeof window !== 'undefined' && window.__artapp_bgimg) || null;
            if (bg && bg.enabled && bg.src) {
                try {
                    let cache = imageCache.get(bg.src);
                    if (!cache) {
                        const img = new Image();
                        cache = { img, loaded: false };
                        img.onload = () => { cache.loaded = true; };
                        img.src = bg.src;
                        imageCache.set(bg.src, cache);
                    }
                    const img = cache.img;
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
                    if ((img.naturalWidth || 0) > 0) drawIt(); else img.onload = drawIt;
                } catch (e) { /* ignore image draw error */ }
            }
            layers.forEach((layer, index) => {
                if (!layer || !layer.position || !layer.visible) return;
                if (layer.image && layer.image.src) {
                    drawLayerWithWrap(ctx, layer, canvas, (c, l, cv) => drawImage(c, l, cv, globalBlendMode));
                } else {
                    drawLayerWithWrap(ctx, layer, canvas, (c, l, cv) => drawShape(c, l, cv, globalSeed + index, timeNow, isNodeEditMode, globalBlendMode));
                }
            });
            // Do not return; continue to draw overlays (debug grid, node handles)
        }

        const _changedLayers = Array.from(layerChanges.entries())
            .filter(([/*_index*/ _unused, change]) => change.hasChanged)
            .map(([index, change]) => ({ index, reason: change.reason }));

        // Avoid spamming console per frame; enable if needed for debugging

        if (backgroundChanged || layerHashesRef.current.size === 0 || modeChanged || countChanged) {
            ctx.clearRect(0, 0, width, height);
            ctx.fillStyle = backgroundColor;
            ctx.fillRect(0, 0, width, height);
            // Background image rendering is handled by dedicated function if provided via global state through window variable
            // This is a lightweight hook-in: Main app can set window.__artapp_bgimg to { src, opacity, fit, enabled }
            const bg = (typeof window !== 'undefined' && window.__artapp_bgimg) || null;
            if (bg && bg.enabled && bg.src) {
                try {
                    let cache = imageCache.get(bg.src);
                    if (!cache) {
                        const img = new Image();
                        cache = { img, loaded: false };
                        img.onload = () => { cache.loaded = true; };
                        img.src = bg.src;
                        imageCache.set(bg.src, cache);
                    }
                    const img = cache.img;
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
                    if ((img.naturalWidth || 0) > 0) { drawIt(); } else { img.onload = drawIt; }
                } catch {}
            }
        }

        if (classicMode) {
            ctx.filter = 'blur(1px)';
        }

        // current time snapshot for this frame (or stable frozen time)
        const nowSec = isFrozen ? frozenTimeRef.current : (Date.now() * 0.001);
        const forceFullPass = backgroundChanged || modeChanged || countChanged || (layerHashesRef.current.size === 0);
        layers.forEach((layer, index) => {
            if (!layer || !layer.position) {
                console.error('Skipping render for malformed layer:', layer);
                return;
            }
            if (!layer.visible) return;

            const layerChange = layerChanges.get(index);

            if (forceFullPass || layerChange?.hasChanged) {
                if (layer.image && layer.image.src) {
                    drawLayerWithWrap(ctx, layer, canvas, (c, l, cv) => drawImage(c, l, cv, globalBlendMode));
                } else {
                    // Use stable frozen time when frozen; live time otherwise
                    const time = nowSec;
                    drawLayerWithWrap(ctx, layer, canvas, (c, l, cv) => drawShape(c, l, cv, globalSeed + index, time, isNodeEditMode, globalBlendMode));
                    if (Array.isArray(layer.nodes) && layer.nodes.length >= 3) {
                        const pts = computeDeformedNodePoints(layer, canvas, globalSeed + index, time);
                        renderedPointsRef.current.set(index, pts);
                    }
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
        if (isNodeEditMode && selectedLayerIndex != null && Array.isArray(layers) && layers.length > 0) {
            const clampedIndex = Math.max(0, Math.min(selectedLayerIndex, Math.max(0, layers.length - 1)));
            const sel = layers[clampedIndex];
            if (Array.isArray(sel.nodes) && sel.nodes.length >= 1) {
                const { x, y, scale } = sel.position || { x: 0.5, y: 0.5, scale: 1 };
                const layerCX = x * width;
                const layerCY = y * height;
                // Prefer cached, last-rendered deformed points for exact alignment
                let points = renderedPointsRef.current.get(clampedIndex);
                if (!Array.isArray(points) || points.length !== sel.nodes.length) {
                    // Fallback: rotated base-node positions
                    const radiusX = sel.viewBoxMapped ? (width / 2) * scale : Math.min((sel.width + (sel.radiusBump || 0) * 20) * (sel.baseRadiusFactor ?? 0.4), width * 0.4) * scale;
                    const radiusY = sel.viewBoxMapped ? (height / 2) * scale : Math.min((sel.height + (sel.radiusBump || 0) * 20) * (sel.baseRadiusFactor ?? 0.4), height * 0.4) * scale;
                    const rotDeg = ((((Number(sel.rotation) || 0) + 180) % 360 + 360) % 360) - 180;
                    const rotRad = (rotDeg * Math.PI) / 180;
                    const sinR = Math.sin(rotRad);
                    const cosR = Math.cos(rotRad);
                    points = sel.nodes.map(n => ({ x: layerCX + (n.x * cosR - n.y * sinR) * radiusX, y: layerCY + (n.x * sinR + n.y * cosR) * radiusY }));
                }
                ctx.save();
                // Vertex handles (base positions with rotation)
                ctx.fillStyle = '#ffffff';
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 2;
                const r = 6;
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

                // Center cross-hair handle to move the whole shape
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2;
                const cross = 10;
                // Compute centroid from current base points so marker updates while editing
                let cx = layerCX, cy = layerCY;
                if (points.length >= 3) {
                    let sx = 0, sy = 0;
                    for (let i = 0; i < points.length; i++) { sx += points[i].x; sy += points[i].y; }
                    cx = sx / points.length;
                    cy = sy / points.length;
                }
                ctx.beginPath();
                ctx.moveTo(cx - cross, cy);
                ctx.lineTo(cx + cross, cy);
                ctx.moveTo(cx, cy - cross);
                ctx.lineTo(cx, cy + cross);
                ctx.stroke();
                ctx.restore();
            }
        }

        const renderEnd = performance.now();
        const renderTime = renderEnd - renderStart;

        if (renderTime > 16) {
            console.warn(`Canvas render took ${renderTime.toFixed(2)}ms - may impact performance`);
        }

        // Update trackers after a pass
        modeHashRef.current = { isNodeEditMode, selectedLayerIndex };
        prevLayersCountRef.current = layers.length;

    }, [layerChanges, backgroundChanged, backgroundColor, globalSeed, globalBlendMode, isNodeEditMode, selectedLayerIndex, classicMode, canvasSize.width, canvasSize.height]);

    useEffect(() => {
        if (ref) {
            ref.current = localCanvasRef.current;
        }
    }, [ref]);

    // Initialize nodes when entering node edit mode if missing
    useEffect(() => {
        const canvas = localCanvasRef.current;
        if (!canvas || !isNodeEditMode) return;
        const selIndex = Math.max(0, Math.min(Number.isFinite(selectedLayerIndex) ? selectedLayerIndex : 0, Math.max(0, layers.length - 1)));
        const layer = layers[selIndex];
        if (!layer || layer.layerType !== 'shape') return;
        if (!Array.isArray(layer.nodes) || layer.nodes.length < 3) {
            const nodes = computeInitialNodes(layer, canvas);
            // Avoid redundant updates
            if (!Array.isArray(layer.nodes) || layer.nodes.length !== nodes.length) {
                setLayers(prev => prev.map((l, i) => i === selIndex ? { ...l, nodes } : l));
            }
        }
    }, [isNodeEditMode, selectedLayerIndex, layers, setLayers]);

    // Additional safety: ensure current layer has nodes after any layers update while in node edit mode
    // This handles edge cases where nodes may be lost during layer count changes via the slider
    useEffect(() => {
        const canvas = localCanvasRef.current;
        if (!canvas || !isNodeEditMode) return;
        const layer = layers[selectedLayerIndex];
        if (!layer || layer.layerType !== 'shape') return;
        if (!Array.isArray(layer.nodes) || layer.nodes.length < 3) {
            const nodes = computeInitialNodes(layer, canvas);
            setLayers(prev => prev.map((l, i) => i === selectedLayerIndex ? { ...l, nodes } : l));
            // Seed/refresh cache for this layer
            nodesCacheRef.current.set(selectedLayerIndex, nodes.map(n => ({ ...n })));
        }
    }, [layers, selectedLayerIndex, isNodeEditMode, setLayers]);

    // Helper to compare node arrays
    const nodesEqual = (a = [], b = []) => {
        if (!Array.isArray(a) || !Array.isArray(b)) return false;
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            const ax = Number(a[i]?.x); const ay = Number(a[i]?.y);
            const bx = Number(b[i]?.x); const by = Number(b[i]?.y);
            if (Math.abs(ax - bx) > 1e-9 || Math.abs(ay - by) > 1e-9) return false;
        }
        return true;
    };

    // Keep nodes count in sync with numSides in node edit mode with a persistent cache
    useEffect(() => {
        const canvas = localCanvasRef.current;
        if (!canvas || !isNodeEditMode) return;
        const selIndex = Math.max(0, Math.min(Number.isFinite(selectedLayerIndex) ? selectedLayerIndex : 0, Math.max(0, layers.length - 1)));
        const layer = layers[selIndex];
        if (!layer || layer.layerType !== 'shape') return;
        if (layer.syncNodesToNumSides === false) {
            // For imported SVGs we still want an initial cache for edits
            if (!nodesCacheRef.current.has(selIndex) && Array.isArray(layer.nodes)) {
                nodesCacheRef.current.set(selIndex, [...layer.nodes.map(n => ({...n}))]);
            }
            return;
        }

        const desired = Math.max(3, layer.numSides || 3);
        const key = selIndex;
        // Ensure cache exists
        if (!nodesCacheRef.current.has(key)) {
            const base = Array.isArray(layer.nodes) && layer.nodes.length ? layer.nodes : computeInitialNodes(layer, canvas);
            nodesCacheRef.current.set(key, base.map(n => ({ ...n })));
        }
        const cache = nodesCacheRef.current.get(key) || [];

        if (desired <= 0) return;

        if (desired <= cache.length) {
            // Use the first N points from cache
            const nodes = cache.slice(0, desired).map(n => ({ ...n }));
            if (!nodesEqual(layer.nodes, nodes)) {
                setLayers(prev => prev.map((l, i) => i === selIndex ? { ...l, nodes } : l));
            }
        } else {
            // Need to add new points: derive using current best resize, then append to cache
            const target = desired;
            const current = Array.isArray(layer.nodes) && layer.nodes.length ? layer.nodes : (cache.length ? cache.slice(0) : computeInitialNodes(layer, canvas));
            const resized = resizeNodes(current, target);
            // Append any new points beyond cache length to cache
            for (let i = cache.length; i < resized.length; i++) {
                cache.push({ ...resized[i] });
            }
            nodesCacheRef.current.set(key, cache);
            if (!nodesEqual(layer.nodes, resized)) {
                setLayers(prev => prev.map((l, i) => i === selIndex ? { ...l, nodes: resized } : l));
            }
        }
    }, [isNodeEditMode, selectedLayerIndex, layers, setLayers]);

    // When the number of layers changes, prune stale cache entries and ensure the
    // currently selected layer has an editable node array.
    useEffect(() => {
        // Prune cache for removed layers
        const keys = Array.from(nodesCacheRef.current.keys());
        keys.forEach(k => { if (k >= layers.length) nodesCacheRef.current.delete(k); });

        if (!isNodeEditMode) return;
        const canvas = localCanvasRef.current;
        if (!canvas) return;
        const selIndex = Math.max(0, Math.min(Number.isFinite(selectedLayerIndex) ? selectedLayerIndex : 0, Math.max(0, layers.length - 1)));
        const layer = layers[selIndex];
        if (!layer || layer.layerType !== 'shape') return;
        if (!Array.isArray(layer.nodes) || layer.nodes.length < 3) {
            const nodes = computeInitialNodes(layer, canvas);
            // Only update if different or missing
            if (!nodesEqual(layer.nodes, nodes)) {
                setLayers(prev => prev.map((l, i) => i === selIndex ? { ...l, nodes } : l));
            }
            // Seed cache with freshly initialized nodes
            nodesCacheRef.current.set(selIndex, nodes.map(n => ({ ...n })));
        }
    }, [layers.length, selectedLayerIndex, isNodeEditMode, setLayers]);

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

    const mouseDownRef = useRef({ x: 0, y: 0, t: 0 }); // eslint-disable-line no-unused-vars

    const onMouseDown = (e) => {
        if (!isNodeEditMode) return;
        // If holding a selection modifier (Cmd/Ctrl), skip drag initiation so we can select on mouseup
        if (e.metaKey || e.ctrlKey) return;
        const canvas = localCanvasRef.current;
        if (!canvas) return;
        const layer = layers[selectedLayerIndex];
        if (!layer || !Array.isArray(layer.nodes)) return;
        const { x, y, scale } = layer.position || { x: 0.5, y: 0.5, scale: 1 };
        const centerX = x * canvas.width;
        const centerY = y * canvas.height;
        const radiusX = layer.viewBoxMapped ? (canvas.width / 2) * scale : Math.min((layer.width + (layer.radiusBump || 0) * 20) * (layer.baseRadiusFactor ?? 0.4), canvas.width * 0.4) * scale;
        const radiusY = layer.viewBoxMapped ? (canvas.height / 2) * scale : Math.min((layer.height + (layer.radiusBump || 0) * 20) * (layer.baseRadiusFactor ?? 0.4), canvas.height * 0.4) * scale;

        const rotDeg = ((((Number(layer.rotation) || 0) + 180) % 360 + 360) % 360) - 180;
        const rotRad = (rotDeg * Math.PI) / 180;
        const sinR = Math.sin(rotRad);
        const cosR = Math.cos(rotRad);

        const pos = getMousePos(e);
        const hitRadius = 10;
        // Prefer deformed points for hit-testing so handles remain clickable under noise
        const rendered = renderedPointsRef.current.get(selectedLayerIndex);
        let idx = -1;
        if (Array.isArray(rendered) && rendered.length === layer.nodes.length) {
            idx = rendered.findIndex(p => ((p.x - pos.x) ** 2 + (p.y - pos.y) ** 2) <= hitRadius * hitRadius);
        }
        if (idx === -1) {
            idx = layer.nodes.findIndex(n => {
                const rx = n.x * cosR - n.y * sinR;
                const ry = n.x * sinR + n.y * cosR;
                const px = centerX + rx * radiusX;
                const py = centerY + ry * radiusY;
                const dx = px - pos.x;
                const dy = py - pos.y;
                return (dx * dx + dy * dy) <= hitRadius * hitRadius;
            });
        }
        if (idx !== -1) {
            draggingNodeIndexRef.current = idx;
            draggingMidIndexRef.current = null;
            return;
        }
        // Try midpoints next
        const pts = (Array.isArray(rendered) && rendered.length === layer.nodes.length)
            ? rendered
            : layer.nodes.map(n => {
                const rx = n.x * cosR - n.y * sinR;
                const ry = n.x * sinR + n.y * cosR;
                return { x: centerX + rx * radiusX, y: centerY + ry * radiusY };
            });
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
            draggingCenterRef.current = false;
            return;
        }
        // Try center cross (use centroid to match the drawn crosshair position)
        {
            let cx = centerX, cy = centerY;
            if (pts.length >= 3) {
                let sx = 0, sy = 0;
                for (let i = 0; i < pts.length; i++) { sx += pts[i].x; sy += pts[i].y; }
                cx = sx / pts.length;
                cy = sy / pts.length;
            }
            const dx = cx - pos.x; const dy = cy - pos.y;
            if ((dx * dx + dy * dy) <= (hitRadius * hitRadius)) {
                draggingCenterRef.current = true;
                draggingNodeIndexRef.current = null;
                draggingMidIndexRef.current = null;
            }
        }
    };

    const onMouseMove = (e) => {
        if (!isNodeEditMode) return;
        const idx = draggingNodeIndexRef.current;
        const mid = draggingMidIndexRef.current;
        const draggingCenter = draggingCenterRef.current;
        if (idx == null && mid == null && !draggingCenter) return;
        const canvas = localCanvasRef.current;
        if (!canvas) return;
        const selIndex = Math.max(0, Math.min(Number.isFinite(selectedLayerIndex) ? selectedLayerIndex : 0, Math.max(0, layers.length - 1)));
        const layer = layers[selIndex];
        if (!layer || !layer.position) return;
        const { x, y, scale } = layer.position;
        const centerX = x * canvas.width;
        const centerY = y * canvas.height;
        const radiusX = Math.max(1e-6, (layer.viewBoxMapped ? (canvas.width / 2) * scale : Math.min((layer.width + (layer.radiusBump || 0) * 20) * (layer.baseRadiusFactor ?? 0.4), canvas.width * 0.4) * scale));
        const radiusY = Math.max(1e-6, (layer.viewBoxMapped ? (canvas.height / 2) * scale : Math.min((layer.height + (layer.radiusBump || 0) * 20) * (layer.baseRadiusFactor ?? 0.4), canvas.height * 0.4) * scale));
        // Rotation basis for converting between canvas and local node coordinates
        const rotDeg = ((((Number(layer.rotation) || 0) + 180) % 360 + 360) % 360) - 180;
        const rotRad = (rotDeg * Math.PI) / 180;
        const sinR = Math.sin(rotRad);
        const cosR = Math.cos(rotRad);

        const pos = getMousePos(e);
        if (draggingCenter) {
            const pos = getMousePos(e);
            const nx = Math.max(0, Math.min(1, pos.x / canvas.width));
            const ny = Math.max(0, Math.min(1, pos.y / canvas.height));
            setLayers(prev => prev.map((l, i) => (
                i === selIndex ? { ...l, position: { ...(l.position || {}), x: nx, y: ny } } : l
            )));
        } else if (idx != null) {
            // Convert dragged canvas position back to unrotated local node coords
            const lx = (pos.x - centerX) / radiusX;
            const ly = (pos.y - centerY) / radiusY;
            const nx = lx * cosR + ly * sinR;
            const ny = -lx * sinR + ly * cosR;
            setLayers(prev => prev.map((l, i) => {
                if (i !== selIndex) return l;
                const nodes = [...(l.nodes || [])];
                nodes[idx] = { x: nx, y: ny };
                // Update cache first N entries accordingly
                const cache = nodesCacheRef.current.get(selIndex);
                if (Array.isArray(cache) && cache.length >= nodes.length) {
                    cache[idx] = { x: nx, y: ny };
                }
                return { ...l, nodes };
            }));
        } else if (mid != null) {
            setLayers(prev => prev.map((l, i) => {
                if (i !== selIndex) return l;
                const nodes = [...(l.nodes || [])];
                const N = nodes.length;
                const aIdx = mid;
                const bIdx = (mid + 1) % N;
                // current midpoint in canvas space
                // compute current endpoints with rotation
                const arx = nodes[aIdx].x * cosR - nodes[aIdx].y * sinR;
                const ary = nodes[aIdx].x * sinR + nodes[aIdx].y * cosR;
                const brx = nodes[bIdx].x * cosR - nodes[bIdx].y * sinR;
                const bry = nodes[bIdx].x * sinR + nodes[bIdx].y * cosR;
                const ax = centerX + arx * radiusX;
                const ay = centerY + ary * radiusY;
                const bx = centerX + brx * radiusX;
                const by = centerY + bry * radiusY;
                const mx = (ax + bx) / 2;
                const my = (ay + by) / 2;
                // Convert movement delta back into unrotated local space
                const dxCanvas = pos.x - mx;
                const dyCanvas = pos.y - my;
                const dLocalX = (dxCanvas / radiusX);
                const dLocalY = (dyCanvas / radiusY);
                // inverse rotate delta
                const invDx = dLocalX * cosR + dLocalY * sinR;
                const invDy = -dLocalX * sinR + dLocalY * cosR;
                nodes[aIdx] = { x: nodes[aIdx].x + invDx, y: nodes[aIdx].y + invDy };
                nodes[bIdx] = { x: nodes[bIdx].x + invDx, y: nodes[bIdx].y + invDy };
                const cache = nodesCacheRef.current.get(selIndex);
                if (Array.isArray(cache) && cache.length >= nodes.length) {
                    cache[aIdx] = { ...nodes[aIdx] };
                    cache[bIdx] = { ...nodes[bIdx] };
                }
                return { ...l, nodes };
            }));
        }
    };

    const onMouseUp = (e) => {
        // Treat as a click to select when NOT in node edit mode,
        // OR when in node edit mode but the user is holding a selection modifier (Cmd/Ctrl)
        const wantSelect = (!isNodeEditMode) || (isNodeEditMode && (e.metaKey || e.ctrlKey));
        if (wantSelect) {
            const canvas = localCanvasRef.current;
            if (!canvas || !setSelectedLayerIndex) return;
            const pos = getMousePos(e);
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            const { width, height } = canvas;

            const buildPath = (layer) => {
                const p = new Path2D();
                if (!layer || !layer.position || !layer.visible) return p;
                const { x, y, scale } = layer.position;
                const centerX = x * width;
                const centerY = y * height;
                const radiusX = layer.viewBoxMapped ? (width / 2) * scale : Math.min((layer.width + (layer.radiusBump || 0) * 20) * (layer.baseRadiusFactor ?? 0.4), width * 0.4) * scale;
                const radiusY = layer.viewBoxMapped ? (height / 2) * scale : Math.min((layer.height + (layer.radiusBump || 0) * 20) * (layer.baseRadiusFactor ?? 0.4), height * 0.4) * scale;

                let pts = [];
                if (Array.isArray(layer.subpaths) && layer.subpaths.length > 0) {
                    // Build a combined path of subpaths
                    for (const sp of layer.subpaths) {
                        if (!Array.isArray(sp) || sp.length < 3) continue;
                        for (let i = 0; i < sp.length; i++) {
                            const n = sp[i];
                            const px = centerX + n.x * radiusX;
                            const py = centerY + n.y * radiusY;
                            if (i === 0) p.moveTo(px, py); else p.lineTo(px, py);
                        }
                        p.closePath();
                    }
                    return p;
                } else if (Array.isArray(layer.nodes) && layer.nodes.length >= 3) {
                    pts = layer.nodes.map(n => ({ x: centerX + n.x * radiusX, y: centerY + n.y * radiusY }));
                } else {
                    const sides = Math.max(3, layer.numSides || 3);
                    for (let i = 0; i < sides; i++) {
                        const ang = (i / sides) * Math.PI * 2;
                        pts.push({ x: centerX + Math.cos(ang) * radiusX, y: centerY + Math.sin(ang) * radiusY });
                    }
                }
                if (pts.length >= 3) {
                    p.moveTo(pts[0].x, pts[0].y);
                    for (let i = 1; i < pts.length; i++) p.lineTo(pts[i].x, pts[i].y);
                    p.closePath();
                }
                return p;
            };

            // Iterate from topmost (last drawn) to bottom
            for (let i = layers.length - 1; i >= 0; i--) {
                const layer = layers[i];
                if (!layer || !layer.visible) continue;
                const path = buildPath(layer);
                if (ctx.isPointInPath(path, pos.x, pos.y)) {
                    setSelectedLayerIndex(i);
                    break;
                }
            }
        }
        draggingNodeIndexRef.current = null;
        draggingMidIndexRef.current = null;
        draggingCenterRef.current = false;

        // nothing else to do here
    };

    return (
        <canvas
            ref={localCanvasRef}
            style={{ display: 'block', pointerEvents: 'auto' }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
        />
    );
});

// Prevent unnecessary re-renders when props are unchanged
const areCanvasPropsEqual = (prev, next) => {
  return (
    prev.backgroundColor === next.backgroundColor &&
    prev.globalSeed === next.globalSeed &&
    prev.globalBlendMode === next.globalBlendMode &&
    prev.isNodeEditMode === next.isNodeEditMode &&
    prev.isFrozen === next.isFrozen &&
    prev.selectedLayerIndex === next.selectedLayerIndex &&
    prev.classicMode === next.classicMode &&
    prev.layers === next.layers
  );
};

export default React.memo(Canvas, areCanvasPropsEqual);
