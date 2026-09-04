import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/** A checkmark drawn with an SVG pathLength animation. */
export function Checkmark({ size = 16, className, delay = 0 }: { size?: number; className?: string; delay?: number }) {
  const reduced = useReducedMotion();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={cn("text-success", className)}
      aria-hidden
    >
      <motion.path
        d="M5 12.5l4.5 4.5L19 7.5"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduced ? { opacity: 0 } : { pathLength: 0, opacity: 1 }}
        animate={reduced ? { opacity: 1 } : { pathLength: 1, opacity: 1 }}
        transition={reduced ? { duration: 0.16, delay } : { type: "spring", stiffness: 400, damping: 30, delay }}
      />
    </svg>
  );
}
