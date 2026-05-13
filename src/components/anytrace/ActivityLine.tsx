import { ExternalLink } from "lucide-react";
import type { ActivityEvent, VcSource } from "@/data/anytrace";
import { EntityAvatar } from "@/components/anytrace/EntityAvatar";
import { avatarSourcesForVc } from "@/lib/avatarSources";
import { cn } from "@/lib/utils";

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function formatActivityTimestamp(occurredAt: string) {
  const date = new Date(occurredAt);
  if (Number.isNaN(date.getTime())) {
    return occurredAt;
  }

  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatFallbackLine(event: ActivityEvent, personName?: string) {
  if (event.eventType === "repo_traction") {
    const stars = Number(event.metadata.weekly_star_delta ?? 0);
    const repoLabel = asString(event.metadata.repoLabel);
    return (
      <>
        <span className="font-semibold text-foreground">{personName || "This person"}</span>
        <span> </span>
        <span>
          {stars > 0
            ? `gained ${stars} GitHub stars this week${repoLabel ? ` on ${repoLabel}` : ""}`
            : "showed fresh GitHub repo traction"}
        </span>
      </>
    );
  }

  if (event.eventType === "viral_repo") {
    const repoLabel = asString(event.metadata.repoLabel);
    const stars = Number(event.metadata.stars ?? 0);
    const weeklyDelta = Number(event.metadata.weekly_star_delta ?? 0);
    const importantXFollowerCount = Number(event.metadata.importantXFollowerCount ?? 0);
    return (
      <>
        <span className="font-semibold text-foreground">{repoLabel || personName || "This repo"}</span>
        <span> </span>
        <span>
          {weeklyDelta > 0
            ? `is breaking out on GitHub with +${weeklyDelta} stars in 7 days`
            : `entered the viral GitHub feed with ${stars} stars`}
          {importantXFollowerCount > 0
            ? ` and already has X attention from ${importantXFollowerCount} tracked VC${importantXFollowerCount === 1 ? "" : "s"}`
            : ""}
        </span>
      </>
    );
  }

  if (event.eventType === "star_milestone") {
    const repoLabel = asString(event.metadata.repoLabel);
    const stars = Number(event.metadata.stars ?? 0);
    return (
      <>
        <span className="font-semibold text-foreground">{personName || "This person"}</span>
        <span> reached </span>
        <span className="font-semibold text-foreground">{stars}</span>
        <span> GitHub stars{repoLabel ? ` on ${repoLabel}` : ""}</span>
      </>
    );
  }

  if (event.eventType === "big_tech_exit") {
    const company = asString(event.metadata.company);
    return (
      <>
        <span className="font-semibold text-foreground">{personName || "This person"}</span>
        <span> </span>
        <span>{company ? `left ${company} to build` : "made a notable operating move"}</span>
      </>
    );
  }

  if (event.eventType === "important_github_follower") {
    const relationshipKind = asString(event.metadata.relationshipKind);
    const actorLabel = asString(event.metadata.actorLabel);
    const targetLabel = asString(event.metadata.targetLabel) || personName || "this person";

    if (relationshipKind === "github_follow" && actorLabel) {
      return (
        <>
          <span className="font-semibold text-foreground">{actorLabel}</span>
          <span> followed </span>
          <span className="font-semibold text-foreground">{targetLabel}</span>
          <span> on GitHub</span>
        </>
      );
    }

    const followerCount = Number(event.metadata.follower_count ?? 0);
    return (
      <>
        <span className="font-semibold text-foreground">{personName || "This person"}</span>
        <span> </span>
        <span>
          {followerCount > 0
            ? `picked up ${followerCount} high-signal GitHub followers`
            : "picked up high-signal GitHub followers"}
        </span>
      </>
    );
  }

  if (event.eventType === "launch") {
    return (
      <>
        <span className="font-semibold text-foreground">{personName || "This person"}</span>
        <span> posted a fresh launch signal</span>
      </>
    );
  }

  if (event.eventType === "mention") {
    const actorLabel = asString(event.metadata.actorLabel);
    const targetLabel = asString(event.metadata.targetLabel) || personName || "this person";

    if (event.platform === "x" && actorLabel) {
      return (
        <>
          <span className="font-semibold text-foreground">{actorLabel}</span>
          <span> followed </span>
          <span className="font-semibold text-foreground">{targetLabel}</span>
          <span> on X</span>
        </>
      );
    }

    return (
      <>
        <span className="font-semibold text-foreground">{personName || "This person"}</span>
        <span> was mentioned in a tracked signal</span>
      </>
    );
  }

  if (event.eventType === "linkedin_interaction") {
    const actorLabel = asString(event.metadata.actorLabel);
    const interactionLabel = asString(event.metadata.interactionLabel) || "interacted with";
    return (
      <>
        {actorLabel ? (
          <span className="font-semibold text-foreground">{actorLabel}</span>
        ) : (
          <span className="font-semibold text-foreground">{personName || "This person"}</span>
        )}
        <span> {interactionLabel} </span>
        <span className="font-semibold text-foreground">{personName || asString(event.metadata.targetLabel) || "this person"}</span>
        <span> on LinkedIn</span>
      </>
    );
  }

  return <span>{event.headline}</span>;
}

export function ActivityLine({
  event,
  personName,
  vcsById,
  className,
}: {
  event: ActivityEvent;
  personName?: string;
  vcsById?: Map<string, VcSource>;
  className?: string;
}) {
  const vc = event.vcSourceId ? vcsById?.get(event.vcSourceId) ?? null : null;
  const vcName = vc?.name ?? null;
  const followedHandle = asString(event.metadata.followedHandle) || personName || "unknown";
  const timestamp = formatActivityTimestamp(event.occurredAt);

  return (
    <div className={cn("flex items-start gap-2 text-sm leading-relaxed text-foreground/88", className)}>
      {vc ? (
        <EntityAvatar
          name={vc.name}
          imageUrls={avatarSourcesForVc(vc)}
          size={28}
          className="mt-0.5"
        />
      ) : null}
      <p className="min-w-0 flex-1 text-balance">
        {event.eventType === "vc_follow" && vcName ? (
          <>
            <span className="font-semibold text-foreground">{vcName}</span>
            <span> followed </span>
            <span className="font-semibold text-foreground">{followedHandle}</span>
            <span> on X</span>
          </>
        ) : (
          formatFallbackLine(event, personName)
        )}
        <time dateTime={event.occurredAt} className="ml-2 whitespace-nowrap text-[12px] italic text-muted-foreground">
          :{timestamp}
        </time>
      </p>
      {event.sourceUrl ? (
        <a
          href={event.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-0.5 shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Open source"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      ) : null}
    </div>
  );
}
