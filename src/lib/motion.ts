import type { Transition, Variants } from "framer-motion";

/** The one spring the whole app uses for state changes. */
export const spring: Transition = { type: "spring", stiffness: 400, damping: 30 };

/** Softer spring for large surfaces (detail sheet, dialogs). */
export const springSoft: Transition = { type: "spring", stiffness: 300, damping: 32 };

/** Snappier spring for tiny UI (icons, chips). */
export const springSnappy: Transition = { type: "spring", stiffness: 600, damping: 34 };

export const fade: Transition = { duration: 0.16, ease: "linear" };

/**
 * Queue item enter/exit. Items rise 8px on enter with a 40ms stagger
 * (driven by `custom={index}`) and collapse height on exit. With reduced
 * motion, only opacity animates and the height collapse is instant.
 */
export function listItemVariants(reduced: boolean): Variants {
  if (reduced) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1, transition: fade },
      exit: { opacity: 0, height: 0, marginBottom: 0, transition: { ...fade, height: { duration: 0 } } },
    };
  }
  return {
    initial: { opacity: 0, y: 8 },
    animate: (i: number = 0) => ({
      opacity: 1,
      y: 0,
      transition: { ...spring, delay: Math.min(i, 12) * 0.04 },
    }),
    exit: {
      opacity: 0,
      height: 0,
      marginBottom: 0,
      transition: { opacity: { duration: 0.12 }, height: spring, marginBottom: spring },
    },
  };
}

/** Completion pop: 1 → 1.03 → 1 */
export const popKeyframes = {
  scale: [1, 1.03, 1],
  transition: { duration: 0.42, times: [0, 0.4, 1], ease: [0.2, 0, 0, 1] },
};

export function overlayVariants(reduced: boolean): Variants {
  return {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: reduced ? fade : { duration: 0.18 } },
    exit: { opacity: 0, transition: fade },
  };
}

export function panelVariants(reduced: boolean): Variants {
  if (reduced) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1, transition: fade },
      exit: { opacity: 0, transition: fade },
    };
  }
  return {
    initial: { opacity: 0, y: 12, scale: 0.98 },
    animate: { opacity: 1, y: 0, scale: 1, transition: springSoft },
    exit: { opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.14 } },
  };
}
