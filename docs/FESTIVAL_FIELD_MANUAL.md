# Arcade Cabinet Festival Field Manual

**Offline setup, recovery, configuration and codebase guide**  
Project: `old_art_app` | Edition: 19 June 2026

> **Purpose:** Use this guide when the cabinet must run unattended and Internet access or developer help is unavailable. Start with the emergency card. Enter the codebase sections only when a normal restart does not solve the problem.

## The three facts to remember

| Question | Answer |
|---|---|
| Where is the app on the cabinet Mac? | `/Users/macmini_m2/Documents/old_art_app` |
| How does it start? | macOS LaunchAgent -> kiosk supervisor -> Vite preview -> dedicated Chrome kiosk |
| Where are diagnostics? | `~/Library/Logs/ArtAppKiosk/` |

# Emergency Card

> **Important:** Screen Sharing audio is not proof of cabinet output. Check the physical headphone amplifier, cable and macOS output locally.

## Fast recovery

1. Press a cabinet control. This wakes the screensaver and can satisfy browser audio-start requirements.
2. Wait 15 seconds. The watchdog may already be restarting Chrome or the server.
3. Open Terminal and run:

```bash
cd /Users/macmini_m2/Documents/old_art_app
npm run kiosk:status
```

4. If unhealthy, restart the installed service:

```bash
launchctl kickstart -k gui/$(id -u)/com.gavxflx.artapp-kiosk
```

5. If it still fails, rebuild and restart:

```bash
cd /Users/macmini_m2/Documents/old_art_app
npm install
npm run build
launchctl kickstart -k gui/$(id -u)/com.gavxflx.artapp-kiosk
```

## Safe shutdown

- Best: Apple menu -> Shut Down. Wait until the Mac is off before removing power.
- Emergency: hold the power button only when macOS is completely unresponsive.
- Clean shutdown reduces the chance of browser recovery warnings and file damage.

# System Mental Model

The cabinet is a small local web system. It does not require the public website or Internet after its dependencies and production build exist.

| Layer | Responsibility | Failure symptom |
|---|---|---|
| macOS LaunchAgent | Starts the supervisor at login and restarts it if it exits. | Nothing launches after login. |
| Node kiosk supervisor | Starts server/Chrome, checks health, records logs, and recovers crashes or hangs. | Repeated restarts or diagnostic reports. |
| Vite preview server | Serves `dist/` at `127.0.0.1:4173`. | Chrome says the site cannot be reached. |
| Chrome kiosk profile | Fullscreen browser, persisted MIDI permission, autoplay flags. | Browser chrome/prompts or no MIDI permission. |
| React application | Canvas, parameters, MIDI, soundscape and screensaver. | Page loads but a feature is wrong. |
| Teensy/controller | Sends MIDI notes/CC from cabinet controls. | Keyboard works but cabinet does not. |

## Arcade runtime profile

The arcade URL is `http://127.0.0.1:4173/?arcade=1`.

- Loads the default cabinet visual, MIDI and soundscape configuration.
- Forces Global Target mode.
- Keeps MIDI, cabinet keyboard emulation, button-pair counters and generated sound active.
- Forces timeline, BPM automation, microphone/file-reactive audio, audio spawn and preset morphing inactive.
- Hides editor panels. Normal mode retains all editor features.

# Festival Packing and Offline Checklist

## Hardware

- Mac mini and power lead.
- Display and known-good HDMI lead/adaptor.
- Teensy/controller USB lead plus spare.
- Headphone amplifier, power supply and audio cable.
- Headphones for diagnosis.
- Compact keyboard and mouse kept behind the cabinet.
- Power strip or surge protection.
- USB drive containing the repository, this manual, Node installer and a known-good project copy.

## Before leaving reliable Internet

1. Turn off Wi-Fi and prove the cabinet still boots, draws, responds to MIDI and makes sound.
2. Run `npm install` and `npm run build` once while online.
3. Run `npm run kiosk:preflight` with the real screen, Teensy and audio attached.
4. Run `npm run kiosk:drill` and at least a 30-minute soak. Overnight is preferable.
5. Restart the Mac twice from cold and confirm automatic login and kiosk fullscreen.
6. Confirm macOS Sound output after every reconnect. Set alert volume low and enable Focus/Do Not Disturb.
7. Disable automatic OS updates during the event. Do not update Node, Chrome or dependencies at the venue.
8. Back up `dist/`, `src/config/defaultArcadePreset.json`, `package-lock.json`, this manual and recent logs.

> **Do not depend on `npm install` at the festival.** Existing `node_modules` and `dist` make offline operation possible. Preserve a complete working project copy.

# Boot, Kiosk and Watchdog

## Normal power-on

1. Connect display, Teensy, amplifier and audio before power-on.
2. Power on. Automatic login should enter the cabinet account.
3. The LaunchAgent starts the supervisor. Chrome should become kiosk-fullscreen after the server is ready.
4. Move a control and verify visual response, then listen locally for sound.
5. Leave it alone for 60 seconds. The screensaver should fade in and audio should mute. Any MIDI/key input should wake it.

## One-time installation

```bash
cd /Users/macmini_m2/Documents/old_art_app
npm install
npm run build
npm run kiosk:preflight
npm run kiosk:drill
npm run kiosk:install
```

The installer creates `~/Library/LaunchAgents/com.gavxflx.artapp-kiosk.plist`. Remove old Desktop scripts from Login Items so two servers or Chrome windows are not started.

## Kiosk commands

| Command | Meaning |
|---|---|
| `npm run kiosk:status` | Inspect installed service and recent health. |
| `npm run kiosk:start` | Run production kiosk interactively in Terminal. Stop with Control-C. |
| `npm run kiosk:preflight` | Short human-assisted readiness check. |
| `npm run kiosk:preflight -- --headless` | Defer physical Teensy/audio checks while cabinet is disconnected. |
| `npm run kiosk:drill` | Deliberately tests process failure and recovery. Let it finish itself. |
| `npm run kiosk:soak -- --minutes 30` | Simulate two users and inactivity for 30 minutes. |
| `npm run kiosk:soak` | Eight-hour endurance test. |
| `npm run kiosk:install` | Install/refresh the automatic-login LaunchAgent after preflight. |
| `npm run kiosk:uninstall` | Remove LaunchAgent only; logs/profile remain. |

Preflight waits at `Can you hear the generated sound ... [y/N]`. This is not a hang. Type `y` and Return if audible, or `n` and Return. If disconnected from the cabinet, use `--headless`, then repeat a real preflight after reconnecting.

# Cabinet Controls and MIDI

In arcade mode, Cab keys, Button pairs and Global Target are enabled by default. Keyboard emulation and physical MIDI use the same parameter paths. Sound attempts to start automatically in kiosk Chrome.

## QWERTY test layout

```text
PLAYER 1                                 PLAYER 2
     W  up                                     U  up
 A left   S right                         H left   J right
     Z  down                                   N  down

 E/C  background colour +/-              I/M  sides +/-
 R/V  palette +/-                        O/,  opacity +/-
 T    blend / sound mode                 P    curviness toggle
```

## Joysticks

| Input notes, MIDI channel 1 | Action | Virtual/default target |
|---|---|---|
| 37 left / 36 right | Player 1 horizontal -/+ | CC channel 1 #36 -> Global Speed |
| 38 up / 39 down | Player 1 vertical -/+ | CC channel 1 #37 -> Size |
| 46 left / 44 right | Player 2 horizontal -/+ | CC channel 1 #34 -> Layer Count |
| 45 up / 56 down | Player 2 vertical -/+ | Wobble and Noise paired action |

## Fixed physical buttons

| MIDI notes, channel 1 | Keyboard | Effect |
|---|---|---|
| 30 / 4 | E / C | Background colour next/previous; wraps through 16 colours. |
| 32 / 5 | R / V | Palette next/previous; wraps. |
| 6 | T | Toggle source-over/difference and harmonic/textural sound. |
| 51 / 14 | I / M | Sides increase/decrease within current bounds. |
| 40 / 13 | O / comma | Opacity increase/decrease within current bounds. |
| 12 | P | Curviness toggle 0/1. |
| CC channel 2 #17 | none | Randomize button. |

Counters initialize from the actual parameter values and respect each parameter's current lower/upper bounds. MIDI Learn may change ordinary CC mappings, but these fixed note-pair behaviours are implemented in `MidiContext.jsx`.

# Soundscape and Screensaver

## Visual-to-sound relationships

| Visual control | Sound relationship |
|---|---|
| Palette | Synth program, scale/key and harmonic character. |
| Background colour | Root drone and background texture; generally in key in harmonic mode. |
| Global speed | Pulse tempo and modulation rate. |
| Layer count | First 8 add clear musical voices; above 8 increases density, motion and chaos. |
| Size | Overall pitch register and reverb relationship. |
| Opacity | Output level. |
| Noise | Distortion and noise texture. |
| Blend | Source-over is harmonic/gentler; difference is textural with stronger pumping. |
| Curviness | Filter and timbre state. |
| Wobble | Pitch and filter modulation depth. |
| Sides | Harmony/dissonance and pattern complexity. |

- Maximum clear sustained voices: 8. Additional visual layers increase density rather than making 20 equal oscillators.
- Generated sound is speaker output only; it is not mixed into video recordings.
- If sound is absent, press a control, verify macOS output, then check amplifier and cable.
- Screensaver starts after 60 seconds without keyboard/MIDI, loops `public/screensaver.mp4` and mutes sound.
- Any key/MIDI input restores artwork and sound.
- Add `&screensaverDebug=1` for a 10-second test or `&screensaverIdleMs=1000` for an explicit interval.

# Configuration File Guide

The cabinet default is `src/config/defaultArcadePreset.json`. It is a JSON snapshot, not executable code. JSON requires double-quoted keys/strings, no comments and no trailing commas.

> **Safest method:** Open normal editor mode without `?arcade=1`, adjust controls, export the configuration, validate it, then replace the default preset and rebuild. Keep a known-good copy.

## Top-level sections

| Key | What it controls | Arcade behaviour |
|---|---|---|
| `parameters` | Scene/global/layer parameter values, bounds and randomization flags. | Applied. |
| `appState` | Layers, targeting, selection, groups, panel and application state. | Visual state applies; Global Target is forced. |
| `customPalettes` | User-created named colour palettes. | Available to palette selection. |
| `midiMappings` | Parameter-to-MIDI assignments and value ranges. | Applied alongside fixed cabinet notes. |
| `audioConfig` | Microphone/file-reactive visual mappings. | Inactive and not applied in arcade mode. |
| `bpmConfig` | Tempo automation mappings. | Inactive and not applied in arcade mode. |
| `timelineConfig` | Timeline tracks, transport and keyframes. | Inactive and not applied in arcade mode. |
| `soundscapeConfig` | Tone.js engine, programs, levels and continuous routes. | Applied; auto-start attempted. |
| `savedAt`, `version`, `exportMeta` | Metadata and compatibility information. | Do not use as live controls. |

## What the config can achieve

- Choose the startup artwork: layer count, colours, palette, positions, movement, speed, size, opacity, blend, wobble, noise, sides and curviness.
- Set min/max bounds and randomization ranges. Joystick/button counters use these live bounds.
- Change ordinary MIDI CC/note assignments and scaling through `midiMappings`.
- Configure sound master/voice limits, program assignments, bounce accents and visual-to-audio routes.
- Add custom palettes and choose the active palette.
- Preserve normal-editor audio, BPM and timeline settings for non-arcade use. Arcade intentionally refuses to run them.

## What the config cannot safely change

- Fixed cabinet note pairs and their stepping/toggle behaviour: edit `src/context/MidiContext.jsx`.
- Keyboard layout: edit the keyboard maps in `MidiContext.jsx`.
- Arcade forced feature disabling and Global Target: edit runtime-profile/context logic.
- Screensaver implementation/defaults: edit screensaver/runtime code; query overrides are safer for temporary testing.
- Watchdog ports, Chrome flags and recovery thresholds: edit `scripts/kiosk/`, not the preset.

## Safe config workflow

1. Duplicate `defaultArcadePreset.json` with a date in its filename.
2. Make one small change.
3. Validate syntax.
4. Build and check normal mode first if the editor is needed.
5. Check arcade mode with `npm run kiosk:start`.
6. Test every physical control, sound and screensaver.
7. Restart the installed LaunchAgent only after verification.

```bash
cd /Users/macmini_m2/Documents/old_art_app
node -e "JSON.parse(require('fs').readFileSync('src/config/defaultArcadePreset.json','utf8')); console.log('JSON OK')"
npm run build
```

## Parameter records

Most parameters have a current value plus some combination of minimum, maximum, randomization range, include-in-randomization and mapping metadata. Exact shapes differ by parameter. Do not invent fields: export a configuration from the editor and copy its established structure.

- **Current value:** what loads at startup.
- **Lower/upper bounds:** legal range for direct controls and paired counters.
- **Random minimum/maximum:** range used by Randomize.
- **Include flags:** whether randomization may alter the parameter.
- **Global versus layer values:** global controls affect all layers; layer records carry per-layer state.

## MIDI mappings

Ordinary `midiMappings` connect a target parameter to a MIDI type, channel and CC/note number, often with input/output ranges. Use MIDI Learn in the editor where possible. Physical joystick notes and fixed button pairs are intercepted by application code and translated before ordinary parameter updates.

Potential mistakes:

- MIDI channels may be displayed as 1-16 but represented internally as 0-15 in some APIs. Copy existing mappings.
- A note and a CC with the same number are different messages.
- Note-off/release should stop a continuous joystick action; repeated note-on handling must not create multiple timers.
- Duplicate mappings can make two controls fight over one parameter.

# Soundscape Route Configuration

`soundscapeConfig` is versioned and contains engine settings plus routes. A route maps one normalized visual source continuously to an audio destination. Presets without it remain compatible.

| Route field | Meaning |
|---|---|
| `id`, `enabled` | Stable identifier and on/off state. |
| `source` | Visual source: speed, size, opacity, layers, noise, wobble, sides, curviness, blend, etc. |
| `destination` | Audio target: level, filter, reverb, pulse, modulation, spread, detune, noise or distortion. |
| `inputMin`, `inputMax` | Visual range read by the route. |
| `outputMin`, `outputMax` | Audio range produced by the route. |
| `curve` | Response shape between minimum and maximum. |
| `invert` | Reverses the relationship. |
| `depth` | Strength of the route. |
| `smoothing` | Ramp time/amount to prevent clicks and excessive writes. |

> **Audio safety:** Change one route at a time and test at low amplifier volume. Digital clipping happens inside the app before the headphone amplifier; turning down the amplifier does not repair it.

# Codebase Map

| Path | Role and when to inspect it |
|---|---|
| `src/main.jsx` | React entry point and provider mounting. |
| `src/App.jsx` | Top-level application composition and runtime UI. |
| `src/components/Canvas.jsx` | Artwork rendering surface and animation integration. |
| `src/context/ParameterContext.jsx` | Parameter state, import/export and bounds. |
| `src/context/AppStateContext.jsx` | Layers, targeting and application state. |
| `src/context/MidiContext.jsx` | MIDI selection/mappings, joystick notes, fixed buttons and cabinet keys. |
| `src/context/SoundscapeContext.jsx` | Tone.js lifecycle, voices, mappings and audio updates. |
| `src/context/AudioContext.jsx` | Input-reactive microphone/file system; separate from generated sound. |
| `src/config/defaultArcadePreset.json` | Default cabinet snapshot. |
| `src/config/parameters.js` | Parameter definitions, labels, defaults and bounds. |
| `src/config/soundscapeParams.js` | Sound defaults, routes/program definitions and migration. |
| `src/utils/useSceneSnapshots.js` | Configuration capture/restore compatibility. |
| `src/components/ArcadeScreensaver.jsx` | Idle video fade, wake handling and diagnostics. |
| `scripts/kiosk/kiosk-cli.mjs` | Preflight, drill, soak, install and status commands. |
| `scripts/kiosk/kiosk-core.mjs` | Supervisor, health checks, logging and process recovery. |
| `public/screensaver.mp4` | Idle video copied into `dist` by build. |
| `dist/` | Generated production files actually served by the kiosk. |

## How a control change flows

1. A keyboard or Teensy MIDI event enters `MidiContext`.
2. Fixed notes become a button action or virtual CC value.
3. The mapped parameter updates through context state and clamps to current bounds.
4. Canvas reads live layer/parameter state and redraws.
5. Soundscape reads a limited scene summary and ramps Tone.js nodes.
6. The input resets the screensaver timer and wakes the artwork if necessary.

# Safe Editing and Deployment

## Before editing

```bash
cd /Users/macmini_m2/Documents/old_art_app
git status
git branch --show-current
git log -1 --oneline
```

- Do not use `git reset --hard` when unsure; it can destroy uncommitted work.
- Change one subsystem at a time.
- Never edit `dist/` directly. It is overwritten by the next build.
- Do not upgrade dependencies, Node, Chrome or macOS during an event.
- If Git is unfamiliar, preserve a complete known-good folder before making emergency changes.

## After editing source or config

```bash
npm run test:run
npm run lint
npm run build
npm run kiosk:start
```

Stop interactive `kiosk:start` with Control-C. Once verified:

```bash
launchctl kickstart -k gui/$(id -u)/com.gavxflx.artapp-kiosk
```

The kiosk serves `dist/`. Source/config edits do nothing to the running cabinet until `npm run build` succeeds and the service/browser reloads.

## Operational rollback

The least risky emergency rollback is often:

1. Save the newest logs.
2. Rename the broken project folder rather than deleting it.
3. Copy the complete known-good folder into the exact original path.
4. Run `npm run build` if its `dist/` is not already current.
5. Restart the LaunchAgent.

Do not blindly discard Git changes. They may contain the only copy of later work.

# Troubleshooting Playbooks

| Symptom | Likely layer | First actions |
|---|---|---|
| Nothing launches after login | LaunchAgent/login | Log in; run status; verify plist; rerun install after successful preflight. |
| Chrome says site unreachable | Server/build | Wait 15 seconds; status; confirm `dist`; build; restart service. |
| Window appears but not fullscreen | Chrome/profile | Quit stray Chrome; restart service; remove old Login Item/script. |
| Old tabs or restore warning | Wrong Chrome launch | Use the dedicated supervisor/profile; remove normal Chrome from Login Items. |
| Artwork freezes | Renderer/main thread | Wait for watchdog; press input; restart; inspect newest browser log/screenshot. |
| Keyboard and MIDI both fail | App/runtime | Wake screensaver; confirm arcade URL; restart; inspect logs. |
| Keyboard works, cabinet fails | Teensy/MIDI | Reconnect USB; verify Teensy; repeat real preflight and permission. |
| Joystick fails, buttons work | Fixed note mapping | MIDI-monitor notes/channel; compare with manual; inspect `MidiContext`. |
| Sound missing | Output/autoplay/engine | Press control; local headphones; macOS output; amplifier/cable; preflight. |
| Screensaver fails | Asset/activity | Check video and rebuilt `dist`; debug query; MIDI noise may reset timer continuously. |
| Changes do not appear | Stale `dist` | Build, then restart LaunchAgent. |
| Page fails after config edit | Invalid JSON/schema | Restore known-good preset; validate JSON; rebuild. |

## No sound

1. Do not rely on Screen Sharing audio. Plug headphones into the exact cabinet output.
2. Press a cabinet button to satisfy browser autoplay.
3. In System Settings -> Sound, select the correct output and check mute/output volume.
4. Check headphone amplifier power, input, output and physical volume.
5. Play a known-good local audio file as an output test. If it is silent, the app is not the cause.
6. Run preflight and answer its sound question.
7. Inspect Web Audio/Tone logs only after physical output is proven.

## No MIDI

1. Reconnect Teensy directly; avoid an unpowered hub.
2. Wake/restart Chrome and grant MIDI permission if prompted.
3. Confirm Teensy is selected in normal editor mode or preflight diagnostics.
4. Use macOS Audio MIDI Setup or a MIDI monitor to prove note/CC data.
5. Compare channel and note numbers with this manual.
6. If correct data is ignored, inspect `MidiContext` and preset `midiMappings`.

## Not fullscreen or extra windows

1. Remove the old `start-art-app.sh` and normal Chrome from System Settings -> General -> Login Items.
2. Leave only the installed LaunchAgent in charge of startup.
3. Close all Chrome windows and restart the service.
4. Confirm the URL contains `?arcade=1`.
5. If Chrome still restores old state, inspect the kiosk logs and dedicated profile rather than changing your normal Chrome profile.

## Page unresponsive but no errors

1. Wait 15 seconds for watchdog health checks and possible renderer restart.
2. Record the exact time and take a phone photo.
3. Try one keyboard input and one physical MIDI input.
4. Run `npm run kiosk:status` from Screen Sharing/Terminal.
5. Restart the service if it has not recovered.
6. Preserve the newest run directory. Silent hangs are diagnosed from health metrics, event timing and screenshots, not only console errors.

# Testing, Logs and Reports

Diagnostics are stored under `~/Library/Logs/ArtAppKiosk/`. Production logs are retained for 30 days, with a maximum of 50 run directories.

| Artifact | Use |
|---|---|
| JSONL event log | Timestamped supervisor, health, recovery and screensaver events. |
| Browser console output | React, WebAudio and runtime warnings/errors. |
| Server/process logs | Vite, Chrome and child-process exits. |
| Screenshots | What the kiosk displayed around a failure. |
| `summary.json` | Machine-readable test outcome and counters. |
| `report.html` | Human-readable soak/drill report. |

Open recent logs:

```bash
open ~/Library/Logs/ArtAppKiosk
ls -lt ~/Library/Logs/ArtAppKiosk | head
```

## Incident record

Write down:

- Exact local time.
- What was visible and audible.
- Last control pressed.
- Whether keyboard and MIDI both failed.
- Whether screensaver was active.
- Output of `npm run kiosk:status`.
- Name of newest log directory and screenshot.
- What recovery command worked.

# Command Cheat Sheet

| Goal | Command |
|---|---|
| Enter project | `cd /Users/macmini_m2/Documents/old_art_app` |
| Build production files | `npm run build` |
| Run editor locally | `npm run dev` |
| Run production preview | `npm run preview` |
| Run tests once | `npm run test:run` |
| Check lint | `npm run lint` |
| Start kiosk interactively | `npm run kiosk:start` |
| Check installed service | `npm run kiosk:status` |
| Restart installed service | `launchctl kickstart -k gui/$(id -u)/com.gavxflx.artapp-kiosk` |
| Open logs | `open ~/Library/Logs/ArtAppKiosk` |
| Stop a Terminal command | Control-C |

> **Final rule:** At the festival, prefer restart, known-good rollback and written incident notes over improvised dependency or operating-system changes. Diagnose from outside inward: power/cables -> macOS output and USB -> watchdog/server -> browser -> app/config -> code.
