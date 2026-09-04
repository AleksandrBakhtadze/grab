import { memo, useRef } from "react";
import { motion, Reorder, useDragControls, useReducedMotion } from "framer-motion";
import { AlertCircle, FolderOpen, GripVertical, Pause, Play, RotateCcw, X, Clock } from "lucide-react";
import type { Job } from "@/types";
import { formatBytes, formatDuration, formatEta, formatPercent, formatSpeed } from "@/lib/format";
import { listItemVariants, popKeyframes, spring } from "@/lib/motion";
import { api } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import { useT, type TKey } from "@/i18n";
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

export function isClip(job: Job): boolean {
  return !!(job.options.clipStart || job.options.clipEnd);
}

export function phaseKey(job: Job): TKey {
  if (job.status === "downloading") {
    if (job.phase === "merging") return "phase.merging";
    if (job.phase === "converting") return "phase.converting";
    if (job.phase === "postprocessing") return "phase.finishing";
    if (job.metaPending) return "phase.resolving";
    return isClip(job) ? "phase.clipping" : "phase.downloading";
  }
  if (job.status === "queued") return job.metaPending ? "phase.resolvingDots" : "phase.waiting";
  if (job.status === "paused") return "phase.paused";
  if (job.status === "completed") return "phase.done";
  if (job.status === "failed") return "phase.failed";
  return "phase.canceled";
}

interface Props {
  job: Job;
  index: number;
  selected: boolean;
  expanded: boolean;
}

export const QueueCard = memo(function QueueCard({ job, index, selected, expanded }: Props) {
  const t = useT();
  const reduced = useReducedMotion();
  const controls = useDragControls();
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
  const busy = job.status === "downloading";
  const clip = isClip(job);
  // Clipped downloads stream through ffmpeg and report no bytes: show an
  // indeterminate (full, dimmed, shimmering) bar while running.
  const indeterminate = busy && clip && p?.percent == null;
  const percent = job.status === "completed" ? 100 : indeterminate ? 100 : (p?.percent ?? 0);
  const variants = listItemVariants(!!reduced);

  return (
    <Reorder.Item
      as="div"
      value={job}
      dragListener={false}
      dragControls={controls}
      layout="position"
      variants={variants}
      custom={index}
      initial="initial"
      animate="animate"
      exit="exit"
      whileDrag={reduced ? undefined : { scale: 1.01, zIndex: 10 }}
      className="relative mb-2 overflow-hidden"
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
          "group relative flex gap-2 rounded-lg border bg-elevated p-3 pl-1.5 outline-none transition-colors",
          selected ? "border-accent/50" : "border-border hover:border-border-strong",
          expanded && "opacity-0",
        )}
      >
        {/* Drag handle */}
        <button
          type="button"
          aria-label={t("queue.reorderHandle")}
          title={t("queue.reorderHandle")}
          onPointerDown={(e) => {
            e.preventDefault();
            controls.start(e);
          }}
          onClick={(e) => e.stopPropagation()}
          className="flex w-4 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm text-fg-faint opacity-40 transition-opacity hover:opacity-100 focus-ring active:cursor-grabbing group-hover:opacity-100"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        {/* Thumbnail (shared element with the detail view) */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            expand(job.id);
          }}
          aria-label={t("queue.openDetails")}
          className="relative h-[54px] w-[96px] shrink-0 overflow-hidden rounded-md bg-sunken focus-ring"
        >
          {job.thumbnail ? (
            <motion.img layoutId={`thumb-${job.id}`} src={job.thumbnail} alt="" className="h-full w-full object-cover" transition={spring} draggable={false} />
          ) : (
            <motion.div layoutId={`thumb-${job.id}`} className="h-full w-full bg-sunken" transition={spring} />
          )}
          {job.duration != null && (
            <span className="num absolute bottom-1 right-1 rounded-sm bg-black/70 px-1 text-2xs text-white">{formatDuration(job.duration)}</span>
          )}
        </button>

        <div className="min-w-0 flex-1 pl-1">
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
                <Tip label={t("queue.pause")}>
                  <Button variant="ghost" size="icon-sm" onClick={() => void pause(job.id)} aria-label={t("detail.pause")}>
                    <Pause className="h-3.5 w-3.5" />
                  </Button>
                </Tip>
              )}
              {job.status === "paused" && (
                <Tip label={t("queue.resume")}>
                  <Button variant="ghost" size="icon-sm" onClick={() => resume(job.id)} aria-label={t("detail.resume")}>
                    <Play className="h-3.5 w-3.5" />
                  </Button>
                </Tip>
              )}
              {(job.status === "failed" || job.status === "canceled") && (
                <Tip label={t("queue.retry")}>
                  <Button variant="ghost" size="icon-sm" onClick={() => retry(job.id)} aria-label={t("queue.retry")}>
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                </Tip>
              )}
              {job.status === "completed" && job.filePath && (
                <Tip label={t("queue.reveal")}>
                  <Button variant="ghost" size="icon-sm" onClick={() => void api.revealInFolder(job.filePath!)} aria-label={t("queue.reveal")}>
                    <FolderOpen className="h-3.5 w-3.5" />
                  </Button>
                </Tip>
              )}
              {busy || job.status === "queued" || job.status === "paused" ? (
                <Tip label={t("queue.cancel")}>
                  <Button variant="ghost" size="icon-sm" onClick={() => void cancel(job.id)} aria-label={t("queue.cancel")}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </Tip>
              ) : (
                <Tip label={t("queue.remove")}>
                  <Button variant="ghost" size="icon-sm" onClick={() => void remove(job.id)} aria-label={t("queue.remove")}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </Tip>
              )}
            </div>
          </div>

          <div className="mt-1 flex h-[18px] items-center gap-2 text-xs text-fg-muted">
            <PlatformBadge platform={job.platform} />
            {job.uploader && <span className="truncate">{job.uploader}</span>}
            {clip && <span className="num shrink-0 text-fg-faint">{t("detail.clip", { a: job.options.clipStart || "0:00", b: job.options.clipEnd || "∞" })}</span>}
            <span className="ml-auto flex shrink-0 items-center gap-1.5">
              {job.status === "completed" && <Checkmark size={14} />}
              {job.status === "failed" && <AlertCircle className="h-3.5 w-3.5 text-danger" />}
              {job.status === "queued" && <Clock className="h-3 w-3 text-fg-faint" />}
              <span className={cn(job.status === "failed" && "text-danger", job.status === "completed" && "text-success")}>{t(phaseKey(job))}</span>
            </span>
          </div>

          <ProgressBar percent={percent} tone={toneFor(job.status)} className={cn("mt-2", indeterminate && "opacity-50")} />

          <div className="num mt-1.5 flex h-4 items-center gap-3 text-2xs text-fg-faint">
            {job.status === "failed" && job.error ? (
              <span className="truncate text-danger/90">
                {job.error.title} — {job.error.message}
              </span>
            ) : indeterminate ? (
              <span className="text-fg-muted">{t("phase.clipping")}…</span>
            ) : (
              <>
                <span className="w-11 text-fg-muted">{formatPercent(percent)}</span>
                <span className="w-20">{busy ? formatSpeed(p?.speed) : p?.total ? formatBytes(p.total) : ""}</span>
                <span className="w-20">{busy && p?.eta != null ? t("queue.eta", { t: formatEta(p.eta) }) : ""}</span>
                {p?.fragCount ? (
                  <span>{t("queue.frag", { i: p.fragIndex ?? 0, n: p.fragCount })}</span>
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
    </Reorder.Item>
  );
});
