# Refactoring Tasks for Art App

This document lists actionable, bite-sized tasks to refactor the project for maintainability, performance, and testability. Each task is designed to be independently reviewable and friendly to codex-cli automation.

## Global Goals

- Reduce `src/App.jsx` from ~2,500 lines to <300 by extracting components and hooks.
- Remove duplicate logic (e.g., HSL-to-HEX conversion, randomization patterns).
- Fix identified bugs and race conditions.
- Improve modularity: components, hooks, and utils with single responsibility.
- Keep behavior and UI identical unless explicitly stated.

## Conventions

- New components go under `src/components/` with descriptive filenames.
- New hooks go under `src/hooks/` with `use*.js` naming.
- New utilities go under `src/utils/` grouped by concern (color, palette, math, random).
- Avoid breaking public context APIs in `src/context/`.
- Keep imports at the top; no inline imports.

---

## Phase 0 — Setup

- [ ] Create a new branch `refactor/architecture-split`.
- [ ] Ensure build and lint pass before starting.
  ```bash
  npm run lint && npm run build
  ```
- [ ] Optional: install Vitest and Testing Library (added in Phase 6).

---

## Phase 1 — Extract UI Components from App.jsx

Goal: Move JSX/UI and local handlers into focused components. Wire through props (no context duplication).

1) Global Controls Panel
- [x] Create `src/components/global/GlobalControls.jsx`.
- [x] Move Global section from `App.jsx` (approx lines 1912–2339) including:
  - Background color + background image mini-controls
  - Freeze, Classic Mode, MIDI Learn toggle
  - Global Speed slider with MIDI learn/clear
  - Palette selector + MIDI learn/clear
  - Style (blend mode) selector + MIDI learn/clear
  - MIDI Input selector
  - Global Opacity slider with MIDI learn/clear
  - Layers Count slider with MIDI learn/clear
  - Layer Variation slider with MIDI learn/clear
- [x] Define clear props for all values and callbacks currently used.
- [x] Replace inline JSX in `App.jsx` with `<GlobalControls ... />`.

2) Import Adjust Panel
- [x] Create `src/components/global/ImportAdjustPanel.jsx`.
- [x] Move the “Adjust Imported Layers” panel (approx lines 2384–2463) and its handlers.
- [x] Accept props: `importAdjust`, `onChange`, `fitEnabled`, `onToggleFit`, `debug`, `onToggleDebug`, `onReset`, `onClose`.
- [x] Replace inline JSX in `App.jsx`.

3) Sidebar Resizer
- [x] Create `src/components/global/SidebarResizer.jsx`.
- [x] Move draggable divider JSX (approx lines 2345–2351) and associated `startResize` handler wiring.
- [x] Replace inline JSX in `App.jsx`.

4) Floating Action Buttons (FABs)
- [x] Create `src/components/global/FloatingActionButtons.jsx`.
- [x] Move buttons (Download, Randomize Scene, Fullscreen) (approx lines 2468–2477).
- [x] Accept props: `onDownload`, `onRandomize`, `onToggleFullscreen`, `isFullscreen`.
- [x] Replace inline JSX in `App.jsx`.

Acceptance for Phase 1
- [x] `npm run build` succeeds.
- [x] UI looks and behaves the same.
- [x] No regressions in MIDI learn/clear wiring.

---

## Phase 2 — Extract Custom Hooks from App.jsx

Goal: Move clustered effects and related helpers to hooks. Keep hooks stateless and reusable.

1) Keyboard Shortcuts
- [x] Create `src/hooks/useKeyboardShortcuts.js`.
- [x] Move effect handling Space/H/F/R/M/[ ] and 1–9 (approx lines 781–860).
- [ ] Hook signature example:
  ```js
  useKeyboardShortcuts({
    setIsFrozen,
    toggleFullscreen,
    handleRandomizeAll,
    setShowGlobalMidi,
    setIsOverlayVisible,
    setIsNodeEditMode,
    setSelectedLayerIndex,
    hotkeyRef,
  });
  ```

2) MIDI Handlers (Globals & Per-Layer)
- [x] Create `src/hooks/useMIDIHandlers.js`.
- [x] Move all `registerParamHandler` effects (global speed, variation, blend mode, opacity, layersCount, palette index; per-layer pos/color handlers).
- [x] Accept dependencies via arguments (setters, layers, etc.).

3) Import Adjust Logic
- [x] Create `src/hooks/useImportAdjust.js`.
- [x] Move state and functions: `showImportAdjust`, `importAdjust`, `importFitEnabled`, `importDebug`, `importBaseRef`, `importRawRef`, `applyImportAdjust()`, `recomputeImportLayout()`.
- [x] Expose a stable API for panel component.

4) Layer Management & Editing
- [x] Create `src/hooks/useLayerManagement.js`.
- [x] Move: `addNewLayer()`, `deleteLayer()`, `selectLayer()`, `updateCurrentLayer()` (including velocity recompute + animation suppression cleanup), and node-init logic that ensures nodes exist in node edit mode.

5) Randomization Suite
- [x] Create `src/hooks/useRandomization.js`.
- [x] Move: `modernRandomizeAll()`, `classicRandomizeAll()`, `randomizeScene()`, `randomizeLayer()`, `randomizeAnimationOnly()`.
- [x] Keep existing gating (Parameter metadata `isRandomizable`, `randomMin/randomMax`, opacity handling, scaleMin/scaleMax preserved).

Acceptance for Phase 2
- [ ] Hooks are unit-testable (Phase 6 adds tests for utils; hooks can be smoke-tested).
- [ ] `App.jsx` imports and wires hooks cleanly; fewer effects inside `App.jsx`.

---

## Phase 3 — Consolidate Utilities

Goal: Remove duplication and centralize helpers.

1) Color Utilities
- [ ] Create `src/utils/colorUtils.js`.
- [ ] Add a single `hslToHex(h, s, l)` and `hexToRgb(hex)` implementation.
- [ ] Replace all duplicated conversions in `App.jsx` and `Canvas.jsx`.

2) Palette Utilities
- [ ] Create `src/utils/paletteUtils.js` with:
  - [ ] `sampleColorsEven(base, count)`
  - [ ] `distributeColorsAcrossLayers(colors, layerCount)`
  - [ ] `assignOneColorPerLayer(layers, colors)` (pure, returns next layers)
- [ ] Replace inline versions in `App.jsx`.

3) Math Utilities
- [ ] Create `src/utils/mathUtils.js` with:
  - [ ] `clamp(v, min, max)`
  - [ ] `mixRandom(base, min, max, w, { integer })`

4) Random Utilities
- [ ] Create `src/utils/randomUtils.js`.
- [ ] Provide wrappers around `createSeededRandom(seed)` and helpers like `pick(array, rnd)` using seeded RNG.
- [ ] Replace `Math.random()` in randomization paths for reproducibility (see Bug Fixes).

Acceptance for Phase 3
- [ ] No duplicate HSL/HEX conversions remain.
- [ ] Random selection uses seeded RNG where reproducibility is required.

---

## Phase 4 — Bug Fixes & Logical Corrections

1) Timer Cleanup to Avoid Leaks
- [ ] In `App.jsx`, add effect cleanup for `suppressTimerRef` (animation suppression timeout).
- [ ] In `pages/Settings.jsx`, store timeout ID when showing messages and clear in cleanup.

2) Consistent Seeded Randomness
- [ ] Replace `Math.random()` in randomization flows with a seeded RNG (`createSeededRandom`) when determinism is desired.
- [ ] Document where true entropy is acceptable (e.g., Quick Random for user-initiated non-deterministic actions).

3) Effect Dependencies
- [ ] Revisit `// eslint-disable-next-line react-hooks/exhaustive-deps` occurrences in `App.jsx`.
- [ ] Either add missing dependencies or wrap values in refs to avoid stale closures.

4) Index Clamping
- [ ] Standardize `clampedSelectedIndex` usage everywhere indexes into `layers`.
- [ ] Add guards for empty layers arrays in all layer access points.

5) Canvas Dimension Guards
- [ ] Ensure `Canvas.jsx` gracefully handles zero-sized canvas (skip draw or delay until hydrated).

6) Redundant/Fragile Logic
- [ ] Simplify palette candidate picking (remove repeated ternary).
- [ ] Validate palette structure before use (array vs. object with `colors`).

Acceptance for Phase 4
- [ ] No outstanding ESLint warnings from effects.
- [ ] No memory leaks when navigating away or unmounting.

---

## Phase 5 — Performance Polishing

- [ ] Replace large object dependencies in effects with stable hashes or primitive dependencies where possible.
- [ ] Memoize derived values in heavy components (e.g., `Controls.jsx`) with `useMemo`.
- [ ] Ensure `Canvas.jsx` avoids unnecessary re-renders (prop equality where feasible).

Acceptance for Phase 5
- [ ] Perceived UI responsiveness remains equal or better.
- [ ] No FPS regressions.

---

## Phase 6 — Testing & Tooling (Optional but Recommended)

1) Add Vitest + React Testing Library
- [ ] Install and configure:
  ```bash
  npm i -D vitest @testing-library/react @testing-library/user-event @testing-library/jest-dom
  ```
- [ ] Add `vitest` config and scripts (e.g., `npm run test`).

2) Unit Tests for Utilities
- [ ] Tests for `colorUtils` (HSL/HEX, hexToRgb).
- [ ] Tests for `paletteUtils` (even sampling, distribution).
- [ ] Tests for `mathUtils` and `randomUtils`.

Acceptance for Phase 6
- [ ] `npm run test` passes.

---

## Phase 7 — Documentation

- [ ] Update `README.md` with new architecture, directories, and contributing notes.
- [ ] Document the seeded randomness policy and how to reproduce scenes.

---

## Acceptance Criteria (Overall)

- [ ] `src/App.jsx` reduced to <300 lines and primarily composes components/hooks.
- [ ] UI/UX unchanged (visual parity) and features intact.
- [ ] All builds and lints pass: `npm run lint && npm run build`.
- [ ] No memory leaks (verified by cleanup and manual testing).
- [ ] Randomization reproducibility consistent where intended.

---

## File Map (for reference)

- `src/App.jsx` → becomes orchestrator wiring contexts, hooks, and components.
- `src/components/global/GlobalControls.jsx` → global control panel UI and callbacks.
- `src/components/global/ImportAdjustPanel.jsx` → multi-file SVG import adjust UI.
- `src/components/global/SidebarResizer.jsx` → draggable divider.
- `src/components/global/FloatingActionButtons.jsx` → download/randomize/fullscreen FABs.
- `src/hooks/useKeyboardShortcuts.js` → keyboard events.
- `src/hooks/useMIDIHandlers.js` → MIDI registration and dispatch.
- `src/hooks/useImportAdjust.js` → import adjust state + layout recompute.
- `src/hooks/useLayerManagement.js` → add/delete/select/update layer, node init.
- `src/hooks/useRandomization.js` → modern/classic/randomize-layer/scene.
- `src/utils/colorUtils.js` → hslToHex/hexToRgb.
- `src/utils/paletteUtils.js` → sampling/distribution helpers.
- `src/utils/mathUtils.js` → clamp/mixRandom.
- `src/utils/randomUtils.js` → seeded random wrappers.

---

## Nice-to-Have Enhancements (post-refactor)

- [ ] TypeScript migration for stronger contracts (contexts, layer models, MIDI mappings).
- [ ] PropTypes (if staying in JS) for extracted components.
- [ ] CI workflow (GitHub Actions) running lint, build, and tests on PRs.
