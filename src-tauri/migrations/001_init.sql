-- Grab persistent store. Applied by tauri-plugin-sql on first load of sqlite:grab.db.

CREATE TABLE IF NOT EXISTS jobs (
  id            TEXT PRIMARY KEY,
  url           TEXT NOT NULL,
  title         TEXT,
  thumbnail     TEXT,
  uploader      TEXT,
  duration      REAL,
  platform      TEXT NOT NULL,
  options       TEXT NOT NULL,          -- JSON: DownloadOptions
  status        TEXT NOT NULL,          -- queued | downloading | paused | completed | failed | canceled
  progress      TEXT,                   -- JSON: last Progress snapshot
  file_path     TEXT,
  error         TEXT,                   -- JSON: FriendlyError
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  completed_at  INTEGER
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (status);
CREATE INDEX IF NOT EXISTS idx_jobs_order  ON jobs (sort_order);

CREATE TABLE IF NOT EXISTS history (
  id            TEXT PRIMARY KEY,
  url           TEXT NOT NULL,
  title         TEXT,
  thumbnail     TEXT,
  uploader      TEXT,
  duration      REAL,
  platform      TEXT NOT NULL,
  options       TEXT NOT NULL,
  file_path     TEXT,
  size_bytes    INTEGER,
  completed_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_history_completed ON history (completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_history_platform  ON history (platform);
