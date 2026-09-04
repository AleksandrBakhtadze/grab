//! Pause / cancel / reconcile.
//!
//! "Pause" is implemented as *kill the process, keep the partial file*. On
//! resume the frontend calls `start_download` again and yt-dlp's `--continue`
//! picks up where the `.part` / fragment state left off. This is the only
//! approach that behaves identically on Windows, macOS, and Linux (SIGSTOP is
//! Unix-only and doesn't survive an app restart anyway).

use tauri::State;
use tauri_plugin_shell::process::CommandChild;

use crate::errors::FriendlyError;
use crate::state::{AppState, JobSnapshot, StopReason};

/// Kill yt-dlp *and* any ffmpeg it spawned. On Windows `taskkill /T` walks the
/// process tree; on Unix we ask `pkill` for the children first, then kill the
/// parent handle we hold.
fn kill_tree(pid: u32, child: Option<CommandChild>) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let _ = std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .creation_flags(CREATE_NO_WINDOW)
            .status();
    }
    #[cfg(unix)]
    {
        let _ = std::process::Command::new("pkill")
            .args(["-TERM", "-P", &pid.to_string()])
            .status();
    }
    if let Some(c) = child {
        let _ = c.kill();
    }
}

fn stop(state: &AppState, job_id: &str, reason: StopReason) -> Result<(), FriendlyError> {
    let (pid, child) = {
        let mut jobs = state
            .jobs
            .lock()
            .map_err(|_| FriendlyError::internal("job table poisoned"))?;
        let Some(job) = jobs.get_mut(job_id) else {
            return Err(FriendlyError::new(
                "not_running",
                "Nothing to stop",
                "This item isn't currently downloading.",
                None,
                "",
            ));
        };
        job.stop = Some(reason);
        (job.pid, job.child.take())
    };
    kill_tree(pid, child);
    Ok(())
}

#[tauri::command]
pub async fn pause_download(state: State<'_, AppState>, job_id: String) -> Result<(), FriendlyError> {
    stop(&state, &job_id, StopReason::Paused)
}

#[tauri::command]
pub async fn cancel_download(state: State<'_, AppState>, job_id: String) -> Result<(), FriendlyError> {
    stop(&state, &job_id, StopReason::Canceled)
}

/// Snapshot of every job with a live process. The frontend calls this once on
/// mount to reconcile its persisted queue with reality (e.g. after a webview
/// reload during development) — it is *not* used for progress updates.
#[tauri::command]
pub fn get_queue(state: State<'_, AppState>) -> Vec<JobSnapshot> {
    state
        .jobs
        .lock()
        .map(|jobs| jobs.values().map(|j| j.snapshot.clone()).collect())
        .unwrap_or_default()
}
