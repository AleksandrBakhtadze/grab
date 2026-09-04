//! `fetch_metadata` — runs `yt-dlp --dump-single-json` and trims the (often
//! enormous) result down to what the preview and format picker need.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::AppHandle;
use tokio::time::{timeout, Duration};

use crate::errors::{map_ytdlp_error, FriendlyError};
use crate::sidecar;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataRequest {
    pub url: String,
    pub cookies_from_browser: Option<String>,
    pub proxy: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FormatInfo {
    pub format_id: String,
    pub ext: Option<String>,
    pub height: Option<u64>,
    pub width: Option<u64>,
    pub fps: Option<f64>,
    pub vcodec: Option<String>,
    pub acodec: Option<String>,
    pub filesize: Option<u64>,
    pub filesize_is_estimate: bool,
    pub tbr: Option<f64>,
    pub abr: Option<f64>,
    pub format_note: Option<String>,
    pub protocol: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistEntry {
    pub id: String,
    pub title: String,
    pub url: String,
    pub duration: Option<f64>,
    pub thumbnail: Option<String>,
    pub uploader: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaInfo {
    /// "video" or "playlist"
    pub kind: String,
    pub id: String,
    pub title: String,
    pub uploader: Option<String>,
    pub duration: Option<f64>,
    pub thumbnail: Option<String>,
    pub webpage_url: String,
    pub extractor: String,
    pub is_live: bool,
    pub view_count: Option<u64>,
    pub upload_date: Option<String>,
    pub formats: Vec<FormatInfo>,
    pub entries: Vec<PlaylistEntry>,
    pub playlist_count: Option<u64>,
    pub subtitle_langs: Vec<String>,
    pub auto_caption_langs: Vec<String>,
}

fn s(v: &Value, key: &str) -> Option<String> {
    v.get(key).and_then(Value::as_str).map(str::to_string)
}
fn f(v: &Value, key: &str) -> Option<f64> {
    v.get(key).and_then(Value::as_f64)
}
fn u(v: &Value, key: &str) -> Option<u64> {
    v.get(key)
        .and_then(|x| x.as_u64().or_else(|| x.as_f64().map(|f| f as u64)))
}

fn best_thumbnail(v: &Value) -> Option<String> {
    if let Some(t) = s(v, "thumbnail") {
        return Some(t);
    }
    v.get("thumbnails")
        .and_then(Value::as_array)
        .and_then(|arr| arr.iter().rev().find_map(|t| s(t, "url")))
}

fn keys(v: &Value, key: &str) -> Vec<String> {
    v.get(key)
        .and_then(Value::as_object)
        .map(|m| m.keys().cloned().collect())
        .unwrap_or_default()
}

fn parse_formats(v: &Value) -> Vec<FormatInfo> {
    let Some(arr) = v.get("formats").and_then(Value::as_array) else {
        return vec![];
    };
    arr.iter()
        .filter_map(|fmt| {
            let vcodec = s(fmt, "vcodec");
            let acodec = s(fmt, "acodec");
            // Storyboards / images have neither codec.
            if vcodec.as_deref() == Some("none") && acodec.as_deref() == Some("none") {
                return None;
            }
            let (filesize, est) = match u(fmt, "filesize") {
                Some(n) => (Some(n), false),
                None => (u(fmt, "filesize_approx"), true),
            };
            Some(FormatInfo {
                format_id: s(fmt, "format_id")?,
                ext: s(fmt, "ext"),
                height: u(fmt, "height"),
                width: u(fmt, "width"),
                fps: f(fmt, "fps"),
                vcodec,
                acodec,
                filesize,
                filesize_is_estimate: est,
                tbr: f(fmt, "tbr"),
                abr: f(fmt, "abr"),
                format_note: s(fmt, "format_note"),
                protocol: s(fmt, "protocol"),
            })
        })
        .collect()
}

fn parse_entries(v: &Value) -> Vec<PlaylistEntry> {
    let Some(arr) = v.get("entries").and_then(Value::as_array) else {
        return vec![];
    };
    arr.iter()
        .filter(|e| !e.is_null())
        .enumerate()
        .filter_map(|(i, e)| {
            let url = s(e, "url").or_else(|| s(e, "webpage_url"))?;
            Some(PlaylistEntry {
                id: s(e, "id").unwrap_or_else(|| format!("entry-{i}")),
                title: s(e, "title").unwrap_or_else(|| format!("Item {}", i + 1)),
                url,
                duration: f(e, "duration"),
                thumbnail: best_thumbnail(e),
                uploader: s(e, "uploader")
                    .or_else(|| s(e, "channel"))
                    .or_else(|| s(e, "uploader_id")),
            })
        })
        .collect()
}

pub fn parse_info(v: &Value, requested_url: &str) -> MediaInfo {
    let is_playlist = s(v, "_type").as_deref() == Some("playlist");
    MediaInfo {
        kind: if is_playlist { "playlist" } else { "video" }.to_string(),
        id: s(v, "id").unwrap_or_default(),
        title: s(v, "title").unwrap_or_else(|| "Untitled".into()),
        uploader: s(v, "uploader")
            .or_else(|| s(v, "channel"))
            .or_else(|| s(v, "uploader_id")),
        duration: f(v, "duration"),
        thumbnail: best_thumbnail(v),
        webpage_url: s(v, "webpage_url").unwrap_or_else(|| requested_url.to_string()),
        extractor: s(v, "extractor_key")
            .or_else(|| s(v, "extractor"))
            .unwrap_or_else(|| "generic".into()),
        is_live: v.get("is_live").and_then(Value::as_bool).unwrap_or(false),
        view_count: u(v, "view_count"),
        upload_date: s(v, "upload_date"),
        formats: if is_playlist { vec![] } else { parse_formats(v) },
        entries: if is_playlist { parse_entries(v) } else { vec![] },
        playlist_count: u(v, "playlist_count"),
        subtitle_langs: keys(v, "subtitles"),
        auto_caption_langs: keys(v, "automatic_captions"),
    }
}

#[tauri::command]
pub async fn fetch_metadata(app: AppHandle, req: MetadataRequest) -> Result<MediaInfo, FriendlyError> {
    let url = req.url.trim().to_string();
    if url.is_empty() {
        return Err(FriendlyError::new(
            "empty_url",
            "No link provided",
            "Paste a link to a video, post, or playlist.",
            None,
            "",
        ));
    }

    let mut args: Vec<String> = vec![
        "--dump-single-json".into(),
        "--flat-playlist".into(),
        "--no-playlist".into(),
        "--skip-download".into(),
        "--no-warnings".into(),
        "--no-colors".into(),
        "--ignore-config".into(),
        "--socket-timeout".into(),
        "20".into(),
        "--retries".into(),
        "2".into(),
    ];
    if let Some(b) = req.cookies_from_browser.filter(|b| !b.is_empty()) {
        args.push("--cookies-from-browser".into());
        args.push(b);
    }
    if let Some(p) = req.proxy.filter(|p| !p.is_empty()) {
        args.push("--proxy".into());
        args.push(p);
    }
    args.push(url.clone());

    let cmd = sidecar::ytdlp(&app)?.args(&args);
    let output = timeout(Duration::from_secs(90), cmd.output())
        .await
        .map_err(|_| {
            FriendlyError::new(
                "timeout",
                "Timed out fetching details",
                "The platform took more than 90 seconds to respond.",
                Some("Check your connection and try again."),
                "",
            )
        })??;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    if !output.status.success() || stdout.trim().is_empty() {
        let lines: Vec<String> = stderr
            .lines()
            .chain(stdout.lines())
            .map(str::to_string)
            .collect();
        return Err(map_ytdlp_error(&lines, output.status.code()));
    }

    let value: Value = serde_json::from_str(stdout.trim()).map_err(|e| {
        FriendlyError::new(
            "bad_json",
            "Couldn't read yt-dlp's response",
            "yt-dlp returned data Grab couldn't parse.",
            Some("Update yt-dlp from Settings and try again."),
            format!("{e}\n{}", stderr),
        )
    })?;

    Ok(parse_info(&value, &url))
}
