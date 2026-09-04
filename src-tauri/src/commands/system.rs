//! Small OS-facing helpers: reveal / delete files, default folders, and the
//! yt-dlp self-update that keeps extractors alive between app releases.

use serde::Serialize;
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;
use tokio::time::{timeout, Duration};

use crate::errors::FriendlyError;
use crate::sidecar;

#[tauri::command]
pub fn reveal_in_folder(app: AppHandle, path: String) -> Result<(), FriendlyError> {
    if !std::path::Path::new(&path).exists() {
        return Err(FriendlyError::new(
            "missing_file",
            "File not found",
            "The file has been moved or deleted since it was downloaded.",
            Some("Re-download it from History."),
            path,
        ));
    }
    app.opener()
        .reveal_item_in_dir(&path)
        .map_err(|e| FriendlyError::internal(e.to_string()))
}

#[tauri::command]
pub fn delete_file(path: String) -> Result<(), FriendlyError> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Ok(());
    }
    if !p.is_file() {
        return Err(FriendlyError::internal("Refusing to delete a non-file path"));
    }
    std::fs::remove_file(p)?;
    Ok(())
}

#[tauri::command]
pub fn file_size(path: String) -> Option<u64> {
    std::fs::metadata(path).ok().map(|m| m.len())
}

#[tauri::command]
pub fn default_download_dir(app: AppHandle) -> String {
    app.path()
        .download_dir()
        .or_else(|_| app.path().home_dir())
        .map(|p| p.join("Grab").to_string_lossy().into_owned())
        .unwrap_or_else(|_| ".".into())
}

async fn run_capture(cmd: tauri_plugin_shell::process::Command, secs: u64) -> Result<(bool, String), FriendlyError> {
    let out = timeout(Duration::from_secs(secs), cmd.output())
        .await
        .map_err(|_| FriendlyError::internal("timed out"))??;
    let text = format!(
        "{}{}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    );
    Ok((out.status.success(), text.trim().to_string()))
}

#[tauri::command]
pub async fn ytdlp_version(app: AppHandle) -> Result<String, FriendlyError> {
    let (ok, text) = run_capture(sidecar::ytdlp(&app)?.args(["--version"]), 20).await?;
    if ok {
        Ok(text.lines().next().unwrap_or("").to_string())
    } else {
        Err(FriendlyError::internal(text))
    }
}

#[tauri::command]
pub async fn ffmpeg_version(app: AppHandle) -> Result<String, FriendlyError> {
    let (ok, text) = run_capture(sidecar::ffmpeg(&app)?.args(["-version"]), 20).await?;
    if ok {
        let first = text.lines().next().unwrap_or("");
        // "ffmpeg version 7.1-full_build-www.gyan.dev Copyright ..." → "7.1"
        Ok(first
            .split_whitespace()
            .nth(2)
            .map(|v| v.split('-').next().unwrap_or(v).to_string())
            .unwrap_or_else(|| first.to_string()))
    } else {
        Err(FriendlyError::internal(text))
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateResult {
    pub updated: bool,
    pub version: Option<String>,
    pub output: String,
}

/// `yt-dlp -U` replaces the binary in place. This works wherever the app
/// directory is user-writable (NSIS per-user installs, ~/Applications, AppImage
/// extracted dirs). Where it isn't, the error is surfaced verbatim so the user
/// knows to reinstall instead.
#[tauri::command]
pub async fn update_ytdlp(app: AppHandle) -> Result<UpdateResult, FriendlyError> {
    let (ok, text) = run_capture(
        sidecar::ytdlp(&app)?.args(["-U", "--update-to", "stable"]),
        180,
    )
    .await?;
    if !ok {
        let path = sidecar::ytdlp_path()
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_default();
        return Err(FriendlyError::new(
            "update_failed",
            "yt-dlp couldn't update itself",
            "The updater ran but reported an error — most often the app folder isn't writable.",
            Some(&format!(
                "Reinstall the latest Grab, or replace the binary manually at {path}"
            )),
            text,
        ));
    }
    let updated = text.contains("Updated yt-dlp") || text.contains("Updating to");
    let version = ytdlp_version(app).await.ok();
    Ok(UpdateResult {
        updated,
        version,
        output: text,
    })
}
