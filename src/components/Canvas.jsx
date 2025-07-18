import React, { useRef, useEffect, forwardRef } from 'react';
import { createSeededRandom } from '../utils/random';

// --- Shape Drawing Logic ---
const drawShape = (ctx, layer, canvas, globalSeed) => {
    // Destructure properties from the layer and its nested position object
    const { 
        numSides: sides, curviness, width, height, 
        colors, blendMode, opacity, noiseAmount: noise, noiseSeed 
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
        return;
    }

    ctx.beginPath();

    for (let i = 0; i <= sides; i++) {
        const angle = (i / sides) * Math.PI * 2;
        const x1 = centerX + Math.cos(angle) * radiusX;
        const y1 = centerY + Math.sin(angle) * radiusY;

        if (i === 0) {
            ctx.moveTo(x1, y1);
        } else {
            const prevAngle = ((i - 1) / sides) * Math.PI * 2;
            if (curviness === 0) {
                ctx.lineTo(x1, y1);
            } else {
                const midAngle = (angle + prevAngle) / 2;
                const midX = centerX + Math.cos(midAngle) * radiusX;
                const midY = centerY + Math.sin(midAngle) * radiusY;

                const cpx = midX + (centerX - midX) * curviness;
                const cpy = midY + (centerY - midY) * curviness;

                ctx.quadraticCurveTo(cpx, cpy, x1, y1);
            }
        }
    }
    ctx.closePath();

    const gradient = ctx.createLinearGradient(centerX - radiusX, centerY - radiusY, centerX + radiusX, centerY + radiusY);
    colors.forEach((color, index) => {
        gradient.addColorStop(index / (colors.length - 1 || 1), color);
    });
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.restore();
};

// --- Image Drawing Logic ---
const drawImage = (ctx, layer, canvas) => {
    const { image, imageMode, opacity, blendMode } = layer;
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

    useEffect(() => {
        const canvas = localCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const { width, height } = canvas;

        ctx.clearRect(0, 0, width, height);

        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, width, height);

        layers.forEach((layer, index) => {
            if (!layer || !layer.position) {
                console.error('Skipping render for malformed layer:', layer);
                return;
            }
            if (!layer.visible) return;

            if (layer.image && layer.image.src) {
                drawImage(ctx, layer, canvas);
            } else {
                drawShape(ctx, layer, canvas, globalSeed + index);
            }
        });

    }, [layers, backgroundColor, globalSeed]);

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
