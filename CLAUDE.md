# CLAUDE.md — Grab

Grab is a cross-platform desktop media downloader: Tauri v2 (Rust) + React 18 + TypeScript + Vite,
with yt-dlp and ffmpeg bundled as sidecars. Read `README.md` for the user-facing build guide; this
file is for working on the code.

## Commands

| Task | Command | Notes |
| --- | --- | --- |
| Install deps | `npm.cmd install` | Use `npm.cmd` on this machine; PowerShell's execution policy blocks `npm.ps1`. |
| Typecheck | `npx tsc --noEmit` | Must be clean; `noUnusedLocals` is on. |
| Frontend build | `npm.cmd run build` | tsc + vite. Runs automatically inside `tauri build`. |
| UI in a browser | `npm.cmd run dev` | Tauri commands are stubbed; persistence is in-memory. Good for layout/motion work. |
| Real app | `npm.cmd run tauri dev` | Needs the MSVC linker (not installed here — see below). |
| Fetch sidecars | `npm.cmd run sidecars` | Downloads yt-dlp + ffmpeg into `src-tauri/binaries/` with the target-triple suffix. Never committed. |
| Rust tests | `cd src-tauri; cargo test` | Progress-parser tests in `src/progress.rs`. Also needs the linker. |
| Windows installers | GitHub Actions → "Build Windows installer" (`.github/workflows/build-windows.yml`) | `gh workflow run build-windows.yml --ref main`, then `gh run watch <id>` and `gh run download <id>`. |

### Environment quirks on this machine

- **No MSVC linker** (`link.exe`). Rust cannot compile locally, so the Rust side is built and verified
  in GitHub Actions on `windows-latest`. Frontend typecheck/build work locally.
- `git` is at `C:\Program Files\Git\cmd\git.exe` and `gh` at `C:\Program Files\GitHub CLI\gh.exe`;
  neither is on PATH in fresh shells. Prepend `C:\Program Files\Git\cmd` to PATH before using `gh`.
- `gh` stores its token in the Windows keyring, so `gh` calls must run outside the sandbox.
- Remote: https://github.com/AleksandrBakhtadze/grab (private), branch `main`.
- Temp is on C:, project on D: — use copy+delete, not rename, when moving files between them.

## Architecture (the parts that aren't obvious from the file tree)

- **Frontend owns the queue; Rust owns processes.** `src/stores/queue.ts` is the scheduler: it keeps
  ≤ `concurrency` jobs in `downloading`, persists every job to SQLite (`src/lib/db.ts`,
  tauri-plugin-sql, schema in `src-tauri/migrations/`), and reacts to Rust events. Rust
  (`src-tauri/src/commands/download.rs`) only spawns yt-dlp and streams its output.
- **Events, never polling.** Every yt-dlp line → `download://progress` (`progress` | `log`);
  process exit → one `download://state` (`completed` | `failed` | `paused` | `canceled`).
  `get_queue` exists only to reconcile after a webview reload.
- **Pause = kill + keep `.part`; resume = respawn with `--continue`.** Cross-platform and survives
  restarts. On Windows the kill is `taskkill /T /F` so yt-dlp's ffmpeg child dies too.
- **Progress template** (`src-tauri/src/progress.rs`): yt-dlp prints `GRAB_DL:{json}` per tick.
  Optional fields use `%(field|null)j` — without `|null` a missing field renders as bare `NA` and
  breaks the JSON. Because `--print` implies `--quiet`, progress goes to **stderr**; both streams are
  parsed identically. Final path comes from `--print after_move:GRAB_FILE:%(filepath)j`.
- **Sidecars**: `bundle.externalBin` lists `binaries/yt-dlp` and `binaries/ffmpeg`, but the Rust
  `Shell::sidecar()` call must receive the bare name (`yt-dlp`) because Tauri copies sidecars flat
  next to the exe. ffmpeg's path is passed explicitly via `--ffmpeg-location`.
- **Quick-queue vs staged.** Ctrl/⌘+V, drag-drop, and the clipboard chip create a job immediately
  with `metaPending: true` (title = URL) and resolve metadata in the background; the scheduler skips
  pending jobs, and playlists are expanded into one job per entry. The composer (`UrlInput`) instead
  stages previews first and commits on "Add to queue".
- **Errors**: `src-tauri/src/errors.rs` maps yt-dlp stderr to `FriendlyError { code, title, message,
  suggestion, raw }`. First matching regex wins; keep specific rules above generic ones.
- **Platform overrides**: `tauri.conf.json` is Windows-first (NSIS + MSI). `tauri.macos.conf.json`
  replaces the whole window object (JSON merge patch replaces arrays) for the overlay titlebar and
  app/dmg targets; `tauri.linux.conf.json` sets deb/appimage.
- Capabilities/permissions live in `src-tauri/capabilities/default.json`, not in `tauri.conf.json`.

## Conventions that must hold

- **Motion**: only `transform` and `opacity` animate. Everything uses the springs in
  `src/lib/motion.ts` (`spring` = 400/30). Every transform animation has a reduced-motion opacity
  fallback via `useReducedMotion()`. Progress bars animate `scaleX`, never `width`.
- **Shared elements**: queue card ↔ detail sheet morph via `layoutId={\`thumb-${id}\`}` and
  `title-${id}`; keep those ids in sync if you touch either component.
- **Design tokens**: colours are CSS variables in `src/index.css`; exactly one accent (`--accent`).
  8px spacing grid, 12px default radius, 1px borders instead of shadows. Live numbers get the `num`
  class (tabular figures) so they don't jitter.
- **TypeScript**: strict, no unused locals/params. Prefer store selectors (`useQueue((s) => s.x)`)
  over subscribing to the whole store in list items.
- **Zustand v5 selectors that return a new array/object** (`selectOrderedJobs`, `selectStats`,
  `selectFiltered`) must be wrapped in `useShallow(...)` from `zustand/react/shallow`. Without it
  React loops forever (minified error #185) and the app shows a black window.
- **Smoke-test the production bundle before shipping**: `npm.cmd run build`, `npx vite preview`,
  then load it in headless Edge with `--enable-logging=stderr --dump-dom` and grep for `CONSOLE` /
  `Uncaught`. Release builds have no devtools, so this is the fastest way to catch runtime errors.
- **Rust**: commands return `Result<T, FriendlyError>`; never `unwrap` on user-influenced data.
  Async commands that take `State<'_, _>` must return `Result` (Tauri requirement).
- Keep the legal notice (`LEGAL_TEXT` in `LegalDialog.tsx`) in both the first-run dialog and Settings.

## Commit messages

End commits with:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014XeGwwaz9ynBk7De6w81Sr
```
