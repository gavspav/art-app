let ffmpegInstance = null;
let loadPromise = null;
let modulePromise = null;
let createFFmpegRef = null;
let fetchFileRef = null;

const loadModule = async () => {
  if (!modulePromise) {
    modulePromise = import('@ffmpeg/ffmpeg');
  }
  const mod = await modulePromise;
  if (mod?.createFFmpeg && mod?.fetchFile) {
    return mod;
  }
  const fallback = mod?.default;
  if (fallback?.createFFmpeg && fallback?.fetchFile) {
    return fallback;
  }
  throw new Error('Failed to load @ffmpeg/ffmpeg module');
};

const ensureFFmpegLoaded = async () => {
  if (!createFFmpegRef || !fetchFileRef) {
    const mod = await loadModule();
    createFFmpegRef = mod.createFFmpeg;
    fetchFileRef = mod.fetchFile;
  }
  if (!ffmpegInstance) {
    ffmpegInstance = createFFmpegRef({ log: false });
  }
  if (ffmpegInstance && !ffmpegInstance.isLoaded()) {
    if (!loadPromise) {
      loadPromise = ffmpegInstance.load();
    }
    await loadPromise;
  }
  return ffmpegInstance;
};

export const isMimeMp4H264 = (mime = '') => {
  const lower = mime.toLowerCase();
  return lower.includes('mp4') && (lower.includes('h264') || lower.includes('avc1'));
};

export const convertRecordingToMp4 = async (blob, { frameRate } = {}) => {
  const ffmpeg = await ensureFFmpegLoaded();
  const inputName = 'input.webm';
  const outputName = 'output.mp4';

  ffmpeg.FS('writeFile', inputName, await fetchFileRef(blob));

  const args = ['-i', inputName, '-c:v', 'libx264', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-movflags', 'faststart', '-an'];
  if (typeof frameRate === 'number' && Number.isFinite(frameRate) && frameRate > 0) {
    args.push('-r', String(Math.round(frameRate)));
  }
  args.push(outputName);

  try {
    await ffmpeg.run(...args);
    const data = ffmpeg.FS('readFile', outputName);
    const mp4Blob = new Blob([data], { type: 'video/mp4' });
    return {
      blob: mp4Blob,
      mime: 'video/mp4',
    };
  } finally {
    try { ffmpeg.FS('unlink', inputName); } catch { /* noop */ }
    try { ffmpeg.FS('unlink', outputName); } catch { /* noop */ }
  }
};
