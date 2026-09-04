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
  spotify: { label: "Spotify", hue: "#1DB954", hosts: /(^|\.)(open\.spotify\.com|spotify\.com)$/i },
  other: { label: "Web", hue: "#8A8A8A", hosts: /$^/ },
};

/** `watch?v=…&list=…` (or youtu.be/ID?list=…): both a video and a playlist. */
export function isMixedYoutubeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (!/(^|\.)(youtube\.com|youtu\.be|music\.youtube\.com)$/.test(host)) return false;
    const list = u.searchParams.get("list");
    if (!list || list.startsWith("RD")) return false; // RD… = auto-generated Mix, treat as single video
    const hasVideo = host.endsWith("youtu.be") ? u.pathname.length > 1 : !!u.searchParams.get("v") || u.pathname.startsWith("/shorts/");
    return hasVideo;
  } catch {
    return false;
  }
}

/** Anything that will resolve to a list of items rather than one file. */
export function looksLikePlaylist(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    const p = u.pathname.toLowerCase();
    if (/(^|\.)spotify\.com$/.test(host)) return /\/(playlist|album)\//.test(p);
    if (/(^|\.)(youtube\.com|music\.youtube\.com)$/.test(host)) {
      if (p.startsWith("/playlist")) return true;
      if (/^\/(@[^/]+|channel\/|c\/|user\/)/.test(p)) return true;
      return isMixedYoutubeUrl(url);
    }
    if (/(^|\.)soundcloud\.com$/.test(host)) return /\/sets\//.test(p);
    if (/(^|\.)vimeo\.com$/.test(host)) return /\/(showcase|album|channels)\//.test(p);
    return false;
  } catch {
    return false;
  }
}

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
  if (e.startsWith("spotify")) return "spotify";
  return fallback;
}

export function platformLabel(p: Platform): string {
  return PLATFORMS[p]?.label ?? "Web";
}
