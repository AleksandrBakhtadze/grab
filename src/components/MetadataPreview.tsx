import { motion, useReducedMotion } from "framer-motion";
import { AlertCircle, ListVideo, RotateCcw, X } from "lucide-react";
import type { StagedItem } from "@/types";
import { formatCount, formatDuration } from "@/lib/format";
import { fade } from "@/lib/motion";
import { cn } from "@/lib/utils";
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
  const unstage = useUi((s) => s.unstage);
  const stage = useUi((s) => s.stage);
  const info = item.info;

  return (
    <div className="rounded-lg border border-border bg-elevated p-3">
      <div className="flex gap-3">
        {/* Thumbnail — fixed box, image fades in over the skeleton */}
        <div className={cn(THUMB, "relative overflow-hidden bg-sunken")}>
          {item.state === "loading" && <Skeleton className="absolute inset-0 rounded-md" />}
          {item.state === "ready" && info?.thumbnail && (
            <motion.img
              src={info.thumbnail}
              alt=""
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={fade}
              className="absolute inset-0 h-full w-full object-cover"
            />
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
              {item.state === "loading" ? (
                <>
                  <Skeleton className="mb-1.5 h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </>
              ) : item.state === "ready" && info ? (
                <h3 className="line-clamp-2 text-[13px] font-medium leading-4 tracking-tight" title={info.title}>
                  {info.title}
                </h3>
              ) : (
                <h3 className="text-[13px] font-medium leading-4 text-danger">{item.error?.title ?? "Couldn't fetch details"}</h3>
              )}
            </div>
            <Button variant="ghost" size="icon-sm" aria-label="Remove" onClick={() => unstage(item.key)} className="-mr-1 -mt-1 shrink-0">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="mt-2 flex h-[18px] items-center gap-2 text-xs text-fg-muted">
            <PlatformBadge platform={item.platform} />
            {item.state === "loading" ? (
              <>
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-10" />
              </>
            ) : item.state === "ready" && info ? (
              <>
                {info.uploader && <span className="truncate">{info.uploader}</span>}
                {info.kind === "playlist" ? (
                  <span className="num shrink-0">{info.entries.length} items</span>
                ) : (
                  <>
                    <span className="num shrink-0">{formatDuration(info.duration)}</span>
                    {info.viewCount != null && <span className="num shrink-0">{formatCount(info.viewCount)} views</span>}
                    {info.isLive && <span className="text-danger">LIVE</span>}
                  </>
                )}
              </>
            ) : (
              <span className="truncate">{item.url}</span>
            )}
          </div>

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
                <RotateCcw className="h-3 w-3" /> Retry
              </Button>
            </div>
          )}
        </div>
      </div>

      {item.state === "ready" && info?.kind === "playlist" && <PlaylistPicker item={item} />}
    </div>
  );
}
