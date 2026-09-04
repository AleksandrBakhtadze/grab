import { useEffect } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import { cn } from "@/lib/utils";

export type BarTone = "active" | "paused" | "done" | "failed" | "idle";

/**
 * Width is driven by a spring on `scaleX` (transform-only, never `width`).
 * While `active`, a soft sheen sweeps across the filled region and stops the
 * instant the download completes (the element unmounts). Reduced motion:
 * the fill jumps to its value and the sheen is never rendered.
 */
export function ProgressBar({
  percent,
  tone = "idle",
  className,
  height = 4,
}: {
  percent: number;
  tone?: BarTone;
  className?: string;
  height?: number;
}) {
  const reduced = useReducedMotion();
  const target = Math.min(1, Math.max(0, (percent || 0) / 100));
  const raw = useMotionValue(target);
  const scaleX = useSpring(raw, { stiffness: 400, damping: 30, restDelta: 0.0005 });

  useEffect(() => {
    if (reduced) scaleX.jump(target);
    else raw.set(target);
  }, [target, reduced, raw, scaleX]);

  const active = tone === "active";
  const fill =
    tone === "failed"
      ? "bg-danger"
      : tone === "done"
        ? "bg-success"
        : tone === "paused"
          ? "bg-fg-faint"
          : "bg-accent";

  return (
    <div
      className={cn("relative w-full overflow-hidden rounded-full bg-sunken", className)}
      style={{ height }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
    >
      <motion.div
        className={cn("absolute inset-y-0 left-0 w-full origin-left rounded-full will-change-transform", fill)}
        style={{ scaleX }}
      >
        {active && !reduced && (
          <motion.div
            aria-hidden
            className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/30 to-transparent"
            initial={{ x: "-100%" }}
            animate={{ x: "400%" }}
            transition={{ repeat: Infinity, duration: 1.4, ease: "linear", repeatDelay: 0.5 }}
          />
        )}
      </motion.div>
    </div>
  );
}
