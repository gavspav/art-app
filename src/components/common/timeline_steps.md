# Timeline Feature – Implementation Plan

Seconds-based, one‑shot timeline with global loop, per-layer tracks, internal modulation (no MIDI), and optional local-audio waveform.

**STATUS: ✅ IMPLEMENTED** (December 2024)

---

## Phase 0 – Preparation

- [x] **Review existing systems**
  - [ ] Skim `BPMEnvelopeEditor.jsx` for curve/easing logic and interaction patterns to reuse.
  - [ ] Skim `BPMContext.jsx`, `useModulationStore.js`, `useAnimation.js` to see how modulations are applied per layer.
  - [ ] Confirm where global layout is managed (likely `App.jsx` + main layout components).

- [ ] **Decide file locations**
  - [ ] `src/context/TimelineContext.jsx` (or `.js`)
  - [ ] `src/components/timeline/TimelinePanel.jsx`
  - [ ] `src/components/timeline/TimelineTrackRow.jsx`
  - [ ] `src/components/timeline/TimelineCurveEditor.jsx`
  - [ ] `src/components/timeline/TimelineWaveform.jsx`

---

## Phase 1 – Core State & Context

- [ ] **Define core data model (JS objects / JSDoc)**
  - [ ] `TimelineSession`:
    - `lengthSeconds: number`
    - `tracks: TimelineTrack[]`
    - `audio: null | { src, durationSeconds, peaks, offsetSeconds }`
    - `loop: { enabled, startSeconds, endSeconds }`
  - [ ] `TimelineTrack`:
    - `id, name, color, enabled`
    - `targetId: string` (e.g. `layer:<layerId>:radiusFactor`)
    - `range: { outputMin, outputMax }`
    - `keyframes: TimelineKeyframe[]`
  - [ ] `TimelineKeyframe`:
    - `id`
    - `timeSeconds: number`
    - `value01: number`
    - `curve?: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'step' | 'stepStart' | 'stepEnd'`
    - `tension?: number`

- [ ] **Create `TimelineContext` + `useTimeline` hook**
  - [ ] Provide:
    - `session`, `setSession`
    - `playback: { isPlaying, positionSeconds }`
    - Actions: `play()`, `pause()`, `stop()`, `setPosition(seconds)`, `setLoop(config)`
    - Track CRUD: `addTrack`, `updateTrack`, `removeTrack`
    - Keyframe CRUD: `addKeyframe`, `updateKeyframe`, `removeKeyframe`
  - [ ] Wrap app in `<TimelineProvider>` in `App.jsx`.

---

## Phase 2 – Playback Loop (Seconds & One-shot + Loop)

- [ ] **Implement RAF-based playback**
  - [ ] Store `lastUpdateTime` in a ref.
  - [ ] On `play()`:
    - Set `isPlaying = true`
    - Start `requestAnimationFrame` loop.
  - [ ] On each frame:
    - Compute `deltaSeconds` from `performance.now()`.
    - Advance `positionSeconds += deltaSeconds`.
    - Apply looping rules:
      - If `loop.enabled` and `positionSeconds > loop.endSeconds` → wrap to `loop.startSeconds`.
      - Else if `positionSeconds >= lengthSeconds` → set to `lengthSeconds` and `isPlaying = false`.
  - [ ] On `pause()` / `stop()`:
    - Cancel RAF and update state accordingly.

- [ ] **Implement scrubbing**
  - [ ] Expose `setPosition(seconds)` to be called by UI (waveform, track area).
  - [ ] Ensure manual scrubs do not break loop logic.

---

## Phase 3 – Evaluation Engine (Curves)

- [ ] **Extract/reuse easing logic from `BPMEnvelopeEditor`**
  - [ ] Factor out curve/easing functions into a small utility module (e.g. `src/utils/envelopes.js`).
  - [ ] Support:
    - `linear`, `easeIn`, `easeOut`, `easeInOut`, `step`, `stepStart`, `stepEnd`
    - Optional `tension` parameter for non-linear curves.

- [ ] **Implement `evaluateTrackAtTime(track, tSeconds)`**
  - [ ] Handle edge cases:
    - No keyframes → return `null` or a default.
    - `tSeconds` before first keyframe → clamp to first.
    - `tSeconds` after last keyframe → clamp to last.
  - [ ] Find surrounding keyframes `k0`, `k1` s.t. `k0.time <= t <= k1.time`.
  - [ ] Compute `u = (t - k0.time) / (k1.time - k0.time)`.
  - [ ] Apply curve + tension from `k0` to get eased `u'`.
  - [ ] Interpolate `value01` between `k0.value01` and `k1.value01`.
  - [ ] Map to `range.outputMin..outputMax`.

- [ ] **Add evaluation API to `useTimeline`**
  - [ ] `getValueForTrack(trackId, tSeconds)`
  - [ ] `getValuesForAllTracks(tSeconds)` (for batch evaluation in the modulation step).

---

## Phase 4 – Integration with Modulation Store

- [ ] **Extend `useModulationStore` to support a `'timeline'` source**
  - [ ] Add `timelineModsRef` in addition to `bpmModsRef` and `audioModsRef`.
  - [ ] Update `setMod(source, layerId, paramId, value)` to support `source === 'timeline'`.
  - [ ] Update `getLayerMods` / `applyModulationsToLayer` merge logic:
    - Decide order of precedence (e.g. `audio` → `bpm` → `timeline`).
  - [ ] Update helper `applyModulationsToLayer` exported function similarly.

- [ ] **Map `targetId` → (layerId, paramId | global setter)**
  - [ ] Implement a small resolver utility:
    - If `targetId` starts with `layer:` → parse layerId and paramId.
    - If `targetId` starts with `global:` → identify which global setter to call.
  - [ ] For layer params:
    - Use `modulationStore.setMod('timeline', layerId, paramId, value)`.
  - [ ] For globals:
    - Call the appropriate React state setter directly (e.g. `setGlobalSpeedMultiplier`).

- [ ] **Per-frame application of timeline values**
  - [ ] In the timeline playback RAF loop or a dedicated hook:
    - For current `positionSeconds`:
      - Evaluate all **enabled** tracks.
      - For each:
        - Resolve `targetId`.
        - Apply value via modulation store or global setter.
  - [ ] Consider a simple value-change threshold to avoid noisy updates.

- [ ] **Enforce exclusivity with BPM/Audio/MIDI**
  - [ ] When enabling a timeline track (or assigning `targetId`):
    - Clear BPM mapping for that parameter if exists (`BPMContext.clearMapping` or equivalent).
    - Clear audio reactive mapping for that parameter (e.g. set band to `none`).
    - Clear MIDI mapping for that parameter (if you have a MIDI mapping context).
  - [ ] Optional: store previous mapping to allow restoring when track is disabled.

---

## Phase 5 – Basic UI & Layout Integration

- [ ] **Create `TimelinePanel` skeleton**
  - [ ] Component props: reads all state from `useTimeline()` + relevant hooks (layers, globals).
  - [ ] Layout:
    - Header: transport controls + “Load audio” button + “Show timeline” toggle.
    - Waveform area placeholder.
    - Tracks area with one hard-coded track for initial testing.

- [ ] **Integrate into main layout**
  - [ ] In `App.jsx` or main layout component:
    - Add a toggle to show/hide `TimelinePanel`.
    - Use flexbox to split view vertically:
      - Top: existing UI (50% height).
      - Bottom: `TimelinePanel` (50% height) when visible.

- [ ] **Wire up transport controls**
  - [ ] Play/Pause buttons → `play()` / `pause()`.
  - [ ] Stop button → `stop()` (set position to 0 and pause).
  - [ ] Time display: format `positionSeconds` as `mm:ss.ms`.

---

## Phase 6 – Curve Editing UI (Per-track Editor)

- [ ] **Create `TimelineCurveEditor`**
  - [ ] Use SVG (or Canvas) similar to `BPMEnvelopeEditor`.
  - [ ] Horizontal axis: 0..`lengthSeconds` (scaled to view).
  - [ ] Vertical axis: 0..1 (normalized).
  - [ ] Implement:
    - Click/double-click to add keyframes.
    - Drag keyframes:
      - X: 0..`lengthSeconds`; clamp first keyframe at 0 and last at `lengthSeconds`.
      - Y: 0..1.
    - Keyframe deletion (double-click or context menu).
    - Segment context menu for curve type / tension info.
    - Playhead line at `positionSeconds`.

- [ ] **Scrolling and zooming**
  - [ ] Add horizontal scroll if timeline length exceeds viewport.
  - [ ] Introduce simple zoom control (seconds visible per screen).

---

## Phase 7 – Tracks & Parameter Assignment UI

- [ ] **Track list UI (`TimelineTrackRow`)**
  - [ ] Show:
    - Track color.
    - Name (editable).
    - Parameter target label (e.g. `Layer 1 – radiusFactor`).
    - Enable toggle.
    - Delete button.
  - [ ] Click on target label opens parameter picker.

- [ ] **Parameter picker**
  - [ ] List layers and their exposed parameters:
    - `Layer 1` → subset of useful numeric params.
    - `Layer 2` → …
  - [ ] Optionally a “Global” section for global controls.
  - [ ] On selection:
    - Set `track.targetId`.
    - Assign a default `range` (e.g. based on parameter defaults).
    - Trigger exclusivity clearing of BPM/audio/MIDI mappings.

- [ ] **Track CRUD**
  - [ ] “+ Add Track” button:
    - Creates a new track with default keyframes (start/end).
    - Immediately prompts for parameter assignment.
  - [ ] Track removal:
    - Deletes track and clears its timeline modulations.

---

## Phase 8 – Audio Waveform Integration (Local File)

- [ ] **Load and decode audio**
  - [ ] “Load audio file…” button:
    - Use `<input type="file" accept="audio/*">`.
    - Decode file to `AudioBuffer` via Web Audio.
  - [ ] Store in `TimelineSession.audio`:
    - `src` (object URL or reference)
    - `durationSeconds`
    - Raw buffer for peak computation.

- [ ] **Compute peaks**
  - [ ] Downsample buffer into a manageable number of peaks (e.g. 2k–8k).
  - [ ] Store `peaks: number[]` in `audio`.

- [ ] **Create `TimelineWaveform` component**
  - [ ] Draw waveform in sync with seconds grid.
  - [ ] Overlay playhead at `positionSeconds`.
  - [ ] Allow click/drag to scrub → `setPosition(seconds)`.

- [ ] **Sync Web Audio playback with timeline**
  - [ ] On play:
    - Start an `AudioBufferSourceNode` at `positionSeconds`.
  - [ ] On pause:
    - Stop node and keep `positionSeconds` in context.
  - [ ] On scrub:
    - Update `positionSeconds`; on next play, start from new position.

---

## Phase 9 – Persistence & Export/Import

- [ ] **Add timeline to preset/project save**
  - [ ] Extend existing snapshot format (if any) to include `timeline`:
    - `settings.timeline = { lengthSeconds, tracks, audio (minus raw buffer), loop }`.
  - [ ] On save:
    - Serialize timeline session to JSON-safe structure.
  - [ ] On load:
    - Restore tracks, keyframes, loop settings.
    - For audio:
      - Either re-load from original src URL, or treat audio separately.

---

## Phase 10 – Polish & Performance

- [ ] **Performance**
  - [ ] Ensure evaluation & modulation application is O(number of enabled tracks), not per layer-param unnecessarily.
  - [ ] Avoid re-rendering React-heavy components on every frame:
    - Keep fast state (position, peaks, etc.) in refs where possible.
  - [ ] Consider canvas for waveform and curves if SVG becomes heavy.

- [ ] **UX polish**
  - [ ] Draggable vertical splitter between top UI and timeline.
  - [ ] Snap to grid for keyframes (e.g. 0.1s or beat-based snapping as an option).
  - [ ] Tooltips for track values at playhead.
  - [ ] Keyboard shortcuts (spacebar play/pause, home to start, etc.).