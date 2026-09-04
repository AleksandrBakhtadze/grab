import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ClipboardPaste, Plus, X } from "lucide-react";
import { extractUrls, modKey } from "@/lib/utils";
import { spring, fade } from "@/lib/motion";
import { useUi } from "@/stores/ui";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MetadataPreview } from "./MetadataPreview";
import { FormatPicker } from "./FormatPicker";

/**
 * The composer: paste field → staged previews → format picker → "Add to queue".
 * Multiple URLs (newline / space separated) are accepted at once.
 */
export function UrlInput() {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const reduced = useReducedMotion();

  const staged = useUi((s) => s.staged);
  const stage = useUi((s) => s.stage);
  const clearStaged = useUi((s) => s.clearStaged);
  const commit = useUi((s) => s.commit);
  const batchOptions = useUi((s) => s.batchOptions);
  const setBatchOptions = useUi((s) => s.setBatchOptions);
  const clipboardUrls = useUi((s) => s.clipboardUrls);
  const markClipboardSeen = useUi((s) => s.markClipboardSeen);
  const lastSeen = useUi((s) => s.lastSeenClipboard);
  const showToast = useUi((s) => s.showToast);

  // Auto-grow up to ~5 lines without layout jank on every keystroke.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [text]);

  const submit = () => {
    const urls = extractUrls(text);
    if (!urls.length) {
      if (text.trim()) showToast("That doesn't look like a link", "error");
      return;
    }
    void stage(urls);
    setText("");
  };

  const ready = staged.filter((s) => s.state === "ready");
  const readyCount = ready.reduce((n, s) => n + (s.info?.kind === "playlist" ? s.selected.length : 1), 0);
  const loading = staged.some((s) => s.state === "loading");
  const singleVideo = ready.length === 1 && staged.length === 1 && ready[0].info?.kind === "video" ? ready[0].info : undefined;

  const onCommit = async () => {
    const n = await commit();
    if (n > 0) showToast(n === 1 ? "Added 1 item to the queue" : `Added ${n} items to the queue`);
  };

  const chipVariants = reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1, transition: fade }, exit: { opacity: 0, transition: fade } }
    : { initial: { opacity: 0, y: -6 }, animate: { opacity: 1, y: 0, transition: spring }, exit: { opacity: 0, y: -6, transition: { duration: 0.12 } } };

  return (
    <section className="border-b border-border bg-surface px-6 pb-4 pt-4" aria-label="Add links">
      <div className="relative">
        <Textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          placeholder="Paste one or more links — YouTube, Instagram, TikTok, X, Reddit, Vimeo…"
          className="min-h-[44px] py-3 pl-4 pr-24 text-[14px] leading-5"
          aria-label="Links to download"
        />
        <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1">
          <Button size="sm" onClick={submit} disabled={!text.trim()} aria-keyshortcuts="Enter">
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {clipboardUrls.length > 0 && staged.length === 0 && (
          <motion.div key="chip" variants={chipVariants} initial="initial" animate="animate" exit="exit" className="mt-2 flex">
            <button
              type="button"
              onClick={() => {
                void stage(clipboardUrls);
                markClipboardSeen(lastSeen);
              }}
              className="group flex max-w-full items-center gap-2 rounded-full border border-accent/30 bg-accent/5 py-1 pl-2.5 pr-1.5 text-xs text-fg transition-colors hover:bg-accent/10 focus-ring"
            >
              <ClipboardPaste className="h-3.5 w-3.5 text-accent" />
              <span className="truncate">
                Paste detected link{clipboardUrls.length > 1 ? `s (${clipboardUrls.length})` : ""}:{" "}
                <span className="text-fg-muted">{clipboardUrls[0]}</span>
              </span>
              <span
                role="button"
                aria-label="Dismiss"
                onClick={(e) => {
                  e.stopPropagation();
                  markClipboardSeen(lastSeen);
                }}
                className="ml-1 rounded-full p-0.5 text-fg-faint hover:bg-sunken hover:text-fg"
              >
                <X className="h-3 w-3" />
              </span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {staged.length > 0 && (
          <motion.div
            key="staging"
            initial={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={reduced ? { opacity: 1, transition: fade } : { opacity: 1, height: "auto", transition: spring }}
            exit={reduced ? { opacity: 0, transition: fade } : { opacity: 0, height: 0, transition: { duration: 0.16 } }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-2">
              <AnimatePresence initial={false}>
                {staged.map((item) => (
                  <motion.div
                    key={item.key}
                    layout={!reduced}
                    initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
                    animate={reduced ? { opacity: 1, transition: fade } : { opacity: 1, y: 0, transition: spring }}
                    exit={{ opacity: 0, transition: fade }}
                  >
                    <MetadataPreview item={item} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            <div className="mt-3 rounded-lg border border-border bg-elevated p-3">
              <FormatPicker options={batchOptions} onChange={setBatchOptions} info={singleVideo} />
            </div>

            <div className="mt-3 flex items-center gap-2">
              <Button onClick={onCommit} disabled={readyCount === 0 || loading}>
                {loading ? "Fetching details…" : readyCount === 1 ? "Add to queue" : `Add ${readyCount} to queue`}
              </Button>
              <Button variant="ghost" onClick={clearStaged}>
                Clear
              </Button>
              <span className="ml-auto text-2xs text-fg-faint">
                Tip: {modKey}+V anywhere queues instantly with your default format.
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
