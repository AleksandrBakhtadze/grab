//! Resolves the bundled yt-dlp / ffmpeg sidecars.
//!
//! Tauri copies `src-tauri/binaries/<name>-<target-triple>[.exe]` next to the
//! app executable (as plain `<name>[.exe]`) both in `tauri dev` and in the
//! final bundle, so `current_exe().parent()` is always the right place to look.

use std::path::PathBuf;

use tauri::AppHandle;
use tauri_plugin_shell::{process::Command, ShellExt};

use crate::errors::FriendlyError;

/// Bare binary names. `bundle.externalBin` lists them as `binaries/yt-dlp`
/// etc., but the Rust `Shell::sidecar` API resolves the given path relative
/// to the executable's directory, where Tauri copies the sidecars *flat*
/// (`yt-dlp.exe`, `ffmpeg.exe`), so the directory prefix must not be passed.
pub const YTDLP: &str = "yt-dlp";
pub const FFMPEG: &str = "ffmpeg";

fn exe_dir() -> Option<PathBuf> {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
}

fn sidecar_path(name: &str) -> Option<PathBuf> {
    let file = format!("{name}{}", std::env::consts::EXE_SUFFIX);
    let candidate = exe_dir()?.join(file);
    candidate.exists().then_some(candidate)
}

/// Absolute path to the ffmpeg binary, passed to yt-dlp via `--ffmpeg-location`.
pub fn ffmpeg_path() -> Option<PathBuf> {
    sidecar_path("ffmpeg")
}

pub fn ytdlp_path() -> Option<PathBuf> {
    sidecar_path("yt-dlp")
}

/// A yt-dlp `Command` with UTF-8 output forced. yt-dlp is a frozen Python
/// program; on Windows it would otherwise pick the legacy console code page and
/// mangle non-ASCII titles.
pub fn ytdlp(app: &AppHandle) -> Result<Command, FriendlyError> {
    let cmd = app.shell().sidecar(YTDLP)?;
    Ok(cmd
        .env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONUTF8", "1")
        .env("PYTHONLEGACYWINDOWSSTDIO", "0"))
}

pub fn ffmpeg(app: &AppHandle) -> Result<Command, FriendlyError> {
    Ok(app.shell().sidecar(FFMPEG)?)
}
