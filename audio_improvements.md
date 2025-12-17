# Audio Spawn Improvements Plan (No Implementation Yet)

This document captures an agreed plan to improve the **Audio Spawn (Live)** feature so it behaves more like a musical audio visualizer.

Scope is intentionally limited to **Audio Spawn only** for now (no general audio mapping expansion).

## Goals

- Replace/augment simple threshold/transient triggering with a more robust **onset detector**.
- Add **two envelopes** (fast + slow) to make modulation stable and controllable.
- Compute **spectral centroid** (brightness) for optional visual mapping.
- Support **band-split onset triggers** (bass/mids/highs) so different sound events drive different visual behaviors.
- Add **beat sync** support such that, when BPM is playing, onsets are accumulated and spawn **at most once per beat**.
- Keep feature extraction cost reasonable by targeting ~**30fps** feature refresh.

## Current Architecture (Relevant Pieces)

- `src/hooks/useAudio.js`
  - Creates a `WebAudio` graph for either:
    - mic input (`getUserMedia` + `MediaStreamAudioSourceNode`)
    - file playback (`Audio` element + `MediaElementAudioSourceNode`)
  - Uses an `AnalyserNode` and writes smoothed band values into `featuresRef.current`.
  - Exposes a stable `getFeatures()` getter (read via ref, avoids React re-renders).

- `src/context/AudioContext.jsx`
  - Wraps `useAudio` and provides `audio.getFeatures()` to consumers.
  - Also provides generic audio parameter mapping. **Out of scope** for now.

- `src/hooks/useAudioSpawnLayers.js`
  - Runs a RAF loop.
  - Reads `audio.getFeatures()` and spawns ephemeral overlay layers based on:
    - `triggerMode: 'level'` (threshold + hysteresis)
    - `triggerMode: 'transient'` (simple energy delta / history-based)
  - Has cooldown, half-life fade, max layers, and optional energy-driven variance.

- `src/context/BPMContext.jsx`
  - Provides beat clock via `getClockState()` without per-frame React renders.
  - Can be used by Audio Spawn to quantize spawn events.

## Proposed Feature Set

### 1) Add spectral-flux-derived onset detection (with gate + refractory)

Approach:

- Compute **spectral flux** from frame-to-frame FFT magnitude changes.
- Apply a **gate** to decide when flux represents an onset.
- Apply a **refractory period** (default ~120ms) to prevent double-triggers on the same hit.

Notes:

- This should work on both mic and file input because both flow through the same `AnalyserNode`.
- This is intended to be more musical and robust than simple threshold crossings.

### 2) Two envelopes (fast + slow)

- **Fast envelope**: effectively the current “responsive” values.
- **Slow envelope**: a smoothed, slower-moving intensity signal.

Usage:

- Slow envelope controls density/variance amount (stable behavior).
- Fast/onset controls actual spawn events (snappy behavior).

### 3) Spectral centroid (brightness)

- Compute `centroid` as a normalized 0–1 “brightness” value.
- Not required for spawning, but can later be used to influence:
  - palette choice / hue shift
  - shape sharpness / cornerness
  - stroke thickness

### 4) Band-split triggers (bass/mids/highs)

When in onset mode, derive which band “won” the onset (largest band flux) and bias variance categories:

- Bass onset:
  - bias variance toward `scale` and `position`
- Mids onset:
  - bias variance toward `shape`
- Highs onset:
  - bias variance toward `color`

This should apply automatically when `triggerMode === 'onset'`.

### 5) Beat sync (manual BPM) — accumulate and spawn once per beat

Behavior:

- If BPM playback is **running**, onsets occurring during the beat set a `pendingOnset` flag.
- On **beat boundary** (beat change), spawn at most **one** layer (if pending), then clear pending.
- If BPM is **not** playing, spawn immediately on onset (still respecting cooldown).

Decision (confirmed):

- Accumulate and spawn **at most once per beat**.
- Beat sync can activate automatically when BPM is playing (no extra UI toggle required initially).

## Concrete Code Changes (Planned)

### A) `src/hooks/useAudio.js` — extend features

Add additional values to `featuresRef.current` (keeping existing keys intact):

- Existing (must remain):
  - `rms`, `bass`, `mids`, `highs`

- New (planned):
  - `centroid` (0–1)
  - `flux` (0–1 overall)
  - `fluxBass`, `fluxMids`, `fluxHighs` (0–1)
  - slow envelopes:
    - `rmsSlow`, `bassSlow`, `midsSlow`, `highsSlow`

Performance:

- Throttle feature updates for the heavier computations (flux/centroid/slow envelope updates) to ~**30fps** (≈ 33ms).
- Keep existing RAF structure and ref-based storage.

Implementation outline:

- Maintain `prevSpectrumRef` (previous FFT magnitudes).
- Flux per bin = `max(0, cur[i] - prev[i])`.
- Sum flux within bands to produce `fluxBass/fluxMids/fluxHighs`.
- Normalize band flux via a rolling max / clamp.
- Centroid computed via weighted average of bin index (or frequency estimate) weighted by magnitude, normalized.

### B) `src/hooks/useAudioSpawnLayers.js` — add `triggerMode: 'onset'`

- Accept new mode: `triggerMode: 'onset'`.
- In onset mode:
  - Determine onset from `flux*` values + gate.
  - Enforce refractory window (default ~120ms).
  - Use band-split logic to bias which variation categories get amplified.
  - Use slow envelope(s) to scale variance in a stable way.

Beat sync integration:

- Read BPM clock when available.
- If BPM playing:
  - accumulate onset within beat
  - spawn once at beat boundary

Band selector behavior (planned):

- If band selector is `rms` (Level): auto-pick the strongest onset band.
- If band selector is `bass/mids/highs`: only consider that band for onset.

### C) `src/context/AppStateContext.jsx` — allow new trigger mode

- Expand allowed `audioSpawnTriggerMode` values to include `'onset'`.

### D) `src/components/global/GlobalControls.jsx` — expose new mode

- Add an option to Audio Spawn Mode dropdown:
  - `Onsets`

No additional “sync” UI is required initially.

## Defaults / Tunables (Initial)

- Refractory period: ~**120ms**.
- Feature refresh: **~30fps**.
- Existing `cooldownMs` still applies to spawning.
- Existing `audioSpawnThreshold` used as onset sensitivity (gate threshold).

## Non-Goals (For Now)

- Do not expand generic `AudioContext` mapping UI to include new features/bands yet.
- Do not add external feature extraction libraries yet (Meyda/Essentia/etc).
- Do not alter timeline mode or timeline modulation.

## Next Step

Once confirmed, implement the changes in the files listed above, keeping edits surgical and preserving existing behavior for `triggerMode: 'level'` and `triggerMode: 'transient'`.
