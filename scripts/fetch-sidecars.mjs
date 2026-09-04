#!/usr/bin/env node
/**
 * Downloads yt-dlp and a static ffmpeg for the current host and drops them
 * into src-tauri/binaries/ with the Rust target-triple suffix Tauri expects.
 *
 *   npm run sidecars                 # host platform
 *   node scripts/fetch-sidecars.mjs --triple aarch64-apple-darwin
 *
 * Sources (all official / long-lived release URLs):
 *   yt-dlp  → https://github.com/yt-dlp/yt-dlp/releases/latest
 *   ffmpeg  → Windows: BtbN GPL static build (github.com/BtbN/FFmpeg-Builds)
 *             macOS:   evermeet.cc static build
 *             Linux:   johnvansickle.com static build
 *   qjs     → QuickJS-NG (github.com/quickjs-ng/quickjs). yt-dlp needs a JS
 *             runtime to solve YouTube's player challenges; without one, formats
 *             go missing and extraction is deprecated. QuickJS-NG is ~2 MB.
 */
import { execSync } from "node:child_process";
import { copyFileSync, createWriteStream, existsSync, mkdirSync, readdirSync, rmSync, statSync, chmodSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "src-tauri", "binaries");
const tmp = path.join(os.tmpdir(), "grab-sidecars");
mkdirSync(outDir, { recursive: true });
mkdirSync(tmp, { recursive: true });

const argTriple = process.argv.includes("--triple")
  ? process.argv[process.argv.indexOf("--triple") + 1]
  : null;

function hostTriple() {
  if (argTriple) return argTriple;
  try {
    const out = execSync("rustc -vV", { encoding: "utf8" });
    const m = out.match(/host:\s*(\S+)/);
    if (m) return m[1];
  } catch {}
  const arch = os.arch() === "arm64" ? "aarch64" : "x86_64";
  if (process.platform === "win32") return `${arch}-pc-windows-msvc`;
  if (process.platform === "darwin") return `${arch}-apple-darwin`;
  return `${arch}-unknown-linux-gnu`;
}

const triple = hostTriple();
const isWin = triple.includes("windows");
const isMac = triple.includes("apple");
const isArm = triple.startsWith("aarch64");
const ext = isWin ? ".exe" : "";

async function download(url, dest) {
  console.log(`↓ ${url}`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
  return dest;
}

function findFile(dir, name) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(p, name);
      if (found) return found;
    } else if (entry.name === name) {
      return p;
    }
  }
  return null;
}

function install(src, name) {
  const dest = path.join(outDir, `${name}-${triple}${ext}`);
  if (existsSync(dest)) rmSync(dest);
  // copy + delete rather than rename: the temp dir is often on a different drive (EXDEV).
  copyFileSync(src, dest);
  rmSync(src, { force: true });
  if (!isWin) chmodSync(dest, 0o755);
  const mb = (statSync(dest).size / 1048576).toFixed(1);
  console.log(`✓ ${path.relative(root, dest)} (${mb} MB)`);
}

async function ytdlp() {
  const asset = isWin
    ? "yt-dlp.exe"
    : isMac
      ? "yt-dlp_macos"
      : isArm
        ? "yt-dlp_linux_aarch64"
        : "yt-dlp_linux";
  const file = await download(
    `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${asset}`,
    path.join(tmp, asset),
  );
  install(file, "yt-dlp");
}

async function ffmpeg() {
  const extractDir = path.join(tmp, "ffmpeg-extract");
  rmSync(extractDir, { recursive: true, force: true });
  mkdirSync(extractDir, { recursive: true });

  if (isWin) {
    const zip = await download(
      "https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip",
      path.join(tmp, "ffmpeg-win.zip"),
    );
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zip}' -DestinationPath '${extractDir}' -Force"`,
      { stdio: "inherit" },
    );
    install(findFile(extractDir, "ffmpeg.exe"), "ffmpeg");
  } else if (isMac) {
    const zip = await download("https://evermeet.cc/ffmpeg/getrelease/zip", path.join(tmp, "ffmpeg-mac.zip"));
    execSync(`unzip -o -q "${zip}" -d "${extractDir}"`, { stdio: "inherit" });
    install(findFile(extractDir, "ffmpeg"), "ffmpeg");
  } else {
    const arch = isArm ? "arm64" : "amd64";
    const tar = await download(
      `https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-${arch}-static.tar.xz`,
      path.join(tmp, "ffmpeg-linux.tar.xz"),
    );
    execSync(`tar -xJf "${tar}" -C "${extractDir}"`, { stdio: "inherit" });
    install(findFile(extractDir, "ffmpeg"), "ffmpeg");
  }
}

async function qjs() {
  const asset = isWin
    ? "qjs-windows-x86_64.exe"
    : isMac
      ? isArm
        ? "qjs-darwin-arm64"
        : "qjs-darwin-x86_64"
      : isArm
        ? "qjs-linux-aarch64"
        : "qjs-linux-x86_64";
  const file = await download(
    `https://github.com/quickjs-ng/quickjs/releases/latest/download/${asset}`,
    path.join(tmp, asset),
  );
  install(file, "qjs");
}

console.log(`Target triple: ${triple}`);
await ytdlp();
await ffmpeg();
await qjs();
console.log("Done. Sidecars are in src-tauri/binaries/.");
