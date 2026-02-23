let ffmpegInstance = null;
let loadPromise = null;
let modulePromise = null;

const resolveModule = (mod) => {
  if (mod?.FFmpeg) {
    return mod;
  }
  if (mod?.default?.FFmpeg) {
    return mod.default;
  }
  return null;
};

const loadModule = async () => {
  if (!modulePromise) {
    modulePromise = (async () => {
      const candidate = await import('@ffmpeg/ffmpeg');
      const resolved = resolveModule(candidate);
      if (!resolved) {
        throw new Error('Failed to load @ffmpeg/ffmpeg module');
      }
      return resolved;
    })();
  }
  return modulePromise;
};

const ensureFFmpegLoaded = async () => {
  const mod = await loadModule();
  if (!ffmpegInstance) {
    ffmpegInstance = new mod.FFmpeg();
  }
  if (ffmpegInstance && !ffmpegInstance.loaded) {
    if (!loadPromise) {
      loadPromise = ffmpegInstance.load().catch((error) => {
        loadPromise = null;
        throw error;
      });
    }
    await loadPromise;
  }
  return ffmpegInstance;
};

const blobToUint8Array = async (input) => {
  if (input instanceof Uint8Array) {
    return input;
  }
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }
  if (typeof input?.arrayBuffer === 'function') {
    const buffer = await input.arrayBuffer();
    return new Uint8Array(buffer);
  }
  throw new TypeError('Unsupported input type for FFmpeg writeFile');
};

export const isMimeMp4H264 = (mime = '') => {
  const lower = mime.toLowerCase();
  return lower.includes('mp4') && (lower.includes('h264') || lower.includes('avc1'));
};

const buildConversionArgs = ({
  inputName,
  outputName,
  frameRate,
  preset,
}) => {
  const clampedFps = Number.isFinite(frameRate) && frameRate > 0 ? Math.round(frameRate) : 60;
  return [
    '-i', inputName,
    '-r', String(clampedFps),
    '-vsync', '1',
    '-c:v', 'libx264',
    '-preset', preset,
    '-pix_fmt', 'yuv420p',
    '-movflags', 'faststart',
    '-an',
    outputName,
  ];
};

export const convertRecordingToMp4 = async (
  blob,
  { frameRate, presets } = {},
) => {
  const ffmpeg = await ensureFFmpegLoaded();
  const inputName = 'input.webm';
  const outputName = 'output.mp4';
  const presetList = Array.isArray(presets) && presets.length
    ? presets
    : ['veryfast', 'slow'];

  await ffmpeg.writeFile(inputName, await blobToUint8Array(blob));

  let lastError = null;

  try {
    for (const preset of presetList) {
      const args = buildConversionArgs({
        inputName,
        outputName,
        frameRate,
        preset,
      });

      try {
        const result = await ffmpeg.exec(args);
        if (typeof result === 'number' && result !== 0) {
          throw new Error(`FFmpeg exited with code ${result}`);
        }
        const data = await ffmpeg.readFile(outputName);
        const mp4Blob = new Blob([data], { type: 'video/mp4' });
        return {
          blob: mp4Blob,
          mime: 'video/mp4',
          preset,
        };
      } catch (error) {
        lastError = error;
        try { await ffmpeg.deleteFile(outputName); } catch { /* noop */ }
      }
    }

    const error = new Error('All MP4 conversion presets failed');
    if (lastError) {
      error.cause = lastError;
    }
    throw error;
  } finally {
    try { await ffmpeg.deleteFile(inputName); } catch { /* noop */ }
    try { await ffmpeg.deleteFile(outputName); } catch { /* noop */ }
  }
};
