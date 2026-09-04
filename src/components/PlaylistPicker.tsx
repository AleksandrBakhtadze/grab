import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { StagedItem } from "@/types";
import { formatDuration } from "@/lib/format";
import { useT } from "@/i18n";
import { useUi } from "@/stores/ui";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Checkbox list of playlist / channel entries with select-all and filter. */
export function PlaylistPicker({ item }: { item: StagedItem }) {
  const t = useT();
  const toggle = useUi((s) => s.toggleEntry);
  const setEntries = useUi((s) => s.setEntries);
  const [q, setQ] = useState("");
  const entries = item.info?.entries ?? [];
  const selected = new Set(item.selected);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? entries.filter((e) => e.title.toLowerCase().includes(needle) || (e.uploader ?? "").toLowerCase().includes(needle)) : entries;
  }, [entries, q]);

  const allVisibleSelected = visible.length > 0 && visible.every((e) => selected.has(e.id));
  const someSelected = visible.some((e) => selected.has(e.id));

  const toggleAll = () => {
    const ids = new Set(item.selected);
    if (allVisibleSelected) visible.forEach((e) => ids.delete(e.id));
    else visible.forEach((e) => ids.add(e.id));
    setEntries(item.key, [...ids]);
  };

  return (
    <div className="mt-2 rounded-md border border-border bg-sunken">
      <div className="flex items-center gap-2 border-b border-border px-2.5 py-1.5">
        <Checkbox checked={allVisibleSelected ? true : someSelected ? "indeterminate" : false} onCheckedChange={toggleAll} aria-label={t("picker.selectAll")} />
        <span className="num text-xs text-fg-muted">{t("picker.selected", { sel: item.selected.length, total: entries.length })}</span>
        <div className="relative ml-auto w-44">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-fg-faint" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("picker.filter")} className="h-6 pl-6 text-xs" />
        </div>
      </div>
      <ul className="max-h-56 overflow-y-auto py-1">
        {visible.map((e, i) => {
          const on = selected.has(e.id);
          return (
            <li key={e.id}>
              <label className={cn("flex cursor-pointer items-center gap-2.5 px-2.5 py-1 text-[13px] hover:bg-elevated", !on && "text-fg-muted")}>
                <Checkbox checked={on} onCheckedChange={() => toggle(item.key, e.id)} />
                <span className="num w-7 shrink-0 text-right text-2xs text-fg-faint">{i + 1}</span>
                {e.thumbnail ? (
                  <img src={e.thumbnail} alt="" className="h-6 w-10 shrink-0 rounded-sm object-cover bg-elevated" loading="lazy" />
                ) : (
                  <span className="h-6 w-10 shrink-0 rounded-sm bg-elevated" />
                )}
                <span className="min-w-0 flex-1 truncate">
                  {e.title}
                  {e.uploader && item.platform === "spotify" && <span className="text-fg-faint"> · {e.uploader}</span>}
                </span>
                <span className="num shrink-0 text-2xs text-fg-faint">{formatDuration(e.duration)}</span>
              </label>
            </li>
          );
        })}
        {visible.length === 0 && <li className="px-3 py-2 text-xs text-fg-faint">{t("picker.none")}</li>}
      </ul>
    </div>
  );
}
