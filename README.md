# Art App (React + Vite)

Interactive generative art app with layers, palettes, animation, MIDI control, and reproducible randomization.

## Beginner Installation Guide (Step by Step)

### 1. Install Node.js (the tool we need)

1. Open your web browser and go to [https://nodejs.org/](https://nodejs.org/).
2. Click the big green button labeled **LTS**. This version is the stable one we want.
3. When the download finishes, open the installer and keep clicking **Next/Continue** until it finishes.
4. After the installer closes, restart your computer if it asks you to.
5. Open a terminal window (on Windows, open **Command Prompt** or **PowerShell**; on macOS, open the **Terminal** app).
6. Type `node -v` and press **Enter**. If you see something like `v20.11.0`, Node is installed. If you get an error, repeat the steps above.

### 2. Download this project from GitHub

1. Visit [https://github.com/gavspav/art-app](https://github.com/gavspav/art-app) in your browser.
2. Click the big green **Code** button near the top right of the file list.
3. Choose **Download ZIP** and wait for the file to finish downloading.

### 3. Unzip the project folder

1. Find the ZIP file you just downloaded (usually in your **Downloads** folder).
2. Double-click the ZIP file. Your computer will create a new folder named `art-app-main` (or similar) with the project files inside.
3. Move that new folder somewhere easy to find, like your **Desktop**.

### 4. Open the project folder in a terminal

1. Open a terminal window (Command Prompt/PowerShell on Windows, Terminal on macOS).
2. Type `cd ` (the letters c and d, followed by a space).
3. Drag the project folder from your Desktop into the terminal window. The full path to the folder will appear after `cd`.
4. Press **Enter**. You are now “inside” the project folder. You can type `ls` (macOS) or `dir` (Windows) and press **Enter** to see the files.

### 5. Install the project packages (do this once)

1. In the terminal, make sure you are still inside the project folder.
2. Type `npm install` and press **Enter**.
3. Wait while the computer downloads everything it needs. This can take a few minutes the first time.

### 6. Start the app

1. In the same terminal window, type `npm run dev` and press **Enter**.
2. When the command finishes starting, the terminal will show a line like `Local:   http://localhost:5173/`.
3. Leave the terminal open. The app needs it to stay running.

### 7. Open the app in your browser

1. Open your web browser (Chrome, Firefox, Safari, etc.).
2. Type the address from the terminal (`http://localhost:5173/`) into the address bar and press **Enter**.
3. You should now see the art app. Experiment and enjoy!

### 8. Stop the app when you are done

1. Go back to the terminal window where `npm run dev` is running.
2. Press **Ctrl + C** on Windows/Linux or **Control + C** on macOS. This stops the server.
3. When you want to use the app again later, repeat steps 4, 6, and 7 (you do not need to run `npm install` again unless you deleted the folder).

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
- Palettes are spread and color counts sampled according to Include flags and min/max settings. Rotation in Randomize All writes to `layer.rotation` following the current global Target mode.

## Persistence

- Parameters auto-save to `localStorage` under `artapp-parameters`.
- Full configurations (including `appState`) are saved via `saveFullConfiguration()` and can be reloaded, preserving:
  - Layer stack, palettes, toggles (`randomizePalette`, `randomizeNumColors`, Include flags).
  - Global controls (Freeze, Classic Mode, Z-Ignore, speed, blend mode, background, etc.).
  - MIDI mappings and selected input.

## Keyboard Shortcuts

- **Space** – Toggle Freeze (`setIsFrozen`)
- **F** – Toggle fullscreen (`useFullscreen`)
- **R** – Randomize all layers (`handleRandomizeAll()`)
- **G** – Switch parameter target (Global ⇄ Individual)
- **M** – Show or hide the global MIDI learn controls
- **N** – Toggle Node Edit mode
- **Z** – Toggle Z-Ignore (stop Z-axis motion)
- **O** – Show or hide layer outlines
- **S** – Quick-save the current setup to the in-memory slot
- **Shift + A** – Recall the quick preset from memory
- **[** / **]** – Select the previous or next layer
- **Shift + 1…9** – Jump to a specific layer (Layer 1..9)
- **K** – Open/close the keyboard shortcuts overlay
- **Esc** – Close the keyboard shortcuts overlay (when open)
- **1…6** – Switch bottom panel tabs (Global, Shape, Animation, Colour, Presets, Groups)
- **H** – Expand or collapse the bottom control panel (expanded ⇄ peek)
- **L** – Lock or unlock the bottom control panel position
- **Delete / Backspace** – Delete the active layer while in Node Edit mode (if more than one layer remains)

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
