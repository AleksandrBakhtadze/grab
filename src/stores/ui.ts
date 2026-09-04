import { create } from "zustand";
import type { DownloadOptions, StagedItem } from "@/types";
import { api, asFriendly } from "@/lib/tauri";
import { detectPlatform, platformFromExtractor } from "@/lib/platform";
import { uid } from "@/lib/utils";
import { useSettings } from "./settings";
import { useQueue, type NewJob } from "./queue";

export type View = "queue" | "history" | "settings";

interface UiStore {
  view: View;
  setView: (v: View) => void;

  /** URLs pasted into the input, resolved but not yet queued. */
  staged: StagedItem[];
  batchOptions: DownloadOptions;
  setBatchOptions: (patch: Partial<DownloadOptions>) => void;
  stage: (urls: string[]) => Promise<void>;
  unstage: (key: string) => void;
  clearStaged: () => void;
  toggleEntry: (key: string, entryId: string) => void;
  setEntries: (key: string, ids: string[]) => void;
  commit: () => Promise<number>;

  /** Link found on the clipboard when the window regained focus. */
  clipboardUrls: string[];
  setClipboardUrls: (urls: string[]) => void;
  lastSeenClipboard: string;
  markClipboardSeen: (text: string) => void;

  /** Whether a URL is being dragged over the window. */
  dragging: boolean;
  setDragging: (v: boolean) => void;

  toast: { id: number; text: string; kind: "info" | "error" } | null;
  showToast: (text: string, kind?: "info" | "error") => void;
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export const useUi = create<UiStore>()((set, get) => ({
  view: "queue",
  setView: (view) => set({ view }),

  staged: [],
  batchOptions: useSettings.getState().defaultOptions,
  setBatchOptions: (patch) => set({ batchOptions: { ...get().batchOptions, ...patch } }),

  stage: async (urls) => {
    const existing = new Set(get().staged.map((s) => s.url));
    const fresh = urls.filter((u) => !existing.has(u));
    if (!fresh.length) return;
    const items: StagedItem[] = fresh.map((url) => ({
      key: uid(),
      url,
      platform: detectPlatform(url),
      state: "loading",
      selected: [],
    }));
    // Only reset the picker when starting a fresh batch, so adding a second
    // link doesn't wipe format choices already made for the first.
    const fresh_batch = get().staged.length === 0;
    set({
      staged: [...get().staged, ...items],
      ...(fresh_batch ? { batchOptions: useSettings.getState().defaultOptions } : {}),
    });
    const s = useSettings.getState();
    await Promise.all(
      items.map(async (it) => {
        const patch = (p: Partial<StagedItem>) =>
          set({ staged: get().staged.map((x) => (x.key === it.key ? { ...x, ...p } : x)) });
        try {
          const info = await api.fetchMetadata({
            url: it.url,
            cookiesFromBrowser: s.cookiesFromBrowser || null,
            proxy: s.proxy || null,
          });
          patch({
            state: "ready",
            info,
            platform: platformFromExtractor(info.extractor, it.platform),
            selected: info.kind === "playlist" ? info.entries.map((e) => e.id) : [],
          });
        } catch (e) {
          patch({ state: "error", error: asFriendly(e) });
        }
      }),
    );
  },

  unstage: (key) => set({ staged: get().staged.filter((s) => s.key !== key) }),
  clearStaged: () => set({ staged: [] }),

  toggleEntry: (key, entryId) =>
    set({
      staged: get().staged.map((s) => {
        if (s.key !== key) return s;
        const has = s.selected.includes(entryId);
        return { ...s, selected: has ? s.selected.filter((x) => x !== entryId) : [...s.selected, entryId] };
      }),
    }),

  setEntries: (key, ids) => set({ staged: get().staged.map((s) => (s.key === key ? { ...s, selected: ids } : s)) }),

  commit: async () => {
    const { staged, batchOptions } = get();
    const items: NewJob[] = [];
    for (const s of staged) {
      if (s.state !== "ready" || !s.info) continue;
      const info = s.info;
      if (info.kind === "playlist") {
        const pick = new Set(s.selected);
        for (const e of info.entries) {
          if (!pick.has(e.id)) continue;
          items.push({
            url: e.url,
            title: e.title,
            thumbnail: e.thumbnail ?? null,
            uploader: e.uploader ?? info.uploader ?? null,
            duration: e.duration ?? null,
            platform: s.platform,
            options: batchOptions,
          });
        }
      } else {
        items.push({
          url: info.webpageUrl || s.url,
          title: info.title,
          thumbnail: info.thumbnail ?? null,
          uploader: info.uploader ?? null,
          duration: info.duration ?? null,
          platform: s.platform,
          options: batchOptions,
        });
      }
    }
    await useQueue.getState().add(items);
    set({ staged: staged.filter((s) => s.state === "error") });
    return items.length;
  },

  clipboardUrls: [],
  setClipboardUrls: (clipboardUrls) => set({ clipboardUrls }),
  lastSeenClipboard: "",
  markClipboardSeen: (text) => set({ lastSeenClipboard: text, clipboardUrls: [] }),

  dragging: false,
  setDragging: (dragging) => set({ dragging }),

  toast: null,
  showToast: (text, kind = "info") => {
    if (toastTimer) clearTimeout(toastTimer);
    set({ toast: { id: Date.now(), text, kind } });
    toastTimer = setTimeout(() => set({ toast: null }), 2600);
  },
}));
