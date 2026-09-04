# Sidecar binaries

Tauri bundles every file listed under `bundle.externalBin` in `tauri.conf.json`,
but it only finds them if the file name ends with the **Rust target triple** of
the machine you're building on. This folder must therefore contain:

| Platform            | Files                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------- |
| Windows x64         | `yt-dlp-x86_64-pc-windows-msvc.exe`, `ffmpeg-x86_64-pc-windows-msvc.exe`                      |
| macOS Apple Silicon | `yt-dlp-aarch64-apple-darwin`, `ffmpeg-aarch64-apple-darwin`                                  |
| macOS Intel         | `yt-dlp-x86_64-apple-darwin`, `ffmpeg-x86_64-apple-darwin`                                    |
| Linux x64           | `yt-dlp-x86_64-unknown-linux-gnu`, `ffmpeg-x86_64-unknown-linux-gnu`                          |

Find your triple with `rustc -vV | findstr host` (Windows) or `rustc -vV | grep host`.

The easiest way to populate this folder is:

```
npm run sidecars
```

which downloads the current yt-dlp release and a static ffmpeg build for the
host platform and renames them correctly. See `scripts/fetch-sidecars.mjs` for
the exact sources. Nothing in this folder is committed to git.
