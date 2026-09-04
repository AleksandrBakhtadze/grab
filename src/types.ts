export type Platform =
  | "youtube"
  | "instagram"
  | "tiktok"
  | "pinterest"
  | "facebook"
  | "x"
  | "reddit"
  | "vimeo"
  | "twitch"
  | "soundcloud"
  | "dailymotion"
  | "bilibili"
  | "other";

export type JobStatus = "queued" | "downloading" | "paused" | "completed" | "failed" | "canceled";
export type Phase = "downloading" | "merging" | "converting" | "postprocessing";
export type Quality = "best" | "2160" | "1440" | "1080" | "720" | "480" | "360";
export type Container = "mp4" | "mkv" | "webm";
export type AudioFormat = "mp3" | "m4a" | "opus";
export type Theme = "system" | "light" | "dark";
export type CookieBrowser = "" | "chrome" | "firefox" | "edge" | "brave" | "safari" | "chromium" | "opera" | "vivaldi";

export interface Progress {
  status: string;
  downloaded?: number | null;
  total?: number | null;
  percent?: number | null;
  speed?: number | null;
  eta?: number | null;
  elapsed?: number | null;
  filename?: string | null;
  fragIndex?: number | null;
  fragCount?: number | null;
}

export interface FriendlyError {
  code: string;
  title: string;
  message: string;
  suggestion?: string | null;
  raw: string;
}

export interface DownloadOptions {
  mode: "video" | "audio";
  quality: Quality;
  container: Container;
  audioFormat: AudioFormat;
  subtitles: boolean;
  autoSubtitles: boolean;
  embedSubtitles: boolean;
  subtitleLangs: string;
  embedThumbnail: boolean;
  embedMetadata: boolean;
}

export interface Job {
  id: string;
  url: string;
  title: string;
  thumbnail?: string | null;
  uploader?: string | null;
  duration?: number | null;
  platform: Platform;
  options: DownloadOptions;
  status: JobStatus;
  progress?: Progress | null;
  phase?: Phase;
  filePath?: string | null;
  error?: FriendlyError | null;
  sortOrder: number;
  createdAt: number;
  completedAt?: number | null;
  /** Not persisted: last ~200 lines of yt-dlp output. */
  log: string[];
  /** Not persisted: true while a quick-queued URL is still being resolved. */
  metaPending?: boolean;
}

export interface HistoryEntry {
  id: string;
  url: string;
  title: string;
  thumbnail?: string | null;
  uploader?: string | null;
  duration?: number | null;
  platform: Platform;
  options: DownloadOptions;
  filePath?: string | null;
  sizeBytes?: number | null;
  completedAt: number;
}

export interface FormatInfo {
  formatId: string;
  ext?: string | null;
  height?: number | null;
  width?: number | null;
  fps?: number | null;
  vcodec?: string | null;
  acodec?: string | null;
  filesize?: number | null;
  filesizeIsEstimate: boolean;
  tbr?: number | null;
  abr?: number | null;
  formatNote?: string | null;
  protocol?: string | null;
}

export interface PlaylistEntry {
  id: string;
  title: string;
  url: string;
  duration?: number | null;
  thumbnail?: string | null;
  uploader?: string | null;
}

export interface MediaInfo {
  kind: "video" | "playlist";
  id: string;
  title: string;
  uploader?: string | null;
  duration?: number | null;
  thumbnail?: string | null;
  webpageUrl: string;
  extractor: string;
  isLive: boolean;
  viewCount?: number | null;
  uploadDate?: string | null;
  formats: FormatInfo[];
  entries: PlaylistEntry[];
  playlistCount?: number | null;
  subtitleLangs: string[];
  autoCaptionLangs: string[];
}

export interface Settings {
  outputDir: string;
  filenameTemplate: string;
  defaultOptions: DownloadOptions;
  concurrency: number;
  proxy: string;
  rateLimit: string;
  cookiesFromBrowser: CookieBrowser;
  theme: Theme;
  notifications: boolean;
  clipboardWatch: boolean;
  legalAccepted: boolean;
}

/** A URL the user has pasted but not yet queued. */
export interface StagedItem {
  key: string;
  url: string;
  platform: Platform;
  state: "loading" | "ready" | "error";
  info?: MediaInfo;
  error?: FriendlyError;
  /** For playlists: which entry ids are ticked. */
  selected: string[];
}

export type DownloadEvent =
  | { type: "progress"; jobId: string; phase: Phase; progress: Progress }
  | { type: "log"; jobId: string; line: string }
  | {
      type: "state";
      jobId: string;
      status: "completed" | "failed" | "paused" | "canceled";
      filePath?: string | null;
      error?: FriendlyError | null;
    };

export interface JobSnapshot {
  jobId: string;
  url: string;
  lastProgress?: Progress | null;
  lastFilename?: string | null;
  finalPath?: string | null;
  startedAt: number;
}
