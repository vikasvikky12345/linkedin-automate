import { readFileSync, accessSync, copyFileSync, chmodSync, constants } from 'node:fs';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { videoHtml } from './lib.js';

// Steps the page's frame(t) and pipes each screenshot into ffmpeg: deterministic, no screen recording.
const FPS = 24;
export async function renderVideo(page, video) {
  const { default: ffmpegPath } = await import('ffmpeg-static'); // only loaded on runs that render a video
  let bin = ffmpegPath;
  try {
    accessSync(bin, constants.X_OK);
  } catch {
    bin = '/tmp/ffmpeg'; // in case the zip lost the exec bit
    copyFileSync(ffmpegPath, bin);
    chmodSync(bin, 0o755);
  }
  await page.setViewport({ width: 1080, height: 1350 });
  await page.setContent(videoHtml(video));
  const seconds = await page.evaluate(() => window.DURATION);
  const out = `/tmp/video-${Date.now()}.mp4`;
  // -g 48: a keyframe every 2 s keeps the file above LinkedIn's 75 KB minimum even when most frames are still.
  const ff = spawn(bin, ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-g', '48', '-movflags', '+faststart', out], { stdio: ['pipe', 'ignore', 'pipe'] });
  let log = '';
  ff.stderr.on('data', (d) => (log = (log + d).slice(-2000)));
  const done = once(ff, 'close');
  for (let i = 0; i < seconds * FPS; i++) {
    await page.evaluate((t) => window.frame(t), i / FPS);
    if (!ff.stdin.write(await page.screenshot({ type: 'jpeg', quality: 90 }))) await once(ff.stdin, 'drain');
  }
  ff.stdin.end();
  const [code] = await done;
  if (code !== 0) throw new Error(`ffmpeg exited ${code}: ${log}`);
  return readFileSync(out);
}
