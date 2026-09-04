import { motion, useReducedMotion } from "framer-motion";
import { AlertCircle, ListVideo, ListChecks, RotateCcw, X } from "lucide-react";
import type { StagedItem } from "@/types";
import { formatCount, formatDuration } from "@/lib/format";
import { fade } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n";
import { useUi } from "@/stores/ui";
import { Button } from "@/components/ui/button";
import { PlatformBadge } from "./PlatformBadge";
import { PlaylistPicker } from "./PlaylistPicker";

/**
 * Shimmer block. Sized identically to the element it stands in for so the
 * layout doesn't move when real data lands.
 */
export function Skeleton({ className }: { className?: string }) {
  const reduced = useReducedMotion();
  return (
    <div className={cn("relative overflow-hidden rounded-sm bg-sunken", className)} aria-hidden>
      {!reduced && (
        <motion.div
          className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-fg/[0.06] to-transparent"
          initial={{ x: "-100%" }}
          animate={{ x: "300%" }}
          transition={{ repeat: Infinity, duration: 1.4, ease: "linear" }}
        />
      )}
    </div>
  );
}

const THUMB = "h-[72px] w-[128px] shrink-0 rounded-md";

export function MetadataPreview({ item }: { item: StagedItem }) {
  const t = useT();
  const unstage = useUi((s) => s.unstage);
  const stage = useUi((s) => s.stage);
  const resolveChoice = useUi((s) => s.resolveChoice);
  const setScope = useUi((s) => s.setScope);
  const info = item.info;
  const loading = item.state === "loading";
  const kindWord = item.platform === "spotify" ? t("kind.track") : t("kind.video");

  return (
    <div className="rounded-lg border border-border bg-elevated p-3">
      <div className="flex gap-3">
        {/* Thumbnail — fixed box, image fades in over the skeleton */}
        <div className={cn(THUMB, "relative overflow-hidden bg-sunken")}>
          {loading && <Skeleton className="absolute inset-0 rounded-md" />}
          {item.state === "choice" && (
            <div className="absolute inset-0 flex items-center justify-center text-fg-faint">
              <ListVideo className="h-5 w-5" />
            </div>
          )}
          {item.state === "ready" && info?.thumbnail && (
            <motion.img src={info.thumbnail} alt="" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={fade} className="absolute inset-0 h-full w-full object-cover" />
          )}
          {item.state === "ready" && info?.kind === "playlist" && (
            <span className="num absolute bottom-1 right-1 flex items-center gap-1 rounded-sm bg-black/70 px-1.5 py-0.5 text-2xs text-white">
              <ListVideo className="h-3 w-3" /> {info.entries.length}
            </span>
          )}
          {item.state === "error" && (
            <div className="absolute inset-0 flex items-center justify-center text-danger">
              <AlertCircle className="h-5 w-5" />
            </div>
          )}
        </div>

        {/* Text column — every line has a fixed height in both states */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              {loading ? (
                <>
                  <Skeleton className="mb-1.5 h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </>
              ) : item.state === "choice" ? (
                <h3 className="text-[13px] font-medium leading-4 tracking-tight">{t("preview.mixed.title")}</h3>
              ) : item.state === "ready" && info ? (
                <h3 className="line-clamp-2 text-[13px] font-medium leading-4 tracking-tight" title={info.title}>
                  {info.title}
                </h3>
              ) : (
                <h3 className="text-[13px] font-medium leading-4 text-danger">{item.error?.title ?? t("preview.fetchFailed")}</h3>
              )}
            </div>
            <Button variant="ghost" size="icon-sm" aria-label={t("preview.remove")} onClick={() => unstage(item.key)} className="-mr-1 -mt-1 shrink-0">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="mt-2 flex h-[18px] items-center gap-2 text-xs text-fg-muted">
            <PlatformBadge platform={item.platform} />
            {loading ? (
              <>
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-10" />
              </>
            ) : item.state === "ready" && info ? (
              <>
                {info.uploader && <span className="truncate">{info.uploader}</span>}
                {info.kind === "playlist" ? (
                  <span className="num shrink-0">{t("preview.items", { n: info.entries.length })}</span>
                ) : (
                  <>
                    <span className="num shrink-0">{formatDuration(info.duration)}</span>
                    {info.viewCount != null && <span className="num shrink-0">{t("preview.views", { n: formatCount(info.viewCount) })}</span>}
                    {info.isLive && <span className="text-danger">{t("preview.live")}</span>}
                  </>
                )}
              </>
            ) : (
              <span className="truncate">{item.url}</span>
            )}
          </div>

          {/* Mixed video+playlist link: ask before fetching */}
          {item.state === "choice" && (
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void resolveChoice(item.key, false)}>
                {t("preview.mixed.video")}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => void resolveChoice(item.key, true)}>
                <ListVideo className="h-3.5 w-3.5" /> {t("preview.mixed.playlist")}
              </Button>
            </div>
          )}

          {item.state === "error" && item.error && (
            <div className="mt-2 rounded-md border border-danger/30 bg-danger/5 p-2 text-xs">
              <p className="text-fg">{item.error.message}</p>
              {item.error.suggestion && <p className="mt-1 text-fg-muted">{item.error.suggestion}</p>}
              <Button
                variant="outline"
                size="sm"
                className="mt-2 h-6"
                onClick={() => {
                  unstage(item.key);
                  void stage([item.url]);
                }}
              >
                <RotateCcw className="h-3 w-3" /> {t("preview.retry")}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Playlist result: first only / whole / pick */}
      {item.state === "ready" && info?.kind === "playlist" && item.askScope && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-accent/30 bg-accent/5 p-2.5">
          <span className="mr-1 text-xs text-fg">{t("preview.scope.title", { title: info.title, n: info.entries.length })}</span>
          <Button size="sm" onClick={() => setScope(item.key, "first")}>
            {t("preview.scope.first", { kind: kindWord })}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setScope(item.key, "all")}>
            <ListVideo className="h-3.5 w-3.5" /> {t("preview.scope.all", { n: info.entries.length })}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setScope(item.key, "pick")}>
            <ListChecks className="h-3.5 w-3.5" /> {t("preview.scope.pick")}
          </Button>
        </div>
      )}

      {item.state === "ready" && info?.kind === "playlist" && !item.askScope && <PlaylistPicker item={item} />}
    </div>
  );
}
