import { motion, useReducedMotion } from "framer-motion";
import { ClipboardPaste, Music, ListVideo, Cookie, ArrowDownToLine } from "lucide-react";
import { PLATFORMS } from "@/lib/platform";
import { modKey } from "@/lib/utils";
import { useT } from "@/i18n";
import { useUi } from "@/stores/ui";
import { spring, fade } from "@/lib/motion";
import { Button } from "@/components/ui/button";

const SHOWCASE = ["youtube", "instagram", "tiktok", "spotify", "x", "reddit", "vimeo", "pinterest", "facebook", "twitch"] as const;

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-border bg-elevated px-1.5 font-sans text-2xs text-fg-muted">{children}</kbd>;
}

/**
 * Not a sad icon and a sentence. Shows what the app can do, how to get media
 * in fastest, and — if a link is sitting on the clipboard — a one-tap start.
 */
export function EmptyState() {
  const t = useT();
  const clipboardUrls = useUi((s) => s.clipboardUrls);
  const setView = useUi((s) => s.setView);
  const quickOrStage = useUi((s) => s.quickOrStage);
  const markClipboardSeen = useUi((s) => s.markClipboardSeen);
  const lastSeen = useUi((s) => s.lastSeenClipboard);
  const reduced = useReducedMotion();

  const item = reduced ? { initial: { opacity: 0 }, animate: { opacity: 1, transition: fade } } : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0, transition: spring } };

  return (
    <div className="flex h-full flex-col items-center justify-center px-8 py-10">
      <motion.div {...item} className="w-full max-w-[560px]">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-elevated">
            <ArrowDownToLine className="h-4 w-4 text-accent" />
          </div>
          <div>
            <h2 className="text-[15px] font-semibold tracking-tight">{t("empty.title")}</h2>
            <p className="text-[13px] text-fg-muted">{t("empty.subtitle", { mod: `${modKey} +` })}</p>
          </div>
        </div>

        {clipboardUrls.length > 0 && (
          <motion.div {...item} transition={reduced ? fade : { ...spring, delay: 0.04 }} className="mb-6 flex items-center gap-3 rounded-lg border border-accent/30 bg-accent/5 p-3">
            <ClipboardPaste className="h-4 w-4 shrink-0 text-accent" />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium">{t("empty.clip.title")}</div>
              <div className="truncate text-xs text-fg-muted">
                {clipboardUrls[0]}
                {clipboardUrls.length > 1 ? ` ${t("empty.clip.more", { n: clipboardUrls.length - 1 })}` : ""}
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => {
                markClipboardSeen(lastSeen);
                void quickOrStage(clipboardUrls);
              }}
            >
              {t("empty.clip.queue")}
            </Button>
          </motion.div>
        )}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Feature icon={<Music className="h-4 w-4" />} title={t("empty.audio.title")} body={t("empty.audio.body")} />
          <Feature icon={<ListVideo className="h-4 w-4" />} title={t("empty.playlist.title")} body={t("empty.playlist.body")} />
          <Feature
            icon={<Cookie className="h-4 w-4" />}
            title={t("empty.private.title")}
            body={t("empty.private.body")}
            action={
              <button type="button" className="text-accent hover:underline focus-ring rounded-sm" onClick={() => setView("settings")}>
                {t("empty.openSettings")}
              </button>
            }
          />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-2xs text-fg-faint">
          <span className="uppercase tracking-wider">{t("empty.worksWith")}</span>
          {SHOWCASE.map((p) => (
            <span key={p} className="flex items-center gap-1.5 text-fg-muted">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: PLATFORMS[p].hue }} aria-hidden />
              {PLATFORMS[p].label}
            </span>
          ))}
          <span className="text-fg-muted">{t("empty.more")}</span>
        </div>

        <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-2xs text-fg-faint">
          <span className="flex items-center gap-1.5">
            <Kbd>Space</Kbd> {t("empty.kbd.pause")}
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> {t("empty.kbd.select")}
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>Enter</Kbd> {t("empty.kbd.details")}
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>{modKey}</Kbd>
            <Kbd>,</Kbd> {t("empty.kbd.settings")}
          </span>
          <span className="flex items-center gap-1.5">{t("empty.kbd.drag")}</span>
        </div>
      </motion.div>
    </div>
  );
}

function Feature({ icon, title, body, action }: { icon: React.ReactNode; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-elevated p-3">
      <div className="mb-1.5 flex items-center gap-2 text-fg">
        <span className="text-fg-muted">{icon}</span>
        <span className="text-[13px] font-medium">{title}</span>
      </div>
      <p className="text-xs leading-[18px] text-fg-muted">
        {body} {action}
      </p>
    </div>
  );
}
