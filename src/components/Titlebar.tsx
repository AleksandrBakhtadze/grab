import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Minus, Square, X, Copy } from "lucide-react";
import { useUi, type View } from "@/stores/ui";
import { selectStats, useQueue } from "@/stores/queue";
import { formatSpeed } from "@/lib/format";
import { isTauri } from "@/lib/tauri";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./ThemeToggle";

const TABS: { id: View; label: string }[] = [
  { id: "queue", label: "Queue" },
  { id: "history", label: "History" },
  { id: "settings", label: "Settings" },
];

export function Titlebar({ os }: { os: "macos" | "windows" | "linux" | "other" }) {
  const view = useUi((s) => s.view);
  const setView = useUi((s) => s.setView);
  const stats = useQueue(selectStats);
  const reduced = useReducedMotion();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isTauri) return;
    let unlisten: (() => void) | undefined;
    (async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const w = getCurrentWindow();
      setMaximized(await w.isMaximized());
      unlisten = await w.onResized(async () => setMaximized(await w.isMaximized()));
    })();
    return () => unlisten?.();
  }, []);

  const win = async (action: "minimize" | "toggle" | "close") => {
    if (!isTauri) return;
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const w = getCurrentWindow();
    if (action === "minimize") await w.minimize();
    else if (action === "toggle") await w.toggleMaximize();
    else await w.close();
  };

  return (
    <header
      data-tauri-drag-region
      className={cn(
        "drag-region relative z-30 flex h-11 shrink-0 select-none items-center border-b border-border bg-surface",
        os === "macos" ? "pl-[78px] pr-2" : "pl-4 pr-0",
      )}
    >
      {/* Brand */}
      <div data-tauri-drag-region className="flex items-center gap-2 pointer-events-none">
        <span className="h-2 w-2 rounded-full bg-accent" aria-hidden />
        <span className="text-[13px] font-semibold tracking-tightest">Grab</span>
      </div>

      {/* Segmented nav — the active pill slides between tabs via layoutId */}
      <nav
        aria-label="Primary"
        className="no-drag absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-0.5 rounded-lg border border-border bg-elevated p-0.5"
      >
        {TABS.map((t) => {
          const active = t.id === view;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setView(t.id)}
              className={cn(
                "relative h-6 rounded-md px-3 text-xs font-medium transition-colors focus-ring",
                active ? "text-fg" : "text-fg-muted hover:text-fg",
              )}
            >
              {active && (
                <motion.span
                  layoutId="nav-pill"
                  className="absolute inset-0 rounded-md bg-sunken border border-border"
                  transition={reduced ? { duration: 0 } : spring}
                />
              )}
              <span className="relative">{t.label}</span>
              {t.id === "queue" && stats.downloading > 0 && (
                <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
              )}
            </button>
          );
        })}
      </nav>

      {/* Right cluster */}
      <div className="ml-auto flex h-full items-center gap-1">
        {stats.downloading > 0 && (
          <span className="num mr-2 text-2xs text-fg-muted" aria-live="polite">
            {stats.downloading} active · {formatSpeed(stats.speed)}
          </span>
        )}
        <ThemeToggle />
        {os !== "macos" && (
          <div className="ml-1 flex h-full items-stretch">
            <WinButton label="Minimize" onClick={() => win("minimize")}>
              <Minus className="h-3.5 w-3.5" />
            </WinButton>
            <WinButton label={maximized ? "Restore" : "Maximize"} onClick={() => win("toggle")}>
              {maximized ? <Copy className="h-3 w-3 -scale-x-100" /> : <Square className="h-3 w-3" />}
            </WinButton>
            <WinButton label="Close" onClick={() => win("close")} danger>
              <X className="h-4 w-4" />
            </WinButton>
          </div>
        )}
      </div>
    </header>
  );
}

function WinButton({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "no-drag flex w-11 items-center justify-center text-fg-muted transition-colors focus-ring",
        danger ? "hover:bg-danger hover:text-white" : "hover:bg-sunken hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}
