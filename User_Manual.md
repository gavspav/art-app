# User Manual: Generative Art Webapp

No stored memories were needed for this answer.

## 1. Quick Keyboard Shortcuts
- **1–6**
Switch the bottom panel tabs: Global, Layer Shape, Layer Animation, Layer Colour, Presets, Groups (`src/components/BottomPanel.jsx`).
- **H**
Toggle the bottom panel between expanded and peek states (`src/components/BottomPanel.jsx`).
- **L**
Lock or unlock the panel so it stays expanded (`src/components/BottomPanel.jsx`).
- **Node editing gestures**
When node edit mode is active (toggle found in `src/components/Controls.jsx`), drag nodes directly on the canvas (`src/components/Canvas.jsx`) to reshape the current layer.

## 2. Overview
The app renders layered generative artwork in real time. You manage global scene settings, per-layer styling, and automation via the control panels built in `src/components/BottomPanel.jsx`, `src/components/global/GlobalControls.jsx`, and `src/components/Controls.jsx`.

## 3. Layout & Navigation
- **Main canvas**
Central area that displays the composed artwork. Drag nodes here when node editing is active.
- **Floating action buttons** (if enabled)
Quick access to download, randomize, fullscreen, etc.
- **Bottom control panel** (`src/components/BottomPanel.jsx`)
Docked UI with multiple tabs:
  - Global
  - Layer Shape / Animation / Colour
  - Presets
  - Groups

### Panel States
- **Expanded**: full interaction.
- **Peek**: slim bar; hover/click to reopen.
- **Hidden**: appears when you move the cursor to the dock edge.

### Panel Controls
- **Lock (🔒/🔓)**: keep panel expanded.
- **Minimize (⬇️)**: collapse to peek state.
- **Resize handles**: drag top edge for height, sides for width.
- **Dock drag**: drag peek bar to adjust top/bottom and left/center/right alignment.

## 4. Global Tab (`src/components/global/GlobalControls.jsx`)
- **Seed slider/input**
Controls deterministic randomness (1–2,147,483,646).
- **Randomise everything (🎲)**
Runs `handleRandomizeAll` respecting each parameter’s `isRandomizable`.
- **Background**
Colour picker (`src/components/BackgroundColorPicker.jsx`) plus optional image overlay (enable, choose file, opacity, fit).
- **Freeze animation**
Toggle animation pause and optional “fade while frozen”.
- **Classic mode & Z Ignore**
Adjust layout mode and depth handling.
- **Global speed multiplier**
Adjusts overall animation tempo; gear icon reveals min/max/step controls.
- **Blend mode selector**
Chooses Canvas composite mode from `blendModes`.
- **Parameter target mode**
Switch between `individual` and `global` to determine how layer controls apply.
- **Randomisation inclusion**
Each slider’s ⚙ settings let you edit min/max/step and toggle inclusion in Randomize All.
- **Quick Save / Load**
Capture and restore entire configurations (`onQuickSave`, `onQuickLoad`).
- **Palette helpers**
Sample evenly across palettes or assign single colours per layer.
- **Layer count & Variation sliders**
Set exact layer count and adjust variation sliders (position/shape/animation/colour) with per-slider range settings.
- **Preset Morph**
Automate transitions through saved presets: enable, define route, duration, easing, loop mode, morph style (tween/fade).

## 5. Layer Tabs (`src/components/Controls.jsx`)
### 5.1 Common Header
- **Active Target dropdown**
Swap between individual layers, current selection, or groups.
- **Layer actions**
Add (+), move up/down (↑/↓), remove (−), import SVG, toggle node edit mode (✎/⛔), randomize selected layer (🎲). MIDI learn buttons appear when global MIDI is visible.

### 5.2 Shape Tab
- **Shape parameters**
Shape-related sliders/dropdowns defined in `src/config/parameters.js` (`group: 'Shape'`).
- **Rotation control**
Slider with randomise and settings gear (custom min/max, include in Randomize All).
- **MIDI Rotation Status**
Shows learn/clear mapping per layer.

### 5.3 Animation Tab
- **Movement parameters**
Controls sourced from `group: 'Movement'`.
- **Randomize Animation (🎲)**
Calls `randomizeAnimationOnly`.
- **Orbit controls**
Radius X/Y sliders when `movementStyle` is `orbit`.
- **MIDI Position section**
Stub component; manual MIDI position UI may reside elsewhere.

### 5.4 Colour Tab
- **MIDI Colour Control**
Enable per-layer RGBA mapping with learn/clear buttons.
- **Number of colours**
Numeric input adjusts palette length for targeted layers.
- **Colour Preset selector**
Choose from `palettes` or keep custom selection.
- **Randomise colours (🎲)**
Uses `onRandomizeLayerColors`.
- **Colour settings gear**
Toggles for randomising palette and colour count, plus min/max counts.
- **Animate colours**
Toggle palette fading; adjust fade speed.
- **Colour picker** (`src/components/ColorPicker.jsx`)
Edit swatches; changes respect target scope.

## 6. Node Editing
- Activate via header ✎ button.
- Drag nodes on the canvas (`src/components/Canvas.jsx`) to reshape polygons.
- Keep `syncNodesToNumSides` enabled before editing for regular shapes; disable afterward for organic forms.

## 7. Presets Tab
- Manage saved parameter/app-state slots.
- Recall, overwrite (shift-click), and sequence presets via morphing.
- MIDI mapping (`global:presetRecall`) available.

## 8. Groups Tab
- Organise layers into named groups; `src/components/global/GroupsControls.jsx` handles creation and membership.
- Select groups in the Active Target dropdown for bulk updates.

## 9. Randomisation System
- **Randomize All**
Respects `isRandomizable` flags; toggle within each control’s settings.
- **Layer-level randomisation**
Uses `randomizeCurrentLayer` with options for palette/colour gating.
- **Random ranges**
Adjust `randomMin`/`randomMax` per parameter to constrain variation.

## 10. MIDI Integration (`src/context/MidiContext.jsx`)
- **Learn**
Click “Learn”, move hardware control, then “Clear” to remove mapping.
- **Per-control status**
Displayed within settings panels.
- **Layer palette & rotation**
Use per-layer IDs (`layer:{name}:paletteIndex`, `layer:{name}:rotation`).
- **Randomize layer**
Can be triggered via MIDI when mapped.

## 11. Typical Workflow
1. Choose background and global palette.
2. Add layers; adjust shape/animation/colour per layer.
3. Configure randomisation ranges and toggles.
4. Save states via Quick Save or preset slots; enable Preset Morph for live transitions.
5. Map favourite controls to MIDI for performance.

## 12. Troubleshooting
- **Controls affecting wrong layers**
Verify parameter target mode and Active Target selection.
- **Randomise All too chaotic**
Untick “Include in Randomize All” or tighten random ranges.
- **MIDI inactive**
Ensure global MIDI UI is toggled on, the correct input is selected, and learn mode displays “Listening…”.
- **Palette size issues**
Check colour count min/max and randomise toggles.

## 13. Advanced Tips
- Use groups for thematic layer bundles.
- Combine Preset Morph (tween mode) with `applyVariationInstantly` to create evolving sequences.
- Preserve `syncNodesToNumSides` until you’re ready for bespoke node tweaks, then disable to lock in custom shapes.
