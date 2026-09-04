import { forwardRef, memo, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AlertCircle, FolderOpen, Pause, Play, RotateCcw, X, Clock } from "lucide-react";
import type { Job } from "@/types";
import { formatBytes, formatDuration, formatEta, formatPercent, formatSpeed } from "@/lib/format";
import { listItemVariants, popKeyframes, spring } from "@/lib/motion";
import { api } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import { useQueue } from "@/stores/queue";
import { Button } from "@/components/ui/button";
import { Tip } from "@/components/ui/tooltip";
import { PlatformBadge } from "./PlatformBadge";
import { ProgressBar, type BarTone } from "./ProgressBar";
import { Checkmark } from "./Checkmark";

export function toneFor(status: Job["status"]): BarTone {
  switch (status) {
    case "downloading":
      return "active";
    case "paused":
      return "paused";
    case "completed":
      return "done";
    case "failed":
      return "failed";
    default:
      return "idle";
  }
}

export function phaseLabel(job: Job): string {
  if (job.status === "downloading") {
    if (job.phase === "merging") return "Merging";
    if (job.phase === "converting") return "Converting";
    if (job.phase === "postprocessing") return "Finishing";
    if (job.metaPending) return "Resolving";
    return "Downloading";
  }
  if (job.status === "queued") return job.metaPending ? "Resolving…" : "Waiting";
  if (job.status === "paused") return "Paused";
  if (job.status === "completed") return "Done";
  if (job.status === "failed") return "Failed";
  return "Canceled";
}

interface Props {
  job: Job;
  index: number;
  selected: boolean;
  expanded: boolean;
}

export const QueueCard = memo(
  forwardRef<HTMLDivElement, Props>(function QueueCard({ job, index, selected, expanded }, ref) {
    const reduced = useReducedMotion();
    const select = useQueue((s) => s.select);
    const expand = useQueue((s) => s.expand);
    const pause = useQueue((s) => s.pause);
    const resume = useQueue((s) => s.resume);
    const cancel = useQueue((s) => s.cancel);
    const retry = useQueue((s) => s.retry);
    const remove = useQueue((s) => s.remove);

    // Pop only when completion happens while mounted (not for hydrated history).
    const mountedCompleted = useRef(job.status === "completed");
    const shouldPop = job.status === "completed" && !mountedCompleted.current;

    const p = job.progress;
    const percent = job.status === "completed" ? 100 : (p?.percent ?? 0);
    const busy = job.status === "downloading";
    const variants = listItemVariants(!!reduced);

    return (
      <motion.div
        ref={ref}
        layout={reduced ? false : "position"}
        variants={variants}
        custom={index}
        initial="initial"
        animate="animate"
        exit="exit"
        className="mb-2 overflow-hidden"
      >
        <motion.div
          animate={shouldPop && !reduced ? popKeyframes : { scale: 1 }}
          onAnimationComplete={() => {
            if (job.status === "completed") mountedCompleted.current = true;
          }}
          onClick={() => select(job.id)}
          onDoubleClick={() => expand(job.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter") expand(job.id);
          }}
          tabIndex={0}
          role="listitem"
          aria-selected={selected}
          className={cn(
            "group relative flex gap-3 rounded-lg border bg-elevated p-3 outline-none transition-colors",
            selected ? "border-accent/50" : "border-border hover:border-border-strong",
            expanded && "opacity-0",
          )}
        >
          {/* Thumbnail (shared element with the detail view) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              expand(job.id);
            }}
            aria-label="Open details"
            className="relative h-[54px] w-[96px] shrink-0 overflow-hidden rounded-md bg-sunken focus-ring"
          >
            {job.thumbnail ? (
              <motion.img
                layoutId={`thumb-${job.id}`}
                src={job.thumbnail}
                alt=""
                className="h-full w-full object-cover"
                transition={spring}
                draggable={false}
              />
            ) : (
              <motion.div layoutId={`thumb-${job.id}`} className="h-full w-full bg-sunken" transition={spring} />
            )}
            {job.duration != null && (
              <span className="num absolute bottom-1 right-1 rounded-sm bg-black/70 px-1 text-2xs text-white">
                {formatDuration(job.duration)}
              </span>
            )}
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <motion.h3
                layoutId={`title-${job.id}`}
                transition={spring}
                className={cn("min-w-0 flex-1 truncate text-[13px] font-medium leading-4 tracking-tight", job.metaPending && "text-fg-muted")}
                title={job.title}
              >
                {job.title}
              </motion.h3>

              {/* Actions — visible on hover / selection, always for failed */}
              <div
                className={cn(
                  "flex shrink-0 items-center gap-0.5 transition-opacity",
                  selected || job.status === "failed" ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100",
                )}
                onClick={(e) => e.stopPropagation()}
              >
                {(job.status === "downloading" || job.status === "queued") && (
                  <Tip label="Pause (Space)">
                    <Button variant="ghost" size="icon-sm" onClick={() => void pause(job.id)} aria-label="Pause">
                      <Pause className="h-3.5 w-3.5" />
                    </Button>
                  </Tip>
                )}
                {job.status === "paused" && (
                  <Tip label="Resume (Space)">
                    <Button variant="ghost" size="icon-sm" onClick={() => resume(job.id)} aria-label="Resume">
                      <Play className="h-3.5 w-3.5" />
                    </Button>
                  </Tip>
                )}
                {(job.status === "failed" || job.status === "canceled") && (
                  <Tip label="Retry">
                    <Button variant="ghost" size="icon-sm" onClick={() => retry(job.id)} aria-label="Retry">
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  </Tip>
                )}
                {job.status === "completed" && job.filePath && (
                  <Tip label="Reveal in folder">
                    <Button variant="ghost" size="icon-sm" onClick={() => void api.revealInFolder(job.filePath!)} aria-label="Reveal in folder">
                      <FolderOpen className="h-3.5 w-3.5" />
                    </Button>
                  </Tip>
                )}
                {busy || job.status === "queued" || job.status === "paused" ? (
                  <Tip label="Cancel">
                    <Button variant="ghost" size="icon-sm" onClick={() => void cancel(job.id)} aria-label="Cancel">
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </Tip>
                ) : (
                  <Tip label="Remove from queue">
                    <Button variant="ghost" size="icon-sm" onClick={() => void remove(job.id)} aria-label="Remove">
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </Tip>
                )}
              </div>
            </div>

            <div className="mt-1 flex h-[18px] items-center gap-2 text-xs text-fg-muted">
              <PlatformBadge platform={job.platform} />
              {job.uploader && <span className="truncate">{job.uploader}</span>}
              <span className="ml-auto flex shrink-0 items-center gap-1.5">
                {job.status === "completed" && <Checkmark size={14} />}
                {job.status === "failed" && <AlertCircle className="h-3.5 w-3.5 text-danger" />}
                {job.status === "queued" && <Clock className="h-3 w-3 text-fg-faint" />}
                <span className={cn(job.status === "failed" && "text-danger", job.status === "completed" && "text-success")}>
                  {phaseLabel(job)}
                </span>
              </span>
            </div>

            <ProgressBar percent={percent} tone={toneFor(job.status)} className="mt-2" />

            <div className="num mt-1.5 flex h-4 items-center gap-3 text-2xs text-fg-faint">
              {job.status === "failed" && job.error ? (
                <span className="truncate text-danger/90">{job.error.title} — {job.error.message}</span>
              ) : (
                <>
                  <span className="w-11 text-fg-muted">{formatPercent(percent)}</span>
                  <span className="w-20">{busy ? formatSpeed(p?.speed) : p?.total ? formatBytes(p.total) : ""}</span>
                  <span className="w-20">{busy && p?.eta != null ? `ETA ${formatEta(p.eta)}` : ""}</span>
                  {p?.fragCount ? (
                    <span>
                      frag {p.fragIndex ?? 0}/{p.fragCount}
                    </span>
                  ) : p?.downloaded && p?.total ? (
                    <span>
                      {formatBytes(p.downloaded)} / {formatBytes(p.total)}
                    </span>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    );
  }),
);
