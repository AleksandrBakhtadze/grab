import { useEffect, useState } from "react";
import { FolderOpen, RefreshCw, Scale, Sparkles } from "lucide-react";
import type { CookieBrowser, Language, Theme } from "@/types";
import { api, isTauri, openExternal, pickDirectory } from "@/lib/tauri";
import { appVersion, useUpdater } from "@/lib/updater";
import { modKey } from "@/lib/utils";
import { LANGUAGES, useT } from "@/i18n";
import { useSettings } from "@/stores/settings";
import { useUi } from "@/stores/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormatPicker } from "./FormatPicker";

const TEMPLATES = [
  { label: "Title [id]", value: "%(title)s [%(id)s].%(ext)s" },
  { label: "Title", value: "%(title)s.%(ext)s" },
  { label: "Uploader / Title", value: "%(uploader)s/%(title)s.%(ext)s" },
  { label: "Date · Title", value: "%(upload_date)s %(title)s.%(ext)s" },
  { label: "Playlist / ## Title", value: "%(playlist_title|)s/%(playlist_index|)s %(title)s.%(ext)s" },
];

const BROWSERS: { id: CookieBrowser; label: string }[] = [
  { id: "chrome", label: "Chrome" },
  { id: "firefox", label: "Firefox" },
  { id: "edge", label: "Edge" },
  { id: "brave", label: "Brave" },
  { id: "safari", label: "Safari (macOS)" },
  { id: "chromium", label: "Chromium" },
  { id: "opera", label: "Opera" },
  { id: "vivaldi", label: "Vivaldi" },
];

export function SettingsView() {
  const t = useT();
  const s = useSettings();
  const showToast = useUi((s) => s.showToast);
  const [ytdlp, setYtdlp] = useState<string>("…");
  const [ffmpeg, setFfmpeg] = useState<string>("…");
  const [updating, setUpdating] = useState(false);
  const [updateLog, setUpdateLog] = useState<string | null>(null);
  const [version, setVersion] = useState("…");
  const upd = useUpdater();

  useEffect(() => {
    void appVersion().then(setVersion);
    void s.ensureOutputDir();
    if (!isTauri) {
      setYtdlp("n/a (browser)");
      setFfmpeg("n/a (browser)");
      return;
    }
    api.ytdlpVersion().then(setYtdlp).catch((e) => setYtdlp(`error: ${e?.message ?? e?.title ?? e}`));
    api.ffmpegVersion().then(setFfmpeg).catch((e) => setFfmpeg(`error: ${e?.message ?? e?.title ?? e}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = async () => {
    setUpdating(true);
    setUpdateLog(null);
    try {
      const r = await api.updateYtdlp();
      setUpdateLog(r.output);
      if (r.version) setYtdlp(r.version);
      showToast(r.updated ? t("set.ytdlpUpdated", { v: r.version ?? "latest" }) : t("set.ytdlpLatest"));
    } catch (e: unknown) {
      const err = e as { title?: string; message?: string; raw?: string };
      setUpdateLog(err?.raw || err?.message || String(e));
      showToast(err?.title ?? t("set.updateFailed"), "error");
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[720px] px-6 py-6">
        <Section title={t("set.output")}>
          <Field label={t("set.saveTo")}>
            <div className="flex gap-2">
              <Input value={s.outputDir} onChange={(e) => s.set({ outputDir: e.target.value })} spellCheck={false} className="font-mono text-xs" />
              <Button
                variant="secondary"
                onClick={async () => {
                  const dir = await pickDirectory(s.outputDir);
                  if (dir) s.set({ outputDir: dir });
                }}
              >
                <FolderOpen className="h-3.5 w-3.5" /> {t("set.browse")}
              </Button>
            </div>
          </Field>
          <Field label={t("set.template")} hint={t("set.templateHint")}>
            <div className="flex gap-2">
              <Input value={s.filenameTemplate} onChange={(e) => s.set({ filenameTemplate: e.target.value })} spellCheck={false} className="font-mono text-xs" />
              <Select value={TEMPLATES.some((x) => x.value === s.filenameTemplate) ? s.filenameTemplate : "custom"} onValueChange={(v) => v !== "custom" && s.set({ filenameTemplate: v })}>
                <SelectTrigger className="w-44" aria-label={t("set.presets")}>
                  <SelectValue placeholder={t("set.presets")} />
                </SelectTrigger>
                <SelectContent>
                  {TEMPLATES.map((x) => (
                    <SelectItem key={x.value} value={x.value}>
                      {x.label}
                    </SelectItem>
                  ))}
                  <SelectItem value="custom">{t("set.custom")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Field>
        </Section>

        <Section title={t("set.defaultFormat")} hint={t("set.defaultFormatHint", { mod: modKey })}>
          <FormatPicker options={s.defaultOptions} onChange={s.setOptions} compact noClip />
        </Section>

        <Section title={t("set.downloads")}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label={t("set.concurrency")}>
              <Select value={String(s.concurrency)} onValueChange={(v) => s.set({ concurrency: Number(v) })}>
                <SelectTrigger aria-label={t("set.concurrency")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5, 6, 8].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("set.rateLimit")} hint={t("set.rateLimitHint")}>
              <Input value={s.rateLimit} onChange={(e) => s.set({ rateLimit: e.target.value })} placeholder={t("set.unlimited")} spellCheck={false} />
            </Field>
            <Field label={t("set.proxy")} hint={t("set.proxyHint")}>
              <Input value={s.proxy} onChange={(e) => s.set({ proxy: e.target.value })} placeholder={t("set.none")} spellCheck={false} />
            </Field>
          </div>
        </Section>

        <Section title={t("set.access")} hint={t("set.accessHint")}>
          <Field label={t("set.cookies")}>
            <Select value={s.cookiesFromBrowser || "off"} onValueChange={(v) => s.set({ cookiesFromBrowser: (v === "off" ? "" : v) as CookieBrowser })}>
              <SelectTrigger className="w-56" aria-label={t("set.cookies")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="off">{t("set.off")}</SelectItem>
                {BROWSERS.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </Section>

        <Section title={t("set.app")}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-4">
              <Field label={t("set.language")}>
                <Select value={s.language} onValueChange={(v) => s.set({ language: v as Language })}>
                  <SelectTrigger aria-label={t("set.language")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t("set.theme")}>
                <Select value={s.theme} onValueChange={(v) => s.set({ theme: v as Theme })}>
                  <SelectTrigger aria-label={t("set.theme")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="system">{t("set.themeSystem")}</SelectItem>
                    <SelectItem value="light">{t("set.themeLight")}</SelectItem>
                    <SelectItem value="dark">{t("set.themeDark")}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="space-y-3 pt-1">
              <Row label={t("set.notify")}>
                <Switch checked={s.notifications} onCheckedChange={(v) => s.set({ notifications: v })} />
              </Row>
              <Row label={t("set.clipboard")}>
                <Switch checked={s.clipboardWatch} onCheckedChange={(v) => s.set({ clipboardWatch: v })} />
              </Row>
            </div>
          </div>
        </Section>

        <Section title={t("set.tools")} hint={t("set.toolsHint")}>
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-sunken px-3 py-2 text-xs">
            <span>
              yt-dlp <span className="num font-mono text-fg-muted">{ytdlp}</span>
            </span>
            <span>
              ffmpeg <span className="num font-mono text-fg-muted">{ffmpeg}</span>
            </span>
            <Button size="sm" variant="secondary" className="ml-auto" onClick={() => void update()} disabled={updating || !isTauri}>
              <RefreshCw className={updating ? "h-3.5 w-3.5 animate-spin motion-reduce:animate-none" : "h-3.5 w-3.5"} />
              {updating ? t("set.updating") : t("set.updateYtdlp")}
            </Button>
          </div>
          {updateLog && <pre className="mt-2 max-h-32 overflow-auto rounded-md border border-border bg-surface p-2 font-mono text-2xs text-fg-muted select-text">{updateLog}</pre>}
        </Section>

        <Section title={t("set.appUpdates")} hint={t("set.appUpdatesHint")}>
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-sunken px-3 py-2 text-xs">
            <span>
              Grab <span className="num font-mono text-fg-muted">{version}</span>
            </span>
            <span className="text-fg-muted">
              {upd.phase === "checking" && t("set.checking")}
              {upd.phase === "upToDate" && t("set.latest")}
              {upd.phase === "available" && t("set.available", { v: upd.version ?? "" })}
              {(upd.phase === "downloading" || upd.phase === "installing" || upd.phase === "ready") && t("set.updatingApp")}
              {upd.phase === "error" && t("set.checkFailed", { e: upd.error ?? "" })}
            </span>
            <div className="ml-auto flex gap-2">
              {upd.phase === "available" ? (
                <Button size="sm" onClick={() => void upd.install()}>
                  <Sparkles className="h-3.5 w-3.5" /> {t("set.updateTo", { v: upd.version ?? "" })}
                </Button>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => void upd.check()} disabled={upd.phase === "checking" || !isTauri}>
                  <RefreshCw className={upd.phase === "checking" ? "h-3.5 w-3.5 animate-spin motion-reduce:animate-none" : "h-3.5 w-3.5"} />
                  {t("set.checkUpdates")}
                </Button>
              )}
            </div>
          </div>
        </Section>

        <Section title={t("set.legal")}>
          <div className="flex gap-3 rounded-md border border-border bg-sunken p-3 text-xs leading-[18px] text-fg-muted">
            <Scale className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <p>{t("legal.text")}</p>
          </div>
        </Section>

        <div className="mt-8 flex items-center justify-between text-2xs text-fg-faint">
          <span>
            Grab {version} · {t("set.madeBy")} <span className="text-fg-muted">Aleksandre Bakhtadze</span> · {t("set.builtOn")} ·{" "}
            <button type="button" className="hover:text-fg focus-ring rounded-sm" onClick={() => void openExternal("https://github.com/AleksandrBakhtadze/grab")}>
              GitHub
            </button>
          </span>
          <button type="button" className="hover:text-fg focus-ring rounded-sm" onClick={() => s.reset()}>
            {t("set.reset")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-[13px] font-semibold tracking-tight">{title}</h2>
      {hint && <p className="mt-0.5 text-xs leading-[18px] text-fg-muted">{hint}</p>}
      <div className="mt-3 space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="mb-1.5 block text-xs text-fg-muted">{label}</Label>
      {children}
      {hint && <p className="mt-1 text-2xs text-fg-faint">{hint}</p>}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 text-[13px]">
      <span>{label}</span>
      {children}
    </label>
  );
}
