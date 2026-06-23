#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_CHROME_PATH,
  DEFAULT_LOG_DIR,
  DEFAULT_PORT,
  DEFAULT_SUPPORT_DIR,
  KIOSK_LABEL,
  KioskSupervisor,
  buildLaunchAgentPlist,
  isPreflightAccepted,
  waitForEnter,
} from './kiosk-core.mjs';

const command = process.argv[2] || 'help';
const args = process.argv.slice(3);
const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cliPath = path.join(appDir, 'scripts', 'kiosk', 'kiosk-cli.mjs');

const readNumberArg = (name, fallback) => {
  const index = args.indexOf(name);
  const value = index >= 0 ? Number(args[index + 1]) : fallback;
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const printHelp = () => {
  console.log(`Art App kiosk commands:
  npm run kiosk:preflight   Check build, Chrome, sound, MIDI and fullscreen
  npm run kiosk:soak        Run the 8-hour two-player soak test
  npm run kiosk:drill       Run a short recovery-drill test
  npm run kiosk:start       Run the permanent production watchdog
  npm run kiosk:install     Install and start the macOS LaunchAgent
  npm run kiosk:status      Show LaunchAgent and server status
  npm run kiosk:uninstall   Remove the LaunchAgent (logs/profile are retained)

Options: --hours N, --minutes N, --port N, --headless`);
};

const assertBaseRequirements = () => {
  const failures = [];
  if (!fs.existsSync(DEFAULT_CHROME_PATH)) failures.push(`Chrome missing: ${DEFAULT_CHROME_PATH}`);
  if (!fs.existsSync(path.join(appDir, 'dist', 'index.html'))) failures.push('Production build missing: run npm run build');
  if (!fs.existsSync(path.join(appDir, 'node_modules', 'playwright-core'))) failures.push('Dependencies missing: run npm install');
  fs.mkdirSync(DEFAULT_SUPPORT_DIR, { recursive: true });
  fs.mkdirSync(DEFAULT_LOG_DIR, { recursive: true });
  if (failures.length) throw new Error(failures.join('\n'));
};

const runSupervisor = async (mode, defaultDurationMs) => {
  assertBaseRequirements();
  const hours = readNumberArg('--hours', 0);
  const minutes = readNumberArg('--minutes', 0);
  const port = readNumberArg('--port', DEFAULT_PORT);
  const durationMs = hours ? hours * 3_600_000 : minutes ? minutes * 60_000 : defaultDurationMs;
  const supervisor = new KioskSupervisor({ mode, appDir, durationMs, port });
  const stop = async signal => {
    console.log(`Received ${signal}; shutting down kiosk.`);
    await supervisor.finish();
    process.exit(0);
  };
  process.once('SIGINT', () => stop('SIGINT'));
  process.once('SIGTERM', () => stop('SIGTERM'));
  try {
    await supervisor.run();
  } finally {
    await supervisor.finish();
  }
  if (mode !== 'start' && !supervisor.summary.passed) process.exitCode = 1;
};

const preflight = async () => {
  assertBaseRequirements();
  const headlessMode = args.includes('--headless');
  console.log('Starting the production kiosk for preflight. Grant any Chrome MIDI prompt now.');
  if (headlessMode) {
    console.log('Headless preflight: physical Teensy and speaker confirmation will be deferred until cabinet reconnection.');
  }
  const supervisor = new KioskSupervisor({ mode: 'preflight', appDir, durationMs: 60_000 });
  try {
    await supervisor.startServer();
    await supervisor.startChrome();
    let probe;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        probe = await supervisor.readHealth();
        if (probe.health.ok) break;
      } catch {
        // Allow initial preset, MIDI and audio startup to settle.
      }
      await new Promise(resolve => setTimeout(resolve, 1_000));
    }
    const heardAudio = headlessMode
      ? false
      : await waitForEnter('Can you hear the generated sound from the cabinet output? [y/N] ');
    const snapshot = probe?.snapshot || supervisor.lastSnapshot;
    const teensySelected = /teensy/i.test(snapshot?.midi?.selectedInputName || '');
    const result = {
      checkedAt: new Date().toISOString(),
      health: probe?.health || { ok: false, failures: ['health-unavailable'] },
      heardAudio,
      teensySelected,
      headlessMode,
      snapshot,
    };
    fs.writeFileSync(path.join(DEFAULT_SUPPORT_DIR, 'preflight.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ health: result.health, heardAudio, teensySelected, headlessMode }, null, 2));
    if (!isPreflightAccepted(result)) {
      throw new Error('Preflight incomplete. Confirm fullscreen, sound output, and the Teensy MIDI selection before installing.');
    }
  } finally {
    await supervisor.finish();
  }
};

const install = () => {
  assertBaseRequirements();
  const preflightPath = path.join(DEFAULT_SUPPORT_DIR, 'preflight.json');
  if (!fs.existsSync(preflightPath)) throw new Error('Run npm run kiosk:preflight successfully before installation.');
  const preflightResult = JSON.parse(fs.readFileSync(preflightPath, 'utf8'));
  if (!isPreflightAccepted(preflightResult)) {
    throw new Error('The saved preflight did not pass sound, MIDI, and health checks.');
  }
  const launchAgents = path.join(os.homedir(), 'Library', 'LaunchAgents');
  fs.mkdirSync(launchAgents, { recursive: true });
  const plistPath = path.join(launchAgents, `${KIOSK_LABEL}.plist`);
  const launchLogDir = path.join(DEFAULT_LOG_DIR, 'launchd');
  fs.mkdirSync(launchLogDir, { recursive: true });
  const plist = buildLaunchAgentPlist({
    nodePath: process.execPath,
    cliPath,
    workdir: appDir,
    stdoutPath: path.join(launchLogDir, 'stdout.log'),
    stderrPath: path.join(launchLogDir, 'stderr.log'),
  });
  fs.writeFileSync(plistPath, plist);
  try { execFileSync('/bin/launchctl', ['bootout', `gui/${process.getuid()}`, plistPath], { stdio: 'ignore' }); } catch { /* not loaded */ }
  execFileSync('/bin/launchctl', ['bootstrap', `gui/${process.getuid()}`, plistPath], { stdio: 'inherit' });
  console.log(`Installed ${plistPath}`);
  if (preflightResult.headlessMode) {
    console.log('Headless installation accepted. Verify Teensy selection and cabinet audio after reconnecting the hardware.');
  }
  console.log('Remove the old start-art-app.sh from System Settings > General > Login Items to prevent duplicate Chrome launches.');
};

const status = async () => {
  try {
    const output = execFileSync('/bin/launchctl', ['print', `gui/${process.getuid()}/${KIOSK_LABEL}`], { encoding: 'utf8' });
    console.log(output.split('\n').slice(0, 30).join('\n'));
  } catch {
    console.log('LaunchAgent is not loaded.');
  }
  try {
    const response = await fetch(`http://127.0.0.1:${DEFAULT_PORT}/`);
    console.log(`Server: ${response.status} ${response.statusText}`);
  } catch {
    console.log('Server: unavailable');
  }
};

const uninstall = () => {
  const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', `${KIOSK_LABEL}.plist`);
  try { execFileSync('/bin/launchctl', ['bootout', `gui/${process.getuid()}`, plistPath], { stdio: 'inherit' }); } catch { /* not loaded */ }
  fs.rmSync(plistPath, { force: true });
  console.log('Kiosk LaunchAgent removed. Chrome profile and logs were retained.');
};

try {
  if (command === 'preflight') await preflight();
  else if (command === 'soak') await runSupervisor('soak', 8 * 60 * 60 * 1000);
  else if (command === 'drill') await runSupervisor('drill', 8 * 60 * 1000);
  else if (command === 'start') await runSupervisor('start', Number.POSITIVE_INFINITY);
  else if (command === 'install') install();
  else if (command === 'status') await status();
  else if (command === 'uninstall') uninstall();
  else printHelp();
} catch (error) {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
}
