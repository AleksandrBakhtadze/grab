import { create } from "zustand";
import type { DownloadEvent, DownloadOptions, HistoryEntry, Job, Platform } from "@/types";
import { jobsRepo } from "@/lib/db";
import { api, asFriendly, notify, onDownloadEvent } from "@/lib/tauri";
import { detectPlatform, platformFromExtractor } from "@/lib/platform";
import { uid } from "@/lib/utils";
import { t } from "@/i18n";
import { useSettings } from "./settings";
import { useHistory } from "./history";

export interface NewJob {
  url: string;
  title: string;
  thumbnail?: string | null;
  uploader?: string | null;
  duration?: number | null;
  platform: Platform;
  options: DownloadOptions;
  metaPending?: boolean;
}

interface QueueStore {
  jobs: Record<string, Job>;
  order: string[];
  hydrated: boolean;
  selectedId: string | null;
  expandedId: string | null;

  hydrate: () => Promise<void>;
  add: (items: NewJob[]) => Promise<string[]>;
  quickQueue: (urls: string[]) => Promise<void>;
  pause: (id: string) => Promise<void>;
  resume: (id: string) => void;
  cancel: (id: string) => Promise<void>;
  retry: (id: string) => void;
  remove: (id: string) => Promise<void>;
  clearFinished: () => Promise<void>;
  select: (id: string | null) => void;
  moveSelection: (delta: number) => void;
  expand: (id: string | null) => void;
  /** New full ordering of job ids (from drag-to-reorder). */
  reorder: (ids: string[]) => void;
  /** Edit options of an item that hasn't started (queued / paused / failed / canceled). */
  setOptions: (id: string, patch: Partial<DownloadOptions>) => void;
  handleEvent: (e: DownloadEvent) => void;
  tick: () => void;
}

const ACTIVE: Job["status"][] = ["downloading"];
const FINISHED: Job["status"][] = ["completed", "failed", "canceled"];

/* ---------- persistence with light debouncing for hot progress rows ---------- */

const pendingPersist = new Map<string, ReturnType<typeof setTimeout>>();
function persistNow(job: Job | undefined) {
  if (!job) return;
  jobsRepo.upsert(job).catch((e) => console.error("persist job", e));
}
function persistSoon(job: Job | undefined, ms = 1000) {
  if (!job) return;
  const t = pendingPersist.get(job.id);
  if (t) return;
  pendingPersist.set(
    job.id,
    setTimeout(() => {
      pendingPersist.delete(job.id);
      persistNow(useQueue.getState().jobs[job.id]);
    }, ms),
  );
}

const starting = new Set<string>();
let listenerAttached = false;
let sessionCompleted = 0;
let sessionFailed = 0;

export const useQueue = create<QueueStore>()((set, get) => {
  const update = (id: string, patch: Partial<Job>, persist: "now" | "soon" | "none" = "now") => {
    const cur = get().jobs[id];
    if (!cur) return;
    const next = { ...cur, ...patch };
    set({ jobs: { ...get().jobs, [id]: next } });
    if (persist === "now") persistNow(next);
    else if (persist === "soon") persistSoon(next);
  };

  const launch = async (id: string) => {
    const job = get().jobs[id];
    if (!job) return;
    const s = useSettings.getState();
    const outputDir = await s.ensureOutputDir();
    update(id, {
      status: "downloading",
      phase: "downloading",
      error: null,
      progress: job.progress ? { ...job.progress, speed: null, eta: null } : null,
    });
    try {
      await api.startDownload({
        jobId: id,
        url: job.url,
        options: job.options,
        settings: {
          outputDir,
          filenameTemplate: s.filenameTemplate,
          proxy: s.proxy || null,
          rateLimit: s.rateLimit || null,
          cookiesFromBrowser: s.cookiesFromBrowser || null,
        },
      });
    } catch (e) {
      update(id, { status: "failed", error: asFriendly(e) });
      get().tick();
    }
  };

  /** Resolve title/thumbnail for a quick-queued URL; expand playlists. */
  const enrich = async (id: string) => {
    const job = get().jobs[id];
    if (!job) return;
    const s = useSettings.getState();
    try {
      const info = await api.fetchMetadata({
        url: job.url,
        cookiesFromBrowser: s.cookiesFromBrowser || null,
        proxy: s.proxy || null,
      });
      const platform = platformFromExtractor(info.extractor, job.platform);
      if (info.kind === "playlist" && info.entries.length > 0) {
        // Replace the placeholder with one job per entry, preserving position.
        const idx = get().order.indexOf(id);
        const base = job.sortOrder;
        const created: Job[] = info.entries.map((e, i) => ({
          id: uid(),
          url: e.url,
          title: e.title,
          thumbnail: e.thumbnail ?? null,
          uploader: e.uploader ?? info.uploader ?? null,
          duration: e.duration ?? null,
          platform,
          options: job.options,
          status: "queued",
          progress: null,
          sortOrder: base + i / (info.entries.length + 1),
          createdAt: Date.now(),
          log: [],
        }));
        const jobs = { ...get().jobs };
        delete jobs[id];
        created.forEach((j) => (jobs[j.id] = j));
        const order = [...get().order];
        order.splice(idx < 0 ? order.length : idx, idx < 0 ? 0 : 1, ...created.map((j) => j.id));
        set({ jobs, order, selectedId: get().selectedId === id ? created[0].id : get().selectedId });
        await jobsRepo.remove(id);
        created.forEach(persistNow);
      } else {
        update(id, {
          title: info.title,
          thumbnail: info.thumbnail ?? null,
          uploader: info.uploader ?? null,
          duration: info.duration ?? null,
          platform,
          metaPending: false,
        });
      }
    } catch (e) {
      update(id, { status: "failed", error: asFriendly(e), metaPending: false });
    }
    get().tick();
  };

  const maybeNotifyDone = () => {
    const { jobs } = get();
    const busy = Object.values(jobs).some((j) => j.status === "downloading" || j.status === "queued");
    if (busy || (sessionCompleted === 0 && sessionFailed === 0)) return;
    if (useSettings.getState().notifications) {
      const parts = [];
      if (sessionCompleted) parts.push(t("notify.finished", { n: sessionCompleted }));
      if (sessionFailed) parts.push(t("notify.failed", { n: sessionFailed }));
      void notify(t("notify.title"), parts.join(", "));
    }
    sessionCompleted = 0;
    sessionFailed = 0;
  };

  return {
    jobs: {},
    order: [],
    hydrated: false,
    selectedId: null,
    expandedId: null,

    hydrate: async () => {
      if (get().hydrated) return;
      let list: Job[] = [];
      try {
        list = await jobsRepo.all();
      } catch (e) {
        console.error("queue hydrate", e);
      }
      let running = new Set<string>();
      try {
        running = new Set((await api.getQueue()).map((s) => s.jobId));
      } catch {
        /* not in tauri */
      }
      const jobs: Record<string, Job> = {};
      for (const j of list) {
        const status = j.status === "downloading" && !running.has(j.id) ? "queued" : j.status;
        const metaPending = status === "queued" && j.title === j.url;
        jobs[j.id] = { ...j, status, metaPending, log: [] };
      }
      const order = list.map((j) => j.id);
      set({ jobs, order, hydrated: true });

      if (!listenerAttached) {
        listenerAttached = true;
        void onDownloadEvent((e) => get().handleEvent(e));
      }
      Object.values(jobs)
        .filter((j) => j.metaPending)
        .forEach((j) => void enrich(j.id));
      get().tick();
    },

    add: async (items) => {
      if (!items.length) return [];
      const { jobs, order } = get();
      const base = order.length ? Math.max(...order.map((id) => jobs[id]?.sortOrder ?? 0)) + 1 : 1;
      const created: Job[] = items.map((it, i) => ({
        id: uid(),
        url: it.url,
        title: it.title,
        thumbnail: it.thumbnail ?? null,
        uploader: it.uploader ?? null,
        duration: it.duration ?? null,
        platform: it.platform,
        options: it.options,
        status: "queued",
        progress: null,
        sortOrder: base + i,
        createdAt: Date.now(),
        log: [],
        metaPending: it.metaPending ?? false,
      }));
      const next = { ...jobs };
      created.forEach((j) => (next[j.id] = j));
      set({ jobs: next, order: [...order, ...created.map((j) => j.id)] });
      created.forEach(persistNow);
      created.filter((j) => j.metaPending).forEach((j) => void enrich(j.id));
      get().tick();
      return created.map((j) => j.id);
    },

    quickQueue: async (urls) => {
      const opts = useSettings.getState().defaultOptions;
      const existing = new Set(Object.values(get().jobs).map((j) => j.url));
      const fresh = urls.filter((u) => !existing.has(u));
      await get().add(
        fresh.map((url) => ({
          url,
          title: url,
          platform: detectPlatform(url),
          options: opts,
          metaPending: true,
        })),
      );
    },

    pause: async (id) => {
      const j = get().jobs[id];
      if (!j) return;
      if (j.status === "downloading") {
        update(id, { status: "paused" });
        try {
          await api.pauseDownload(id);
        } catch {
          /* process may have just exited; the state event will settle it */
        }
      } else if (j.status === "queued") {
        update(id, { status: "paused" });
      }
      get().tick();
    },

    resume: (id) => {
      const j = get().jobs[id];
      if (!j || j.status !== "paused") return;
      update(id, { status: "queued", error: null });
      get().tick();
    },

    cancel: async (id) => {
      const j = get().jobs[id];
      if (!j) return;
      if (j.status === "downloading") {
        try {
          await api.cancelDownload(id);
          return; // terminal event will arrive
        } catch {
          /* fall through */
        }
      }
      update(id, { status: "canceled", progress: null });
      get().tick();
    },

    retry: (id) => {
      const j = get().jobs[id];
      if (!j) return;
      update(id, { status: "queued", error: null, progress: null, phase: undefined, filePath: null });
      get().tick();
    },

    remove: async (id) => {
      const j = get().jobs[id];
      if (!j) return;
      if (j.status === "downloading") {
        try {
          await api.cancelDownload(id);
        } catch {
          /* ignore */
        }
      }
      const jobs = { ...get().jobs };
      delete jobs[id];
      set({
        jobs,
        order: get().order.filter((x) => x !== id),
        selectedId: get().selectedId === id ? null : get().selectedId,
        expandedId: get().expandedId === id ? null : get().expandedId,
      });
      await jobsRepo.remove(id).catch(console.error);
      get().tick();
    },

    clearFinished: async () => {
      const { jobs, order } = get();
      const gone = order.filter((id) => FINISHED.includes(jobs[id]?.status));
      if (!gone.length) return;
      const next = { ...jobs };
      gone.forEach((id) => delete next[id]);
      set({
        jobs: next,
        order: order.filter((id) => !gone.includes(id)),
        selectedId: gone.includes(get().selectedId ?? "") ? null : get().selectedId,
        expandedId: gone.includes(get().expandedId ?? "") ? null : get().expandedId,
      });
      await jobsRepo.removeMany(gone).catch(console.error);
    },

    select: (id) => set({ selectedId: id }),

    moveSelection: (delta) => {
      const { order, selectedId } = get();
      if (!order.length) return;
      const idx = selectedId ? order.indexOf(selectedId) : -1;
      const next = Math.min(order.length - 1, Math.max(0, idx + delta));
      set({ selectedId: order[next] });
    },

    expand: (id) => set({ expandedId: id, selectedId: id ?? get().selectedId }),

    reorder: (ids) => {
      const { jobs, order } = get();
      // Ignore stale lists (e.g. an item was removed mid-drag).
      if (ids.length !== order.length || ids.some((id) => !jobs[id])) return;
      const next = { ...jobs };
      ids.forEach((id, i) => {
        next[id] = { ...next[id], sortOrder: i + 1 };
      });
      set({ jobs: next, order: ids });
      ids.forEach((id) => persistSoon(next[id], 300));
      get().tick();
    },

    setOptions: (id, patch) => {
      const j = get().jobs[id];
      if (!j || j.status === "downloading" || j.status === "completed") return;
      update(id, { options: { ...j.options, ...patch } });
    },

    handleEvent: (e) => {
      const job = get().jobs[e.jobId];
      if (!job) return;
      switch (e.type) {
        case "progress": {
          if (job.status !== "downloading") return; // late line after pause/cancel
          update(e.jobId, { progress: e.progress, phase: e.phase }, "soon");
          return;
        }
        case "log": {
          const log = job.log.length >= 200 ? [...job.log.slice(-150), e.line] : [...job.log, e.line];
          update(e.jobId, { log }, "none");
          return;
        }
        case "state": {
          if (e.status === "completed") {
            sessionCompleted++;
            const completedAt = Date.now();
            update(e.jobId, {
              status: "completed",
              filePath: e.filePath ?? job.filePath ?? null,
              completedAt,
              phase: undefined,
              progress: { ...(job.progress ?? { status: "finished" }), status: "finished", percent: 100, speed: null, eta: null },
            });
            const entry: HistoryEntry = {
              id: uid(),
              url: job.url,
              title: job.title,
              thumbnail: job.thumbnail,
              uploader: job.uploader,
              duration: job.duration,
              platform: job.platform,
              options: job.options,
              filePath: e.filePath ?? null,
              sizeBytes: null,
              completedAt,
            };
            const path = e.filePath;
            (path ? api.fileSize(path).catch(() => null) : Promise.resolve(null)).then((size) => {
              void useHistory.getState().add({ ...entry, sizeBytes: size ?? null });
            });
          } else if (e.status === "failed") {
            sessionFailed++;
            update(e.jobId, { status: "failed", error: e.error ?? null, phase: undefined });
          } else if (e.status === "paused") {
            update(e.jobId, { status: "paused", phase: undefined });
          } else if (e.status === "canceled") {
            update(e.jobId, { status: "canceled", progress: null, phase: undefined });
          }
          get().tick();
          maybeNotifyDone();
          return;
        }
      }
    },

    tick: () => {
      const { jobs, order } = get();
      const limit = Math.max(1, useSettings.getState().concurrency);
      let active = order.filter((id) => ACTIVE.includes(jobs[id]?.status)).length;
      for (const id of order) {
        if (active >= limit) break;
        const j = jobs[id];
        if (!j || j.status !== "queued" || j.metaPending || starting.has(id)) continue;
        starting.add(id);
        active++;
        void launch(id).finally(() => starting.delete(id));
      }
    },
  };
});

/* ---------- selectors ---------- */

export const selectOrderedJobs = (s: QueueStore) => s.order.map((id) => s.jobs[id]).filter(Boolean);

export function selectStats(s: QueueStore) {
  let downloading = 0;
  let queued = 0;
  let speed = 0;
  for (const id of s.order) {
    const j = s.jobs[id];
    if (!j) continue;
    if (j.status === "downloading") {
      downloading++;
      speed += j.progress?.speed ?? 0;
    } else if (j.status === "queued") queued++;
  }
  return { downloading, queued, speed };
}
