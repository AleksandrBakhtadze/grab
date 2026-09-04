import { AnimatePresence, Reorder } from "framer-motion";
import { Pause, Play, Trash2 } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import type { Job } from "@/types";
import { useT } from "@/i18n";
import { selectOrderedJobs, selectStats, useQueue } from "@/stores/queue";
import { Button } from "@/components/ui/button";
import { QueueCard } from "./QueueCard";
import { EmptyState } from "./EmptyState";

export function QueueList() {
  const t = useT();
  // Selectors that build a new array/object must be shallow-compared, or
  // Zustand v5 sees a new snapshot every render and React loops (error #185).
  const jobs = useQueue(useShallow(selectOrderedJobs));
  const stats = useQueue(useShallow(selectStats));
  const selectedId = useQueue((s) => s.selectedId);
  const expandedId = useQueue((s) => s.expandedId);
  const clearFinished = useQueue((s) => s.clearFinished);
  const reorder = useQueue((s) => s.reorder);
  const pause = useQueue((s) => s.pause);
  const resume = useQueue((s) => s.resume);

  const finished = jobs.filter((j) => j.status === "completed" || j.status === "failed" || j.status === "canceled").length;
  const paused = jobs.filter((j) => j.status === "paused");
  const active = jobs.filter((j) => j.status === "downloading" || j.status === "queued");

  if (jobs.length === 0) return <EmptyState />;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-center gap-3 px-6 text-xs text-fg-muted">
        <span className="num">{t("queue.stats", { d: stats.downloading, q: stats.queued, f: finished })}</span>
        <div className="ml-auto flex items-center gap-1">
          {active.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => active.forEach((j) => void pause(j.id))}>
              <Pause className="h-3.5 w-3.5" /> {t("queue.pauseAll")}
            </Button>
          )}
          {paused.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => paused.forEach((j) => resume(j.id))}>
              <Play className="h-3.5 w-3.5" /> {t("queue.resumeAll")}
            </Button>
          )}
          {finished > 0 && (
            <Button variant="ghost" size="sm" onClick={() => void clearFinished()}>
              <Trash2 className="h-3.5 w-3.5" /> {t("queue.clearFinished")}
            </Button>
          )}
        </div>
      </div>
      <Reorder.Group
        as="div"
        axis="y"
        values={jobs}
        onReorder={(next: Job[]) => reorder(next.map((j) => j.id))}
        role="list"
        aria-label={t("queue.aria")}
        className="min-h-0 flex-1 overflow-y-auto px-6 pb-6"
      >
        <AnimatePresence initial={false}>
          {jobs.map((job, i) => (
            <QueueCard key={job.id} job={job} index={i} selected={job.id === selectedId} expanded={job.id === expandedId} />
          ))}
        </AnimatePresence>
      </Reorder.Group>
    </div>
  );
}
