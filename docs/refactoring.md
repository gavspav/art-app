# Refactoring Roadmap

## Phase 1 – Baseline & Monitoring
- **Instrumentation** Capture render timings for `MainApp()` and high-cost callbacks using dev-only probes.
- **Regression Tests** Add snapshot/state regression coverage to lock current behavior.
- **Performance Gauges** Add lightweight FPS and paint-time meters to detect rendering regressions.

## Phase 2 – Component Decomposition
- **Component Split** Extract focused components (e.g., `RecordingControls`, `ImportHandlers`, `RandomizationControls`, `ShortcutOverlay`) from `src/App.jsx`.
- **Targeted Props** Ensure each new component consumes only required context data via props to shrink coupling and file size.
- **Collocated Layout** Keep DOM structure and styling near the decomposed components for cohesion.

## Phase 2.5 – Canvas Decomposition
- **Pure Geometry Engine** Introduce functions such as `buildLayerPath(layer, seed, t)` and `buildFrame(appState, t, rng)` that emit serializable draw instructions.
- **Pure Animation Step** Implement `nextLayerState(layer, dt, rng)` without side effects for deterministic animation updates.
- **Canvas Adapter** Keep `Canvas` responsible only for painting instructions and managing caches (images, gradients) without embedded randomness.
- **Deterministic Testing** Provide seeded RNG and time injection for geometry tests and frame snapshots.

## Phase 3 – Hook Modularization
- **Focused Hooks** Create memoized hooks (`useRecording`, `useImportHandlers`, `useRandomizationControls`, `useKeyboardOverlay`) that encapsulate feature logic.
- **Stable APIs** Ensure hooks expose stable memoized outputs to limit re-render churn across decomposed components.

## Phase 3.5 – Core Reducer & Command Model
- **Single Reducer** Consolidate domain mutations into a pure reducer (e.g., `appReducer`) powering `AppStateContext`.
- **Dispatch-First APIs** Expose `state` and `dispatch` from contexts; migrate imperative setters to reducer actions before wider refactors.

## Phase 4 – Utilities & Adapter Services
- **Service Modules** Move side-effectful logic into adapters (`midiAdapter`, `keyboardAdapter`, `storageService`, `recorderService`) located under `src/services/`.
- **Pure Utilities** Keep stateless helpers (JSON export, SVG transforms) in `src/utils/` for easy reuse and testing.
- **Serialization Versioning** Centralize JSON import/export with explicit versioning, migrations, and tests.

## Phase 5 – Context Refinement
- **Selector Hooks** Add utilities like `useAppStateSelector(fn)` that return memoized slices of context state.
- **Slim Contexts** Ensure contexts only expose state + dispatch while feature components rely on adapters for side effects.

## Phase 6 – File Size & Feature Hygiene
- **Size Targets** Maintain component files under ~200 lines and hooks under ~150 lines, further splitting when needed.
- **Feature Folders** Group related modules under dedicated folders (e.g., `src/features/canvas/`, `src/features/recording/`).
- **Layering Guards** Consider ESLint import-boundary rules to enforce core → adapters → UI dependencies.

## Phase 7 – Verification & Performance Safeguards
- **Deterministic Tests** Extend regression coverage with seeded geometry/frame snapshot tests using fixed timestamps.
- **Build & Lint** Confirm `npm run lint` and `npm run build` succeed after each major phase.
- **Manual Scenarios** Validate MIDI, recording, fullscreen, import, and export flows; monitor FPS and paint-time metrics.

## Phase 8 – Documentation & Follow-Up
- **Architecture Doc** Capture the layered design (core geometry, reducer, adapters, UI) in `docs/architecture.md`.
- **Future Iterations** Record optional enhancements (TypeScript/JSDoc in core, plugin contracts, testing gaps) for follow-up.

## Acceptance Criteria Summary
- **Phase 2.5 Canvas** `Canvas.jsx` contains only painting glue; geometry and animation live in pure modules with deterministic snapshot tests.
- **Phase 3.5 Reducer** All domain changes flow through a single reducer; contexts expose `state` and `dispatch`; UI avoids direct mutations.
- **Phase 4 Adapters** MIDI, keyboard, storage, and recorder logic reside in service modules; serialization is versioned with migrations.
- **Phase 5 Contexts** Selector hooks replace broad context consumption; re-render counts match or beat baseline instrumentation.
- **Phase 7 Verification** Deterministic tests, lint/build scripts, and manual regression scenarios pass with acceptable FPS metrics.

## Key Risks & Mitigations
- **Determinism Drift** Pass seeded RNG instances explicitly; forbid `Math.random` inside geometry functions.
- **Event Ordering** Define a consistent tick cycle so keyboard, MIDI, and animation updates reconcile through the reducer.
- **Snapshot Flakiness** Assert on serialized frame data (paths, colors, blend modes) with normalized floats instead of raw pixel buffers.
- **Performance Regressions** Reuse buffers in frame builders, leverage selector hooks, and watch FPS/paint-time gauges after each phase.
