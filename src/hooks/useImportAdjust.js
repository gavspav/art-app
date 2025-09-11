import { useEffect, useRef, useState } from 'react';

// Manages Import Adjust state and layout recomputation for multi-file SVG import
export function useImportAdjust({ setLayers }) {
  const [showImportAdjust, setShowImportAdjust] = useState(false);
  const [importAdjust, setImportAdjust] = useState({ dx: 0, dy: 0, s: 1 });
  const importBaseRef = useRef([]); // base x,y,scale baseline (RAW before fit)
  const importRawRef = useRef([]);  // raw baseline captured at import
  const [importFitEnabled, setImportFitEnabled] = useState(true);
  const [importDebug, setImportDebug] = useState(false);

  const recomputeImportLayout = (adj = importAdjust, fit = importFitEnabled) => {
    const raw = importRawRef.current || [];
    if (!showImportAdjust || !Array.isArray(raw) || raw.length === 0) return;
    // Build working copy from raw baseline
    setLayers(prev => {
      const layersCopy = prev.map((l, i) => {
        const b = raw[i] || { x: 0.5, y: 0.5, s: 1 };
        return { ...l, position: { ...(l.position || {}), x: b.x, y: b.y, scale: b.s } };
      });

      if (fit && layersCopy.length > 1) {
        const margin = 0.02;
        const meta = layersCopy.map(l => {
          const s = Number(l.position?.scale) || 1;
          let maxAbsX = 0, maxAbsY = 0;
          const nodes = Array.isArray(l.nodes) ? l.nodes : [];
          nodes.forEach(n => { const ax = Math.abs(n.x)||0, ay = Math.abs(n.y)||0; if(ax>maxAbsX)maxAbsX=ax; if(ay>maxAbsY)maxAbsY=ay; });
          const px = Number(l.position?.x) || 0.5;
          const py = Number(l.position?.y) || 0.5;
          return { px, py, s, maxAbsX, maxAbsY };
        });
        const bounds = meta.reduce((acc, m) => {
          const halfW = (m.maxAbsX || 1) * 0.5 * m.s;
          const halfH = (m.maxAbsY || 1) * 0.5 * m.s;
          const minX = m.px - halfW, maxX = m.px + halfW;
          const minY = m.py - halfH, maxY = m.py + halfH;
          if (minX < acc.minX) acc.minX = minX;
          if (maxX > acc.maxX) acc.maxX = maxX;
          if (minY < acc.minY) acc.minY = minY;
          if (maxY > acc.maxY) acc.maxY = maxY;
          return acc;
        }, { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
        const widthFrac = Math.max(0.0001, bounds.maxX - bounds.minX);
        const heightFrac = Math.max(0.0001, bounds.maxY - bounds.minY);
        const fitX = (1 - 2*margin) / widthFrac;
        const fitY = (1 - 2*margin) / heightFrac;
        const sFit = Math.min(1, fitX, fitY); // only shrink-to-fit
        if (sFit < 1) layersCopy.forEach(l => { l.position.scale = (Number(l.position.scale)||1) * sFit; });
        // recentre
        const bounds2 = meta.reduce((acc, m) => {
          const s2 = m.s * (sFit < 1 ? sFit : 1);
          const halfW = (m.maxAbsX || 1) * 0.5 * s2;
          const halfH = (m.maxAbsY || 1) * 0.5 * s2;
          const minX = m.px - halfW, maxX = m.px + halfW;
          const minY = m.py - halfH, maxY = m.py + halfH;
          if (minX < acc.minX) acc.minX = minX;
          if (maxX > acc.maxX) acc.maxX = maxX;
          if (minY < acc.minY) acc.minY = minY;
          if (maxY > acc.maxY) acc.maxY = maxY;
          return acc;
        }, { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
        const cx = (bounds2.minX + bounds2.maxX)/2, cy = (bounds2.minY + bounds2.maxY)/2;
        const dx = 0.5 - cx, dy = 0.5 - cy;
        layersCopy.forEach(l => {
          l.position.x = Math.min(1, Math.max(0, (Number(l.position.x)||0.5) + dx));
          l.position.y = Math.min(1, Math.max(0, (Number(l.position.y)||0.5) + dy));
        });
      }

      // Apply user offsets (allow slight overscan so movement feels responsive near edges)
      const clampMin = -0.2, clampMax = 1.2;
      layersCopy.forEach((l, _i) => {
        l.position.x = Math.min(clampMax, Math.max(clampMin, (Number(l.position.x)||0.5) + (adj.dx||0)));
        l.position.y = Math.min(clampMax, Math.max(clampMin, (Number(l.position.y)||0.5) + (adj.dy||0)));
        l.position.scale = Math.min(5, Math.max(0.05, (Number(l.position.scale)||1) * (adj.s||1)));
      });

      return layersCopy;
    });
  };

  const applyImportAdjust = (next) => {
    setImportAdjust(next);
    recomputeImportLayout(next, importFitEnabled);
  };

  useEffect(() => {
    // Recompute layout live when toggles or sliders change
    if (showImportAdjust && (importRawRef.current || []).length > 0) {
      recomputeImportLayout(importAdjust, importFitEnabled);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importFitEnabled]);

  return {
    showImportAdjust,
    setShowImportAdjust,
    importAdjust,
    setImportAdjust,
    importFitEnabled,
    setImportFitEnabled,
    importDebug,
    setImportDebug,
    importBaseRef,
    importRawRef,
    recomputeImportLayout,
    applyImportAdjust,
  };
}
