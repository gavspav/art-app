# Arcade Kiosk Watchdog

The repository now owns the kiosk launch process. The old Desktop `start-art-app.sh` should not remain in macOS Login Items because it would start a second server and Chrome window.

## One-Time Setup On The Mac Mini

Open Terminal in the project directory:

```bash
cd /Users/macmini_m2/Documents/nodejs/gavXflx/old_art_app
npm install
npm run build
npm run kiosk:preflight
```

Preflight opens the arcade in kiosk Chrome. Grant any MIDI permission prompt, verify that Teensy is selected, and confirm in Terminal that sound is audible. This stores the permission and checks fullscreen, canvas rendering, cabinet modes, screensaver diagnostics, and audio startup.

If the Mac mini is temporarily headless and disconnected from the cabinet, use:

```bash
npm run kiosk:preflight -- --headless
```

This still requires the browser health, fullscreen, rendering, and Web Audio checks to pass, but defers physical Teensy detection and audible speaker confirmation. After reconnecting the cabinet, verify the Teensy input and audio output before public use.

Before unattended boot:

1. Remove the old `start-art-app.sh` from **System Settings > General > Login Items**.
2. Select the cabinet headphone/audio output in **System Settings > Sound**.
3. Enable automatic login for the dedicated cabinet account if the machine must recover after power loss. FileVault must be off for automatic login to be available.
4. Run the recovery drill, then install the watchdog:

```bash
npm run kiosk:drill
npm run kiosk:install
```

The installer creates `~/Library/LaunchAgents/com.gavxflx.artapp-kiosk.plist`. It uses absolute Node and project paths, starts at login, and is restarted by `launchd` if the supervisor exits.

## Extended Test

The standard soak lasts eight hours:

```bash
npm run kiosk:soak
```

For a shorter test:

```bash
npm run kiosk:soak -- --minutes 30
```

The test simulates both players simultaneously using cabinet keys and physical MIDI mappings. It includes realistic inactivity, verifies screensaver audio muting and wake-up, sends randomization as MIDI channel 2 CC 17, and deliberately tests server, Chrome, and renderer recovery.

## Operation

```bash
npm run kiosk:status
npm run kiosk:uninstall
```

`kiosk:uninstall` removes only the LaunchAgent. It retains the Chrome profile, MIDI permission, and diagnostic logs.

Logs and reports are stored in:

```text
~/Library/Logs/ArtAppKiosk/
```

Each soak directory contains JSONL events, browser console output, process logs, screenshots, `summary.json`, and `report.html`. Production logs are retained for 30 days, with a maximum of 50 run directories.

## Deploying Updates

After Syncthing has finished copying a new version:

```bash
cd /Users/macmini_m2/Documents/nodejs/gavXflx/old_art_app
npm install
npm run build
launchctl kickstart -k gui/$(id -u)/com.gavxflx.artapp-kiosk
```

The kiosk serves `dist/`; source changes do not affect the running cabinet until a new production build is made.
