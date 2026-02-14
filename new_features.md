# New Features Guide for `Codex_5_3_refactor`

This guide explains the new features in plain language.

Think of this app like a visual music instrument:
- The **canvas** is your stage.
- The **controls** are your knobs.
- The **timeline** is your choreography planner.
- The **audio system** is your motion sensor.

This branch is a major update (120 files changed), so this guide is intentionally detailed and beginner-friendly.

---

## 1) What changed overall (big picture)

The `Codex_5_3_refactor` branch adds and improves:

1. **Timeline workflow** became much stronger
   - Better keyframe tools
   - Better shape/global-shape animation
   - Better zoom/waveform behavior
   - Better timeline layout with draggable splitters

2. **Audio-reactive workflow** became much deeper
   - Better mic + audio-file support
   - Better smoothing and stability
   - New audio mapping "modes" (slow behavior styles)
   - New one-click audio preset systems

3. **Drag-handle interactions** were expanded
   - Randomization min/max handles
   - Timeline split handles
   - Draggable zoom value in transport
   - Better keyframe dragging and seeking

4. **Reliability and performance** improved
   - Less per-frame React churn
   - Better shape-track evaluation model
   - Fixes for auto-created track timing races
   - Waveform rendering stability at high zoom

5. **UI/UX refactor and cleanup**
   - New design-token based styling
   - Global tab reorganization
   - Audio sections improved
   - Better panel behavior in timeline mode

---

## 2) Timeline mode: "explain like I'm 5"

If free mode is painting live, timeline mode is making a flipbook.
You place "snapshots" over time, and the app blends between them.

### 2.1 Entering timeline mode

- Press **T** or use the timeline toggle control.
- Screen becomes a split workspace:
  - Top area: controls + canvas
  - Bottom area: timeline

Important:
- In timeline mode, **live Audio + BPM automation are muted**.
- Your settings are not lost. They resume when you leave timeline mode.

---

### 2.2 Timeline layout drag handles (new)

You now have draggable dividers:

1. **Left-right divider** (between control panel and canvas)
   - Drag left/right to change how much width each side gets.

2. **Top-bottom divider** (between top workspace and timeline panel)
   - Drag up/down to make timeline taller/shorter.

Why this matters:
- You can now choose your own working balance:
  - More timeline space for editing
  - More canvas space for visuals

---

### 2.3 Transport bar (play controls)

The timeline transport includes:
- Play/pause
- Stop
- Time readout
- Timeline length
- Loop controls
- Audio load/clear
- Zoom controls

#### Draggable zoom value (new-ish, improved)
- In addition to zoom buttons, the zoom value itself can be dragged left/right.
- Drag right to zoom in, left to zoom out.
- Zoom range can go very high (up to 4000) for precision editing.

---

### 2.4 Waveform + transients + energy overlays

When timeline audio is loaded:

1. **Waveform** shows loud/quiet shape of audio.
2. **Transient markers** show likely hit points (kicks, claps, accents).
3. **Energy overlay** shows intensity trend over time.

Why this matters:
- You can place keyframes where the music actually changes.

Stability improvements included:
- Better rendering at high zoom.
- Viewport-based drawing to avoid giant canvas issues.
- Better behavior when scrolling while zoomed.

---

### 2.5 Tracks and track types

You can add different track types:

1. **Numeric track**
   - Animates a number (like opacity, speed, radius).

2. **Color track**
   - Animates color over time.

3. **Shape track (per layer)**
   - Animates one layer's geometry + related data.

4. **Global Shape track**
   - Animates **all layers together** between snapshots.

---

### 2.6 Keyframe editing (curve editor)

In the curve row editor:

- Drag keyframe dots to move in time/value.
- Double-click to add keyframes.
- Context menu options for curve types and operations.
- Click timeline background to seek playhead.
- Copy/paste keyframes and reroll variation where supported.

For shape/global-shape tracks:
- You are editing "snapshots" of shape state.

---

### 2.7 Global Shape track (major feature)

This is one of the biggest timeline features.

Think of it as:
- "Take a photo of the whole scene at this time"
- "Take another photo later"
- "The app morphs between the two photos"

Each global shape keyframe stores, per layer:
- Nodes/subpaths
- Position (x/y/scale/offset)
- Shape parameters
- Animation parameters
- Colors

You can:
- Capture current scene
- Generate varied scene
- Reroll a generated keyframe
- Toggle categories (Shape/Anim/Color)

Recent consistency fixes:
- Global keyframes now reliably keep base snapshots for runtime blending.
- Runtime color blending now respects variation color behavior better.

---

### 2.8 Random generation tools in timeline

You have three generation styles:

1. **Generate one variation keyframe**
   - Great for quick idea at current playhead.

2. **Generate random keyframes (N)**
   - Great for filling a section with variation quickly.

3. **Fill between**
   - Great for creating in-between keyframes from a left and right anchor.

These can use:
- Variation sliders
- Node modulation (breathing-like deformation)
- Audio transients as timing source
- Energy influence
- Global palette constraints

---

### 2.9 Auto-created shape tracks (quality-of-life)

If you trigger variation/random generation but no shape track exists:
- The app can auto-create the needed shape track for you.

Recent race-condition fixes:
- Generation is deferred by one frame after track creation,
  so keyframe creation no longer silently fails.

---

### 2.10 Per-track energy band selection

Shape/global-shape timeline blending can use energy scaling.
You can choose which audio-energy band a track listens to:
- Total
- Low
- Mid
- High

This lets one track react to bass while another reacts to highs.

---

### 2.11 Timeline start preset (TL behavior)

You can set a special "starting scene" for timeline playback.

- Save current state as timeline start preset.
- Recall/clear from timeline controls.
- Useful when you want repeatable opening state.

---

## 3) Audio features: detailed non-technical guide

Think of the audio engine as a set of ears:
- It listens to loudness and frequency regions.
- It turns that into smooth 0-1 control signals.
- Those signals drive visual parameters.

---

### 3.1 Audio input modes

You can use:

1. **Microphone mode**
   - Uses selected input device.

2. **Audio file mode**
   - Load a file and play/seek it.
   - Playback state and file storage behavior improved.

You also get real-time meters for:
- RMS (overall loudness)
- Bass
- Mids
- Highs

---

### 3.2 Core response controls

Main controls include:
- Sensitivity
- Bass sensitivity
- Mids sensitivity
- Highs sensitivity
- Smoothing (attack feel)
- Release (how slowly values fall)

Practical tip:
- If visuals are too jumpy -> increase smoothing/release.
- If visuals are too sleepy -> increase sensitivity or lower smoothing.

---

### 3.3 Audio mapping modes (major enhancement)

Before: mostly direct mapping.
Now: you can choose behavior modes per mapping.

Modes:

1. **Direct**
   - Immediate, literal response.

2. **Accumulate**
   - Audio acts like fuel; value keeps moving.

3. **Leaky**
   - Builds up, then gently decays.

4. **Band Ratio**
   - Uses tonal tilt (e.g., bass vs highs).

5. **Running Avg**
   - Long-window average for slower musical sections.

6. **Onset Drift**
   - Beats trigger slow directional drift.

7. **Hysteresis**
   - Quiet/medium/loud zones with anti-flicker behavior.

These are especially useful for "organic" visual movement instead of frantic twitching.

---

### 3.4 Audio modulation preset systems

There are two preset-style systems now:

1. **Audio Modulation Presets**
   - Rich prebuilt mapping recipes.
   - Some include scene setup assumptions.

2. **Spawn Demo Presets**
   - Quick setup that also configures spawn behavior.

Preset flow (simple):
1. Open Audio tab/section.
2. Pick preset from dropdown.
3. Choose whether to replace mappings.
4. Click Apply.
5. Play audio and watch.

Important in timeline mode:
- Preset settings are saved, but live audio modulation is muted until you exit timeline mode.

---

### 3.5 Audio auto-calibration helper

There is calibration behavior to estimate useful sensitivity values from real audio.
Use it when your setup feels too flat or too hyper.

Typical flow:
1. Enable audio.
2. Play representative sound for a few seconds.
3. Run calibration.
4. Let it finish and review notes.

---

### 3.6 Audio spawn behavior (advanced visual performer tool)

Audio spawn can create temporary/reactive layers from audio events.

You can tune:
- Trigger mode (level vs transient-like behavior)
- Band source
- Threshold
- Cooldown
- Repeat-while-above
- Hysteresis
- Half-life and energy factor
- Max spawned layers
- Optional global palette usage

Use this when you want visuals to "throw sparks" or "burst elements" with music.

---

## 4) Drag handles: complete practical map

You asked specifically about drag handles, so here is every major one.

### 4.1 Randomization range handles (RangeSlider)

Where:
- Many sliders now have min/max range handles for randomization bounds.

How:
- Main thumb = current value.
- Left mini-handle = random minimum.
- Right mini-handle = random maximum.

Visual helpers:
- Highlighted band between min/max.
- Value popup while dragging.
- Tooltips on handles.

Why:
- You can say "randomize this, but only inside this safe creative window."

---

### 4.2 Timeline split dividers

Where:
- Timeline workspace separators.

How:
- Drag the vertical splitter for left/right width ratio.
- Drag the horizontal splitter for top/bottom height ratio.

Why:
- Make room for what you need right now (canvas vs editing).

---

### 4.3 Timeline zoom drag control

Where:
- Timeline transport zoom area.

How:
- Drag zoom value horizontally.

Why:
- Fast zoom control without repeated clicks.

---

### 4.4 Keyframe dragging

Where:
- Curve editor rows.

How:
- Drag points in time/value.
- Numeric endpoints have protective constraints.

Why:
- Fast shaping of animation timing and intensity.

---

### 4.5 Waveform scrub dragging

Where:
- Waveform row.

How:
- Click/drag waveform to move playhead.

Why:
- Align visual events with exact sound moments.

---

### 4.6 Panel resize handle

Where:
- Bottom panel edge.

How:
- Drag to adjust panel size.

Timeline mode note:
- Panel behavior was adjusted so it stays anchored and scrolls properly in split layout.

---

## 5) Other important branch changes (non-timeline too)

These are user-visible and workflow-important:

1. **Global tab refactor**
   - Cleaner layout, grouped controls, settings section behavior, improved spacing.

2. **Audio moved/expanded in UI structure**
   - Better separation of reactive controls and presets.

3. **Persistent randomization include choices**
   - Include toggles are remembered better in local storage and presets.

4. **Palette and color workflow improvements**
   - Better palette handling in generation/spawn paths.

5. **Mode routing and workspace routing cleanup**
   - Free mode, timeline mode, fullscreen mode behavior is cleaner.

6. **Performance-oriented internal cleanup**
   - More ref-based per-frame updates, less React state churn in hot loops.

---

## 6) Recommended beginner workflows

## Workflow A: Build a timeline sequence from scratch

1. Make a base look in Free mode.
2. Press **T** to enter Timeline mode.
3. Add a **Layer Shape** track or **Global Shape** track.
4. Move playhead, capture first keyframe.
5. Move playhead later, generate variation.
6. Press play and watch morph.
7. Use random/fill to add intermediate motion.
8. Tweak curve/keyframe timing by dragging points.

---

## Workflow B: Music-reactive scene without timeline

1. Stay in Free mode.
2. Enable audio input (mic or file).
3. Check meters move.
4. Apply an audio modulation preset.
5. Adjust sensitivity/smoothing/release.
6. Fine tune mappings for your favorite parameters.
7. Optionally enable audio spawn for accent bursts.

---

## Workflow C: Music-synced timeline generation

1. Enter Timeline mode.
2. Load timeline audio.
3. Enable transient markers.
4. Generate random keyframes using transient timing.
5. Set energy influence to control movement strength.
6. Choose per-track energy band to specialize reactions.

---

## 7) Troubleshooting (quick fixes)

### Problem: "I clicked generate, nothing happened"
- If track was just auto-created, this branch now defers generation to avoid race conditions.
- Try once more after a moment; behavior should now be reliable.

### Problem: "Timeline zoom gets weird at huge zoom"
- High zoom behavior was improved with viewport-based waveform rendering.
- If needed, zoom out slightly and re-center playhead.

### Problem: "Audio preset applied but no movement"
- Check if timeline mode is active (live audio modulation is muted there).
- Exit timeline mode to preview live audio mapping.

### Problem: "Randomization goes too wild"
- Use slider range min/max handles to narrow random bounds.
- Lower sensitivity or use slower mapping modes (runningAvg, hysteresis).

---

## 8) Glossary for visual artists

- **Keyframe**: a saved pose/state at a time point.
- **Track**: one lane of animation instructions.
- **Transient**: a sudden audio hit (kick, clap, pluck).
- **Energy influence**: how much audio intensity pushes variation.
- **Mapping mode**: style of how audio controls a parameter over time.
- **Hysteresis**: anti-flicker zone logic.
- **Range handles**: min/max boundaries for randomization.

---

## 9) Final note

This branch is not just a visual polish pass. It meaningfully upgrades:
- composition tools (timeline),
- performance tools (audio mapping modes/presets),
- and tactile controls (drag handles and splitters).

If you want, I can also generate a second document called `new_features_quickstart.md` that is only 1-page and optimized for first-time users.
