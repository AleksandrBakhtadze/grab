import type { Platform } from "@/types";

interface PlatformMeta {
  label: string;
  /** Brand-ish hue used only for the tiny badge dot — the app accent stays singular. */
  hue: string;
  hosts: RegExp;
}

export const PLATFORMS: Record<Platform, PlatformMeta> = {
  youtube: { label: "YouTube", hue: "#FF0033", hosts: /(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com|music\.youtube\.com)$/i },
  instagram: { label: "Instagram", hue: "#E1306C", hosts: /(^|\.)(instagram\.com|instagr\.am)$/i },
  tiktok: { label: "TikTok", hue: "#25F4EE", hosts: /(^|\.)(tiktok\.com|vm\.tiktok\.com)$/i },
  pinterest: { label: "Pinterest", hue: "#E60023", hosts: /(^|\.)(pinterest\.[a-z.]+|pin\.it)$/i },
  facebook: { label: "Facebook", hue: "#1877F2", hosts: /(^|\.)(facebook\.com|fb\.watch|fb\.com)$/i },
  x: { label: "X", hue: "#E7E9EA", hosts: /(^|\.)(twitter\.com|x\.com|t\.co)$/i },
  reddit: { label: "Reddit", hue: "#FF4500", hosts: /(^|\.)(reddit\.com|redd\.it|v\.redd\.it)$/i },
  vimeo: { label: "Vimeo", hue: "#1AB7EA", hosts: /(^|\.)(vimeo\.com|player\.vimeo\.com)$/i },
  twitch: { label: "Twitch", hue: "#9146FF", hosts: /(^|\.)(twitch\.tv|clips\.twitch\.tv)$/i },
  soundcloud: { label: "SoundCloud", hue: "#FF5500", hosts: /(^|\.)(soundcloud\.com|snd\.sc)$/i },
  dailymotion: { label: "Dailymotion", hue: "#0066DC", hosts: /(^|\.)(dailymotion\.com|dai\.ly)$/i },
  bilibili: { label: "Bilibili", hue: "#00A1D6", hosts: /(^|\.)(bilibili\.com|b23\.tv)$/i },
  other: { label: "Web", hue: "#8A8A8A", hosts: /$^/ },
};

export function detectPlatform(url: string): Platform {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "other";
  }
  for (const [key, meta] of Object.entries(PLATFORMS) as [Platform, PlatformMeta][]) {
    if (key !== "other" && meta.hosts.test(host)) return key;
  }
  return "other";
}

/** Friendly label when yt-dlp tells us the extractor (more precise than the URL). */
export function platformFromExtractor(extractor: string, fallback: Platform): Platform {
  const e = extractor.toLowerCase();
  if (e.startsWith("youtube")) return "youtube";
  if (e.startsWith("instagram")) return "instagram";
  if (e.startsWith("tiktok")) return "tiktok";
  if (e.startsWith("pinterest")) return "pinterest";
  if (e.startsWith("facebook")) return "facebook";
  if (e.startsWith("twitter") || e === "x") return "x";
  if (e.startsWith("reddit")) return "reddit";
  if (e.startsWith("vimeo")) return "vimeo";
  if (e.startsWith("twitch")) return "twitch";
  if (e.startsWith("soundcloud")) return "soundcloud";
  if (e.startsWith("dailymotion")) return "dailymotion";
  if (e.startsWith("bilibili")) return "bilibili";
  return fallback;
}

export function platformLabel(p: Platform): string {
  return PLATFORMS[p]?.label ?? "Web";
}
