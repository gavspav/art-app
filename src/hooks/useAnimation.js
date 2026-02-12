import { useEffect, useRef, useCallback } from 'react';
import { useAppState } from '../context/AppStateContext.jsx';
import { applyModulationsToLayer } from './useModulationStore.js';
import { evaluateShapeTrackAtTime, evaluateGlobalShapeTrackAtTime } from '../utils/envelopes.js';
import { getEnergyAtTime } from '../utils/audioTransients.js';
import { lerpNodes, lerpSubpaths } from '../utils/nodeUtils.js';

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

// Apply BPM modulations to a layer
const _applyBPMModulations = (layer, bpmContext) => {
    const { mappings, getClockState, isPlaying } = bpmContext;
    if (!mappings || !getClockState || !isPlaying) return layer;

    // Get current clock state from ref (doesn't trigger re-renders)
    const clockState = getClockState();
    const { currentBeat, beatPhase } = clockState;

    const layerKey = layer.name || 'Layer';

    // Quick check: are there any mappings for this layer?
    const prefix = `layer:${layerKey}:`;
    const enabledMappings = Object.keys(mappings).filter(k => k.startsWith(prefix) && mappings[k]?.enabled);
    if (enabledMappings.length === 0) return layer;

    // Debug: log when we have enabled mappings (uncomment to debug)
    // console.log('[BPM] Applying modulations for', layerKey, 'mappings:', enabledMappings);

    let modifiedLayer = { ...layer };

    // Helper to calculate BPM value for a parameter
    const getBPMValue = (paramId) => {
        const fullKey = `layer:${layerKey}:${paramId}`;
        const mapping = mappings[fullKey];
        if (!mapping || !mapping.enabled) return null;

        const { speed, loopMode, range } = mapping;
        const cycleBeats = speed;
        const totalBeats = currentBeat + beatPhase;
        const cyclePhase = (totalBeats % cycleBeats) / cycleBeats;

        // Apply loop mode (forward, reverse, pingpong, oneshot)
        let normalizedPhase = cyclePhase;
        if (loopMode === 'reverse') {
            normalizedPhase = 1 - cyclePhase;
        } else if (loopMode === 'pingpong') {
            normalizedPhase = cyclePhase < 0.5 ? cyclePhase * 2 : (1 - cyclePhase) * 2;
        } else if (loopMode === 'oneshot') {
            normalizedPhase = Math.min(1, cyclePhase);
        }

        return range.outputMin + normalizedPhase * (range.outputMax - range.outputMin);
    };

    // Apply to scale
    const scaleValue = getBPMValue('scale');
    if (scaleValue !== null && modifiedLayer.position) {
        modifiedLayer = {
            ...modifiedLayer,
            position: { ...modifiedLayer.position, scale: scaleValue }
        };
    }

    // Apply to other numeric parameters
    const params = ['numSides', 'radiusFactor', 'radiusX', 'radiusY', 'movementSpeed', 'curviness', 'orbitRadiusX', 'orbitRadiusY'];
    params.forEach(param => {
        const value = getBPMValue(param);
        if (value !== null) {
            modifiedLayer = { ...modifiedLayer, [param]: value };
        }
    });

    return modifiedLayer;
};

// Apply Audio modulations to a layer
const _applyAudioModulations = (layer, audioContext) => {
    const { mappings, getFeatures } = audioContext;
    if (!getFeatures) return layer;

    // Get current features from ref (doesn't trigger re-renders)
    const features = getFeatures();

    const layerKey = layer.name || 'Layer';
    let modifiedLayer = { ...layer };

    // Helper to get audio value for a parameter
    const getAudioValue = (paramId) => {
        const mapping = mappings[`layer:${layerKey}:${paramId}`];
        if (!mapping || mapping.band === 'none') return null;

        const { band, range } = mapping;
        let audioLevel = 0;

        switch (band) {
            case 'rms': audioLevel = features.rms || 0; break;
            case 'bass': audioLevel = features.bass || 0; break;
            case 'mids': audioLevel = features.mids || 0; break;
            case 'highs': audioLevel = features.highs || 0; break;
            default: return null;
        }

        // Map audio level (0-1) to output range
        const { inputMin = 0, inputMax = 1, outputMin, outputMax } = range;
        const normalizedInput = Math.max(0, Math.min(1, (audioLevel - inputMin) / (inputMax - inputMin)));
        return outputMin + normalizedInput * (outputMax - outputMin);
    };

    // Apply to scale
    const scaleValue = getAudioValue('scale');
    if (scaleValue !== null && modifiedLayer.position) {
        modifiedLayer = {
            ...modifiedLayer,
            position: { ...modifiedLayer.position, scale: scaleValue }
        };
    }

    // Apply to other numeric parameters
    const params = ['numSides', 'radiusFactor', 'radiusX', 'radiusY', 'movementSpeed', 'curviness', 'orbitRadiusX', 'orbitRadiusY'];
    params.forEach(param => {
        const value = getAudioValue(param);
        if (value !== null) {
            modifiedLayer = { ...modifiedLayer, [param]: value };
        }
    });

    return modifiedLayer;
};

/**
 * useAnimation - Main animation loop
 * 
 * NEW APPROACH: This is now the single place where setLayers is called per frame.
 * Audio/BPM modulations are read from the modulation store (refs) and applied here,
 * rather than having separate handlers call setLayers multiple times per frame.
 * 
 * @param {Function} setLayers - React state setter for layers
 * @param {boolean} isFrozen - Whether animation is paused
 * @param {number} globalSpeedMultiplier - Speed multiplier
 * @param {boolean} zIgnore - Whether to ignore Z-axis movement
 * @param {Object} modulationStore - The modulation store from useModulationStore()
 * @param {Object} shapeTrackUpdatesRef - Ref containing shape track updates from timeline (fallback)
 * @param {Object} sourceLayersRef - Optional ref to base layers (for ref-mode animation)
 * @param {Object} animatedLayersRef - Optional ref to write animated layers into (avoids React updates)
 * @param {Object} timelineContext - Optional timeline context for direct shape track evaluation
 */
export const useAnimation = (
    setLayers,
    isFrozen,
    globalSpeedMultiplier,
    zIgnore = false,
    modulationStore = null,
    shapeTrackUpdatesRef = null,
    sourceLayersRef = null,
    animatedLayersRef = null,
    timelineContext = null,
) => {
    const animationFrameId = useRef(null);
    const { runWithoutDirty, isUserInteracting, isNodeEditMode, nodeEditContext, enableEnergyScaling, energyInfluence } = useAppState() || {};

    // Energy refs for RAF access
    const enableEnergyScalingRef = useRef(enableEnergyScaling);
    useEffect(() => { enableEnergyScalingRef.current = enableEnergyScaling; }, [enableEnergyScaling]);
    const energyInfluenceRef = useRef(energyInfluence);
    useEffect(() => { energyInfluenceRef.current = energyInfluence; }, [energyInfluence]);

    // Store modulation refs for access in animation loop
    const modulationStoreRef = useRef(modulationStore);
    useEffect(() => { modulationStoreRef.current = modulationStore; }, [modulationStore]);

    // Store shape track updates ref for access in animation loop
    // Update synchronously to avoid stale data
    const shapeTrackUpdatesRefLocal = useRef(shapeTrackUpdatesRef);
    shapeTrackUpdatesRefLocal.current = shapeTrackUpdatesRef;

    // Track user-interaction status in a ref so we can read it inside RAF loop
    const isUserInteractingRef = useRef(isUserInteracting);
    useEffect(() => { isUserInteractingRef.current = isUserInteracting; }, [isUserInteracting]);

    // Track node edit mode and context so we can avoid overwriting user-edited geometry
    const isNodeEditModeRef = useRef(isNodeEditMode);
    useEffect(() => { isNodeEditModeRef.current = isNodeEditMode; }, [isNodeEditMode]);

    const nodeEditContextRef = useRef(nodeEditContext);
    useEffect(() => { nodeEditContextRef.current = nodeEditContext; }, [nodeEditContext]);

    // Timeline context ref for direct shape track evaluation during playback
    const timelineContextRef = useRef(timelineContext);
    useEffect(() => { timelineContextRef.current = timelineContext; }, [timelineContext]);

    // Store setLayers and runWithoutDirty in refs to avoid recreating animate callback
    const setLayersRef = useRef(setLayers);
    useEffect(() => { setLayersRef.current = setLayers; }, [setLayers]);

    // Optional: animate without touching React state by writing into a ref
    const sourceLayersRefLocal = useRef(sourceLayersRef);
    useEffect(() => { sourceLayersRefLocal.current = sourceLayersRef; }, [sourceLayersRef]);

    const animatedLayersRefLocal = useRef(animatedLayersRef);
    useEffect(() => { animatedLayersRefLocal.current = animatedLayersRef; }, [animatedLayersRef]);

    const runWithoutDirtyRef = useRef(runWithoutDirty);
    useEffect(() => { runWithoutDirtyRef.current = runWithoutDirty; }, [runWithoutDirty]);

    // Store other values in refs to stabilize the animate callback
    const isFrozenRef = useRef(isFrozen);
    useEffect(() => { isFrozenRef.current = isFrozen; }, [isFrozen]);

    const globalSpeedMultiplierRef = useRef(globalSpeedMultiplier);
    useEffect(() => { globalSpeedMultiplierRef.current = globalSpeedMultiplier; }, [globalSpeedMultiplier]);

    const zIgnoreRef = useRef(zIgnore);
    useEffect(() => { zIgnoreRef.current = zIgnore; }, [zIgnore]);

    // Frame counter for throttling React state updates
    // Only sync to React every N frames to prevent "Maximum update depth exceeded" errors
    const frameCountRef = useRef(0);
    const UPDATE_EVERY_N_FRAMES = 2; // React mode: sync every 2 frames (~30fps)
    const lastFrozenModsUpdateMsRef = useRef(0);

    const animatedPrevRef = useRef(null);
    const lastBaseLayersRef = useRef(null);
    const lastBasePosByIdRef = useRef(new Map());

    const mergeBaseIntoAnimated = useCallback((baseLayers, prevAnimated, _prevBasePosById) => {
        if (!Array.isArray(baseLayers) || baseLayers.length === 0) return Array.isArray(baseLayers) ? baseLayers : [];
        if (!Array.isArray(prevAnimated) || prevAnimated.length === 0) return baseLayers;

        const prevById = new Map();
        prevAnimated.forEach((l) => { if (l?.id) prevById.set(l.id, l); });

        return baseLayers.map((baseLayer) => {
            const prev = baseLayer?.id ? prevById.get(baseLayer.id) : null;
            if (!prev) return baseLayer;

            const prevPos = prev?.position;
            const basePos = baseLayer?.position;
            const prevBasePos = (baseLayer?.id && _prevBasePosById instanceof Map)
                ? _prevBasePosById.get(baseLayer.id)
                : null;

            const approxEqual = (a, b, eps = 1e-6) => {
                if (!Number.isFinite(a) || !Number.isFinite(b)) return Object.is(a, b);
                return Math.abs(a - b) <= eps;
            };
            const didBasePositionChange = (() => {
                if (!prevBasePos || !basePos || typeof basePos !== 'object') return false;
                return !approxEqual(basePos.x, prevBasePos.x)
                    || !approxEqual(basePos.y, prevBasePos.y)
                    || !approxEqual(basePos.scale, prevBasePos.scale);
            })();

            // ALWAYS preserve animated position from prevAnimated.
            // The animation loop is the source of truth for x, y, scale during animation.
            // Base layer changes (colors, numSides, etc.) should flow through, but position
            // should come from the animation state.
            const mergedPosition = (prevPos && typeof prevPos === 'object')
                ? {
                    // Start with base position properties (non-animated values)
                    ...(basePos && typeof basePos === 'object' ? basePos : {}),
                    // ALWAYS use animated position - this is the key fix
                    // If the base position changed (e.g. user adjusted scale/position), treat base as authoritative.
                    x: didBasePositionChange ? (basePos?.x ?? prevPos.x) : prevPos.x,
                    y: didBasePositionChange ? (basePos?.y ?? prevPos.y) : prevPos.y,
                    scale: didBasePositionChange ? (basePos?.scale ?? prevPos.scale) : prevPos.scale,
                    scaleDirection: prevPos.scaleDirection ?? basePos?.scaleDirection ?? 1,
                    vx: prevPos.vx ?? basePos?.vx ?? 0,
                    vy: prevPos.vy ?? basePos?.vy ?? 0,
                }
                : basePos;

            return {
                ...baseLayer,
                position: mergedPosition,
                orbitAngle: prev?.orbitAngle ?? baseLayer?.orbitAngle,
                spinAngle: prev?.spinAngle ?? baseLayer?.spinAngle,
                // Also preserve movementAngle from animation (for bounce direction)
                movementAngle: prev?.movementAngle ?? baseLayer?.movementAngle,
            };
        });
    }, []);

    const applyStoreModulations = useCallback((layersIn) => {
        const store = modulationStoreRef.current;
        if (!store || !store.timelineModsRef) return layersIn;

        const timelineMods = store.timelineModsRef.current || {};
        const bpmMods = store.bpmModsRef?.current || {};
        const audioMods = store.audioModsRef?.current || {};

        const hasTimelineMods = Object.keys(timelineMods).length > 0;
        const hasBpmMods = Object.keys(bpmMods).length > 0;
        const hasAudioMods = Object.keys(audioMods).length > 0;
        if (!hasTimelineMods && !hasBpmMods && !hasAudioMods) return layersIn;

        return (Array.isArray(layersIn) ? layersIn : []).map((layer) => (
            applyModulationsToLayer(layer, bpmMods, audioMods, timelineMods)
        ));
    }, []);

    // Apply modulations only (no movement animation)
    // Uses refs to avoid recreating this callback
    const applyModulationsOnly = useCallback(() => {
        const store = modulationStoreRef.current;
        if (!store || !store.timelineModsRef) return;

        const timelineMods = store.timelineModsRef.current || {};
        const bpmMods = store.bpmModsRef?.current || {};
        const audioMods = store.audioModsRef?.current || {};

        // Check if there are any modulations to apply
        const hasTimelineMods = Object.keys(timelineMods).length > 0;
        const hasBpmMods = Object.keys(bpmMods).length > 0;
        const hasAudioMods = Object.keys(audioMods).length > 0;

        if (!hasTimelineMods && !hasBpmMods && !hasAudioMods) return;

        const effectiveBpmMods = bpmMods;
        const effectiveAudioMods = audioMods;

        const outRef = animatedLayersRefLocal.current;
        if (outRef && sourceLayersRefLocal.current) {
            const prevLayers = Array.isArray(animatedPrevRef.current)
                ? animatedPrevRef.current
                : (sourceLayersRefLocal.current?.current || []);
            const next = (Array.isArray(prevLayers) ? prevLayers : []).map(layer =>
                applyModulationsToLayer(layer, effectiveBpmMods, effectiveAudioMods, timelineMods)
            );
            animatedPrevRef.current = next;
            outRef.current = next;
            return;
        }

        const setLayersFn = setLayersRef.current;
        if (typeof setLayersFn !== 'function') return;
        const runWithoutDirtyFn = runWithoutDirtyRef.current;

        const applyUpdate = () => setLayersFn(prevLayers =>
            prevLayers.map(layer => (
                applyModulationsToLayer(layer, effectiveBpmMods, effectiveAudioMods, timelineMods)
            ))
        );

        if (typeof runWithoutDirtyFn === 'function') {
            runWithoutDirtyFn(applyUpdate);
        } else {
            applyUpdate();
        }
    }, []); // No dependencies - uses refs

    // Main animation loop - uses refs to stay stable
    // Throttles React state updates to prevent "Maximum update depth exceeded" errors
    const animate = useCallback(() => {
        frameCountRef.current += 1;
        const outRef = animatedLayersRefLocal.current;
        const refMode = !!(outRef && sourceLayersRefLocal.current);
        const shouldSyncToReact = refMode ? true : (frameCountRef.current >= UPDATE_EVERY_N_FRAMES);

        // In ref-mode, keep the animated layer list in sync with the base layer list even while frozen.
        // Otherwise operations like "add layer" won't appear until unfreezing (because merge happens later).
        if (refMode) {
            const baseLayers = sourceLayersRefLocal.current?.current;
            if (baseLayers && baseLayers !== lastBaseLayersRef.current) {
                const prevBasePosById = lastBasePosByIdRef.current;
                lastBaseLayersRef.current = baseLayers;
                animatedPrevRef.current = mergeBaseIntoAnimated(baseLayers, animatedPrevRef.current, prevBasePosById);
                // Snapshot base positions for change detection next time.
                try {
                    const nextMap = new Map();
                    (Array.isArray(baseLayers) ? baseLayers : []).forEach((l) => {
                        if (l?.id && l?.position && typeof l.position === 'object') {
                            nextMap.set(l.id, {
                                x: l.position.x,
                                y: l.position.y,
                                scale: l.position.scale,
                            });
                        }
                    });
                    lastBasePosByIdRef.current = nextMap;
                } catch {
                    lastBasePosByIdRef.current = new Map();
                }
                // Ensure Canvas sees new layers immediately (even if there are no modulations).
                outRef.current = applyStoreModulations(animatedPrevRef.current);
            }
        }

        if (isFrozenRef.current) {
            // When frozen, still apply modulations but don't advance movement
            // Only sync to React on throttled frames
            if (shouldSyncToReact) {
                frameCountRef.current = 0;
                if (refMode) {
                    // Apply modulations (if any) to the frozen snapshot, but throttle to avoid
                    // doing full-layer maps every RAF tick while the scene is frozen.
                    const nowMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
                    const THROTTLE_MS = 50; // ~20fps, matches BPM/Audio dispatch cadence
                    if (nowMs - lastFrozenModsUpdateMsRef.current >= THROTTLE_MS) {
                        lastFrozenModsUpdateMsRef.current = nowMs;
                        const next = applyStoreModulations(Array.isArray(animatedPrevRef.current)
                            ? animatedPrevRef.current
                            : (sourceLayersRefLocal.current?.current || []));
                        animatedPrevRef.current = next;
                        outRef.current = next;
                    }
                } else {
                    applyModulationsOnly();
                }
            }
            animationFrameId.current = requestAnimationFrame(animate);
            return;
        }

        const speedMultiplier = globalSpeedMultiplierRef.current;
        const zIgnoreVal = zIgnoreRef.current;

        // Evaluate shape tracks directly during playback for frame-accurate interpolation
        // This eliminates race conditions between separate RAF loops
        const tlCtx = timelineContextRef.current;
        let shapeUpdatesMap = new Map();

        if (tlCtx?.isPlaying && tlCtx?.visible && Array.isArray(tlCtx?.tracks)) {
            // Direct evaluation: get current position and evaluate all shape tracks
            const pos = tlCtx.getPositionSeconds?.() ?? tlCtx.positionSeconds ?? 0;
            const currentLayers = sourceLayersRefLocal.current?.current || animatedPrevRef.current || [];

            for (const track of tlCtx.tracks) {
                if (!track.enabled || !track.targetId) continue;

                // Handle global shape tracks
                if (track.type === 'globalShape') {
                    const globalResult = evaluateGlobalShapeTrackAtTime(track, pos, lerpNodes, lerpSubpaths);
                    if (globalResult && Array.isArray(globalResult.layers)) {
                        globalResult.layers.forEach((interpolatedData, index) => {
                            const layer = currentLayers[index];
                            if (!layer || !interpolatedData) return;

                            const updateData = {
                                layerId: layer.id,
                                nodes: interpolatedData.nodes,
                                subpaths: interpolatedData.subpaths,
                                position: interpolatedData.position,
                                shapeParams: interpolatedData.shapeParams,
                                animation: interpolatedData.animation,
                                colors: interpolatedData.colors,
                                base: interpolatedData.base,
                                isGlobalShapeTrack: true,
                            };

                            if (layer.id) shapeUpdatesMap.set(layer.id, updateData);
                            if (layer.name) shapeUpdatesMap.set(layer.name, updateData);
                        });
                    }
                    continue;
                }

                // Handle single-layer shape tracks
                if (track.type === 'shape') {
                    const shapeResult = evaluateShapeTrackAtTime(track, pos, lerpNodes, lerpSubpaths);
                    if (shapeResult) {
                        const parts = track.targetId.split(':');
                        const layerName = parts.length >= 2 ? parts[1] : null;

                        if (layerName) {
                            const updateData = {
                                layerId: layerName,
                                nodes: shapeResult.nodes,
                                subpaths: shapeResult.subpaths,
                                position: shapeResult.position,
                                shapeParams: shapeResult.shapeParams,
                                animation: shapeResult.animation,
                                colors: shapeResult.colors,
                                base: shapeResult.base,
                            };
                            shapeUpdatesMap.set(layerName, updateData);

                            // Also store by layer id if we can find it
                            const matchingLayer = currentLayers.find(l => l?.name === layerName);
                            if (matchingLayer?.id && matchingLayer.id !== layerName) {
                                shapeUpdatesMap.set(matchingLayer.id, updateData);
                            }
                        }
                    }
                    continue;
                }
            }
        } else {
            // Fallback: use pre-computed shape updates from useTimelineModulation (for scrubbing/paused)
            shapeUpdatesMap = shapeTrackUpdatesRefLocal.current?.current || new Map();
        }

        const computeUpdatedLayers = (prevLayers) => (Array.isArray(prevLayers) ? prevLayers : []).map((layer, _idx) => {
            // Check if this layer has shape track updates
            // Shape tracks target by layer name (e.g., "Layer 1"), so check both name and id
            const shapeUpdate = shapeUpdatesMap.get(layer?.name) || shapeUpdatesMap.get(layer?.id);
            const hasShapeUpdate = !!shapeUpdate;

            // 1. Update layer animation (movement, scale oscillation, etc.)
            // Skip if shape track is controlling this layer (to avoid conflicts with keyframe interpolation)
            // Noise and wobble still apply (they're applied in Canvas, not here)
            let updatedLayer = hasShapeUpdate
                ? { ...layer }
                : updateLayerAnimation(layer, speedMultiplier, zIgnoreVal);

            // 2. Apply shape track updates if present (at animation loop framerate for smoothness)
            // During playback, timeline is authoritative - always apply geometry
            // Node edit protection only applies when paused (handled by useTimelineModulation)
            if (shapeUpdate) {
                const nodeEditActive = !!isNodeEditModeRef.current;
                const editContext = nodeEditContextRef.current;

                // Check if this specific layer is being node-edited
                const isEditedLayer = editContext && (
                    layer?.id === editContext.layerId ||
                    layer?.name === editContext.layerName
                );

                // During playback, apply geometry unless user is actively editing THIS layer
                // (indicated by nodeEditMode being active for this specific layer)
                const shouldBlockGeometry = nodeEditActive && isEditedLayer;

                // Helper for runtime blending
                const lerp = (a, b, t) => a + (b - a) * t;

                // Compute energy factor for this frame (energy * influence)
                // When energy scaling is enabled, per-slider t = sliderValue * energyFactor
                // When disabled, t = sliderValue directly (full variation at slider max)
                const eEnabled = enableEnergyScalingRef.current;
                const eInfluence = energyInfluenceRef.current ?? 0.5;
                const tlCtxForEnergy = timelineContextRef.current;
                let energyFactor = 1; // default: no energy scaling
                if (eEnabled) {
                    // Use per-track energy band (total/low/mid/high)
                    const energyBands = tlCtxForEnergy?.energyMap || {};
                    const bandKey = shapeUpdate.energyBand || 'total';
                    const eMap = energyBands[bandKey] || energyBands.total || [];
                    const playPos = tlCtxForEnergy?.getPositionSeconds?.() ?? tlCtxForEnergy?.positionSeconds ?? 0;
                    if (eMap.length > 0 && eInfluence > 0) {
                        const rawEnergy = getEnergyAtTime(eMap, playPos);
                        energyFactor = Math.max(0, Math.min(2, rawEnergy * eInfluence));
                    } else {
                        energyFactor = eInfluence;
                    }
                }

                const getT = (param) => {
                    const val = layer[param] ?? layer.variation ?? 0.2;
                    const sliderT = Math.max(0, Math.min(1, Number(val)));
                    // With energy: slider controls ceiling, energy drives how much of that ceiling shows
                    // Without energy: slider value is the blend directly
                    return eEnabled
                        ? Math.max(0, Math.min(1, sliderT * energyFactor))
                        : sliderT;
                };

                // Runtime Blending Logic
                // If shapeUpdate has 'base' data (unvaried state), we blend between base and varied
                // using the current live slider values (t) * energy. This allows sliders to act as multipliers at playback.
                if (shapeUpdate.base) {
                    // 1. Geometry Blending
                    if (!shouldBlockGeometry) {
                        const tShape = getT('variationShape');
                        let geometryApplied = false;

                        // Try subpaths
                        if (shapeUpdate.subpaths && shapeUpdate.base.subpaths && lerpSubpaths) {
                            const blended = lerpSubpaths(shapeUpdate.base.subpaths, shapeUpdate.subpaths, tShape);
                            if (blended) {
                                updatedLayer.subpaths = blended;
                                updatedLayer.nodes = undefined;
                                geometryApplied = true;
                            }
                        }
                        // Try nodes
                        else if (updatedLayer.subpaths === undefined && shapeUpdate.nodes && shapeUpdate.base.nodes && lerpNodes) {
                            const blended = lerpNodes(shapeUpdate.base.nodes, shapeUpdate.nodes, tShape);
                            if (blended) {
                                updatedLayer.nodes = blended;
                                updatedLayer.subpaths = undefined;
                                geometryApplied = true;
                            }
                        }

                        // Fallback if blending failed but update exists
                        if (!geometryApplied) {
                            if (shapeUpdate.base?.subpaths) {
                                updatedLayer.subpaths = shapeUpdate.base.subpaths;
                                updatedLayer.nodes = undefined;
                                geometryApplied = true;
                            } else if (shapeUpdate.base?.nodes) {
                                updatedLayer.nodes = shapeUpdate.base.nodes;
                                updatedLayer.subpaths = undefined;
                                geometryApplied = true;
                            }
                        }
                        if (!geometryApplied) {
                            if (shapeUpdate.subpaths) {
                                updatedLayer.subpaths = shapeUpdate.subpaths;
                                updatedLayer.nodes = undefined;
                            } else if (shapeUpdate.nodes) {
                                updatedLayer.nodes = shapeUpdate.nodes;
                                updatedLayer.subpaths = undefined;
                            }
                        }
                    }

                    // 2. Position/Scale Blending
                    if (shapeUpdate.position && shapeUpdate.base.position) {
                        const tPos = getT('variationPosition');
                        const tScale = getT('variationScale'); // Use scale slider if available? Or Position?
                        // Actually variationScale defaults to 0 usually, but let's use it if distinct
                        // If variationScale is not set/used, maybe use variationPosition? 
                        // Base logic used normalizedWeights for keyframe gen.

                        const pBase = shapeUpdate.base.position;
                        const pVar = shapeUpdate.position;
                        const curPos = updatedLayer.position || { x: 0.5, y: 0.5, scale: 1 };

                        updatedLayer.position = {
                            ...curPos,
                            x: lerp(pBase.x ?? 0.5, pVar.x ?? 0.5, tPos),
                            y: lerp(pBase.y ?? 0.5, pVar.y ?? 0.5, tPos),
                            // Use scale slider for scale, fall back to position slider
                            scale: lerp(pBase.scale ?? 1, pVar.scale ?? 1, tScale > 0 ? tScale : tPos),
                            xOffset: lerp(pBase.xOffset ?? 0, pVar.xOffset ?? 0, tPos),
                            yOffset: lerp(pBase.yOffset ?? 0, pVar.yOffset ?? 0, tPos),
                        };
                    }

                    // 3. Shape Params Blending
                    if (shapeUpdate.shapeParams && shapeUpdate.base.shapeParams) {
                        const tShape = getT('variationShape');
                        const sBase = shapeUpdate.base.shapeParams;
                        const sVar = shapeUpdate.shapeParams;

                        updatedLayer.numSides = Math.round(lerp(sBase.numSides ?? 6, sVar.numSides ?? 6, tShape));
                        updatedLayer.curviness = lerp(sBase.curviness ?? 1.0, sVar.curviness ?? 1.0, tShape);
                        updatedLayer.radiusFactor = lerp(sBase.radiusFactor ?? 0.125, sVar.radiusFactor ?? 0.125, tShape);
                        updatedLayer.radiusFactorX = lerp(sBase.radiusFactorX ?? sBase.radiusFactor ?? 0.125, sVar.radiusFactorX ?? sVar.radiusFactor ?? 0.125, tShape);
                        updatedLayer.radiusFactorY = lerp(sBase.radiusFactorY ?? sBase.radiusFactor ?? 0.125, sVar.radiusFactorY ?? sVar.radiusFactor ?? 0.125, tShape);
                        updatedLayer.rotation = lerp(sBase.rotation ?? 0, sVar.rotation ?? 0, tShape);
                    }

                    // 4. Animation Params Blending
                    if (shapeUpdate.animation && shapeUpdate.base.animation) {
                        const tAnim = getT('variationAnim');
                        const aBase = shapeUpdate.base.animation;
                        const aVar = shapeUpdate.animation;

                        updatedLayer.movementSpeed = lerp(aBase.movementSpeed ?? 1, aVar.movementSpeed ?? 1, tAnim);
                        updatedLayer.movementAngle = lerp(aBase.movementAngle ?? 45, aVar.movementAngle ?? 45, tAnim);
                        updatedLayer.scaleSpeed = lerp(aBase.scaleSpeed ?? 0.05, aVar.scaleSpeed ?? 0.05, tAnim);
                        updatedLayer.scaleMin = lerp(aBase.scaleMin ?? 0, aVar.scaleMin ?? 0, tAnim);
                        updatedLayer.scaleMax = lerp(aBase.scaleMax ?? 1.5, aVar.scaleMax ?? 1.5, tAnim);
                        updatedLayer.movementStyle = aVar.movementStyle; // Style not blended
                    }

                    // Colors are tricky to interpolate cheaply here, fallback to Varied state for now
                    // or implement lerpColor array if critical. Given complexity, using Varied state is safer.
                    if (shapeUpdate.colors && Array.isArray(shapeUpdate.colors)) {
                        updatedLayer.colors = shapeUpdate.colors;
                        updatedLayer.numColors = shapeUpdate.colors.length;
                    }

                } else {
                    // Legacy / Standard fallback (no base data)
                    if (!shouldBlockGeometry) {
                        if (shapeUpdate.subpaths) {
                            updatedLayer.subpaths = shapeUpdate.subpaths;
                            updatedLayer.nodes = undefined;
                        } else if (shapeUpdate.nodes) {
                            updatedLayer.nodes = shapeUpdate.nodes;
                            updatedLayer.subpaths = undefined;
                        }
                    }

                    // Apply position interpolation (legacy)
                    if (shapeUpdate.position) {
                        updatedLayer.position = {
                            ...updatedLayer.position,
                            x: shapeUpdate.position.x ?? updatedLayer.position?.x ?? 0.5,
                            y: shapeUpdate.position.y ?? updatedLayer.position?.y ?? 0.5,
                            scale: shapeUpdate.position.scale ?? updatedLayer.position?.scale ?? 1,
                        };
                        if (shapeUpdate.position.xOffset !== undefined) {
                            updatedLayer.xOffset = shapeUpdate.position.xOffset;
                        }
                        if (shapeUpdate.position.yOffset !== undefined) {
                            updatedLayer.yOffset = shapeUpdate.position.yOffset;
                        }
                    }

                    // Apply shape params (legacy)
                    if (shapeUpdate.shapeParams) {
                        const sp = shapeUpdate.shapeParams;
                        if (sp.numSides !== undefined) updatedLayer.numSides = sp.numSides;
                        if (sp.curviness !== undefined) updatedLayer.curviness = sp.curviness;
                        if (sp.radiusFactor !== undefined) updatedLayer.radiusFactor = sp.radiusFactor;
                        if (sp.radiusFactorX !== undefined) updatedLayer.radiusFactorX = sp.radiusFactorX;
                        if (sp.radiusFactorY !== undefined) updatedLayer.radiusFactorY = sp.radiusFactorY;
                        if (sp.rotation !== undefined) updatedLayer.rotation = sp.rotation;
                    }

                    // Apply animation parameters (legacy)
                    if (shapeUpdate.animation) {
                        const anim = shapeUpdate.animation;
                        if (anim.movementStyle !== undefined) updatedLayer.movementStyle = anim.movementStyle;
                        if (anim.movementSpeed !== undefined) updatedLayer.movementSpeed = anim.movementSpeed;
                        if (anim.movementAngle !== undefined) updatedLayer.movementAngle = anim.movementAngle;
                        if (anim.scaleSpeed !== undefined) updatedLayer.scaleSpeed = anim.scaleSpeed;
                        if (anim.scaleMin !== undefined) updatedLayer.scaleMin = anim.scaleMin;
                        if (anim.scaleMax !== undefined) updatedLayer.scaleMax = anim.scaleMax;
                    }

                    // Apply colors (legacy)
                    if (shapeUpdate.colors && Array.isArray(shapeUpdate.colors) && shapeUpdate.colors.length > 0) {
                        updatedLayer.colors = shapeUpdate.colors;
                        updatedLayer.numColors = shapeUpdate.colors.length;
                    }
                }
            }

            // 3. Apply Audio/BPM/Timeline modulations from the store (single pass)
            const store = modulationStoreRef.current;
            if (store && store.bpmModsRef && store.audioModsRef) {
                const timelineMods = store.timelineModsRef?.current || {};
                const effectiveBpmMods = store.bpmModsRef.current;
                const effectiveAudioMods = store.audioModsRef.current;
                updatedLayer = applyModulationsToLayer(
                    updatedLayer,
                    effectiveBpmMods,
                    effectiveAudioMods,
                    timelineMods
                );
            }

            return updatedLayer;
        });

        if (refMode) {
            const baseLayers = sourceLayersRefLocal.current?.current;
            const prevForStep = Array.isArray(animatedPrevRef.current)
                ? animatedPrevRef.current
                : (Array.isArray(baseLayers) ? baseLayers : []);
            const next = computeUpdatedLayers(prevForStep);
            animatedPrevRef.current = next;
            outRef.current = next;
        } else if (shouldSyncToReact) {
            // Only sync to React state on throttled frames to prevent update depth errors
            frameCountRef.current = 0;
            const setLayersFn = setLayersRef.current;
            if (typeof setLayersFn !== 'function') {
                animationFrameId.current = requestAnimationFrame(animate);
                return;
            }
            const runWithoutDirtyFn = runWithoutDirtyRef.current;

            const applyUpdate = () => setLayersFn(computeUpdatedLayers);

            if (typeof runWithoutDirtyFn === 'function') {
                runWithoutDirtyFn(applyUpdate);
            } else {
                applyUpdate();
            }
        }

        animationFrameId.current = requestAnimationFrame(animate);
    }, [applyModulationsOnly, mergeBaseIntoAnimated, applyStoreModulations]); // stable

    // Start animation loop once on mount
    useEffect(() => {
        animationFrameId.current = requestAnimationFrame(animate);
        return () => {
            if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
            animationFrameId.current = null;
        };
    }, [animate]);
};
