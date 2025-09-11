# Art App (React + Vite)

Interactive generative art app with layers, palettes, animation, MIDI control, and reproducible randomization.

## Quick Start

```bash
npm install
npm run dev
# open the printed http://localhost:5173 URL
```

## Scripts

- `npm run dev` – start dev server
- `npm run build` – production build
- `npm run preview` – preview the production build
- `npm run lint` – run ESLint
- `npm run test` – run Vitest in watch mode (JSDOM)
- `npm run test:run` – run tests once (CI style)
- `npm run test:ui` – open Vitest UI

## Architecture Overview

- `src/App.jsx` orchestrates contexts, hooks, and UI components.
- `src/context/` provides global state (`AppStateContext.jsx`) and parameter config (`ParameterContext.jsx`).
- `src/components/` contains UI split by responsibility (global controls, canvas, controls sidebar, etc.).
- `src/hooks/` contains extracted logic: keyboard shortcuts, randomization suite, MIDI handlers, etc.
- `src/utils/` consolidates color, palette, math, and random helpers.

### Key Components & Hooks

- `components/global/GlobalControls.jsx` – global sliders and toggles (Freeze, Classic Mode, Z-Ignore, MIDI Learn, etc.).
- `components/Canvas.jsx` – canvas drawing, rotation, toroidal wrapping for drift, z-scaling.
- `components/Controls.jsx` – per-layer controls (Shape/Colors/Animation), including rotate with dice/settings.
- `hooks/useRandomization.js` – Randomize All (modern/classic), per-layer, palette gating via Include flags.
- `hooks/useKeyboardShortcuts.js` – Space (Freeze), H (overlay), F (fullscreen), R (randomize all), M (MIDI), N (node edit), [ / ] and 1..9 (layers), Z (Z-Ignore).
- `hooks/useAnimation.js` – animation loop, respects `zIgnore`.

## Seeded Randomness Policy

- The app uses a seeded RNG (`createSeededRandom(seed)`) for deterministic flows (e.g., Randomize All), driven by `globalSeed` from app state.
- User-triggered “quick random” actions may use true entropy (`Math.random`) for exploration (e.g., rotate dice, single-layer quick changes).
- Palettes are spread and color counts sampled according to Include flags and min/max settings. Rotation in Randomize All writes to `layer.rotation` and respects “Vary across layers.”

## Persistence

- Parameters auto-save to `localStorage` under `artapp-parameters`.
- Full configurations (including `appState`) are saved via `saveFullConfiguration()` and can be reloaded, preserving:
  - Layer stack, palettes, toggles (`randomizePalette`, `randomizeNumColors`, Include flags).
  - Global controls (Freeze, Classic Mode, Z-Ignore, speed, blend mode, background, etc.).
  - MIDI mappings and selected input.

## Keyboard Shortcuts

- Space – Toggle Freeze
- H – Toggle controls overlay
- F – Toggle fullscreen
- R – Randomize All
- M – Toggle MIDI Learn visibility (global)
- N – Toggle Node Edit mode
- [ / ] – Previous/Next layer
- 1..9 – Jump to layer
- Z – Toggle Z-Ignore (disable Z scaling movement)

## MIDI

- Web MIDI support with learn/clear per parameter.
- Mappings persist in localStorage and are included in configuration export/import.

## Testing

- Vitest + JSDOM + Testing Library.
- Unit tests live in `src/test/` and `src/utils/__tests__/`.
- Run: `npm run test` or `npm run test:run`.

## Contributing

- Follow the structure: components in `src/components/`, hooks in `src/hooks/`, utilities in `src/utils/`.
- Keep imports at the top of files.
- Prefer pure functions in utils; keep hooks stateless and parameterized.
