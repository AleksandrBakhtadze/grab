import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

const AUTHOR = "Aleksandre Bakhtadze";

/**
 * Boot animation. The arrow-into-tray mark draws itself (pathLength), the
 * wordmark rises in, then the whole sheet fades and scales away to reveal the
 * app underneath — about 1.1 s in total. Reduced motion: a short opacity fade.
 */
export function Splash() {
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setOpen(false), reduced ? 500 : 1150);
    return () => clearTimeout(t);
  }, [reduced]);

  const drawSpring = { type: "spring", stiffness: 400, damping: 30 } as const;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="splash"
          aria-hidden
          initial={{ opacity: 1 }}
          exit={reduced ? { opacity: 0, transition: { duration: 0.2 } } : { opacity: 0, scale: 1.02, transition: { duration: 0.26, ease: [0.2, 0, 0, 1] } }}
          className="pointer-events-none fixed inset-0 z-[60] flex flex-col items-center justify-center bg-surface"
        >
          <motion.svg
            width={72}
            height={72}
            viewBox="0 0 48 48"
            fill="none"
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.85 }}
            animate={reduced ? { opacity: 1, transition: { duration: 0.2 } } : { opacity: 1, scale: 1, transition: drawSpring }}
          >
            <motion.path
              d="M24 10v20"
              stroke="hsl(var(--accent))"
              strokeWidth={4.5}
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1, transition: reduced ? { duration: 0 } : { ...drawSpring, delay: 0.05 } }}
            />
            <motion.path
              d="M15 21l9 9 9-9"
              stroke="hsl(var(--accent))"
              strokeWidth={4.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1, transition: reduced ? { duration: 0 } : { ...drawSpring, delay: 0.22 } }}
            />
            <motion.path
              d="M13 38h22"
              stroke="hsl(var(--fg))"
              strokeWidth={4}
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1, transition: reduced ? { duration: 0 } : { ...drawSpring, delay: 0.38 } }}
            />
          </motion.svg>

          <motion.div
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={reduced ? { opacity: 1, transition: { duration: 0.2 } } : { opacity: 1, y: 0, transition: { ...drawSpring, delay: 0.45 } }}
            className="mt-4 text-center"
          >
            <div className="text-xl font-semibold tracking-tightest">Grab</div>
            <div className="mt-1 text-2xs text-fg-faint">by {AUTHOR}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
