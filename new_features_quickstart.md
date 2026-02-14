# `Codex_5_3_refactor` Quick Start (1-Page)

This is the fast version of the feature guide.
If you only read one page, read this.

---

## 1) What’s new (super short)

- **Timeline is much stronger**: better track tools, better keyframe workflows, better zoom/waveform behavior.
- **Audio is much stronger**: mic/file input, smarter mapping modes, one-click presets, better stability.
- **More drag controls**: timeline split handles, range min/max handles, draggable zoom, better keyframe dragging.

---

## 2) First 5-minute timeline workflow

1. Press **T** to enter Timeline mode.
2. Add **+ Layer Shape** (one layer) or **+ Global Shape** (all layers).
3. Move playhead to time A.
4. Click **Capture** (or Generate variation).
5. Move playhead to time B.
6. Capture/Generate again.
7. Press **Play**.

You now have a morphing sequence.

### Fast editing tips
- Drag keyframes to retime.
- Use zoom drag in transport for precision.
- Use random/fill tools to add in-between motion.

---

## 3) Global Shape track (why it matters)

Use this when you want to animate **all layers together** like scene-to-scene morphing.

- **Capture** = store current full scene
- **Generate** = make a new varied full scene
- **Reroll** = regenerate a variation
- **Shape / Anim / Color toggles** = choose what actually blends

---

## 4) Audio quick start (Free mode)

> Important: In Timeline mode, live Audio/BPM automation is muted.

1. Leave timeline mode (if active).
2. Enable audio input (mic or file).
3. Confirm meters move (RMS/Bass/Mids/Highs).
4. Apply an Audio preset.
5. Tune:
   - **Sensitivity** up/down
   - **Smoothing** up for less jitter
   - **Release** up for slower decay

---

## 5) Audio mapping modes (pick one quickly)

- **Direct**: instant response
- **Running Avg**: smooth section-level motion
- **Leaky**: build up + fade down
- **Hysteresis**: stable quiet/med/loud zones
- **Onset Drift**: beat-triggered drifting movement

If visuals are too twitchy, start with **Running Avg** or **Hysteresis**.

---

## 6) Drag handles cheat sheet

- **RangeSlider min/max handles**: control randomization bounds safely.
- **Timeline vertical splitter**: control panel width vs canvas width.
- **Timeline horizontal splitter**: top workspace height vs timeline height.
- **Zoom drag value**: scrub zoom quickly.
- **Waveform drag**: scrub playhead directly on audio.

---

## 7) Recommended defaults for smooth results

- Sensitivity: `~1.2`
- Smoothing: `~0.75`
- Release: `~0.88`
- Energy influence: medium first, then increase
- Keep random min/max range narrow until happy

---

## 8) If something seems broken

- **Generate did nothing**: try once more (auto-create track timing issues were fixed in this branch).
- **No audio reaction**: check you’re not in Timeline mode.
- **Too chaotic**: narrow random bounds and switch mapping mode to Running Avg.
- **Zoom weird at huge values**: zoom out a bit and re-center playhead.

---

## 9) Suggested next step

After this quick start, use the full guide:
- `new_features.md`
