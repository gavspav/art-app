# Phase 4 Control Architecture Checklist

## Behavior Contract (No-Regression)
- Global controls keep existing MIDI learn/clear behavior and parameter IDs.
- Layer controls keep existing target-mode behavior (`individual` vs target set).
- Randomize controls keep existing toggles and min/max semantics.
- Rotation and palette controls keep their per-layer MIDI/Audio/BPM mappings.
- Color fade controls keep existing behavior and modulation IDs.

## Extraction Map
- Global controls extracted automation sections:
  - `RangeMappingEditor`
  - `AudioReactiveSection`
  - `AudioSpawnSection`
  - `BPMSection`
  - `AudioControlRow`
  - `BPMControlRow`
- Layer controls extracted tab sections:
  - `LayerShapeSection`
  - `LayerAnimationSection`
  - `LayerColorSection`
- Shared primitives/hooks:
  - `ControlSectionCard`
  - `useLayerTargeting`

## Validation Pass
- `npm run lint`
- `npm run build`
- `npm test`
- Manual smoke checks:
  - Layer tab switching
  - Randomize (layer + colors + animation)
  - Target mode edits
  - MIDI learn/clear in rotation and palette controls
  - Audio/BPM mapping rows render and respond
