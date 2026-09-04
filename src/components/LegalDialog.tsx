import { useState } from "react";
import { Scale } from "lucide-react";
import { useSettings } from "@/stores/settings";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const LEGAL_TEXT =
  "Grab is intended for downloading content you own, content that is licensed for reuse, or content you have explicit permission to download. Downloading may violate the terms of service of the source platform, and you are responsible for complying with those terms and with copyright law in your jurisdiction.";

/** Shown once, on first run, until the user acknowledges it. */
export function LegalDialog() {
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
          <DialogTitle>Before you start</DialogTitle>
          <DialogDescription className="leading-5">{LEGAL_TEXT}</DialogDescription>
        </DialogHeader>
        <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-md border border-border bg-sunken p-3 text-[13px]">
          <Checkbox checked={checked} onCheckedChange={(v) => setChecked(v === true)} className="mt-0.5" />
          <span>I understand and will only download content I have the right to download.</span>
        </label>
        <DialogFooter>
          <Button disabled={!checked} onClick={() => set({ legalAccepted: true })}>
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
