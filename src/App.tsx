import { useEffect, useState } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { Link2 } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Titlebar } from "@/components/Titlebar";
import { UrlInput } from "@/components/UrlInput";
import { QueueList } from "@/components/QueueList";
import { QueueDetail } from "@/components/QueueDetail";
import { HistoryView } from "@/components/HistoryView";
import { SettingsView } from "@/components/SettingsView";
import { LegalDialog } from "@/components/LegalDialog";
import { Toast } from "@/components/Toast";
import { Splash } from "@/components/Splash";
import { UpdateBanner } from "@/components/UpdateBanner";
import { useUpdater } from "@/lib/updater";
import { useClipboardWatch } from "@/hooks/useClipboardWatch";
import { useDropUrls } from "@/hooks/useDropUrls";
import { useShortcuts } from "@/hooks/useShortcuts";
import { osPlatform } from "@/lib/tauri";
import { fade } from "@/lib/motion";
import { useQueue } from "@/stores/queue";
import { useHistory } from "@/stores/history";
import { useSettings } from "@/stores/settings";
import { useUi } from "@/stores/ui";

export default function App() {
  const view = useUi((s) => s.view);
  const dragging = useUi((s) => s.dragging);
  const hydrateQueue = useQueue((s) => s.hydrate);
  const hydrateHistory = useHistory((s) => s.hydrate);
  const concurrency = useSettings((s) => s.concurrency);
  const tick = useQueue((s) => s.tick);
  const reduced = useReducedMotion();
  const [os, setOs] = useState<"macos" | "windows" | "linux" | "other">("other");

  const checkUpdate = useUpdater((s) => s.check);

  useEffect(() => {
    void osPlatform().then(setOs);
    void hydrateHistory();
    void hydrateQueue();
    // Silent update check a moment after boot so it never competes with the splash.
    const t = setTimeout(() => void checkUpdate({ silent: true }), 2500);
    return () => clearTimeout(t);
  }, [hydrateHistory, hydrateQueue, checkUpdate]);

  // Raising the concurrency limit should start waiting items immediately.
  useEffect(() => {
    tick();
  }, [concurrency, tick]);

  useClipboardWatch();
  useDropUrls();
  useShortcuts();

  return (
    <TooltipProvider>
      <LayoutGroup>
        <div className="flex h-full flex-col bg-surface text-fg">
          <Titlebar os={os} />
          <UpdateBanner />

          <main className="relative min-h-0 flex-1">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={view}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: fade }}
                exit={{ opacity: 0, transition: fade }}
                className="absolute inset-0 flex flex-col"
              >
                {view === "queue" && (
                  <>
                    <UrlInput />
                    <div className="relative min-h-0 flex-1">
                      <QueueList />
                    </div>
                  </>
                )}
                {view === "history" && <HistoryView />}
                {view === "settings" && <SettingsView />}
              </motion.div>
            </AnimatePresence>

            <QueueDetail />
            <Toast />

            {/* Drop target overlay */}
            <AnimatePresence>
              {dragging && (
                <motion.div
                  key="drop"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, transition: fade }}
                  exit={{ opacity: 0, transition: fade }}
                  className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-surface/80 p-4"
                >
                  <motion.div
                    initial={reduced ? {} : { scale: 0.98 }}
                    animate={reduced ? {} : { scale: 1, transition: { type: "spring", stiffness: 400, damping: 30 } }}
                    className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-accent/60 text-fg"
                  >
                    <Link2 className="h-6 w-6 text-accent" />
                    <span className="text-[13px] font-medium">Drop to queue with your default format</span>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </main>
        </div>
        <LegalDialog />
        <Splash />
      </LayoutGroup>
    </TooltipProvider>
  );
}
