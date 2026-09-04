#!/usr/bin/env node
/**
 * Exercises the exact yt-dlp invocation Grab's Rust backend builds — progress
 * templates, postprocess hooks, after_move print, bundled ffmpeg + QuickJS —
 * without compiling the Rust side. Spawning from Node uses the same argv
 * quoting rules as Rust's std::process::Command, so embedded quotes in the
 * templates survive (they do NOT survive PowerShell 5.1).
 *
 *   node scripts/smoke-ytdlp.mjs                 # audio mp3 of a tiny test video
 *   node scripts/smoke-ytdlp.mjs <url> [video]   # any url; "video" = 360p mp4 merge
 *
 * Exit code is non-zero if any GRAB_DL / GRAB_PP line fails to parse as JSON.
 */
import { spawn, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const url = process.argv[2] || "https://www.youtube.com/watch?v=jNQXAC9IVRw";
const video = process.argv[3] === "video";

function triple() {
  try {
    return execSync("rustc -vV", { encoding: "utf8" }).match(/host:\s*(\S+)/)[1];
  } catch {
    const arch = os.arch() === "arm64" ? "aarch64" : "x86_64";
    return process.platform === "win32" ? `${arch}-pc-windows-msvc` : process.platform === "darwin" ? `${arch}-apple-darwin` : `${arch}-unknown-linux-gnu`;
  }
}
const t = triple();
const ext = t.includes("windows") ? ".exe" : "";
const bin = (n) => path.join(root, "src-tauri", "binaries", `${n}-${t}${ext}`);
for (const n of ["yt-dlp", "ffmpeg", "qjs"]) {
  if (!existsSync(bin(n))) {
    console.error(`missing sidecar ${bin(n)} — run: npm run sidecars`);
    process.exit(2);
  }
}

const out = path.join(os.tmpdir(), "grab-smoke");
// Keep these in sync with src-tauri/src/progress.rs.
const dl =
  'download:GRAB_DL:{"status":%(progress.status)j,"downloaded":%(progress.downloaded_bytes|null)j,"total":%(progress.total_bytes|null)j,"totalEstimate":%(progress.total_bytes_estimate|null)j,"speed":%(progress.speed|null)j,"eta":%(progress.eta|null)j,"elapsed":%(progress.elapsed|null)j,"filename":%(progress.filename|null)j,"fragIndex":%(progress.fragment_index|null)j,"fragCount":%(progress.fragment_count|null)j}';
const pp = 'postprocess:GRAB_PP:{"status":%(progress.status)j,"postprocessor":%(progress.postprocessor)j}';

const args = [
  "--newline", "--no-colors", "--progress", "--no-simulate", "--ignore-config", "--no-playlist",
  "--continue", "--no-overwrites", "--retries", "5", "--fragment-retries", "10",
  "--progress-template", dl, "--progress-template", pp,
  "--print", "after_move:GRAB_FILE:%(filepath)j",
  "-P", out, "-o", "%(title)s [%(id)s].%(ext)s",
  "--ffmpeg-location", bin("ffmpeg"),
  "--js-runtimes", `quickjs:${bin("qjs")}`,
  ...(video
    ? ["-f", "bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=360]+bestaudio/best[height<=360]/best", "--merge-output-format", "mp4", "--embed-thumbnail", "--embed-metadata"]
    : ["-f", "bestaudio/best", "-x", "--audio-format", "mp3"]),
  "--", url,
];

const started = Date.now();
const p = spawn(bin("yt-dlp"), args, { env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" } });
let buf = "";
const lines = [];
const collect = (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    lines.push(buf.slice(0, i).replace(/\r$/, ""));
    buf = buf.slice(i + 1);
  }
};
p.stdout.on("data", collect);
p.stderr.on("data", collect);
p.on("close", (code) => {
  const dls = lines.filter((l) => l.startsWith("GRAB_DL:"));
  const pps = lines.filter((l) => l.startsWith("GRAB_PP:"));
  const files = lines.filter((l) => l.startsWith("GRAB_FILE:"));
  const other = lines.filter((l) => !/^GRAB_/.test(l));
  let failed = 0;
  for (const l of [...dls, ...pps]) {
    try {
      JSON.parse(l.slice(l.indexOf(":") + 1));
    } catch {
      failed++;
      console.error("UNPARSEABLE:", l.slice(0, 200));
    }
  }
  console.log(`exit=${code}  ${((Date.now() - started) / 1000).toFixed(1)}s  progress=${dls.length} postprocess=${pps.length} unparseable=${failed}`);
  console.log("final:", files[0] ?? "(no GRAB_FILE line)");
  if (other.length) console.log("other output:\n  " + other.slice(0, 10).join("\n  "));
  process.exit(code !== 0 || failed || !files.length ? 1 : 0);
});
