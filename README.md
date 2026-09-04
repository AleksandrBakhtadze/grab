# Grab

A calm, dense desktop media downloader. Tauri v2 (Rust) + React 18 + TypeScript,
with yt-dlp and ffmpeg bundled as sidecars. Paste links, pick a quality, watch
the queue fill your Downloads folder.

> Grab is intended for content you own, content licensed for reuse, or content
> you have permission to download. Downloading may violate the terms of service
> of the source platform. You are responsible for how you use it.

---

## Layout

```
.
├── src/                      React frontend
│   ├── components/           UI (queue, history, settings, composer, titlebar…)
│   ├── components/ui/        shadcn/ui primitives (button, dialog, select…)
│   ├── stores/               Zustand: queue (scheduler), settings, history, ui
│   ├── lib/                  tauri bridge, SQLite repos, platform detection, motion presets
│   └── hooks/                clipboard watch, drag-drop, keyboard shortcuts
├── src-tauri/
│   ├── src/commands/         fetch_metadata · start_download · pause/cancel/get_queue · system
│   ├── src/progress.rs       yt-dlp line parser (+ the exact --progress-template strings)
│   ├── src/errors.rs         stderr → friendly error mapping
│   ├── binaries/             yt-dlp + ffmpeg sidecars (downloaded, not committed)
│   ├── capabilities/         Tauri v2 permission scopes (incl. sidecar shell scope)
│   ├── migrations/           SQLite schema (jobs + history)
│   ├── tauri.conf.json       Windows-first config (NSIS + MSI, WebView2 bootstrapper)
│   ├── tauri.macos.conf.json overlay titlebar + app/dmg targets
│   └── tauri.linux.conf.json deb/appimage targets
├── scripts/fetch-sidecars.mjs
└── .github/workflows/build-windows.yml
```

### How a download flows

1. Frontend calls `fetch_metadata` (yt-dlp `--dump-single-json --flat-playlist`) and shows a preview
   with shimmer skeletons sized identically to the final layout.
2. On "Add to queue" each item (or each ticked playlist entry) becomes a job row in SQLite.
3. The Zustand queue store is the scheduler: it keeps ≤ *concurrency* jobs running and calls
   `start_download` for the next queued one.
4. Rust spawns the yt-dlp sidecar with `--newline --progress-template …` so every progress tick is
   one JSON line. Each line is parsed and emitted as a Tauri event (`download://progress`), and the
   process exit becomes a single `download://state` event (completed / failed / paused / canceled).
   Nothing is polled.
5. Pause = kill the process, keep the `.part` file. Resume = spawn again; yt-dlp's `--continue`
   picks up where it left off. This is the only approach that behaves identically on all three OSes
   and survives an app restart.
6. stderr is mapped in `errors.rs`: private video, members-only, bot check, age gate, region block,
   429, 404, ffmpeg missing, disk full, network, 403, broken extractor… each with a suggested fix.

---

## Prerequisites (Windows)

| Tool | Why | Install |
| --- | --- | --- |
| **Node.js 20+** | Vite / React build | https://nodejs.org |
| **Rust (stable, MSVC)** | Tauri backend | `winget install Rustlang.Rustup` then `rustup default stable-msvc` |
| **Visual Studio Build Tools 2022** with the **"Desktop development with C++"** workload | MSVC linker (`link.exe`) — Rust cannot link without it | `winget install Microsoft.VisualStudio.2022.BuildTools` then select the C++ workload in the installer |
| **WebView2 Runtime** | Tauri's webview (already present on Windows 11 / updated Windows 10) | preinstalled; the installer bootstraps it for end users anyway |
| **NSIS + WiX** | produced installers | downloaded automatically by the Tauri CLI on first `tauri build` |

macOS: Xcode Command Line Tools (`xcode-select --install`) + Rust.
Linux: `libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev` + Rust.

---

## Build the Windows installer locally

```powershell
# 1. dependencies
npm install

# 2. fetch yt-dlp.exe + ffmpeg.exe into src-tauri/binaries with the target-triple suffix
npm run sidecars
#    → src-tauri/binaries/yt-dlp-x86_64-pc-windows-msvc.exe
#    → src-tauri/binaries/ffmpeg-x86_64-pc-windows-msvc.exe

# 3. icons (already generated in this repo; re-run if you change app-icon.png)
npm run tauri icon ./app-icon.png

# 4. develop
npm run tauri dev

# 5. build both installers (NSIS .exe + MSI)
npm run tauri build
```

Output lands in:

```
src-tauri\target\release\bundle\nsis\Grab_0.1.0_x64-setup.exe   ← the one to hand to people
src-tauri\target\release\bundle\msi\Grab_0.1.0_x64_en-US.msi    ← enterprise / GPO deployment
src-tauri\target\release\grab.exe                               ← bare portable exe (needs yt-dlp.exe + ffmpeg.exe next to it)
```

The NSIS installer is configured for `installMode: currentUser` — it installs into
`%LOCALAPPDATA%\Programs\Grab` with **no admin prompt**, pulls WebView2 via the evergreen
bootstrapper if the machine lacks it, and its finish page shows Tauri's built-in
**"Create desktop shortcut"** and **"Run Grab"** checkboxes.

Because the install directory is user-writable, **Settings → Update yt-dlp** (`yt-dlp -U`)
replaces the sidecar in place. On macOS/Linux this works when the app directory is writable;
otherwise the error is shown verbatim with the path to replace manually.

### Only building one installer type

```powershell
npm run tauri build -- --bundles nsis
npm run tauri build -- --bundles msi
```

---

## What to expect from SmartScreen on an unsigned build

When someone downloads `Grab_0.1.0_x64-setup.exe` and runs it:

1. **Browser warning** (Edge/Chrome): "This file isn't commonly downloaded" — they need *Keep → Keep anyway*.
2. **SmartScreen dialog**: "Windows protected your PC — Microsoft Defender SmartScreen prevented an
   unrecognized app from starting." The *Run anyway* button is hidden behind **More info**.
3. Some antivirus products flag PyInstaller-packed executables (yt-dlp.exe) heuristically.

None of this indicates a problem with the build — it is purely reputation-based. Windows tracks
reputation per *signing certificate* (or, unsigned, per file hash, so every release starts from zero).

### How code signing fixes it

| Option | Effect | Cost / effort |
| --- | --- | --- |
| **OV code-signing certificate** (DigiCert, Sectigo, SSL.com…) | Removes the "unknown publisher" text. SmartScreen reputation still has to be *earned* by the cert over a few thousand installs, but it accrues to the cert, not each build. | ~$200–400/yr; since 2023 the key must live on an HSM or USB token (FIPS 140-2), or in a cloud signing service |
| **EV code-signing certificate** | Immediate SmartScreen reputation — no warning from the first download. | ~$300–700/yr, hardware token or cloud HSM, stricter identity vetting |
| **Azure Trusted Signing** | Microsoft-run cloud signing; EV-like reputation, pay-as-you-go, no token. Currently for organisations/individuals with 3+ years of verifiable history. | ~$10/month |

Wire it into Tauri (tauri.conf.json → `bundle.windows`):

```jsonc
"windows": {
  "certificateThumbprint": "<SHA1 thumbprint of the cert in your user store>",
  "digestAlgorithm": "sha256",
  "timestampUrl": "http://timestamp.digicert.com"
}
```

or, for cloud/HSM signing, point `bundle.windows.signCommand` at a script that calls
`signtool.exe sign /fd sha256 /tr <timestamp> /td sha256 …` (or `AzureSignTool`) with `%1` as
the file. Tauri then signs `grab.exe`, both sidecars, and the installers. In CI, keep the
certificate in a secret and set `TAURI_WINDOWS_SIGN_COMMAND` / the thumbprint via environment.

---

## Sidecar binary setup (all platforms)

Tauri finds sidecars by **file name + Rust target triple**. `npm run sidecars` does the whole
thing for the host machine; the manual steps are below for reference.

Find your triple: `rustc -vV` → `host: x86_64-pc-windows-msvc`.

### Windows (x86_64-pc-windows-msvc)

```powershell
# yt-dlp
curl.exe -L -o src-tauri\binaries\yt-dlp-x86_64-pc-windows-msvc.exe `
  https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe
# ffmpeg (BtbN static GPL build; extract bin\ffmpeg.exe)
curl.exe -L -o ffmpeg.zip https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip
Expand-Archive ffmpeg.zip -DestinationPath ffmpeg-tmp
Copy-Item (Get-ChildItem ffmpeg-tmp -Recurse -Filter ffmpeg.exe).FullName src-tauri\binaries\ffmpeg-x86_64-pc-windows-msvc.exe
```

### macOS (aarch64-apple-darwin / x86_64-apple-darwin)

```bash
curl -L -o src-tauri/binaries/yt-dlp-aarch64-apple-darwin \
  https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos
curl -L -o ffmpeg.zip https://evermeet.cc/ffmpeg/getrelease/zip && unzip ffmpeg.zip
mv ffmpeg src-tauri/binaries/ffmpeg-aarch64-apple-darwin
chmod +x src-tauri/binaries/*
# Intel: same files, rename suffix to x86_64-apple-darwin.
# Universal build: provide both suffixes and run `tauri build --target universal-apple-darwin`.
```

Ship-ready macOS builds must be signed + notarized (`APPLE_SIGNING_IDENTITY`, `APPLE_ID`,
`APPLE_PASSWORD`, `APPLE_TEAM_ID` env vars); Tauri signs the sidecars with the same identity.
Unsigned builds show "cannot be opened because the developer cannot be verified".

### Linux (x86_64-unknown-linux-gnu)

```bash
curl -L -o src-tauri/binaries/yt-dlp-x86_64-unknown-linux-gnu \
  https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux
curl -L https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz | tar -xJ
mv ffmpeg-*-static/ffmpeg src-tauri/binaries/ffmpeg-x86_64-unknown-linux-gnu
chmod +x src-tauri/binaries/*
```

### How they're registered

- `tauri.conf.json` → `bundle.externalBin: ["binaries/yt-dlp", "binaries/ffmpeg"]`. Tauri strips the
  triple and copies them **flat** next to the app binary (`yt-dlp.exe`, `ffmpeg.exe`), in `tauri dev`
  and in every bundle.
- `capabilities/default.json` → `shell:allow-execute` with `{ "name": "binaries/yt-dlp", "sidecar": true }`
  entries. In Tauri v2 the shell scope lives in the capabilities file, not in `tauri.conf.json`.
  Grab spawns the sidecars from Rust (`app.shell().sidecar("yt-dlp")`), so the scope is only needed
  if you also want to call them from JS — it's declared anyway so both paths work.
- Rust passes the ffmpeg path to yt-dlp explicitly (`--ffmpeg-location`) — no PATH dependency.

---

## GitHub Actions

`.github/workflows/build-windows.yml` runs on `windows-latest` for tags `v*` (and manual
dispatch): installs Node + Rust, fetches sidecars, `npm run tauri build`, uploads the `.exe` and
`.msi` as workflow artifacts, and attaches them to the GitHub Release for tags.

---

## Keyboard

| Keys | Action |
| --- | --- |
| `Ctrl/⌘ V` (outside a text field) | paste-and-queue with your default format |
| `Enter` in the paste field | fetch previews |
| `Space` | pause / resume selected item (retry if failed) |
| `↑ ↓` | move selection · `Enter` opens details · `Esc` closes |
| `Delete` | remove selected item |
| `Ctrl/⌘ ,` | settings · `Ctrl/⌘ 1/2/3` switch views |

Also: drag a link from a browser onto the window; a clipboard chip appears when the window regains
focus with a link on the clipboard.

---

## Dev notes

- `npm run dev` runs the UI in a plain browser with in-memory persistence and stubbed commands —
  useful for layout/motion work. `npm run tauri dev` is the real thing.
- Motion: one spring (`{ stiffness: 400, damping: 30 }`) in `src/lib/motion.ts`; only
  `transform`/`opacity` are animated; `prefers-reduced-motion` swaps transforms for opacity fades.
- Theme tokens live in `src/index.css`; only one accent colour exists (`--accent`).
- Rust unit tests for the progress parser: `cd src-tauri && cargo test`.
