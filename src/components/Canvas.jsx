import React, { useRef, useEffect, forwardRef, useMemo, useState, useImperativeHandle, useCallback } from 'react';
import { useAppState } from '../context/AppStateContext.jsx';
import { createSeededRandom } from '../utils/random';
import { calculateCompactVisualHash } from '../utils/layerHash';
import { hexToRgb, rgbToHex } from '../utils/colorUtils.js';
import { computeInitialNodes, resizeNodes } from '../utils/nodeUtils.js';
import { getCanvasFps, subscribeCanvasFps } from '../utils/canvasFps.js';

// Image cache to avoid creating new Image() every frame
const imageCache = new Map(); // key: src -> { img: HTMLImageElement, loaded: boolean }
const wrapDebugLastLogMsByLayerId = new Map();

const DEFAULT_PIXEL_RATIO = 1;

const getCanvasPixelRatio = (canvas) => {
    if (!canvas) {
        return DEFAULT_PIXEL_RATIO;
    }
    const declared = Number(canvas.dataset?.pixelRatio);
    if (Number.isFinite(declared) && declared > 0) {
        return declared;
    }
    if (typeof window !== 'undefined') {
        const dpr = window.devicePixelRatio || DEFAULT_PIXEL_RATIO;
        return Number.isFinite(dpr) && dpr > 0 ? dpr : DEFAULT_PIXEL_RATIO;
    }
    return DEFAULT_PIXEL_RATIO;
};

const getCanvasLogicalDimensions = (canvas) => {
    if (!canvas) {
        return { width: 0, height: 0, ratio: DEFAULT_PIXEL_RATIO };
    }
    const ratio = getCanvasPixelRatio(canvas);
    const rawWidth = canvas.width || 0;
    const rawHeight = canvas.height || 0;
    return {
        width: Number.isFinite(rawWidth) ? rawWidth / ratio : 0,
        height: Number.isFinite(rawHeight) ? rawHeight / ratio : 0,
        ratio,
    };
};

// Map fractional positions to a centered square artboard of size min(width,height)
const getArtboardMapping = (canvas) => {
    const { width: w, height: h } = getCanvasLogicalDimensions(canvas);
    const size = Math.max(0, Math.min(w, h));
    const offsetX = (w - size) / 2;
    const offsetY = (h - size) / 2;
    return { size, offsetX, offsetY };
};

// Resolve how a layer should map its normalized [0,1] coordinates onto the canvas space.
// - 'bounce' + 'drift' use the full canvas (so movement spans the entire viewport).
// - Other styles use the centered-square artboard (so layouts remain consistent across aspect ratios).
const getLayerCanvasMapping = (canvas, layer) => {
    if (!canvas) {
        return { spanX: 0, spanY: 0, offsetX: 0, offsetY: 0, refSize: 0 };
    }
    const { width: w, height: h } = getCanvasLogicalDimensions(canvas);
    const art = getArtboardMapping(canvas);

    const movementStyle = layer?.movementStyle || 'bounce';
    const usesFullCanvas = (movementStyle === 'drift' || movementStyle === 'bounce');

    const spanX = usesFullCanvas ? w : art.size;
    const spanY = usesFullCanvas ? h : art.size;
    const offsetX = usesFullCanvas ? 0 : art.offsetX;
    const offsetY = usesFullCanvas ? 0 : art.offsetY;
    // Keep size tied to the smaller dimension even when position uses full canvas,
    // so size sliders behave consistently across aspect ratios.
    const refSize = art.size;

    return { spanX, spanY, offsetX, offsetY, refSize };
};

// Helper to convert position between coordinate systems when movementStyle changes
const convertPositionBetweenCoordinateSystems = (layer, canvas, oldMovementStyle) => {
    try {
        if (!layer || !canvas) return layer;
        const pos = layer.position || {};
        const oldStyle = oldMovementStyle || 'bounce';
        const newStyle = layer.movementStyle || 'bounce';

        const oldUsesFullCanvas = (oldStyle === 'drift' || oldStyle === 'bounce');
        const newUsesFullCanvas = (newStyle === 'drift' || newStyle === 'bounce');
        if (oldUsesFullCanvas === newUsesFullCanvas) return layer;

        const { width: w, height: h } = getCanvasLogicalDimensions(canvas);
        const art = getArtboardMapping(canvas);

        const oldSpanX = oldUsesFullCanvas ? w : art.size;
        const oldSpanY = oldUsesFullCanvas ? h : art.size;
        const oldOffsetX = oldUsesFullCanvas ? 0 : art.offsetX;
        const oldOffsetY = oldUsesFullCanvas ? 0 : art.offsetY;

        const newSpanX = newUsesFullCanvas ? w : art.size;
        const newSpanY = newUsesFullCanvas ? h : art.size;
        const newOffsetX = newUsesFullCanvas ? 0 : art.offsetX;
        const newOffsetY = newUsesFullCanvas ? 0 : art.offsetY;

        const x = Number.isFinite(Number(pos.x)) ? Number(pos.x) : 0.5;
        const y = Number.isFinite(Number(pos.y)) ? Number(pos.y) : 0.5;
        const px = oldOffsetX + x * oldSpanX;
        const py = oldOffsetY + y * oldSpanY;

        let nx = newSpanX > 0 ? (px - newOffsetX) / newSpanX : 0.5;
        let ny = newSpanY > 0 ? (py - newOffsetY) / newSpanY : 0.5;

        if (newStyle === 'drift') {
            nx = ((nx % 1) + 1) % 1;
            ny = ((ny % 1) + 1) % 1;
        } else {
            nx = Math.max(0, Math.min(1, nx));
            ny = Math.max(0, Math.min(1, ny));
        }

        const xo = Number(layer.xOffset) || 0;
        const yo = Number(layer.yOffset) || 0;
        const pxo = xo * oldSpanX;
        const pyo = yo * oldSpanY;
        const nxo = newSpanX > 0 ? (pxo / newSpanX) : xo;
        const nyo = newSpanY > 0 ? (pyo / newSpanY) : yo;

        const next = {
            ...layer,
            position: { ...pos, x: nx, y: ny },
            xOffset: nxo,
            yOffset: nyo,
        };

        if (Number.isFinite(Number(layer?.orbitCenterX)) || Number.isFinite(Number(layer?.orbitCenterY))) {
            const ocx = Number.isFinite(Number(layer?.orbitCenterX)) ? Number(layer.orbitCenterX) : 0.5;
            const ocy = Number.isFinite(Number(layer?.orbitCenterY)) ? Number(layer.orbitCenterY) : 0.5;
            const opx = oldOffsetX + ocx * oldSpanX;
            const opy = oldOffsetY + ocy * oldSpanY;
            let nocx = newSpanX > 0 ? (opx - newOffsetX) / newSpanX : ocx;
            let nocy = newSpanY > 0 ? (opy - newOffsetY) / newSpanY : ocy;
            if (newStyle === 'drift') {
                nocx = ((nocx % 1) + 1) % 1;
                nocy = ((nocy % 1) + 1) % 1;
            } else {
                nocx = Math.max(0, Math.min(1, nocx));
                nocy = Math.max(0, Math.min(1, nocy));
            }
            next.orbitCenterX = nocx;
            next.orbitCenterY = nocy;
        }

        return next;
    } catch {
        return layer;
    }
};

const getLayerGeometry = (layer, canvas) => {
    if (!layer || !canvas) return null;
    const { width: _canvasWidth, height: _canvasHeight } = getCanvasLogicalDimensions(canvas);
    const { spanX, spanY, offsetX: artOffsetX, offsetY: artOffsetY, refSize: artSize } = getLayerCanvasMapping(canvas, layer);
    if (spanX <= 0 || spanY <= 0 || artSize <= 0) return null;
    const { position = {} } = layer;
    const { x = 0.5, y = 0.5, scale = 1 } = position;
    // Offsets are relative to the artboard mapping (not the full canvas) so they remain stable
    // across aspect-ratio/layout changes (fullscreen vs timeline layout).
    const offsetXPx = (Number(layer.xOffset) || 0) * spanX;
    const offsetYPx = (Number(layer.yOffset) || 0) * spanY;
    const centerX = artOffsetX + x * spanX + offsetXPx;
    const centerY = artOffsetY + y * spanY + offsetYPx;
    const rfBase = Number(layer?.radiusFactor ?? layer?.baseRadiusFactor ?? 0.4);
    const rfX = Number.isFinite(layer?.radiusFactorX) ? Number(layer.radiusFactorX) : rfBase;
    const rfY = Number.isFinite(layer?.radiusFactorY) ? Number(layer.radiusFactorY) : rfBase;
    const rb = Number(layer?.radiusBump ?? 0);
    const safeScale = Math.max(0, scale);
    const baseRadiusX = Math.max(0, rfX) * artSize * safeScale;
    const baseRadiusY = Math.max(0, rfY) * artSize * safeScale;
    const bump = rb * (artSize * 0.02) * safeScale;
    const rawRadiusX = layer?.viewBoxMapped ? (artSize / 2) * safeScale : Math.max(0, baseRadiusX + bump);
    const rawRadiusY = layer?.viewBoxMapped ? (artSize / 2) * safeScale : Math.max(0, baseRadiusY + bump);
    const radiusX = Math.max(1e-6, rawRadiusX);
    const radiusY = Math.max(1e-6, rawRadiusY);
    const rotDeg = ((((Number(layer?.rotation) || 0) + 180) % 360 + 360) % 360) - 180;
    const rotRad = (rotDeg * Math.PI) / 180;
    return {
        centerX,
        centerY,
        radiusX,
        radiusY,
        sinR: Math.sin(rotRad),
        cosR: Math.cos(rotRad),
        artSize,
        artOffsetX,
        artOffsetY,
        offsetXPx,
        offsetYPx,
        spanX,
        spanY,
    };
};

// --- Shape Drawing Logic (supports node-based shapes) ---
const drawShape = (ctx, layer, canvas, globalSeed, time = 0, _isNodeEditMode = false, globalBlendMode = 'source-over', colorTimeArg = null) => {
    // Destructure properties from the layer and its nested position object
    const {
        numSides: sides,
        curviness,
        wobble = 0.5,
        colors = [],
        numColors,
        selectedColor = 0,
        /*blendMode,*/
        opacity = 1,
        noiseAmount = 0,
        noiseSeed = 1,
        // New parameters from old version
        freq1 = 2,
        freq2 = 3,
        freq3 = 4,
        baseRadiusFactor = 0.4,
        // New: color fading
        colorFadeEnabled = false,
        colorFadeSpeed = 0.0,
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
    const effectiveNoiseAmount = noiseAmount;

    // Precompute frequencies and symmetry factor for noise deformation (shared between node and procedural shapes)
    const actualFreq1 = freq1 + (random() - 0.5) * 3;
    const actualFreq2 = freq2 + (random() - 0.5) * 3;
    const actualFreq3 = freq3 + (random() - 0.5) * 30;
    const amplitudeFactor = Math.max(0, Math.min(1, wobble));
    const symmetryFactor = amplitudeFactor; // preserve existing variable usages

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, Number(opacity)));
    ctx.globalCompositeOperation = globalBlendMode;

    const { width: _canvasWidth, height: _canvasHeight } = getCanvasLogicalDimensions(canvas);
    const { spanX, spanY, offsetX: ax, offsetY: ay, refSize: artSize } = getLayerCanvasMapping(canvas, layer);
    const offsetXPx2 = (Number(layer.xOffset) || 0) * spanX;
    const centerX = ax + x * spanX + offsetXPx2;
    const offsetYPx2 = (Number(layer.yOffset) || 0) * spanY;
    const centerY = ay + y * spanY + offsetYPx2;

    // Radius mapping (fully relative): use radiusFactor against reference artboard size
    const minWH = artSize;
    const rfBase = Number(layer?.radiusFactor ?? baseRadiusFactor ?? 0.4);
    const rfX = Number.isFinite(layer?.radiusFactorX) ? Number(layer.radiusFactorX) : rfBase;
    const rfY = Number.isFinite(layer?.radiusFactorY) ? Number(layer.radiusFactorY) : rfBase;
    const rb = Number(layer?.radiusBump ?? 0);
    const baseRadiusX = Math.max(0, rfX) * minWH * Math.max(0, scale);
    const baseRadiusY = Math.max(0, rfY) * minWH * Math.max(0, scale);
    // radiusBump contributes an additional small fraction of canvas size (2% per unit)
    const bump = rb * (minWH * 0.02) * Math.max(0, scale);
    // Remove artificial 0.4*minWH clamp so Size X/Y sliders can use full configured range
    // Use artboard size for viewBoxMapped as well to keep size tied to the same reference as position
    const radiusX = layer?.viewBoxMapped ? (artSize / 2) * scale : Math.max(0, baseRadiusX + bump);
    const radiusY = layer?.viewBoxMapped ? (artSize / 2) * scale : Math.max(0, baseRadiusY + bump);

    // Defensive check for non-finite values
    if (!Number.isFinite(radiusX) || !Number.isFinite(radiusY) || !Number.isFinite(centerX) || !Number.isFinite(centerY)) {
        // Skip draw on invalid radius
        ctx.restore();
        return;
    }

    ctx.beginPath();

    let points = [];
    let usedNodes = false;
    const subpathStyles = Array.isArray(layer?.subpathStyles) ? layer.subpathStyles : null;
    const hasStyledSubpaths = Array.isArray(subpathStyles)
        ? subpathStyles.some(style => style && (style.fill || style.stroke))
        : false;
    const baseLayerAlpha = ctx.globalAlpha;

    // Allow rotation in range [-180,180]; treat values outside by modulo 360
    let rotDeg = Number(layer.rotation) || 0;
    // normalize to [-180,180]
    rotDeg = ((((rotDeg + 180) % 360) + 360) % 360) - 180;
    const rotRad = (rotDeg * Math.PI) / 180;
    const sinR = Math.sin(rotRad);
    const cosR = Math.cos(rotRad);

    const buildDeformedPoints = (nodes) => nodes.map((n, i) => {
        // Apply anisotropic scaling first, then rotate (correct order): R * S * p
        const sx = n.x * radiusX;
        const sy = n.y * radiusY;
        const tx = sx * cosR - sy * sinR;
        const ty = sx * sinR + sy * cosR;
        const baseX = centerX + tx;
        const baseY = centerY + ty;
        const angle = (i / nodes.length) * Math.PI * 2;
        const phase = (1 - symmetryFactor) * (i % 2) * Math.PI;
        const n1 = Math.sin(angle * actualFreq1 + time + phase) * Math.sin(time * 0.8 * amplitudeFactor);
        const n2 = Math.cos(angle * actualFreq2 - time * 0.5 + phase) * Math.cos(time * 0.3 * amplitudeFactor);
        const n3 = Math.sin(angle * actualFreq3 + time * 1.5 + phase) * Math.sin(time * 0.6 * amplitudeFactor);
        // Canvas-relative deformation
        const NOISE_BASE = Math.max(radiusX, radiusY) * 0.075; // 7.5% of current radius
        const offset = (n1 * 1 + n2 * 0.75 + n3 * 0.5) * NOISE_BASE * effectiveNoiseAmount * amplitudeFactor;
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
        };
    };

    // Use explicit nodes whenever present so edits persist after exiting node mode
    if (Array.isArray(layer.subpaths) && layer.subpaths.length > 0) {
        usedNodes = true;
        const t = Math.max(0, Math.min(1, (curviness ?? 0)));

        if (hasStyledSubpaths) {
            const rawSubpaths = Array.isArray(layer.subpaths) ? layer.subpaths : [];
            const deformedSubpaths = rawSubpaths.map(sp => (Array.isArray(sp) && sp.length >= 3) ? buildDeformedPoints(sp) : null);
            const resolvedGroups = Array.isArray(layer.subpathGroups) && layer.subpathGroups.length > 0
                ? layer.subpathGroups
                : rawSubpaths.map((_, idx) => ({
                    id: `subpath_${idx}`,
                    fillRule: (subpathStyles?.[idx]?.fillRule || '').toLowerCase() === 'evenodd' ? 'evenodd' : 'nonzero',
                    indices: [idx],
                }));

            resolvedGroups.forEach(group => {
                const indices = Array.isArray(group?.indices)
                    ? group.indices.filter(i => Number.isInteger(i) && i >= 0 && i < deformedSubpaths.length)
                    : [];
                if (!indices.length) return;

                const primaryIdx = indices[0];
                const style = subpathStyles?.[primaryIdx] || null;
                const wantsFill = !(style?.fillSpecified && style?.fillIsNone);
                const fillOpacity = style?.fillOpacity != null
                    ? Math.max(0, Math.min(1, style.fillOpacity))
                    : 1;
                const styleOpacity = style?.opacity != null
                    ? Math.max(0, Math.min(1, style.opacity))
                    : 1;
                const effectiveFillAlpha = Math.max(0, Math.min(1, baseLayerAlpha * styleOpacity * fillOpacity));
                let fillColor = null;
                if (wantsFill) {
                    if (style?.fill) {
                        fillColor = style.fill;
                    } else if (Array.isArray(colors) && colors.length > 0) {
                        fillColor = colors[Math.min(primaryIdx, colors.length - 1)];
                    }
                }

                if (fillColor && effectiveFillAlpha > 0) {
                    ctx.save();
                    ctx.globalCompositeOperation = 'source-over';
                    ctx.globalAlpha = effectiveFillAlpha;
                    ctx.fillStyle = fillColor;
                    ctx.beginPath();
                    indices.forEach(idx => {
                        const pts = deformedSubpaths[idx];
                        if (!pts || pts.length < 3) return;
                        drawSmoothClosed(pts, t);
                    });
                    if ((group?.fillRule || '').toLowerCase() === 'evenodd') {
                        ctx.fill('evenodd');
                    } else {
                        ctx.fill();
                    }
                    ctx.restore();
                }
            });

            rawSubpaths.forEach((sp, idx) => {
                const pts = deformedSubpaths[idx];
                if (!pts || pts.length < 3) return;
                const style = subpathStyles?.[idx] || null;
                const wantsStroke = style?.stroke && !(style.strokeSpecified && style.strokeIsNone);
                if (!wantsStroke) return;

                const styleOpacity = style?.opacity != null
                    ? Math.max(0, Math.min(1, style.opacity))
                    : 1;
                const strokeOpacity = style?.strokeOpacity != null
                    ? Math.max(0, Math.min(1, style.strokeOpacity))
                    : 1;
                const effectiveStrokeAlpha = Math.max(0, Math.min(1, baseLayerAlpha * styleOpacity * strokeOpacity));
                if (effectiveStrokeAlpha <= 0) return;

                ctx.save();
                ctx.globalCompositeOperation = 'source-over';
                ctx.globalAlpha = effectiveStrokeAlpha;
                ctx.strokeStyle = style.stroke;
                const strokeWidth = Number.isFinite(style.strokeWidth)
                    ? Math.max(0.5, style.strokeWidth)
                    : 1;
                ctx.lineWidth = strokeWidth;
                ctx.beginPath();
                drawSmoothClosed(pts, t);
                ctx.stroke();
                ctx.restore();
            });

            ctx.restore();
            return;
        }

        // No styled subpaths: fall back to gradient fill across merged points
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
            // Build base ellipse point, then rotate by layer rotation (R * S * v)
            const angle = (i / sides) * Math.PI * 2;

            // Phase offset for symmetry control (from old version)
            const phase = (1 - symmetryFactor) * (i % 2) * Math.PI;

            // Multi-layered noise
            const n1 = Math.sin(angle * actualFreq1 + time + phase) * Math.sin(time * 0.8 * amplitudeFactor);
            const n2 = Math.cos(angle * actualFreq2 - time * 0.5 + phase) * Math.cos(time * 0.3 * amplitudeFactor);
            const n3 = Math.sin(angle * actualFreq3 + time * 1.5 + phase) * Math.sin(time * 0.6 * amplitudeFactor);

            // Apply noise to radius in radial direction
            const NOISE_BASE = Math.max(radiusX, radiusY) * 0.075;
            const offset = (n1 * 1 + n2 * 0.75 + n3 * 0.5) * NOISE_BASE * effectiveNoiseAmount * amplitudeFactor;
            
            // Base position on circle/ellipse (scale then rotate)
            const sx = Math.cos(angle) * radiusX;
            const sy = Math.sin(angle) * radiusY;
            const rx2 = sx * cosR - sy * sinR;
            const ry2 = sx * sinR + sy * cosR;
            const baseX = centerX + rx2;
            const baseY = centerY + ry2;
            
            // Apply offset in radial direction from center
            const dx = baseX - centerX;
            const dy = baseY - centerY;
            const dist = Math.hypot(dx, dy) || 1;
            const normX = dx / dist;
            const normY = dy / dist;
            const px = baseX + normX * offset;
            const py = baseY + normY * offset;

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
        // Apply curviness smoothing to procedural shapes as well
        if (points.length >= 2) {
            const t = Math.max(0, Math.min(1, (curviness ?? 0)));
            drawSmoothClosed(points, t);
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

    const paletteStops = Array.isArray(colors) ? colors : [];
    const requestedColors = Number.isFinite(Number(numColors))
        ? Math.max(1, Math.round(Number(numColors)))
        : paletteStops.length;

    // Color fill: if animating colours, fill with a single blended colour (no gradient)
    // Otherwise, use the existing radial gradient from the palette.
    const baseStops = (paletteStops.length >= 2)
        ? paletteStops
        : (paletteStops.length === 1 ? [paletteStops[0], paletteStops[0]] : ['#000000', '#000000']);

    if (colorFadeEnabled && baseStops.length >= 2 && (Number(colorFadeSpeed) || 0) > 0) {
        const n = baseStops.length;
        const speed = Math.max(0, Number(colorFadeSpeed) || 0);
        const ct = (colorTimeArg != null ? colorTimeArg : time) || 0;
        const s = ct * speed; // colours per second
        const i0 = ((Math.floor(s) % n) + n) % n;
        const i1 = (i0 + 1) % n;
        const t = s - Math.floor(s);
        const a = hexToRgb(baseStops[i0] || '#000000');
        const b = hexToRgb(baseStops[i1] || '#000000');
        const r = a.r + (b.r - a.r) * t;
        const g = a.g + (b.g - a.g) * t;
        const b2 = a.b + (b.b - a.b) * t;
        ctx.fillStyle = rgbToHex({ r, g, b: b2 });
        ctx.fill();
        ctx.restore();
        return;
    }

    // Respect "Num Colours": when it's 1, render a solid fill (even if paletteStops contains a full palette).
    if (requestedColors <= 1) {
        const idx = Math.max(0, Math.min(paletteStops.length - 1, Math.round(Number(selectedColor) || 0)));
        const solid = paletteStops[idx] || paletteStops[0] || '#000000';
        ctx.fillStyle = solid;
        ctx.fill();
        ctx.restore();
        return;
    }

    // For gradients, use only the requested number of palette stops.
    const gradientStops = baseStops.slice(0, Math.max(2, requestedColors));

    // Non-animated: use gradient between palette stops
    const safeGX = Number.isFinite(gCenterX) ? gCenterX : centerX;
    const safeGY = Number.isFinite(gCenterY) ? gCenterY : centerY;
    const safeGR = Number.isFinite(gRadius) && gRadius > 0 ? gRadius : Math.max(1, Math.max(radiusX, radiusY));
    const gradient = ctx.createRadialGradient(
        safeGX, safeGY, 0,
        safeGX, safeGY, safeGR
    );
    const denom = (gradientStops.length - 1) || 1;
    for (let i = 0; i < gradientStops.length; i++) {
        gradient.addColorStop(i / denom, gradientStops[i]);
    }
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.restore();
};

const ZERO_WRAP_OFFSET = { ox: 0, oy: 0 };

const applyWrapToPoints = (points, wrap) => {
    if (!Array.isArray(points) || points.length === 0 || !wrap || (wrap.ox === 0 && wrap.oy === 0)) {
        return points || [];
    }
    return points.map(p => ({ x: p.x + wrap.ox, y: p.y + wrap.oy }));
};

const resolveDriftWrapOffset = (layer, canvas, basePoints, baseCenterX, baseCenterY) => {
    if (!layer || layer?.movementStyle !== 'drift' || !canvas) return ZERO_WRAP_OFFSET;
    const { width: canvasWidth, height: canvasHeight } = getCanvasLogicalDimensions(canvas);
    if (!(canvasWidth > 0) || !(canvasHeight > 0)) return ZERO_WRAP_OFFSET;

    // Wrap in the same coordinate system used for rendering this layer.
    const { spanX, spanY, offsetX: ax, offsetY: ay } = getLayerCanvasMapping(canvas, layer);
    const left = ax;
    const right = ax + spanX;
    const top = ay;
    const bottom = ay + spanY;

    const extentInfo = estimateLayerHalfExtents(layer, canvas, { renderedPoints: basePoints });
    const negX = extentInfo.extentsX?.neg ?? extentInfo.rx;
    const posX = extentInfo.extentsX?.pos ?? extentInfo.rx;
    const negY = extentInfo.extentsY?.neg ?? extentInfo.ry;
    const posY = extentInfo.extentsY?.pos ?? extentInfo.ry;

    const offsetsX = [0];
    const offsetsY = [0];
    // Determine which neighbor offsets are needed based on canvas bounds.
    if ((baseCenterX - negX) < left) offsetsX.push(spanX);
    if ((baseCenterX + posX) > right) offsetsX.push(-spanX);
    if ((baseCenterY - negY) < top) offsetsY.push(spanY);
    if ((baseCenterY + posY) > bottom) offsetsY.push(-spanY);

    const combos = [];
    offsetsY.forEach(oy => {
        offsetsX.forEach(ox => {
            if (!combos.some(c => c.ox === ox && c.oy === oy)) {
                combos.push({ ox, oy });
            }
        });
    });

    const hasPoints = Array.isArray(basePoints) && basePoints.length > 0;
    if (hasPoints) {
        for (const combo of combos) {
            let minX = Infinity;
            let maxX = -Infinity;
            let minY = Infinity;
            let maxY = -Infinity;
            for (const p of basePoints) {
                const px = p.x + combo.ox;
                const py = p.y + combo.oy;
                if (px < minX) minX = px;
                if (px > maxX) maxX = px;
                if (py < minY) minY = py;
                if (py > maxY) maxY = py;
            }
            if (maxX >= 0 && minX <= canvasWidth && maxY >= 0 && minY <= canvasHeight) {
                return combo;
            }
        }
    }

    for (const combo of combos) {
        const cx = baseCenterX + combo.ox;
        const cy = baseCenterY + combo.oy;
        if (cx >= 0 && cx <= canvasWidth && cy >= 0 && cy <= canvasHeight) {
            return combo;
        }
    }

    return ZERO_WRAP_OFFSET;
};

// Back-compat wrapper used by legacy hit-testing logic (takes fewer args)
const getDriftWrapOffset = (layer, canvas, options = {}) => {
    if (!layer || layer?.movementStyle !== 'drift' || !canvas) return ZERO_WRAP_OFFSET;
    const { basePoints = null, baseCenterX = null, baseCenterY = null } = options || {};
    let points = basePoints;
    let centerX = baseCenterX;
    let centerY = baseCenterY;

    if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) {
        const geometry = getLayerGeometry(layer, canvas);
        if (!geometry) return ZERO_WRAP_OFFSET;
        centerX = geometry.centerX;
        centerY = geometry.centerY;
        if (!Array.isArray(points)) {
            points = buildBaseNodePoints(layer, geometry, null);
        }
    }

    return resolveDriftWrapOffset(layer, canvas, points, centerX, centerY);
};

const buildBaseNodePoints = (layer, geometry, renderedPoints) => {
    if (!layer || !geometry || !Array.isArray(layer.nodes) || layer.nodes.length === 0) {
        return [];
    }
    if (Array.isArray(renderedPoints) && renderedPoints.length === layer.nodes.length) {
        return renderedPoints;
    }
    const {
        centerX,
        centerY,
        radiusX,
        radiusY,
        sinR,
        cosR,
    } = geometry;
    return layer.nodes.map((n) => ({
        x: centerX + (n.x * cosR - n.y * sinR) * radiusX,
        y: centerY + (n.x * sinR + n.y * cosR) * radiusY,
    }));
};

// Estimate half-extents of the drawn content for a layer in pixels
const buildExtentResult = (rx, ry, extra = {}) => {
    const safeRX = Math.max(0, Number(rx) || 0);
    const safeRY = Math.max(0, Number(ry) || 0);
    const extentsX = extra.extentsX || { pos: safeRX, neg: safeRX };
    const extentsY = extra.extentsY || { pos: safeRY, neg: safeRY };
    return { rx: safeRX, ry: safeRY, extentsX, extentsY };
};

export const estimateLayerHalfExtents = (layer, canvas, opts = {}) => {
    try {
        const { spanX, spanY, offsetX: ax, offsetY: ay, refSize: minWH } = getLayerCanvasMapping(canvas, layer);
        const scale = Number(layer?.position?.scale ?? 1);
        const { x = 0.5, y = 0.5 } = layer?.position || {};
        const offsetXPx = (Number(layer?.xOffset) || 0) * spanX;
        const offsetYPx = (Number(layer?.yOffset) || 0) * spanY;
        const centerX = ax + x * spanX + offsetXPx;
        const centerY = ay + y * spanY + offsetYPx;
        if (layer?.image?.src) {
            const cache = imageCache.get(layer.image.src);
            const img = cache?.img;
            const iw = (img?.naturalWidth || img?.width || 0) * scale;
            const ih = (img?.naturalHeight || img?.height || 0) * scale;
            return buildExtentResult(iw / 2, ih / 2);
        }

        const points = Array.isArray(opts?.renderedPoints) ? opts.renderedPoints : null;
        if (points && points.length >= 3) {
            let maxPosX = 0, maxNegX = 0;
            let maxPosY = 0, maxNegY = 0;
            for (const p of points) {
                const px = Number(p?.x);
                const py = Number(p?.y);
                if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
                const dx = px - centerX;
                const dy = py - centerY;
                if (dx >= 0) {
                    if (dx > maxPosX) maxPosX = dx;
                } else {
                    if (-dx > maxNegX) maxNegX = -dx;
                }
                if (dy >= 0) {
                    if (dy > maxPosY) maxPosY = dy;
                } else {
                    if (-dy > maxNegY) maxNegY = -dy;
                }
            }
            const rx = Math.max(maxPosX, maxNegX);
            const ry = Math.max(maxPosY, maxNegY);
            if (Number.isFinite(rx) && Number.isFinite(ry)) {
                return buildExtentResult(rx, ry, {
                    extentsX: { pos: maxPosX, neg: maxNegX },
                    extentsY: { pos: maxPosY, neg: maxNegY },
                });
            }
        }

        const rfBase = Number(layer?.radiusFactor ?? layer?.baseRadiusFactor ?? 0.4);
        const rfX = Number.isFinite(layer?.radiusFactorX) ? Number(layer.radiusFactorX) : rfBase;
        const rfY = Number.isFinite(layer?.radiusFactorY) ? Number(layer.radiusFactorY) : rfBase;
        const rb = Number(layer?.radiusBump ?? 0);
        const baseRadiusX = Math.max(0, rfX) * minWH * Math.max(0, scale);
        const baseRadiusY = Math.max(0, rfY) * minWH * Math.max(0, scale);
        const bump = rb * (minWH * 0.02) * Math.max(0, scale);
        const radiusX = layer?.viewBoxMapped ? (minWH / 2) * Math.max(0, scale) : Math.max(0, baseRadiusX + bump);
        const radiusY = layer?.viewBoxMapped ? (minWH / 2) * Math.max(0, scale) : Math.max(0, baseRadiusY + bump);
        return buildExtentResult(radiusX, radiusY);
    } catch {
        return buildExtentResult(0, 0);
    }
};

// Draw a layer with toroidal wrapping for 'drift' movement
const drawLayerWithWrap = (ctx, layer, canvas, drawFn, args = [], opts = {}) => {
    const { width: canvasWidth, height: canvasHeight } = getCanvasLogicalDimensions(canvas);
    const w = canvasWidth;
    const h = canvasHeight;
    // Only wrap when drifting; otherwise a single draw is sufficient
    const isDrift = (layer?.movementStyle === 'drift');
    if (!isDrift) {
        drawFn(ctx, layer, canvas, ...args);
        return;
    }

    const { x = 0.5, y = 0.5 } = layer?.position || {};
    const { spanX, spanY, offsetX: ax, offsetY: ay } = getLayerCanvasMapping(canvas, layer);
    const offsetXPx = (Number(layer.xOffset) || 0) * spanX;
    const offsetYPx = (Number(layer.yOffset) || 0) * spanY;
    const cx = ax + x * spanX + offsetXPx;
    const cy = ay + y * spanY + offsetYPx;
    const extentInfo = estimateLayerHalfExtents(layer, canvas, { renderedPoints: opts?.renderedPoints });
    const rx = extentInfo.rx;
    const ry = extentInfo.ry;
    const posX = extentInfo.extentsX?.pos ?? rx;
    const negX = extentInfo.extentsX?.neg ?? rx;
    const posY = extentInfo.extentsY?.pos ?? ry;
    const negY = extentInfo.extentsY?.neg ?? ry;

    // Determine which neighbor offsets are needed
    // Wrap within the same coordinate mapping used for this layer (ax..ax+spanX etc).
    const offsetsX = [0];
    const offsetsY = [0];
    const left = ax;
    const right = ax + spanX;
    const top = ay;
    const bottom = ay + spanY;

    // Check if shape extends beyond canvas boundaries and needs wrapping
    if (cx - negX < left) offsetsX.push(spanX);      // needs +spanX copy (wrap from left to right)
    if (cx + posX > right) offsetsX.push(-spanX);    // needs -spanX copy (wrap from right to left)
    if (cy - negY < top) offsetsY.push(spanY);       // needs +spanY copy (wrap from top to bottom)
    if (cy + posY > bottom) offsetsY.push(-spanY);   // needs -spanY copy (wrap from bottom to top)

    if (typeof window !== 'undefined' && window.__artapp_debug_wrap) {
        const copies = offsetsX.length * offsetsY.length;
        if (copies > 1) {
            const key = layer?.id || layer?.name || 'layer';
            const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
            const last = wrapDebugLastLogMsByLayerId.get(key) || 0;
            if (now - last > 1000) {
                wrapDebugLastLogMsByLayerId.set(key, now);
                console.log('[wrap-debug] drawing wrapped copies', {
                    id: layer?.id,
                    name: layer?.name,
                    movementStyle: layer?.movementStyle,
                    copies,
                    offsetsX,
                    offsetsY,
                    x,
                    y,
                    center: { cx, cy },
                    extents: { posX, negX, posY, negY },
                    bounds: { left, right, top, bottom, spanX, spanY, w, h },
                });
            }
        }
    }

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

    const { width: _canvasWidth, height: _canvasHeight } = getCanvasLogicalDimensions(canvas);

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

    const { spanX, spanY, offsetX: ax, offsetY: ay } = getLayerCanvasMapping(canvas, layer);
    const offsetXPx2 = (Number(layer.xOffset) || 0) * spanX;
    const centerX = ax + x * spanX + offsetXPx2;
    const offsetYPx2 = (Number(layer.yOffset) || 0) * spanY;
    const centerY = ay + y * spanY + offsetYPx2;
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

// Compute deformed node points exactly like drawShape's node path, so handles align.
// Uses same seeded randomization for frequencies to avoid drift when noise is high.
export const computeDeformedNodePoints = (layer, canvas, globalSeedBase, time) => {
    try {
        if (!layer || !Array.isArray(layer.nodes) || layer.nodes.length < 3) return [];
        const { x, y, scale } = layer.position || { x: 0.5, y: 0.5, scale: 1 };
        const { spanX, spanY, offsetX: ax, offsetY: ay, refSize: artSize } = getLayerCanvasMapping(canvas, layer);
        const minWH = artSize;
        const offsetXPx2 = (Number(layer.xOffset) || 0) * spanX;
        const centerX = ax + x * spanX + offsetXPx2;
        const offsetYPx2 = (Number(layer.yOffset) || 0) * spanY;
        const centerY = ay + y * spanY + offsetYPx2;
        const rfBase = Number(layer.radiusFactor ?? layer.baseRadiusFactor ?? 0.4);
        const rfX = Number.isFinite(layer.radiusFactorX) ? Number(layer.radiusFactorX) : rfBase;
        const rfY = Number.isFinite(layer.radiusFactorY) ? Number(layer.radiusFactorY) : rfBase;
        const rb = Number(layer.radiusBump ?? 0);
        const baseRadiusX = Math.max(0, rfX) * minWH * Math.max(0, scale);
        const baseRadiusY = Math.max(0, rfY) * minWH * Math.max(0, scale);
        const bump = rb * (minWH * 0.02) * Math.max(0, scale);
        const radiusX = layer.viewBoxMapped ? (artSize / 2) * scale : Math.max(0, baseRadiusX + bump);
        const radiusY = layer.viewBoxMapped ? (artSize / 2) * scale : Math.max(0, baseRadiusY + bump);

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
            // scale then rotate: base = center + R * (S * n)
            const sx = n.x * radiusX;
            const sy = n.y * radiusY;
            const tx = sx * cosR - sy * sinR;
            const ty = sx * sinR + sy * cosR;
            const baseX = centerX + tx;
            const baseY = centerY + ty;
            const angle = (i / count) * Math.PI * 2;
            const phase = (1 - symmetryFactor) * (i % 2) * Math.PI;
            const n1 = Math.sin(angle * actualFreq1 + time + phase) * Math.sin(time * 0.8 * amplitudeFactor);
            const n2 = Math.cos(angle * actualFreq2 - time * 0.5 + phase) * Math.cos(time * 0.3 * amplitudeFactor);
            const n3 = Math.sin(angle * actualFreq3 + time * 1.5 + phase) * Math.sin(time * 0.6 * amplitudeFactor);
            const NOISE_BASE = Math.max(radiusX, radiusY) * 0.075;
            const offset = (n1 * 1 + n2 * 0.75 + n3 * 0.5) * NOISE_BASE * noiseAmount * amplitudeFactor;
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

// Build a Path2D that approximates the rendered footprint of a layer for hit-testing
const buildLayerHitPath = (layer, canvas, { renderedPoints = null, globalSeed = 0, time = 0 } = {}) => {
    const path = new Path2D();
    if (!layer || !canvas || !layer.position || !layer.visible) return path;

    const { x = 0.5, y = 0.5, scale = 1 } = layer.position || {};
    const { spanX, spanY, offsetX: ax, offsetY: ay, refSize: artSize } = getLayerCanvasMapping(canvas, layer);
    const offsetXPx2 = (Number(layer.xOffset) || 0) * spanX;
    const centerX = ax + x * spanX + offsetXPx2;
    const offsetYPx2 = (Number(layer.yOffset) || 0) * spanY;
    const centerY = ay + y * spanY + offsetYPx2;
    const minWH = artSize;
    const rfBase = Number(layer?.radiusFactor ?? layer?.baseRadiusFactor ?? 0.4);
    const rfX = Number.isFinite(layer?.radiusFactorX) ? Number(layer.radiusFactorX) : rfBase;
    const rfY = Number.isFinite(layer?.radiusFactorY) ? Number(layer.radiusFactorY) : rfBase;
    const rb = Number(layer?.radiusBump ?? 0);
    const safeScale = Math.max(0, scale);
    const baseRadiusX = Math.max(0, rfX) * minWH * safeScale;
    const baseRadiusY = Math.max(0, rfY) * minWH * safeScale;
    const bump = rb * (minWH * 0.02) * safeScale;
    const radiusX = layer?.viewBoxMapped ? (artSize / 2) * safeScale : Math.max(0, baseRadiusX + bump);
    const radiusY = layer?.viewBoxMapped ? (artSize / 2) * safeScale : Math.max(0, baseRadiusY + bump);

    const rotDeg = ((((Number(layer?.rotation) || 0) + 180) % 360 + 360) % 360) - 180;
    const rotRad = (rotDeg * Math.PI) / 180;
    const sinR = Math.sin(rotRad);
    const cosR = Math.cos(rotRad);
    const geometry = { centerX, centerY, radiusX, radiusY, sinR, cosR };

    let nodePoints = null;
    if (Array.isArray(layer.nodes) && layer.nodes.length >= 3) {
        if (Array.isArray(renderedPoints) && renderedPoints.length >= 3) {
            nodePoints = renderedPoints;
        } else {
            const computed = computeDeformedNodePoints(layer, canvas, globalSeed, time);
            if (Array.isArray(computed) && computed.length >= 3) {
                nodePoints = computed;
            }
        }
    }

    let basePoints = null;
    if (Array.isArray(nodePoints) && nodePoints.length >= 3) {
        basePoints = nodePoints;
    } else if (Array.isArray(layer.nodes) && layer.nodes.length >= 3) {
        basePoints = buildBaseNodePoints(layer, geometry, renderedPoints);
    }

    const wrapOffset = resolveDriftWrapOffset(layer, canvas, basePoints, geometry.centerX, geometry.centerY);
    const wrapOx = wrapOffset.ox;
    const wrapOy = wrapOffset.oy;

    const writePolygon = (pts) => {
        if (!Array.isArray(pts) || pts.length < 3) return;
        path.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
            path.lineTo(pts[i].x, pts[i].y);
        }
        path.closePath();
    };

    if (Array.isArray(layer.subpaths) && layer.subpaths.length > 0) {
        for (const sub of layer.subpaths) {
            if (!Array.isArray(sub) || sub.length < 3) continue;
            const pts = sub.map((n) => {
                // scale then rotate for node-based shapes
                const sx = n.x * radiusX;
                const sy = n.y * radiusY;
                const tx = sx * cosR - sy * sinR;
                const ty = sx * sinR + sy * cosR;
                return {
                    x: centerX + wrapOx + tx,
                    y: centerY + wrapOy + ty,
                };
            });
            writePolygon(pts);
        }
        return path;
    }

    if (Array.isArray(layer.nodes) && layer.nodes.length >= 3) {
        let pts = nodePoints;
        if (!Array.isArray(pts) || pts.length < 3) {
            pts = buildBaseNodePoints(layer, geometry, renderedPoints);
        }
        writePolygon(applyWrapToPoints(pts, wrapOffset));
        return path;
    }

    const sides = Number(layer?.numSides);
    const count = Number.isFinite(sides) ? Math.max(3, Math.floor(sides)) : 0;
    if (!count) {
        path.ellipse(centerX + wrapOx, centerY + wrapOy, Math.max(1, radiusX), Math.max(1, radiusY), rotRad, 0, Math.PI * 2);
        path.closePath();
        return path;
    }
    const pts = [];
    for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        // scale then rotate
        const sx = Math.cos(angle) * radiusX;
        const sy = Math.sin(angle) * radiusY;
        const tx = sx * cosR - sy * sinR;
        const ty = sx * sinR + sy * cosR;
        pts.push({
            x: centerX + wrapOx + tx,
            y: centerY + wrapOy + ty,
        });
    }
    writePolygon(pts);
    return path;
};

// --- Canvas Component ---
const Canvas = forwardRef(({
    layers,
    layersRef,
    overlayLayersRef,
    renderOverlayLayers = true,
    hideLayerIndex = -1,
    hideLayerId = null,
    backgroundColor,
    globalSeed,
    globalBlendMode,
    isNodeEditMode,
    isFrozen = false,
    colorFadeWhileFrozen = true,
    selectedLayerIndex,
    setLayers,
    setSelectedLayerIndex,
    classicMode = false,
    isolateMode = false,
    getActiveTargetLayerIds: getActiveTargetLayerIdsProp,
}, ref) => {
    const {
        toggleLayerSelection,
        selectedLayerIds: selectedLayerIdsCtx,
        clearSelection,
        setEditTarget,
        getActiveTargetLayerIds: getActiveTargetLayerIdsCtx,
        showLayerOutlines,
    } = useAppState() || {};

    const getActiveTargetLayerIdsLatest = useMemo(() => {
        if (typeof getActiveTargetLayerIdsProp === 'function') return getActiveTargetLayerIdsProp;
        if (typeof getActiveTargetLayerIdsCtx === 'function') return getActiveTargetLayerIdsCtx;
        return null;
    }, [getActiveTargetLayerIdsProp, getActiveTargetLayerIdsCtx]);

    const isolateIdSet = useMemo(() => {
        if (!isolateMode) return null;
        let ids = [];
        if (typeof getActiveTargetLayerIdsLatest === 'function') {
            try {
                const got = getActiveTargetLayerIdsLatest();
                if (Array.isArray(got)) ids = got;
            } catch {
                ids = [];
            }
        }
        if (!Array.isArray(ids) || ids.length === 0) {
            const idx = Math.max(0, Math.min(Number.isFinite(selectedLayerIndex) ? selectedLayerIndex : 0, Math.max(0, layers.length - 1)));
            const fallback = layers[idx];
            if (fallback?.id) {
                ids = [fallback.id];
            }
        }
        if (!Array.isArray(ids) || ids.length === 0) return new Set();
        const set = new Set();
        ids.forEach(id => { if (id) set.add(id); });
        return set;
    }, [isolateMode, getActiveTargetLayerIdsLatest, layers, selectedLayerIndex]);

    const isLayerVisible = useCallback((layer) => {
        if (!isolateMode) return true;
        if (!isolateIdSet || isolateIdSet.size === 0) return true;
        return isolateIdSet.has(layer?.id);
    }, [isolateMode, isolateIdSet]);
    const localCanvasRef = useRef(null);
    const frozenTimeRef = useRef(0);
    // Align wall-time colour fade with accumulated animation time to avoid jumps when freezing/unfreezing
    const colorWallOffsetRef = useRef(0);
    const layerHashesRef = useRef(new Map());
    const backgroundHashRef = useRef('');
    const draggingNodeIndexRef = useRef(null);
    const draggingMidIndexRef = useRef(null);
    const draggingCenterRef = useRef(false);
    const draggingOrbitCenterRef = useRef(false);
    // Cache original nodes during node-edit numSides changes so we can restore when coming back
    const nodesCacheRef = useRef(new Map()); // key: selectedLayerIndex -> nodes array snapshot
    const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0, pixelRatio: DEFAULT_PIXEL_RATIO });
    // Drive re-render for color fade while frozen so colours visibly animate
    const [, setColorTick] = useState(0);
    // Accumulated animation time (seconds), advances only when not frozen
    const animationTimeRef = useRef(0);
    const lastTimeStampRef = useRef(null);
    // Node-edit undo/redo history (keep last 5 snapshots for the active layer)
    const historyRef = useRef({ stack: [], index: -1, layerIndex: -1 });
    const draggingKindRef = useRef(null); // 'node' | 'mid' | null
    const gestureRef = useRef(null);
    const dragStartOffsetRef = useRef({ normX: 0, normY: 0 }); // offset from layer center when drag starts
    const pendingDragUpdateRef = useRef(null); // batched drag update
    const dragUpdateRafRef = useRef(null); // RAF handle for batched updates
    const [, setHistoryTick] = useState(0); // trigger re-render when history changes
    const modeHashRef = useRef({ isNodeEditMode: false, selectedLayerIndex: -1 });
    const lastSlowRenderLogRef = useRef(0); // throttle repeated slow-render warnings
    const targetFpsRef = useRef(60);
    const lastRenderMsRef = useRef(0);
    useEffect(() => {
        targetFpsRef.current = getCanvasFps();
        return subscribeCanvasFps((fps) => {
            targetFpsRef.current = fps;
        });
    }, []);

    const clearDragState = () => {
        draggingNodeIndexRef.current = null;
        draggingMidIndexRef.current = null;
        draggingCenterRef.current = false;
        draggingOrbitCenterRef.current = false;
        draggingKindRef.current = null;
        gestureRef.current = null;
        dragStartOffsetRef.current = { normX: 0, normY: 0 };
        pendingDragUpdateRef.current = null;
        if (dragUpdateRafRef.current) {
            cancelAnimationFrame(dragUpdateRafRef.current);
            dragUpdateRafRef.current = null;
        }
    };
    // Track previous layer count to force a redraw when layers are added/removed via slider
    const prevLayersCountRef = useRef(layers.length);

    // Cache of last rendered edge-points per layer index
    const renderedPointsRef = useRef(new Map()); // Map<number, Array<{x,y}>>

    useEffect(() => {
        const canvasEl = localCanvasRef.current;
        if (!canvasEl) return;

        const flagged = [];
        layers.forEach((layer, index) => {
            if (layer?._coordinateSystemChanged) {
                flagged.push({ index, oldStyle: layer._previousMovementStyle });
            }
        });

        if (!flagged.length) return;

        const oldStyleByIndex = new Map(flagged.map(({ index, oldStyle }) => [index, oldStyle]));

        setLayers(prev => {
            let mutated = false;
            const next = prev.map((layer, index) => {
                if (!layer?._coordinateSystemChanged) {
                    return layer;
                }

                const oldStyle = oldStyleByIndex.has(index)
                    ? oldStyleByIndex.get(index)
                    : layer._previousMovementStyle;

                const converted = convertPositionBetweenCoordinateSystems(layer, canvasEl, oldStyle || 'bounce');
                let baseLayer = (converted === layer) ? { ...layer } : { ...converted };

                if (baseLayer.position) {
                    baseLayer = { ...baseLayer, position: { ...baseLayer.position } };
                }

                const { _coordinateSystemChanged: _ignoreFlag, _previousMovementStyle: _ignorePrev, ...cleanedLayer } = baseLayer;
                mutated = mutated || cleanedLayer !== prev[index];
                return cleanedLayer;
            });

            return mutated ? next : prev;
        });
    }, [layers, setLayers, canvasSize]);

    // Helper utilities for node-edit history
    const cloneNodes = (nodes = []) => (Array.isArray(nodes) ? nodes.map(n => ({ x: Number(n?.x) || 0, y: Number(n?.y) || 0 })) : []);
    const equalNodes = (a = [], b = []) => {
        if (!Array.isArray(a) || !Array.isArray(b)) return false;
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            const ax = Number(a[i]?.x); const ay = Number(a[i]?.y);
            const bx = Number(b[i]?.x); const by = Number(b[i]?.y);
            if (Math.abs(ax - bx) > 1e-9 || Math.abs(ay - by) > 1e-9) return false;
        }
        return true;
    };
    const initHistoryBaseline = useCallback((idx) => {
        try {
            const layer = layers[idx];
            if (!layer || !Array.isArray(layer.nodes) || layer.nodes.length < 1) return;
            const snap = cloneNodes(layer.nodes);
            historyRef.current = { stack: [snap], index: 0, layerIndex: idx };
            setHistoryTick(t => t + 1);
        } catch { /* noop */ }
    }, [layers]);
    const pushHistorySnapshot = () => {
        try {
            const idx = Math.max(0, Math.min(Number.isFinite(selectedLayerIndex) ? selectedLayerIndex : 0, Math.max(0, layers.length - 1)));
            if (historyRef.current.layerIndex !== idx) return; // not tracking this layer
            const layer = layers[idx];
            if (!layer || !Array.isArray(layer.nodes)) return;
            const snap = cloneNodes(layer.nodes);
            const cur = historyRef.current;
            const last = cur.stack[cur.index];
            if (last && equalNodes(last, snap)) return; // avoid duplicates
            // Drop redo branch if any
            if (cur.index < cur.stack.length - 1) cur.stack = cur.stack.slice(0, cur.index + 1);
            cur.stack.push(snap);
            // Cap to 5 entries by trimming earliest
            while (cur.stack.length > 5) {
                cur.stack.shift();
            }
            cur.index = cur.stack.length - 1;
            setHistoryTick(t => t + 1);
        } catch { /* noop */ }
    };
    const applySnapshot = (idx, snap) => {
        try {
            if (!Array.isArray(snap) || snap.length < 1) return;
            const cloned = cloneNodes(snap);
            // Keep the node-sync cache aligned so a following effect doesn't overwrite our undo state
            try {
                const cache = nodesCacheRef.current;
                if (cache && typeof cache.set === 'function') {
                    cache.set(idx, cloned.map(n => ({ ...n })));
                }
            } catch { /* noop */ }
            setLayers(prev => prev.map((l, i) => i === idx ? { ...l, nodes: cloned } : l));
        } catch { /* noop */ }
    };
    const undoOnce = () => {
        const cur = historyRef.current;
        const idx = cur.layerIndex;
        if (idx < 0) return;
        if (cur.index <= 0) return;
        cur.index -= 1;
        applySnapshot(idx, cur.stack[cur.index]);
        setHistoryTick(t => t + 1);
    };
    const redoOnce = () => {
        const cur = historyRef.current;
        const idx = cur.layerIndex;
        if (idx < 0) return;
        if (cur.index >= cur.stack.length - 1) return;
        cur.index += 1;
        applySnapshot(idx, cur.stack[cur.index]);
        setHistoryTick(t => t + 1);
    };

    // Expose internal canvas and current animation time to parent components
    useImperativeHandle(ref, () => ({
        /** @returns {HTMLCanvasElement|null} */
        get canvas() { return localCanvasRef.current; },
        /** Get current accumulated animation time in seconds */
        getAnimationTime: () => animationTimeRef.current ?? 0,
    }), []);

    // Keep canvas sized to its container (the .canvas-container)
    useEffect(() => {
        const canvas = localCanvasRef.current;
        if (!canvas) return;
        const container = canvas.parentElement;
        if (!container) return;

        const applySize = () => {
            const rect = container.getBoundingClientRect();
            const displayWidth = Math.max(1, Math.floor(rect.width));
            const displayHeight = Math.max(1, Math.floor(rect.height));
            const dpr = (typeof window !== 'undefined' && Number.isFinite(window.devicePixelRatio))
                ? Math.max(DEFAULT_PIXEL_RATIO, window.devicePixelRatio)
                : DEFAULT_PIXEL_RATIO;
            const pixelWidth = Math.max(1, Math.round(displayWidth * dpr));
            const pixelHeight = Math.max(1, Math.round(displayHeight * dpr));

            if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
                canvas.width = pixelWidth;
                canvas.height = pixelHeight;
            }

            if (canvas.style.width !== `${displayWidth}px`) {
                canvas.style.width = `${displayWidth}px`;
            }
            if (canvas.style.height !== `${displayHeight}px`) {
                canvas.style.height = `${displayHeight}px`;
            }

            if (canvas.dataset.pixelRatio !== String(dpr)) {
                canvas.dataset.pixelRatio = String(dpr);
            }
            setCanvasSize(prev => {
                if (prev.width === displayWidth && prev.height === displayHeight && prev.pixelRatio === dpr) {
                    return prev;
                }
                return { width: displayWidth, height: displayHeight, pixelRatio: dpr };
            });

            if (typeof window !== 'undefined') {
                window.__artapp_canvasMeta = {
                    width: displayWidth,
                    height: displayHeight,
                    pixelRatio: dpr,
                };
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
            const wallNow = Date.now() * 0.001;
            frozenTimeRef.current = wallNow;
            // Compute an offset so that when we switch to wall-time for colours,
            // the colour clock remains continuous with animationTime
            colorWallOffsetRef.current = (animationTimeRef.current || 0) - wallNow;
            if (colorFadeWhileFrozen) {
                setColorTick(t => (t + 1) % 1000000);
            }
        }
    }, [isFrozen, colorFadeWhileFrozen]);

    // When unfreezing with color-fade active, align animationTime to the wall clock
    // so colour time remains continuous and does not jump
    useEffect(() => {
        if (!isFrozen && colorFadeWhileFrozen) {
            const wallNow = Date.now() * 0.001;
            animationTimeRef.current = wallNow + colorWallOffsetRef.current;
            lastTimeStampRef.current = wallNow;
        }
    }, [isFrozen, colorFadeWhileFrozen]);

    // Seamless toggling of Fade While Frozen while already frozen
    const prevFadeRef = useRef(colorFadeWhileFrozen);
    useEffect(() => {
        if (!isFrozen) { prevFadeRef.current = colorFadeWhileFrozen; return; }
        const wallNow = Date.now() * 0.001;
        const prev = prevFadeRef.current;
        const curr = colorFadeWhileFrozen;
        if (prev !== curr) {
            if (curr) {
                // Turning ON while frozen: derive offset from current animation snapshot so wall time continues from it
                colorWallOffsetRef.current = (animationTimeRef.current || 0) - wallNow;
            } else {
                // Turning OFF while frozen: sync animation snapshot to current wall-time-based colour clock
                animationTimeRef.current = wallNow + colorWallOffsetRef.current;
            }
            // Trigger an immediate repaint
            setColorTick(t => (t + 1) % 1000000);
        }
        prevFadeRef.current = curr;
    }, [colorFadeWhileFrozen, isFrozen]);

    // While frozen with color-fade enabled, drive a lightweight RAF to animate colours visibly
    useEffect(() => {
        // In ref-driven animation mode, Canvas is already driven by a RAF loop; avoid extra React state churn.
        if (layersRef) return;
        if (!(isFrozen && colorFadeWhileFrozen)) return;
        let rafId;
        const loop = () => {
            // Tick a tiny state value to trigger the drawing effect
            setColorTick(t => (t + 1) % 1000000);
            rafId = requestAnimationFrame(loop);
        };
        rafId = requestAnimationFrame(loop);
        return () => { if (rafId) cancelAnimationFrame(rafId); };
    }, [isFrozen, colorFadeWhileFrozen, layersRef]);

    // Optimized render effect with selective updates
    const renderFrame = useCallback(() => {
        const canvas = localCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const { width, height, ratio: canvasPixelRatio } = getCanvasLogicalDimensions(canvas);
        // In node edit mode, we need to use `layers` (React state) for node geometry,
        // but we should preserve animated positions from `layersRef` to avoid position jumps.
        // Merge: use layers for geometry/nodes, but layersRef for positions.
        let layersForRender;
        if (isNodeEditMode) {
            const animatedLayers = (layersRef && Array.isArray(layersRef.current)) ? layersRef.current : null;
            if (animatedLayers && animatedLayers.length > 0) {
                const byId = new Map();
                animatedLayers.forEach((l, i) => {
                    if (l?.id != null) byId.set(l.id, { layer: l, index: i });
                });
                // Merge: use React state layers for editable geometry, but animated positions where available.
                layersForRender = layers.map((layer, i) => {
                    const byIdHit = layer?.id != null ? byId.get(layer.id) : null;
                    const animated = byIdHit?.layer || animatedLayers[i] || null;
                    if (!animated || !animated.position) return layer;
                    return {
                        ...layer,
                        position: {
                            ...layer.position,
                            x: animated.position.x ?? layer.position?.x ?? 0.5,
                            y: animated.position.y ?? layer.position?.y ?? 0.5,
                            scale: animated.position.scale ?? layer.position?.scale ?? 1,
                        },
                        orbitAngle: animated.orbitAngle ?? layer.orbitAngle,
                        spinAngle: animated.spinAngle ?? layer.spinAngle,
                    };
                });
            } else {
                layersForRender = layers;
            }
        } else {
            layersForRender = (layersRef && layersRef.current) ? layersRef.current : layers;
        }
        
        // Store canvas dimensions globally for bounce detection in useAnimation
        if (typeof window !== 'undefined') {
            window.__artapp_canvasMeta = window.__artapp_canvasMeta || {};
            window.__artapp_canvasMeta.width = width;
            window.__artapp_canvasMeta.height = height;
        }

        ctx.save();
        ctx.setTransform(canvasPixelRatio, 0, 0, canvasPixelRatio, 0, 0);

        try {
            const renderStart = performance.now();

            // Force a render when node edit mode toggles or selected layer changes
            const modeChanged = (modeHashRef.current.isNodeEditMode !== isNodeEditMode) || (modeHashRef.current.selectedLayerIndex !== selectedLayerIndex);

        const countChanged = prevLayersCountRef.current !== (layersForRender?.length || 0);
        // Always repaint the background so color changes show immediately (even when frozen)
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, width, height);

	        // Redraw on selection/mode toggles too; stable frozen time keeps appearance identical while frozen
	        const needsFullRender = modeChanged || countChanged ||
	            Array.from(layerChanges.values()).some(change => change.hasChanged) ||
	            layerHashesRef.current.size === 0;
            const hasActiveOverlayLayers = !!(renderOverlayLayers && overlayLayersRef?.current?.length);
            const shouldHideSourceLayer = hasActiveOverlayLayers && (hideLayerId || hideLayerIndex >= 0);

	        if (!needsFullRender) {
            // Safety: after clearing the canvas, ensure content is drawn at least once
            // Advance accumulator only when not frozen
            const nowWall = Date.now() * 0.001;
            if (!isFrozen) {
                if (lastTimeStampRef.current == null) lastTimeStampRef.current = nowWall;
                const dt = Math.max(0, Math.min(1, nowWall - lastTimeStampRef.current));
                lastTimeStampRef.current = nowWall;
                animationTimeRef.current += dt;
            } else {
                // keep lastTimeStampRef so when unfreezing dt stays small
            }
            const timeNow = animationTimeRef.current;
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
                } catch { /* ignore image draw error */ }
            }
            // If user wants color to fade while frozen, drive it with wall time but keep continuity using the computed offset
            const colorTimeNow = (isFrozen && colorFadeWhileFrozen)
                ? (Date.now() * 0.001 + colorWallOffsetRef.current)
                : timeNow;
	            (Array.isArray(layersForRender) ? layersForRender : []).forEach((layer, index) => {
	                if (!layer || !layer.position || !layer.visible) return;
	                if (shouldHideSourceLayer && ((hideLayerId && layer?.id === hideLayerId) || (hideLayerIndex >= 0 && index === hideLayerIndex))) {
	                    renderedPointsRef.current.delete(index);
	                    return;
	                }
                if (!isLayerVisible(layer)) {
                    renderedPointsRef.current.delete(index);
                    return;
                }
                let renderedPoints = null;
                if (Array.isArray(layer.nodes) && layer.nodes.length >= 3) {
                    renderedPoints = computeDeformedNodePoints(layer, canvas, globalSeed, timeNow);
                    renderedPointsRef.current.set(index, renderedPoints);
                } else {
                    renderedPointsRef.current.delete(index);
                }
                if (layer.image && layer.image.src) {
                    drawLayerWithWrap(ctx, layer, canvas, (c, l, cv) => drawImage(c, l, cv, globalBlendMode), [], { renderedPoints });
                } else {
                    // Use stable seed independent of render index so reordering layers doesn't change their appearance
                    drawLayerWithWrap(ctx, layer, canvas, (c, l, cv) => drawShape(c, l, cv, globalSeed, timeNow, false, globalBlendMode, colorTimeNow), [], { renderedPoints });
                }
            });
            // Ephemeral overlay layers (non-interactive / non-selectable)
	            if (hasActiveOverlayLayers) {
	                const overlayList = overlayLayersRef.current;
	                overlayList.forEach((layer) => {
	                    if (!layer || !layer.position || !layer.visible) return;
                    if (layer.image && layer.image.src) {
                        drawLayerWithWrap(ctx, layer, canvas, (c, l, cv) => drawImage(c, l, cv, globalBlendMode), [], { renderedPoints: null });
                    } else {
                        drawLayerWithWrap(ctx, layer, canvas, (c, l, cv) => drawShape(c, l, cv, globalSeed, timeNow, false, globalBlendMode, colorTimeNow), [], { renderedPoints: null });
                    }
                });
            }
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
                } catch { /* noop */ }
            }
        }

        if (classicMode) {
            ctx.filter = 'blur(1px)';
        }

        // current time snapshot for this frame (or stable frozen time)
        // Advance accumulator only when not frozen
        const nowWall = Date.now() * 0.001;
        if (!isFrozen) {
            if (lastTimeStampRef.current == null) lastTimeStampRef.current = nowWall;
            const dt = Math.max(0, Math.min(1, nowWall - lastTimeStampRef.current));
            lastTimeStampRef.current = nowWall;
            animationTimeRef.current += dt;
        }
        const nowSec = animationTimeRef.current;
        const forceFullPass = backgroundChanged || modeChanged || countChanged ||
            (layerHashesRef.current.size === 0) || (isFrozen && colorFadeWhileFrozen) ||
            needsFullRender; // canvas was cleared earlier, so redraw everything when any layer changed
        const colorTimeFullPass = (isFrozen && colorFadeWhileFrozen)
            ? (Date.now() * 0.001 + colorWallOffsetRef.current)
            : nowSec;
	        (Array.isArray(layersForRender) ? layersForRender : []).forEach((layer, index) => {
	            if (!layer || !layer.position) {
	                console.error('Skipping render for malformed layer:', layer);
	                return;
	            }
	            if (!layer.visible) return;
	            if (shouldHideSourceLayer && ((hideLayerId && layer?.id === hideLayerId) || (hideLayerIndex >= 0 && index === hideLayerIndex))) {
	                renderedPointsRef.current.delete(index);
	                return;
	            }
            if (!isLayerVisible(layer)) {
                renderedPointsRef.current.delete(index);
                return;
            }

            const layerChange = layerChanges.get(index);

            if (forceFullPass || layerChange?.hasChanged) {
                let renderedPoints = null;
                if (layer.image && layer.image.src) {
                    drawLayerWithWrap(ctx, layer, canvas, (c, l, cv) => drawImage(c, l, cv, globalBlendMode), [], { renderedPoints });
                } else {
                    // Use stable frozen time when frozen; live time otherwise
                    const time = nowSec;
                    if (Array.isArray(layer.nodes) && layer.nodes.length >= 3) {
                        renderedPoints = computeDeformedNodePoints(layer, canvas, globalSeed, time);
                        renderedPointsRef.current.set(index, renderedPoints);
                    } else {
                        renderedPointsRef.current.delete(index);
                    }
                    drawLayerWithWrap(ctx, layer, canvas, (c, l, cv) => drawShape(c, l, cv, globalSeed, time, false, globalBlendMode, colorTimeFullPass), [], { renderedPoints });
                }
            }
        });

        // Ephemeral overlay layers (non-interactive / non-selectable)
	        if (hasActiveOverlayLayers) {
	            const overlayList = overlayLayersRef.current;
	            overlayList.forEach((layer) => {
	                if (!layer || !layer.position || !layer.visible) return;
                if (layer.image && layer.image.src) {
                    drawLayerWithWrap(ctx, layer, canvas, (c, l, cv) => drawImage(c, l, cv, globalBlendMode), [], { renderedPoints: null });
                } else {
                    drawLayerWithWrap(ctx, layer, canvas, (c, l, cv) => drawShape(c, l, cv, globalSeed, nowSec, false, globalBlendMode, colorTimeFullPass), [], { renderedPoints: null });
                }
            });
        }

        if (classicMode) {
            ctx.filter = 'none';
        }

        // Selection highlight outlines (active layer, selections, groups)
        if (showLayerOutlines) {
            try {
                const highlightIds = new Set();
                if (Array.isArray(selectedLayerIdsCtx)) {
                    selectedLayerIdsCtx.forEach(id => { if (id) highlightIds.add(id); });
                }
                if (typeof getActiveTargetLayerIdsLatest === 'function') {
                    const targetIdsList = getActiveTargetLayerIdsLatest() || [];
                    targetIdsList.forEach(id => { if (id) highlightIds.add(id); });
                }
                if (Array.isArray(layers) && layers.length > 0) {
                    const activeIndex = Math.max(0, Math.min(Number.isFinite(selectedLayerIndex) ? selectedLayerIndex : 0, layers.length - 1));
                    const activeLayer = layers[activeIndex];
                    if (activeLayer?.id) highlightIds.add(activeLayer.id);
                }

                if (highlightIds.size > 0 && Array.isArray(layers) && layers.length) {
                    const idToLayer = new Map();
                    layers.forEach((layer, index) => {
                        if (layer?.id) idToLayer.set(layer.id, { layer, index });
                    });
                    const activeLayerId = (() => {
                        if (!Array.isArray(layers) || !layers.length) return null;
                        const idx = Math.max(0, Math.min(Number.isFinite(selectedLayerIndex) ? selectedLayerIndex : 0, layers.length - 1));
                        const layer = layers[idx];
                        return layer?.id || null;
                    })();

                    ctx.save();
                    const primaryColour = 'rgba(79,195,247,0.9)';
                    const secondaryColour = 'rgba(79,195,247,0.6)';
                    highlightIds.forEach((id) => {
                        const info = idToLayer.get(id);
                        if (!info) return;
                        const { layer, index } = info;
                        if (!layer || !layer.visible) return;
                        if (!isLayerVisible(layer)) return;
                        const path = buildLayerHitPath(layer, canvas, {
                            renderedPoints: renderedPointsRef.current.get(index),
                            globalSeed,
                            time: animationTimeRef.current || 0,
                        });
                        if (!path) return;
                        const isActive = id === activeLayerId;
                        ctx.lineWidth = isActive ? 3 : 2;
                        ctx.strokeStyle = isActive ? primaryColour : secondaryColour;
                        ctx.stroke(path);
                    });
                    ctx.restore();
                }
            } catch { /* noop */ }
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
            (Array.isArray(layersForRender) ? layersForRender : []).forEach(l => {
                const lx = Number(l?.position?.x);
                const ly = Number(l?.position?.y);
                const { spanX, spanY, offsetX: mapX, offsetY: mapY } = getLayerCanvasMapping(canvas, l);
                const offsetX = (Number(l?.xOffset) || 0) * spanX;
                const offsetY = (Number(l?.yOffset) || 0) * spanY;
                const x = mapX + (Number.isFinite(lx) ? lx : 0.5) * spanX + offsetX;
                const y = mapY + (Number.isFinite(ly) ? ly : 0.5) * spanY + offsetY;
                ctx.beginPath();
                ctx.moveTo(x - 8, y); ctx.lineTo(x + 8, y);
                ctx.moveTo(x, y - 8); ctx.lineTo(x, y + 8);
                ctx.stroke();
            });
            ctx.restore();
        }

        // Draw draggable node + midpoint handles and orbit center for selected layer when in node edit mode
        if (isNodeEditMode && selectedLayerIndex != null && Array.isArray(layers) && layers.length > 0) {
            const clampedIndex = Math.max(0, Math.min(selectedLayerIndex, Math.max(0, layers.length - 1)));
            const editableLayer = layers[clampedIndex];
            const renderLayer = (Array.isArray(layersForRender) && layersForRender[clampedIndex]) ? layersForRender[clampedIndex] : editableLayer;
            const sel = renderLayer && editableLayer ? {
                ...editableLayer,
                position: renderLayer.position || editableLayer.position,
                orbitAngle: renderLayer.orbitAngle ?? editableLayer.orbitAngle,
                spinAngle: renderLayer.spinAngle ?? editableLayer.spinAngle,
            } : (editableLayer || renderLayer);
            const mapping = getLayerCanvasMapping(canvas, sel);
            if (Array.isArray(sel.nodes) && sel.nodes.length >= 1) {
                const { x, y, scale } = sel.position || { x: 0.5, y: 0.5, scale: 1 };
                const { spanX, spanY, offsetX: ax, offsetY: ay, refSize: artSize } = mapping;
                const offsetXPx = (Number(sel.xOffset) || 0) * spanX;
                const offsetYPx = (Number(sel.yOffset) || 0) * spanY;
                const geometry = {
                    centerX: ax + x * spanX + offsetXPx,
                    centerY: ay + y * spanY + offsetYPx,
                    radiusX: sel.viewBoxMapped ? (artSize / 2) * scale : Math.max(0, (Number(sel.radiusFactorX ?? sel.radiusFactor ?? sel.baseRadiusFactor ?? 0.4)) * artSize * Math.max(0, scale) + (Number(sel.radiusBump ?? 0) * (artSize * 0.02) * Math.max(0, scale))),
                    radiusY: sel.viewBoxMapped ? (artSize / 2) * scale : Math.max(0, (Number(sel.radiusFactorY ?? sel.radiusFactor ?? sel.baseRadiusFactor ?? 0.4)) * artSize * Math.max(0, scale) + (Number(sel.radiusBump ?? 0) * (artSize * 0.02) * Math.max(0, scale))),
                    sinR: Math.sin(((((Number(sel.rotation) || 0) + 180) % 360 + 360) % 360 - 180) * Math.PI / 180),
                    cosR: Math.cos(((((Number(sel.rotation) || 0) + 180) % 360 + 360) % 360 - 180) * Math.PI / 180),
                };
                let basePoints = buildBaseNodePoints(sel, geometry, renderedPointsRef.current.get(clampedIndex));
                const baseCenterX = geometry.centerX;
                const baseCenterY = geometry.centerY;
                const wrapOffset = resolveDriftWrapOffset(sel, canvas, basePoints, baseCenterX, baseCenterY);
                const layerCX = baseCenterX + wrapOffset.ox;
                const layerCY = baseCenterY + wrapOffset.oy;
                const points = applyWrapToPoints(basePoints, wrapOffset);
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

            // Always draw Orbit center handle (white dot with red border)
            {
                const { spanX, spanY, offsetX: ax, offsetY: ay } = mapping;
                const offsetXPx = (Number(sel.xOffset) || 0) * spanX;
                const offsetYPx = (Number(sel.yOffset) || 0) * spanY;
                const ocx = Number.isFinite(sel?.orbitCenterX) ? sel.orbitCenterX : 0.5;
                const ocy = Number.isFinite(sel?.orbitCenterY) ? sel.orbitCenterY : 0.5;
                const posX = Number(sel?.position?.x);
                const posY = Number(sel?.position?.y);
                const baseCenterX = ax + (Number.isFinite(posX) ? posX : 0.5) * spanX + offsetXPx;
                const baseCenterY = ay + (Number.isFinite(posY) ? posY : 0.5) * spanY + offsetYPx;
                const wrapOffset = resolveDriftWrapOffset(sel, canvas, renderedPointsRef.current.get(clampedIndex), baseCenterX, baseCenterY);
                const ox = ax + ocx * spanX + offsetXPx + wrapOffset.ox;
                const oy = ay + ocy * spanY + offsetYPx + wrapOffset.oy;
                ctx.save();
                ctx.beginPath();
                ctx.arc(ox, oy, 6, 0, Math.PI * 2);
                ctx.fillStyle = '#ffffff';
                ctx.fill();
                ctx.lineWidth = 2;
                ctx.strokeStyle = '#ff3333';
                ctx.stroke();
                ctx.restore();
            }
        }

        const renderEnd = performance.now();
        const renderTime = renderEnd - renderStart;

        if (renderTime > 16) {
            // Avoid spamming the console every frame; log at most once every 2 seconds while slow
            const now = performance.now();
            if (now - lastSlowRenderLogRef.current > 2000) {
                lastSlowRenderLogRef.current = now;
                console.warn(`Canvas render took ${renderTime.toFixed(2)}ms - may impact performance`);
            }
        } else if (lastSlowRenderLogRef.current !== 0 && renderTime < 12) {
            // Reset throttle once things are comfortably fast again
            lastSlowRenderLogRef.current = 0;
        }

        // Update trackers after a pass
        modeHashRef.current = { isNodeEditMode, selectedLayerIndex };
        prevLayersCountRef.current = (layersForRender?.length || 0);
        } finally {
            ctx.restore();
        }

    }, [
        layerChanges,
        backgroundChanged,
        hideLayerIndex,
        hideLayerId,
        renderOverlayLayers,
        backgroundColor,
        globalSeed,
        globalBlendMode,
        isNodeEditMode,
        selectedLayerIndex,
        classicMode,
        isFrozen,
        colorFadeWhileFrozen,
        layers,
        layersRef,
        overlayLayersRef,
        selectedLayerIdsCtx,
        getActiveTargetLayerIdsLatest,
        isLayerVisible,
        showLayerOutlines,
    ]);

    // Render on relevant changes (initial paint, resize, selection changes, etc.)
    useEffect(() => {
        renderFrame();
    }, [renderFrame]);

    // In ref-driven animation mode, render continuously without React state updates.
    // NOTE: We no longer skip this loop in node edit mode - animation should continue
    // so that positions stay in sync. The renderFrame function handles merging
    // animated positions with React state geometry when in node edit mode.
    useEffect(() => {
        if (!layersRef) return;
        if (isFrozen && !colorFadeWhileFrozen) return;
        let rafId = null;
        const loop = () => {
            const nowMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
            const targetFps = Number(targetFpsRef.current) || 60;
            const minDeltaMs = targetFps > 0 ? (1000 / targetFps) : (1000 / 60);
            if ((nowMs - lastRenderMsRef.current) >= minDeltaMs) {
                lastRenderMsRef.current = nowMs;
                renderFrame();
            }
            rafId = requestAnimationFrame(loop);
        };
        rafId = requestAnimationFrame(loop);
        return () => { if (rafId) cancelAnimationFrame(rafId); };
    }, [layersRef, isFrozen, colorFadeWhileFrozen, renderFrame]);

    // Initialize nodes when entering node edit mode if missing
    useEffect(() => {
        const canvas = localCanvasRef.current;
        if (!canvas || !isNodeEditMode) return;
        const selIndex = Math.max(0, Math.min(Number.isFinite(selectedLayerIndex) ? selectedLayerIndex : 0, Math.max(0, layers.length - 1)));
        const layer = layers[selIndex];
        if (!layer || layer.layerType !== 'shape') return;
        if (!Array.isArray(layer.nodes) || layer.nodes.length < 3) {
            const nodes = computeInitialNodes(layer);
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
            const nodes = computeInitialNodes(layer);
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
        // Avoid fighting the user's drag gesture by re-syncing/resizing nodes mid-drag.
        if (
            draggingNodeIndexRef.current != null ||
            draggingMidIndexRef.current != null ||
            draggingCenterRef.current ||
            draggingOrbitCenterRef.current
        ) return;
        const selIndex = Math.max(0, Math.min(Number.isFinite(selectedLayerIndex) ? selectedLayerIndex : 0, Math.max(0, layers.length - 1)));
        const layer = layers[selIndex];
        if (!layer || layer.layerType !== 'shape') return;
        const currentNodes = Array.isArray(layer.nodes) ? layer.nodes : [];
        const desiredRaw = Number(layer?.numSides);
        const desired = Math.max(3, Number.isFinite(desiredRaw) ? Math.round(desiredRaw) : (currentNodes.length || 3));

        if (layer.syncNodesToNumSides === false) {
            const hasNodes = currentNodes.length >= 3;
            const baseNodes = hasNodes ? currentNodes : computeInitialNodes(desired);
            const baseClones = baseNodes.map(n => ({ ...n }));
            nodesCacheRef.current.set(selIndex, baseClones);

            if (!hasNodes) {
                setLayers(prev => prev.map((l, i) => (
                    i === selIndex ? { ...l, nodes: baseClones, syncNodesToNumSides: false } : l
                )));
                return;
            }

            if (desired !== baseNodes.length) {
                const resized = resizeNodes(baseNodes, desired);
                const resizedClones = resized.map(n => ({ ...n }));
                nodesCacheRef.current.set(selIndex, resizedClones);
                if (!nodesEqual(currentNodes, resizedClones)) {
                    setLayers(prev => prev.map((l, i) => (
                        i === selIndex ? { ...l, nodes: resizedClones, syncNodesToNumSides: false } : l
                    )));
                }
            }
            return;
        }

        const key = selIndex;
        // Ensure cache exists
        if (!nodesCacheRef.current.has(key)) {
            const base = Array.isArray(layer.nodes) && layer.nodes.length ? layer.nodes : computeInitialNodes(layer);
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
            const current = Array.isArray(layer.nodes) && layer.nodes.length ? layer.nodes : (cache.length ? cache.slice(0) : computeInitialNodes(layer));
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
            const nodes = computeInitialNodes(layer);
            // Only update if different or missing
            if (!nodesEqual(layer.nodes, nodes)) {
                setLayers(prev => prev.map((l, i) => i === selIndex ? { ...l, nodes } : l));
            }
            // Seed cache with freshly initialized nodes
            nodesCacheRef.current.set(selIndex, nodes.map(n => ({ ...n })));
        }
    }, [layers, selectedLayerIndex, isNodeEditMode, setLayers]);

    // Mouse interaction for dragging nodes
    const getMousePos = (evt) => {
        const canvas = localCanvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        const { width: logicalWidth, height: logicalHeight } = getCanvasLogicalDimensions(canvas);
        const scaleX = rect.width ? logicalWidth / rect.width : 1;
        const scaleY = rect.height ? logicalHeight / rect.height : 1;
        return {
            x: (evt.clientX - rect.left) * scaleX,
            y: (evt.clientY - rect.top) * scaleY,
        };
    };

    const mouseDownRef = useRef({ x: 0, y: 0, t: 0 }); // eslint-disable-line no-unused-vars

    const getNodeEditInteractiveLayer = (layerIndex) => {
        const base = layers[layerIndex];
        if (!base) return base;
        const animatedLayers = (layersRef && Array.isArray(layersRef.current)) ? layersRef.current : null;
        if (!animatedLayers || animatedLayers.length === 0) return base;
        const animated = (base.id != null
            ? animatedLayers.find(l => l?.id === base.id)
            : null) || animatedLayers[layerIndex];
        if (!animated || !animated.position) return base;
        return {
            ...base,
            position: {
                ...base.position,
                x: animated.position.x ?? base.position?.x ?? 0.5,
                y: animated.position.y ?? base.position?.y ?? 0.5,
                scale: animated.position.scale ?? base.position?.scale ?? 1,
            },
            orbitAngle: animated.orbitAngle ?? base.orbitAngle,
            spinAngle: animated.spinAngle ?? base.spinAngle,
        };
    };

    const onMouseDown = (e) => {
        if (!isNodeEditMode) return;
        // If holding a selection modifier (Shift/Cmd/Ctrl), skip drag initiation so we can select on mouseup
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        const canvas = localCanvasRef.current;
        if (!canvas) return;

        clearDragState();

        const layerIndex = Math.max(0, Math.min(Number.isFinite(selectedLayerIndex) ? selectedLayerIndex : 0, Math.max(0, layers.length - 1)));
        const layer = getNodeEditInteractiveLayer(layerIndex);
        if (!layer) return;
        const geometry = getLayerGeometry(layer, canvas);
        if (!geometry) return;
        const {
            centerX,
            centerY,
            radiusX,
            radiusY,
            sinR,
            cosR,
            artOffsetX,
            artOffsetY,
            offsetXPx,
            offsetYPx,
            spanX,
            spanY,
        } = geometry;

        const layerId = layer?.id ?? null;
        const pos = getMousePos(e);
        const hitRadius = 10;
        const wrapOffset = layer?.movementStyle === 'drift' ? getDriftWrapOffset(layer, canvas) : ZERO_WRAP_OFFSET;
        const wrapOx = wrapOffset.ox;
        const wrapOy = wrapOffset.oy;
        const gestureGeometry = {
            centerX,
            centerY,
            radiusX,
            radiusY,
            sinR,
            cosR,
            artOffsetX,
            artOffsetY,
            offsetXPx,
            offsetYPx,
            spanX,
            spanY,
        };

        // Orbit center handle can be dragged regardless of node presence
        {
            const ocxNorm = Number.isFinite(layer.orbitCenterX) ? layer.orbitCenterX : 0.5;
            const ocyNorm = Number.isFinite(layer.orbitCenterY) ? layer.orbitCenterY : 0.5;
            const ox = artOffsetX + ocxNorm * spanX + offsetXPx + wrapOx;
            const oy = artOffsetY + ocyNorm * spanY + offsetYPx + wrapOy;
            const dx = ox - pos.x; const dy = oy - pos.y;
            if ((dx * dx + dy * dy) <= hitRadius * hitRadius) {
                draggingOrbitCenterRef.current = true;
                draggingNodeIndexRef.current = null;
                draggingMidIndexRef.current = null;
                draggingCenterRef.current = false;
                draggingKindRef.current = 'orbitCenter';
                gestureRef.current = { layerId, layerIndex, type: 'orbitCenter', wrapOffset, geometry: gestureGeometry };
                return;
            }
        }

        if (!Array.isArray(layer.nodes)) {
            gestureRef.current = null;
            return;
        }
        // Prefer deformed points for hit-testing so handles remain clickable under noise
        const rendered = renderedPointsRef.current.get(layerIndex);
        let idx = -1;
        if (Array.isArray(rendered) && rendered.length === layer.nodes.length) {
            idx = rendered.findIndex(p => {
                const px = p.x + wrapOx;
                const py = p.y + wrapOy;
                return ((px - pos.x) ** 2 + (py - pos.y) ** 2) <= hitRadius * hitRadius;
            });
        }
        if (idx === -1) {
            idx = layer.nodes.findIndex(n => {
                const rx = n.x * cosR - n.y * sinR;
                const ry = n.x * sinR + n.y * cosR;
                const px = centerX + wrapOx + rx * radiusX;
                const py = centerY + wrapOy + ry * radiusY;
                const dx = px - pos.x;
                const dy = py - pos.y;
                return (dx * dx + dy * dy) <= hitRadius * hitRadius;
            });
        }
        if (idx !== -1) {
            draggingNodeIndexRef.current = idx;
            draggingMidIndexRef.current = null;
            draggingCenterRef.current = false;
            draggingOrbitCenterRef.current = false;
            draggingKindRef.current = 'node';
            gestureRef.current = { layerId, layerIndex, type: 'node', nodeIndex: idx, wrapOffset, geometry: gestureGeometry };
            return;
        }
        // Try midpoints next
        const pts = (Array.isArray(rendered) && rendered.length === layer.nodes.length)
            ? rendered.map(p => ({ x: p.x + wrapOx, y: p.y + wrapOy }))
            : layer.nodes.map(n => {
                const rx = n.x * cosR - n.y * sinR;
                const ry = n.x * sinR + n.y * cosR;
                return { x: centerX + wrapOx + rx * radiusX, y: centerY + wrapOy + ry * radiusY };
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
            draggingOrbitCenterRef.current = false;
            draggingKindRef.current = 'mid';
            const nodes = Array.isArray(layer.nodes) ? layer.nodes : [];
            const N = nodes.length;
            const aIdx = midIdx;
            const bIdx = (midIdx + 1) % (N || 1);
            const startA = nodes[aIdx] ? { x: nodes[aIdx].x, y: nodes[aIdx].y } : { x: 0, y: 0 };
            const startB = nodes[bIdx] ? { x: nodes[bIdx].x, y: nodes[bIdx].y } : { x: 0, y: 0 };
            gestureRef.current = {
                layerId,
                layerIndex,
                type: 'mid',
                midIndex: midIdx,
                wrapOffset,
                geometry: gestureGeometry,
                midDrag: {
                    aIdx,
                    bIdx,
                    startA,
                    startB,
                    startMouse: { x: pos.x, y: pos.y },
                },
            };
            return;
        }
        // Try center cross (use centroid to match the drawn crosshair position)
        {
            let cx = centerX + wrapOx, cy = centerY + wrapOy;
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
                draggingOrbitCenterRef.current = false;
                draggingKindRef.current = 'center';
                gestureRef.current = { layerId, layerIndex, type: 'center', wrapOffset, geometry: gestureGeometry };
                // Store initial offset: where the mouse is relative to the actual layer center
                const currentPosX = layer.position?.x ?? 0.5;
                const currentPosY = layer.position?.y ?? 0.5;
                const posBaseX = pos.x - wrapOx;
                const posBaseY = pos.y - wrapOy;
                const clickNormX = spanX > 0 ? (posBaseX - artOffsetX - offsetXPx) / spanX : 0.5;
                const clickNormY = spanY > 0 ? (posBaseY - artOffsetY - offsetYPx) / spanY : 0.5;
                dragStartOffsetRef.current = {
                    normX: clickNormX - currentPosX,
                    normY: clickNormY - currentPosY,
                };
                return;
            }
        }

        gestureRef.current = null;
    };

    const onMouseMove = (e) => {
        if (!isNodeEditMode) return;
        const idx = draggingNodeIndexRef.current;
        const mid = draggingMidIndexRef.current;
        const draggingCenter = draggingCenterRef.current;
        const draggingOrbit = draggingOrbitCenterRef.current;
        if (idx == null && mid == null && !draggingCenter && !draggingOrbit) return;
        const canvas = localCanvasRef.current;
        if (!canvas) return;
        const selIndex = Math.max(0, Math.min(Number.isFinite(selectedLayerIndex) ? selectedLayerIndex : 0, Math.max(0, layers.length - 1)));
        const layer = getNodeEditInteractiveLayer(selIndex);
        if (!layer || !layer.position) return;
        const gestureGeometry = gestureRef.current?.geometry;
        const liveGeometry = getLayerGeometry(layer, canvas);
        const geometry = (gestureGeometry && gestureRef.current?.layerIndex === selIndex) ? gestureGeometry : liveGeometry;
        if (!geometry) return;
        const {
            centerX,
            centerY,
            radiusX,
            radiusY,
            sinR,
            cosR,
            artOffsetX,
            artOffsetY,
            offsetXPx,
            offsetYPx,
            spanX,
            spanY,
        } = geometry;

        const pos = getMousePos(e);
        const wrapOffset = layer?.movementStyle === 'drift'
            ? (gestureRef.current?.wrapOffset || getDriftWrapOffset(layer, canvas))
            : ZERO_WRAP_OFFSET;
        const wrapOx = wrapOffset.ox;
        const wrapOy = wrapOffset.oy;
        const posBaseX = pos.x - wrapOx;
        const posBaseY = pos.y - wrapOy;
        // Use base (unwrapped) canvas coordinates when converting back to normalized space
        // so that dragging the wrapped center crosshair does not introduce a 1.0 offset.
        const normXBase = spanX > 0 ? (posBaseX - artOffsetX - offsetXPx) / spanX : 0.5;
        const normYBase = spanY > 0 ? (posBaseY - artOffsetY - offsetYPx) / spanY : 0.5;

        if (draggingOrbit) {
            const nx = Math.max(0, Math.min(1, normXBase));
            const ny = Math.max(0, Math.min(1, normYBase));
            // Store update for RAF batching
            pendingDragUpdateRef.current = { type: 'orbit', selIndex, nx, ny };
            // If no RAF scheduled, apply immediately for responsive feedback
            if (!dragUpdateRafRef.current) {
                setLayers(prev => prev.map((l, i) => (
                    i === selIndex ? { ...l, orbitCenterX: nx, orbitCenterY: ny } : l
                )));
                // Schedule RAF to batch subsequent rapid updates
                dragUpdateRafRef.current = requestAnimationFrame(() => {
                    dragUpdateRafRef.current = null;
                    const update = pendingDragUpdateRef.current;
                    if (!update) return;
                    pendingDragUpdateRef.current = null;
                    if (update.type === 'orbit') {
                        setLayers(prev => prev.map((l, i) => (
                            i === update.selIndex ? { ...l, orbitCenterX: update.nx, orbitCenterY: update.ny } : l
                        )));
                    } else if (update.type === 'center') {
                        setLayers(prev => prev.map((l, i) => (
                            i === update.selIndex ? { ...l, position: { ...(l.position || {}), x: update.nx, y: update.ny } } : l
                        )));
                    } else if (update.type === 'node') {
                        setLayers(prev => prev.map((l, i) => {
                            if (i !== update.selIndex) return l;
                            const nodes = [...(l.nodes || [])];
                            nodes[update.idx] = { x: update.nx, y: update.ny };
                            const cache = nodesCacheRef.current.get(update.selIndex);
                            if (Array.isArray(cache) && cache.length >= nodes.length) {
                                cache[update.idx] = { x: update.nx, y: update.ny };
                            }
                            return { ...l, nodes, syncNodesToNumSides: false };
                        }));
                    } else if (update.type === 'mid') {
                        setLayers(prev => prev.map((l, i) => {
                            if (i !== update.selIndex) return l;
                            const nodes = [...(l.nodes || [])];
                            const _n1 = nodes[update.mid];
                            const _n2 = nodes[(update.mid + 1) % nodes.length];
                            const newNode = { x: update.nx, y: update.ny };
                            nodes.splice(update.mid + 1, 0, newNode);
                            const cache = nodesCacheRef.current.get(update.selIndex);
                            if (Array.isArray(cache) && cache.length >= nodes.length - 1) {
                                cache.splice(update.mid + 1, 0, newNode);
                            }
                            return { ...l, nodes, syncNodesToNumSides: false };
                        }));
                        draggingMidIndexRef.current = null;
                        draggingNodeIndexRef.current = update.mid + 1;
                    }
                });
            }
        } else if (draggingCenter) {
            // Apply the initial offset so the shape doesn't jump to align its center with the cursor
            const targetX = normXBase - dragStartOffsetRef.current.normX;
            const targetY = normYBase - dragStartOffsetRef.current.normY;
            
            // For drift layers, allow positions outside 0-1 range (they wrap toroidally)
            // For other movement styles, clamp to canvas bounds
            let nx = targetX;
            let ny = targetY;
            if (layer.movementStyle !== 'drift') {
                const { width: canvasWidth, height: canvasHeight } = getCanvasLogicalDimensions(canvas);
                const minXNorm = spanX > 0 ? (0 - artOffsetX - offsetXPx) / spanX : 0;
                const maxXNorm = spanX > 0 ? (canvasWidth - artOffsetX - offsetXPx) / spanX : 1;
                const minYNorm = spanY > 0 ? (0 - artOffsetY - offsetYPx) / spanY : 0;
                const maxYNorm = spanY > 0 ? (canvasHeight - artOffsetY - offsetYPx) / spanY : 1;
                nx = Math.max(minXNorm, Math.min(maxXNorm, targetX));
                ny = Math.max(minYNorm, Math.min(maxYNorm, targetY));
            }
            // Store update for RAF batching
            pendingDragUpdateRef.current = { type: 'center', selIndex, nx, ny };
            // If no RAF scheduled, apply immediately for responsive feedback
            if (!dragUpdateRafRef.current) {
                setLayers(prev => prev.map((l, i) => (
                    i === selIndex ? { ...l, position: { ...(l.position || {}), x: nx, y: ny } } : l
                )));
                // Schedule RAF to batch subsequent rapid updates
                dragUpdateRafRef.current = requestAnimationFrame(() => {
                    dragUpdateRafRef.current = null;
                    const update = pendingDragUpdateRef.current;
                    if (!update) return;
                    pendingDragUpdateRef.current = null;
                    if (update.type === 'orbit') {
                        setLayers(prev => prev.map((l, i) => (
                            i === update.selIndex ? { ...l, orbitCenterX: update.nx, orbitCenterY: update.ny } : l
                        )));
                    } else if (update.type === 'center') {
                        setLayers(prev => prev.map((l, i) => (
                            i === update.selIndex ? { ...l, position: { ...(l.position || {}), x: update.nx, y: update.ny } } : l
                        )));
                    } else if (update.type === 'node') {
                        setLayers(prev => prev.map((l, i) => {
                            if (i !== update.selIndex) return l;
                            const nodes = [...(l.nodes || [])];
                            nodes[update.idx] = { x: update.nx, y: update.ny };
                            const cache = nodesCacheRef.current.get(update.selIndex);
                            if (Array.isArray(cache) && cache.length >= nodes.length) {
                                cache[update.idx] = { x: update.nx, y: update.ny };
                            }
                            return { ...l, nodes, syncNodesToNumSides: false };
                        }));
                    } else if (update.type === 'mid') {
                        setLayers(prev => prev.map((l, i) => {
                            if (i !== update.selIndex) return l;
                            const nodes = [...(l.nodes || [])];
                            const _n1 = nodes[update.mid];
                            const _n2 = nodes[(update.mid + 1) % nodes.length];
                            const newNode = { x: update.nx, y: update.ny };
                            nodes.splice(update.mid + 1, 0, newNode);
                            const cache = nodesCacheRef.current.get(update.selIndex);
                            if (Array.isArray(cache) && cache.length >= nodes.length - 1) {
                                cache.splice(update.mid + 1, 0, newNode);
                            }
                            return { ...l, nodes, syncNodesToNumSides: false };
                        }));
                        draggingMidIndexRef.current = null;
                        draggingNodeIndexRef.current = update.mid + 1;
                    }
                });
            }
        } else if (idx != null) {
            // Convert dragged canvas position back to unrotated local node coords
            const lx = (posBaseX - centerX) / radiusX;
            const ly = (posBaseY - centerY) / radiusY;
            const nx = lx * cosR + ly * sinR;
            const ny = -lx * sinR + ly * cosR;
            // Store update for RAF batching
            pendingDragUpdateRef.current = { type: 'node', selIndex, idx, nx, ny };
            // If no RAF scheduled, apply immediately for responsive feedback
            if (!dragUpdateRafRef.current) {
                setLayers(prev => prev.map((l, i) => {
                    if (i !== selIndex) return l;
                    const nodes = [...(l.nodes || [])];
                    nodes[idx] = { x: nx, y: ny };
                    const cache = nodesCacheRef.current.get(selIndex);
                    if (Array.isArray(cache) && cache.length >= nodes.length) {
                        cache[idx] = { x: nx, y: ny };
                    }
                    return { ...l, nodes, syncNodesToNumSides: false };
                }));
                // Schedule RAF to batch subsequent rapid updates
                dragUpdateRafRef.current = requestAnimationFrame(() => {
                    dragUpdateRafRef.current = null;
                    const update = pendingDragUpdateRef.current;
                    if (!update) return;
                    pendingDragUpdateRef.current = null;
                    if (update.type === 'orbit') {
                        setLayers(prev => prev.map((l, i) => (
                            i === update.selIndex ? { ...l, orbitCenterX: update.nx, orbitCenterY: update.ny } : l
                        )));
                    } else if (update.type === 'center') {
                        setLayers(prev => prev.map((l, i) => (
                            i === update.selIndex ? { ...l, position: { ...(l.position || {}), x: update.nx, y: update.ny } } : l
                        )));
                    } else if (update.type === 'node') {
                        setLayers(prev => prev.map((l, i) => {
                            if (i !== update.selIndex) return l;
                            const nodes = [...(l.nodes || [])];
                            nodes[update.idx] = { x: update.nx, y: update.ny };
                            const cache = nodesCacheRef.current.get(update.selIndex);
                            if (Array.isArray(cache) && cache.length >= nodes.length) {
                                cache[update.idx] = { x: update.nx, y: update.ny };
                            }
                            return { ...l, nodes, syncNodesToNumSides: false };
                        }));
                    } else if (update.type === 'mid') {
                        setLayers(prev => prev.map((l, i) => {
                            if (i !== update.selIndex) return l;
                            const nodes = [...(l.nodes || [])];
                            const _n1 = nodes[update.mid];
                            const _n2 = nodes[(update.mid + 1) % nodes.length];
                            const newNode = { x: update.nx, y: update.ny };
                            nodes.splice(update.mid + 1, 0, newNode);
                            const cache = nodesCacheRef.current.get(update.selIndex);
                            if (Array.isArray(cache) && cache.length >= nodes.length - 1) {
                                cache.splice(update.mid + 1, 0, newNode);
                            }
                            return { ...l, nodes, syncNodesToNumSides: false };
                        }));
                        draggingMidIndexRef.current = null;
                        draggingNodeIndexRef.current = update.mid + 1;
                    }
                });
            }
        } else if (mid != null) {
            // Stable midpoint drag: use delta from the gesture start, not current midpoint,
            // to avoid feedback oscillation/jitter.
            const md = gestureRef.current?.midDrag;
            const aIdx = (md && Number.isInteger(md.aIdx)) ? md.aIdx : mid;
            const bIdx = (md && Number.isInteger(md.bIdx)) ? md.bIdx : ((mid + 1) % (layer.nodes?.length || 1));
            const startMouse = md?.startMouse || { x: pos.x, y: pos.y };
            const dxCanvas = pos.x - startMouse.x;
            const dyCanvas = pos.y - startMouse.y;
            const dLocalX = radiusX !== 0 ? (dxCanvas / radiusX) : 0;
            const dLocalY = radiusY !== 0 ? (dyCanvas / radiusY) : 0;
            const invDx = dLocalX * cosR + dLocalY * sinR;
            const invDy = -dLocalX * sinR + dLocalY * cosR;
            const startA = md?.startA || layer.nodes?.[aIdx] || { x: 0, y: 0 };
            const startB = md?.startB || layer.nodes?.[bIdx] || { x: 0, y: 0 };
            const nextA = { x: (Number(startA.x) || 0) + invDx, y: (Number(startA.y) || 0) + invDy };
            const nextB = { x: (Number(startB.x) || 0) + invDx, y: (Number(startB.y) || 0) + invDy };
            
            // Store update for RAF batching
            pendingDragUpdateRef.current = { 
                type: 'midDrag', 
                selIndex, 
                aIdx,
                bIdx,
                a: nextA,
                b: nextB,
            };
            // If no RAF scheduled, apply immediately for responsive feedback
            if (!dragUpdateRafRef.current) {
                setLayers(prev => prev.map((l, i) => {
                    if (i !== selIndex) return l;
                    const nodes = [...(l.nodes || [])];
                    if (nodes[aIdx]) nodes[aIdx] = { x: nextA.x, y: nextA.y };
                    if (nodes[bIdx]) nodes[bIdx] = { x: nextB.x, y: nextB.y };
                    const cache = nodesCacheRef.current.get(selIndex);
                    if (Array.isArray(cache) && cache.length >= nodes.length) {
                        if (nodes[aIdx]) cache[aIdx] = { ...nodes[aIdx] };
                        if (nodes[bIdx]) cache[bIdx] = { ...nodes[bIdx] };
                    }
                    return { ...l, nodes, syncNodesToNumSides: false };
                }));
                // Schedule RAF to batch subsequent rapid updates
                dragUpdateRafRef.current = requestAnimationFrame(() => {
                    dragUpdateRafRef.current = null;
                    const update = pendingDragUpdateRef.current;
                    if (!update) return;
                    pendingDragUpdateRef.current = null;
                    if (update.type === 'orbit') {
                        setLayers(prev => prev.map((l, i) => (
                            i === update.selIndex ? { ...l, orbitCenterX: update.nx, orbitCenterY: update.ny } : l
                        )));
                    } else if (update.type === 'center') {
                        setLayers(prev => prev.map((l, i) => (
                            i === update.selIndex ? { ...l, position: { ...(l.position || {}), x: update.nx, y: update.ny } } : l
                        )));
                    } else if (update.type === 'node') {
                        setLayers(prev => prev.map((l, i) => {
                            if (i !== update.selIndex) return l;
                            const nodes = [...(l.nodes || [])];
                            nodes[update.idx] = { x: update.nx, y: update.ny };
                            const cache = nodesCacheRef.current.get(update.selIndex);
                            if (Array.isArray(cache) && cache.length >= nodes.length) {
                                cache[update.idx] = { x: update.nx, y: update.ny };
                            }
                            return { ...l, nodes, syncNodesToNumSides: false };
                        }));
                    } else if (update.type === 'mid') {
                        setLayers(prev => prev.map((l, i) => {
                            if (i !== update.selIndex) return l;
                            const nodes = [...(l.nodes || [])];
                            const _n1 = nodes[update.mid];
                            const _n2 = nodes[(update.mid + 1) % nodes.length];
                            const newNode = { x: update.nx, y: update.ny };
                            nodes.splice(update.mid + 1, 0, newNode);
                            const cache = nodesCacheRef.current.get(update.selIndex);
                            if (Array.isArray(cache) && cache.length >= nodes.length - 1) {
                                cache.splice(update.mid + 1, 0, newNode);
                            }
                            return { ...l, nodes, syncNodesToNumSides: false };
                        }));
                        draggingMidIndexRef.current = null;
                        draggingNodeIndexRef.current = update.mid + 1;
                    } else if (update.type === 'midDrag') {
                        setLayers(prev => prev.map((l, i) => {
                            if (i !== update.selIndex) return l;
                            const nodes = [...(l.nodes || [])];
                            const aIdx = update.aIdx;
                            const bIdx = update.bIdx;
                            if (nodes[aIdx] && update.a) nodes[aIdx] = { x: update.a.x, y: update.a.y };
                            if (nodes[bIdx] && update.b) nodes[bIdx] = { x: update.b.x, y: update.b.y };
                            const cache = nodesCacheRef.current.get(update.selIndex);
                            if (Array.isArray(cache) && cache.length >= nodes.length) {
                                if (nodes[aIdx]) cache[aIdx] = { ...nodes[aIdx] };
                                if (nodes[bIdx]) cache[bIdx] = { ...nodes[bIdx] };
                            }
                            return { ...l, nodes, syncNodesToNumSides: false };
                        }));
                    }
                });
            }
        }
    };

    const onMouseUp = (e) => {
        const canvas = localCanvasRef.current;
        const wasDragging = draggingKindRef.current != null || draggingCenterRef.current || draggingOrbitCenterRef.current;
        const hasModifier = e.shiftKey || e.metaKey || e.ctrlKey;

        if (!wasDragging && canvas && setSelectedLayerIndex && toggleLayerSelection) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                const pos = getMousePos(e);
                let hitIndex = -1;
                let hitLayer = null;
                for (let i = layers.length - 1; i >= 0; i--) {
                    const layer = layers[i];
                    if (!layer || !layer.visible) continue;
                    const path = buildLayerHitPath(layer, canvas, {
                        renderedPoints: renderedPointsRef.current.get(i),
                        globalSeed,
                        time: animationTimeRef.current || 0,
                    });
                    if (ctx.isPointInPath(path, pos.x, pos.y)) {
                        hitIndex = i;
                        hitLayer = layer;
                        break;
                    }
                }

                if (hitIndex !== -1 && hitLayer?.id) {
                    setSelectedLayerIndex(hitIndex);
                    if (hasModifier) {
                        const nextSet = new Set(Array.isArray(selectedLayerIdsCtx) ? selectedLayerIdsCtx : []);
                        if (nextSet.has(hitLayer.id)) {
                            nextSet.delete(hitLayer.id);
                        } else {
                            nextSet.add(hitLayer.id);
                        }
                        toggleLayerSelection(hitLayer.id);
                        if (nextSet.size > 1) {
                            setEditTarget && setEditTarget({ type: 'selection' });
                        } else {
                            setEditTarget && setEditTarget({ type: 'single' });
                        }
                    } else {
                        if (clearSelection) clearSelection();
                        toggleLayerSelection(hitLayer.id);
                        setEditTarget && setEditTarget({ type: 'single' });
                    }
                }
            }
        }
        // If we just finished dragging a node or a midpoint, push a snapshot
        if (isNodeEditMode && (draggingKindRef.current === 'node' || draggingKindRef.current === 'mid')) {
            pushHistorySnapshot();
        }

        draggingNodeIndexRef.current = null;
        draggingMidIndexRef.current = null;
        draggingCenterRef.current = false;
        draggingOrbitCenterRef.current = false;
        draggingKindRef.current = null;
        gestureRef.current = null;

        // nothing else to do here
    };

    // Initialize baseline snapshot when enabling node edit, switching layer,
  // or when the selected layer gains nodes (e.g., after auto-init)
  // Use refs to track state and avoid re-running on every layers change
  const prevNodeLenRef = useRef(0);
  const wasNodeEditModeRef = useRef(false);
  useEffect(() => {
    if (!isNodeEditMode) {
      // Only reset when transitioning FROM node edit mode TO non-node edit mode
      if (wasNodeEditModeRef.current) {
        historyRef.current = { stack: [], index: -1, layerIndex: -1 };
        prevNodeLenRef.current = 0;
        setHistoryTick(t => t + 1);
      }
      wasNodeEditModeRef.current = false;
      return;
    }
    wasNodeEditModeRef.current = true;
    const idx = Math.max(0, Math.min(Number.isFinite(selectedLayerIndex) ? selectedLayerIndex : 0, Math.max(0, layers.length - 1)));
    const sel = layers[idx];
    const nodeLen = Array.isArray(sel?.nodes) ? sel.nodes.length : 0;
    const prevNodeLen = prevNodeLenRef.current;
    prevNodeLenRef.current = nodeLen;
    
    // Initialize when switching tracked layer, or if nodes appeared (0 -> non-zero)
    if (historyRef.current.layerIndex !== idx || (prevNodeLen === 0 && nodeLen > 0)) {
      initHistoryBaseline(idx);
    }
    // Only depend on isNodeEditMode and selectedLayerIndex, not layers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNodeEditMode, initHistoryBaseline, selectedLayerIndex]);

    return (
        <>
          <canvas
              ref={localCanvasRef}
              style={{ display: 'block', pointerEvents: 'auto' }}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
          />
          {isNodeEditMode && (
            <div style={{ position: 'absolute', right: 16, bottom: 16, display: 'flex', gap: 10, zIndex: 9000 }}>
              <button
                className="fab"
                style={{ width: 48, height: 48 }}
                title="Undo node edit"
                aria-label="Undo node edit"
                onClick={undoOnce}
                disabled={!(historyRef.current.layerIndex >= 0 && historyRef.current.index > 0)}
              >↶</button>
              <button
                className="fab"
                style={{ width: 48, height: 48 }}
                title="Redo node edit"
                aria-label="Redo node edit"
                onClick={redoOnce}
                disabled={!(historyRef.current.layerIndex >= 0 && historyRef.current.index < historyRef.current.stack.length - 1)}
              >↷</button>
            </div>
          )}
        </>
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
    prev.colorFadeWhileFrozen === next.colorFadeWhileFrozen &&
    prev.selectedLayerIndex === next.selectedLayerIndex &&
    prev.classicMode === next.classicMode &&
    prev.renderOverlayLayers === next.renderOverlayLayers &&
    prev.hideLayerIndex === next.hideLayerIndex &&
    prev.hideLayerId === next.hideLayerId &&
    prev.isolateMode === next.isolateMode &&
    prev.getActiveTargetLayerIds === next.getActiveTargetLayerIds &&
    prev.layers === next.layers
  );
};

export { drawShape, drawImage, drawLayerWithWrap };
export default React.memo(Canvas, areCanvasPropsEqual);
