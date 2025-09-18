# Art App User Manual

> **Version:** _draft generated automatically_

Welcome to the Art-App!  This manual summarises how to use the main UI, keyboard shortcuts and advanced features.  Screenshots/GIFs are referenced inline – record your own or replace the placeholder files inside `assets/docs/`.

---

## 1. Quick Start

1. Launch the app (`npm run dev` or open the deployed URL).  
2. The **Canvas** fills the window; the **Left Sidebar** contains layer and global controls.  
3. The **Bottom Control Panel** docks bottom-centre by default – hover near the bottom edge to reveal if hidden.

![Main UI](assets/docs/main_ui.png)

---

## 2. Panels & Docking

| Action | Gesture |
|--------|---------|
| Toggle lock / unlock | **L** |
| Hide / Show (peek)   | **H** |
| Drag to top / bottom | Grab the peek bar and drag to edge |
| Resize height        | Drag the horizontal handle |
| Resize width         | Drag the side handles |

![Docking the panel](assets/docs/dock_bottom.gif)

---

## 3. Tabs

| Key | Tab |
|-----|-----|
| 1 | Global |
| 2 | Layer Shape |
| 3 | Layer Animation |
| 4 | Layer Colour |
| 5 | Presets |

Use **1-5** to switch tabs quickly.

---

## 4. Canvas Interaction

- **Node-Edit Mode** – enable in Layer Colour tab → _Node Edit_ toggle or press **N**.  
- Drag white nodes to reshape; mid-points add new nodes.  
- **Undo / Redo** inside node-edit: **Ctrl+Z / Ctrl+Y** (coming soon).

![Node edit](assets/docs/node_edit.gif)

---

## 5. Keyboard Shortcuts

| Key | Description |
|-----|-------------|
| **F** | Toggle fullscreen |
| **G** | Toggle parameter target (Individual / Global) |
| **Space** | Freeze / Unfreeze |
| **Shift+1..9** | Activate layers 1–9 |
| **M** | Toggle MIDI panel |
| **R** | Randomise all parameters |
| **Z** | Toggle Z-Ignore |
| **[ / ]** | Select previous / next layer |
| **K** | Show / hide shortcuts overlay |
| **L** | Show / Hide layer outlines |
| **H** | Hide / Show control panel |
| **Esc** | Close dialogs / overlays |

---

## 6. Saving & Loading

| Icon | Action |
|------|--------|
| 💾 | **Save** current configuration to JSON |
| 📂 | **Load** configuration from JSON |

Saved files contain parameters, optional app-state & MIDI mappings.

---

## 7. Randomisation & Presets

### 7.1 Randomize All  
Click the 🎲 button in the Global tab (or press **R**) to instantly create a fresh composition.  
• Only parameters that have **Include in Randomize All** checked (⚙→checkbox in each control) will change.  
• Frozen scenes remain visually static, but the parameters still change – **unfreeze** to see the effect.  
• Randomise logic honours min / max settings for sliders in the ⚙ sub-menus.

### 7.2 Per-Parameter Randomise  
Each control header has its own 🎲 button.  This only randomises that single slider/drop-down using its individual random-min / random-max settings.

### 7.3 Preset Slots & Morphing  
The Presets tab has two slots — **Slot A** and **Slot B** — and a **Morph** slider.

1. **Save a Slot**  
   • Set up a look you like.  
   • Click **Save to A** or **Save to B** – the slot’s button turns solid.
2. **Morph**  
   • Drag the slider between 0 % (pure A) and 100 % (pure B).  
   • Most numeric parameters tween linearly; colours tween in RGB; layers blend opacity if counts differ.  
   • The morph is *live* – leave the slider mid-way and keep editing; changes are written back to the active endpoint.
3. **Clear**  
   • Click the trash icon on a slot to reset it.

Slots include:  
• All parameters & app-state.  
• Layer list (count, order, nodes, images).  
• Global MIDI mappings.  
• Background colour / image.

> Tip:  Save a minimal scene in Slot A and a busy scene in Slot B, then scrub the slider during a performance.


---

## 8. MIDI Integration

1. Toggle the MIDI panel (**M**).  
2. Select an input device.  
3. Click **Learn** next to a control, move a knob → mapping saved.  
4. **Clear** to remove mapping.

Mappings persist in localStorage and export files.

---

## 9. Importing SVG

- Click **Import SVG** (bottom of Layer tab) and choose files.  
- App auto-scales & positions shapes; adjust with Import Adjust panel.

---

## 10. Advanced Settings

### 10.1 Layer Variation Sliders  
Located near the bottom of the **Global** tab.

| Slider | What it Influences | Typical Range |
|--------|-------------------|---------------|
| **Shape Variation** | Geometry: number-of-sides, curviness, wobble, noise, radius-factor, etc. | 0 – 3 |
| **Animation Variation** | Movement style, speed, scale oscillation, rotation speed | 0 – 3 |
| **Colour Variation** | Palette selection, colour-fade speed, opacity | 0 – 3 |

• The value is a *weight* – 0 adds new layers that are exact copies; 3 adds highly varied layers.  
• Variation is applied when you press **+ Add Layer** or when the **Layers** slider / number box increases the count.

### 10.2 Target Mode  
Global Settings now include a **Target** dropdown.  Set it to **Individual** to have parameter edits affect only the active layer (or the current selection/group).  Switch to **Global** to broadcast parameter changes to every layer.

Examples:  
• Target **Global**, set `numSides` to *5* — every layer snaps to a pentagon.  
• Target **Individual**, change `movementSpeed` — only the selected layer(s) update.

### 10.3 Z-Ignore  
Global toggle (Global > Animation).  When enabled the Z-axis is ignored when computing motion blur & depth scaling, resulting in a flat, poster-like style.

### 10.4 Classic Mode  
Switches the randomiser to the pre-2024 algorithm for retro compatibility.  Classic mode uses the original colour palettes and ignores some newer parameters (e.g. per-layer opacity).  Toggle it if you prefer the “old school” look.

### 10.5 Other Tweaks
• **Global Speed Multiplier** – scales *all* animation speeds (0 = pause).  
• **Colour-Fade While Frozen** – let colours keep looping even when motion is frozen.  
• **Import Adjust Panel** – appears after importing SVGs; drag to reposition or scale the batch before committing.

---

---

### Need more help?

Press **K** anytime for the shortcut reference.

---

© 2025 Art-App
