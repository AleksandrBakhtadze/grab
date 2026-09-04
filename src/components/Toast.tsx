import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useUi } from "@/stores/ui";
import { spring, fade } from "@/lib/motion";
import { cn } from "@/lib/utils";

export function Toast() {
  const toast = useUi((s) => s.toast);
  const reduced = useReducedMotion();
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-40 flex justify-center">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={reduced ? { opacity: 1, transition: fade } : { opacity: 1, y: 0, transition: spring }}
            exit={{ opacity: 0, transition: fade }}
            role="status"
            className={cn(
              "rounded-md border px-3 py-1.5 text-xs shadow-float",
              toast.kind === "error" ? "border-danger/40 bg-elevated text-danger" : "border-border bg-elevated text-fg",
            )}
          >
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
