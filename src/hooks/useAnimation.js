import { useEffect, useRef, useCallback } from 'react';
import { useAppState } from '../context/AppStateContext.jsx';
import { applyModulationsToLayer } from './useModulationStore.js';

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
const applyBPMModulations = (layer, bpmContext) => {
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
const applyAudioModulations = (layer, audioContext) => {
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
 * @param {Object} shapeTrackUpdatesRef - Ref containing shape track updates from timeline
 * @param {Object} sourceLayersRef - Optional ref to base layers (for ref-mode animation)
 * @param {Object} animatedLayersRef - Optional ref to write animated layers into (avoids React updates)
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
) => {
    const animationFrameId = useRef(null);
    const { runWithoutDirty, isUserInteracting, isNodeEditMode, nodeEditContext } = useAppState() || {};
    
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

    const mergeBaseIntoAnimated = useCallback((baseLayers, prevAnimated, prevBasePosById) => {
        if (!Array.isArray(baseLayers) || baseLayers.length === 0) return Array.isArray(baseLayers) ? baseLayers : [];
        if (!Array.isArray(prevAnimated) || prevAnimated.length === 0) return baseLayers;

        const prevById = new Map();
        prevAnimated.forEach((l) => { if (l?.id) prevById.set(l.id, l); });

        return baseLayers.map((baseLayer) => {
            const prev = baseLayer?.id ? prevById.get(baseLayer.id) : null;
            if (!prev) return baseLayer;

            const prevPos = prev?.position;
            const basePos = baseLayer?.position;
            // Merge positions: start with prev animated position, but let base position
            // override for properties that have explicitly changed in the base layer.
            // The key insight is that animated x/y should be preserved (they're the current
            // trajectory position), but other base properties should flow through.
            const mergedPosition = (prevPos && typeof prevPos === 'object')
                ? {
                    // Start with base position properties (non-animated values like vx, vy, scaleDirection)
                    ...(basePos && typeof basePos === 'object' ? basePos : {}),
                    // Preserve animated x, y from previous frame (the actual trajectory position)
                    x: prevPos.x ?? basePos?.x ?? 0.5,
                    y: prevPos.y ?? basePos?.y ?? 0.5,
                    // Preserve animated scale (z-axis oscillation)
                    scale: prevPos.scale ?? basePos?.scale ?? 1,
                    scaleDirection: prevPos.scaleDirection ?? basePos?.scaleDirection ?? 1,
                }
                : basePos;

            // If the base layer explicitly changed its position (e.g. via UI drag or slider),
            // let that change through immediately even in ref-mode (otherwise we keep the previous animated position).
            // We detect this by comparing to the last base position snapshot.
            try {
                const lastBasePos = (prevBasePosById && baseLayer?.id) ? prevBasePosById.get(baseLayer.id) : null;
                if (lastBasePos && mergedPosition && typeof mergedPosition === 'object' && basePos && typeof basePos === 'object') {
                    // Check if x changed in base layer
                    const baseX = basePos.x;
                    const lastX = lastBasePos.x;
                    if (Number.isFinite(Number(baseX)) && Number.isFinite(Number(lastX)) && Number(baseX) !== Number(lastX)) {
                        mergedPosition.x = Number(baseX);
                    }
                    // Check if y changed in base layer
                    const baseY = basePos.y;
                    const lastY = lastBasePos.y;
                    if (Number.isFinite(Number(baseY)) && Number.isFinite(Number(lastY)) && Number(baseY) !== Number(lastY)) {
                        mergedPosition.y = Number(baseY);
                    }
                    // Check if scale changed in base layer
                    const baseScale = basePos.scale;
                    const lastScale = lastBasePos.scale;
                    if (Number.isFinite(Number(baseScale)) && Number.isFinite(Number(lastScale)) && Number(baseScale) !== Number(lastScale)) {
                        mergedPosition.scale = Number(baseScale);
                    }
                }
            } catch { /* noop */ }

            return {
                ...baseLayer,
                position: mergedPosition,
                orbitAngle: prev?.orbitAngle ?? baseLayer?.orbitAngle,
                spinAngle: prev?.spinAngle ?? baseLayer?.spinAngle,
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
                // Debug: log when merge is triggered
                if (animatedPrevRef.current?.[0]?.position) {
                    console.log('[useAnimation] MERGE triggered - prevAnimated[0].pos:', 
                        animatedPrevRef.current[0].position.x?.toFixed(3), 
                        animatedPrevRef.current[0].position.y?.toFixed(3),
                        'baseLayers[0].pos:',
                        baseLayers[0]?.position?.x?.toFixed(3),
                        baseLayers[0]?.position?.y?.toFixed(3));
                }
                const prevBasePosById = lastBasePosByIdRef.current;
                lastBaseLayersRef.current = baseLayers;
                animatedPrevRef.current = mergeBaseIntoAnimated(baseLayers, animatedPrevRef.current, prevBasePosById);
                // Debug: log result after merge
                if (animatedPrevRef.current?.[0]?.position) {
                    console.log('[useAnimation] AFTER MERGE - animatedPrev[0].pos:', 
                        animatedPrevRef.current[0].position.x?.toFixed(3), 
                        animatedPrevRef.current[0].position.y?.toFixed(3));
                }
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

        // Get shape track updates from the ref (set by useTimelineModulation)
        // shapeTrackUpdatesRefLocal.current is the ref object passed in
        // shapeTrackUpdatesRefLocal.current.current is the actual Map
        const shapeUpdatesMap = shapeTrackUpdatesRefLocal.current?.current || new Map();
        
        // Debug: log when we have shape updates
        if (shapeUpdatesMap.size > 0 && Math.random() < 0.016) {
            console.log('[Animation] receiving shapeUpdates:', shapeUpdatesMap.size, 'entries');
        }

        const computeUpdatedLayers = (prevLayers) => (Array.isArray(prevLayers) ? prevLayers : []).map((layer, idx) => {
            // Check if this layer has shape track updates
            // Shape tracks target by layer name (e.g., "Layer 1"), so check both name and id
            const shapeUpdate = shapeUpdatesMap.get(layer?.name) || shapeUpdatesMap.get(layer?.id);
            const hasShapeUpdate = !!shapeUpdate;
            
            // Debug: log shape update application
            if (hasShapeUpdate && idx === 0 && Math.random() < 0.016) {
                console.log('[Animation] applying shapeUpdate to layer', layer?.name, 'pos:', shapeUpdate.position?.x?.toFixed(2), shapeUpdate.position?.y?.toFixed(2));
            }
            
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
                
                if (!shouldBlockGeometry) {
                    if (shapeUpdate.subpaths) {
                        updatedLayer.subpaths = shapeUpdate.subpaths;
                        updatedLayer.nodes = undefined;
                    } else if (shapeUpdate.nodes) {
                        updatedLayer.nodes = shapeUpdate.nodes;
                        updatedLayer.subpaths = undefined;
                    }
                }
                
                // Apply position interpolation
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
                
                // Apply shape params (Layer Shape Tab: Sides, Curviness, Size, Size X, Size Y, Rotate)
                if (shapeUpdate.shapeParams) {
                    const sp = shapeUpdate.shapeParams;
                    if (sp.numSides !== undefined) updatedLayer.numSides = sp.numSides;
                    if (sp.curviness !== undefined) updatedLayer.curviness = sp.curviness;
                    if (sp.radiusFactor !== undefined) updatedLayer.radiusFactor = sp.radiusFactor;
                    if (sp.radiusFactorX !== undefined) updatedLayer.radiusFactorX = sp.radiusFactorX;
                    if (sp.radiusFactorY !== undefined) updatedLayer.radiusFactorY = sp.radiusFactorY;
                    if (sp.rotation !== undefined) updatedLayer.rotation = sp.rotation;
                }
                
                // Apply animation parameters if present
                if (shapeUpdate.animation) {
                    const anim = shapeUpdate.animation;
                    if (anim.movementStyle !== undefined) updatedLayer.movementStyle = anim.movementStyle;
                    if (anim.movementSpeed !== undefined) updatedLayer.movementSpeed = anim.movementSpeed;
                    if (anim.movementAngle !== undefined) updatedLayer.movementAngle = anim.movementAngle;
                    if (anim.scaleSpeed !== undefined) updatedLayer.scaleSpeed = anim.scaleSpeed;
                    if (anim.scaleMin !== undefined) updatedLayer.scaleMin = anim.scaleMin;
                    if (anim.scaleMax !== undefined) updatedLayer.scaleMax = anim.scaleMax;
                }
                
                // Apply colors if present
                if (shapeUpdate.colors && Array.isArray(shapeUpdate.colors) && shapeUpdate.colors.length > 0) {
                    updatedLayer.colors = shapeUpdate.colors;
                    updatedLayer.numColors = shapeUpdate.colors.length;
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
