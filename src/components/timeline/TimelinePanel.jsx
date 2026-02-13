import React, { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import { useTimeline } from '../../context/TimelineContext.jsx';
import { useAppState } from '../../context/AppStateContext.jsx';
import TimelineWaveform from './TimelineWaveform.jsx';
import TimelineTrackRow from './TimelineTrackRow.jsx';
import TimelineTransport from './TimelineTransport.jsx';
import { computeInitialNodes } from '../../utils/nodeUtils.js';

const cloneForKeyframe = (value) => {
  if (value == null) return value;
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch { /* noop */ }
  }
  return JSON.parse(JSON.stringify(value));
};

/**
 * TimelinePanel - Main timeline UI component
 * 
 * Displays in the lower half of the screen when visible.
 * Contains:
 * - Transport controls (play, pause, stop, time display)
 * - Audio waveform display (optional)
 * - Track list with curve editors
 * - Scrollable timeline area
 */
const TimelinePanel = ({
  layers = [],
  animatedLayersRef,
  onClose,
  isRecording = false,
  onStartRecording,
  onStopRecording,
  onGenerateVariationKeyframe,
  onGenerateRandomKeyframes,
  onFillKeyframesBetween,
  onCaptureGlobalKeyframe,
  panelGenerateRandomRef,
}) => {
  const timeline = useTimeline();
  const {
    getCurrentAppState,
    loadAppState,
    setIsFrozen,
    isFrozen,
    enableBreathing,
    setEnableBreathing,
    enableEnergyScaling,
    setEnableEnergyScaling,
    energyInfluence,
    setEnergyInfluence,
    isNodeEditMode,
    nodeEditContext,
  } = useAppState() || {};
  const containerRef = useRef(null);
  const tracksContainerRef = useRef(null);
  const [showWaveform, setShowWaveform] = useState(true);
  const {
    tracks,
    lengthSeconds,
    loop,
    audio,
    startPreset,
    setStartPreset,
    clearStartPreset,
    isPlaying,
    positionSeconds,
    visible,
    zoom,
    scrollLeft,
    play,
    pause,
    stop,
    togglePlay,
    seekTo,
    setLengthSeconds,
    setLoop,
    addTrack,
    updateTrack,
    removeTrack,
    addKeyframe,
    addColorKeyframe,
    updateKeyframe,
    removeKeyframe,
    addShapeKeyframe,
    captureGlobalShapeKeyframe,
    generateGlobalVariationKeyframe,
    rerollGlobalShapeKeyframe,
    keyframeClipboard,
    copyKeyframe,
    pasteKeyframe,
    pasteKeyframeToTrack,
    loadAudioFile,
    clearAudio,
    setZoom,
    setScrollLeft,
    getPositionSeconds,
    transients,
    transientSettings,
    setTransientSensitivity,
    setTransientsEnabled,
    energyMap,
  } = timeline || {};

  const rulerHeight = 44;
  const [randomCount, setRandomCount] = useState(5);
  const [fillCount, setFillCount] = useState(3);
  const [genStartTime, setGenStartTime] = useState('');
  const [genEndTime, setGenEndTime] = useState('');
  const [useTransientTimes, setUseTransientTimes] = useState(true);
  const [useNodeMod, setUseNodeMod] = useState(false);
  const [nodeModAmount, setNodeModAmount] = useState(0.15);
  const [nodeModCycles, setNodeModCycles] = useState(1);

  const hasTimelinePreset = !!(startPreset && startPreset.appState);

  // Compute all shape tracks for paste menu
  const allShapeTracks = useMemo(() => {
    if (!Array.isArray(tracks)) return [];
    return tracks.filter(t => t.type === 'shape' || t.targetId?.endsWith(':shape'));
  }, [tracks]);

  // Get clipboard track type and source for paste menu logic
  const clipboardTrackType = keyframeClipboard?.trackType || null;
  const clipboardSourceTargetId = keyframeClipboard?.trackTargetId || null;

  // While in node edit mode, automatically write node edits back into the active shape keyframe
  // when the playhead is sitting on that keyframe. This matches "edit keyframe in place" behaviour.
  const nodeEditCommitTimerRef = useRef(null);
  const latestNodeEditCommitRef = useRef(null);
  const lastCommittedNodeHashByKeyRef = useRef(new Map());
  const lastNodeEditStateRef = useRef(false);

  useEffect(() => {
    if (!isNodeEditMode) return;
    if (!nodeEditContext) return;
    if (!Array.isArray(tracks) || tracks.length === 0) return;
    if (!Array.isArray(layers) || layers.length === 0) return;
    if (isPlaying) return;

    const layerName = nodeEditContext.layerName || null;
    const layerId = nodeEditContext.layerId || null;

    // Find layer index to get animated layer data
    const layerIndex = layers.findIndex(l => (layerId && l?.id === layerId) || (layerName && l?.name === layerName));
    const editedLayer = layerIndex >= 0 ? layers[layerIndex] : null;
    if (!editedLayer) return;

    // Get the animated layer which has the current node-edited geometry
    const animatedLayers = animatedLayersRef?.current;
    const animatedLayer = Array.isArray(animatedLayers) && layerIndex >= 0 ? animatedLayers[layerIndex] : null;

    const targetLayerName = editedLayer?.name || layerName || null;
    const targetLayerId = editedLayer?.id || layerId || null;
    if (!targetLayerName && !targetLayerId) return;

    const shapeTracks = tracks.filter((t) => {
      if (!t || t.type !== 'shape' || !t.targetId) return false;
      const parts = String(t.targetId).split(':');
      if (parts.length < 3 || parts[0] !== 'layer' || parts[2] !== 'shape') return false;
      const targetLayer = parts[1];
      return (
        (targetLayerName && targetLayer === targetLayerName) ||
        (targetLayerId && targetLayer === targetLayerId)
      );
    });
    if (shapeTracks.length === 0) return;

    const TIME_EPSILON = 0.01;
    const snappedTime = Math.round((Number(positionSeconds) || 0) / TIME_EPSILON) * TIME_EPSILON;

    // During node edit mode, React state has the authoritative node geometry (Canvas updates it directly)
    // Animated layers may be stale, so prefer React state first
    let nodes = null;
    let subpaths = null;

    // First try React state layer (has current node edits during node edit mode)
    if (Array.isArray(editedLayer.subpaths) && editedLayer.subpaths.length > 0) {
      subpaths = editedLayer.subpaths;
    } else if (Array.isArray(editedLayer.nodes) && editedLayer.nodes.length >= 3) {
      nodes = editedLayer.nodes;
    }

    // Fall back to animated layer if React state doesn't have geometry
    if (!nodes && !subpaths && animatedLayer) {
      if (Array.isArray(animatedLayer.subpaths) && animatedLayer.subpaths.length > 0) {
        subpaths = animatedLayer.subpaths;
      } else if (Array.isArray(animatedLayer.nodes) && animatedLayer.nodes.length >= 3) {
        nodes = animatedLayer.nodes;
      }
    }

    // If still no geometry, compute from numSides
    if (!nodes && !subpaths && editedLayer.layerType === 'shape') {
      nodes = computeInitialNodes(editedLayer.numSides ?? 6);
    }

    if (!nodes && !subpaths) return;

    const extras = {
      position: {
        x: editedLayer.position?.x ?? 0.5,
        y: editedLayer.position?.y ?? 0.5,
        scale: editedLayer.position?.scale ?? 1,
        xOffset: editedLayer.xOffset ?? 0,
        yOffset: editedLayer.yOffset ?? 0,
      },
      shapeParams: {
        numSides: editedLayer.numSides ?? 6,
        curviness: editedLayer.curviness ?? 1.0,
        radiusFactor: editedLayer.radiusFactor ?? 0.125,
        radiusFactorX: editedLayer.radiusFactorX ?? editedLayer.radiusFactor ?? 0.125,
        radiusFactorY: editedLayer.radiusFactorY ?? editedLayer.radiusFactor ?? 0.125,
        rotation: editedLayer.rotation ?? 0,
      },
      animation: null,
      colors: Array.isArray(editedLayer.colors) ? cloneForKeyframe(editedLayer.colors) : ['#0000FF'],
    };

    // Find any keyframe at this time (apply to all matching tracks).
    const commits = [];
    shapeTracks.forEach((t) => {
      const kf = (Array.isArray(t.keyframes) ? t.keyframes : []).find(k => Math.abs((k?.timeSeconds ?? -1) - snappedTime) < TIME_EPSILON);
      if (kf) commits.push({ trackId: t.id, keyframeId: kf.id });
    });

    latestNodeEditCommitRef.current = { commits, nodes, subpaths, shapeTracks, snappedTime, extras };

    if (nodeEditCommitTimerRef.current) return;
    nodeEditCommitTimerRef.current = window.setTimeout(() => {
      nodeEditCommitTimerRef.current = null;
      const snap = latestNodeEditCommitRef.current;
      if (!snap) return;

      const nodesSnap = snap.nodes ? cloneForKeyframe(snap.nodes) : null;
      const subpathsSnap = snap.subpaths ? cloneForKeyframe(snap.subpaths) : null;
      const hash = `${nodesSnap ? JSON.stringify(nodesSnap) : ''}|${subpathsSnap ? JSON.stringify(subpathsSnap) : ''}`;

      if (Array.isArray(snap.commits) && snap.commits.length > 0) {
        snap.commits.forEach(({ trackId, keyframeId }) => {
          const key = `${trackId}:${keyframeId}`;
          const lastHash = lastCommittedNodeHashByKeyRef.current.get(key);
          if (lastHash === hash) return;
          updateKeyframe?.(trackId, keyframeId, { nodes: nodesSnap, subpaths: subpathsSnap, ...(snap.extras || {}) });
          lastCommittedNodeHashByKeyRef.current.set(key, hash);
        });
        return;
      }

      // NOTE: We no longer auto-create keyframes when the timeline position changes.
      // Users must explicitly capture keyframes using the UI button.
      // This effect only UPDATES existing keyframes when the playhead is on them.
    }, 80);

    return () => {
      if (nodeEditCommitTimerRef.current) {
        clearTimeout(nodeEditCommitTimerRef.current);
        nodeEditCommitTimerRef.current = null;
      }
    };
  }, [isNodeEditMode, nodeEditContext, tracks, layers, animatedLayersRef, positionSeconds, isPlaying, updateKeyframe, addShapeKeyframe]);

  useEffect(() => () => {
    if (nodeEditCommitTimerRef.current) {
      clearTimeout(nodeEditCommitTimerRef.current);
      nodeEditCommitTimerRef.current = null;
    }
  }, []);

  // Final safety: when exiting node edit mode, force a last commit so edits don't get lost.
  useEffect(() => {
    const prevInEdit = lastNodeEditStateRef.current;
    const currInEdit = !!isNodeEditMode;
    lastNodeEditStateRef.current = currInEdit;
    if (!prevInEdit || currInEdit) return;

    const snap = latestNodeEditCommitRef.current;
    if (!snap) return;
    const TIME_EPSILON = 0.01;
    const nodesSnap = snap.nodes ? cloneForKeyframe(snap.nodes) : null;
    const subpathsSnap = snap.subpaths ? cloneForKeyframe(snap.subpaths) : null;
    if (!nodesSnap && !subpathsSnap) return;

    // Only update existing keyframes, don't create new ones on exit
    (Array.isArray(snap.shapeTracks) ? snap.shapeTracks : []).forEach((t) => {
      const kf = (Array.isArray(t.keyframes) ? t.keyframes : []).find(k => Math.abs((k?.timeSeconds ?? -1) - snap.snappedTime) < TIME_EPSILON);
      if (kf) {
        updateKeyframe?.(t.id, kf.id, { nodes: nodesSnap, subpaths: subpathsSnap, ...(snap.extras || {}) });
      }
      // Don't auto-create keyframes on exit - user must explicitly capture them
    });
  }, [isNodeEditMode, updateKeyframe]);

  // Calculate pixels per second based on container width and zoom
  const [containerWidth, setContainerWidth] = useState(800);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateWidth = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width > 0) {
        setContainerWidth(rect.width);
      }
    };

    updateWidth();
    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  // Pixels per second (zoom level)
  const pixelsPerSecond = useMemo(() => {
    // Base: fit entire timeline in view at zoom=1
    const basePixelsPerSecond = (containerWidth - 200) / Math.max(1, lengthSeconds);
    return basePixelsPerSecond * (zoom || 1);
  }, [containerWidth, lengthSeconds, zoom]);

  // Keep pixelsPerSecond in a ref for RAF access
  const pixelsPerSecondRef = useRef(pixelsPerSecond);
  useEffect(() => { pixelsPerSecondRef.current = pixelsPerSecond; }, [pixelsPerSecond]);

  // Auto-scroll to keep playhead visible during playback
  useEffect(() => {
    if (!isPlaying || !getPositionSeconds) return;

    let rafId;

    const autoScroll = () => {
      const pos = getPositionSeconds();
      const pps = pixelsPerSecondRef.current;
      const xAbsolute = pos * pps;

      // Auto-scroll to keep playhead visible during playback
      const container = tracksContainerRef.current;
      if (container) {
        const currentScroll = container.scrollLeft;
        const viewWidth = container.clientWidth - 200; // Subtract track labels width
        const playheadScreenX = xAbsolute - currentScroll;

        // Scroll when playhead reaches right 20% of view
        const scrollThreshold = viewWidth * 0.8;
        if (playheadScreenX > scrollThreshold) {
          // Scroll to put playhead at 20% from left
          const targetScroll = Math.max(0, xAbsolute - viewWidth * 0.2);
          container.scrollLeft = targetScroll;
        }
        // Also handle if playhead is before current view (e.g., after loop)
        else if (playheadScreenX < 0) {
          container.scrollLeft = Math.max(0, xAbsolute - viewWidth * 0.1);
        }
      }

      rafId = requestAnimationFrame(autoScroll);
    };

    rafId = requestAnimationFrame(autoScroll);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [isPlaying, getPositionSeconds]);

  // Scroll to show playhead when position changes significantly (e.g., stop/rewind)
  useEffect(() => {
    if (isPlaying) return; // Don't interfere with playback auto-scroll

    const xAbsolute = positionSeconds * pixelsPerSecond;
    const xScreen = xAbsolute - (scrollLeft || 0);
    const viewWidth = containerWidth - 200;

    // If playhead is off-screen, scroll to show it
    if (xScreen < 0 || xScreen > viewWidth) {
      // Center the playhead in view, or scroll to 0 if at start
      const newScroll = positionSeconds < 0.1 ? 0 : Math.max(0, xAbsolute - viewWidth / 2);
      if (setScrollLeft) {
        setScrollLeft(newScroll);
      }
      // Also scroll the DOM element
      if (tracksContainerRef.current) {
        tracksContainerRef.current.scrollLeft = newScroll;
      }
    }
  }, [positionSeconds, isPlaying, pixelsPerSecond, scrollLeft, containerWidth, setScrollLeft]);

  // Total timeline width in pixels
  const timelineWidth = useMemo(() => {
    return Math.max(containerWidth - 200, lengthSeconds * pixelsPerSecond);
  }, [containerWidth, lengthSeconds, pixelsPerSecond]);

  // Handle scroll to sync horizontal scroll between ruler, waveform, and tracks
  const handleScroll = useCallback((e) => {
    if (setScrollLeft) {
      setScrollLeft(e.target.scrollLeft);
    }
  }, [setScrollLeft]);

  // Keep scroll position in sync with persisted setting (e.g., after reload)
  useEffect(() => {
    const scroller = tracksContainerRef.current;
    if (!scroller) return;
    const target = scrollLeft || 0;
    if (Math.abs(scroller.scrollLeft - target) > 1) {
      scroller.scrollLeft = target;
    }
  }, [scrollLeft]);

  // Handle zoom with mouse wheel
  const handleWheel = useCallback((e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      if (setZoom) {
        setZoom((zoom || 1) * delta);
      }
    }
  }, [zoom, setZoom]);

  // When starting playback from the beginning, always unfreeze the scene
  const handlePlay = useCallback(() => {
    if (!isPlaying && (positionSeconds ?? 0) <= 0.001 && setIsFrozen) {
      setIsFrozen(false);
    }
    if (play) play();
  }, [isPlaying, positionSeconds, play, setIsFrozen]);

  const handleTogglePlay = useCallback(() => {
    if (!isPlaying && (positionSeconds ?? 0) <= 0.001 && setIsFrozen) {
      setIsFrozen(false);
    }
    if (togglePlay) togglePlay();
  }, [isPlaying, positionSeconds, togglePlay, setIsFrozen]);

  // Global parameters - per user list
  const globalParameters = useMemo(() => [
    { id: 'globalSpeedMultiplier', label: 'Speed', range: { outputMin: 0, outputMax: 5 } },
    { id: 'globalPaletteIndex', label: 'Palette', range: { outputMin: 0, outputMax: 20 } },
    { id: 'globalBlendMode', label: 'Style', range: { outputMin: 0, outputMax: 1 } },
    { id: 'globalOpacity', label: 'Opacity', range: { outputMin: 0, outputMax: 1 } },
    { id: 'backgroundColor', label: 'Background', type: 'color' },
    { id: 'layersCount', label: 'Layers', range: { outputMin: 1, outputMax: 20 } },
    { id: 'variationPosition', label: 'Position Variation', range: { outputMin: 0, outputMax: 1 } },
    { id: 'variationShape', label: 'Shape Variation', range: { outputMin: 0, outputMax: 1 } },
    { id: 'variationAnim', label: 'Animation Variation', range: { outputMin: 0, outputMax: 1 } },
    { id: 'variationColor', label: 'Colour Variation', range: { outputMin: 0, outputMax: 1 } },
    { id: 'variationScale', label: 'Scale Variation', range: { outputMin: 0, outputMax: 1 } },
    { id: 'morphProgress', label: 'Morph Progress', range: { outputMin: 0, outputMax: 1 } },
  ], []);

  // Layer parameters - per user list
  const layerParameters = useMemo(() => [
    { id: 'shape', label: '⬡ Shape (nodes)', type: 'shape' }, // Shape track - no range
    { id: 'numSides', label: 'Sides', range: { outputMin: 3, outputMax: 24 } },
    { id: 'curviness', label: 'Curviness', range: { outputMin: 0, outputMax: 1 } },
    { id: 'radiusFactor', label: 'Size', range: { outputMin: 0, outputMax: 2 } },
    { id: 'radiusFactorX', label: 'Size X', range: { outputMin: 0, outputMax: 2 } },
    { id: 'radiusFactorY', label: 'Size Y', range: { outputMin: 0, outputMax: 2 } },
    { id: 'xOffset', label: 'X Offset', range: { outputMin: -1, outputMax: 1 } },
    { id: 'yOffset', label: 'Y Offset', range: { outputMin: -1, outputMax: 1 } },
    { id: 'rotation', label: 'Rotate', range: { outputMin: -180, outputMax: 180 } },
    { id: 'wobble', label: 'Wobble', range: { outputMin: 0, outputMax: 1 } },
    { id: 'noiseAmount', label: 'Noise', range: { outputMin: 0, outputMax: 1 } },
    // Movement style is treated as a discrete enum; timeline uses 0..4 to select styles
    { id: 'movementStyle', label: 'Movement Style', range: { outputMin: 0, outputMax: 4 } },
    { id: 'movementSpeed', label: 'Movement Speed', range: { outputMin: 0, outputMax: 5 } },
    { id: 'movementAngle', label: 'Angle', range: { outputMin: 0, outputMax: 360 } },
    { id: 'scaleSpeed', label: 'Z Speed', range: { outputMin: 0, outputMax: 1 } },
    { id: 'scaleMin', label: 'Z Min', range: { outputMin: 0, outputMax: 2 } },
    { id: 'scaleMax', label: 'Z Max', range: { outputMin: 0, outputMax: 3 } },
    { id: 'color', label: 'Layer Colour', type: 'color' },
  ], []);

  // Handle adding a new track
  const handleAddTrack = useCallback(() => {
    if (addTrack) {
      addTrack(`Track ${(tracks?.length || 0) + 1}`, '');
    }
  }, [addTrack, tracks?.length]);

  // Handle adding a layer shape track for the currently selected layer
  const handleAddLayerShapeTrack = useCallback(() => {
    if (!addTrack) return;
    const appState = getCurrentAppState?.();
    const selectedIndex = appState?.selectedLayerIndex ?? 0;
    const layer = layers?.[selectedIndex];
    if (!layer) return;
    const layerName = layer.name || `Layer ${selectedIndex + 1}`;
    // Check if a shape track already exists for this layer
    const existing = (tracks || []).find(t =>
      t?.type === 'shape' && String(t.targetId || '').split(':')[1] === layerName
    );
    if (existing) {
      console.log(`Shape track already exists for ${layerName}`);
      return;
    }
    addTrack(`${layerName} Shape`, `layer:${layerName}:shape`, null, null, 'shape');
  }, [addTrack, layers, tracks, getCurrentAppState]);

  // Handle adding a global shape track
  const handleAddGlobalShapeTrack = useCallback(() => {
    if (addTrack) {
      addTrack('Global Shape', 'global:globalShape', null, null, 'globalShape');
    }
  }, [addTrack]);

  // Handle capturing a global shape keyframe (all layers at current time)
  // Use animatedLayersRef to get current rendered geometry (procedural shapes have null nodes in React state)
  const handleCaptureGlobalShapeKeyframe = useCallback((trackId) => {
    if (!captureGlobalShapeKeyframe) return;

    // Prefer animated layers (has rendered geometry) over React state layers
    const animatedLayers = animatedLayersRef?.current;
    const sourceLayers = (Array.isArray(animatedLayers) && animatedLayers.length > 0)
      ? animatedLayers
      : layers;

    if (!sourceLayers?.length) return;
    captureGlobalShapeKeyframe(trackId, sourceLayers);
  }, [captureGlobalShapeKeyframe, layers, animatedLayersRef]);

  // Handle generating a global variation keyframe (apply variation to all layers)
  // Use animatedLayersRef to get current rendered geometry for procedural shapes
  const handleGenerateGlobalVariationKeyframe = useCallback((trackId) => {
    if (!generateGlobalVariationKeyframe) return;

    // Prefer animated layers (has rendered geometry) over React state layers
    const animatedLayers = animatedLayersRef?.current;
    const sourceLayers = (Array.isArray(animatedLayers) && animatedLayers.length > 0)
      ? animatedLayers
      : layers;

    if (!sourceLayers?.length) return;
    generateGlobalVariationKeyframe(trackId, sourceLayers);
  }, [generateGlobalVariationKeyframe, layers, animatedLayersRef]);

  // Handle rerolling a global shape keyframe
  // Use animatedLayersRef to get current rendered geometry for procedural shapes
  const handleRerollGlobalShapeKeyframe = useCallback((trackId, keyframeId) => {
    if (!rerollGlobalShapeKeyframe) return;

    // Prefer animated layers (has rendered geometry) over React state layers
    const animatedLayers = animatedLayersRef?.current;
    const sourceLayers = (Array.isArray(animatedLayers) && animatedLayers.length > 0)
      ? animatedLayers
      : layers;

    if (!sourceLayers?.length) return;
    rerollGlobalShapeKeyframe(trackId, keyframeId, sourceLayers);
  }, [rerollGlobalShapeKeyframe, layers, animatedLayersRef]);

  // Handle capturing a shape keyframe (extended to capture animation and color data)
  const handleCaptureShapeKeyframe = useCallback((trackId, layerIdOrName, timeSecondsOverride = null) => {
    if (!addShapeKeyframe || !layerIdOrName) return;

    // Find the layer to capture its current state
    // TimelineTrackRow now passes the layer NAME (e.g., 'Layer 2') for stable targeting,
    // so resolve by id OR name.
    const layerIndex = layers.findIndex(l => l?.id === layerIdOrName || l?.name === layerIdOrName);
    const layer = layerIndex >= 0 ? layers[layerIndex] : null;
    if (!layer) {
      console.warn('[Timeline] Cannot capture shape: layer not found', layerIdOrName);
      return;
    }

    // Get the animated layer which has the current node-edited geometry
    const animatedLayers = animatedLayersRef?.current;
    const animatedLayer = Array.isArray(animatedLayers) && layerIndex >= 0 ? animatedLayers[layerIndex] : null;

    // Find the track to check which categories are enabled
    const track = tracks?.find(t => t.id === trackId);
    const categories = track?.categories || { shape: true, animation: false, color: false };

    // Capture shape data - prefer React state (has current node edits during node edit mode)
    let nodes = null;
    let subpaths = null;

    // First try React state layer (has current node edits during node edit mode)
    if (Array.isArray(layer.subpaths) && layer.subpaths.length > 0) {
      subpaths = layer.subpaths;
    } else if (Array.isArray(layer.nodes) && layer.nodes.length >= 3) {
      nodes = layer.nodes;
    }

    // Fall back to animated layer if React state doesn't have geometry
    if (!nodes && !subpaths && animatedLayer) {
      if (Array.isArray(animatedLayer.subpaths) && animatedLayer.subpaths.length > 0) {
        subpaths = animatedLayer.subpaths;
      } else if (Array.isArray(animatedLayer.nodes) && animatedLayer.nodes.length >= 3) {
        nodes = animatedLayer.nodes;
      }
    }

    // If still no geometry, compute from numSides
    if (!nodes && !subpaths && layer.layerType === 'shape') {
      nodes = computeInitialNodes(layer.numSides ?? 6);
    }

    const clonedNodes = nodes ? cloneForKeyframe(nodes) : null;
    const clonedSubpaths = subpaths ? cloneForKeyframe(subpaths) : null;

    // Build extras object based on enabled categories
    const extras = {};

    // Always capture position (for shape interpolation between screen positions)
    // Position includes x, y offsets and scale from layer.position
    extras.position = {
      x: layer.position?.x ?? 0.5,
      y: layer.position?.y ?? 0.5,
      scale: layer.position?.scale ?? 1,
      xOffset: layer.xOffset ?? 0,
      yOffset: layer.yOffset ?? 0,
    };

    // Always capture shape tab properties for tweening
    // These are the Layer Shape Tab controls: Sides, Curviness, Size, Size X, Size Y, Rotate
    extras.shapeParams = {
      numSides: layer.numSides ?? 6,
      curviness: layer.curviness ?? 1.0,
      radiusFactor: layer.radiusFactor ?? 0.125,
      radiusFactorX: layer.radiusFactorX ?? layer.radiusFactor ?? 0.125,
      radiusFactorY: layer.radiusFactorY ?? layer.radiusFactor ?? 0.125,
      rotation: layer.rotation ?? 0,
    };

    // Capture animation parameters if enabled
    if (categories.animation) {
      extras.animation = {
        movementStyle: layer.movementStyle ?? 'bounce',
        movementSpeed: layer.movementSpeed ?? 1,
        movementAngle: layer.movementAngle ?? 45,
        scaleSpeed: layer.scaleSpeed ?? 0.05,
        scaleMin: layer.scaleMin ?? 0,
        scaleMax: layer.scaleMax ?? 1.5,
        rotation: layer.rotation ?? 0,
        radiusFactor: layer.radiusFactor ?? 0.125,
      };
    }

    // Always capture colors so keyframes can later tween correctly when the track's
    // "Color" category is enabled (the toggle controls playback, not what is stored).
    extras.colors = Array.isArray(layer.colors)
      ? cloneForKeyframe(layer.colors)
      : ['#0000FF'];

    const time = (Number.isFinite(timeSecondsOverride) ? timeSecondsOverride : positionSeconds);
    addShapeKeyframe(trackId, time, clonedNodes, clonedSubpaths, '', extras);
  }, [addShapeKeyframe, animatedLayersRef, layers, tracks, positionSeconds]);

  // Handle rerolling a variation keyframe
  const handleRerollVariation = useCallback((trackId, keyframeId) => {
    if (!timeline?.rerollVariationKeyframe) return;

    // Find the track and keyframe
    const track = tracks?.find(t => t.id === trackId);
    if (!track || track.type !== 'shape') return;

    // Get the layer for this track
    const targetId = track.targetId || '';
    const parts = targetId.split(':');
    const layerName = parts.length >= 2 ? parts[1] : null;
    const layer = layers.find(l => l?.name === layerName || l?.id === layerName);

    if (!layer) {
      console.warn('[Timeline] Cannot reroll: layer not found for track', trackId);
      return;
    }

    const success = timeline.rerollVariationKeyframe(trackId, keyframeId, layer);
    if (success) {
      console.log('Rerolled variation keyframe:', keyframeId);
    }
  }, [timeline, tracks, layers]);

  // Keyboard shortcut: 'c' to capture a shape keyframe for the active layer's shape track (if any)
  useEffect(() => {
    if (!visible) return;

    const handleKeyDown = (e) => {
      const key = String(e.key || '').toLowerCase();
      // Only plain 'c' (no modifiers) to avoid conflicts with copy, etc.
      if (key !== 'c' || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;

      const target = e.target;
      const isEditableTarget =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA');

      if (isEditableTarget) return;

      // Prevent default so it doesn't type into inputs if focus is on timeline
      e.preventDefault();

      if (!tracks || !tracks.length) return;
      if (!getCurrentAppState) return;

      const appState = getCurrentAppState();
      if (!appState) return;

      const selectedIndex = appState.selectedLayerIndex ?? 0;
      const activeLayer = layers?.[selectedIndex];
      if (!activeLayer) return;

      const layerName = activeLayer.name || `Layer ${selectedIndex + 1}`;
      const layerId = activeLayer.id || null;

      // Find any shape tracks targeting this layer
      const shapeTracks = tracks.filter((track) => {
        if (!track.enabled || !track.targetId) return false;
        const isShape = track.type === 'shape' || track.targetId.endsWith(':shape');
        if (!isShape) return false;
        const parts = String(track.targetId).split(':');
        if (parts.length < 3 || parts[0] !== 'layer' || parts[2] !== 'shape') return false;
        const targetLayer = parts[1];
        return targetLayer === layerName || (layerId && targetLayer === layerId);
      });

      if (!shapeTracks.length) return;

      // Capture for each matching shape track at current playhead time
      shapeTracks.forEach((track) => {
        // Reuse the existing capture helper so extras (position, shapeParams, etc.) are included
        handleCaptureShapeKeyframe(track.id, layerId || layerName);
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    visible,
    tracks,
    layers,
    getCurrentAppState,
    handleCaptureShapeKeyframe,
  ]);

  // Handle timeline preset button click (save/recall/clear)
  const handleTimelinePresetClick = useCallback((event) => {
    if (!getCurrentAppState || !loadAppState || !setStartPreset) return;

    const hasPreset = !!(startPreset && startPreset.appState);

    // Alt+Click -> clear preset
    if (event.altKey) {
      clearStartPreset?.();
      return;
    }

    // Shift+Click or empty -> save current scene
    if (event.shiftKey || !hasPreset) {
      const snapshot = getCurrentAppState();
      if (!snapshot) return;
      const { isFrozen: _ignoredFreeze, ...rest } = snapshot;
      setStartPreset({ appState: rest, savedAt: Date.now() });
      return;
    }

    // Normal click with existing preset -> recall
    if (hasPreset && startPreset.appState) {
      const presetState = {
        ...startPreset.appState,
        // Always unfreeze when recalling a timeline preset so animation can run
        isFrozen: false,
      };
      loadAppState(presetState);
    }
  }, [
    startPreset,
    getCurrentAppState,
    loadAppState,
    setStartPreset,
    clearStartPreset,
  ]);

  const handleGenerateRandomFromPanel = useCallback(() => {
    if (typeof onGenerateRandomKeyframes !== 'function') return;
    const startStr = String(genStartTime).trim();
    const endStr = String(genEndTime).trim();
    const startTime = startStr !== '' ? Number(startStr) : NaN;
    const endTime = endStr !== '' ? Number(endStr) : NaN;
    onGenerateRandomKeyframes({
      count: useTransientTimes ? undefined : Math.max(1, Math.floor(Number(randomCount) || 5)),
      startTime: Number.isFinite(startTime) ? startTime : undefined,
      endTime: Number.isFinite(endTime) ? endTime : undefined,
      useTransients: !!useTransientTimes,
      nodeModEnabled: !!useNodeMod,
      nodeModAmount: Number(nodeModAmount),
      nodeModCycles: Number(nodeModCycles),
      energyInfluence: Number.isFinite(energyInfluence) ? energyInfluence : undefined,
    });
  }, [
    onGenerateRandomKeyframes,
    genStartTime,
    genEndTime,
    randomCount,
    useTransientTimes,
    useNodeMod,
    nodeModAmount,
    nodeModCycles,
    energyInfluence,
  ]);

  // Expose panel handler via ref so keyboard shortcut (Shift+R) uses panel settings
  useEffect(() => {
    if (panelGenerateRandomRef) panelGenerateRandomRef.current = handleGenerateRandomFromPanel;
    return () => { if (panelGenerateRandomRef) panelGenerateRandomRef.current = null; };
  }, [panelGenerateRandomRef, handleGenerateRandomFromPanel]);

  const handleFillBetweenFromPanel = useCallback(() => {
    if (typeof onFillKeyframesBetween !== 'function') return;
    onFillKeyframesBetween({
      count: Math.max(1, Math.floor(Number(fillCount) || 3)),
      nodeModEnabled: !!useNodeMod,
      nodeModAmount: Number(nodeModAmount),
      nodeModCycles: Number(nodeModCycles),
      energyInfluence: Number.isFinite(energyInfluence) ? energyInfluence : undefined,
    });
  }, [
    onFillKeyframesBetween,
    fillCount,
    useNodeMod,
    nodeModAmount,
    nodeModCycles,
    energyInfluence,
  ]);

  // Handle audio file load — delegates to context's loadAudioFile (which also persists to IndexedDB)
  const handleLoadAudio = useCallback(async (file) => {
    if (!file || !loadAudioFile) return;
    await loadAudioFile(file);
  }, [loadAudioFile]);

  // clearAudio in context now also clears IndexedDB
  const handleClearAudio = useCallback(() => {
    clearAudio?.();
  }, [clearAudio]);

  const contentWidth = useMemo(() => {
    const base = lengthSeconds * pixelsPerSecond;
    return Math.max(timelineWidth || 0, base, 800);
  }, [timelineWidth, lengthSeconds, pixelsPerSecond]);

  if (!visible) return null;
  const WAVEFORM_HEIGHT = 80;

  return (
    <div
      ref={containerRef}
      className="timeline-panel"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 300,
        background: 'rgba(20, 20, 30, 0.98)',
        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
      onWheel={handleWheel}
    >
      {/* Header with transport controls */}
      <TimelineTransport
        isPlaying={isPlaying}
        positionSeconds={positionSeconds}
        lengthSeconds={lengthSeconds}
        loop={loop}
        onPlay={handlePlay}
        onPause={pause}
        onStop={stop}
        onTogglePlay={handleTogglePlay}
        onSeek={seekTo}
        onSetLength={setLengthSeconds}
        onSetLoop={setLoop}
        onLoadAudio={handleLoadAudio}
        onClearAudio={handleClearAudio}
        hasAudio={!!audio}
        zoom={zoom}
        onZoomChange={setZoom}
        onClose={onClose}
      />

      {/* Tracks + waveform area */}
      <div
        ref={tracksContainerRef}
        className="timeline-tracks-container"
        style={{
          flex: 1,
          overflowX: 'auto',
          overflowY: 'auto',
          position: 'relative',
        }}
        onScroll={handleScroll}
      >
        <div style={{ minWidth: contentWidth + 200, width: contentWidth + 200 }}>
          {/* Waveform row (acts like first track) */}
          {audio && showWaveform && (
            <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.05)', position: 'sticky', top: 0, zIndex: 12, background: 'rgba(20,20,30,0.98)' }}>
              <div style={{ width: 200, minWidth: 200, borderRight: '1px solid rgba(255,255,255,0.1)', padding: '6px 8px', fontSize: '0.7rem', color: 'rgba(255,255,255,0.7)', position: 'sticky', left: 0, background: 'rgba(30,30,40,0.98)', zIndex: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setShowWaveform(false)}
                    aria-label="Hide waveform"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'rgba(255,255,255,0.7)',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      padding: '2px 4px',
                    }}
                    title="Hide waveform"
                  >
                    ◀
                  </button>
                  Audio
                  <button
                    type="button"
                    onClick={() => setTransientsEnabled?.(!transientSettings?.enabled)}
                    aria-label={transientSettings?.enabled ? 'Hide transient markers' : 'Show transient markers'}
                    style={{
                      background: transientSettings?.enabled ? 'rgba(255,152,0,0.3)' : 'transparent',
                      border: '1px solid rgba(255,152,0,0.5)',
                      borderRadius: 3,
                      color: transientSettings?.enabled ? '#ff9800' : 'rgba(255,255,255,0.5)',
                      cursor: 'pointer',
                      fontSize: '0.6rem',
                      padding: '1px 4px',
                      marginLeft: 'auto',
                    }}
                    title={transientSettings?.enabled ? 'Hide transient markers' : 'Show transient markers'}
                  >
                    ⚡
                  </button>
                </div>
                {/* Transient sensitivity slider - only when transients enabled */}
                {transientSettings?.enabled && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.6rem' }}>
                    <span style={{ color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap' }}>Sens:</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={transientSettings?.sensitivity ?? 50}
                      onChange={(e) => setTransientSensitivity?.(Number(e.target.value))}
                      aria-label="Transient sensitivity"
                      style={{ flex: 1, height: 12, cursor: 'pointer' }}
                      title={`Transient sensitivity: ${transientSettings?.sensitivity ?? 50}%`}
                    />
                    <span style={{ color: '#ff9800', minWidth: 20, textAlign: 'right' }}>
                      {transients?.length || 0}
                    </span>
                  </div>
                )}
                {/* Energy influence slider - visible when transients OR energy scaling enabled */}
                {(transientSettings?.enabled || enableEnergyScaling) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.6rem' }}>
                    <span
                      style={{ color: enableEnergyScaling ? '#4fc3f7' : 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap' }}
                      title="Energy Influence: Controls how much audio energy affects keyframe variation. Low energy = subtle variation, high energy = dramatic variation."
                    >
                      Energy:
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="2"
                      step="0.01"
                      value={Number.isFinite(energyInfluence) ? energyInfluence : 0.5}
                      disabled={!energyMap?.total?.length || !enableEnergyScaling}
                      onChange={(e) => setEnergyInfluence?.(Number(e.target.value))}
                      aria-label="Energy influence"
                      style={{ flex: 1, height: 12, cursor: (!energyMap?.total?.length || !enableEnergyScaling) ? 'not-allowed' : 'pointer' }}
                      title={`Energy influence: ${(Number.isFinite(energyInfluence) ? energyInfluence : 0.5).toFixed(2)}\n\nThis scales keyframe variation by audio energy:\n• 0 = Energy has no effect\n• 0.5 = Moderate effect (default)\n• 1.0 = Strong effect (0.05x at quiet, 2x at loud)\n• 2.0 = Extreme effect (nearly 0x at quiet, 4x at loud)`}
                    />
                    <span style={{ color: enableEnergyScaling ? '#4fc3f7' : 'rgba(255,255,255,0.5)', minWidth: 24, textAlign: 'right' }}>
                      {(Number.isFinite(energyInfluence) ? energyInfluence : 0.5).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
              <div style={{ flex: 1, width: contentWidth }}>
                <TimelineWaveform
                  audio={audio}
                  lengthSeconds={lengthSeconds}
                  positionSeconds={positionSeconds}
                  pixelsPerSecond={pixelsPerSecond}
                  scrollLeft={scrollLeft || 0}
                  timelineWidth={contentWidth}
                  viewportWidth={containerWidth - 200}
                  onSeek={seekTo}
                  loop={loop}
                  height={WAVEFORM_HEIGHT}
                  transients={transientSettings?.enabled ? transients : []}
                  energyMap={enableEnergyScaling ? (energyMap?.total || null) : null}
                />
              </div>
            </div>
          )}

          {!showWaveform && audio && (
            <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.05)', position: 'sticky', top: 0, zIndex: 12, background: 'rgba(20,20,30,0.98)' }}>
              <div style={{ width: 200, minWidth: 200, borderRight: '1px solid rgba(255,255,255,0.1)', padding: '6px 8px', fontSize: '0.7rem', color: 'rgba(255,255,255,0.7)', position: 'sticky', left: 0, background: 'rgba(30,30,40,0.98)', zIndex: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowWaveform(true)}
                  aria-label="Show waveform"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'rgba(255,255,255,0.7)',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    padding: '2px 4px',
                  }}
                  title="Show waveform"
                >
                  ▶
                </button>
                Audio
              </div>
            </div>
          )}

          {/* Time ruler */}
          <div
            className="timeline-ruler"
            style={{
              position: 'sticky',
              top: showWaveform && audio ? WAVEFORM_HEIGHT : 0,
              left: 0,
              height: rulerHeight,
              background: 'rgba(30, 30, 40, 0.95)',
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
              zIndex: 10,
              display: 'flex',
            }}
          >
            {/* Track list header + timeline preset button */}
            <div style={{ width: 200, minWidth: 200, borderRight: '1px solid rgba(255, 255, 255, 0.1)', padding: '4px 8px', fontSize: '0.7rem', color: 'rgba(255, 255, 255, 0.5)', position: 'sticky', left: 0, background: 'rgba(30, 30, 40, 0.95)', zIndex: 5 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span>Tracks</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      type="button"
                      onClick={isRecording ? onStopRecording : onStartRecording}
                      aria-label={isRecording ? 'Stop recording' : 'Start recording'}
                      title={isRecording ? 'Stop Recording' : 'Start Recording'}
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: '999px',
                        border: isRecording
                          ? '2px solid #f44336'
                          : '2px solid rgba(255, 255, 255, 0.35)',
                        background: isRecording
                          ? 'rgba(244, 67, 54, 0.3)'
                          : 'transparent',
                        color: isRecording ? '#f44336' : 'rgba(255, 255, 255, 0.7)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 600,
                        fontSize: '0.7rem',
                        padding: 0,
                        cursor: 'pointer',
                      }}
                    >
                      {isRecording ? '⏹' : '⏺'}
                    </button>
                    <button
                      type="button"
                      onClick={handleTimelinePresetClick}
                      aria-label="Timeline start preset"
                      title={
                        hasTimelinePreset
                          ? 'Timeline Preset\nClick: Recall at t=0\nShift+Click: Save current scene\nAlt+Click: Clear preset'
                          : 'Timeline Preset\nClick or Shift+Click: Save current scene for t=0\nAlt+Click: Clear preset'
                      }
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: '999px',
                        border: hasTimelinePreset
                          ? '2px solid #4fc3f7'
                          : '2px dashed rgba(255, 255, 255, 0.35)',
                        background: hasTimelinePreset
                          ? 'rgba(79,195,247,0.18)'
                          : 'transparent',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 600,
                        fontSize: '0.65rem',
                        padding: 0,
                        cursor: 'pointer',
                      }}
                    >
                      TL
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: '0.65rem', cursor: 'pointer', color: 'rgba(255, 255, 255, 0.7)' }}>
                    <input
                      type="checkbox"
                      checked={!!isFrozen}
                      onChange={(e) => setIsFrozen?.(!!e.target.checked)}
                      aria-label="Freeze animation"
                      style={{ margin: 0, cursor: 'pointer' }}
                    />
                    <span>Freeze</span>
                  </label>
                  <label
                    style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: '0.65rem', cursor: 'pointer', color: 'rgba(255, 255, 255, 0.7)' }}
                    title="Enable breathing (node modulation) prompts for generated keyframes"
                  >
                    <input
                      type="checkbox"
                      checked={!!enableBreathing}
                      onChange={(e) => setEnableBreathing?.(!!e.target.checked)}
                      aria-label="Enable breathing modulation"
                      style={{ margin: 0, cursor: 'pointer' }}
                    />
                    <span>Breathing</span>
                  </label>
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                    title="Energy Scaling: When enabled, generated keyframes (Shift+R, Shift+F) will have their variation scaled by audio energy.\n\n• Quiet moments → subtle variation\n• Loud moments → dramatic variation\n\nAdjust the Energy slider to control the effect strength."
                  >
                    <label
                      style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: '0.65rem', cursor: energyMap?.total?.length ? 'pointer' : 'not-allowed', color: energyMap?.total?.length && enableEnergyScaling ? '#4fc3f7' : 'rgba(255, 255, 255, 0.7)' }}
                    >
                      <input
                        type="checkbox"
                        checked={!!enableEnergyScaling}
                        disabled={!energyMap?.total?.length}
                        onChange={(e) => setEnableEnergyScaling?.(!!e.target.checked)}
                        aria-label="Enable energy scaling"
                        style={{ margin: 0, cursor: energyMap?.total?.length ? 'pointer' : 'not-allowed' }}
                      />
                      <span>Energy</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
            {/* Time markers */}
            <div style={{ flex: 1, position: 'relative', minWidth: contentWidth, width: contentWidth }}>
              <svg
                width={contentWidth}
                height={rulerHeight}
                style={{ display: 'block' }}
              >
                {/* Second markers */}
                {Array.from({ length: Math.ceil(lengthSeconds) + 1 }, (_, i) => {
                  const x = i * pixelsPerSecond;
                  const isMinute = i % 60 === 0;
                  const is10Sec = i % 10 === 0;
                  return (
                    <g key={i}>
                      <line
                        x1={x}
                        y1={isMinute ? 0 : (is10Sec ? 14 : 22)}
                        x2={x}
                        y2={rulerHeight}
                        stroke={isMinute ? 'rgba(255,255,255,0.4)' : (is10Sec ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)')}
                        strokeWidth={isMinute ? 2 : 1}
                      />
                      {(isMinute || is10Sec) && (
                        <text
                          x={x + 3}
                          y={12}
                          fill="rgba(255,255,255,0.5)"
                          fontSize="9"
                        >
                          {formatTime(i)}
                        </text>
                      )}
                    </g>
                  );
                })}
                {/* Playhead line in ruler */}
                <line
                  x1={positionSeconds * pixelsPerSecond}
                  y1={0}
                  x2={positionSeconds * pixelsPerSecond}
                  y2={rulerHeight}
                  stroke="#ff5722"
                  strokeWidth={2}
                />
              </svg>
            </div>
          </div>

          {/* Track rows */}
          <div className="timeline-tracks" style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(12,12,18,0.8)' }}>
              <div
                style={{
                  width: 200,
                  minWidth: 200,
                  position: 'sticky',
                  left: 0,
                  zIndex: 6,
                  background: 'rgba(25,25,34,0.98)',
                  padding: '8px',
                  borderRight: '1px solid rgba(255,255,255,0.1)',
                  display: 'grid',
                  gap: 6,
                  fontSize: '0.62rem',
                  color: 'rgba(255,255,255,0.8)',
                }}
              >
                <details>
                  <summary style={{ cursor: 'pointer', userSelect: 'none', fontSize: '0.9em', opacity: 0.85, padding: '0.2rem 0', color: '#90caf9' }}>Generator</summary>
                  <div style={{ marginTop: '0.4rem', display: 'grid', gap: 6 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                  <label style={{ display: 'grid', gap: 2 }}>
                    <span>Random N</span>
                    <input
                      type="number"
                      min={1}
                      max={200}
                      value={randomCount}
                      onChange={(e) => setRandomCount(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                      aria-label="Number of random keyframes"
                      style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 3, color: 'white', fontSize: '0.65rem' }}
                    />
                  </label>
                  <label style={{ display: 'grid', gap: 2 }}>
                    <span>Fill N</span>
                    <input
                      type="number"
                      min={1}
                      max={200}
                      value={fillCount}
                      onChange={(e) => setFillCount(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                      aria-label="Number of fill keyframes"
                      style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 3, color: 'white', fontSize: '0.65rem' }}
                    />
                  </label>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                  <label style={{ display: 'grid', gap: 2 }}>
                    <span>Start s</span>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={genStartTime}
                      onChange={(e) => setGenStartTime(e.target.value)}
                      placeholder="auto"
                      aria-label="Random generation start time"
                      style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 3, color: 'white', fontSize: '0.65rem' }}
                    />
                  </label>
                  <label style={{ display: 'grid', gap: 2 }}>
                    <span>End s</span>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={genEndTime}
                      onChange={(e) => setGenEndTime(e.target.value)}
                      placeholder="auto"
                      aria-label="Random generation end time"
                      style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 3, color: 'white', fontSize: '0.65rem' }}
                    />
                  </label>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: transients?.length ? 'pointer' : 'not-allowed', opacity: transients?.length ? 1 : 0.5 }}>
                  <input
                    type="checkbox"
                    checked={!!useTransientTimes}
                    disabled={!transients?.length}
                    onChange={(e) => setUseTransientTimes(!!e.target.checked)}
                    aria-label="Use transient markers for random keyframe timing"
                  />
                  <span>Use transients</span>
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, alignItems: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input
                      type="checkbox"
                      checked={!!useNodeMod}
                      onChange={(e) => setUseNodeMod(!!e.target.checked)}
                      aria-label="Enable node modulation"
                    />
                    <span>Breath</span>
                  </label>
                  <input
                    type="number"
                    min={0.01}
                    max={0.5}
                    step={0.01}
                    value={nodeModAmount}
                    disabled={!useNodeMod}
                    onChange={(e) => setNodeModAmount(Math.max(0.01, Math.min(0.5, Number(e.target.value) || 0.15)))}
                    aria-label="Node modulation amount"
                    style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 3, color: 'white', fontSize: '0.65rem' }}
                  />
                  <input
                    type="number"
                    min={0.25}
                    max={20}
                    step={0.25}
                    value={nodeModCycles}
                    disabled={!useNodeMod}
                    onChange={(e) => setNodeModCycles(Math.max(0.25, Number(e.target.value) || 1))}
                    aria-label="Node modulation cycles"
                    style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 3, color: 'white', fontSize: '0.65rem' }}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                  <button
                    type="button"
                    onClick={onGenerateVariationKeyframe}
                    aria-label="Generate one variation keyframe"
                    style={{ background: 'rgba(79,195,247,0.2)', border: '1px solid rgba(79,195,247,0.45)', color: '#90caf9', borderRadius: 3, cursor: 'pointer', fontSize: '0.62rem' }}
                  >
                    +1 Var
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerateRandomFromPanel}
                    aria-label="Generate random keyframes"
                    style={{ background: 'rgba(129,199,132,0.2)', border: '1px solid rgba(129,199,132,0.45)', color: '#a5d6a7', borderRadius: 3, cursor: 'pointer', fontSize: '0.62rem' }}
                  >
                    Random
                  </button>
                  <button
                    type="button"
                    onClick={handleFillBetweenFromPanel}
                    aria-label="Fill keyframes between surrounding keyframes"
                    style={{ background: 'rgba(255,183,77,0.2)', border: '1px solid rgba(255,183,77,0.45)', color: '#ffcc80', borderRadius: 3, cursor: 'pointer', fontSize: '0.62rem' }}
                  >
                    Fill
                  </button>
                  <button
                    type="button"
                    onClick={onCaptureGlobalKeyframe}
                    aria-label="Capture global keyframe"
                    style={{ background: 'rgba(206,147,216,0.2)', border: '1px solid rgba(206,147,216,0.45)', color: '#e1bee7', borderRadius: 3, cursor: 'pointer', fontSize: '0.62rem' }}
                  >
                    Global Cap
                  </button>
                </div>
                  </div>
                </details>
              </div>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 10px', color: 'rgba(255,255,255,0.45)', fontSize: '0.68rem' }}>
                Non-modal generation: configure options once, then iterate quickly with buttons or `Shift+R` / `Shift+F`.
              </div>
            </div>
            {tracks?.map((track, index) => (
              <TimelineTrackRow
                key={track.id}
                track={track}
                index={index}
                lengthSeconds={lengthSeconds}
                positionSeconds={positionSeconds}
                pixelsPerSecond={pixelsPerSecond}
                scrollLeft={0}
                timelineWidth={contentWidth}
                layers={layers}
                globalParameters={globalParameters}
                layerParameters={layerParameters}
                onUpdateTrack={(updates) => updateTrack(track.id, updates)}
                onRemoveTrack={() => removeTrack(track.id)}
                onAddKeyframe={(time, value, curve, tension, extras) => {
                  // Shape/globalShape tracks need full snapshot keyframes; avoid inserting numeric keyframes that
                  // break interpolation (especially colors).
                  if (track.type === 'shape') {
                    const parts = String(track.targetId || '').split(':');
                    const layerIdOrName = parts.length >= 2 ? parts[1] : null;
                    if (layerIdOrName) {
                      handleCaptureShapeKeyframe(track.id, layerIdOrName, time);
                    }
                    return;
                  }
                  if (track.type === 'globalShape') {
                    // Capture snapshot of all layers at this time.
                    // Note: this uses current layer state; for evaluated-at-time capture, use the dedicated Global Shape controls.
                    captureGlobalShapeKeyframe?.(track.id, layers, { timeSecondsOverride: time });
                    return;
                  }
                  if (track.type === 'color') {
                    if (typeof addColorKeyframe !== 'function') return;

                    const parts = String(track.targetId || '').split(':');
                    const targetType = parts[0] || null;
                    const targetParam = targetType === 'global' ? parts[1] : (parts.length >= 3 ? parts[2] : null);

                    let defaultColor = '#ffffff';
                    if (targetType === 'global' && targetParam === 'backgroundColor') {
                      // Use current app background color if available
                      defaultColor = (typeof getCurrentAppState === 'function' && getCurrentAppState()?.backgroundColor)
                        ? getCurrentAppState().backgroundColor
                        : '#000000';
                    } else if (targetType === 'layer' && targetParam === 'color') {
                      const layerIdOrName = parts.length >= 2 ? parts[1] : null;
                      const layer = Array.isArray(layers)
                        ? layers.find(l => l?.name === layerIdOrName || l?.id === layerIdOrName)
                        : null;
                      const layerColor = Array.isArray(layer?.colors) && layer.colors.length ? layer.colors[0] : null;
                      if (typeof layerColor === 'string') defaultColor = layerColor;
                    }

                    const picked = (extras && typeof extras.color === 'string') ? extras.color : defaultColor;
                    addColorKeyframe(track.id, time, picked);
                    return;
                  }
                  addKeyframe(track.id, time, value, curve, tension);
                }}
                onUpdateKeyframe={(kfId, updates) => updateKeyframe(track.id, kfId, updates)}
                onRemoveKeyframe={(kfId) => removeKeyframe(track.id, kfId)}
                onCaptureShapeKeyframe={handleCaptureShapeKeyframe}
                onCaptureGlobalShapeKeyframe={handleCaptureGlobalShapeKeyframe}
                onGenerateGlobalVariationKeyframe={handleGenerateGlobalVariationKeyframe}
                onRerollGlobalShapeKeyframe={handleRerollGlobalShapeKeyframe}
                onCopyKeyframe={(kfId) => copyKeyframe?.(track.id, kfId)}
                onPasteKeyframe={(time) => pasteKeyframe?.(track.id, time)}
                onPasteKeyframeToTrack={(targetTrackId, time) => pasteKeyframeToTrack?.(targetTrackId, time)}
                onRerollVariation={(kfId) => handleRerollVariation(track.id, kfId)}
                hasClipboard={!!keyframeClipboard}
                clipboardTrackType={clipboardTrackType}
                clipboardSourceTargetId={clipboardSourceTargetId}
                allShapeTracks={allShapeTracks}
                onSeek={seekTo}
              />
            ))}

            {/* Add track button - header column sticky like other track rows */}
            <div
              style={{
                display: 'flex',
                borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
              }}
            >
              {/* Left fixed column */}
              <div
                style={{
                  width: 200,
                  minWidth: 200,
                  position: 'sticky',
                  left: 0,
                  zIndex: 6,
                  background: 'rgba(30, 30, 40, 0.95)',
                  padding: '8px',
                  borderRight: '1px solid rgba(255, 255, 255, 0.1)',
                  display: 'flex',
                  gap: '4px',
                }}
              >
                <button
                  type="button"
                  onClick={handleAddTrack}
                  style={{
                    background: 'rgba(79, 195, 247, 0.2)',
                    border: '1px dashed rgba(79, 195, 247, 0.5)',
                    borderRadius: 4,
                    padding: '6px 8px',
                    color: '#4fc3f7',
                    fontSize: '0.65rem',
                    cursor: 'pointer',
                    flex: 1,
                  }}
                >
                  + Track
                </button>
                <button
                  type="button"
                  onClick={handleAddLayerShapeTrack}
                  style={{
                    background: 'rgba(76, 175, 80, 0.2)',
                    border: '1px dashed rgba(76, 175, 80, 0.5)',
                    borderRadius: 4,
                    padding: '6px 8px',
                    color: '#a5d6a7',
                    fontSize: '0.65rem',
                    cursor: 'pointer',
                    flex: 1,
                  }}
                  title="Add a Shape track for the currently selected layer"
                >
                  + Layer Shape
                </button>
                <button
                  type="button"
                  onClick={handleAddGlobalShapeTrack}
                  style={{
                    background: 'rgba(156, 39, 176, 0.2)',
                    border: '1px dashed rgba(156, 39, 176, 0.5)',
                    borderRadius: 4,
                    padding: '6px 8px',
                    color: '#ce93d8',
                    fontSize: '0.65rem',
                    cursor: 'pointer',
                    flex: 1,
                  }}
                  title="Add a Global Shape track to tween all layers between keyframes"
                >
                  + Global Shape
                </button>
              </div>

              {/* Right side (empty, matches track row layout so timeline continues) */}
              <div style={{ flex: 1 }} />
            </div>
          </div>

          {/* Playhead is now drawn by each component (waveform, ruler, tracks) for perfect alignment */}
        </div>
      </div>
    </div>
  );
};

/**
 * Format time as mm:ss or m:ss
 */
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default TimelinePanel;
