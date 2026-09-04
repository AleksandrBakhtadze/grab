import { create } from "zustand";
import type { DownloadOptions, StagedItem } from "@/types";
import { api, asFriendly } from "@/lib/tauri";
import { detectPlatform, isMixedYoutubeUrl, looksLikePlaylist, platformFromExtractor } from "@/lib/platform";
import { uid } from "@/lib/utils";
import { t } from "@/i18n";
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
  /** Answer the "just this video / whole playlist" prompt for a mixed link. */
  resolveChoice: (key: string, wholePlaylist: boolean) => Promise<void>;
  /** Answer the "first only / whole playlist / let me pick" prompt. */
  setScope: (key: string, scope: "first" | "all" | "pick") => void;
  unstage: (key: string) => void;
  clearStaged: () => void;
  toggleEntry: (key: string, entryId: string) => void;
  setEntries: (key: string, ids: string[]) => void;
  commit: () => Promise<number>;
  /**
   * Quick-queue for Ctrl+V / drag-drop / clipboard chip: single-item links go
   * straight to the queue with the default format; anything that looks like a
   * playlist is staged so the user is asked what they want.
   */
  quickOrStage: (urls: string[]) => Promise<void>;

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

export const useUi = create<UiStore>()((set, get) => {
  const patchItem = (key: string, p: Partial<StagedItem>) =>
    set({ staged: get().staged.map((x) => (x.key === key ? { ...x, ...p } : x)) });

  const fetchFor = async (key: string, url: string, platform: StagedItem["platform"], noPlaylist: boolean) => {
    const s = useSettings.getState();
    try {
      const info = await api.fetchMetadata({
        url,
        cookiesFromBrowser: s.cookiesFromBrowser || null,
        proxy: s.proxy || null,
        noPlaylist,
      });
      const isList = info.kind === "playlist";
      patchItem(key, {
        state: "ready",
        info,
        platform: platformFromExtractor(info.extractor, platform),
        // Playlists start with nothing selected and the scope prompt open.
        selected: [],
        askScope: isList && info.entries.length > 1,
      });
      if (isList && info.entries.length === 1) patchItem(key, { selected: [info.entries[0].id] });
    } catch (e) {
      patchItem(key, { state: "error", error: asFriendly(e) });
    }
  };

  return {
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
        state: isMixedYoutubeUrl(url) ? "choice" : "loading",
        selected: [],
      }));
      const freshBatch = get().staged.length === 0;
      const defaults = useSettings.getState().defaultOptions;
      // Spotify can only be matched to audio; pre-select it for a fresh batch.
      const spotify = items.some((i) => i.platform === "spotify");
      set({
        staged: [...get().staged, ...items],
        ...(freshBatch ? { batchOptions: spotify ? { ...defaults, mode: "audio" } : defaults } : {}),
      });
      await Promise.all(items.filter((i) => i.state === "loading").map((i) => fetchFor(i.key, i.url, i.platform, true)));
    },

    resolveChoice: async (key, wholePlaylist) => {
      const item = get().staged.find((s) => s.key === key);
      if (!item) return;
      patchItem(key, { state: "loading" });
      await fetchFor(key, item.url, item.platform, !wholePlaylist);
    },

    setScope: (key, scope) => {
      const item = get().staged.find((s) => s.key === key);
      const entries = item?.info?.entries ?? [];
      if (!item) return;
      const selected = scope === "first" ? entries.slice(0, 1).map((e) => e.id) : scope === "all" ? entries.map((e) => e.id) : [];
      patchItem(key, { selected, askScope: false });
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
      const consumed = new Set<string>();
      for (const s of staged) {
        if (s.state !== "ready" || !s.info || s.askScope) continue;
        const info = s.info;
        // Spotify resolves through YouTube search; video mode makes no sense there.
        const opts = s.platform === "spotify" && batchOptions.mode !== "audio" ? { ...batchOptions, mode: "audio" as const } : batchOptions;
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
              options: opts,
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
            options: opts,
          });
        }
        consumed.add(s.key);
      }
      await useQueue.getState().add(items);
      set({ staged: staged.filter((s) => !consumed.has(s.key)) });
      return items.length;
    },

    quickOrStage: async (urls) => {
      const lists = urls.filter(looksLikePlaylist);
      const singles = urls.filter((u) => !looksLikePlaylist(u));
      if (singles.length) await useQueue.getState().quickQueue(singles);
      if (lists.length) {
        set({ view: "queue" });
        void get().stage(lists);
        get().showToast(t("input.chooseFirst"));
      } else if (singles.length) {
        get().showToast(singles.length === 1 ? t("queued1") : t("queuedN", { n: singles.length }));
      }
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
  };
});
