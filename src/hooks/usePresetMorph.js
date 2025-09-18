import { useEffect, useRef, useState } from 'react';
import { hexToRgb, rgbToHex } from '../utils/colorUtils.js';

/**
 * usePresetMorph encapsulates the preset morphing engine (fade/tween) without resetting app state each frame.
 * It updates background color, layer properties, and optionally global speed using the provided setters.
 *
 * Params:
 * - getPresetSlot: (id:number) => slot | null
 * - setLayers: React setState for layers (supports functional updater)
 * - setBackgroundColor: (hex:string) => void
 * - setGlobalSpeedMultiplier: (number) => void
 * - morphEnabled: boolean
 * - morphRoute: number[]
 * - morphDurationPerLeg: number (seconds)
 * - morphEasing: 'linear'
 * - morphLoopMode: 'loop' | 'pingpong'
 * - morphMode: 'tween' | 'fade'
 */
export function usePresetMorph({
  getPresetSlot,
  setLayers,
  setBackgroundColor,
  setGlobalSpeedMultiplier,
  morphEnabled,
  morphRoute,
  morphDurationPerLeg,
  morphEasing,
  morphLoopMode,
  morphMode,
}) {
  const [morphStatus, setMorphStatus] = useState(null);

  const rafRef = useRef(0);
  const routeRef = useRef([]);
  const durRef = useRef(5);
  const easingRef = useRef('linear');
  const loopModeRef = useRef('loop');
  const modeRef = useRef('tween');
  const getPresetSlotRef = useRef(getPresetSlot);

  // For fade mode baselines (A+B stack)
  const fadePrepRef = useRef({ key: null, lenA: 0, lenB: 0, baseA: [], baseB: [] });

  // Sync refs
  useEffect(() => { routeRef.current = Array.isArray(morphRoute) ? [...morphRoute] : []; }, [morphRoute]);
  useEffect(() => { durRef.current = Number(morphDurationPerLeg || 5); }, [morphDurationPerLeg]);
  useEffect(() => { easingRef.current = morphEasing || 'linear'; }, [morphEasing]);
  useEffect(() => { loopModeRef.current = morphLoopMode || 'loop'; }, [morphLoopMode]);
  useEffect(() => { modeRef.current = morphMode || 'tween'; }, [morphMode]);
  useEffect(() => { getPresetSlotRef.current = getPresetSlot; }, [getPresetSlot]);

  const lerp = (a, b, t) => a + (b - a) * t;
  const sanitizeHex = (val) => (typeof val === 'string' && /^#([0-9a-fA-F]{6})$/.test(val) ? val : '#000000');
  const lerpColor = (ca, cb, t) => {
    const ra = hexToRgb(sanitizeHex(ca));
    const rb = hexToRgb(sanitizeHex(cb));
    return rgbToHex({ r: Math.round(lerp(ra.r, rb.r, t)), g: Math.round(lerp(ra.g, rb.g, t)), b: Math.round(lerp(ra.b, rb.b, t)) });
  };
  const stripMorphFields = (state) => {
    if (!state || typeof state !== 'object') return state;
    const { morphEnabled: _me, morphRoute: _mr, morphDurationPerLeg: _md, morphEasing: _meas, morphLoopMode: _ml, morphMode: _mm, ...rest } = state;
    return rest;
  };

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (!morphEnabled) return;
    const route = routeRef.current;
    if (!Array.isArray(route) || route.length < 2) return;

    let legIndex = 0;
    let forward = true;
    let startTime = performance.now();
    setMorphStatus({ from: route[0], to: route[1], t: 0 });

    const step = () => {
      const now = performance.now();
      const durMs = Math.max(200, Number(durRef.current || 5) * 1000);
      const tRaw = Math.min(1, (now - startTime) / durMs);
      let t = tRaw;
      if (easingRef.current === 'linear') {
        // no-op (placeholder for future easing options)
      }

      const routeNow = routeRef.current;
      const fromId = routeNow[legIndex];
      const toId = routeNow[(legIndex + 1) % routeNow.length];
      const fromSlot = getPresetSlotRef.current ? getPresetSlotRef.current(fromId) : null;
      const toSlot = getPresetSlotRef.current ? getPresetSlotRef.current(toId) : null;
      const fromState = fromSlot?.payload?.appState;
      const toState = toSlot?.payload?.appState;
      setMorphStatus({ from: fromId, to: toId, t });

      if (fromState && toState) {
        try {
          const a = stripMorphFields(fromState);
          const b = stripMorphFields(toState);
          if (modeRef.current === 'fade') {
            // Prepare once per leg: build A+B stack using current layers as A baselines
            const legKey = `${fromId}->${toId}`;
            if (fadePrepRef.current.key !== legKey) {
              const layersA = Array.isArray(a.layers) ? a.layers : [];
              const layersB = Array.isArray(b.layers) ? b.layers : [];
              fadePrepRef.current = {
                key: legKey,
                lenA: layersA.length,
                lenB: layersB.length,
                baseA: layersA.map(l => Number(l?.opacity ?? 1)),
                baseB: layersB.map(l => Number(l?.opacity ?? 1)),
              };
              // Initialize combined stack: A visible, B hidden
              setLayers(() => [
                ...layersA.map(l => ({ ...l, opacity: Number(l.opacity ?? 1) })),
                ...layersB.map(l => ({ ...l, opacity: 0 })),
              ]);
            }
            // Blend background + opacities from baselines (no compounding)
            setBackgroundColor && setBackgroundColor(lerpColor(a.backgroundColor || '#000000', b.backgroundColor || '#000000', t));
            const { lenA, baseA, baseB } = fadePrepRef.current;
            setLayers(prev => prev.map((l, i) => {
              let nextOpacity = Number(l.opacity ?? 1);
              if (i < lenA) {
                const oa0 = Number(baseA[i] ?? 0);
                nextOpacity = Math.max(0, Math.min(1, oa0 * (1 - t)));
              } else {
                const j = i - lenA;
                const ob0 = Number(baseB[j] ?? 0);
                nextOpacity = Math.max(0, Math.min(1, ob0 * t));
              }
              return nextOpacity !== l.opacity ? { ...l, opacity: nextOpacity } : l;
            }));
          } else {
            // Tween selected numerics + palette colors per layer; keep animation continuity
            setBackgroundColor && setBackgroundColor(lerpColor(a.backgroundColor || '#000000', b.backgroundColor || '#000000', t));
            if (setGlobalSpeedMultiplier) {
              const nextGS = lerp(Number(a.globalSpeedMultiplier || 1), Number(b.globalSpeedMultiplier || 1), t);
              setGlobalSpeedMultiplier(Number(nextGS));
            }
            const aLayers = Array.isArray(a.layers) ? a.layers : [];
            const bLayers = Array.isArray(b.layers) ? b.layers : [];
            setLayers(prev => prev.map((la, i) => {
              const laSrc = aLayers[i] || la;
              const lbSrc = bLayers[i] || la;
              const pa = (laSrc.position) ? laSrc.position : { x: 0.5, y: 0.5, scale: 1 };
              const pb = (lbSrc.position) ? lbSrc.position : { x: 0.5, y: 0.5, scale: 1 };

              // Palette color interpolation: map color k of A -> color k of B
              const ca = Array.isArray(la.colors) ? la.colors : [];
              const cb = Array.isArray(lbSrc.colors) ? lbSrc.colors : ca;
              const n = Math.min(ca.length || 0, cb.length || 0);
              let nextColors = la.colors;
              if (n > 0) {
                nextColors = Array.from({ length: n }, (_, k) => lerpColor(ca[k], cb[k], t));
              }

              return {
                ...la,
                opacity: lerp(Number(la.opacity || 1), Number(lbSrc.opacity || 1), t),
                rotation: lerp(Number(la.rotation || 0), Number(lbSrc.rotation || 0), t),
                radiusFactor: lerp(Number(la.radiusFactor || 0.125), Number(lbSrc.radiusFactor || 0.125), t),
                movementSpeed: lerp(Number(la.movementSpeed || 1), Number(lbSrc.movementSpeed || 1), t),
                colors: nextColors,
                numColors: Array.isArray(nextColors) ? nextColors.length : (la.numColors || 1),
                selectedColor: 0,
                position: {
                  ...pa,
                  x: lerp(Number(pa.x || 0.5), Number(pb.x || 0.5), t),
                  y: lerp(Number(pa.y || 0.5), Number(pb.y || 0.5), t),
                  scale: lerp(Number(pa.scale || 1), Number(pb.scale || 1), t),
                },
              };
            }));
          }
        } catch {}
      }

      if (tRaw >= 1) {
        if (loopModeRef.current === 'pingpong') {
          if (forward) {
            if (legIndex + 1 >= routeNow.length - 1) forward = false; else legIndex += 1;
          } else {
            if (legIndex <= 0) forward = true; else legIndex -= 1;
          }
        } else {
          legIndex = (legIndex + 1) % routeNow.length;
        }
        startTime = now;
        // Snap to the exact target preset at leg boundaries
        if (modeRef.current === 'fade' || modeRef.current === 'tween') {
          const toId2 = routeNow[legIndex % routeNow.length];
          const toSlot2 = getPresetSlotRef.current ? getPresetSlotRef.current(toId2) : null;
          const toState2 = toSlot2?.payload?.appState;
          const b2 = stripMorphFields(toState2 || {});
          const bLayers2 = Array.isArray(b2.layers) ? b2.layers : [];
          setLayers(() => bLayers2.map(l => ({ ...l })));
          if (setBackgroundColor && b2.backgroundColor) {
            setBackgroundColor(b2.backgroundColor);
          }
          if (setGlobalSpeedMultiplier && typeof b2.globalSpeedMultiplier !== 'undefined') {
            setGlobalSpeedMultiplier(Number(b2.globalSpeedMultiplier || 1));
          }
        }
        // reset prep
        fadePrepRef.current = { key: null, lenA: 0, lenB: 0, baseA: [], baseB: [] };
      }

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [morphEnabled]);

  return { morphStatus };
}
