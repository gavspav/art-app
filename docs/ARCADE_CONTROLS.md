# Arcade Controls Quickstart

This guide explains how to run the app and how the arcade keyboard/MIDI control modes work.

## Run The Project

Install dependencies once:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Open the local URL printed in the terminal, usually:

```text
http://localhost:5173/
```

Leave the terminal open while using the app. Stop the server with `Ctrl+C`.

Useful commands:

```bash
npm run build      # production build
npm run preview    # preview the production build
npm run lint       # lint the code
npm run test:run   # run tests once
```

## Arcade Settings

The arcade controls are in the bottom toolbar beside the MIDI input controls.

- `Arcade sticks`: translates arcade joystick MIDI note on/off messages into held controller-style movement.
- `Cab keys`: lets a normal computer keyboard emulate the arcade cabinet controls for development.
- `Button pairs`: changes the arcade buttons from one-shot randomise triggers into paired increase/decrease controls.

The current arcade default preset loads with parameter target mode set to `Global`, so layer parameters controlled by MIDI affect all layers by default. You can still toggle target mode with `G` or the floating target-mode button.

## Main App Shortcuts

These are the normal app shortcuts when `Cab keys` is off, or when you press keys that are not reserved by the cabinet emulator.

| Key | Action |
|---|---|
| `Space` | Freeze/unfreeze |
| `F` | Fullscreen |
| `R` | Randomise all |
| `G` | Toggle target mode: Global / Individual |
| `M` | Show/hide global MIDI learn controls |
| `N` | Node edit mode |
| `Z` | Toggle Z-ignore |
| `O` | Show/hide layer outlines |
| `S` | Quick-save to memory |
| `Shift+A` | Recall quick preset |
| `[` / `]` | Previous/next layer |
| `Shift+1` to `Shift+9` | Select layer 1 to 9 |
| `K` | Keyboard shortcuts overlay |
| `Esc` | Close overlay or cancel current edit |
| `1` to `7` | Switch bottom panel tabs |
| `H` | Expand/collapse bottom panel |
| `L` | Lock/unlock bottom panel |

When `Cab keys` is enabled, cabinet keys are captured before the normal app shortcuts. For example, `R`, `M`, `O`, `S`, and `Z` are used by the cabinet emulator instead of their normal app actions.

## Cabinet Keyboard Emulator

Enable `Cab keys` to use these computer keys as if they were arcade MIDI controls.

### Joysticks

| Control | Keyboard | Arcade MIDI notes | Default action |
|---|---|---|---|
| Joystick 1 up/down | `W` / `Z` | note 38 / 39 | Increase/decrease `radiusFactor` |
| Joystick 1 left/right | `A` / `S` | note 37 / 36 | Decrease/increase `globalSpeedMultiplier` |
| Joystick 2 left/right | `H` / `J` | note 46 / 44 | Decrease/increase `layersCount` |
| Joystick 2 up/down, `Button pairs` off | `U` / `N` | note 45 / 56 | Increase/decrease `curviness` |
| Joystick 2 up/down, `Button pairs` on | `U` / `N` | note 45 / 56 | Increase/decrease `wobble` and `noiseAmount` together |

Joystick controls behave like held controllers: hold the key or joystick direction to keep moving the value. MIDI-controlled values respect the parameter's current min/max bounds.

## Button Mode: Button Pairs Off

With `Cab keys` on and `Button pairs` off, the button keys behave like the current arcade preset's note mappings.

| Keyboard | Arcade MIDI note | Action |
|---|---:|---|
| `E` | ch1 note 30 | Randomise `backgroundColor` |
| `R` | ch1 note 32 | Randomise `globalPaletteIndex` |
| `T` | ch1 note 4 | Randomise `globalBlendMode` |
| `C` | ch1 note 5 | Randomise `globalOpacity` |
| `V` | ch1 note 51 | Randomise `numSides` |
| `I` | ch1 note 40 | Randomise `wobble` |
| `O` | ch1 note 14 | Randomise `movementStyle` |
| `P` | ch1 note 13 | Randomise `variationPosition` |
| `M` | ch1 note 6 | Randomise `variationColor` |
| `,` | ch1 note 12 | Randomise `variationAnim` |

## Button Mode: Button Pairs On

With `Button pairs` on, the matching arcade MIDI notes are intercepted and used as paired controls instead of firing the old randomise mappings.

| Keyboard pair | Arcade MIDI notes | Action |
|---|---:|---|
| `E` / `C` | note 30 / 5 | Cycle forward/back through 16 background colours, wrapping around |
| `R` / `V` | note 32 / 51 | Cycle forward/back through palettes, wrapping around |
| `I` / `M` | note 40 / 6 | Increase/decrease `numSides` |
| `O` / `,` | note 14 / 12 | Increase/decrease global opacity |
| `T` | note 4 | Toggle blend mode between `source-over` and `difference` |
| `P` | note 13 | Toggle `curviness` between `0` and `1` |

## MIDI Learn Notes

- `Cab keys` can be used with MIDI Learn when no arcade cabinet is connected.
- Joystick directions learn as their virtual CC axes, so learned mappings work with both the keyboard emulator and the real cabinet.
- `Button pairs` mode is a fixed arcade behaviour layer. It is intended for this arcade setup rather than general MIDI Learn remapping.
