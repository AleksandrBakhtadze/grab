/**
 * SQLite persistence via tauri-plugin-sql. The queue and history survive app
 * restarts. Outside Tauri (plain `vite dev`) everything lives in memory.
 */
import type { HistoryEntry, Job } from "@/types";
import { isTauri } from "./tauri";

type Db = {
  execute(sql: string, bind?: unknown[]): Promise<unknown>;
  select<T>(sql: string, bind?: unknown[]): Promise<T>;
};

let dbPromise: Promise<Db> | null = null;

function getDb(): Promise<Db> {
  if (!dbPromise) {
    dbPromise = import("@tauri-apps/plugin-sql").then((m) => m.default.load("sqlite:grab.db") as Promise<Db>);
  }
  return dbPromise;
}

const memJobs = new Map<string, Job>();
const memHistory = new Map<string, HistoryEntry>();

interface JobRow {
  id: string;
  url: string;
  title: string | null;
  thumbnail: string | null;
  uploader: string | null;
  duration: number | null;
  platform: string;
  options: string;
  status: string;
  progress: string | null;
  file_path: string | null;
  error: string | null;
  sort_order: number;
  created_at: number;
  completed_at: number | null;
}

interface HistoryRow {
  id: string;
  url: string;
  title: string | null;
  thumbnail: string | null;
  uploader: string | null;
  duration: number | null;
  platform: string;
  options: string;
  file_path: string | null;
  size_bytes: number | null;
  completed_at: number;
}

function parse<T>(s: string | null, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

function rowToJob(r: JobRow): Job {
  return {
    id: r.id,
    url: r.url,
    title: r.title ?? r.url,
    thumbnail: r.thumbnail,
    uploader: r.uploader,
    duration: r.duration,
    platform: r.platform as Job["platform"],
    options: parse(r.options, {} as Job["options"]),
    status: r.status as Job["status"],
    progress: parse(r.progress, null),
    filePath: r.file_path,
    error: parse(r.error, null),
    sortOrder: r.sort_order,
    createdAt: r.created_at,
    completedAt: r.completed_at,
    log: [],
  };
}

function rowToHistory(r: HistoryRow): HistoryEntry {
  return {
    id: r.id,
    url: r.url,
    title: r.title ?? r.url,
    thumbnail: r.thumbnail,
    uploader: r.uploader,
    duration: r.duration,
    platform: r.platform as HistoryEntry["platform"],
    options: parse(r.options, {} as HistoryEntry["options"]),
    filePath: r.file_path,
    sizeBytes: r.size_bytes,
    completedAt: r.completed_at,
  };
}

export const jobsRepo = {
  async all(): Promise<Job[]> {
    if (!isTauri) return [...memJobs.values()].sort((a, b) => a.sortOrder - b.sortOrder);
    const db = await getDb();
    const rows = await db.select<JobRow[]>("SELECT * FROM jobs ORDER BY sort_order ASC, created_at ASC");
    return rows.map(rowToJob);
  },

  async upsert(job: Job): Promise<void> {
    if (!isTauri) {
      memJobs.set(job.id, job);
      return;
    }
    const db = await getDb();
    await db.execute(
      `INSERT INTO jobs (id, url, title, thumbnail, uploader, duration, platform, options, status, progress, file_path, error, sort_order, created_at, completed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT(id) DO UPDATE SET
         url=excluded.url, title=excluded.title, thumbnail=excluded.thumbnail, uploader=excluded.uploader,
         duration=excluded.duration, platform=excluded.platform, options=excluded.options, status=excluded.status,
         progress=excluded.progress, file_path=excluded.file_path, error=excluded.error, sort_order=excluded.sort_order,
         completed_at=excluded.completed_at`,
      [
        job.id,
        job.url,
        job.title,
        job.thumbnail ?? null,
        job.uploader ?? null,
        job.duration ?? null,
        job.platform,
        JSON.stringify(job.options),
        job.status,
        job.progress ? JSON.stringify(job.progress) : null,
        job.filePath ?? null,
        job.error ? JSON.stringify(job.error) : null,
        job.sortOrder,
        job.createdAt,
        job.completedAt ?? null,
      ],
    );
  },

  async remove(id: string): Promise<void> {
    if (!isTauri) {
      memJobs.delete(id);
      return;
    }
    const db = await getDb();
    await db.execute("DELETE FROM jobs WHERE id = $1", [id]);
  },

  async removeMany(ids: string[]): Promise<void> {
    if (!ids.length) return;
    if (!isTauri) {
      ids.forEach((id) => memJobs.delete(id));
      return;
    }
    const db = await getDb();
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(",");
    await db.execute(`DELETE FROM jobs WHERE id IN (${placeholders})`, ids);
  },
};

export const historyRepo = {
  async all(): Promise<HistoryEntry[]> {
    if (!isTauri) return [...memHistory.values()].sort((a, b) => b.completedAt - a.completedAt);
    const db = await getDb();
    const rows = await db.select<HistoryRow[]>("SELECT * FROM history ORDER BY completed_at DESC LIMIT 2000");
    return rows.map(rowToHistory);
  },

  async insert(e: HistoryEntry): Promise<void> {
    if (!isTauri) {
      memHistory.set(e.id, e);
      return;
    }
    const db = await getDb();
    await db.execute(
      `INSERT OR REPLACE INTO history (id, url, title, thumbnail, uploader, duration, platform, options, file_path, size_bytes, completed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        e.id,
        e.url,
        e.title,
        e.thumbnail ?? null,
        e.uploader ?? null,
        e.duration ?? null,
        e.platform,
        JSON.stringify(e.options),
        e.filePath ?? null,
        e.sizeBytes ?? null,
        e.completedAt,
      ],
    );
  },

  async remove(id: string): Promise<void> {
    if (!isTauri) {
      memHistory.delete(id);
      return;
    }
    const db = await getDb();
    await db.execute("DELETE FROM history WHERE id = $1", [id]);
  },

  async clear(): Promise<void> {
    if (!isTauri) {
      memHistory.clear();
      return;
    }
    const db = await getDb();
    await db.execute("DELETE FROM history");
  },
};
