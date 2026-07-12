import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium } from 'playwright-core';

const execFileAsync = promisify(execFile);

export const KIOSK_LABEL = 'com.gavxflx.artapp-kiosk';
export const DEFAULT_HOST = '127.0.0.1';
export const DEFAULT_PORT = 4173;
export const DEFAULT_CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const DEFAULT_SUPPORT_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'ArtAppKiosk');
export const DEFAULT_LOG_DIR = path.join(os.homedir(), 'Library', 'Logs', 'ArtAppKiosk');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const randomBetween = (min, max) => min + Math.random() * (max - min);
const timestamp = () => new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');

const CONTROL_RESPONSE_PROBES = [
  { name: 'speed', path: 'speed', midi: [36, 37], keys: ['s', 'a'], holdMs: 320 },
  { name: 'size', path: 'size', midi: [38, 39], keys: ['w', 'z'], holdMs: 320 },
  { name: 'layers', path: 'layerCount', midi: [44, 46], keys: ['j', 'h'], holdMs: 320 },
  { name: 'wobble-noise', path: ['wobble', 'noise'], midi: [45, 56], keys: ['u', 'n'], holdMs: 320 },
  { name: 'background', path: 'backgroundColor', midi: [30, 4], keys: ['e', 'c'], holdMs: 80 },
  { name: 'palette', path: 'paletteIndex', midi: [32, 5], keys: ['r', 'v'], holdMs: 80 },
  { name: 'sides', path: 'sides', midi: [51, 14], keys: ['i', 'm'], holdMs: 80 },
  { name: 'opacity', path: 'opacity', midi: [40, 13], keys: ['o', ','], holdMs: 80 },
  { name: 'blend', path: 'blendMode', midi: [6, 6], keys: ['t', 't'], holdMs: 80 },
  { name: 'curviness', path: 'curviness', midi: [12, 12], keys: ['p', 'p'], holdMs: 80 },
];

const readControlValue = (snapshot, pathSpec) => {
  const state = snapshot?.app?.controlState || {};
  if (Array.isArray(pathSpec)) return pathSpec.map(key => state[key]);
  return state[pathSpec];
};

const controlValueChanged = (before, after) => JSON.stringify(before) !== JSON.stringify(after);

export const withTimeout = async (promise, ms, label = 'operation') => {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};

export const restartDelayMs = (attempt) => Math.min(60_000, [1_000, 5_000, 15_000, 30_000][Math.max(0, attempt - 1)] || 60_000);

export const isPreflightAccepted = ({ health, heardAudio, teensySelected, headlessMode } = {}) => (
  !!health?.ok && (!!headlessMode || (!!heardAudio && !!teensySelected))
);

export const classifyHealth = ({ snapshot, viewport, expectedUrl, now = Date.now() } = {}) => {
  const failures = [];
  const warnings = [];
  if (!snapshot?.app?.ready) failures.push('app-not-ready');
  if (!snapshot?.app?.arcade) failures.push('not-arcade-mode');
  if (snapshot?.app?.parameterTargetMode !== 'global') failures.push('target-not-global');
  if (!snapshot?.app?.arcadeJoystickMidiEnabled) failures.push('joystick-disabled');
  if (!snapshot?.app?.arcadeKeyboardMidiEnabled) failures.push('cab-keys-disabled');
  if (!snapshot?.app?.arcadeButtonPairsMidiEnabled) failures.push('button-pairs-disabled');
  if (!snapshot?.sound?.enabled || !snapshot?.sound?.started || snapshot?.sound?.contextState !== 'running') {
    failures.push('sound-not-running');
  }
  if (snapshot?.sound?.startError) warnings.push(`sound:${snapshot.sound.startError}`);
  if (!snapshot?.canvas?.lastRenderAt || now - snapshot.canvas.lastRenderAt > 20_000) failures.push('canvas-stalled');
  if (!(snapshot?.canvas?.width > 0) || !(snapshot?.canvas?.height > 0)) failures.push('canvas-empty');
  if (viewport) {
    const targetWidth = viewport.availWidth || viewport.screenWidth;
    const targetHeight = viewport.availHeight || viewport.screenHeight;
    const widthOk = viewport.innerWidth >= targetWidth - 12;
    const heightOk = viewport.innerHeight >= targetHeight - 12;
    // macOS can reserve the menu-bar/notch area even for kiosk content, and
    // CDP may still label that window "normal". Filling the available display
    // without browser chrome is the reliable signal.
    if (!widthOk || !heightOk) failures.push('not-fullscreen');
    if (expectedUrl && !String(viewport.url || '').startsWith(expectedUrl)) failures.push('wrong-url');
  }
  return { ok: failures.length === 0, failures, warnings };
};

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

export const buildReportHtml = (summary) => {
  const incidents = (summary.incidents || []).map(incident => `
    <tr><td>${escapeHtml(incident.at)}</td><td>${escapeHtml(incident.kind)}</td><td>${escapeHtml(incident.reason)}</td><td>${escapeHtml(incident.recoveredMs ?? '')}</td></tr>`).join('');
  const drills = (summary.drills || []).map(drill => `
    <tr><td>${escapeHtml(drill.kind)}</td><td>${escapeHtml(drill.startedAt)}</td><td>${escapeHtml(drill.recoveredMs ?? 'not recovered')}</td></tr>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Art App Kiosk Report</title>
  <style>body{font:15px system-ui;margin:32px;color:#222}h1,h2{margin:0 0 16px}section{margin:28px 0}table{border-collapse:collapse;width:100%}th,td{padding:8px;border:1px solid #ccc;text-align:left}.pass{color:#08752d}.fail{color:#a31515}code{background:#eee;padding:2px 5px}</style></head><body>
  <h1>Art App Kiosk Report</h1><p class="${summary.passed ? 'pass' : 'fail'}"><strong>${summary.passed ? 'PASS' : 'FAIL'}</strong></p>
  <section><h2>Run</h2><p>Mode: <code>${escapeHtml(summary.mode)}</code><br>Started: ${escapeHtml(summary.startedAt)}<br>Finished: ${escapeHtml(summary.finishedAt)}<br>Duration: ${escapeHtml(summary.durationMinutes)} minutes<br>Organic failures: ${escapeHtml(summary.organicFailures || 0)}<br>Restarts: ${escapeHtml(summary.restarts || 0)}</p></section>
  <section><h2>Coverage</h2><p>Inputs: ${escapeHtml(summary.inputCount || 0)} | Randomizations: ${escapeHtml(summary.randomizeCount || 0)} | Screensaver cycles: ${escapeHtml(summary.screensaverCycles || 0)} | Health probes: ${escapeHtml(summary.healthProbes || 0)} | Control probes: ${escapeHtml(summary.controlProbes || 0)} | Control failures: ${escapeHtml(summary.controlProbeFailures || 0)}</p></section>
  <section><h2>Recovery Drills</h2><table><thead><tr><th>Drill</th><th>Started</th><th>Recovery ms</th></tr></thead><tbody>${drills || '<tr><td colspan="3">None</td></tr>'}</tbody></table></section>
  <section><h2>Incidents</h2><table><thead><tr><th>Time</th><th>Kind</th><th>Reason</th><th>Recovery ms</th></tr></thead><tbody>${incidents || '<tr><td colspan="4">None</td></tr>'}</tbody></table></section>
  </body></html>`;
};

export const buildLaunchAgentPlist = ({ nodePath, cliPath, workdir, stdoutPath, stderrPath }) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${KIOSK_LABEL}</string>
  <key>ProgramArguments</key><array><string>${nodePath}</string><string>${cliPath}</string><string>start</string></array>
  <key>WorkingDirectory</key><string>${workdir}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ThrottleInterval</key><integer>15</integer>
  <key>StandardOutPath</key><string>${stdoutPath}</string>
  <key>StandardErrorPath</key><string>${stderrPath}</string>
</dict></plist>`;

class RunLogger {
  constructor(rootDir, mode) {
    this.runDir = path.join(rootDir, `${timestamp()}-${mode}`);
    fs.mkdirSync(this.runDir, { recursive: true });
    this.eventsPath = path.join(this.runDir, 'events.jsonl');
    this.consolePath = path.join(this.runDir, 'browser-console.log');
  }

  event(kind, data = {}) {
    const entry = { at: new Date().toISOString(), kind, ...data };
    fs.appendFileSync(this.eventsPath, `${JSON.stringify(entry)}\n`);
    process.stdout.write(`[${entry.at}] ${kind}${data.reason ? `: ${data.reason}` : ''}\n`);
    return entry;
  }

  browser(type, text) {
    fs.appendFileSync(this.consolePath, `[${new Date().toISOString()}] ${type}: ${text}\n`);
  }
}

const cleanOldRuns = (rootDir) => {
  fs.mkdirSync(rootDir, { recursive: true });
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const entries = fs.readdirSync(rootDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => ({ name: entry.name, fullPath: path.join(rootDir, entry.name), mtime: fs.statSync(path.join(rootDir, entry.name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  entries.forEach((entry, index) => {
    if (index >= 50 || entry.mtime < cutoff) fs.rmSync(entry.fullPath, { recursive: true, force: true });
  });
};

const writeChildOutput = (stream, destination) => {
  if (!stream) return;
  stream.on('data', chunk => fs.appendFileSync(destination, chunk));
};

const signalProcessGroup = (child, signal) => {
  if (!child || child.exitCode != null || !child.pid) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    try { child.kill(signal); } catch { /* already stopped */ }
  }
};

const fetchOk = async (url, timeoutMs = 3_000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
};

const normalizeChromeProfile = (profileDir) => {
  const defaultDir = path.join(profileDir, 'Default');
  fs.rmSync(path.join(defaultDir, 'Sessions'), { recursive: true, force: true });
  const preferencesPath = path.join(defaultDir, 'Preferences');
  if (!fs.existsSync(preferencesPath)) return;
  try {
    const preferences = JSON.parse(fs.readFileSync(preferencesPath, 'utf8'));
    preferences.profile = { ...(preferences.profile || {}), exit_type: 'Normal', exited_cleanly: true };
    const temporaryPath = `${preferencesPath}.kiosk-tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(preferences));
    fs.renameSync(temporaryPath, preferencesPath);
  } catch {
    // A malformed Chrome preference file should not prevent kiosk recovery.
  }
};

const getProcessMetrics = async (pid) => {
  if (!pid) return {};
  try {
    const { stdout } = await execFileAsync('/bin/ps', ['-o', 'rss=,%cpu=', '-p', String(pid)]);
    const [rssKb, cpuPercent] = stdout.trim().split(/\s+/).map(Number);
    return { rssMb: Number.isFinite(rssKb) ? Math.round(rssKb / 1024) : null, cpuPercent: Number.isFinite(cpuPercent) ? cpuPercent : null };
  } catch {
    return {};
  }
};

const stopExistingProfileProcesses = async (profileDir) => {
  try {
    const { stdout } = await execFileAsync('/bin/ps', ['-axo', 'pid=,command=']);
    const marker = `--user-data-dir=${profileDir}`;
    const pids = stdout.split('\n').map(line => {
      const match = line.trim().match(/^(\d+)\s+(.+)$/);
      return match && match[2].includes(marker) ? Number(match[1]) : null;
    }).filter(pid => Number.isInteger(pid) && pid !== process.pid);
    pids.forEach(pid => {
      try { process.kill(pid, 'SIGTERM'); } catch { /* already stopped */ }
    });
    if (pids.length) await sleep(2_000);
    pids.forEach(pid => {
      try { process.kill(pid, 'SIGKILL'); } catch { /* stopped cleanly */ }
    });
  } catch {
    // A fresh profile has no processes to clean up.
  }
};

export class KioskSupervisor {
  constructor({
    mode = 'start',
    appDir = process.cwd(),
    host = DEFAULT_HOST,
    port = DEFAULT_PORT,
    durationMs = 8 * 60 * 60 * 1000,
    chromePath = DEFAULT_CHROME_PATH,
    supportDir = DEFAULT_SUPPORT_DIR,
    logDir = DEFAULT_LOG_DIR,
  } = {}) {
    this.mode = mode;
    this.appDir = appDir;
    this.host = host;
    this.port = port;
    this.baseUrl = `http://${host}:${port}/`;
    this.durationMs = durationMs;
    this.chromePath = chromePath;
    this.supportDir = supportDir;
    this.profileDir = path.join(supportDir, 'chrome-profile');
    cleanOldRuns(logDir);
    this.logger = new RunLogger(logDir, mode);
    this.server = null;
    this.chrome = null;
    this.browser = null;
    this.page = null;
    this.cdp = null;
    this.stopping = false;
    this.restartAttempts = 0;
    this.lastSnapshot = null;
    this.lastHealthyAt = 0;
    this.failures = 0;
    this.fullscreenFailures = 0;
    this.summary = {
      mode,
      startedAt: new Date().toISOString(),
      incidents: [],
      drills: [],
      restarts: 0,
      organicFailures: 0,
      healthProbes: 0,
      screensaverCycles: 0,
      controlProbes: 0,
      controlProbeFailures: 0,
      controlProbeResults: [],
    };
    this.pendingDrill = null;
    this.controlProbeInProgress = false;
    this.caffeinate = null;
    this.finished = false;
    this.lastHealthSignature = '';
    this.previousPageCounters = { input: 0, randomize: 0 };
    this.counterOffsets = { input: 0, randomize: 0 };
  }

  get testMode() { return this.mode === 'soak' || this.mode === 'drill'; }

  get appUrl() {
    const params = new URLSearchParams({ arcade: '1', kioskMonitor: '1' });
    if (this.testMode) params.set('kioskTest', '1');
    if (this.mode === 'drill') params.set('screensaverIdleMs', '10000');
    return `${this.baseUrl}?${params.toString()}`;
  }

  async startServer() {
    if (this.server && this.server.exitCode == null) return;
    const logPath = path.join(this.logger.runDir, 'server.log');
    const vitePath = path.join(this.appDir, 'node_modules', 'vite', 'bin', 'vite.js');
    this.server = spawn(process.execPath, [vitePath, 'preview', '--host', this.host, '--port', String(this.port), '--strictPort'], {
      cwd: this.appDir,
      env: { ...process.env, BROWSER: 'none' },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });
    writeChildOutput(this.server.stdout, logPath);
    writeChildOutput(this.server.stderr, logPath);
    this.server.once('exit', (code, signal) => this.logger.event('server-exit', { code, signal }));
    const serverFailure = (message) => {
      let details = '';
      try {
        details = fs.readFileSync(logPath, 'utf8').trim().split('\n').slice(-8).join('\n');
      } catch {
        // The process can exit before writing a log.
      }
      return new Error(details ? `${message}\n${details}` : message);
    };
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (this.server.exitCode != null) throw serverFailure(`Preview server exited before becoming ready; port ${this.port} may already be in use`);
      if (await fetchOk(this.baseUrl)) {
        await sleep(250);
        if (this.server.exitCode != null) throw serverFailure(`Preview server exited while checking port ${this.port}; another server may own it`);
        this.logger.event('server-ready', { pid: this.server.pid, url: this.baseUrl });
        return;
      }
      await sleep(1_000);
    }
    throw new Error('Preview server did not become ready within 30 seconds');
  }

  async stopServer() {
    const child = this.server;
    this.server = null;
    if (!child || child.exitCode != null) return;
    signalProcessGroup(child, 'SIGTERM');
    await Promise.race([new Promise(resolve => child.once('exit', resolve)), sleep(3_000)]);
    if (child.exitCode == null) signalProcessGroup(child, 'SIGKILL');
  }

  async startChrome() {
    await this.stopChrome();
    fs.mkdirSync(this.profileDir, { recursive: true });
    await stopExistingProfileProcesses(this.profileDir);
    normalizeChromeProfile(this.profileDir);
    const debugPort = 9300 + Math.floor(Math.random() * 500);
    const chromeLog = path.join(this.logger.runDir, 'chrome-process.log');
    const args = [
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${this.profileDir}`,
      '--kiosk',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-session-crashed-bubble',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-pinch',
      '--overscroll-history-navigation=0',
      this.appUrl,
    ];
    this.chrome = spawn(this.chromePath, args, { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    writeChildOutput(this.chrome.stdout, chromeLog);
    writeChildOutput(this.chrome.stderr, chromeLog);
    this.chrome.once('exit', (code, signal) => this.logger.event('chrome-exit', { code, signal }));

    const endpoint = `http://${this.host}:${debugPort}`;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        this.browser = await chromium.connectOverCDP(endpoint);
        break;
      } catch {
        await sleep(1_000);
      }
    }
    if (!this.browser) throw new Error('Chrome DevTools endpoint did not become ready');
    const context = this.browser.contexts()[0];
    const pages = context?.pages() || [];
    this.page = pages.find(candidate => candidate.url().startsWith(this.baseUrl)) || pages[0] || await context.newPage();
    if (!this.page.url().startsWith(this.baseUrl)) await this.page.goto(this.appUrl, { waitUntil: 'domcontentloaded' });
    for (const extra of context.pages()) {
      if (extra !== this.page) await extra.close().catch(() => {});
    }
    this.page.on('console', message => this.logger.browser(message.type(), message.text()));
    this.page.on('pageerror', error => this.logger.browser('pageerror', error?.stack || error?.message || String(error)));
    this.page.on('requestfailed', request => this.logger.browser('requestfailed', `${request.url()} ${request.failure()?.errorText || ''}`));
    this.cdp = await context.newCDPSession(this.page);
    await this.cdp.send('Performance.enable').catch(() => {});
    this.logger.event('chrome-ready', { pid: this.chrome.pid, url: this.page.url(), debugPort });
  }

  async stopChrome() {
    const browser = this.browser;
    const child = this.chrome;
    this.browser = null;
    this.page = null;
    this.cdp = null;
    this.chrome = null;
    if (browser) await withTimeout(browser.close(), 2_000, 'browser close').catch(() => {});
    if (child && child.exitCode == null) {
      signalProcessGroup(child, 'SIGTERM');
      await Promise.race([new Promise(resolve => child.once('exit', resolve)), sleep(2_000)]);
      if (child.exitCode == null) signalProcessGroup(child, 'SIGKILL');
    }
  }

  async readHealth() {
    if (!this.page || this.page.isClosed()) throw new Error('Kiosk page is unavailable');
    const windowInfo = await withTimeout(this.cdp?.send('Browser.getWindowForTarget'), 2_000, 'window state').catch(() => null);
    const result = await withTimeout(this.page.evaluate(() => {
      const api = window.__ARTAPP_KIOSK__;
      const snapshot = api?.getSnapshot?.() || null;
      return {
        snapshot,
        viewport: {
          url: window.location.href,
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          screenWidth: window.screen.width,
          screenHeight: window.screen.height,
          availWidth: window.screen.availWidth,
          availHeight: window.screen.availHeight,
        },
      };
    }), 4_000, 'page health probe');
    if (!result.snapshot) throw new Error('Kiosk diagnostics are unavailable');
    result.viewport.windowState = windowInfo?.bounds?.windowState || 'unknown';
    const health = classifyHealth({ ...result, expectedUrl: this.baseUrl });
    this.lastSnapshot = result.snapshot;
    const pageInputCount = Number(result.snapshot?.midi?.inputCount) || 0;
    const pageRandomizeCount = Number(result.snapshot?.counters?.randomize) || 0;
    if (pageInputCount < this.previousPageCounters.input) this.counterOffsets.input += this.previousPageCounters.input;
    if (pageRandomizeCount < this.previousPageCounters.randomize) this.counterOffsets.randomize += this.previousPageCounters.randomize;
    this.previousPageCounters = { input: pageInputCount, randomize: pageRandomizeCount };
    this.summary.inputCount = this.counterOffsets.input + pageInputCount;
    this.summary.randomizeCount = this.counterOffsets.randomize + pageRandomizeCount;
    this.summary.healthProbes += 1;
    return { ...result, health };
  }

  async captureIncident(label) {
    const target = path.join(this.logger.runDir, `${timestamp()}-${label}.png`);
    await withTimeout(this.page?.screenshot({ path: target }), 3_000, 'incident screenshot').catch(() => {});
    return target;
  }

  async collectMetrics() {
    const processMetrics = await getProcessMetrics(this.chrome?.pid);
    let browserMetrics = {};
    try {
      const result = await withTimeout(this.cdp?.send('Performance.getMetrics'), 2_000, 'performance metrics');
      browserMetrics = Object.fromEntries((result?.metrics || []).map(metric => [metric.name, metric.value]));
    } catch {
      // Health checks handle unresponsive renderers; metrics are best effort.
    }
    this.logger.event('metrics', {
      ...processMetrics,
      jsHeapMb: browserMetrics.JSHeapUsedSize ? Math.round(browserMetrics.JSHeapUsedSize / 1024 / 1024) : null,
      domNodes: browserMetrics.Nodes || null,
    });
  }

  async recover(reason, kind = 'organic') {
    const started = Date.now();
    await this.captureIncident(`incident-${reason}`);
    const incident = this.logger.event('recovery-start', { reason, incidentKind: kind });
    const summaryIncident = { ...incident, reason, kind, recoveredMs: null };
    this.summary.incidents.push(summaryIncident);
    if (kind === 'organic') this.summary.organicFailures += 1;
    this.summary.restarts += 1;
    this.restartAttempts += 1;
    await this.stopChrome();
    if (!await fetchOk(this.baseUrl)) {
      await this.stopServer();
      await this.startServer();
    }
    await sleep(restartDelayMs(this.restartAttempts));
    await this.startChrome();
    const deadline = Date.now() + 45_000;
    let healthy = false;
    while (Date.now() < deadline) {
      try {
        const probe = await this.readHealth();
        if (probe.health.ok) {
          healthy = true;
          break;
        }
      } catch {
        // Continue until the recovery deadline.
      }
      await sleep(2_000);
    }
    const recoveredMs = Date.now() - started;
    summaryIncident.recoveredMs = healthy ? recoveredMs : null;
    if (this.pendingDrill) {
      this.pendingDrill.recoveredMs = healthy ? recoveredMs : null;
      this.pendingDrill = null;
    }
    this.logger.event(healthy ? 'recovery-complete' : 'recovery-failed', { reason, recoveredMs });
    if (healthy) {
      this.restartAttempts = 0;
      this.failures = 0;
      this.fullscreenFailures = 0;
      this.lastHealthyAt = Date.now();
    }
    return healthy;
  }

  async monitorOnce() {
    if (!await fetchOk(this.baseUrl)) {
      const recoveryStarted = Date.now();
      await this.stopServer();
      await this.startServer();
      this.logger.event('server-recovered');
      if (this.pendingDrill?.kind === 'server-crash') {
        this.pendingDrill.recoveredMs = Date.now() - (this.pendingDrill.startedMs || recoveryStarted);
        this.pendingDrill = null;
      }
    }
    try {
      const probe = await this.readHealth();
      const fullscreenOnly = probe.health.failures.length === 1 && probe.health.failures[0] === 'not-fullscreen';
      const signature = probe.health.failures.join(',');
      if (signature && signature !== this.lastHealthSignature) {
        this.logger.event('health-failure', { reason: signature, viewport: probe.viewport });
      }
      this.lastHealthSignature = signature;
      this.fullscreenFailures = probe.health.failures.includes('not-fullscreen') ? this.fullscreenFailures + 1 : 0;
      this.failures = probe.health.ok || fullscreenOnly ? 0 : this.failures + 1;
      if (probe.health.ok) {
        this.lastHealthyAt = Date.now();
        this.restartAttempts = 0;
      }
      if (this.fullscreenFailures >= 3) await this.recover('fullscreen-lost', this.pendingDrill ? 'drill' : 'organic');
      else if (this.failures >= 3) await this.recover(probe.health.failures.join(','), this.pendingDrill ? 'drill' : 'organic');
    } catch (error) {
      this.failures += 1;
      this.logger.event('health-error', { reason: error.message, consecutive: this.failures });
      if (this.failures >= 3) await this.recover('page-unresponsive', this.pendingDrill ? 'drill' : 'organic');
    }
  }

  async injectMidi(message) {
    if (!this.page) return false;
    return withTimeout(this.page.evaluate(msg => window.__ARTAPP_KIOSK__?.injectMidi?.(msg) || false, message), 3_000, 'MIDI injection');
  }

  async keyboardTap(key, holdMs = 100) {
    if (!this.page) return;
    await this.page.keyboard.down(key);
    await sleep(holdMs);
    await this.page.keyboard.up(key);
  }

  async performProbeInput(probe, mode, directionIndex) {
    if (mode === 'midi') {
      const number = probe.midi[directionIndex];
      await this.injectMidi({ type: 'note', channel: 1, number, value: 127, source: 'kioskTest' });
      await sleep(probe.holdMs);
      await this.injectMidi({ type: 'note', channel: 1, number, value: 0, source: 'kioskTest' });
      return;
    }
    await this.keyboardTap(probe.keys[directionIndex], probe.holdMs);
  }

  async verifyControlResponse(mode, phase = 'periodic') {
    if (this.controlProbeInProgress || this.pendingDrill || !this.page) return true;
    this.controlProbeInProgress = true;
    const failures = [];
    try {
      for (const probe of CONTROL_RESPONSE_PROBES) {
        let before = readControlValue((await this.readHealth()).snapshot, probe.path);
        let changed = false;
        let after = before;
        for (let directionIndex = 0; directionIndex < 2 && !changed; directionIndex += 1) {
          await this.performProbeInput(probe, mode, directionIndex);
          await sleep(180);
          after = readControlValue((await this.readHealth()).snapshot, probe.path);
          changed = controlValueChanged(before, after);
          before = after;
        }
        const result = { at: new Date().toISOString(), mode, phase, control: probe.name, changed, value: after };
        this.summary.controlProbeResults.push(result);
        this.logger.event(changed ? 'control-probe-pass' : 'control-probe-fail', result);
        if (!changed) failures.push(probe.name);
      }
      this.summary.controlProbes += CONTROL_RESPONSE_PROBES.length;
      this.summary.controlProbeFailures += failures.length;
      return failures.length === 0;
    } catch (error) {
      this.summary.controlProbeFailures += 1;
      this.logger.event('control-probe-error', { mode, phase, reason: error.message });
      return false;
    } finally {
      this.controlProbeInProgress = false;
    }
  }

  async runPlayer(player) {
    const keyboard = player === 1
      ? { joystick: ['w', 'a', 's', 'z'], buttons: ['e', 'r', 't', 'c', 'v'] }
      : { joystick: ['u', 'h', 'j', 'n'], buttons: ['i', 'o', 'p', 'm', ','] };
    const physical = player === 1
      ? { joystick: [37, 36, 38, 39], buttons: [30, 4, 32, 5, 6] }
      : { joystick: [46, 44, 45, 56], buttons: [51, 14, 40, 13, 12] };
    const useMidi = Math.random() < 0.35;
    const joystick = Math.random() < 0.58;
    const holdMs = joystick ? randomBetween(180, 1_600) : randomBetween(60, 180);
    if (useMidi) {
      const options = joystick ? physical.joystick : physical.buttons;
      const number = options[Math.floor(Math.random() * options.length)];
      await this.injectMidi({ type: 'note', channel: 1, number, value: 127, source: 'kioskTest' });
      await sleep(holdMs);
      await this.injectMidi({ type: 'note', channel: 1, number, value: 0, source: 'kioskTest' });
    } else {
      const options = joystick ? keyboard.joystick : keyboard.buttons;
      await this.keyboardTap(options[Math.floor(Math.random() * options.length)], holdMs);
    }
  }

  async waitForScreensaver(active, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline && !this.stopping) {
      try {
        const { snapshot } = await this.readHealth();
        if (!!snapshot.screensaver?.active === active) return true;
      } catch {
        return false;
      }
      await sleep(1_000);
    }
    return false;
  }

  async runSimulation(endAt) {
    let nextRandomAt = Date.now() + (this.mode === 'drill' ? 5_000 : randomBetween(30_000, 90_000));
    await sleep(3_000);
    await this.verifyControlResponse('midi', 'startup');
    await this.verifyControlResponse('keyboard', 'startup');
    let nextControlProbeAt = Date.now() + (this.mode === 'drill' ? 30_000 : 60_000);
    while (!this.stopping && Date.now() < endAt) {
      const activeMs = this.mode === 'drill' ? 20_000 : randomBetween(120_000, 300_000);
      const activeUntil = Math.min(endAt, Date.now() + activeMs);
      while (!this.stopping && Date.now() < activeUntil) {
        if (Date.now() >= nextControlProbeAt && !this.pendingDrill) {
          const mode = this.summary.controlProbes % (CONTROL_RESPONSE_PROBES.length * 2) === 0 ? 'midi' : 'keyboard';
          await this.verifyControlResponse(mode);
          nextControlProbeAt = Date.now() + (this.mode === 'drill' ? 30_000 : 60_000);
        }
        if (Date.now() >= nextRandomAt) {
          await this.injectMidi({ type: 'cc', channel: 2, number: 17, value: 127, source: 'kioskTest' }).catch(() => {});
          await this.injectMidi({ type: 'cc', channel: 2, number: 17, value: 0, source: 'kioskTest' }).catch(() => {});
          nextRandomAt = Date.now() + randomBetween(45_000, 150_000);
        }
        await Promise.all([this.runPlayer(1), this.runPlayer(2)]).catch(() => {});
        await sleep(randomBetween(250, 1_200));
      }
      if (Date.now() >= endAt || this.stopping) break;
      const idleMs = this.mode === 'drill' ? 14_000 : randomBetween(70_000, 100_000);
      const entered = await this.waitForScreensaver(true, Math.min(idleMs, this.mode === 'drill' ? 13_000 : 65_000));
      if (entered) this.summary.screensaverCycles += 1;
      await sleep(Math.max(0, idleMs - (this.mode === 'drill' ? 13_000 : 65_000)));
      await this.keyboardTap('e', 80).catch(() => {});
      const exited = await this.waitForScreensaver(false, 5_000);
      this.logger.event(exited ? 'screensaver-cycle' : 'screensaver-cycle-failed', { entered, exited });
      if (exited) {
        await this.verifyControlResponse('midi', 'after-inactivity');
        await this.verifyControlResponse('keyboard', 'after-inactivity');
        nextControlProbeAt = Date.now() + (this.mode === 'drill' ? 30_000 : 60_000);
      }
    }
  }

  async runDrill(kind) {
    while (this.controlProbeInProgress && !this.stopping) await sleep(100);
    const drill = { kind, startedAt: new Date().toISOString(), startedMs: Date.now(), recoveredMs: null };
    this.summary.drills.push(drill);
    this.pendingDrill = drill;
    this.logger.event('drill-start', { drill: kind });
    if (kind === 'server-crash') {
      await this.stopServer();
      return;
    }
    if (kind === 'browser-crash') {
      signalProcessGroup(this.chrome, 'SIGKILL');
      return;
    }
    if (kind === 'renderer-hang') {
      this.page?.evaluate(() => window.__ARTAPP_KIOSK__?.blockMainThread?.(120_000)).catch(() => {});
    }
  }

  async scheduleDrills(startAt, endAt) {
    const kinds = ['server-crash', 'browser-crash', 'renderer-hang'];
    for (let index = 0; index < kinds.length; index += 1) {
      const fraction = this.mode === 'drill' ? [0.18, 0.42, 0.66][index] : [0.25, 0.5, 0.75][index];
      const dueAt = startAt + (endAt - startAt) * fraction;
      await sleep(Math.max(0, dueAt - Date.now()));
      if (this.stopping) return;
      await this.runDrill(kinds[index]);
      const recoveryDeadline = Date.now() + 90_000;
      while (!this.stopping && this.pendingDrill && Date.now() < recoveryDeadline) {
        await sleep(1_000);
      }
      if (this.pendingDrill) {
        this.logger.event('drill-timeout', { drill: kinds[index] });
        this.pendingDrill = null;
      }
    }
  }

  async run() {
    if (!fs.existsSync(path.join(this.appDir, 'dist', 'index.html'))) {
      throw new Error('Production build is missing. Run npm run build first.');
    }
    if (!fs.existsSync(this.chromePath)) throw new Error(`Google Chrome not found at ${this.chromePath}`);
    fs.mkdirSync(this.supportDir, { recursive: true });
    this.caffeinate = spawn('/usr/bin/caffeinate', ['-dimsu', '-w', String(process.pid)], { stdio: 'ignore' });
    await this.startServer();
    await this.startChrome();
    const startAt = Date.now();
    const endAt = this.mode === 'start' ? Number.POSITIVE_INFINITY : startAt + this.durationMs;
    const simulation = this.testMode ? this.runSimulation(endAt) : Promise.resolve();
    const drills = this.testMode ? this.scheduleDrills(startAt, endAt) : Promise.resolve();
    let lastMetricsAt = 0;
    let lastScreenshotAt = 0;
    while (!this.stopping && Date.now() < endAt) {
      await this.monitorOnce();
      if (Date.now() - lastMetricsAt > 15_000) {
        lastMetricsAt = Date.now();
        await this.collectMetrics();
      }
      if (Date.now() - lastScreenshotAt > 5 * 60_000) {
        lastScreenshotAt = Date.now();
        await this.captureIncident('healthy');
      }
      await sleep(5_000);
    }
    this.stopping = true;
    await Promise.allSettled([simulation, drills]);
    await this.finish();
  }

  async finish() {
    if (this.finished) return;
    this.finished = true;
    this.stopping = true;
    this.summary.finishedAt = new Date().toISOString();
    this.summary.durationMinutes = Math.round((Date.parse(this.summary.finishedAt) - Date.parse(this.summary.startedAt)) / 600) / 100;
    this.summary.inputCount ||= 0;
    this.summary.randomizeCount ||= 0;
    this.summary.controlProbes ||= 0;
    this.summary.controlProbeFailures ||= 0;
    const drillsPassed = this.summary.drills.every(drill => Number.isFinite(drill.recoveredMs) && drill.recoveredMs <= 45_000);
    const controlsPassed = !this.testMode || (this.summary.controlProbes > 0 && this.summary.controlProbeFailures === 0);
    this.summary.passed = this.mode === 'start' || (this.summary.organicFailures === 0 && drillsPassed && controlsPassed);
    fs.writeFileSync(path.join(this.logger.runDir, 'summary.json'), JSON.stringify(this.summary, null, 2));
    fs.writeFileSync(path.join(this.logger.runDir, 'report.html'), buildReportHtml(this.summary));
    this.logger.event('run-finished', { passed: this.summary.passed, report: path.join(this.logger.runDir, 'report.html') });
    await this.stopChrome();
    await this.stopServer();
    if (this.caffeinate && this.caffeinate.exitCode == null) {
      this.caffeinate.kill('SIGTERM');
    }
  }
}

export const waitForEnter = async (question) => {
  if (!process.stdin.isTTY) return false;
  process.stdout.write(question);
  return new Promise(resolve => {
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', answer => resolve(/^y(es)?$/i.test(answer.trim())));
  });
};
