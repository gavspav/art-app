# TouchDesigner Port — Implementation Plan

## Feature Inventory (what you're porting)

| Feature | Current Implementation | Complexity |
|---|---|---|
| Multi-layer procedural shapes | Canvas 2D `drawShape()` — polygon with noise, wobble, curviness | High |
| Node-based custom geometry | Editable control points, cubic bezier curves, subpaths | High |
| SVG import | `svgImportEnhanced.js` → normalized node arrays | Medium |
| Movement styles | bounce, drift, orbit, spin, still — per layer | Medium |
| Z-axis scale oscillation | Per-layer scale min/max/speed | Low |
| Color palettes & fading | Per-layer multi-color, HSL cycling over time | Medium |
| Blend modes & opacity | Canvas composite operations per layer | Low (native) |
| Audio reactivity | Web Audio API → RMS/bass/mids/highs → param mapping | Medium |
| BPM clock + modulation | Phase-based LFOs mapped to any parameter | Medium |
| Timeline + shape tracks | Keyframed parameter & geometry interpolation | High |
| Preset morphing | Tween/fade between saved layer states | Medium |
| MIDI mapping | MIDI CC → parameter bindings | Low (native) |
| Randomization / variation | Seeded RNG varying shape, anim, color, position per layer | Medium |
| Save/load (JSON) | Full state serialization | Low |

---

## Architecture: Modular TD Network

Think of it as **four zones** mirroring the data flow in the React app:

```
┌─────────────┐   ┌──────────────┐   ┌────────────┐   ┌──────────┐
│  DATA LAYER  │──▶│  MODULATION  │──▶│  RENDERER   │──▶│  OUTPUT  │
│  (state)     │   │  (anim/audio)│   │  (SOPs→TOP) │   │  (TOP)   │
└─────────────┘   └──────────────┘   └────────────┘   └──────────┘
```

### Zone 1 — Data Layer (replaces `AppStateContext` + `defaults.js`)

**Implementation:** A **base COMP** called `LayerManager` containing:

- A **Table DAT** (`layer_table`) — one row per layer, columns for every property in `DEFAULT_LAYER` (numSides, curviness, wobble, noiseAmount, opacity, movementStyle, movementSpeed, colors, position_x, position_y, scale, etc.)
- A **Python Extension** (`LayerManagerExt`) on the COMP that provides:
  - `addLayer(variation_params)` / `removeLayer(index)` / `duplicateLayer(index)`
  - `randomizeAll(seed, variation_weights)` — port of `buildVariedLayerFrom()`
  - `loadConfig(json_path)` / `saveConfig(json_path)` — direct port of your JSON serialisation
  - `setParam(layer_index, param_id, value)` — generic setter
- A **Replicator COMP** that stamps out one **Layer COMP** per row, each containing its own render chain

**What's Python vs operators:**
- `layerVariation.js` → Python (`layer_variation.py`) — seeded RNG, parameter mixing, palette picking
- `random.js` / `mathUtils.js` → Python utility module
- `palettes.js` / `defaults.js` → Python constants or a JSON DAT
- `colorUtils.js` → Python (HSL ↔ RGB ↔ hex conversions)

### Zone 2 — Modulation Layer (replaces `useAnimation`, `useAudio`, `useBPMClock`, `useTimelineModulation`)

#### 2a. Animation Engine (`animation_engine` CHOP network)

Replaces `useAnimation.js` → `updateLayerAnimation()`.

Per replicated layer:
- **LFO CHOP** or **Timer CHOP** driving position accumulator
- **A Script CHOP** or small Python callback that implements:
  - **Bounce**: clamp position to [0,1], reflect angle on boundary hit
  - **Drift**: modulo wrap
  - **Orbit**: cos/sin with per-axis radii
  - **Spin**: rotation accumulator
  - **Still**: passthrough
- **Speed** controlled by a `globalSpeedMultiplier` parameter on the parent
- **Freeze** toggle → simply disable the Timer/Script CHOP cook

Alternatively, the **entire movement loop** could be a single **Script CHOP** that reads the layer table and outputs `tx, ty, scale, rotation` channels per layer — this is closer to your current "single RAF loop" design and avoids per-layer CHOP overhead.

#### 2b. Audio Reactivity (`audio_reactive` COMP)

Replaces `useAudio.js` + `useAudioHandlers.js`.

**Mostly native TD operators:**
- **Audio Device In CHOP** (or **Audio File In CHOP** for file playback)
- **Audio Spectrum CHOP** → frequency bins
- **Math CHOP** / **Select CHOP** to extract:
  - RMS (use **Analyze CHOP** with RMS mode)
  - Bass / Mids / Highs (band-split with **Audio Band EQ** or frequency-range selects on the spectrum)
- **Lag CHOP** for smoothing (replaces your exponential smoothing)
- **Audio Spectrum TOP** for visual meters
- A **mapping table** (Table DAT) defining `{band, inputMin, inputMax, outputMin, outputMax, targetParam}` — port of your `mappings` object
- A small **Script CHOP** that reads the mapping table + current band values and outputs modulated parameter values

#### 2c. BPM Clock (`bpm_clock` COMP)

Replaces `useBPMClock.js`.

- **Timer CHOP** or **Beat CHOP** set to the BPM value
- Outputs: `beat`, `beatPhase`, `bar` channels
- A mapping table + **Script CHOP** identical in structure to audio mappings, outputting modulated values per parameter
- Loop modes (forward, reverse, pingpong, oneshot) in Python

#### 2d. Modulation Merger

Replaces `useModulationStore.js` + `applyModulationsToLayer()`.

- A **Merge CHOP** or **Script CHOP** combining audio, BPM, and timeline outputs with **precedence**: Timeline > BPM > Audio
- Output: one channel per `{layerIndex}:{paramId}` — these feed back into the render chain

#### 2e. Timeline (`timeline` COMP)

Replaces `TimelineContext.jsx` + `useTimelineModulation.js` + `envelopes.js`.

This is the most complex subsystem. Two approaches:

**Option A — Native TD keyframes:**
Use TD's built-in **Animation COMP** with keyframe channels. Each track becomes an Animation COMP channel. Shape tracks (geometry interpolation) would still need Python for `lerpNodes` / `lerpSubpaths`.

**Option B — Custom Python timeline (closer to your current design):**
- A **Timer CHOP** as the transport (play/pause/seek/loop)
- Track data stored in a **JSON DAT** or **Table DAT** (keyframes with time, value, curve type, tension)
- A Python extension that evaluates tracks at current time — direct port of `evaluateShapeTrackAtTime()` and `evaluateGlobalShapeTrackAtTime()` from `envelopes.js`
- Shape track interpolation (`lerpNodes`, `lerpSubpaths` from `nodeUtils.js`) → Python
- Outputs modulated values into the Modulation Merger

**Recommendation:** Option B for shape tracks (TD Animation COMPs don't natively interpolate geometry arrays), but use native keyframing for simple numeric params if you want visual curve editing.

### Zone 3 — Renderer (replaces `Canvas.jsx` → `drawShape()`)

This is where TD shines vs Canvas 2D. Several strategies:

#### 3a. SOP-based rendering (recommended for your use case)

Each layer becomes a **SOP → TOP** pipeline:

```
[Circle/Grid SOP] → [Noise SOP] → [Transform SOP] → [Convert SOP] → [Render TOP]
                                                                        ↑
                                                              [Camera COMP, Light COMP]
```

Per layer:
- **Circle SOP** with `divisions` = `numSides`, or a **Script SOP** generating your custom polygon
- **For node-based shapes**: A **Script SOP** that builds geometry from the nodes array (port of your `buildDeformedPoints` / bezier curve logic)
- **Noise SOP** replaces your `noiseAmount` / `wobble` deformation — TD's noise SOP is more powerful (Perlin, simplex, etc.) and runs on GPU
- **Transform SOP** for position (tx, ty), rotation, scale — driven by animation engine channels
- **Material**: **Constant MAT** or **Phong MAT** with vertex colors for multi-color support
- **Render TOP** with orthographic camera, compositing all layers

**Multi-color fill:** Your current app uses multi-stop radial/linear gradients per shape. In TD:
- Use a **Ramp TOP** as texture input to the material
- Or assign vertex colors in the Script SOP and use a **Constant MAT** with vertex color mode
- Color fading: animate the Ramp TOP or vertex colors over time

#### 3b. Compositing

Replaces your per-layer blend modes:

- Each layer renders to its own **Render TOP**
- **Composite TOP** chain with blend mode per layer (Add, Multiply, Over, Screen, etc.) — TD supports all standard blend modes natively
- **Level TOP** for per-layer opacity
- Background color: **Constant TOP** as the base of the composite chain

#### 3c. Instanced rendering (performance optimization)

If you want 10+ layers without per-layer render overhead:
- Use **geometry instancing** on a single Render TOP
- Instance transforms (position, scale, rotation) from CHOP channels
- Instance colors from a texture or CHOP
- This maps well to your "all layers share the same shape type" scenarios

### Zone 4 — Output

- **Window COMP** for fullscreen display
- **Movie File Out TOP** for video export (replaces `videoExport.js`)
- **NDI Out TOP** or **Syphon Out TOP** for live output

---

## Interface / UI

Your React control panel maps to TD's **Custom Parameters** + optional **Web Render TOP**:

### Option A — Native TD Custom Parameters (simpler)
- Each COMP gets custom parameters (sliders, toggles, dropdowns) matching your `PARAMETERS` array
- Users interact via TD's parameter dialog or a **Container COMP** with widgets
- Layer selection via a **List COMP**
- Preset save/load via Python callbacks storing to JSON

### Option B — Web UI in TD (preserves your React UI)
- **Web Render TOP** loading a stripped-down version of your React controls
- Communicate via **WebSocket DAT** or TD's built-in web server
- This lets you keep your existing UI almost as-is, but adds latency

### Option C — Hybrid (recommended)
- Core params as TD custom parameters (for direct MIDI/OSC mapping)
- A lightweight **Container COMP** UI with:
  - Layer list (Table COMP)
  - Parameter sliders (Slider COMP)
  - Palette picker (Button COMP grid)
  - Timeline transport (custom panel)
- Node editing: TD doesn't have a built-in 2D node editor, so either:
  - Use a **Panel CHOP** to capture mouse clicks on the render output and implement handle dragging in Python
  - Or keep a web-based node editor via Web Render TOP

---

## MIDI

Replaces `useMIDIHandlers.js`. **Trivially native in TD:**
- **MIDI In CHOP** → channels per CC
- Map to custom parameters via **CHOP Export** or **Parameter CHOP**
- Your mapping table becomes a TD **Table DAT**

---

## File Structure

```
project.toe
├── LayerManager/           (base COMP)
│   ├── layer_table         (Table DAT — layer state)
│   ├── palettes            (Table DAT)
│   ├── defaults            (Table DAT)
│   ├── LayerManagerExt     (Text DAT — Python extension)
│   └── layer_variation     (Text DAT — Python module)
│
├── AnimationEngine/        (base COMP)
│   ├── movement_script     (Script CHOP — bounce/drift/orbit/spin)
│   ├── speed_control       (CHOP)
│   └── freeze_toggle       (CHOP)
│
├── AudioReactive/          (base COMP)
│   ├── audio_in            (Audio Device In / File In CHOP)
│   ├── spectrum            (Audio Spectrum CHOP)
│   ├── band_analysis       (Script CHOP — RMS/bass/mids/highs)
│   ├── smoothing           (Lag CHOP)
│   └── mapping_table       (Table DAT)
│
├── BPMClock/               (base COMP)
│   ├── beat_timer          (Timer/Beat CHOP)
│   ├── mapping_table       (Table DAT)
│   └── modulation_script   (Script CHOP)
│
├── ModulationMerger/       (base COMP — precedence merge)
│
├── Timeline/               (base COMP)
│   ├── transport           (Timer CHOP)
│   ├── track_data          (JSON DAT / Table DAT)
│   ├── TimelineExt         (Text DAT — Python: envelope eval, lerp)
│   └── waveform_display    (Audio Spectrum TOP, optional)
│
├── Renderer/               (base COMP)
│   ├── LayerTemplate/      (replicated per layer)
│   │   ├── shape_gen       (Script SOP or Circle SOP)
│   │   ├── noise_deform    (Noise SOP)
│   │   ├── transform       (Transform SOP)
│   │   ├── material        (Constant MAT)
│   │   └── layer_render    (Render TOP)
│   ├── compositor          (Composite TOP chain)
│   └── background          (Constant TOP)
│
├── UI/                     (Container COMP)
│   ├── layer_list          (Table/List COMP)
│   ├── param_sliders       (Slider COMPs)
│   └── palette_picker      (Button COMP grid)
│
├── MIDIInput/              (MIDI In CHOP + mapping)
│
└── Output/                 (Window COMP, Movie File Out TOP)
```

---

## Porting Priority (recommended order)

| Phase | What | Effort | Notes |
|---|---|---|---|
| **1** | Single-layer shape renderer (SOP pipeline + noise) | 2–3 days | Prove the visual fidelity matches |
| **2** | Layer table + replicator (multi-layer) | 1–2 days | Table DAT + Replicator COMP |
| **3** | Animation engine (bounce/drift/orbit) | 1–2 days | Script CHOP, mostly arithmetic |
| **4** | Composite chain + blend modes + opacity | 0.5 day | Native TD |
| **5** | Color system (palettes, fading, multi-color) | 1 day | Vertex colors or ramp textures |
| **6** | Randomization / variation system | 1–2 days | Python port of `layerVariation.js` |
| **7** | Audio reactivity | 1 day | Mostly native TD operators |
| **8** | BPM clock + modulations | 1 day | Timer/Beat CHOP + mapping |
| **9** | MIDI mapping | 0.5 day | Native TD |
| **10** | Save/load JSON configs | 0.5 day | Python read/write |
| **11** | Timeline + shape tracks | 3–5 days | Heaviest port — envelope eval + geometry lerp in Python |
| **12** | Preset morphing | 1 day | Python port of `usePresetMorph.js` |
| **13** | UI (controls panel) | 2–3 days | Container COMP widgets |
| **14** | Node editing / SVG import | 2–3 days | Script SOP + mouse interaction |

**Total estimate: ~3–4 weeks** for a solo developer familiar with both codebases.

---

## What Ports to Python vs What Uses Native Operators

| **Python** | **Native TD Operators** |
|---|---|
| `layerVariation.js` (seeded randomisation) | Audio input + spectrum analysis (CHOP) |
| `envelopes.js` (keyframe evaluation, curves) | Noise deformation (Noise SOP) |
| `nodeUtils.js` (lerp nodes/subpaths) | Transform (Transform SOP) |
| `colorUtils.js` (HSL↔RGB) | Blend modes (Composite TOP) |
| `random.js` (seeded PRNG) | MIDI input (MIDI In CHOP) |
| `svgImportEnhanced.js` (SVG → nodes) | BPM beat detection (Beat CHOP) |
| Movement logic (bounce/drift/orbit) | Smoothing/lag (Lag CHOP) |
| Config save/load | Video export (Movie File Out TOP) |
| Shape track interpolation | Fullscreen output (Window COMP) |

---

## Key Gotchas

- **Your Canvas 2D bezier rendering** uses cubic control points calculated from node positions. The Script SOP equivalent needs to output NURBS or poly curves matching that exact algorithm — test visual parity early in Phase 1.
- **Noise deformation**: your JS noise uses seeded sin-based harmonics (`freq1/freq2/freq3`), not Perlin. TD's Noise SOP uses Perlin/Simplex. You may need a **Script SOP** to match the exact look, or accept a slightly different aesthetic from TD's superior noise.
- **Coordinate system**: your app uses normalised [0,1] coordinates. TD uses world-space units. Pick a convention early (e.g., orthographic camera with 0–1 viewing volume).
- **Color fading**: your HSL cycling per vertex is custom. In TD, animate a **Ramp TOP** or use a GLSL material.

---

## Source Code Mapping

| React file | TD location | Notes |
|---|---|---|
| `src/constants/defaults.js` | `LayerManager/defaults` (Table DAT) | Static table |
| `src/constants/palettes.js` | `LayerManager/palettes` (Table DAT) | 15 built-in palettes |
| `src/config/parameters.js` | Custom parameters on Layer COMP | 1:1 mapping |
| `src/hooks/useAnimation.js` | `AnimationEngine` (Script CHOP) | Movement logic |
| `src/hooks/useAudio.js` | `AudioReactive/audio_in` + operators | Native TD audio |
| `src/hooks/useBPMClock.js` | `BPMClock/beat_timer` (CHOP) | Timer/Beat CHOP |
| `src/hooks/useTimelineModulation.js` | `Timeline/TimelineExt` (Python) | Envelope evaluation |
| `src/hooks/useModulationStore.js` | `ModulationMerger` (Script CHOP) | Precedence merge |
| `src/hooks/usePresetMorph.js` | `LayerManager/merge_presets` (Python) | Tween states |
| `src/utils/layerVariation.js` | `LayerManager/layer_variation` (Python) | Randomization |
| `src/utils/envelopes.js` | `Timeline/TimelineExt` (Python) | Curve evaluation |
| `src/utils/nodeUtils.js` | `Renderer/ScriptSOPs` (Python) | Bezier geometry |
| `src/utils/colorUtils.js` | Python utility module | HSL conversions |
| `src/utils/svgImportEnhanced.js` | `LayerManager/svg_import` (Python) | Path parsing |
| `src/components/Canvas.jsx` | `Renderer` (SOP/TOP network) | Visual output |
| `src/context/TimelineContext.jsx` | `Timeline` (COMP + Python) | Transport state |
| `src/context/AppStateContext.jsx` | `LayerManager` (COMP + Python) | Global state |
