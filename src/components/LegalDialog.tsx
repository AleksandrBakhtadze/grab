import { useState } from "react";
import { Scale } from "lucide-react";
import { useT } from "@/i18n";
import { useSettings } from "@/stores/settings";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Shown once, on first run, until the user acknowledges it. */
export function LegalDialog() {
  const t = useT();
  const accepted = useSettings((s) => s.legalAccepted);
  const set = useSettings((s) => s.set);
  const [checked, setChecked] = useState(false);

  return (
    <Dialog open={!accepted}>
      <DialogContent hideClose onEscapeKeyDown={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()} className="max-w-md">
        <DialogHeader>
          <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-sunken">
            <Scale className="h-4 w-4 text-accent" />
          </div>
          <DialogTitle>{t("legal.title")}</DialogTitle>
          <DialogDescription className="leading-5">{t("legal.text")}</DialogDescription>
        </DialogHeader>
        <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-md border border-border bg-sunken p-3 text-[13px]">
          <Checkbox checked={checked} onCheckedChange={(v) => setChecked(v === true)} className="mt-0.5" />
          <span>{t("legal.agree")}</span>
        </label>
        <DialogFooter>
          <Button disabled={!checked} onClick={() => set({ legalAccepted: true })}>
            {t("legal.continue")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
