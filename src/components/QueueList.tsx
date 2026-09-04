import { AnimatePresence } from "framer-motion";
import { Pause, Play, Trash2 } from "lucide-react";
import { selectOrderedJobs, selectStats, useQueue } from "@/stores/queue";
import { Button } from "@/components/ui/button";
import { QueueCard } from "./QueueCard";
import { EmptyState } from "./EmptyState";

export function QueueList() {
  const jobs = useQueue(selectOrderedJobs);
  const stats = useQueue(selectStats);
  const selectedId = useQueue((s) => s.selectedId);
  const expandedId = useQueue((s) => s.expandedId);
  const clearFinished = useQueue((s) => s.clearFinished);
  const pause = useQueue((s) => s.pause);
  const resume = useQueue((s) => s.resume);

  const finished = jobs.filter((j) => j.status === "completed" || j.status === "failed" || j.status === "canceled").length;
  const paused = jobs.filter((j) => j.status === "paused");
  const active = jobs.filter((j) => j.status === "downloading" || j.status === "queued");

  if (jobs.length === 0) return <EmptyState />;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-center gap-3 px-6 text-xs text-fg-muted">
        <span className="num">
          {stats.downloading} downloading · {stats.queued} waiting · {finished} finished
        </span>
        <div className="ml-auto flex items-center gap-1">
          {active.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => active.forEach((j) => void pause(j.id))}>
              <Pause className="h-3.5 w-3.5" /> Pause all
            </Button>
          )}
          {paused.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => paused.forEach((j) => resume(j.id))}>
              <Play className="h-3.5 w-3.5" /> Resume all
            </Button>
          )}
          {finished > 0 && (
            <Button variant="ghost" size="sm" onClick={() => void clearFinished()}>
              <Trash2 className="h-3.5 w-3.5" /> Clear finished
            </Button>
          )}
        </div>
      </div>
      <div role="list" aria-label="Download queue" className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
        <AnimatePresence initial={false}>
          {jobs.map((job, i) => (
            <QueueCard key={job.id} job={job} index={i} selected={job.id === selectedId} expanded={job.id === expandedId} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
