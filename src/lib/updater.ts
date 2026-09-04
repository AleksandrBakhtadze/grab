/**
 * Auto-update via tauri-plugin-updater. The app checks
 * https://github.com/AleksandrBakhtadze/grab/releases/latest/download/latest.json
 * (configured in tauri.conf.json), and every installer is verified against the
 * public key embedded in the app before it runs.
 */
import { create } from "zustand";
import { isTauri } from "./tauri";

export type UpdatePhase = "idle" | "checking" | "available" | "downloading" | "installing" | "ready" | "upToDate" | "error";

interface UpdateStore {
  phase: UpdatePhase;
  version: string | null;
  notes: string | null;
  currentVersion: string | null;
  /** 0–100 while downloading; null when size unknown. */
  progress: number | null;
  error: string | null;
  dismissed: boolean;
  check: (opts?: { silent?: boolean }) => Promise<void>;
  install: () => Promise<void>;
  dismiss: () => void;
}

type UpdateHandle = {
  version: string;
  currentVersion: string;
  body?: string | null;
  downloadAndInstall: (cb?: (e: { event: string; data?: { contentLength?: number; chunkLength?: number } }) => void) => Promise<void>;
};

let handle: UpdateHandle | null = null;

export const useUpdater = create<UpdateStore>()((set, get) => ({
  phase: "idle",
  version: null,
  notes: null,
  currentVersion: null,
  progress: null,
  error: null,
  dismissed: false,

  check: async ({ silent } = {}) => {
    if (!isTauri) {
      if (!silent) set({ phase: "upToDate" });
      return;
    }
    if (get().phase === "downloading" || get().phase === "installing") return;
    set({ phase: "checking", error: null });
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const u = (await check()) as UpdateHandle | null;
      if (u) {
        handle = u;
        set({ phase: "available", version: u.version, currentVersion: u.currentVersion, notes: u.body ?? null, dismissed: false });
      } else {
        handle = null;
        set({ phase: "upToDate" });
      }
    } catch (e) {
      // Offline, private repo, or no release yet — never bother the user on a silent check.
      const msg = e instanceof Error ? e.message : String(e);
      set({ phase: silent ? "idle" : "error", error: msg });
    }
  },

  install: async () => {
    if (!handle) return;
    set({ phase: "downloading", progress: null });
    let total = 0;
    let got = 0;
    try {
      await handle.downloadAndInstall((ev) => {
        if (ev.event === "Started") {
          total = ev.data?.contentLength ?? 0;
          set({ progress: total ? 0 : null });
        } else if (ev.event === "Progress") {
          got += ev.data?.chunkLength ?? 0;
          if (total) set({ progress: Math.min(100, (got / total) * 100) });
        } else if (ev.event === "Finished") {
          set({ phase: "installing", progress: 100 });
        }
      });
      set({ phase: "ready" });
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (e) {
      set({ phase: "error", error: e instanceof Error ? e.message : String(e) });
    }
  },

  dismiss: () => set({ dismissed: true }),
}));

export async function appVersion(): Promise<string> {
  if (!isTauri) return "dev";
  try {
    const { getVersion } = await import("@tauri-apps/api/app");
    return await getVersion();
  } catch {
    return "?";
  }
}
