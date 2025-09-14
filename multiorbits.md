# Multi-Orbits Implementation Plan

This document outlines a scalable design to support up to 8 shared orbit rotation points, and an easy way to bind individual layers or groups of layers to any of those points.

## Goals

- Provide up to 8 global orbit points (anchors) on the canvas.
- Allow each layer to either use a custom center or bind to one of the 8 points.
- Make editing orbit points simple and visual: drag handles in an edit mode.
- Keep changes backward-compatible with current orbit behavior.

## Data Model

- Global app state (persisted via `AppStateContext`):
  - `orbitPoints: Array<OrbitPoint>` with length up to 8
    - `OrbitPoint = { id: number, x: number, y: number, label: string, color: string, enabled: boolean }`
    - `id` is 1..8, `x/y` are normalized in [0,1], `label` (e.g. `P1`), `color` (e.g. `#ff3333`), `enabled` toggles visibility/use

- Per-layer (in `DEFAULT_LAYER`):
  - `orbitPointIndex: number` (default `-1`)
    - `-1` => Custom center, use `orbitCenterX`/`orbitCenterY`
    - `0..7` => Bind to `orbitPoints[orbitPointIndex]`
  - Keep existing `orbitCenterX`, `orbitCenterY`, `orbitRadiusX`, `orbitRadiusY`, `orbitAngle`, etc.

## Movement Logic (`src/hooks/useAnimation.js`)

- When `movementStyle === 'orbit'`:
  - Determine center:
    - If `layer.orbitPointIndex >= 0` and the corresponding global point exists and is `enabled`, use that point's `x,y` as the center.
    - Else, fallback to `layer.orbitCenterX/Y` (current behavior).
  - Use existing angular speed mapping from `movementSpeed` and radii logic from `orbitRadiusX/Y`.
  - Read orbit points via a lightweight global bridge to avoid prop-drilling:
    - App publishes orbit points into `window.__artapp_orbitPoints` on state changes.
    - `useAnimation` checks `window.__artapp_orbitPoints` to resolve a bound point.

## Canvas UI (`src/components/Canvas.jsx`)

- Add an "Orbit Edit" mode (toggle next to Node Edit):
  - Draw all `enabled` orbit points (1..8) as white dots with colored border, labeled `1..8`.
  - Points are draggable; dragging updates the global `orbitPoints[index].x/y` (normalized).
  - Layers bound to those points visually follow instantly because movement uses the global list.
  - Keep Node Edit mode focused on shape nodes. Orbit Edit is separate to reduce clutter.

### Handle Drawing/Hit-Testing

- Drawing:
  - For each `enabled` point: draw a dot (radius ~6px), label text near it, border in `orbitPoint.color`.
- Hit-testing:
  - On mousedown in Orbit Edit mode, check proximity to each point; if within ~10px, start drag.
  - On mousemove, update `orbitPoints[index].x/y` via context/setter and publish to `window.__artapp_orbitPoints`.

## Controls UI (`src/components/Controls.jsx`)

- In the Animation tab for each layer:
  - Movement style already supports `orbit`.
  - Add an "Orbit center" dropdown:
    - `Custom` (the current behavior using `orbitCenterX/Y`)
    - `Point 1`, `Point 2`, ..., `Point 8`
  - If `Custom` is selected:
    - Show `Radius X`, `Radius Y` sliders and the per-layer vary toggles (these already exist).
    - Allow dragging the per-layer orbit center through the existing handle in Node Edit mode.

- Optional: Display a read-only indicator of which point the layer is bound to and a quick link to toggle Orbit Edit mode.

## Global Controls (`src/components/global/GlobalControls.jsx`)

- Add an "Orbit Assign" section:
  - Dropdown "Assign selected layer(s) to: Custom | Point 1..8" with an Apply button.
  - Per-point controls (small list or accordion):
    - Enable/Disable point
    - Label
    - Color picker
    - (Optional) Quick center buttons: center of canvas, corners, etc.

## Persistence

- Include `orbitPoints` in app state save/load using the existing `AppStateContext`-assisted configuration system.
- Ensure legacy loads (configs without `orbitPoints`) default to a small set or an empty array.

## Backward Compatibility

- Layers with `orbitPointIndex = -1` behave exactly like today.
- Existing projects without `orbitPoints` continue to work; the Orbit Edit mode shows nothing until points are added/enabled.

## MIDI (Optional)

- Global mappings for each point X/Y (e.g., `orbitPoint1X`, `orbitPoint1Y`, ...), registered in `useMIDIHandlers`.
- When a mapping changes a point position, layers bound to that point reflect the move.

## Phased Implementation

1. **Phase 1: Data + Movement**
   - Add `orbitPointIndex` to `DEFAULT_LAYER` and `DEFAULTS`.
   - Add `orbitPoints` to app state (e.g., 2 enabled points by default at (0.33,0.5) and (0.66,0.5)).
   - Publish `orbitPoints` to `window.__artapp_orbitPoints` from App on state change.
   - Update `useAnimation` to use a point center when bound; fallback to custom.

2. **Phase 2: Controls**
   - Add the "Orbit center" dropdown to the Animation tab per layer.
   - (Optional) Add the bulk assign UI to `GlobalControls.jsx`.

3. **Phase 3: Canvas**
   - Add the Orbit Edit mode toggle.
   - Draw labeled orbit points and implement drag-to-move.

4. **Phase 4: MIDI (Optional)**
   - Register global MIDI handlers for each point X/Y.

## Testing Checklist

- Custom vs Point binding
  - Verify a layer with `Custom` uses `orbitCenterX/Y` regardless of orbit points.
  - Bind a layer to `Point 1`; moving Point 1 should move the orbit center for that layer.
- Multiple layers bound to one point move together.
- Vary toggles for `orbitRadiusX/Y` still work and broadcast when OFF.
- Orbit Edit mode handles are visible, draggable, and labeled.
- Save/Load preserves `orbitPoints` and each layer's `orbitPointIndex`.

## Future Enhancements

- Per-point animation (e.g., slowly orbit orbit-points themselves for meta-motion).
- Group presets: save/recall sets of layer-to-point bindings.
- Snap orbit point to centroid of selected layers.
- Export/import orbit layouts.
