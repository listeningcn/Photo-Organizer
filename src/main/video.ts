import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

import { parseProbe, type VideoMeta } from './video-meta';

/** Size of the frame grabbed for the thumbnail/preview; the image pool scales it down. */
const FRAME_SIZE = 2048;
const MAX_OUTPUT = 64 * 1024 * 1024;

/** Binaries can't run from inside app.asar; electron-builder unpacks them next to it. */
function unpacked(path: string | null | undefined): string {
  if (!path) throw new Error('ffmpeg is not available on this platform');
  return path.replace(`app.asar${pathSep(path)}`, `app.asar.unpacked${pathSep(path)}`);
}
const pathSep = (path: string) => (path.includes('\\') ? '\\' : '/');

const FFMPEG = () => unpacked(ffmpegPath);
const FFPROBE = () => unpacked(ffprobeStatic.path);

/**
 * Runs a bundled tool and collects stdout. Only local files are read: network protocols are
 * disabled, so a crafted file can't make ffmpeg fetch anything. Nothing is written to disk.
 */
function run(command: string, args: string[], signal?: AbortSignal): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      signal,
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });
    const chunks: Buffer[] = [];
    let size = 0;
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_OUTPUT) {
        child.kill();
        return;
      }
      chunks.push(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0 && size <= MAX_OUTPUT) resolve(Buffer.concat(chunks));
      else
        reject(new Error(`${command.includes('probe') ? 'ffprobe' : 'ffmpeg'} failed`));
    });
  });
}

const SAFE_INPUT = ['-protocol_whitelist', 'file'];

export async function probeVideo(file: string, signal?: AbortSignal): Promise<VideoMeta> {
  const output = await run(
    FFPROBE(),
    [
      '-v',
      'error',
      ...SAFE_INPUT,
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      file,
    ],
    signal
  );
  return parseProbe(JSON.parse(output.toString('utf8')));
}

/**
 * Grabs one frame as a JPEG (piped, never written to disk). Seeks a little in to skip
 * black fade-ins, falling back to the first frame for very short clips.
 */
export async function extractFrame(
  file: string,
  duration: number | null,
  signal?: AbortSignal
): Promise<Buffer> {
  const grab = (seconds: number) =>
    run(
      FFMPEG(),
      [
        '-v',
        'error',
        ...SAFE_INPUT,
        '-ss',
        seconds.toFixed(2),
        '-i',
        file,
        '-frames:v',
        '1',
        '-vf',
        `scale='min(${FRAME_SIZE},iw)':'min(${FRAME_SIZE},ih)':force_original_aspect_ratio=decrease`,
        '-f',
        'image2pipe',
        '-c:v',
        'mjpeg',
        '-q:v',
        '3',
        'pipe:1',
      ],
      signal
    );
  const seek = duration ? Math.min(1, duration / 10) : 0;
  const frame = await grab(seek);
  if (frame.length > 0 || seek === 0) return frame;
  return grab(0);
}
