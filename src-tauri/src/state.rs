//! Process bookkeeping for in-flight downloads.

use std::collections::HashMap;
use std::sync::Mutex;

use serde::Serialize;
use tauri_plugin_shell::process::CommandChild;

use crate::progress::Progress;

/// Why a process was deliberately killed. Read when the process terminates so
/// the correct terminal state is reported instead of a generic failure.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum StopReason {
    Paused,
    Canceled,
}

pub struct RunningJob {
    /// `None` once we've taken the handle to kill it.
    pub child: Option<CommandChild>,
    pub pid: u32,
    pub stop: Option<StopReason>,
    pub snapshot: JobSnapshot,
}

/// What the frontend needs to reconcile after a hot reload / focus change.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JobSnapshot {
    pub job_id: String,
    pub url: String,
    pub last_progress: Option<Progress>,
    /// Last known on-disk filename (may still carry a `.part` suffix).
    pub last_filename: Option<String>,
    /// Final path reported by `--print after_move:filepath`.
    pub final_path: Option<String>,
    pub started_at: u64,
}

#[derive(Default)]
pub struct AppState {
    pub jobs: Mutex<HashMap<String, RunningJob>>,
}

impl AppState {
    pub fn is_running(&self, job_id: &str) -> bool {
        self.jobs
            .lock()
            .map(|j| j.contains_key(job_id))
            .unwrap_or(false)
    }
}
