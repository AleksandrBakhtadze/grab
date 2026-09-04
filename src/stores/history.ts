import { create } from "zustand";
import type { HistoryEntry, Platform } from "@/types";
import { historyRepo } from "@/lib/db";

interface HistoryStore {
  entries: HistoryEntry[];
  hydrated: boolean;
  query: string;
  platform: Platform | "all";
  hydrate: () => Promise<void>;
  add: (e: HistoryEntry) => Promise<void>;
  remove: (id: string) => Promise<void>;
  clear: () => Promise<void>;
  setQuery: (q: string) => void;
  setPlatform: (p: Platform | "all") => void;
}

export const useHistory = create<HistoryStore>()((set, get) => ({
  entries: [],
  hydrated: false,
  query: "",
  platform: "all",

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const entries = await historyRepo.all();
      set({ entries, hydrated: true });
    } catch (e) {
      console.error("history hydrate failed", e);
      set({ hydrated: true });
    }
  },

  add: async (e) => {
    set({ entries: [e, ...get().entries.filter((x) => x.id !== e.id)] });
    await historyRepo.insert(e).catch(console.error);
  },

  remove: async (id) => {
    set({ entries: get().entries.filter((x) => x.id !== id) });
    await historyRepo.remove(id).catch(console.error);
  },

  clear: async () => {
    set({ entries: [] });
    await historyRepo.clear().catch(console.error);
  },

  setQuery: (query) => set({ query }),
  setPlatform: (platform) => set({ platform }),
}));

export function selectFiltered(s: HistoryStore): HistoryEntry[] {
  const q = s.query.trim().toLowerCase();
  return s.entries.filter((e) => {
    if (s.platform !== "all" && e.platform !== s.platform) return false;
    if (!q) return true;
    return (
      e.title.toLowerCase().includes(q) ||
      (e.uploader ?? "").toLowerCase().includes(q) ||
      e.url.toLowerCase().includes(q) ||
      (e.filePath ?? "").toLowerCase().includes(q)
    );
  });
}
