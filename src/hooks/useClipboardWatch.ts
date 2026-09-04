import { useEffect } from "react";
import { readClipboardText } from "@/lib/tauri";
import { extractUrls } from "@/lib/utils";
import { useSettings } from "@/stores/settings";
import { useUi } from "@/stores/ui";
import { useQueue } from "@/stores/queue";

/**
 * When the window regains focus, peek at the clipboard. If it holds one or
 * more links we haven't seen (and haven't already queued/staged), offer a
 * one-tap chip. Never reads while the window is unfocused, never auto-queues.
 */
export function useClipboardWatch() {
  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      if (!useSettings.getState().clipboardWatch) return;
      const text = (await readClipboardText()).trim();
      if (cancelled || !text || text.length > 20_000) return;
      const ui = useUi.getState();
      if (text === ui.lastSeenClipboard) return;
      const urls = extractUrls(text);
      if (!urls.length) {
        ui.markClipboardSeen(text);
        return;
      }
      const known = new Set<string>([
        ...Object.values(useQueue.getState().jobs).map((j) => j.url),
        ...ui.staged.map((s) => s.url),
      ]);
      const fresh = urls.filter((u) => !known.has(u));
      useUi.setState({ lastSeenClipboard: text, clipboardUrls: fresh });
    };

    const onFocus = () => void check();
    const onVis = () => {
      if (document.visibilityState === "visible") void check();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    void check();
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);
}
