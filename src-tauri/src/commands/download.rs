//! `start_download` — spawns yt-dlp for one job and streams its output to the
//! frontend as events. Never polled: every line yt-dlp prints becomes an
//! event the moment it arrives.

use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_shell::process::CommandEvent;

use crate::errors::{map_ytdlp_error, FriendlyError};
use crate::progress::{self, ParsedLine, Progress};
use crate::sidecar;
use crate::state::{AppState, JobSnapshot, RunningJob, StopReason};

pub const EVT_PROGRESS: &str = "download://progress";
pub const EVT_STATE: &str = "download://state";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadOptions {
    /// "video" | "audio"
    pub mode: String,
    /// "best" | "2160" | "1440" | "1080" | "720" | "480" | "360"
    pub quality: String,
    /// "mp4" | "mkv" | "webm"
    pub container: String,
    /// "mp3" | "m4a" | "opus"
    pub audio_format: String,
    pub subtitles: bool,
    pub auto_subtitles: bool,
    pub embed_subtitles: bool,
    /// yt-dlp `--sub-langs` syntax, e.g. "en.*,-live_chat"
    pub subtitle_langs: String,
    pub embed_thumbnail: bool,
    pub embed_metadata: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadSettings {
    pub output_dir: String,
    pub filename_template: String,
    pub proxy: Option<String>,
    pub rate_limit: Option<String>,
    pub cookies_from_browser: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadRequest {
    pub job_id: String,
    pub url: String,
    pub options: DownloadOptions,
    pub settings: DownloadSettings,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum DownloadEvent {
    #[serde(rename_all = "camelCase")]
    Progress {
        job_id: String,
        /// "downloading" | "merging" | "converting" | "postprocessing"
        phase: String,
        progress: Progress,
    },
    #[serde(rename_all = "camelCase")]
    Log { job_id: String, line: String },
    #[serde(rename_all = "camelCase")]
    State {
        job_id: String,
        /// "completed" | "failed" | "paused" | "canceled"
        status: String,
        file_path: Option<String>,
        error: Option<FriendlyError>,
    },
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Translate the user's quality preset into a yt-dlp format selector.
/// We try container-matched streams first (no transcoding, instant merge),
/// then anything at that height, then the best single file.
fn video_selector(quality: &str, container: &str) -> String {
    let cap = quality.parse::<u32>().ok();
    let (v_ext, a_ext) = match container {
        "mp4" => ("[ext=mp4]", "[ext=m4a]"),
        "webm" => ("[ext=webm]", "[ext=webm]"),
        _ => ("", ""),
    };
    match cap {
        Some(h) => format!(
            "bestvideo[height<={h}]{v_ext}+bestaudio{a_ext}/bestvideo[height<={h}]+bestaudio/best[height<={h}]/best"
        ),
        None => format!("bestvideo{v_ext}+bestaudio{a_ext}/bestvideo+bestaudio/best"),
    }
}

pub fn build_args(req: &DownloadRequest) -> Vec<String> {
    let o = &req.options;
    let s = &req.settings;
    let mut a: Vec<String> = vec![
        "--newline".into(),
        "--no-colors".into(),
        "--progress".into(),
        "--no-simulate".into(),
        "--ignore-config".into(),
        "--no-playlist".into(),
        "--continue".into(),
        "--no-overwrites".into(),
        "--retries".into(),
        "5".into(),
        "--fragment-retries".into(),
        "10".into(),
        "--progress-template".into(),
        progress::download_template(),
        "--progress-template".into(),
        progress::postprocess_template(),
        "--print".into(),
        progress::file_print_template(),
        "-P".into(),
        s.output_dir.clone(),
        "-o".into(),
        if s.filename_template.trim().is_empty() {
            "%(title)s [%(id)s].%(ext)s".into()
        } else {
            s.filename_template.clone()
        },
    ];

    a.extend(sidecar::common_args());

    if o.mode == "audio" {
        a.push("-f".into());
        a.push("bestaudio/best".into());
        a.push("-x".into());
        a.push("--audio-format".into());
        a.push(o.audio_format.clone());
        a.push("--audio-quality".into());
        a.push("0".into());
    } else {
        a.push("-f".into());
        a.push(video_selector(&o.quality, &o.container));
        a.push("--merge-output-format".into());
        a.push(o.container.clone());
    }

    if o.embed_metadata {
        a.push("--embed-metadata".into());
    }
    if o.embed_thumbnail {
        a.push("--embed-thumbnail".into());
    }
    if o.subtitles {
        a.push("--write-subs".into());
        if o.auto_subtitles {
            a.push("--write-auto-subs".into());
        }
        a.push("--sub-langs".into());
        a.push(if o.subtitle_langs.trim().is_empty() {
            "en.*,-live_chat".into()
        } else {
            o.subtitle_langs.clone()
        });
        if o.embed_subtitles && o.mode != "audio" {
            a.push("--embed-subs".into());
        }
    }

    if let Some(p) = s.proxy.as_ref().filter(|p| !p.trim().is_empty()) {
        a.push("--proxy".into());
        a.push(p.trim().to_string());
    }
    if let Some(r) = s.rate_limit.as_ref().filter(|r| !r.trim().is_empty()) {
        a.push("--limit-rate".into());
        a.push(r.trim().to_string());
    }
    if let Some(b) = s.cookies_from_browser.as_ref().filter(|b| !b.trim().is_empty()) {
        a.push("--cookies-from-browser".into());
        a.push(b.trim().to_string());
    }

    a.push("--".into());
    a.push(req.url.trim().to_string());
    a
}

fn phase_for(postprocessor: &str) -> &'static str {
    let p = postprocessor.to_ascii_lowercase();
    if p.contains("merger") {
        "merging"
    } else if p.contains("extractaudio") || p.contains("videoconvertor") || p.contains("videoremuxer") {
        "converting"
    } else {
        "postprocessing"
    }
}

/// Best-effort removal of the partial artefacts yt-dlp leaves behind when a
/// download is canceled mid-flight.
fn cleanup_partials(filename: Option<&str>) {
    let Some(name) = filename else { return };
    let base = Path::new(name);
    let stem = name.trim_end_matches(".part");
    let candidates = [
        base.to_path_buf(),
        Path::new(&format!("{stem}.part")).to_path_buf(),
        Path::new(&format!("{stem}.ytdl")).to_path_buf(),
        Path::new(&format!("{stem}.part-Frag1")).to_path_buf(),
    ];
    for c in candidates {
        if c.exists() && c.is_file() {
            let _ = std::fs::remove_file(&c);
        }
    }
}

#[tauri::command]
pub async fn start_download(
    app: AppHandle,
    state: State<'_, AppState>,
    req: DownloadRequest,
) -> Result<(), FriendlyError> {
    if state.is_running(&req.job_id) {
        return Err(FriendlyError::new(
            "already_running",
            "Already downloading",
            "This item is already in progress.",
            None,
            "",
        ));
    }
    if req.settings.output_dir.trim().is_empty() {
        return Err(FriendlyError::new(
            "no_output_dir",
            "No output folder set",
            "Choose where downloads should be saved.",
            Some("Open Settings and pick an output folder."),
            "",
        ));
    }
    std::fs::create_dir_all(&req.settings.output_dir)?;

    let args = build_args(&req);
    let cmd = sidecar::ytdlp(&app)?.args(&args);
    let (mut rx, child) = cmd.spawn()?;
    let pid = child.pid();

    let job_id = req.job_id.clone();
    {
        let mut jobs = state
            .jobs
            .lock()
            .map_err(|_| FriendlyError::internal("job table poisoned"))?;
        jobs.insert(
            job_id.clone(),
            RunningJob {
                child: Some(child),
                pid,
                stop: None,
                snapshot: JobSnapshot {
                    job_id: job_id.clone(),
                    url: req.url.clone(),
                    last_progress: None,
                    last_filename: None,
                    final_path: None,
                    started_at: now_secs(),
                },
            },
        );
    }

    let _ = app.emit(
        EVT_PROGRESS,
        DownloadEvent::Log {
            job_id: job_id.clone(),
            line: format!("$ yt-dlp {}", args.join(" ")),
        },
    );

    let app2 = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut log: Vec<String> = Vec::with_capacity(256);
        let mut final_path: Option<String> = None;
        let mut last_filename: Option<String> = None;
        let mut last_progress: Progress = Progress::default();

        let push_log = |log: &mut Vec<String>, line: &str| {
            if log.len() >= 400 {
                log.drain(0..100);
            }
            log.push(line.to_string());
        };

        while let Some(ev) = rx.recv().await {
            match ev {
                CommandEvent::Stdout(bytes) | CommandEvent::Stderr(bytes) => {
                    let text = String::from_utf8_lossy(&bytes);
                    let line = text.trim_end_matches(['\r', '\n']);
                    if line.is_empty() {
                        continue;
                    }
                    match progress::parse_line(line) {
                        ParsedLine::Progress(p) => {
                            if let Some(f) = &p.filename {
                                last_filename = Some(f.clone());
                            }
                            last_progress = p.clone();
                            if let Ok(mut jobs) = app2.state::<AppState>().jobs.lock() {
                                if let Some(j) = jobs.get_mut(&job_id) {
                                    j.snapshot.last_progress = Some(p.clone());
                                    j.snapshot.last_filename = last_filename.clone();
                                }
                            }
                            let _ = app2.emit(
                                EVT_PROGRESS,
                                DownloadEvent::Progress {
                                    job_id: job_id.clone(),
                                    phase: "downloading".into(),
                                    progress: p,
                                },
                            );
                        }
                        ParsedLine::Postprocess { status, postprocessor } => {
                            push_log(&mut log, &format!("[{postprocessor}] {status}"));
                            let mut p = last_progress.clone();
                            p.status = "postprocessing".into();
                            p.percent = Some(100.0);
                            p.speed = None;
                            p.eta = None;
                            let _ = app2.emit(
                                EVT_PROGRESS,
                                DownloadEvent::Progress {
                                    job_id: job_id.clone(),
                                    phase: phase_for(&postprocessor).into(),
                                    progress: p,
                                },
                            );
                        }
                        ParsedLine::FinalPath(p) | ParsedLine::AlreadyDownloaded(p) => {
                            push_log(&mut log, &format!("→ {p}"));
                            final_path = Some(p.clone());
                            if let Ok(mut jobs) = app2.state::<AppState>().jobs.lock() {
                                if let Some(j) = jobs.get_mut(&job_id) {
                                    j.snapshot.final_path = Some(p);
                                }
                            }
                        }
                        ParsedLine::Destination(d) => {
                            push_log(&mut log, line);
                            last_filename = Some(d);
                        }
                        ParsedLine::Error(l) | ParsedLine::Other(l) => {
                            push_log(&mut log, &l);
                            let _ = app2.emit(
                                EVT_PROGRESS,
                                DownloadEvent::Log {
                                    job_id: job_id.clone(),
                                    line: l,
                                },
                            );
                        }
                    }
                }
                CommandEvent::Error(e) => {
                    push_log(&mut log, &format!("[grab] process error: {e}"));
                }
                CommandEvent::Terminated(term) => {
                    let stop = app2
                        .state::<AppState>()
                        .jobs
                        .lock()
                        .ok()
                        .and_then(|mut jobs| jobs.remove(&job_id))
                        .and_then(|j| j.stop);

                    let ok = term.code == Some(0);
                    let event = if ok && (final_path.is_some() || stop.is_none()) {
                        let path = final_path.clone().or_else(|| {
                            last_filename
                                .as_deref()
                                .map(|f| f.trim_end_matches(".part").to_string())
                        });
                        DownloadEvent::State {
                            job_id: job_id.clone(),
                            status: "completed".into(),
                            file_path: path,
                            error: None,
                        }
                    } else {
                        match stop {
                            Some(StopReason::Paused) => DownloadEvent::State {
                                job_id: job_id.clone(),
                                status: "paused".into(),
                                file_path: None,
                                error: None,
                            },
                            Some(StopReason::Canceled) => {
                                cleanup_partials(last_filename.as_deref());
                                DownloadEvent::State {
                                    job_id: job_id.clone(),
                                    status: "canceled".into(),
                                    file_path: None,
                                    error: None,
                                }
                            }
                            None => DownloadEvent::State {
                                job_id: job_id.clone(),
                                status: "failed".into(),
                                file_path: None,
                                error: Some(map_ytdlp_error(&log, term.code)),
                            },
                        }
                    };
                    let _ = app2.emit(EVT_STATE, event);
                    break;
                }
                _ => {}
            }
        }
    });

    Ok(())
}
