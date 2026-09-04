import { useEffect } from "react";
import { readClipboardText } from "@/lib/tauri";
import { extractUrls, isMac } from "@/lib/utils";
import { useUi } from "@/stores/ui";
import { useQueue } from "@/stores/queue";

function inEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return !!target.closest("[role=dialog],[role=listbox],[role=menu]");
}

/**
 * Global keyboard shortcuts:
 *   Cmd/Ctrl+V   paste-and-queue (when focus is not in a text field)
 *   Space        pause / resume the selected item
 *   Cmd/Ctrl+,   settings
 *   Cmd/Ctrl+1/2/3  switch views
 *   ↑ / ↓        move selection · Enter opens details · Esc closes / deselects
 *   Delete       remove selected item
 */
export function useShortcuts() {
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey;
      const ui = useUi.getState();
      const q = useQueue.getState();

      if (mod && e.key === ",") {
        e.preventDefault();
        ui.setView("settings");
        return;
      }
      if (mod && ["1", "2", "3"].includes(e.key)) {
        e.preventDefault();
        ui.setView((["queue", "history", "settings"] as const)[Number(e.key) - 1]);
        return;
      }

      if (inEditable(e.target)) return;

      if (mod && e.key.toLowerCase() === "v") {
        e.preventDefault();
        const text = await readClipboardText();
        const urls = extractUrls(text);
        if (!urls.length) {
          ui.showToast("No links on the clipboard", "error");
          return;
        }
        ui.setView("queue");
        await q.quickQueue(urls);
        ui.markClipboardSeen(text.trim());
        ui.showToast(urls.length === 1 ? "Queued 1 link" : `Queued ${urls.length} links`);
        return;
      }

      if (ui.view !== "queue") return;

      switch (e.key) {
        case " ": {
          const id = q.selectedId;
          if (!id) return;
          e.preventDefault();
          const job = q.jobs[id];
          if (!job) return;
          if (job.status === "downloading" || job.status === "queued") void q.pause(id);
          else if (job.status === "paused") q.resume(id);
          else if (job.status === "failed" || job.status === "canceled") q.retry(id);
          return;
        }
        case "ArrowDown":
          e.preventDefault();
          q.moveSelection(1);
          return;
        case "ArrowUp":
          e.preventDefault();
          q.moveSelection(-1);
          return;
        case "Enter":
          if (q.selectedId) {
            e.preventDefault();
            q.expand(q.expandedId === q.selectedId ? null : q.selectedId);
          }
          return;
        case "Escape":
          if (q.expandedId) q.expand(null);
          else q.select(null);
          return;
        case "Delete":
        case "Backspace":
          if (q.selectedId && !q.expandedId) {
            e.preventDefault();
            void q.remove(q.selectedId);
          }
          return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
