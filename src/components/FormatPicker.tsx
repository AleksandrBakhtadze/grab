import { motion, useReducedMotion } from "framer-motion";
import { Film, Music, Scissors } from "lucide-react";
import type { AudioFormat, Container, DownloadOptions, MediaInfo, Quality } from "@/types";
import { formatBytes } from "@/lib/format";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const QUALITIES: { id: Quality; label: string; h: number }[] = [
  { id: "best", label: "", h: Infinity },
  { id: "2160", label: "2160p · 4K", h: 2160 },
  { id: "1440", label: "1440p · 2K", h: 1440 },
  { id: "1080", label: "1080p", h: 1080 },
  { id: "720", label: "720p", h: 720 },
  { id: "480", label: "480p", h: 480 },
  { id: "360", label: "360p", h: 360 },
];

const CONTAINERS: { id: Container; label: string }[] = [
  { id: "mp4", label: "MP4" },
  { id: "mkv", label: "MKV" },
  { id: "webm", label: "WebM" },
];

const AUDIO: { id: AudioFormat; label: string; hint: "fmt.mp3hint" | "fmt.m4ahint" | "fmt.opushint" }[] = [
  { id: "mp3", label: "MP3", hint: "fmt.mp3hint" },
  { id: "m4a", label: "M4A", hint: "fmt.m4ahint" },
  { id: "opus", label: "OPUS", hint: "fmt.opushint" },
];

/** Rough size for a preset given yt-dlp's format list. `null` when unknown. */
export function estimateSize(info: MediaInfo | undefined, o: DownloadOptions): { bytes: number | null; approx: boolean } {
  if (!info || info.kind !== "video" || !info.formats.length) return { bytes: null, approx: true };
  const f = info.formats;
  const audioOnly = f.filter((x) => x.vcodec === "none" && x.acodec !== "none");
  const bestAudio = audioOnly.sort((a, b) => (b.abr ?? b.tbr ?? 0) - (a.abr ?? a.tbr ?? 0))[0];
  const audioBytes = bestAudio?.filesize ?? null;

  if (o.mode === "audio") return { bytes: audioBytes, approx: !!bestAudio?.filesizeIsEstimate };

  const cap = o.quality === "best" ? Infinity : Number(o.quality);
  const video = f
    .filter((x) => x.vcodec && x.vcodec !== "none" && (x.height ?? 0) <= cap)
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0) || (b.tbr ?? 0) - (a.tbr ?? 0));
  const bestVideo = video[0];
  if (!bestVideo) return { bytes: null, approx: true };
  const progressive = bestVideo.acodec && bestVideo.acodec !== "none";
  const v = bestVideo.filesize ?? null;
  if (v == null) return { bytes: null, approx: true };
  return {
    bytes: progressive ? v : v + (audioBytes ?? 0),
    approx: bestVideo.filesizeIsEstimate || (!progressive && (bestAudio?.filesizeIsEstimate ?? true)),
  };
}

function availableHeights(info?: MediaInfo): Set<number> {
  const s = new Set<number>();
  info?.formats.forEach((f) => f.height && s.add(f.height));
  return s;
}

/** Accepts "90", "1:30", "01:02:03". Returns "" for empty, null when invalid. */
export function normalizeClipTime(v: string): string | null {
  const s = v.trim();
  if (!s) return "";
  if (/^\d+(\.\d+)?$/.test(s)) return s;
  if (/^\d{1,2}(:\d{1,2}){1,2}(\.\d+)?$/.test(s)) return s;
  return null;
}

export function FormatPicker({
  options,
  onChange,
  info,
  compact,
  /** Hide the clip row (e.g. in Settings defaults where a range makes no sense). */
  noClip,
  /** Hide the mode switch (Spotify can only be audio). */
  audioOnly,
}: {
  options: DownloadOptions;
  onChange: (patch: Partial<DownloadOptions>) => void;
  info?: MediaInfo;
  compact?: boolean;
  noClip?: boolean;
  audioOnly?: boolean;
}) {
  const t = useT();
  const reduced = useReducedMotion();
  const heights = availableHeights(info);
  const maxH = heights.size ? Math.max(...heights) : 0;
  const size = estimateSize(info, options);
  const hasSubs = !info || info.subtitleLangs.length > 0 || info.autoCaptionLangs.length > 0;
  const clipping = !!(options.clipStart || options.clipEnd);
  const badStart = normalizeClipTime(options.clipStart) === null;
  const badEnd = normalizeClipTime(options.clipEnd) === null;

  return (
    <div className={cn("grid gap-3", compact ? "grid-cols-1" : "grid-cols-1 md:grid-cols-[auto_1fr]")}>
      {/* Mode switch */}
      {!audioOnly && (
        <div className="flex items-start">
          <div className="relative flex rounded-md border border-border bg-sunken p-0.5">
            {(["video", "audio"] as const).map((m) => {
              const active = options.mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => onChange({ mode: m })}
                  className={cn(
                    "relative flex h-7 items-center gap-1.5 rounded-[6px] px-3 text-xs font-medium transition-colors focus-ring",
                    active ? "text-fg" : "text-fg-muted hover:text-fg",
                  )}
                >
                  {active && (
                    <motion.span layoutId="mode-pill" className="absolute inset-0 rounded-[6px] border border-border bg-elevated" transition={reduced ? { duration: 0 } : spring} />
                  )}
                  <span className="relative flex items-center gap-1.5">
                    {m === "video" ? <Film className="h-3.5 w-3.5" /> : <Music className="h-3.5 w-3.5" />}
                    {m === "video" ? t("fmt.video") : t("fmt.audio")}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {options.mode === "video" && !audioOnly ? (
          <>
            <Select value={options.quality} onValueChange={(v) => onChange({ quality: v as Quality })}>
              <SelectTrigger className="w-44" aria-label={t("fmt.quality")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QUALITIES.map((q) => {
                  const unavailable = maxH > 0 && q.h !== Infinity && q.h > maxH;
                  return (
                    <SelectItem key={q.id} value={q.id} disabled={unavailable}>
                      {q.id === "best" ? t("fmt.best") : q.label}
                      {unavailable ? ` · ${t("fmt.na")}` : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <Select value={options.container} onValueChange={(v) => onChange({ container: v as Container })}>
              <SelectTrigger className="w-24" aria-label={t("fmt.container")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTAINERS.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        ) : (
          <Select value={options.audioFormat} onValueChange={(v) => onChange({ audioFormat: v as AudioFormat })}>
            <SelectTrigger className="w-56" aria-label={t("fmt.audioFormat")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AUDIO.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.label} <span className="text-fg-faint">· {t(a.hint)}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {info && (
          <span className="num text-xs text-fg-muted">
            {size.bytes != null ? `${size.approx ? "≈ " : ""}${formatBytes(size.bytes)}` : t("fmt.sizeUnknown")}
            {maxH > 0 && options.mode === "video" ? ` · ${t("fmt.sourceUpTo", { h: maxH })}` : ""}
          </span>
        )}
      </div>

      {/* Extras */}
      <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]", !compact && "md:col-span-2")}>
        <Toggle checked={options.embedThumbnail} onChange={(v) => onChange({ embedThumbnail: v })} label={t("fmt.embedThumb")} />
        <Toggle checked={options.embedMetadata} onChange={(v) => onChange({ embedMetadata: v })} label={t("fmt.embedMeta")} />
        <Toggle checked={options.subtitles} onChange={(v) => onChange({ subtitles: v })} label={t("fmt.subs")} disabled={!hasSubs} hint={!hasSubs ? t("fmt.subsNone") : undefined} />
        {options.subtitles && (
          <>
            <Toggle checked={options.embedSubtitles} onChange={(v) => onChange({ embedSubtitles: v })} label={t("fmt.embed")} disabled={options.mode === "audio"} />
            <Toggle checked={options.autoSubtitles} onChange={(v) => onChange({ autoSubtitles: v })} label={t("fmt.autoSubs")} />
            <Input value={options.subtitleLangs} onChange={(e) => onChange({ subtitleLangs: e.target.value })} className="h-7 w-40 text-xs" placeholder="en.*,-live_chat" aria-label={t("fmt.subLangs")} spellCheck={false} />
          </>
        )}
      </div>

      {/* Clip range */}
      {!noClip && (
        <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px]", !compact && "md:col-span-2")}>
          <Toggle
            checked={clipping}
            onChange={(v) => onChange(v ? { clipStart: options.clipStart || "0:00", clipEnd: options.clipEnd } : { clipStart: "", clipEnd: "" })}
            label={t("fmt.clip")}
            icon={<Scissors className="h-3.5 w-3.5 text-fg-muted" />}
          />
          {clipping && (
            <>
              <span className="text-xs text-fg-muted">{t("fmt.clipFrom")}</span>
              <Input
                value={options.clipStart}
                onChange={(e) => onChange({ clipStart: e.target.value })}
                placeholder="0:00"
                className={cn("num h-7 w-24 text-xs", badStart && "border-danger")}
                aria-label={t("fmt.clipFrom")}
                spellCheck={false}
              />
              <span className="text-xs text-fg-muted">{t("fmt.clipTo")}</span>
              <Input
                value={options.clipEnd}
                onChange={(e) => onChange({ clipEnd: e.target.value })}
                placeholder="1:30"
                className={cn("num h-7 w-24 text-xs", badEnd && "border-danger")}
                aria-label={t("fmt.clipTo")}
                spellCheck={false}
              />
              <span className="basis-full text-2xs text-fg-faint">{t("fmt.clipHint")}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  disabled,
  hint,
  icon,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
  hint?: string;
  icon?: React.ReactNode;
}) {
  return (
    <label className={cn("flex cursor-pointer items-center gap-2 select-none", disabled && "cursor-not-allowed opacity-50")}>
      <Checkbox checked={checked} disabled={disabled} onCheckedChange={(v) => onChange(v === true)} />
      {icon}
      <span>{label}</span>
      {hint && <span className="text-2xs text-fg-faint">{hint}</span>}
    </label>
  );
}
