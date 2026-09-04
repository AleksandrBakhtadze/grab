//! Grab — Tauri backend.
//!
//! Architecture in one paragraph: the React frontend owns the queue (order,
//! concurrency, persistence in SQLite via tauri-plugin-sql). Rust owns
//! *processes*: it spawns the bundled yt-dlp sidecar, parses every stdout /
//! stderr line as it arrives and pushes it to the webview as a Tauri event.
//! Nothing is polled. When a process exits, Rust decides whether that was a
//! completion, a failure, a pause, or a cancel and emits a single terminal
//! state event. The frontend reacts by persisting and scheduling the next job.

mod commands;
mod errors;
mod progress;
mod sidecar;
mod state;

use tauri_plugin_sql::{Migration, MigrationKind};

pub fn run() {
    let migrations = vec![Migration {
        version: 1,
        description: "create jobs and history tables",
        sql: include_str!("../migrations/001_init.sql"),
        kind: MigrationKind::Up,
    }];

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:grab.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(state::AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::metadata::fetch_metadata,
            commands::download::start_download,
            commands::queue::pause_download,
            commands::queue::cancel_download,
            commands::queue::get_queue,
            commands::system::reveal_in_folder,
            commands::system::delete_file,
            commands::system::file_size,
            commands::system::default_download_dir,
            commands::system::ytdlp_version,
            commands::system::ffmpeg_version,
            commands::system::update_ytdlp,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Grab");
}
