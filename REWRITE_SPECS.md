# Art App Specification & Rewrite Guide

## 1. Project Overview
**Name**: Art App (Generative Visual Synthesizer)
**Type**: Interactive, Audio-Reactive, Generative Art Application
**Platform**: Web (React, HTML5 Canvas)
**Goal**: Create a robust, high-performance visual synthesizer that allows users to create complex, animated, and audio-reactive geometric patterns. The app combines a timeline-based automation system (linear editing) with generative/randomized workflows.

---

## 2. Core Architecture

### 2.1 Tech Stack Recommendation
- **Framework**: React 18+ (Strict Mode compatible).
- **Language**: TypeScript (Strongly recommended for complex data models like Layers/Tracks).
- **State Management**: Zustand or Jotai (Recommended over plain Context API to avoid "Context Hell" and frequent re-renders).
- **Rendering**: HTML5 Canvas (2D Context). *Future consideration: WebGL/PixiJS for performance.*
- **Build Tool**: Vite.
- **Styling**: Tailwind CSS or CSS Modules.
- **Icons**: Lucide-React.

### 2.2 System Architecture Modules
1.  **Rendering Engine (`Canvas.jsx`)**: Pure rendering component. Receives state (Layers) and renders frame. Handles coordinate mapping, shape generation, and effects.
2.  **Animation Loop (`useAnimation.js`)**: The "Game Loop". Runs on `requestAnimationFrame`. Calculates physics, interpolated values, and modulations. Decoupled from React render cycle where possible.
3.  **State Stores**:
    -   `AppState`: Layers, Global Settings (Speed, Freeze), UI State.
    -   `TimelineState`: Tracks, Keyframes, Playhead, Transport.
    -   `AudioState`: Analysis data (FFT), Audio settings.
    -   `ModulationStore`: Central registry for active modulations to avoid prop drilling.
4.  **IO/Integration**: MIDI handlers, Audio analysis (Web Audio API), File Import/Export.

---

## 3. Data Models

### 3.1 Layer Model
The fundamental visual unit.
```typescript
interface Layer {
  id: string;
  name: string;
  visible: boolean;
  type: 'shape' | 'image';
  
  // Positioning & Physics
  position: {
    x: number; // 0-1 (normalized to Artboard)
    y: number; // 0-1
    scale: number;
    vx: number; // Velocity X
    vy: number; // Velocity Y
    scaleDirection: 1 | -1;
  };
  
  // Movement Settings
  movementStyle: 'still' | 'bounce' | 'drift' | 'orbit' | 'spin';
  movementSpeed: number; // 0-5
  movementAngle: number; // 0-360 degrees
  scaleSpeed: number;
  scaleMin: number;
  scaleMax: number;
  
  // Orbit Specifics
  orbitCenterX?: number;
  orbitCenterY?: number;
  orbitRadiusX?: number;
  orbitRadiusY?: number;
  orbitAngle?: number; // Phase

  // Shape Appearance
  numSides: number; // 3-24+
  curviness: number; // 0 (polygon) to 1 (circle)
  radiusFactor: number; // Size relative to canvas
  radiusFactorX: number; // Anisotropic sizing
  radiusFactorY: number;
  rotation: number; // Degrees
  
  // Noise/distortion
  wobble: number;
  noiseAmount: number;
  noiseSeed: number;
  freq1: number; // Noise frequencies
  freq2: number;
  freq3: number;

  // Styling
  colors: string[]; // Palette array
  numColors: number; // Active color count
  opacity: number; // 0-1
  blendMode: string; // CSS blend modes
  
  // Advanced Geometry
  nodes?: Point[]; // Custom geometry (if user edited nodes)
  subpaths?: Point[][]; // Complex paths (e.g. from SVG)
  
  // Image Specific
  image?: {
    src: string; // Data URL
    filters: {
      blur: number;
      brightness: number;
      contrast: number;
      hue: number;
      saturation: number;
    }
  };
}
```

### 3.2 Timeline Models
```typescript
interface Track {
  id: string;
  label: string;
  type: 'value' | 'color' | 'shape';
  targetId: string; // "layer:{id}:{property}" or "global:{property}"
  keyframes: Keyframe[];
  enabled: boolean;
}

interface Keyframe {
  id: string;
  time: number; // Seconds
  value: any; // Number, Color string, or ShapeData object
  curve: 'linear' | 'step' | 'bezier'; // Interpolation type
  tension?: number; // For bezier
  extras?: any; // Metadata (e.g., energy level, variation seeds)
}
```

---

## 4. Feature Specifications

### 4.1 Generative & Shape Engine
-   **Procedural Generation**: Shapes are generated algorithmically based on `numSides`, `curviness`, and noise parameters (`freq1/2/3`, `wobble`).
-   **Noise Deformation**: Per-vertex displacement using a pseudo-random 3-term sine summation based on time and angle.
-   **Node Editing**: Users can "bake" a procedural shape into explicit nodes (vertices) and manually drag/edit them on canvas.
-   **SVG Import**: Support importing SVG paths, converting them to `subpaths` (arrays of points) for the engine to render and modulate.

### 4.2 Animation System
-   **Bounce**: Objects move linearly and reflect off canvas edges.
-   **Drift**: Objects move linearly and wrap around edges (toroidal).
-   **Orbit**: Objects revolve around a defined pivot point (`orbitCenter`).
-   **Spin**: Objects rotate in place.
-   **Z-Oscillation**: Objects scale up and down rhythmically (`scaleMin` to `scaleMax`).
-   **Global Speed**: Master multiplier for all movement.

### 4.3 Audio Reactivity
-   **Input**: Microphone (getUserMedia) or File Upload.
-   **Analysis**: Web Audio API AnalyzerNode.
-   **Bands**: Calculate RMS (volume), Bass, Mids, Highs.
-   **Mapping**:
    -   One-to-many mapping system.
    -   Any numeric parameter (e.g., `radiusFactor`, `speed`) can be mapped to an audio band.
    -   Mapping includes `range` (min/max output).
-   **Transient Detection**: Analyze flux to detect beats/transients, used for keyframe generation.

### 4.4 Timeline & Automation
-   **Structure**: Linear timeline with seconds-based time.
-   **Tracks**: Unlimited tracks targeting layer properties (e.g., "Layer 1 Size") or global props.
-   **Interpolation**:
    -   Numeric: Linear/Spline interpolation.
    -   Color: RGB interpolation.
    -   Shape: Vertex-wise interpolation (`lerpNodes`). Requires matching point counts or smart resampling.
-   **Recording**: `MediaRecorder` API to capture Canvas stream + Audio stream to WebM/MP4.
-   **UI**:
    -   Play/Pause/Stop/Loop.
    -   Zoomable/Scrollable track view.
    -   Waveform visualization background.
    -   Curve editor for numeric values.

### 4.5 Global Controls
-   **Freeze**: Pauses animation logic but keeps rendering (and audio modulation).
-   **Randomization**: "Reroll" button to generate new seeds/colors/shapes for selected or all layers.
-   **Presets**:
    -   **Quick Presets**: RAM-based slots (F1-F12 style).
    -   **JSON Export/Import**: Full state persistence including audio mappings and timeline.
-   **Layer Management**:
    -   Grouping (Folder structure).
    -   Multi-select editing.
    -   Duplicate/Delete.

---

## 5. UI/UX Layout Specification

### 5.1 Main Layout
-   **Top Bar**: Global Transport (Freeze, Speed), Global Randomize, Master Volume/Audio Toggle, Layout Toggles.
-   **Left Panel**: Controls Sidebar.
    -   Accordion/Tabbed interface: "Layer", "Global", "Audio", "BPM".
    -   Layer list integrated or separate.
-   **Center**: Canvas (Viewport).
    -   Floating Action Buttons (FAB) for quick actions (Snapshot, node edit mode).
    -   Overlay controls (Node editor handles).
-   **Bottom Panel**: Timeline (Collapsible).
    -   Transport controls on left.
    -   Track headers list.
    -   Scrollable timeline ruler and keyframe area.

### 5.2 Key Interactions
-   **Canvas**:
    -   Click to select layer (if hits shape).
    -   Drag to move layer.
    -   Scroll to zoom (if enabled).
-   **Keyboard Shortcuts**:
    -   `Space`: Toggle Play/Pause.
    -   `Shift+R`: Randomize.
    -   `Delete`: Remove Layer.
    -   `Ctrl/Cmd+Z`: Undo (if implemented).
    -   `[` / `]`: Cycle layers.

---

## 6. Architectural Guidance & Improvements (for Rewrite)

### 6.1 State Management Overhaul
**Current**: Multiple React Contexts (`AppStateContext`, `TimelineContext`, etc.) leading to frequent re-renders and dependency chains.
**Recommendation**: Use **Zustand**.
-   Create a unified store (or slices) for `projectState`.
-   Use `useStore(selector)` pattern to only re-render components when specific data changes.
-   **Transient Updates**: For high-frequency updates (audio levels, animation frames), **do not** write to React state. Use `useRef` or a transient store (like `zustand/vanilla`) to update values that the Canvas reads directly each frame.

### 6.2 Canvas Optimization
**Current**: 2D Canvas Context.
**Recommendation**:
-   Stick to 2D Context if shapes are simple (Path2D is fast).
-   Use **OffscreenCanvas** for the rendering loop if possible to detach from main thread (Web Worker), though this complicates UI interaction.
-   **Optimization**: Pre-render static layers or complex paths to image bitmaps if they don't change shape every frame (caching).
-   **Resolution**: Handle `devicePixelRatio` correctly (already implemented, but ensure it's robust).

### 6.3 Separation of Concerns
-   **Engine vs UI**: The logic that moves shapes (`updateLayerAnimation`) should be completely separable from React. It should be a standalone class/module that takes a State object and returns a new State object.
-   **Audio Engine**: Encapsulate Web Audio logic in a dedicated class/hook that exposes a simple `getAnalysisData()` method.

### 6.4 Timeline Data Structure
**Current**: Array of Keyframes.
**Recommendation**:
-   Use a sorted Map or binary search-friendly array for keyframes to ensure `O(log n)` lookup during playback.
-   Ensure Shape Keyframes store simplified data (or references) to avoid massive JSON blobs if high point counts are used.

### 6.5 Typescript Interfaces
Define strict interfaces for `Layer` and `Session` immediately. This prevents the "property soup" issue where layers acquire random legacy properties over time (`width` vs `radiusFactor`, etc.).

### 6.6 Code Splitting
-   Lazy load the Timeline panel and heavy audio processing modules.

---

## 7. Implementation Roadmap (Rewrite)

1.  **Phase 1: Foundation**
    -   Setup Vite + React + TypeScript + Zustand.
    -   Implement the `Canvas` renderer loop.
    -   Implement basic `Layer` model and `Animation` physics.
2.  **Phase 2: Controls & State**
    -   Build the Sidebar UI.
    -   Connect UI to Zustand store.
    -   Implement Layer CRUD.
3.  **Phase 3: Audio & Generative**
    -   Integrate Web Audio API.
    -   Implement Audio Modulators.
    -   Add procedural shape noise algorithms.
4.  **Phase 4: Timeline**
    -   Build the Timeline UI (tracks, scrubber).
    -   Implement the Interpolation Engine.
    -   Connect Playback transport.
5.  **Phase 5: Polish**
    -   SVG Import.
    -   Recording/Export.
    -   Presets & Persistence.

---

## 8. Detailed Feature Reference

This section is intended to be exhaustive and precise enough for an LLM or developer to recreate the app behaviorally, not just structurally.

### 8.1 Application Session Model

At a high level, the app maintains a **Session** with these conceptual parts:

- **Visual State** (AppState)
  - Global settings: `backgroundColor`, `backgroundImage`, `globalBlendMode`, `globalSpeedMultiplier`, `globalSeed`, `isFrozen`, `zIgnore`.
  - Layer list: ordered array of `Layer` objects (see section 3.1).
  - Selection & groups: `selectedLayerIndex`, `selectedLayerIds`, `layerGroups` (`{ id, name, color?, memberIds[] }`).
  - UI flags: `isOverlayVisible`, `isNodeEditMode`, `nodeEditContext`, `classicMode`, `isolateMode`, `showLayerOutlines`, `parameterTargetMode` ('global' | 'individual').
  - Randomization behavior: `randomizePalette`, `randomizeNumColors`, `randomizeColorsPerLayer`, `uniformColorCount`, `colorFadeWhileFrozen`, `syncLayerColorsToFirst`, `applyVariationInstantly`.

- **Timeline Session** (TimelineContext)
  - `tracks[]`: list of automation/shape tracks.
  - `lengthSeconds`: total duration.
  - `loop`: boolean.
  - `positionSeconds`: current playhead time.
  - `isPlaying`: boolean.
  - `settings`: zoom, scroll, visibility, etc.
  - `audio`: optional audio attachment `{ src, durationSeconds, peaks[], offsetSeconds, buffer, fileName, fileType }`.
  - `startPreset`: optional snapshot of AppState used when playback starts at t=0.
  - Transient + energy data: `transients[]` and `energyMap[]` (see 8.5).

- **Audio State** (AudioContext)
  - `settings`: `{ enabled, sensitivity, smoothing, release, deviceId }`.
  - `features`: latest analysis features `{ rms, bass, mids, highs }`.
  - Device list and selected input.
  - File playback info: `isFileMode`, `fileInfo`, `fileProgress`, etc.
  - `mappings`: `{ [paramId]: { band: 'none'|'rms'|'bass'|'mids'|'highs', range: { outputMin, outputMax } } }`.

- **BPM State** (BPMContext)
  - Clock: `bpm`, `beatsPerBar`, `isPlaying`, `beatDurationMs` and a `getClockState()` ref returning `{ currentBeat, beatPhase }`.
  - `mappings`: `{ [paramId]: { enabled, speed, loopMode, range, envelope } }` with `speed` in beats and `loopMode` in `['forward','reverse','pingpong','oneshot']`.

- **MIDI State** (MidiContext)
  - WebMIDI support flags, list of inputs, `selectedInputId`.
  - `mappings`: `{ [paramId]: { type: 'cc'|'note', channel, number, invert? } }`.
  - `learnParamId`: if set, the next MIDI message binds to this param id.

- **Modulation Store** (useModulationStore)
  - Non-React store that aggregates per-frame modulation values from **Audio**, **BPM**, and **Timeline** into three mod maps:
    - `audioModsRef.current`: per-parameter audio-driven values.
    - `bpmModsRef.current`: per-parameter beat-driven values.
    - `timelineModsRef.current`: per-parameter values from timeline tracks.
  - `useAnimation` reads from these refs and applies all modulations in a single pass per frame.


### 8.2 Layer Variation & Randomization System

The app supports two kinds of variation:

- **Base variation sliders** on the first layer:
  - `variationPosition`, `variationShape`, `variationAnim`, `variationColor`, `variationScale`.
  - These are normalized intensities roughly in `[0,3]` where ~1 is a typical amount, >1 is more extreme.

- **Per-layer `vary` flags** (see `DEFAULT_LAYER.vary`):
  - Booleans indicating whether a particular property is allowed to change when applying variation (e.g. `vary.numSides`, `vary.movementSpeed`, `vary.colors`, etc.).

Variation influences two major flows:

1. **Randomize All** (scene-level):
   - Uses `useRandomization(modern)` and `classicRandomizeAll` to:
     - Decide layer count (if `layersCount` is included).
     - Choose a scene palette and per-layer palettes based on `randomizePalette`, `randomizeNumColors`, `randomizeColorsPerLayer`, `uniformColorCount`.
     - Sample new base variations for each category (position, shape, anim, color, scale).
     - For each layer, mix current values towards randomized targets using category weights and `vary` flags.
     - Recompute derived properties like velocities from movement angle/speed.
     - Optionally randomize background color, global blend mode, and global speed.
   - Respect per-control `includeRnd` toggles so some globals are not touched.

2. **Variation Keyframe Generation**:
   - The `layerVariation.buildVariedLayerFrom(prev, nameIndex, baseVar, options)` function:
     - Interprets `baseVar` (either scalar or `{ shape, anim, color, position, scale }`).
     - Computes internal weights `wShape`, `wAnim`, `wColor`, `wPosition`, `wScale` derived from those intensities.
     - For each property, if the corresponding `vary` flag is true and the relevant category is in `affectCategories`, mixes the current value toward a randomized target within sensible min/max ranges.
     - Rebuilds or jitters nodes when `wShape > 0` (and previous layer has `nodes`):
       - Resamples nodes if `numSides` changed.
       - Applies small random offsets to node positions based on `wShape`.
     - Adjusts colors based on `wColor` with three regimes:
       - Very low: no change.
       - Medium: subtle hue/saturation/lightness perturbation.
       - High: palette swaps and shuffles.
     - Adjusts position, movement style/speed/angle, scale oscillation, and image effect properties.
     - Recomputes velocity from angle/speed.

- **Modern vs Classic Randomize All**:
  - **Modern**: strongly tied to `PARAMETERS` metadata (min/max, randomMin/randomMax, `isRandomizable`) and the split variation sliders; more nuanced color behavior.
  - **Classic**: approximates the original CodePen behavior with simpler ranges but still respects `isRandomizable` and can re-use some existing layer properties.


### 8.3 Node Editing & Node Modulation

#### 8.3.1 Node Editing

- Each shape can be represented by either:
  - **Procedural geometry** (no explicit nodes), or
  - **Explicit `nodes[]` / `subpaths[][]`** (e.g. imported SVG or baked shapes).
- When entering **node edit mode**:
  - The app inspects the active layer and its associated shape track (if any) in the timeline.
  - For the current timeline position, it evaluates that shape track to obtain the authoritative geometry (including keyframed position, shape params, and colors).
  - It writes that evaluated geometry back into the layer's `nodes`/`subpaths` and sets `syncNodesToNumSides` appropriately.
  - Canvas then renders nodes directly, and UI overlays allow dragging points.
- While node edit mode is active for a specific layer:
  - Timeline-driven geometry updates for that layer are suppressed to avoid overwriting user edits.

#### 8.3.2 Node Modulation (Timeline-Driven)

Node modulation is a post-variation, post-interpolation deformation applied when generating variation keyframes:

- Config object (per generation call):
  - `mode`: `'sineRadial'` or `'jitter'` (at time of writing, radial sine breathing is primary).
  - `amount`: typical range ≈ `0.05`–`0.5` (fraction of radius used for modulation).
  - `cycles`: how many breathing cycles over a series of keyframes.
  - `mask`: which nodes/subpaths to affect (e.g. `'all'`, `'inner'`, `'outer'`).
  - `phaseSpread`: random per-node phase jitter.

- Application in **`generateVariationKeyframesAtTimes`**:
  - For each time index `i` in the array `times`:
    - Compute a phase using `generateKeyframePhase(i, totalFrames, cycles)`.
    - Build a `modConfig` = `nodeMod + { phase, seed }`.
    - If `nodes` present, call `applyNodeModulation(nodes, modConfig)`.
    - If `subpaths` present, call `applyNodeModulationToSubpaths(subpaths, modConfig)`.
    - Record `extras.nodeMod = { ...nodeMod, appliedPhase: phase }` in the keyframe.

Node modulation is **independent** of the normal animation loop: it deforms the keyframed geometry itself, not the runtime movement.


### 8.4 Timeline System (Detailed)

The timeline is a fully-featured automation and shape keyframing system.

#### 8.4.1 Track Types & Targeting

- **Numeric (value) tracks**: target scalar parameters such as `globalSpeedMultiplier`, `numSides`, `radiusFactor`, etc.
  - `type: 'value'`.
  - `targetId`: strings like `"global:globalSpeedMultiplier"` or `"layer:Layer 1:movementSpeed"`.

- **Color tracks**: target colors (e.g. layer color index or global color).
  - `type: 'color'`.

- **Shape tracks**: target geometry+position+animation+colors.
  - `type: 'shape'`.
  - `targetId`: `"layer:<LayerIdOrName>:shape"`.
  - Keyframes contain:
    - `nodes` or `subpaths`.
    - `extras.position` (x/y/scale/xOffset/yOffset).
    - `extras.shapeParams` (numSides, curviness, radiusFactor/X/Y, rotation).
    - Optional `extras.animation` (movementStyle / speed / angle / scaleSpeed / scaleMin / scaleMax).
    - Optional `extras.colors`.
    - Optional `extras.variation`, `extras.nodeMod`, `extras.energy`.

#### 8.4.2 Evaluation Pipeline

During playback:

- Numeric / color tracks: evaluated via envelope interpolation between keyframes.
- Shape tracks:
  - At time `t`, `evaluateShapeTrackAtTime(track, t, lerpNodes, lerpSubpaths)`:
    - Interpolates between surrounding keyframes.
    - LERPs positions, shape parameters, animation parameters, colors.
    - Interpolates node/subpath geometry via `lerpNodes`/`lerpSubpaths`.
  - `useTimelineModulation` runs in a RAF loop and writes per-layer updates into `shapeTrackUpdatesRef.current`.
  - `useAnimation` consumes `shapeTrackUpdatesRef.current` and merges those updates into the live `Layer` objects, overriding movement and geometry while preserving noise/wobble which are applied at render time.

#### 8.4.3 Shape Keyframe Workflows

- **Capture Geometry (`C`)**:
  - At current playhead, capture the active layer into all its shape tracks.
  - Snapshot includes current geometry, position, shape params, animation params (if enabled), colors (if enabled).

- **Generate Variation Keyframe (Shift+V)**:
  - Uses current layer state as base.
  - Uses `generateVariedLayer` with current variation settings.
  - Writes a shape keyframe at playhead for the active track.

- **Generate Random Keyframes (Shift+R)**:
  - Asks for a count and whether to use audio transients for timing.
  - For each chosen time, generates a variation keyframe as above.
  - Optionally uses node modulation and energy-based variation scaling (if audio and energy map are available).

- **Fill Keyframes Between (Shift+F)**:
  - Given a shape track with ≥2 keyframes, prompts for count.
  - Generates times evenly spaced between first and last keyframe and creates variation keyframes there.

- **Reroll Variation**:
  - For a selected variation keyframe, `rerollVariationKeyframe(trackId, keyframeId, baseLayer)`:
    - Reads `extras.variation` metadata (seed, weights, categories).
    - Runs `generateVariedLayer` again with a new seed, preserving the same weights and affect categories.

#### 8.4.4 Timeline Presets & Freeze Interaction

- Timeline panel has a **Timeline Preset** button ("TL") that supports:
  - **Shift+Click / Empty**: save current AppState (minus `isFrozen`) as the start preset.
  - **Click (with preset)**: recall the preset when pressed, setting `isFrozen=false`.
  - **Alt+Click**: clear the preset.
- When playback starts from t≈0 and a start preset exists, the preset AppState is loaded automatically.
- When timeline playback is started from keyboard (`Space` while visible, or `P`):
  - Global `isFrozen` is automatically cleared so animation can run.

#### 8.4.5 Recording

- Recording uses `MediaRecorder` on a `canvas.captureStream()` plus optional audio track:
  - Canvas is captured at browser’s chosen framerate.
  - If timeline audio is present (`getAudioStream()`), a combined `MediaStream` is built with video + audio.
  - Recording chunks are collected and saved as `.mp4` or `.webm` chosen from supported MIME types.
  - A prompt asks for filename on stop.


### 8.5 Audio Transients & Energy Map

- **Flux-based transient detection** (for audio timeline markers):
  - Compute frame energies (`computeEnergyFlux`) from mono PCM.
  - Build `flux[]` as positive differences between successive frames.
  - `detectTransientsFromFlux` computes local averages and thresholds per frame; peaks above threshold become `transients[] = { time, strength }`.

- **Energy Map** (for energy-driven variation):
  - `buildEnergyMap(monoSamples, sampleRate, { windowSizeSec, hopSizeSec, smoothWindow })`:
    - Sliding RMS window across audio.
    - Smoothing over a window of energy samples.
    - Normalization to 0–1.
  - Stored in `TimelineContext` as `energyMap[] = { time, energy, normalized }`.
  - `getEnergyAtTime(energyMap, t)` uses binary search + linear interpolation.

- **Energy-Based Variation Scaling**:
  - In `generateVariationKeyframesAtTimes`, an `energyInfluence` option (0–1) controls scaling:
    - Compute `energyAtTime = getEnergyAtTime(energyMap, time)`.
    - `scaleWeightsByEnergy(weights, energyAtTime, energyInfluence)` adjusts variation weights so:
      - Low energy → multiplier near ~0.05.
      - High energy → multiplier up to ~2.0.
      - Influence 0 → multiplier 1 (no effect).
  - The final variation weights and energy info are stored in keyframe extras:
    - `extras.variation.weights` (post-scaling weights).
    - `extras.energy = { value: energyAtTime, influence: energyInfluence }` when used.


### 8.6 Audio Reactive Engine (Detailed)

- Uses Web Audio API via a custom hook (`useAudio`) that exposes:
  - Live analysis features: `features = { rms, bass, mids, highs }`.
  - Device list and current input.
  - An optional **file playback** mode with controls for play/pause/seek.

- **Per-Parameter Audio Mapping**:
  - Each parameter can be mapped to an audio band via `paramId -> { band, range }`.
  - Bands: `'none'|'rms'|'bass'|'mids'|'highs'`.
  - Range: `{ outputMin, outputMax }` specifying the parameter domain.
  - When audio is active, a RAF-driven dispatcher periodically:
    - For each mapped parameter, reads the current band value in [0,1].
    - Maps it to output range.
    - Throttles updates and only dispatches when the value changes beyond a small threshold.

- **Global Audio Settings** (GlobalControls → AudioReactiveSection):
  - Enable/disable audio.
  - Sensitivity (pre-gain), smoothing (attack), release (decay).
  - Input device selection.
  - File playback UI (load file, play/pause, seek, close file).
  - Visual meters for level/bass/mids/highs.

- **Mutual Exclusivity with BPM/MIDI**:
  - On a per-parameter basis:
    - Selecting an audio mapping disables BPM/MIDI mapping for that parameter.
    - Selecting BPM mapping disables audio/MIDI for that parameter.
    - MIDI learn overwrites existing audio/BPM mapping as needed.


### 8.7 BPM / Beat Sync Engine (Detailed)

- Global BPM clock (`useBPMClock`):
  - Maintains `currentBeat` and fractional `beatPhase` based on bpm and wall time.
  - Supports `play/pause/togglePlay/reset/tap`.

- **Mappings**:
  - `paramId -> { enabled, speed, loopMode, range, envelope }`.
  - `speed`: cycle length in beats (e.g. 1/4, 1, 4, 8 beats).
  - `loopMode`: `'forward'|'reverse'|'pingpong'|'oneshot'`.
  - `range`: output min/max.
  - `envelope`: optional piecewise curve (nodes in [0,1]x[0,1]) applied on top of loop mode.

- **Dispatch**:
  - RAF loop reads clock state via ref (no React deps).
  - For each mapped param:
    - Compute `cyclePhase = (totalBeats % speed) / speed`.
    - Apply loop mode and envelope to get `normalizedPhase`.
    - Map to output range.
    - Only dispatch to handlers when output value changes more than a small threshold.

- **Global UI (BPMSection)**:
  - Numeric BPM entry.
  - Play/pause/reset/tap controls.
  - Help text instructing the user to enable BPM per control.

- **Per-Parameter UI (BPMControlRow)**:
  - Toggle BPM for parameter.
  - Choose beat speed and loop mode.
  - Edit output range.
  - Open envelope editor to sculpt a custom automation curve with a visual playhead following the beat.


### 8.8 MIDI Control Engine (Detailed)

- WebMIDI-based engine mapping CC/Note messages to parameters.
  - Default mapping is auto-generated from `PARAMETERS` config.
  - Users can override via UI in GlobalControls.

- **Mappings**:
  - `paramId -> { type: 'cc'|'note', channel, number }`.
  - Stored in localStorage, merged with defaults.

- **Learn Mode**:
  - Setting `learnParamId` means the next incoming MIDI message will be assigned to that parameter.
  - After assignment, learn mode resets.

- **Dispatch**:
  - On each MIDI message:
    - Normalize value to [0,1] (`value01 = msg.value / 127`).
    - For every mapping that matches message type/channel/number, fire registered handlers
      with `{ value01, raw: msg }`.

- **Secret Debug CCs**:
  - Specific CC numbers can drive hidden parameters like `__secretLayer1ColorR/G/B` for debugging.


### 8.9 Presets, Autosave, Import/Export

- **Quick RAM Preset**:
  - Snapshot of `{ parameters, appState, audioConfig, bpmConfig, timelineConfig, exportMeta }`.
  - Stored in memory only (not persisted).
  - Saved with `S`, recalled with `Shift+A`.

- **Persistent Preset Slots**:
  - 16 slots stored in localStorage.
  - Each slot: `{ id, name, color, savedAt, payload, version }`.
  - Payload can contain app state and configuration for parameters, audio, BPM, timeline.

- **Autosave**:
  - Periodically writes compressed versions of the current scene into a small ring buffer in localStorage.
  - `AutosaveRecovery` surface in GlobalControls allows restoring from recent autosave slots.

- **Import/Export (JSON)**:
  - **Quick Export** prompts for filename and optional inclusion of app state.
  - Export payload includes parameters, appState, midiMappings, audioConfig, bpmConfig, timelineConfig, and meta.
  - Import path feeds data back into their respective contexts.


### 8.10 Groups & Multi-Selection

- **Groups**:
  - CRUD API: create, rename, recolor, add/remove members, delete.
  - `editTarget` may be `'single'|'selection'|'group'` with optional `groupId`.
  - When a group is active, controls operate on all group members (for applicable parameters).

- **Selection**:
  - `selectedLayerIds[]` for arbitrary multi-selection.
  - Toggling selection by clicking layers or using keyboard shortcuts.
  - `[`, `]`, and `Shift+1..9` switch the active layer index and clear multi-selection.


### 8.11 Global Controls Panel Behavior

- Tabs: Global, Layer Shape, Layer Animation, Layer Colour, Presets, Groups.
  - `1`..`6` hotkeys switch tabs.
  - `L` locks/unlocks the control panel in place; `H` hides/shows it (peek vs expanded).
- For each configurable parameter in Global or Layer tabs:
  - Slider + text input for value.
  - Optional audio mapping dropdown (Audio row).
  - Optional BPM mapping checkbox and settings (BPM row).
  - Optional MIDI mapping display with learn/clear controls.

### 8.12 Preset Morphing Engine

The app includes a preset morphing engine that interpolates between saved preset slots.
It operates in two ways:

1. **Autonomous morphing** driven by `usePresetMorph`.
2. **Timeline-driven morphing** using the global `morphProgress` parameter.

#### 8.12.1 Morph Configuration

Morphing is controlled by these AppState fields:

- `morphEnabled: boolean`
  - Master switch. When `false`, no automatic morphing runs.

- `morphRoute: number[]`
  - Ordered list of preset slot ids to traverse, e.g. `[1, 4, 7]`.
  - Each pair `(route[i], route[i+1])` forms one **leg** of the morph.

- `morphDurationPerLeg: number` (seconds)
  - Duration for each leg (A→B) in autonomous morphing.
  - Minimum duration clamped to ~0.2s for stability.

- `morphEasing: 'linear'` (extensible)
  - Currently only linear easing is implemented but the API is designed to support additional easing types.

- `morphLoopMode: 'loop' | 'pingpong'`
  - `loop`: progress wraps from last leg back to first (…A→B→C→A→B…).
  - `pingpong`: bounces along the route and back (A→B→C→B→A→B…).

- `morphMode: 'tween' | 'fade'`
  - `tween`: continuously interpolates numeric properties and colors between presets.
  - `fade`: cross-fades layer opacities between stacked copies of presets.

- `morphNodes: boolean`
  - When `true`, and when both presets have compatible geometry, node/subpath arrays are interpolated using `lerpNodes`/`lerpSubpaths`.


#### 8.12.2 Autonomous Morphing (`usePresetMorph`)

`usePresetMorph` runs a `requestAnimationFrame` loop when `morphEnabled` is true and `morphRoute.length >= 2`:

1. **Leg Setup**
   - Maintains `legIndex` and `forward` direction according to `morphLoopMode`.
   - Each leg transitions from preset id `fromId = morphRoute[legIndex]` to `toId = morphRoute[legIndex+1]`.
   - Loads `fromState = getPresetSlot(fromId).payload.appState` and `toState` likewise.
   - Strips morph-config fields from both states via `stripMorphFields` to avoid feedback.

2. **Time & Easing**
   - For each frame:
     - Compute `tRaw = clamp((now - startTime) / (morphDurationPerLeg * 1000), 0, 1)`.
     - Apply easing (currently linear) to obtain `t`.

3. **Tween Mode** (`morphMode === 'tween'`)
   - Background:
     - Interpolates `backgroundColor` in RGB space between `fromState.backgroundColor` and `toState.backgroundColor`.
   - Global speed:
     - Interpolates `globalSpeedMultiplier`.
   - Layers:
     - Ensures `prevLayers` length covers max of A/B lengths, cloning templates when needed.
     - For each index `i`:
       - Define `laSrc` and `lbSrc` as templates from A/B or fallbacks.
       - Interpolate:
         - `opacity` between source opacities.
         - `rotation`, `radiusFactor`, `movementSpeed`.
         - `position` (`x`, `y`, `scale`).
         - Palette colors element-wise using `lerpColor`, falling back when arrays differ in length.
       - If `morphNodes` is true and both A/B have compatible geometry:
         - Prefer `subpaths` interpolation via `lerpSubpaths`.
         - Fallback to `nodes` interpolation via `lerpNodes`.

4. **Fade Mode** (`morphMode === 'fade'`)
   - Construct an A+B stack once per leg:
     - Cache `layersA` and `layersB` and baseline opacities in `fadePrepRef` keyed by `"fromId->toId"`.
     - Set layers to `[...layersA (full opacity), ...layersB (opacity 0)]`.
   - Each frame:
     - Background color is still interpolated.
     - For each layer index:
       - If in A segment, opacity = `baseOpacityA * (1 - t)`.
       - If in B segment, opacity = `baseOpacityB * t`.
   - At leg boundaries, fully switch to the target preset’s layer set and reset fade prep.

5. **Leg Completion**
   - When `tRaw >= 1`:
     - Advance `legIndex` and `forward` per `morphLoopMode`.
     - Snap to the exact target preset state (layers, background, global speed) before starting next leg.
     - Reset fade prep so new A/B baselines are established.

The hook exposes `{ morphStatus }` with `{ from, to, t }` for UI (e.g. showing “Preset 2 → 5 (65%)”).


#### 8.12.3 Timeline-Driven Morphing (`morphProgress`)

In addition to autonomous morphing, the global parameter `morphProgress` can be driven by a timeline track to control morph position directly.

- In `TimelinePanel`, `morphProgress` appears as a **global trackable parameter** (`outputMin:0, outputMax:1`).

- In `useTimelineModulation`, when a global track’s `paramId` is `'morphProgress'`:
  - Reads current `value` in `[0,1]` and clamps it.
  - Uses `morphRouteRef.current` and `getPresetSlotRef.current` to:
    - Interpret `value` as position along the route:
      - `totalLegs = route.length - 1`.
      - `scaled = value * totalLegs`.
      - `legIndex = floor(scaled)`; `localT = scaled - legIndex`.
    - Load `fromState`/`toState` for the leg and strip morph fields.
    - Interpolate **once per frame** similarly to tween mode in `usePresetMorph`:
      - Background color and global speed.
      - Layer arrays (expanding to max length and interpolating opacity, rotation, radiusFactor, movementSpeed, position x/y/scale, and colors).
      - Optionally geometry with `morphNodesRef.current` via `lerpNodes`/`lerpSubpaths`.
  - This path does **not** require `morphEnabled` to be true; the timeline track alone determines morph position.

Thus, morphing can be:

- **Free-running** (using `morphEnabled` + `morphRoute` + `usePresetMorph`).
- **Timeline-synced** (using a `morphProgress` track to drive crossfades at specific times, or combined with other automation like audio/BPM).


## 9. Complete Keyboard Shortcuts Reference

This section consolidates shortcuts from `useKeyboardShortcuts` and `KeyboardShortcutsOverlay`. An implementation **must** support at least these bindings for parity.

### 9.1 Global UI / Layout

- **F**
  - Toggle fullscreen (canvas and UI)
  - Works even when inputs are focused.

- **H**
  - Hide / Show control panel (peek/expanded mode).

- **L**
  - Lock / Unlock control panel position.

- **K**
  - Toggle Keyboard Shortcuts overlay.

- **Esc**
  - Close dialogs/overlays (including shortcuts overlay).


### 9.2 Tabs / Panels

- **1**
  - Switch to Global tab.

- **2**
  - Layer Shape tab.

- **3**
  - Layer Animation tab.

- **4**
  - Layer Colour tab.

- **5**
  - Presets tab.

- **6**
  - Groups tab.


### 9.3 Animation, Freeze, Z, Isolate

- **Space**
  - When timeline is **hidden**: toggle global freeze (`isFrozen`).
  - When timeline is **visible**: toggle timeline play/pause and synchronize `isFrozen` (play → unfreeze, pause → freeze).

- **Z**
  - Toggle Z-Scale ignore (disables Z-axis scaling movement) globally.

- **G**
  - Toggle parameter target mode between `individual` and `global`.

- **I**
  - Toggle isolate mode (only selected layer(s) rendered).

- **O**
  - Toggle layer outlines visibility.


### 9.4 Node Editing & Layers

- **N**
  - Toggle node edit mode for the active layer.

- **Delete / Backspace**
  - When node edit mode is active and there are multiple layers: delete the currently selected layer.

- **[**
  - Select previous layer (wrap limited to [0, layersLen-1]).

- **]**
  - Select next layer.

- **Shift + Digit 1..9**
  - Activate Layer 1–9 (set `selectedLayerIndex`) and clear current multi-selection.


### 9.5 Randomization & Presets

- **R**
  - Randomize All (scene-level randomization) in the main canvas context.

- **Shift + R**
  - When timeline is visible: generate N random variation keyframes on the active shape track (prompts for count and options like transients/node modulation/energy influence).

- **S**
  - Save a Quick RAM preset (snapshot of parameters + app state + audio/BPM/timeline config).

- **Shift + A**
  - Recall the Quick RAM preset.


### 9.6 Audio, BPM, MIDI, Timeline

- **A**
  - Toggle audio reactive input on/off (global AudioProvider `enabled`).

- **B**
  - Toggle BPM play/pause for the global BPM clock.

- **T**
  - Toggle timeline visibility.

- **P**
  - Toggle timeline play/pause.
  - When about to start playing, ensures global freeze is cleared.

- **Home**
  - Stop timeline and move playhead to start (t=0).


### 9.7 Timeline Shape Keyframes

These shortcuts apply when the timeline is visible.

- **C**
  - Capture active layer geometry into its shape track(s) at current playhead time.

- **Shift + V**
  - Generate a variation keyframe at the current playhead on the active layer’s shape track.

- **Shift + R**
  - (As above) Generate random variation keyframes on active shape track.

- **Shift + F**
  - Fill variation keyframes between first and last keyframe on the active shape track.


### 9.8 Shortcuts Overlay Toggle

- **K**
  - Show/hide the Keyboard Shortcuts overlay.


---

This extended reference, combined with sections 1–7, is intended to be sufficient for a clean-room reimplementation that faithfully recreates the current app’s behavior, including timeline automation, audio/BPM/MIDI modulation, variation, node editing, presets/autosave, and all keyboard shortcuts.

