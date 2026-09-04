import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowDownToLine, X } from "lucide-react";
import { useUpdater } from "@/lib/updater";
import { spring, fade } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "./ProgressBar";

/**
 * Slim bar under the titlebar when a newer release exists. One click downloads,
 * verifies the signature, runs the installer silently, and relaunches.
 */
export function UpdateBanner() {
  const phase = useUpdater((s) => s.phase);
  const version = useUpdater((s) => s.version);
  const progress = useUpdater((s) => s.progress);
  const dismissed = useUpdater((s) => s.dismissed);
  const error = useUpdater((s) => s.error);
  const install = useUpdater((s) => s.install);
  const dismiss = useUpdater((s) => s.dismiss);
  const reduced = useReducedMotion();

  const busy = phase === "downloading" || phase === "installing" || phase === "ready";
  const show = !dismissed && (phase === "available" || busy || (phase === "error" && version));
  if (!show) return null;

  const label =
    phase === "downloading"
      ? progress != null
        ? `Downloading ${Math.round(progress)}%`
        : "Downloading…"
      : phase === "installing"
        ? "Installing…"
        : phase === "ready"
          ? "Restarting…"
          : phase === "error"
            ? `Update failed: ${error ?? "unknown error"}`
            : `Grab ${version} is available`;

  return (
    <AnimatePresence>
      <motion.div
        key="update"
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
        animate={reduced ? { opacity: 1, transition: fade } : { opacity: 1, y: 0, transition: spring }}
        exit={{ opacity: 0, transition: fade }}
        role="status"
        className="relative z-20 flex h-9 shrink-0 items-center gap-3 border-b border-accent/30 bg-accent/5 px-4 text-xs"
      >
        <ArrowDownToLine className="h-3.5 w-3.5 text-accent" />
        <span className="num min-w-0 flex-1 truncate">{label}</span>
        {busy && progress != null && <ProgressBar percent={progress} tone="active" className="w-32" height={3} />}
        {phase === "available" && (
          <Button size="sm" className="h-6" onClick={() => void install()}>
            Update now
          </Button>
        )}
        {phase === "error" && (
          <Button size="sm" variant="secondary" className="h-6" onClick={() => void install()}>
            Retry
          </Button>
        )}
        {!busy && (
          <button type="button" aria-label="Dismiss" onClick={dismiss} className="rounded-sm p-0.5 text-fg-faint hover:text-fg focus-ring">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
