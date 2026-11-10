// npm run record-video -- <slug | app URL> [--out <file.mp4> | --dir <folder>] [--skip-existing] [--engine obs|chrome] [--base <url>] [--size <W>x<H>] [--fps <n>] [--seconds <n>] [--listen]
// Records a song played from bar 1 with its YouTube video, as an MP4 for a private upload (ADR-0032, ADR-0033).
// The app is opened at the given size, YouTube and play through are chosen (every chunk once, the rests
// too, no repeats), the metronome is muted, Play is pressed, and the page's picture and sound, the
// video's included, are recorded until the song ends. Nothing is shown or heard meanwhile.
//   --engine   obs (default): OBS Studio renders the app in a browser source and records it with the
//              GPU's encoder (NVENC), every frame at a constant rate. Playwright drives the page in OBS
//              through its remote debugging port. OBS is started when it is not running.
//              chrome: headless Chrome records its own tab with MediaRecorder. Its encoder runs on the
//              CPU above 1080p and drops frames after key frames at 4K (ADR-0033).
//   --out      the MP4; default "<Artist> - <Title>.mp4" in --dir
//   --dir      the folder for the default name; default Videos/bass-guitar-sifu in the home folder
//   --skip-existing  do nothing when "<Artist> - <Title>.mp4" is already in --dir (for batches)
//   --base     the app; default the live site
//   --size     the page in pixels; default the primary screen's resolution (Windows), else 1920x1080
//   --fps      frames per second, default 60
//   --seconds  stop after this many seconds of playback (a short test)
//   --listen   also play the sound on this computer while recording
// The recording holds YouTube's audio and picture: keep it out of the repository (ADR-0011).
import { execFileSync, spawn } from 'node:child_process';
import { copyFileSync, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync, type WriteStream } from 'node:fs';
import { get as httpGet } from 'node:http';
import { get as httpsGet } from 'node:https';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium, type Browser, type Page } from '@playwright/test';
import { defragmentMp4 } from './lib/mp4';
import { Obs } from './lib/obs';

const DEFAULT_BASE = 'https://elsewhat.com/bass-guitar-sifu/';
const LEAD_IN_MS = 1000; // recorded before Play: the song at bar 1
const TAIL_MS = 2000; // recorded after the song stops
/** Chrome engine: a new recorder before this much output; Chrome's MP4 recorder crashes the tab just below 4 GiB. */
const SEGMENT_BYTES = Number(process.env.RECORD_SEGMENT_MB ?? 3072) * 2 ** 20; // smaller to test the join

// OBS engine. Its own profile and scene collection, so the owner's own OBS setup is left alone.
const OBS_EXE = process.env.OBS_EXE ?? 'C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe';
const OBS_CONFIG = process.platform === 'win32' ? join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'obs-studio') : process.platform === 'darwin' ? join(homedir(), 'Library', 'Application Support', 'obs-studio') : join(homedir(), '.config', 'obs-studio');
const OBS_DEBUG_PORT = Number(process.env.OBS_DEBUG_PORT ?? 9223);
const OBS_NAME = 'bass-guitar-sifu'; // profile and scene collection
const OBS_SCENE = 'Song';
const OBS_SOURCE = 'App';
const OBS_BLANK = 'data:text/html,<title>bass-guitar-sifu recorder</title><body style="background:#000">';
/**
 * The recording, in OBS's advanced output mode: AAC 320 kbit/s on track 1, and a hybrid MP4, which
 * is written so a crash still leaves a playable file and finished as an ordinary MP4.
 */
const OBS_OUTPUT: [string, string, string][] = [
  ['Output', 'Mode', 'Advanced'],
  ['AdvOut', 'RecType', 'Standard'],
  ['AdvOut', 'RecEncoder', 'obs_nvenc_h264_tex'],
  ['AdvOut', 'RecFormat2', 'hybrid_mp4'],
  ['AdvOut', 'RecTracks', '1'],
  ['AdvOut', 'RecAudioEncoder', 'ffmpeg_aac'],
  ['AdvOut', 'Track1Bitrate', '320'],
  ['AdvOut', 'RecUseRescale', 'false'],
  ['AdvOut', 'RecSplitFile', 'false'],
  ['Output', 'FilenameFormatting', 'bass-guitar-sifu %CCYY-%MM-%DD %hh-%mm-%ss'],
  ['Audio', 'SampleRate', '48000'],
  ['Audio', 'ChannelSetup', 'Stereo'],
];
/**
 * The video encoder (the profile's recordEncoder.json): H.264 on the GPU (NVENC), constant quality
 * (CQP 20), preset P4 with high-quality tuning, one pass, no look-ahead, a key frame every 2 s, 2
 * B-frames. P5 with two passes and look-ahead fell behind at 4K60 on an RTX 2080 Ti (ADR-0033).
 */
const OBS_ENCODER = { rate_control: 'CQP', cqp: 20, preset: 'p4', tune: 'hq', multipass: 'disabled', lookahead: false, profile: 'high', keyint_sec: 2, bf: 2 };

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: 'string' },
    dir: { type: 'string' },
    'skip-existing': { type: 'boolean' },
    engine: { type: 'string' },
    base: { type: 'string' },
    size: { type: 'string' },
    fps: { type: 'string' },
    seconds: { type: 'string' },
    listen: { type: 'boolean' },
  },
});

const target = positionals[0];
const engine = values.engine ?? 'obs';
if (!target || (engine !== 'obs' && engine !== 'chrome')) {
  console.error('Usage: npm run record-video -- <slug | app URL> [--out <file.mp4> | --dir <folder>] [--skip-existing] [--engine obs|chrome] [--base <url>] [--size <W>x<H>] [--fps <n>] [--seconds <n>] [--listen]');
  process.exit(1);
}

// A slug, or an app address with ?song=<slug>.
let base = values.base ?? DEFAULT_BASE;
let slug = target;
if (/^https?:\/\//.test(target)) {
  const url = new URL(target);
  slug = url.searchParams.get('song') ?? '';
  base = values.base ?? new URL('.', url).href;
  if (!slug) {
    console.error(`No ?song=<slug> in ${target}`);
    process.exit(1);
  }
}
if (!base.endsWith('/')) base += '/';

const size = values.size ? parseSize(values.size) : screenSize();
const fps = Number(values.fps ?? 60);
const limitMs = values.seconds ? Number(values.seconds) * 1000 : Infinity;
if (!size || !(fps > 0 && fps <= 120) || !(limitMs > 0)) {
  console.error('--size is <width>x<height>, --fps 1–120 and --seconds a positive number.');
  process.exit(1);
}

// The song's title, artist and length, from the app's own data.
const res = await getText(`${base}data/songs/${slug}.json`);
if (res.status !== 200) {
  console.error(`${base}data/songs/${slug}.json: ${res.status}`);
  process.exit(1);
}
const song = JSON.parse(res.text) as { title: string; artist: string; media: { youtube?: { videoId: string; sync: { bar: number; ms: number }[] } } };
const youtube = song.media.youtube;
if (!youtube?.videoId) {
  console.error(`${song.artist} – ${song.title} has no YouTube video.`);
  process.exit(1);
}
const expectedMs = youtube.sync.at(-1)?.ms ?? 0; // the last bar's start on the video

const dir = resolve(values.dir ?? join(homedir(), 'Videos', 'bass-guitar-sifu'));
const name = fileName(`${song.artist} - ${song.title}`);
if (!values.out && values['skip-existing'] && existsSync(join(dir, `${name}.mp4`))) {
  console.log(`Skipped: ${join(dir, `${name}.mp4`)} exists`);
  process.exit(0);
}
const out = resolve(values.out ?? freeName(dir, name, '.mp4'));
mkdirSync(dirname(out), { recursive: true });
const appOrigin = new URL(base).origin;
const appUrl = `${base}?song=${encodeURIComponent(slug)}`;

console.log(`${song.artist} – ${song.title} (${slug}), video ${youtube.videoId}, about ${clock(expectedMs)}`);
console.log(`${size.width}×${size.height} at ${fps} fps with ${engine === 'obs' ? 'OBS' : 'Chrome'} → ${out}`);

let stopRequested = false;
process.once('SIGINT', () => {
  console.log('\nStopping: the recording so far is kept.');
  stopRequested = true;
});

/** How a capture starts, reports its size, and stops. */
interface Capture {
  start(): Promise<void>;
  bytes(): Promise<number>;
  stop(): Promise<void>;
}

let failure: unknown = null;
let incomplete = false; // stopped before the song's end, other than by --seconds or Ctrl+C
const saveAs = () => (failure || incomplete ? out.replace(/\.mp4$/i, ' (incomplete).mp4') : out);

if (engine === 'obs') await recordWithObs();
else await recordWithChrome();
if (failure) console.error(failure instanceof Error ? failure.message : failure);
if (failure || incomplete) process.exitCode = 1;

/**
 * Sets up the app in a page before the capture: settings for play through and a silent metronome,
 * YouTube chosen, the player ready, nothing hovered or focused.
 */
async function preparePage(page: Page) {
  // tsx compiles the functions sent to the page with esbuild's `__name` helper, which the page lacks.
  await page.addInitScript({ content: 'globalThis.__name = (f) => f;' });
  // A fresh start of the song at bar 1 (ADR-0031). Play through, the video at full volume, the
  // metronome silent: the count-in is only seen.
  await page.addInitScript((origin) => {
    if (location.origin !== origin) return; // also runs in the YouTube frame
    const on = (volume: number) => ({ volume, muted: false });
    const off = (volume: number) => ({ volume, muted: true });
    localStorage.setItem(
      'bass-trainer:v1:settings',
      JSON.stringify({ repeatMode: 'once', mixer: { master: on(100), video: on(100), music: on(100), click: off(70), voice: off(100) } }),
    );
  }, appOrigin);
  page.on('pageerror', (e) => console.error(`Page error: ${e.message}`));
  await page.goto(appUrl);

  const youtubeButton = page.locator('section[aria-label="Video"] button', { hasText: /^YouTube$/ });
  await youtubeButton.waitFor();
  await page.getByText('Loading notation…').waitFor({ state: 'hidden', timeout: 60_000 });
  await youtubeButton.click();
  await page.locator('section[aria-label="Video"][data-source-status="ready"]').waitFor({ timeout: 60_000 });
  await expectEnabled(page.locator('button[aria-label="Play"]'));
  await page.mouse.move(0, 0); // nothing hovered in the recording
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.waitForTimeout(1500); // the player settles
}

/** Records the lead-in, presses Play and records until the song ends, plus the tail. */
async function playSong(page: Page, capture: Capture) {
  await capture.start();
  await page.waitForTimeout(LEAD_IN_MS);
  await page.keyboard.press('Space'); // Play (the transport shortcut), with the count-in
  await page.locator('button[aria-label="Pause"]').waitFor({ timeout: 10_000 });
  const t0 = Date.now();
  let lastReport = 0;
  let reason = 'the song ended';
  const capMs = expectedMs * 1.5 + 120_000; // never runs on forever if the end is missed

  while (true) {
    await page.waitForTimeout(500);
    const elapsed = Date.now() - t0;
    if (stopRequested) {
      reason = 'stopped';
      break;
    }
    if (elapsed >= limitMs) {
      reason = `--seconds ${values.seconds}`;
      break;
    }
    if (elapsed >= capMs) {
      reason = `no end after ${clock(elapsed)}`;
      incomplete = true;
      break;
    }
    const state = await page.evaluate(() => {
      const video = document.querySelector('section[aria-label="Video"]');
      return {
        playing: !!document.querySelector('button[aria-label="Pause"]'),
        status: video?.getAttribute('data-source-status'),
        message: (video as HTMLElement | null)?.innerText.replace(/\s+/g, ' ').trim() ?? '',
        step: ((el) => el?.getAttribute('aria-label') ?? el?.textContent ?? '')(document.querySelector('nav[aria-label="Practice plan"] [aria-current="step"]')),
      };
    });
    if (state.status === 'error') {
      reason = `the YouTube player reported an error: ${state.message || 'no message'}`;
      incomplete = true;
      break;
    }
    if (!state.playing) break;
    if (elapsed - lastReport >= 30_000) {
      lastReport = elapsed;
      console.log(`  ${clock(elapsed)}  ${state.step}  (${((await capture.bytes()) / 1e6).toFixed(0)} MB)`);
    }
  }

  const playedMs = Date.now() - t0;
  await page.waitForTimeout(TAIL_MS);
  await capture.stop();
  console.log(`Recorded (${reason}): ${clock(playedMs)} played, ${((await capture.bytes()) / 1e6).toFixed(1)} MB`);
}

/**
 * OBS: a browser source the size of the recording, its sound routed into OBS, the only sound
 * recorded. Playwright drives that page through OBS's remote debugging port.
 */
async function recordWithObs() {
  let obs: Obs | null = null;
  let browser: Browser | null = null;
  let page: Page | null = null;
  let recording = false;
  let outputPath = '';
  try {
    obs = await connectObs();
    const status = await obs.call<{ outputActive: boolean }>('GetRecordStatus');
    if (status.outputActive) throw new Error('OBS is already recording');
    await setUpObs(obs);

    browser = await chromium.connectOverCDP(`http://127.0.0.1:${OBS_DEBUG_PORT}`);
    page = await obsPage(browser, obs);
    await page.context().newCDPSession(page).then((s) => s.send('Storage.clearDataForOrigin', { origin: appOrigin, storageTypes: 'all' }));
    await preparePage(page);
    const app = page;

    const statsBefore = await obs.call<Record<string, number>>('GetStats');
    const live = obs;
    await playSong(app, {
      async start() {
        const started = live.next('RecordStateChanged', (d) => d.outputState === 'OBS_WEBSOCKET_OUTPUT_STARTED');
        await live.call('StartRecord');
        await started.catch(() => {
          throw new Error(`OBS did not start recording: see the dialog in OBS's window and its log in ${join(OBS_CONFIG, 'logs')}`);
        });
        recording = true;
        const v = await live.call<Record<string, number>>('GetVideoSettings');
        console.log(`Recording ${v.outputWidth}×${v.outputHeight} at ${v.fpsNumerator / v.fpsDenominator} fps in OBS`);
      },
      async bytes() {
        return recording || outputPath ? ((await live.call<{ outputBytes: number }>('GetRecordStatus')).outputBytes ?? 0) : 0;
      },
      async stop() {
        const stopped = live.next('RecordStateChanged', (d) => d.outputState === 'OBS_WEBSOCKET_OUTPUT_STOPPED', 120_000);
        const r = await live.call<{ outputPath: string }>('StopRecord');
        outputPath = String((await stopped).outputPath ?? r.outputPath);
        recording = false;
      },
    });
    const stats = await obs.call<Record<string, number>>('GetStats');
    const rendered = stats.renderTotalFrames - statsBefore.renderTotalFrames;
    const missed = stats.renderSkippedFrames - statsBefore.renderSkippedFrames;
    const skipped = stats.outputSkippedFrames - statsBefore.outputSkippedFrames;
    console.log(`OBS: ${rendered} frames rendered, ${missed} missed by the renderer, ${skipped} skipped by the encoder`);
  } catch (e) {
    failure = e;
    if (obs && recording) {
      const r = await obs.call<{ outputPath: string }>('StopRecord').catch(() => null);
      if (r?.outputPath) outputPath = r.outputPath;
    }
  } finally {
    // The source goes back to a blank page, so nothing plays on in OBS. OBS keeps running.
    await page?.goto(OBS_BLANK).catch(() => undefined);
    // Only disconnects: closing the browser over CDP would close OBS's browser.
    await browser?.close().catch(() => undefined);
    await obs?.close().catch(() => undefined);
  }
  if (!outputPath || !existsSync(outputPath)) return;
  const to = saveAs();
  try {
    renameSync(outputPath, to);
  } catch {
    copyFileSync(outputPath, to); // another drive
    rmSync(outputPath);
  }
  console.log(`Saved ${to}`);
}

/** Connects to OBS's websocket server, starting OBS with remote debugging when it is not running. */
async function connectObs(): Promise<Obs> {
  const configPath = join(OBS_CONFIG, 'plugin_config', 'obs-websocket', 'config.json');
  const readConfig = () => (existsSync(configPath) ? (JSON.parse(readFileSync(configPath, 'utf8')) as { server_enabled?: boolean; server_port?: number; auth_required?: boolean; server_password?: string }) : null);
  let config = readConfig();
  const url = () => `ws://127.0.0.1:${config?.server_port ?? 4455}`;
  try {
    const obs = await Obs.connect(url(), config?.auth_required === false ? undefined : config?.server_password);
    await ensureDebugPort();
    return obs;
  } catch (e) {
    if (obsRunning()) {
      if (e instanceof Error && /remote debugging/.test(e.message)) throw e;
      throw new Error(`OBS is running but its WebSocket server does not answer at ${url()}: turn it on in Tools → WebSocket Server Settings, or close OBS and run this again.`);
    }
  }
  // Not running: switch its WebSocket server on and start it, minimised to the tray.
  if (!existsSync(OBS_EXE)) throw new Error(`OBS is not installed at ${OBS_EXE} (set OBS_EXE), or record with --engine chrome.`);
  if (config && !config.server_enabled) {
    writeFileSync(configPath, JSON.stringify({ ...config, server_enabled: true }, null, 2));
    console.log('Switched on OBS\'s WebSocket server (Tools → WebSocket Server Settings).');
  }
  console.log('Starting OBS…');
  spawn(OBS_EXE, ['--minimize-to-tray', '--disable-shutdown-check', '--disable-updater', `--remote-debugging-port=${OBS_DEBUG_PORT}`], { cwd: dirname(OBS_EXE), detached: true, stdio: 'ignore' }).unref();
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    config = readConfig();
    if (!config?.server_enabled) continue; // the first start writes the config
    try {
      return await Obs.connect(url(), config.auth_required === false ? undefined : config.server_password);
    } catch {
      // not up yet
    }
  }
  throw new Error('OBS started but its WebSocket server did not answer within a minute.');
}

/** OBS's browser answers on the remote debugging port once a browser source exists. */
async function ensureDebugPort() {
  const ok = await getText(`http://127.0.0.1:${OBS_DEBUG_PORT}/json/version`).then((r) => r.status === 200, () => false);
  if (ok) return;
  // OBS may have no browser source yet; the port opens with the first one, which setUpObs creates.
  if (!obsStartedWithDebugPort()) throw new Error(`OBS is running without remote debugging. Close OBS and run this again: it starts OBS with --remote-debugging-port=${OBS_DEBUG_PORT}.`);
}

function obsRunning(): boolean {
  if (process.platform !== 'win32') return false;
  return execFileSync('tasklist', ['/FI', 'IMAGENAME eq obs64.exe', '/NH'], { encoding: 'utf8' }).includes('obs64.exe');
}

function obsStartedWithDebugPort(): boolean {
  if (process.platform !== 'win32') return true;
  const text = execFileSync('powershell.exe', ['-NoProfile', '-Command', "(Get-CimInstance Win32_Process -Filter \"Name='obs64.exe'\").CommandLine"], { encoding: 'utf8' });
  return text.includes(`--remote-debugging-port=${OBS_DEBUG_PORT}`);
}

/**
 * The recorder's own profile and scene collection: the output, the canvas at the recording's size
 * and frame rate, one scene with the browser source, every other sound muted.
 */
async function setUpObs(obs: Obs) {
  // Switching is asynchronous: wait until OBS reports the new profile or collection as current.
  type Profiles = { currentProfileName: string; profiles: string[] };
  const useProfile = async (profileName: string, create = false) => {
    await obs.call(create ? 'CreateProfile' : 'SetCurrentProfile', { profileName });
    await until(async () => (await obs.call<Profiles>('GetProfileList')).currentProfileName === profileName, `the OBS profile ${profileName}`);
  };
  let profiles = await obs.call<Profiles>('GetProfileList');
  if (!profiles.profiles.includes(OBS_NAME)) await useProfile(OBS_NAME, true);
  else if (profiles.currentProfileName !== OBS_NAME) await useProfile(OBS_NAME);
  for (const [parameterCategory, parameterName, parameterValue] of OBS_OUTPUT) await obs.call('SetProfileParameter', { parameterCategory, parameterName, parameterValue });
  // The encoder's settings are a file in the profile's folder. OBS reads it, and the output mode,
  // when it loads the profile: so the profile is loaded again, by way of another one.
  writeFileSync(join(obsProfileDir(OBS_NAME), 'recordEncoder.json'), JSON.stringify(OBS_ENCODER));
  profiles = await obs.call<Profiles>('GetProfileList');
  const other = profiles.profiles.find((p) => p !== OBS_NAME);
  if (other) await useProfile(other);
  else await useProfile(`${OBS_NAME} (spare)`, true);
  await useProfile(OBS_NAME);
  await obs.call('SetRecordDirectory', { recordDirectory: dirname(out) });

  type Collections = { currentSceneCollectionName: string; sceneCollections: string[] };
  const collections = await obs.call<Collections>('GetSceneCollectionList');
  if (collections.currentSceneCollectionName !== OBS_NAME) {
    await obs.call(collections.sceneCollections.includes(OBS_NAME) ? 'SetCurrentSceneCollection' : 'CreateSceneCollection', { sceneCollectionName: OBS_NAME });
    await until(async () => (await obs.call<Collections>('GetSceneCollectionList')).currentSceneCollectionName === OBS_NAME, `the OBS scene collection ${OBS_NAME}`);
  }

  await obs.call('SetVideoSettings', { baseWidth: size!.width, baseHeight: size!.height, outputWidth: size!.width, outputHeight: size!.height, fpsNumerator: fps, fpsDenominator: 1 });

  const scenes = await obs.call<{ scenes: { sceneName: string }[] }>('GetSceneList');
  if (!scenes.scenes.some((s) => s.sceneName === OBS_SCENE)) await obs.call('CreateScene', { sceneName: OBS_SCENE });
  await obs.call('SetCurrentProgramScene', { sceneName: OBS_SCENE });

  const inputSettings = {
    // A new URL each run: Playwright navigates the page, not OBS, so OBS would not reload the same one.
    url: `${OBS_BLANK}<!-- ${Date.now()} -->`,
    width: size!.width,
    height: size!.height,
    fps_custom: true,
    fps,
    reroute_audio: true, // the page's sound goes to OBS, not to the speakers
    shutdown: false,
    restart_when_active: false,
    css: '',
  };
  const inputs = await obs.call<{ inputs: { inputName: string; inputKind: string }[] }>('GetInputList');
  if (inputs.inputs.some((i) => i.inputName === OBS_SOURCE)) await obs.call('SetInputSettings', { inputName: OBS_SOURCE, inputSettings });
  else await obs.call('CreateInput', { sceneName: OBS_SCENE, inputName: OBS_SOURCE, inputKind: 'browser_source', inputSettings });
  // The source fills the canvas.
  const { sceneItemId } = await obs.call<{ sceneItemId: number }>('GetSceneItemId', { sceneName: OBS_SCENE, sourceName: OBS_SOURCE });
  await obs.call('SetSceneItemTransform', { sceneName: OBS_SCENE, sceneItemId, sceneItemTransform: { positionX: 0, positionY: 0, scaleX: 1, scaleY: 1, rotation: 0, boundsType: 'OBS_BOUNDS_NONE', cropLeft: 0, cropRight: 0, cropTop: 0, cropBottom: 0 } });
  await obs.call('SetInputMute', { inputName: OBS_SOURCE, inputMuted: false });
  await obs.call('SetInputVolume', { inputName: OBS_SOURCE, inputVolumeDb: 0 });
  await obs.call('SetInputAudioMonitorType', { inputName: OBS_SOURCE, monitorType: values.listen ? 'OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT' : 'OBS_MONITORING_TYPE_NONE' });
  // Desktop sound, microphones and any other source stay out of the recording.
  for (const i of inputs.inputs) if (i.inputName !== OBS_SOURCE) await obs.call('SetInputMute', { inputName: i.inputName, inputMuted: true }).catch(() => undefined);
}

/** The folder of an OBS profile: the one whose basic.ini has that name. */
function obsProfileDir(name: string): string {
  const root = join(OBS_CONFIG, 'basic', 'profiles');
  for (const entry of readdirSync(root)) {
    const ini = join(root, entry, 'basic.ini');
    if (existsSync(ini) && new RegExp(`^Name=${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm').test(readFileSync(ini, 'utf8').replace(/^﻿/, ''))) return join(root, entry);
  }
  throw new Error(`No folder for the OBS profile ${name} in ${root}`);
}

async function until(test: () => Promise<boolean>, what: string, timeoutMs = 15_000) {
  for (const end = Date.now() + timeoutMs; Date.now() < end; await new Promise((r) => setTimeout(r, 250))) if (await test()) return;
  throw new Error(`OBS did not switch to ${what}`);
}

/**
 * The browser source's page, found by its blank URL. Now and then (9 songs in a row, 2026-11-09)
 * OBS does not load the new URL; the source is then given a fresh URL, and then hidden and shown
 * again so OBS makes a new browser, before giving up.
 */
async function obsPage(browser: Browser, obs: Obs): Promise<Page> {
  const seen = new Set<string>();
  for (let round = 0; round < 3; round++) {
    if (round > 0) {
      console.log(`OBS's browser source did not load its page; ${round === 1 ? 'giving it a fresh URL' : 'hiding and showing it'}`);
      await obs.call('SetInputSettings', { inputName: OBS_SOURCE, inputSettings: { url: `${OBS_BLANK}<!-- ${Date.now()} -->` } });
      if (round === 2) {
        const { sceneItemId } = await obs.call<{ sceneItemId: number }>('GetSceneItemId', { sceneName: OBS_SCENE, sourceName: OBS_SOURCE });
        await obs.call('SetSceneItemEnabled', { sceneName: OBS_SCENE, sceneItemId, sceneItemEnabled: false });
        await new Promise((r) => setTimeout(r, 1000));
        await obs.call('SetSceneItemEnabled', { sceneName: OBS_SCENE, sceneItemId, sceneItemEnabled: true });
      }
    }
    for (let i = 0; i < 40; i++) {
      for (const context of browser.contexts())
        for (const page of context.pages()) {
          seen.add(page.url().slice(0, 80));
          if (page.url().startsWith('data:text/html') && (await page.title().catch(() => '')) === 'bass-guitar-sifu recorder') return page;
        }
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`OBS's browser source "${OBS_SOURCE}" did not show up on the remote debugging port ${OBS_DEBUG_PORT} (pages seen: ${[...seen].join(', ') || 'none'})`);
}

/**
 * Chrome: headless Chrome records its own tab (getDisplayMedia with preferCurrentTab) through
 * MediaRecorder, one chunk a second, in segments joined afterwards (ADR-0032).
 */
async function recordWithChrome() {
  const part = `${out}.part`;
  // Bit rates: about 12 Mbit/s at 1080p60 (YouTube's upload recommendation), scaled by pixels and frames.
  const videoBps = Math.round(size!.width * size!.height * fps * 0.1);
  const audioBps = 256_000;

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    // Playwright mutes headless Chrome; the tab's audio is what is recorded.
    ignoreDefaultArgs: ['--mute-audio'],
    args: ['--auto-accept-this-tab-capture', '--autoplay-policy=no-user-gesture-required'],
    handleSIGINT: false, // Ctrl+C stops the recording below instead of closing Chrome
  });

  // One file per segment: <out>.part, <out>.part2, …
  const parts: string[] = [];
  const files: WriteStream[] = [];
  const segmentFile = (segment: number) => {
    while (files.length <= segment) {
      const n = files.length;
      parts.push(n ? `${part}${n + 1}` : part);
      files.push(createWriteStream(parts[n]!));
    }
    return files[segment]!;
  };
  let bytes = 0;

  try {
    const context = await browser.newContext({ viewport: size!, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.exposeBinding('__recordChunk', (_source, b64: string, segment: number) => {
      const buf = Buffer.from(b64, 'base64');
      bytes += buf.length;
      const file = segmentFile(segment);
      return new Promise<void>((done, fail) => file.write(buf, (e) => (e ? fail(e) : done())));
    });
    await preparePage(page);
    await playSong(page, {
      async start() {
        const started = await page.evaluate(startRecording, { fps, width: size!.width, height: size!.height, videoBps, audioBps, segmentBytes: SEGMENT_BYTES, listen: !!values.listen });
        console.log(`Recording ${started.width}×${started.height} at ${started.frameRate} fps, ${started.mimeType}, audio ${started.channels} ch ${started.sampleRate} Hz`);
      },
      bytes: async () => bytes,
      stop: () => page.evaluate(() => (window as unknown as { __stopRecording: () => Promise<void> }).__stopRecording()),
    });
  } catch (e) {
    failure = e;
  } finally {
    await browser.close().catch(() => undefined);
    await Promise.all(files.map((f) => new Promise<void>((done) => f.end(done))));
  }

  // Whatever was recorded is kept, also after a failure. Chrome's MP4 is fragmented, with no length
  // in its header; it is rewritten as an ordinary MP4 (ADR-0032). Segments (a recording past
  // SEGMENT_BYTES) are joined into one file. A recording cut short by a failure, a YouTube error or
  // a missed end is saved as "<name> (incomplete).mp4", so --skip-existing records it again.
  const to = saveAs();
  if (bytes === 0) for (const p of parts) rmSync(p, { force: true });
  else {
    try {
      const flat = defragmentMp4(parts, to);
      if (flat) for (const p of parts) rmSync(p);
      else renameSync(part, to);
      const video = flat?.tracks.find((t) => t.handler === 'vide');
      const joined = parts.length > 1 ? `, ${parts.length} segments joined` : '';
      console.log(`Saved ${to}${video ? ` (${clock(video.seconds * 1000)}, ${(video.samples / video.seconds).toFixed(1)} fps on average${joined})` : ''}`);
    } catch (e) {
      // Chrome's fragmented MP4, which YouTube also takes: one file per segment.
      const kept = parts.map((p, i) => {
        const file = parts.length > 1 ? to.replace(/\.mp4$/i, ` (part ${i + 1}).mp4`) : to;
        renameSync(p, file);
        return file;
      });
      console.warn(`Could not rewrite the MP4 (${String(e)}). Kept Chrome's fragmented MP4: ${kept.join(', ')}`);
    }
  }
}

/**
 * Runs in the page: records the tab itself (getDisplayMedia with preferCurrentTab, accepted by
 * --auto-accept-this-tab-capture) through MediaRecorder, one chunk a second to __recordChunk, in a
 * new segment before `segmentBytes`.
 */
async function startRecording(o: { fps: number; width: number; height: number; videoBps: number; audioBps: number; segmentBytes: number; listen: boolean }) {
  const w = window as unknown as { __recordChunk: (b64: string, segment: number) => Promise<void>; __stopRecording: () => Promise<void> };
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: { ideal: o.fps, max: o.fps }, width: { ideal: o.width }, height: { ideal: o.height } },
    // The tab's sound as it is: stereo, no echo cancelling, noise suppression or gain control.
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2, suppressLocalAudioPlayback: !o.listen },
    preferCurrentTab: true,
    selfBrowserSurface: 'include',
  } as DisplayMediaStreamOptions);
  // H.264 High profile at a level that holds the size and frame rate (4.0, 4.2, 5.1 or 5.2).
  const rate = o.width * o.height * o.fps;
  const level = rate <= 1920 * 1088 * 30 ? '28' : rate <= 1920 * 1088 * 60 ? '2A' : rate <= 4096 * 2304 * 30 ? '33' : '34';
  const mimeType = [`video/mp4;codecs=avc1.6400${level},mp4a.40.2`, 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4'].find((t) => MediaRecorder.isTypeSupported(t));
  if (!mimeType) throw new Error('This Chrome cannot record MP4');
  let queue = Promise.resolve();
  const send = (blob: Blob, segment: number) =>
    new Promise<string>((done, fail) => {
      const reader = new FileReader();
      // "data:<type>;base64,<data>"; the type has a comma of its own (avc1…,mp4a…).
      reader.onload = () => done(String(reader.result).split(';base64,')[1] ?? '');
      reader.onerror = () => fail(reader.error);
      reader.readAsDataURL(blob);
    }).then((b64) => w.__recordChunk(b64, segment));
  // Chrome's MP4 recorder crashes the tab just before 4 GiB of output. Before that a new recorder
  // takes over at once, into a new segment file; the segments are joined afterwards.
  let recorder: MediaRecorder;
  const stopped: Promise<void>[] = [];
  const begin = (segment: number) => {
    const r = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: o.videoBps, audioBitsPerSecond: o.audioBps });
    let bytes = 0;
    r.ondataavailable = (e) => {
      if (!e.data.size) return;
      queue = queue.then(() => send(e.data, segment));
      bytes += e.data.size;
      if (bytes >= o.segmentBytes && r === recorder && r.state === 'recording') {
        begin(segment + 1);
        r.stop();
      }
    };
    stopped.push(new Promise<void>((done) => r.addEventListener('stop', () => done(), { once: true })));
    r.start(1000);
    recorder = r;
  };
  w.__stopRecording = async () => {
    if (recorder.state !== 'inactive') recorder.stop();
    await Promise.all(stopped);
    await queue;
    for (const t of stream.getTracks()) t.stop();
  };
  begin(0);
  const v = stream.getVideoTracks()[0]!.getSettings();
  const a = stream.getAudioTracks()[0]?.getSettings();
  return { mimeType, width: v.width, height: v.height, frameRate: v.frameRate, channels: a?.channelCount ?? 0, sampleRate: a?.sampleRate ?? 0 };
}

async function expectEnabled(locator: import('@playwright/test').Locator) {
  await locator.waitFor();
  for (let i = 0; i < 120 && (await locator.isDisabled()); i++) await new Promise((r) => setTimeout(r, 500));
  if (await locator.isDisabled()) throw new Error('Play stayed disabled: the video did not get ready');
}

/**
 * GET with node:http(s), following redirects. Not fetch: on Windows, Node 24 fails an assertion in
 * libuv at process.exit after a fetch and exits with a crash code, also for a skipped song.
 */
function getText(url: string, redirects = 5): Promise<{ status: number; text: string }> {
  return new Promise((done, fail) => {
    const get = url.startsWith('https:') ? httpsGet : httpGet;
    get(url, (r) => {
      const status = r.statusCode ?? 0;
      if (status >= 300 && status < 400 && r.headers.location && redirects > 0) {
        r.resume();
        getText(new URL(r.headers.location, url).href, redirects - 1).then(done, fail);
        return;
      }
      let text = '';
      r.setEncoding('utf8');
      r.on('data', (c: string) => (text += c));
      r.on('end', () => done({ status, text }));
      r.on('error', fail);
    }).on('error', fail);
  });
}

function parseSize(text: string): { width: number; height: number } | null {
  const m = /^(\d{3,5})x(\d{3,5})$/.exec(text);
  return m ? { width: Number(m[1]), height: Number(m[2]) } : null;
}

/** The primary screen's resolution in pixels on Windows, else 1920×1080. */
function screenSize(): { width: number; height: number } {
  if (process.platform === 'win32') {
    try {
      const text = execFileSync(
        'powershell.exe',
        ['-NoProfile', '-Command', '$v = Get-CimInstance Win32_VideoController | Where-Object CurrentHorizontalResolution | Select-Object -First 1; "$($v.CurrentHorizontalResolution)x$($v.CurrentVerticalResolution)"'],
        { encoding: 'utf8' },
      ).trim();
      const size = parseSize(text);
      if (size) return size;
    } catch {
      // fall through
    }
  }
  return { width: 1920, height: 1080 };
}

/** A name Windows and YouTube accept: no path or reserved characters. */
function fileName(text: string): string {
  return text.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim();
}

/** `<dir>/<name><ext>`, or `<name> (2)<ext>` and on when it exists. */
function freeName(dir: string, name: string, ext: string): string {
  for (let i = 1; ; i++) {
    const path = join(dir, i === 1 ? `${name}${ext}` : `${name} (${i})${ext}`);
    if (!existsSync(path) && !existsSync(`${path}.part`)) return path;
  }
}

function clock(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
