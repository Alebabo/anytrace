from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, datetime, time, timezone
from typing import Any

from supabase import Client, create_client

from backend.config import Settings, get_settings

logger = logging.getLogger(__name__)
UTC = timezone.utc


def utc_now() -> datetime:
    return datetime.now(tz=UTC)


def day_bounds(day: date) -> tuple[str, str]:
    start = datetime.combine(day, time.min, tzinfo=UTC)
    end = datetime.combine(day, time.max, tzinfo=UTC)
    return start.isoformat(), end.isoformat()


def normalize_handle(value: str | None) -> str | None:
    if not value:
        return None
    return value.strip().lstrip("@").lower() or None


def normalize_linkedin_url(value: str | None) -> str | None:
    if not value:
        return None
    normalized = value.strip().rstrip("/")
    return normalized.lower() or None


@dataclass(slots=True)
class SupabaseDB:
    client: Client

    @classmethod
    def from_settings(cls, settings: Settings | None = None) -> "SupabaseDB":
        cfg = settings or get_settings()
        return cls(create_client(cfg.supabase_url, cfg.supabase_key))

    def _fetch_all(self, table: str, *, page_size: int = 1000) -> list[dict[str, Any]]:
        results: list[dict[str, Any]] = []
        start = 0
        while True:
            query = self.client.table(table).select("*").range(start, start + page_size - 1)
            data = query.execute().data or []
            results.extend(data)
            if len(data) < page_size:
                break
            start += page_size
        return results

    def list_candidates(self, *, active_only: bool = True) -> list[dict[str, Any]]:
        query = self.client.table("candidates").select("*")
        if active_only:
            query = query.eq("is_active", True)
        return query.order("added_at").execute().data or []

    def list_vcs(self) -> list[dict[str, Any]]:
        return self.client.table("vcs").select("*").order("tier").order("added_at").execute().data or []

    def get_candidate_by_id(self, candidate_id: str) -> dict[str, Any] | None:
        return self.client.table("candidates").select("*").eq("id", candidate_id).maybe_single().execute().data

    def find_candidate_by_twitter_handle(self, handle: str) -> dict[str, Any] | None:
        return (
            self.client.table("candidates")
            .select("*")
            .eq("twitter_handle", normalize_handle(handle))
            .maybe_single()
            .execute()
            .data
        )

    def get_twitter_cursor(self, vc_id: str) -> dict[str, Any] | None:
        return (
            self.client.table("twitter_vc_cursors")
            .select("*")
            .eq("vc_id", vc_id)
            .maybe_single()
            .execute()
            .data
        )

    def count_twitter_snapshots(self, vc_id: str) -> int:
        data = (
            self.client.table("twitter_following_snapshots")
            .select("id", count="exact")
            .eq("vc_id", vc_id)
            .limit(1)
            .execute()
        )
        return data.count or 0

    def twitter_snapshot_exists(self, vc_id: str, followed_handle: str) -> bool:
        row = (
            self.client.table("twitter_following_snapshots")
            .select("id")
            .eq("vc_id", vc_id)
            .eq("followed_handle", normalize_handle(followed_handle))
            .limit(1)
            .execute()
            .data
            or []
        )
        return len(row) > 0

    def upsert_twitter_snapshot(self, vc_id: str, followed_handle: str, first_seen_at: date) -> None:
        self.client.table("twitter_following_snapshots").upsert(
            {
                "vc_id": vc_id,
                "followed_handle": normalize_handle(followed_handle),
                "first_seen_at": first_seen_at.isoformat(),
            },
            on_conflict="vc_id,followed_handle",
        ).execute()

    def upsert_twitter_cursor(self, vc_id: str, last_known_handle: str, last_run_at: datetime | None = None) -> None:
        self.client.table("twitter_vc_cursors").upsert(
            {
                "vc_id": vc_id,
                "last_known_handle": normalize_handle(last_known_handle),
                "last_run_at": (last_run_at or utc_now()).isoformat(),
            },
            on_conflict="vc_id",
        ).execute()

    def upsert_twitter_vc_follow(
        self,
        candidate_id: str,
        vc_id: str,
        *,
        first_seen_at: date,
        last_seen_at: date,
    ) -> None:
        existing = (
            self.client.table("twitter_vc_follows")
            .select("*")
            .eq("candidate_id", candidate_id)
            .eq("vc_id", vc_id)
            .maybe_single()
            .execute()
            .data
        )
        if existing:
            first_seen = min(date.fromisoformat(existing["first_seen_at"]), first_seen_at)
            last_seen = max(date.fromisoformat(existing["last_seen_at"]), last_seen_at)
            payload = {
                "id": existing["id"],
                "candidate_id": candidate_id,
                "vc_id": vc_id,
                "first_seen_at": first_seen.isoformat(),
                "last_seen_at": last_seen.isoformat(),
            }
        else:
            payload = {
                "candidate_id": candidate_id,
                "vc_id": vc_id,
                "first_seen_at": first_seen_at.isoformat(),
                "last_seen_at": last_seen_at.isoformat(),
            }
        self.client.table("twitter_vc_follows").upsert(
            payload,
            on_conflict="candidate_id,vc_id",
        ).execute()

    def list_candidates_with_github(self) -> list[dict[str, Any]]:
        return [
            candidate
            for candidate in self.list_candidates(active_only=True)
            if candidate.get("github_username")
        ]

    def list_candidates_with_linkedin(self) -> list[dict[str, Any]]:
        return [
            candidate
            for candidate in self.list_candidates(active_only=True)
            if candidate.get("linkedin_url")
        ]

    def list_candidates_scored_at_least(self, min_score: int, score_date: date) -> list[dict[str, Any]]:
        score_rows = (
            self.client.table("scores")
            .select("*")
            .eq("score_date", score_date.isoformat())
            .gte("score_total", min_score)
            .execute()
            .data
            or []
        )
        if not score_rows:
            return []
        candidates = {candidate["id"]: candidate for candidate in self.list_candidates(active_only=True)}
        return [candidates[row["candidate_id"]] for row in score_rows if row["candidate_id"] in candidates]

    def get_repo_reference_snapshot_map(self, candidate_id: str, before_or_on: date) -> dict[str, dict[str, Any]]:
        rows = (
            self.client.table("github_repo_snapshots")
            .select("*")
            .eq("candidate_id", candidate_id)
            .lte("snapshot_date", before_or_on.isoformat())
            .order("snapshot_date", desc=True)
            .execute()
            .data
            or []
        )
        reference: dict[str, dict[str, Any]] = {}
        for row in rows:
            reference.setdefault(row["repo_name"], row)
        return reference

    def get_github_snapshots_for_date(self, candidate_id: str, snapshot_date: date) -> list[dict[str, Any]]:
        return (
            self.client.table("github_repo_snapshots")
            .select("*")
            .eq("candidate_id", candidate_id)
            .eq("snapshot_date", snapshot_date.isoformat())
            .order("stars", desc=True)
            .execute()
            .data
            or []
        )

    def upsert_github_repo_snapshot(
        self,
        candidate_id: str,
        repo_name: str,
        *,
        stars: int,
        forks: int,
        star_delta_7d: int,
        snapshot_date: date,
    ) -> None:
        self.client.table("github_repo_snapshots").upsert(
            {
                "candidate_id": candidate_id,
                "repo_name": repo_name,
                "stars": stars,
                "forks": forks,
                "star_delta_7d": star_delta_7d,
                "snapshot_date": snapshot_date.isoformat(),
            },
            on_conflict="candidate_id,repo_name,snapshot_date",
        ).execute()

    def get_latest_headline_signal(self, candidate_id: str) -> dict[str, Any] | None:
        rows = (
            self.client.table("linkedin_signals")
            .select("*")
            .eq("candidate_id", candidate_id)
            .eq("signal_type", "headline_change")
            .order("detected_at", desc=True)
            .limit(1)
            .execute()
            .data
            or []
        )
        return rows[0] if rows else None

    def insert_linkedin_signal(
        self,
        candidate_id: str,
        signal_type: str,
        *,
        old_value: str | None,
        new_value: str | None,
        vc_id: str | None = None,
        interaction_type: str | None = None,
        detected_at: datetime | None = None,
    ) -> None:
        self.client.table("linkedin_signals").insert(
            {
                "candidate_id": candidate_id,
                "signal_type": signal_type,
                "old_value": old_value,
                "new_value": new_value,
                "vc_id": vc_id,
                "interaction_type": interaction_type,
                "detected_at": (detected_at or utc_now()).isoformat(),
            }
        ).execute()

    def get_recent_linkedin_signals(self, candidate_id: str, since: datetime) -> list[dict[str, Any]]:
        return (
            self.client.table("linkedin_signals")
            .select("*")
            .eq("candidate_id", candidate_id)
            .gte("detected_at", since.isoformat())
            .order("detected_at", desc=True)
            .execute()
            .data
            or []
        )

    def get_new_vc_follows_since(self, candidate_id: str, since: date) -> list[dict[str, Any]]:
        rows = (
            self.client.table("twitter_vc_follows")
            .select("*")
            .eq("candidate_id", candidate_id)
            .gte("first_seen_at", since.isoformat())
            .order("first_seen_at")
            .execute()
            .data
            or []
        )
        vcs = {vc["id"]: vc for vc in self.list_vcs()}
        enriched: list[dict[str, Any]] = []
        for row in rows:
            vc = vcs.get(row["vc_id"])
            if not vc:
                continue
            enriched.append(
                {
                    "vc_id": row["vc_id"],
                    "vc_name": vc["name"],
                    "tier": vc["tier"],
                    "first_seen_at": row["first_seen_at"],
                }
            )
        return enriched

    def get_score(self, candidate_id: str, score_date: date) -> dict[str, Any] | None:
        return (
            self.client.table("scores")
            .select("*")
            .eq("candidate_id", candidate_id)
            .eq("score_date", score_date.isoformat())
            .maybe_single()
            .execute()
            .data
        )

    def list_scores_for_date(self, score_date: date) -> list[dict[str, Any]]:
        return (
            self.client.table("scores")
            .select("*")
            .eq("score_date", score_date.isoformat())
            .order("score_total", desc=True)
            .execute()
            .data
            or []
        )

    def upsert_score(
        self,
        candidate_id: str,
        score_date: date,
        *,
        score_total: int,
        score_github: int,
        score_twitter: int,
        score_linkedin: int,
        breakdown: dict[str, Any],
    ) -> None:
        self.client.table("scores").upsert(
            {
                "candidate_id": candidate_id,
                "score_date": score_date.isoformat(),
                "score_total": score_total,
                "score_github": score_github,
                "score_twitter": score_twitter,
                "score_linkedin": score_linkedin,
                "breakdown": breakdown,
            },
            on_conflict="candidate_id,score_date",
        ).execute()

    def recent_alert_exists(self, candidate_id: str, since: datetime) -> bool:
        rows = (
            self.client.table("alerts")
            .select("id")
            .eq("candidate_id", candidate_id)
            .gte("sent_at", since.isoformat())
            .limit(1)
            .execute()
            .data
            or []
        )
        return len(rows) > 0

    def insert_alert(
        self,
        candidate_id: str,
        *,
        score_total: int,
        trigger_reason: str,
        channel: str = "email",
        sent_at: datetime | None = None,
    ) -> None:
        self.client.table("alerts").insert(
            {
                "candidate_id": candidate_id,
                "score_total": score_total,
                "trigger_reason": trigger_reason,
                "channel": channel,
                "sent_at": (sent_at or utc_now()).isoformat(),
            }
        ).execute()

    def news_event_exists(self, candidate_id: str, event_type: str, title: str, day: date) -> bool:
        start, end = day_bounds(day)
        rows = (
            self.client.table("news_feed")
            .select("id")
            .eq("candidate_id", candidate_id)
            .eq("event_type", event_type)
            .eq("title", title)
            .gte("created_at", start)
            .lte("created_at", end)
            .limit(1)
            .execute()
            .data
            or []
        )
        return len(rows) > 0

    def insert_news_feed(
        self,
        candidate_id: str,
        *,
        event_type: str,
        title: str,
        detail: dict[str, Any],
        score_impact: int,
        created_at: datetime | None = None,
    ) -> None:
        self.client.table("news_feed").insert(
            {
                "candidate_id": candidate_id,
                "event_type": event_type,
                "title": title,
                "detail": detail,
                "score_impact": score_impact,
                "created_at": (created_at or utc_now()).isoformat(),
            }
        ).execute()

    def list_recent_news(self, candidate_id: str, since: datetime) -> list[dict[str, Any]]:
        return (
            self.client.table("news_feed")
            .select("*")
            .eq("candidate_id", candidate_id)
            .gte("created_at", since.isoformat())
            .order("created_at", desc=True)
            .execute()
            .data
            or []
        )

    def get_vc_by_linkedin_url(self, linkedin_url: str) -> dict[str, Any] | None:
        normalized = normalize_linkedin_url(linkedin_url)
        if not normalized:
            return None
        vcs = self.list_vcs()
        for vc in vcs:
            if normalize_linkedin_url(vc.get("linkedin_url")) == normalized:
                return vc
        return None

    def get_candidate_map_by_twitter_handle(self) -> dict[str, dict[str, Any]]:
        return {
            normalize_handle(candidate["twitter_handle"]): candidate
            for candidate in self.list_candidates(active_only=True)
            if normalize_handle(candidate.get("twitter_handle"))
        }
