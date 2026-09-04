import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, ExternalLink, FolderOpen, Pause, Play, RotateCcw, Trash2, X } from "lucide-react";
import { formatBytes, formatDuration, formatEta, formatPercent, formatSpeed } from "@/lib/format";
import { overlayVariants, panelVariants, spring } from "@/lib/motion";
import { api, openExternal } from "@/lib/tauri";
import { basename, cn } from "@/lib/utils";
import { useQueue } from "@/stores/queue";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlatformBadge } from "./PlatformBadge";
import { ProgressBar } from "./ProgressBar";
import { Checkmark } from "./Checkmark";
import { phaseLabel, toneFor } from "./QueueCard";

/**
 * Expanded view of one queue item. The thumbnail and title share layoutIds
 * with the card, so they morph into place rather than cross-fading.
 */
export function QueueDetail() {
  const id = useQueue((s) => s.expandedId);
  const job = useQueue((s) => (s.expandedId ? s.jobs[s.expandedId] : undefined));
  const expand = useQueue((s) => s.expand);
  const reduced = useReducedMotion();

  return (
    <AnimatePresence>
      {id && job && (
        <motion.div
          key="detail"
          className="absolute inset-0 z-20 flex items-start justify-center overflow-y-auto p-6 pt-8"
          variants={overlayVariants(!!reduced)}
          initial="initial"
          animate="animate"
          exit="exit"
        >
          <div className="absolute inset-0 bg-surface/80 backdrop-blur-[2px]" onClick={() => expand(null)} aria-hidden />
          <motion.div
            role="dialog"
            aria-label={job.title}
            variants={panelVariants(!!reduced)}
            className="relative w-full max-w-[680px] rounded-xl border border-border bg-elevated shadow-float"
          >
            <DetailBody jobId={job.id} onClose={() => expand(null)} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function DetailBody({ jobId, onClose }: { jobId: string; onClose: () => void }) {
  const job = useQueue((s) => s.jobs[jobId]);
  const pause = useQueue((s) => s.pause);
  const resume = useQueue((s) => s.resume);
  const cancel = useQueue((s) => s.cancel);
  const retry = useQueue((s) => s.retry);
  const remove = useQueue((s) => s.remove);
  const [showRaw, setShowRaw] = useState(false);
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [job?.log.length]);

  if (!job) return null;
  const p = job.progress;
  const percent = job.status === "completed" ? 100 : (p?.percent ?? 0);
  const busy = job.status === "downloading";
  const o = job.options;

  return (
    <div className="p-5">
      <div className="flex gap-4">
        <div className="relative aspect-video w-[240px] shrink-0 overflow-hidden rounded-lg bg-sunken">
          {job.thumbnail ? (
            <motion.img layoutId={`thumb-${job.id}`} src={job.thumbnail} alt="" className="h-full w-full object-cover" transition={spring} />
          ) : (
            <motion.div layoutId={`thumb-${job.id}`} className="h-full w-full" transition={spring} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <motion.h2 layoutId={`title-${job.id}`} transition={spring} className="min-w-0 flex-1 text-[15px] font-semibold leading-5 tracking-tight">
              {job.title}
            </motion.h2>
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close" className="-mr-2 -mt-1">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
            <PlatformBadge platform={job.platform} />
            {job.uploader && <span>{job.uploader}</span>}
            {job.duration != null && <span className="num">{formatDuration(job.duration)}</span>}
          </div>
          <button
            type="button"
            onClick={() => void openExternal(job.url)}
            className="mt-2 flex max-w-full items-center gap-1 text-xs text-fg-faint hover:text-accent focus-ring rounded-sm"
            title={job.url}
          >
            <span className="truncate">{job.url}</span>
            <ExternalLink className="h-3 w-3 shrink-0" />
          </button>
          <div className="mt-3 flex flex-wrap gap-1">
            <Badge variant="outline">{o.mode === "audio" ? `${o.audioFormat.toUpperCase()} audio` : `${o.quality === "best" ? "Best" : `${o.quality}p`} · ${o.container.toUpperCase()}`}</Badge>
            {o.embedThumbnail && <Badge variant="outline">thumbnail</Badge>}
            {o.embedMetadata && <Badge variant="outline">metadata</Badge>}
            {o.subtitles && <Badge variant="outline">subs {o.embedSubtitles ? "(embedded)" : ""}</Badge>}
          </div>
        </div>
      </div>

      {/* Progress */}
      <div className="mt-5">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className={cn("flex items-center gap-1.5 font-medium", job.status === "failed" && "text-danger", job.status === "completed" && "text-success")}>
            {job.status === "completed" && <Checkmark size={14} />}
            {phaseLabel(job)}
          </span>
          <span className="num text-fg-muted">{formatPercent(percent)}</span>
        </div>
        <ProgressBar percent={percent} tone={toneFor(job.status)} height={6} />
        <div className="num mt-2 grid grid-cols-4 gap-2 text-xs">
          <Stat label="Speed" value={busy ? formatSpeed(p?.speed) : "—"} />
          <Stat label="ETA" value={busy && p?.eta != null ? formatEta(p.eta) : "—"} />
          <Stat label="Downloaded" value={p?.downloaded ? formatBytes(p.downloaded) : "—"} />
          <Stat label="Size" value={p?.total ? formatBytes(p.total) : "—"} />
        </div>
        {job.filePath && (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-border bg-sunken px-2.5 py-1.5 text-xs">
            <span className="min-w-0 flex-1 truncate text-fg-muted" title={job.filePath}>
              {basename(job.filePath)}
            </span>
            <Button variant="ghost" size="sm" className="h-6" onClick={() => void api.revealInFolder(job.filePath!)}>
              <FolderOpen className="h-3.5 w-3.5" /> Reveal
            </Button>
          </div>
        )}
      </div>

      {/* Error */}
      {job.status === "failed" && job.error && (
        <div className="mt-4 rounded-lg border border-danger/30 bg-danger/5 p-3 text-[13px]">
          <div className="font-medium text-danger">{job.error.title}</div>
          <p className="mt-0.5 text-fg">{job.error.message}</p>
          {job.error.suggestion && <p className="mt-1.5 text-fg-muted">→ {job.error.suggestion}</p>}
          {job.error.raw && (
            <>
              <button type="button" onClick={() => setShowRaw((v) => !v)} className="mt-2 flex items-center gap-1 text-xs text-fg-faint hover:text-fg focus-ring rounded-sm">
                <ChevronDown className={cn("h-3 w-3 transition-transform", showRaw && "rotate-180")} /> raw yt-dlp output
              </button>
              {showRaw && <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-surface p-2 font-mono text-2xs text-fg-muted select-text">{job.error.raw}</pre>}
            </>
          )}
        </div>
      )}

      {/* Log */}
      {job.log.length > 0 && (
        <details className="mt-4 group">
          <summary className="cursor-pointer text-xs text-fg-faint hover:text-fg select-none">yt-dlp log ({job.log.length} lines)</summary>
          <pre ref={logRef} className="mt-2 max-h-48 overflow-auto rounded-md border border-border bg-surface p-2 font-mono text-2xs leading-4 text-fg-muted select-text">
            {job.log.join("\n")}
          </pre>
        </details>
      )}

      {/* Actions */}
      <div className="mt-5 flex items-center gap-2">
        {(job.status === "downloading" || job.status === "queued") && (
          <Button variant="secondary" onClick={() => void pause(job.id)}>
            <Pause className="h-3.5 w-3.5" /> Pause
          </Button>
        )}
        {job.status === "paused" && (
          <Button onClick={() => resume(job.id)}>
            <Play className="h-3.5 w-3.5" /> Resume
          </Button>
        )}
        {(job.status === "failed" || job.status === "canceled") && (
          <Button onClick={() => retry(job.id)}>
            <RotateCcw className="h-3.5 w-3.5" /> Retry
          </Button>
        )}
        {(job.status === "downloading" || job.status === "queued" || job.status === "paused") && (
          <Button variant="ghost" onClick={() => void cancel(job.id)}>
            <X className="h-3.5 w-3.5" /> Cancel
          </Button>
        )}
        <Button
          variant="danger"
          className="ml-auto"
          onClick={() => {
            void remove(job.id);
            onClose();
          }}
        >
          <Trash2 className="h-3.5 w-3.5" /> Remove
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-sunken px-2.5 py-1.5">
      <div className="text-2xs uppercase tracking-wider text-fg-faint">{label}</div>
      <div className="mt-0.5 text-fg">{value}</div>
    </div>
  );
}
