import { ExternalLink } from "lucide-react";
import type { Signal } from "@/data/types";
import { investorById, formatRelative } from "@/data/mockData";
import { SignalIcon } from "./SignalIcon";
import { InvestorAvatar } from "./InvestorAvatar";

const actionVerb: Record<Signal["action"], string> = {
  followed: "followed",
  connected: "connected with",
  starred: "starred",
  forked: "forked",
  mentioned: "mentioned",
  replied: "replied to",
  endorsed: "endorsed",
};

export function EvidenceItem({ signal, founderName }: { signal: Signal; founderName: string }) {
  const investor = investorById(signal.investorId);

  return (
    <li className="relative pl-11 py-2.5 group rounded-xl hover:bg-surface-sunken/60 transition-colors">
      <div className="absolute left-2 top-3">
        <InvestorAvatar investor={investor} size={24} />
      </div>
      <div className="flex items-center gap-2 text-sm min-w-0">
        <SignalIcon platform={signal.platform} className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="font-medium text-foreground truncate">{investor.name}</span>
        <span className="text-muted-foreground truncate">
          {actionVerb[signal.action]}{" "}
          <span className="text-foreground">{founderName}</span>
        </span>
        <span className="ml-auto flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {formatRelative(signal.occurredAt)}
          </span>
          <a
            href={signal.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-accent-indigo ring-focus rounded p-0.5"
            title="Open primary source"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        </span>
      </div>
    </li>
  );
}
