# Art App User Manual

## 1. What This App Does

Art App is a real-time generative art tool built around layered shapes, color systems, animation controls, automation (MIDI, audio, BPM), presets, and timeline keyframing.

You can use it in two main ways:

- Free performance mode (live tweaking and randomization)
- Timeline mode (keyframes, waveform, transport, and sequence building)

## 2. Interface Overview

The app has four main UI areas:

- Canvas: the rendered artwork
- Floating action buttons: quick actions (target mode, export image, randomize, fullscreen, recording)
- Bottom control panel: tabbed controls (Global, Layer sections, Audio, Presets, Groups)
- Timeline panel (optional): transport + tracks + keyframes

The bottom panel can be:

- Docked top or bottom
- Aligned left/center/right
- Resized in height and width
- Collapsed to peek mode
- Locked/unlocked

Panel state is remembered in local storage.

## 3. Workspace Modes

### Free Mode

- Full-screen canvas with floating actions
- Bottom panel for editing
- Optional import-adjust overlay after SVG import

### Timeline Mode

- Split layout with:
- Left/top area: controls panel
- Right/top area: canvas
- Bottom area: timeline panel
- Audio/BPM live automation is forced off while timeline mode is active

### Fullscreen Mode

- Minimal UI
- Exit via `F` or fullscreen button

## 4. Bottom Panel Tabs

Hotkeys `1` to `8` switch tabs:

1. Global
2. Layer Shape
3. Layer Animation
4. Layer Colour
5. Audio
6. Sound
7. Presets
8. Groups

### 4.1 Global Tab

Global tab controls scene-wide behavior:

- Background color and optional background image (source, opacity, fit, enable)
- Freeze and color fade while frozen
- Classic mode
- Z-ignore
- Global seed
- Global speed multiplier
- Global palette and custom palettes
- Blend/style mode
- Global opacity
- Layer count
- Variation sliders for position, shape, animation, colour, and scale
- Randomize All button and include toggles per global parameter
- MIDI input selector
- Automation mapping status (audio/BPM badges)
- Optional autosave recovery modal

Variation/layer controls also include options like:

- Match all layer colours to layer 1
- Apply variation instantly
- Randomize colors per layer vs uniform count
- Use global palette during generation/spawn workflows

### 4.2 Layer Shape Tab

- All shape-related parameters from the parameter configuration
- Dedicated rotation control with randomize, range settings, include-in-randomize, and MIDI/Audio/BPM mapping controls

### 4.3 Layer Animation Tab

- Movement parameters
- Animation-only randomize button
- Orbit radius X/Y controls when movement style is `orbit`

### 4.4 Layer Colour Tab

- Per-layer color editing via color picker
- Number of colours control
- Palette preset selection (built-in + custom)
- Save current colors as custom palette
- Colour randomization controls (randomize palette toggle, randomize color-count toggle, min/max count bounds)
- Animate colours toggle + fade speed
- Per-parameter MIDI/Audio/BPM mapping options for color-related controls

### 4.5 Audio Tab

Global audio systems:

- Enable/disable audio input
- Input device selection (mic mode)
- File playback mode (load file, play/pause, seek, close file)
- Live band meters: level/bass/mids/highs
- Audio response settings (sensitivity, smoothing/attack, release/falloff)

Also includes:

- Audio Spawn controls (live ephemeral layer generation)
- BPM section (tempo play/pause/reset/tap)

### 4.6 Sound Tab

The Sound tab configures the generated ambient soundscape. It is separate from the Audio tab, which uses microphone or file input to change visuals.

- Start or mute the soundscape
- Assign one of the curated sound programs to the current palette; assignments use the palette colours rather than its position in the list
- View live normalized visual-source and resolved audio-destination meters
- Add, edit, disable, or remove continuous visual-to-audio routes, including input/output ranges, curve, inversion, depth, and smoothing
- Set master, ambient drone, moving layer-pad levels, voice limit, and default smoothing
- Configure optional wall-bounce accents
- Audition bounce accents from the editor
- Save, recall, export, and import reusable sound patches

Sound settings are included in exported configurations and quick presets.
Older version-1 soundscape settings are converted to the route-based format when loaded.

When launched with `?arcade=1`, the app loads the default cabinet sound configuration and attempts to start it automatically. Browser autoplay rules may require one initial interaction unless the kiosk browser is launched with autoplay enabled.

Example macOS Chrome launch command:

```bash
open -a "Google Chrome" --args --kiosk --autoplay-policy=no-user-gesture-required "http://localhost:5173/?arcade=1"
```

### 4.7 Cabinet Runtime

Arcade launch mode is intended for the installed cabinet:

- Controls and editor panels remain hidden
- MIDI, cabinet keyboard emulation, and generated sound remain active
- Timeline, BPM automation, input-reactive Audio, Audio Spawn, and preset morphing are forced inactive
- Sound configuration is edited in the normal app and then loaded by the cabinet configuration
- If there is no keyboard or MIDI activity for 10 seconds, the app fades to a looping screensaver video. Keyboard or MIDI activity immediately restores the artwork.
- The default screensaver file is `/screensaver.mp4`; place `screensaver.mp4` in `public/`, or override the URL with `?screensaver=/path/to/video.mp4`. The idle delay can be overridden for testing with `?screensaverIdleMs=1000`; use `?screensaverEnabled=1&screensaverDebug=1` to test it outside arcade mode.

### 4.8 Presets Tab

- 16 preset slots (`P1` to `P16`)
- Click a slot to recall
- Shift-click (or Cmd+Shift click behavior) to save current state to that slot
- Per-slot MIDI learn/clear for hardware triggering
- Morph engine controls (enable, route, duration per leg, easing, loop mode, morph mode)

### 4.9 Groups Tab

- Create groups from current selection or create empty group
- Color + name for each group
- Add/remove members using index syntax (example: `1,3,5-7`)
- Select group members
- Delete group
- Set target mode (Individual vs Global)

## 5. Layer Targeting and Selection

Layer edits can target:

- Single active layer
- Current selection
- Group
- All layers (global mode)

In the layer header, use the Active Layer dropdown to switch targets.
Shift-click selection workflows and group targeting are integrated into this flow.

## 6. Randomization System

Randomization exists at multiple levels:

- Scene-wide randomize (`R` or global randomize action)
- Per-layer randomize
- Animation-only randomize
- Color-only randomize
- Rotation randomize

Controls expose per-parameter random ranges and include flags.
Global include flags are persisted and reloaded with app state (`includeRnd`).

## 7. SVG Import Workflow

SVG import is layer-based:

- Import one or multiple SVG files
- Parsed layers are appended to existing layers
- For single-file import, current layer animation/style settings can be copied to imported layer
- Multi-file imports can open Import Adjust panel with translate (`dx`, `dy`), scale (`s`), auto-fit, debug, reset, and close

Imported layers can enter node edit mode immediately for manual refinement.

## 8. Export, Save, and Load

### 8.1 Image Export (PNG)

Download action exports current canvas at selected target size:

- `VIEW`
- `A4`
- `A3`
- `A2`

Export freezes briefly and hides ephemeral overlays for clean output.

### 8.2 Video Recording

Recording is available from floating controls and timeline header:

- Starts MediaRecorder capture from canvas stream
- Tries to include timeline audio stream when available
- Prompts for filename on stop
- Exports `mp4` or `webm` depending on browser support

### 8.3 JSON Save/Load

Quick save exports a JSON scene package containing:

- Parameters
- Optional app state
- Custom palettes
- MIDI mappings
- Audio config
- BPM config
- Timeline config
- Export metadata

Quick load imports JSON and can optionally load app state.

### 8.4 RAM Preset (Temporary)

- `S` saves a temporary in-memory snapshot
- `Shift+A` recalls it

This is separate from the 16 preset slots.

### 8.5 Autosave Recovery

Autosave stores rotating slots in local storage and can restore:

- Parameters
- App state
- Audio config
- BPM config

Recovery UI is opened from the lifebuoy icon in the toolbar.

## 9. Timeline Mode Manual

## 9.1 Transport

- Play/pause
- Stop
- Position/time readout
- Timeline length
- Loop enable + loop start/end
- Zoom (buttons + dragable zoom value)
- Load/remove audio file

## 9.2 Waveform and Audio Analysis

When timeline audio is loaded:

- Waveform row displays peaks
- Toggle transient markers
- Adjust transient sensitivity
- Energy influence control for variation generation workflows

## 9.3 Tracks

Tracks can target global or layer parameters.
Each track supports:

- Name, color, enable/disable
- Target selection (global/layer)
- Parameter selection
- Output range (for numeric tracks)
- Delete track

Special track types:

- Shape track
- Global Shape track

Shape/global shape tracks support capture and variation generation actions.

## 9.4 Keyframe Editing

In curve editor:

- Double-click to add keyframe
- Drag keyframes to move
- Double-click interior keyframe to delete (where valid)
- Right-click keyframe/background for curve menu and operations
- Color tracks use color keyframes
- Shape tracks use snapshot keyframes

Keyframe operations include copy/paste and variation reroll where supported.

## 9.5 Timeline Generation Tools

Available actions (hotkeys and UI-assisted flows):

- Capture selected layer shape keyframe (`C` in timeline context)
- Capture global scene keyframe (`Shift+C`)
- Generate one variation keyframe (`Shift+V`)
- Generate N random keyframes (`Shift+R`)
- Fill keyframes between two bounds (`Shift+F`)

These flows can use:

- Variation slider weights
- Breathing/node modulation options
- Audio transient timing
- Energy scaling
- Optional global palette constraints

## 9.6 Timeline Start Preset

`TL` button in timeline header:

- Click: recall start preset at `t=0`
- Shift+click: save current scene as timeline start preset
- Alt+click: clear start preset

## 10. Automation Systems

## 10.1 MIDI

- Per-parameter learn/clear
- Global and layer parameters supported
- Preset recall MIDI mappings supported
- Mappings persist in local storage and are included in JSON exports

## 10.2 Audio Reactive Mapping

Per-parameter audio mapping supports:

- Band source (`rms`, `bass`, `mids`, `highs`)
- Output range mapping
- Multiple mapping modes (direct and advanced modes)
- Mode-specific settings

## 10.3 BPM Mapping

Per-parameter BPM mapping supports:

- Enable/disable
- Beat speed
- Loop mode (`forward`, `reverse`, `pingpong`, `oneshot`)
- Output range
- Envelope curve

## 11. Keyboard Shortcuts

Global shortcuts:

- `F`: fullscreen
- `Space`: freeze/unfreeze, or timeline play/pause when timeline is visible
- `R`: randomize all
- `G`: toggle parameter target mode (individual/global)
- `I`: toggle isolate mode
- `O`: toggle layer outlines
- `N`: toggle node edit mode
- `Z`: toggle z-ignore
- `A`: toggle audio reactive input
- `B`: toggle BPM play/pause
- `T`: toggle timeline visibility/mode
- `P`: timeline play/pause
- `Home`: stop timeline to start
- `[`, `]`: previous/next layer
- `Shift+1` to `Shift+9`: select layer 1..9
- `Delete` / `Backspace`: delete selected layer (node edit mode, if more than one layer exists)
- `H`: panel show/hide
- `L`: panel lock/unlock
- `K`: open/close shortcuts overlay
- `Esc`: close overlays/dialogs
- `S`: save RAM preset
- `Shift+A`: recall RAM preset
- `1` to `7`: switch bottom panel tabs

Timeline generation shortcuts:

- `C`: capture selected-layer shape keyframe
- `Shift+C`: capture global shape keyframe
- `Shift+V`: generate variation keyframe
- `Shift+R`: generate random keyframes
- `Shift+F`: fill keyframes between keyframes

## 12. Persistence Summary

Persisted in local storage:

- App state
- Panel layout and docking
- Randomize include flags
- Preset slots
- MIDI mappings
- Audio settings + mappings
- BPM settings + mappings
- Autosave slots and metadata
- Custom palettes

## 13. Practical Workflow

1. Build a scene in Free mode (Global + Layer tabs).
2. Configure randomness bounds and include flags.
3. Map key controls to MIDI/audio/BPM if performing live.
4. Save working states to preset slots and/or JSON exports.
5. Switch to Timeline mode for sequencing and keyframes.
6. Export final stills (PNG) or recordings (video).
