import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Download, FolderOpen, Search, Trash2, X, History as HistoryIcon } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import type { HistoryEntry, Platform } from "@/types";
import { formatBytes, formatDuration, formatRelative } from "@/lib/format";
import { PLATFORMS } from "@/lib/platform";
import { listItemVariants } from "@/lib/motion";
import { api } from "@/lib/tauri";
import { basename } from "@/lib/utils";
import { selectFiltered, useHistory } from "@/stores/history";
import { useQueue } from "@/stores/queue";
import { useUi } from "@/stores/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlatformBadge } from "./PlatformBadge";

export function HistoryView() {
  const entries = useHistory(useShallow(selectFiltered));
  const total = useHistory((s) => s.entries.length);
  const query = useHistory((s) => s.query);
  const setQuery = useHistory((s) => s.setQuery);
  const platform = useHistory((s) => s.platform);
  const setPlatform = useHistory((s) => s.setPlatform);
  const clear = useHistory((s) => s.clear);
  const reduced = useReducedMotion();

  const platforms = Object.keys(PLATFORMS) as Platform[];

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-6 py-3">
        <div className="relative w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-faint" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title, uploader, file…" className="pl-8" aria-label="Search history" />
        </div>
        <Select value={platform} onValueChange={(v) => setPlatform(v as Platform | "all")}>
          <SelectTrigger className="w-40" aria-label="Filter by platform">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All platforms</SelectItem>
            {platforms.map((p) => (
              <SelectItem key={p} value={p}>
                {PLATFORMS[p].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="num ml-auto text-xs text-fg-muted">
          {entries.length}{entries.length !== total ? ` of ${total}` : ""} items
        </span>
        {total > 0 && (
          <Button variant="ghost" size="sm" onClick={() => void clear()}>
            Clear history
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {entries.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <HistoryIcon className="mb-3 h-6 w-6 text-fg-faint" />
            <p className="text-[13px] font-medium">{total === 0 ? "Nothing downloaded yet" : "No matches"}</p>
            <p className="mt-1 text-xs text-fg-muted">
              {total === 0 ? "Finished downloads show up here, searchable and ready to re-download." : "Try a different search or platform filter."}
            </p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {entries.map((e, i) => (
              <motion.div key={e.id} layout={reduced ? false : "position"} variants={listItemVariants(!!reduced)} custom={Math.min(i, 10)} initial="initial" animate="animate" exit="exit" className="mb-2 overflow-hidden">
                <HistoryRow entry={e} />
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

function HistoryRow({ entry }: { entry: HistoryEntry }) {
  const remove = useHistory((s) => s.remove);
  const add = useQueue((s) => s.add);
  const setView = useUi((s) => s.setView);
  const showToast = useUi((s) => s.showToast);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [exists, setExists] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    if (!entry.filePath) {
      setExists(false);
      return;
    }
    api
      .fileSize(entry.filePath)
      .then((s) => alive && setExists(s != null))
      .catch(() => alive && setExists(null));
    return () => {
      alive = false;
    };
  }, [entry.filePath]);

  const redownload = async () => {
    await add([
      {
        url: entry.url,
        title: entry.title,
        thumbnail: entry.thumbnail,
        uploader: entry.uploader,
        duration: entry.duration,
        platform: entry.platform,
        options: entry.options,
      },
    ]);
    showToast("Added to queue");
    setView("queue");
  };

  const deleteFile = async () => {
    if (!entry.filePath) return;
    try {
      await api.deleteFile(entry.filePath);
      setExists(false);
      showToast("File deleted");
    } catch (e) {
      showToast("Couldn't delete file", "error");
      console.error(e);
    }
    setConfirmDelete(false);
  };

  return (
    <div className="group flex items-center gap-3 rounded-lg border border-border bg-elevated p-2.5 hover:border-border-strong">
      <div className="h-[40px] w-[72px] shrink-0 overflow-hidden rounded-md bg-sunken">
        {entry.thumbnail && <img src={entry.thumbnail} alt="" className="h-full w-full object-cover" loading="lazy" draggable={false} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium leading-4" title={entry.title}>
          {entry.title}
        </div>
        <div className="mt-1 flex items-center gap-2 text-2xs text-fg-muted">
          <PlatformBadge platform={entry.platform} />
          {entry.uploader && <span className="truncate">{entry.uploader}</span>}
          <span className="num">{formatDuration(entry.duration)}</span>
          {entry.sizeBytes != null && <span className="num">{formatBytes(entry.sizeBytes)}</span>}
          <span className="num">{formatRelative(entry.completedAt)}</span>
          {entry.filePath && (
            <span className={exists === false ? "text-danger/80" : "text-fg-faint"} title={entry.filePath}>
              {exists === false ? "file missing" : basename(entry.filePath)}
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <Button variant="ghost" size="sm" onClick={() => void redownload()} title="Re-download">
          <Download className="h-3.5 w-3.5" /> Again
        </Button>
        {entry.filePath && exists !== false && (
          <Button variant="ghost" size="icon-sm" onClick={() => void api.revealInFolder(entry.filePath!)} aria-label="Reveal in folder" title="Reveal in folder">
            <FolderOpen className="h-3.5 w-3.5" />
          </Button>
        )}
        {entry.filePath && exists !== false && (
          confirmDelete ? (
            <span className="flex items-center gap-1 rounded-md border border-danger/40 px-1 py-0.5 text-2xs">
              <span className="text-danger">Delete file?</span>
              <Button variant="danger" size="sm" className="h-5 px-1.5" onClick={() => void deleteFile()}>
                Yes
              </Button>
              <Button variant="ghost" size="sm" className="h-5 px-1.5" onClick={() => setConfirmDelete(false)}>
                No
              </Button>
            </span>
          ) : (
            <Button variant="ghost" size="icon-sm" onClick={() => setConfirmDelete(true)} aria-label="Delete file" title="Delete file from disk">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )
        )}
        <Button variant="ghost" size="icon-sm" onClick={() => void remove(entry.id)} aria-label="Remove from history" title="Remove from history">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
