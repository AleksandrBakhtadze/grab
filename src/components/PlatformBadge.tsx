import type { Platform } from "@/types";
import { PLATFORMS } from "@/lib/platform";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function PlatformBadge({ platform, className }: { platform: Platform; className?: string }) {
  const meta = PLATFORMS[platform] ?? PLATFORMS.other;
  return (
    <Badge className={cn("gap-1.5", className)}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.hue }} aria-hidden />
      {meta.label}
    </Badge>
  );
}
