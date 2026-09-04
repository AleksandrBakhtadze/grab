/**
 * Thin typed wrapper over Tauri's invoke/listen so components never touch
 * command names directly. Everything degrades gracefully in a plain browser
 * (`vite dev` without Tauri) so the UI can still be iterated on.
 */
import type { DownloadEvent, DownloadOptions, FriendlyError, JobSnapshot, MediaInfo } from "@/types";

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri) throw notTauri();
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

function notTauri(): FriendlyError {
  return {
    code: "not_tauri",
    title: "Running outside Tauri",
    message: "Downloads only work inside the desktop app.",
    suggestion: "Run `npm run tauri dev` instead of `npm run dev`.",
    raw: "",
  };
}

export function asFriendly(e: unknown): FriendlyError {
  if (e && typeof e === "object" && "code" in e && "title" in e) return e as FriendlyError;
  const msg = e instanceof Error ? e.message : String(e);
  return { code: "unknown", title: "Something went wrong", message: msg, suggestion: null, raw: msg };
}

export interface DownloadSettingsPayload {
  outputDir: string;
  filenameTemplate: string;
  proxy?: string | null;
  rateLimit?: string | null;
  cookiesFromBrowser?: string | null;
}

export const api = {
  fetchMetadata(req: { url: string; cookiesFromBrowser?: string | null; proxy?: string | null; noPlaylist?: boolean }) {
    return invoke<MediaInfo>("fetch_metadata", { req });
  },
  startDownload(req: { jobId: string; url: string; options: DownloadOptions; settings: DownloadSettingsPayload }) {
    return invoke<void>("start_download", { req });
  },
  pauseDownload(jobId: string) {
    return invoke<void>("pause_download", { jobId });
  },
  cancelDownload(jobId: string) {
    return invoke<void>("cancel_download", { jobId });
  },
  getQueue() {
    return invoke<JobSnapshot[]>("get_queue");
  },
  revealInFolder(path: string) {
    return invoke<void>("reveal_in_folder", { path });
  },
  deleteFile(path: string) {
    return invoke<void>("delete_file", { path });
  },
  fileSize(path: string) {
    return invoke<number | null>("file_size", { path });
  },
  defaultDownloadDir() {
    return invoke<string>("default_download_dir");
  },
  ytdlpVersion() {
    return invoke<string>("ytdlp_version");
  },
  ffmpegVersion() {
    return invoke<string>("ffmpeg_version");
  },
  updateYtdlp() {
    return invoke<{ updated: boolean; version: string | null; output: string }>("update_ytdlp");
  },
};

/** Subscribe to every download event. Returns an unsubscribe function. */
export async function onDownloadEvent(cb: (e: DownloadEvent) => void): Promise<() => void> {
  if (!isTauri) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  const a = await listen<DownloadEvent>("download://progress", (ev) => cb(ev.payload));
  const b = await listen<DownloadEvent>("download://state", (ev) => cb(ev.payload));
  return () => {
    a();
    b();
  };
}

export async function readClipboardText(): Promise<string> {
  if (!isTauri) {
    try {
      return await navigator.clipboard.readText();
    } catch {
      return "";
    }
  }
  const { readText } = await import("@tauri-apps/plugin-clipboard-manager");
  try {
    return (await readText()) ?? "";
  } catch {
    return "";
  }
}

export async function pickDirectory(current?: string): Promise<string | null> {
  if (!isTauri) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const res = await open({ directory: true, multiple: false, defaultPath: current || undefined });
  return typeof res === "string" ? res : null;
}

export async function notify(title: string, body: string) {
  if (!isTauri) return;
  const n = await import("@tauri-apps/plugin-notification");
  let ok = await n.isPermissionGranted();
  if (!ok) ok = (await n.requestPermission()) === "granted";
  if (ok) n.sendNotification({ title, body });
}

export async function openExternal(url: string) {
  if (!isTauri) {
    window.open(url, "_blank");
    return;
  }
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  await openUrl(url);
}

export async function osPlatform(): Promise<"macos" | "windows" | "linux" | "other"> {
  if (!isTauri) return navigator.userAgent.includes("Mac") ? "macos" : "other";
  const { platform } = await import("@tauri-apps/plugin-os");
  const p = platform();
  if (p === "macos" || p === "windows" || p === "linux") return p;
  return "other";
}
