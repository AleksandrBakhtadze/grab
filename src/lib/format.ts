const UNITS = ["B", "KB", "MB", "GB", "TB"];

export function formatBytes(n?: number | null, digits = 1): string {
  if (n == null || !isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  let i = 0;
  let v = n;
  while (v >= 1024 && i < UNITS.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : digits)} ${UNITS[i]}`;
}

export function formatSpeed(bps?: number | null): string {
  if (bps == null || !isFinite(bps) || bps <= 0) return "—";
  return `${formatBytes(bps)}/s`;
}

/** 65 → "1:05", 3725 → "1:02:05" */
export function formatDuration(secs?: number | null): string {
  if (secs == null || !isFinite(secs) || secs < 0) return "—";
  const s = Math.round(secs);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(r).padStart(2, "0")}`;
}

/** ETA in a compact human form: "12s", "3m 20s", "1h 04m" */
export function formatEta(secs?: number | null): string {
  if (secs == null || !isFinite(secs) || secs < 0) return "—";
  const s = Math.round(secs);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, "0")}m`;
}

export function formatPercent(p?: number | null): string {
  if (p == null || !isFinite(p)) return "0%";
  return `${Math.min(100, Math.max(0, p)).toFixed(p >= 99.95 ? 0 : 1)}%`;
}

export function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const s = Math.round(diff / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatCount(n?: number | null): string {
  if (n == null) return "";
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}
