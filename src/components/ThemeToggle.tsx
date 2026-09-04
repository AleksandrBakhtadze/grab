import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Moon, Sun } from "lucide-react";
import { resolveTheme, useSettings } from "@/stores/settings";
import { springSnappy, fade } from "@/lib/motion";
import { useT } from "@/i18n";
import { Tip } from "@/components/ui/tooltip";

/**
 * Flips between light and dark. The icon rotates 90° while morphing between
 * sun and moon; the whole surface crossfades through the View Transitions API
 * (see applyTheme in stores/settings). With reduced motion the icon just fades.
 */
export function ThemeToggle() {
  const theme = useSettings((s) => s.theme);
  const set = useSettings((s) => s.set);
  const t = useT();
  const reduced = useReducedMotion();
  const resolved = resolveTheme(theme);
  const next = resolved === "dark" ? "light" : "dark";
  const label = t("theme.switch", { theme: t(next === "dark" ? "theme.dark" : "theme.light") });

  const variants = reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1, transition: fade }, exit: { opacity: 0, transition: fade } }
    : {
        initial: { opacity: 0, rotate: -90, scale: 0.6 },
        animate: { opacity: 1, rotate: 0, scale: 1, transition: springSnappy },
        exit: { opacity: 0, rotate: 90, scale: 0.6, transition: { duration: 0.12 } },
      };

  return (
    <Tip label={label}>
      <button
        type="button"
        aria-label={label}
        onClick={() => set({ theme: next })}
        className="no-drag relative flex h-7 w-7 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-sunken hover:text-fg focus-ring"
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={resolved} variants={variants} initial="initial" animate="animate" exit="exit" className="absolute flex">
            {resolved === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </motion.span>
        </AnimatePresence>
      </button>
    </Tip>
  );
}
