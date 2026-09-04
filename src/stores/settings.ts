import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DownloadOptions, Settings, Theme } from "@/types";
import { api, isTauri } from "@/lib/tauri";

export const DEFAULT_OPTIONS: DownloadOptions = {
  mode: "video",
  quality: "best",
  container: "mp4",
  audioFormat: "mp3",
  subtitles: false,
  autoSubtitles: false,
  embedSubtitles: true,
  subtitleLangs: "en.*,-live_chat",
  embedThumbnail: true,
  embedMetadata: true,
  clipStart: "",
  clipEnd: "",
};

function systemLanguage(): "en" | "ka" {
  try {
    return (navigator.language || "").toLowerCase().startsWith("ka") ? "ka" : "en";
  } catch {
    return "en";
  }
}

export const DEFAULT_SETTINGS: Settings = {
  outputDir: "",
  filenameTemplate: "%(title)s [%(id)s].%(ext)s",
  defaultOptions: DEFAULT_OPTIONS,
  concurrency: 3,
  proxy: "",
  rateLimit: "",
  cookiesFromBrowser: "",
  theme: "system",
  language: systemLanguage(),
  notifications: true,
  clipboardWatch: true,
  legalAccepted: false,
};

interface SettingsStore extends Settings {
  set: (patch: Partial<Settings>) => void;
  setOptions: (patch: Partial<DownloadOptions>) => void;
  ensureOutputDir: () => Promise<string>;
  reset: () => void;
}

export const useSettings = create<SettingsStore>()(
  persist(
    (set, get) => ({
      ...DEFAULT_SETTINGS,
      set: (patch) => set(patch),
      setOptions: (patch) => set({ defaultOptions: { ...get().defaultOptions, ...patch } }),
      ensureOutputDir: async () => {
        const cur = get().outputDir;
        if (cur) return cur;
        if (!isTauri) return "";
        try {
          const dir = await api.defaultDownloadDir();
          set({ outputDir: dir });
          return dir;
        } catch {
          return "";
        }
      },
      reset: () => set({ ...DEFAULT_SETTINGS, legalAccepted: get().legalAccepted }),
    }),
    {
      name: "grab.settings.v1",
      partialize: (s) => {
        // Never persist functions.
        const { set: _s, setOptions: _o, ensureOutputDir: _e, reset: _r, ...rest } = s;
        return rest;
      },
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<Settings>),
        defaultOptions: { ...DEFAULT_OPTIONS, ...((persisted as Partial<Settings>)?.defaultOptions ?? {}) },
      }),
    },
  ),
);

/* ---------- Theme application ---------- */

const media = window.matchMedia("(prefers-color-scheme: dark)");

export function resolveTheme(theme: Theme): "light" | "dark" {
  return theme === "system" ? (media.matches ? "dark" : "light") : theme;
}

function applyThemeClass(theme: Theme) {
  const resolved = resolveTheme(theme);
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
}

/**
 * Crossfade the whole surface via the View Transitions API when available.
 * Falls back to an instant swap elsewhere.
 */
export function applyTheme(theme: Theme, animate = true) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (animate && !reduced && typeof doc.startViewTransition === "function") {
    doc.startViewTransition(() => applyThemeClass(theme));
  } else {
    applyThemeClass(theme);
  }
}

// Apply at boot (before first paint of React tree) and follow OS changes.
applyThemeClass(useSettings.getState().theme);
media.addEventListener("change", () => {
  if (useSettings.getState().theme === "system") applyThemeClass("system");
});
useSettings.subscribe((s, prev) => {
  if (s.theme !== prev.theme) applyTheme(s.theme);
});
