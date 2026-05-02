import type { Investor } from "@/data/types";
import { EntityAvatar } from "./EntityAvatar";

export function InvestorAvatar({
  investor,
  size = 28,
}: {
  investor: Investor;
  size?: number;
}) {
  return (
    <EntityAvatar
      githubUsername={investor.githubUsername}
      name={investor.name}
      size={size}
    />
  );
}

export function TierBadge({ tier }: { tier: Investor["tier"] }) {
  const map = {
    angel: {
      label: "Angel",
      cls: "bg-background text-foreground border border-border",
    },
    microvc: {
      label: "Micro-VC",
      cls: "bg-surface-sunken text-foreground",
    },
    vc: {
      label: "VC",
      cls: "bg-surface-sunken text-muted-foreground",
    },
  } as const;
  const c = map[tier];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${c.cls}`}
    >
      {c.label}
    </span>
  );
}
