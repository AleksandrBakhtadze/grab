import { useEffect } from "react";
import { extractUrls } from "@/lib/utils";
import { useUi } from "@/stores/ui";
import { useQueue } from "@/stores/queue";

/**
 * Accept a link dragged from a browser tab / address bar onto the window.
 * Requires `dragDropEnabled: false` in tauri.conf.json so the webview's own
 * HTML5 drag events fire instead of Tauri's file-drop handler.
 */
export function useDropUrls() {
  useEffect(() => {
    let depth = 0;
    const setDragging = useUi.getState().setDragging;

    const hasLink = (dt: DataTransfer | null) =>
      !!dt && Array.from(dt.types).some((t) => t === "text/uri-list" || t === "text/plain" || t === "text/x-moz-url");

    const onEnter = (e: DragEvent) => {
      if (!hasLink(e.dataTransfer)) return;
      e.preventDefault();
      depth++;
      setDragging(true);
    };
    const onOver = (e: DragEvent) => {
      if (!hasLink(e.dataTransfer)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const onLeave = (e: DragEvent) => {
      if (!hasLink(e.dataTransfer)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      depth = 0;
      setDragging(false);
      const dt = e.dataTransfer;
      if (!dt) return;
      const text = dt.getData("text/uri-list") || dt.getData("text/x-moz-url") || dt.getData("text/plain");
      if (!text) return;
      e.preventDefault();
      const urls = extractUrls(text.split("\n").filter((l) => !l.startsWith("#")).join("\n"));
      if (urls.length) {
        void useQueue.getState().quickQueue(urls);
        useUi.getState().showToast(urls.length === 1 ? "Queued 1 link" : `Queued ${urls.length} links`);
      }
    };

    document.addEventListener("dragenter", onEnter);
    document.addEventListener("dragover", onOver);
    document.addEventListener("dragleave", onLeave);
    document.addEventListener("drop", onDrop);
    return () => {
      document.removeEventListener("dragenter", onEnter);
      document.removeEventListener("dragover", onOver);
      document.removeEventListener("dragleave", onLeave);
      document.removeEventListener("drop", onDrop);
    };
  }, []);
}
