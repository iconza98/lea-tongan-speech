/** Transcode a raw contribution to the canonical corpus format: 24 kHz mono FLAC (docs/adr/0001).
 *  Uses the bundled static ffmpeg/ffprobe binaries — same approach as the app's accept pipeline. */
import { spawn } from "child_process";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

export interface CanonicalAudio {
  durationMs: number;
  bytes: number;
  sampleRate: number; // 24000
  channels: number;   // 1
  codec: string;      // "flac"
}

function run(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args);
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d));
    proc.stderr.on("data", (d) => (stderr += d));
    proc.on("error", reject);
    proc.on("close", (code) =>
      code === 0 ? resolve(stdout) : reject(new Error(`${bin} exited ${code}: ${stderr.slice(-500)}`))
    );
  });
}

/** Transcode `inputPath` → `outputPath` as 24 kHz mono 16-bit FLAC. */
export async function transcodeToFlac(inputPath: string, outputPath: string): Promise<void> {
  if (!ffmpegPath) throw new Error("ffmpeg-static binary not found");
  await run(ffmpegPath, [
    "-y",
    "-i", inputPath,
    "-ac", "1",            // mono
    "-ar", "24000",        // 24 kHz
    "-sample_fmt", "s16",  // 16-bit
    "-c:a", "flac",
    outputPath,
  ]);
}

/** Probe an audio file for its duration in milliseconds. */
export async function probeDurationMs(path: string): Promise<number> {
  const out = await run(ffprobeStatic.path, [
    "-v", "quiet",
    "-print_format", "json",
    "-show_format",
    path,
  ]);
  const dur = Number(JSON.parse(out)?.format?.duration);
  return Number.isFinite(dur) ? Math.round(dur * 1000) : 0;
}
