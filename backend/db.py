from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, datetime, time, timezone
from typing import Any

from supabase import Client, create_client

from backend.config import Settings, get_settings, validate_settings

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


def normalize_name(value: str | None) -> str:
    if not value:
        return ""
    return " ".join(value.lower().strip().split())


@dataclass(slots=True)
class SupabaseDB:
    client: Client

    @classmethod
    def from_settings(cls, settings: Settings | None = None) -> "SupabaseDB":
        cfg = settings or get_settings()
        validate_settings(cfg, "supabase")
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

    @staticmethod
    def _safe_data(result: Any) -> Any:
        return getattr(result, "data", None) if result is not None else None

    def list_candidates(self, *, active_only: bool = True) -> list[dict[str, Any]]:
        query = self.client.table("candidates").select("*")
        if active_only:
            query = query.eq("is_active", True)
        return query.order("added_at").execute().data or []

    def list_tracked_git_people(self, *, active_only: bool = True) -> list[dict[str, Any]]:
        query = self.client.table("tracked_git_people").select("*")
        if active_only:
            query = query.eq("is_active", True)
        return query.order("added_at").execute().data or []

    def list_vcs(self) -> list[dict[str, Any]]:
        return self.client.table("vcs").select("*").order("tier").order("added_at").execute().data or []

    def upsert_vc(
        self,
        *,
        name: str,
        twitter_handle: str | None,
        linkedin_url: str | None,
        tier: int = 2,
    ) -> dict[str, Any]:
        normalized_name = name.strip()
        normalized_handle = normalize_handle(twitter_handle)
        normalized_linkedin = normalize_linkedin_url(linkedin_url)
        if not normalized_name:
            raise ValueError("VC name is required")

        existing_row = None
        if normalized_handle:
            existing = (
                self.client.table("vcs")
                .select("*")
                .eq("twitter_handle", normalized_handle)
                .maybe_single()
                .execute()
            )
            existing_row = self._safe_data(existing)

        if not existing_row and normalized_linkedin:
            existing_row = self.get_vc_by_linkedin_url(normalized_linkedin)

        payload = {
            "name": normalized_name,
            "twitter_handle": normalized_handle,
            "linkedin_url": normalized_linkedin,
            "tier": tier,
        }
        if existing_row:
            payload["id"] = existing_row["id"]

        result = self.client.table("vcs").upsert(payload).execute()
        rows = result.data or []
        return rows[0] if rows else (existing_row or payload)

    def get_candidate_by_id(self, candidate_id: str) -> dict[str, Any] | None:
        result = self.client.table("candidates").select("*").eq("id", candidate_id).maybe_single().execute()
        return self._safe_data(result)

    def find_candidate_by_twitter_handle(self, handle: str) -> dict[str, Any] | None:
        result = (
            self.client.table("candidates")
            .select("*")
            .eq("twitter_handle", normalize_handle(handle))
            .maybe_single()
            .execute()
        )
        return self._safe_data(result)

    def get_twitter_cursor(self, vc_id: str) -> dict[str, Any] | None:
        result = (
            self.client.table("twitter_vc_cursors")
            .select("*")
            .eq("vc_id", vc_id)
            .maybe_single()
            .execute()
        )
        return self._safe_data(result)

    def count_twitter_snapshots(self, vc_id: str) -> int:
        data = (
            self.client.table("twitter_following_snapshots")
            .select("id", count="exact")
            .eq("vc_id", vc_id)
            .limit(1)
            .execute()
        )
        return data.count or 0

    def count_all_twitter_snapshots(self) -> int:
        data = (
            self.client.table("twitter_following_snapshots")
            .select("id", count="exact")
            .limit(1)
            .execute()
        )
        return data.count or 0

    def list_twitter_snapshots(self) -> list[dict[str, Any]]:
        return (
            self.client.table("twitter_following_snapshots")
            .select("id,vc_id,followed_handle,first_seen_at,created_at")
            .order("first_seen_at", desc=True)
            .order("created_at", desc=True)
            .execute()
            .data
            or []
        )

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

    def prune_twitter_snapshots(self, *, max_rows: int, protected_handles: set[str] | None = None) -> int:
        if max_rows <= 0:
            return 0

        rows = (
            self.client.table("twitter_following_snapshots")
            .select("id,followed_handle,first_seen_at,created_at")
            .order("first_seen_at")
            .order("created_at")
            .execute()
            .data
            or []
        )
        overflow = len(rows) - max_rows
        if overflow <= 0:
            return 0

        protected = {normalize_handle(handle) for handle in (protected_handles or set()) if normalize_handle(handle)}
        unprotected_rows = [
            row for row in rows if normalize_handle(row.get("followed_handle")) not in protected
        ]
        protected_rows = [
            row for row in rows if normalize_handle(row.get("followed_handle")) in protected
        ]
        delete_candidates = unprotected_rows + protected_rows
        ids_to_delete = [row["id"] for row in delete_candidates[:overflow] if row.get("id")]
        if not ids_to_delete:
            return 0

        self.client.table("twitter_following_snapshots").delete().in_("id", ids_to_delete).execute()
        return len(ids_to_delete)

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
        )
        existing = self._safe_data(existing)
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

    def list_tracked_git_people_with_github(self) -> list[dict[str, Any]]:
        return [
            person
            for person in self.list_tracked_git_people(active_only=True)
            if person.get("github_username")
        ]

    def list_github_observed_people(self) -> list[dict[str, Any]]:
        return (
            self.client.table("github_observed_people")
            .select("*")
            .order("indicator_count", desc=True)
            .order("last_seen_at", desc=True)
            .execute()
            .data
            or []
        )

    def list_github_observed_usernames(
        self,
        *,
        source_tracked_person_id: str,
        relationship_type: str,
    ) -> set[str]:
        rows = (
            self.client.table("github_observed_people")
            .select("github_username")
            .eq("source_tracked_person_id", source_tracked_person_id)
            .eq("relationship_type", relationship_type)
            .execute()
            .data
            or []
        )
        return {
            normalize_handle(row.get("github_username"))
            for row in rows
            if normalize_handle(row.get("github_username"))
        }

    def list_person_identities(self) -> list[dict[str, Any]]:
        return self._fetch_all("person_identities")

    def clear_identity_match_candidates(self) -> None:
        self.client.table("identity_match_candidates").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()

    def upsert_person_identity(
        self,
        *,
        tracked_person_id: str,
        candidate_id: str | None,
        platform: str,
        handle: str,
        profile_url: str,
        is_primary: bool,
        match_confidence: float,
        match_source: str,
    ) -> None:
        normalized_handle = normalize_handle(handle) if platform in {"x", "github"} else handle.strip().lower()
        payload = {
            "tracked_person_id": tracked_person_id,
            "candidate_id": candidate_id,
            "platform": platform,
            "handle": normalized_handle,
            "profile_url": profile_url,
            "is_primary": is_primary,
            "match_confidence": match_confidence,
            "match_source": match_source,
        }
        existing = (
            self.client.table("person_identities")
            .select("id")
            .eq("platform", platform)
            .eq("handle", normalized_handle)
            .maybe_single()
            .execute()
        )
        existing_row = self._safe_data(existing)
        if existing_row:
            payload["id"] = existing_row["id"]
        self.client.table("person_identities").upsert(payload).execute()

    def upsert_identity_match_candidate(
        self,
        *,
        tracked_person_id: str,
        candidate_id: str,
        confidence: float,
        reasons: list[dict[str, Any]],
        status: str = "suggested",
    ) -> None:
        self.client.table("identity_match_candidates").upsert(
            {
                "tracked_person_id": tracked_person_id,
                "candidate_id": candidate_id,
                "confidence": confidence,
                "reasons": reasons,
                "status": status,
            },
            on_conflict="tracked_person_id,candidate_id",
        ).execute()

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

    def get_repo_reference_snapshot_map_for_person(
        self,
        tracked_person_id: str,
        before_or_on: date,
    ) -> dict[str, dict[str, Any]]:
        rows = (
            self.client.table("github_repo_snapshots")
            .select("*")
            .eq("tracked_person_id", tracked_person_id)
            .lte("snapshot_date", before_or_on.isoformat())
            .order("snapshot_date", desc=True)
            .execute()
            .data
            or []
        )
        reference: dict[str, dict[str, Any]] = {}
        for row in rows:
            repo_key = "/".join(
                [part for part in [row.get("repo_owner"), row.get("repo_name")] if part]
            ) or row.get("repo_name")
            if repo_key:
                reference.setdefault(repo_key, row)
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

    def upsert_github_repo_snapshot_for_person(
        self,
        tracked_person_id: str,
        *,
        repo_owner: str,
        repo_name: str,
        stars: int,
        forks: int,
        watchers: int,
        open_issues: int,
        star_delta_7d: int,
        star_delta_30d: int,
        snapshot_date: date,
    ) -> None:
        payload = {
            "tracked_person_id": tracked_person_id,
            "repo_owner": repo_owner,
            "repo_name": repo_name,
            "stars": stars,
            "forks": forks,
            "watchers": watchers,
            "open_issues": open_issues,
            "star_delta_7d": star_delta_7d,
            "star_delta_30d": star_delta_30d,
            "snapshot_date": snapshot_date.isoformat(),
        }
        existing = (
            self.client.table("github_repo_snapshots")
            .select("id")
            .eq("tracked_person_id", tracked_person_id)
            .eq("repo_owner", repo_owner)
            .eq("repo_name", repo_name)
            .eq("snapshot_date", snapshot_date.isoformat())
            .maybe_single()
            .execute()
        )
        existing_row = self._safe_data(existing)
        if existing_row:
            payload["id"] = existing_row["id"]

        self.client.table("github_repo_snapshots").upsert(payload).execute()

    def upsert_github_follow_relationship(
        self,
        *,
        follower_tracked_person_id: str,
        followed_tracked_person_id: str,
        source_url: str | None = None,
        seen_at: datetime | None = None,
    ) -> None:
        timestamp = (seen_at or utc_now()).isoformat()
        existing = (
            self.client.table("github_follow_relationships")
            .select("id,first_seen_at")
            .eq("follower_tracked_person_id", follower_tracked_person_id)
            .eq("followed_tracked_person_id", followed_tracked_person_id)
            .maybe_single()
            .execute()
        )
        existing_row = self._safe_data(existing)
        payload = {
            "follower_tracked_person_id": follower_tracked_person_id,
            "followed_tracked_person_id": followed_tracked_person_id,
            "first_seen_at": existing_row["first_seen_at"] if existing_row else timestamp,
            "last_seen_at": timestamp,
            "source_url": source_url,
        }
        if existing_row:
            payload["id"] = existing_row["id"]
        self.client.table("github_follow_relationships").upsert(payload).execute()

    def list_github_followed_tracked_person_ids(
        self,
        *,
        follower_tracked_person_id: str,
    ) -> set[str]:
        rows = (
            self.client.table("github_follow_relationships")
            .select("followed_tracked_person_id")
            .eq("follower_tracked_person_id", follower_tracked_person_id)
            .execute()
            .data
            or []
        )
        return {
            str(row.get("followed_tracked_person_id"))
            for row in rows
            if row.get("followed_tracked_person_id")
        }

    def upsert_github_observed_person(
        self,
        *,
        source_tracked_person_id: str,
        relationship_type: str,
        github_username: str,
        name: str | None,
        profile_url: str | None,
        avatar_url: str | None,
        bio: str | None,
        company: str | None,
        location: str | None,
        blog_url: str | None,
        twitter_handle: str | None,
        followers_count: int,
        following_count: int,
        public_repos_count: int,
        indicator_count: int,
        indicators: list[dict[str, Any]],
        can_add_to_watchlist: bool,
    ) -> dict[str, Any]:
        normalized_username = normalize_handle(github_username)
        existing = (
            self.client.table("github_observed_people")
            .select("*")
            .eq("source_tracked_person_id", source_tracked_person_id)
            .eq("github_username", normalized_username)
            .eq("relationship_type", relationship_type)
            .maybe_single()
            .execute()
        )
        existing_row = self._safe_data(existing)
        payload = {
            "source_tracked_person_id": source_tracked_person_id,
            "relationship_type": relationship_type,
            "github_username": normalized_username,
            "name": name,
            "profile_url": profile_url,
            "avatar_url": avatar_url,
            "bio": bio,
            "company": company,
            "location": location,
            "blog_url": blog_url,
            "twitter_handle": normalize_handle(twitter_handle),
            "followers_count": followers_count,
            "following_count": following_count,
            "public_repos_count": public_repos_count,
            "indicator_count": indicator_count,
            "indicators": indicators,
            "can_add_to_watchlist": can_add_to_watchlist,
            "added_to_watchlist": existing_row["added_to_watchlist"] if existing_row else False,
            "first_seen_at": existing_row["first_seen_at"] if existing_row else utc_now().isoformat(),
            "last_seen_at": utc_now().isoformat(),
        }
        if existing_row:
            payload["id"] = existing_row["id"]
        result = self.client.table("github_observed_people").upsert(payload).execute()
        rows = result.data or []
        return rows[0] if rows else (existing_row or payload)

    def get_github_observed_person(self, observed_person_id: str) -> dict[str, Any] | None:
        result = (
            self.client.table("github_observed_people")
            .select("*")
            .eq("id", observed_person_id)
            .maybe_single()
            .execute()
        )
        return self._safe_data(result)

    def mark_observed_person_added_to_watchlist(self, observed_person_id: str) -> None:
        self.client.table("github_observed_people").update(
            {
                "added_to_watchlist": True,
                "last_seen_at": utc_now().isoformat(),
            }
        ).eq("id", observed_person_id).execute()

    def insert_tracked_git_person_from_observed(self, observed: dict[str, Any]) -> dict[str, Any]:
        payload = {
            "name": observed.get("name") or observed.get("github_username"),
            "github_username": normalize_handle(observed.get("github_username")),
            "twitter_handle": normalize_handle(observed.get("twitter_handle")),
            "linkedin_url": None,
            "role_title": "Observed GitHub person",
            "company": observed.get("company"),
            "location": observed.get("location"),
            "summary": observed.get("bio") or "Observed from the GitHub network graph.",
            "is_active": True,
        }
        existing = (
            self.client.table("tracked_git_people")
            .select("*")
            .eq("github_username", payload["github_username"])
            .maybe_single()
            .execute()
        )
        existing_row = self._safe_data(existing)
        if existing_row:
            payload["id"] = existing_row["id"]
        result = self.client.table("tracked_git_people").upsert(payload).execute()
        rows = result.data or []
        return rows[0] if rows else (existing_row or payload)

    def upsert_tracked_git_person(
        self,
        *,
        name: str,
        github_username: str | None,
        twitter_handle: str | None,
        linkedin_url: str | None,
        role_title: str | None,
        company: str | None,
        location: str | None,
        summary: str | None,
    ) -> dict[str, Any]:
        normalized_name = name.strip()
        normalized_github = normalize_handle(github_username)
        normalized_twitter = normalize_handle(twitter_handle)
        normalized_linkedin = normalize_linkedin_url(linkedin_url)
        if not normalized_name:
            raise ValueError("Tracked person name is required")

        existing_row = None
        if normalized_github:
            existing = (
                self.client.table("tracked_git_people")
                .select("*")
                .eq("github_username", normalized_github)
                .maybe_single()
                .execute()
            )
            existing_row = self._safe_data(existing)

        if not existing_row and normalized_twitter:
            existing = (
                self.client.table("tracked_git_people")
                .select("*")
                .eq("twitter_handle", normalized_twitter)
                .maybe_single()
                .execute()
            )
            existing_row = self._safe_data(existing)

        payload = {
            "name": normalized_name,
            "github_username": normalized_github,
            "twitter_handle": normalized_twitter,
            "linkedin_url": normalized_linkedin,
            "role_title": (role_title or "").strip() or "Tracked builder",
            "company": (company or "").strip() or None,
            "location": (location or "").strip() or None,
            "summary": (summary or "").strip() or "Manually added to the watchlist.",
            "is_active": True,
        }
        if existing_row:
            payload["id"] = existing_row["id"]

        result = self.client.table("tracked_git_people").upsert(payload).execute()
        rows = result.data or []
        return rows[0] if rows else (existing_row or payload)

    def insert_github_person_event(
        self,
        *,
        tracked_person_id: str,
        repo_owner: str | None,
        repo_name: str | None,
        event_type: str,
        title: str,
        detail: dict[str, Any],
        score_impact: int = 0,
        occurred_at: datetime | None = None,
        source_url: str | None = None,
    ) -> None:
        self.client.table("github_person_events").insert(
            {
                "tracked_person_id": tracked_person_id,
                "repo_owner": repo_owner,
                "repo_name": repo_name,
                "event_type": event_type,
                "title": title,
                "detail": detail,
                "score_impact": score_impact,
                "occurred_at": (occurred_at or utc_now()).isoformat(),
                "source_url": source_url,
            }
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
        result = (
            self.client.table("scores")
            .select("*")
            .eq("candidate_id", candidate_id)
            .eq("score_date", score_date.isoformat())
            .maybe_single()
            .execute()
        )
        return self._safe_data(result)

    def get_github_viral_repo_reference_snapshot_map(self, before_or_on: date) -> dict[str, dict[str, Any]]:
        rows = (
            self.client.table("github_viral_repo_snapshots")
            .select("*")
            .lte("snapshot_date", before_or_on.isoformat())
            .order("snapshot_date", desc=True)
            .execute()
            .data
            or []
        )
        reference: dict[str, dict[str, Any]] = {}
        for row in rows:
            repo_owner = (row.get("repo_owner") or "").strip()
            repo_name = (row.get("repo_name") or "").strip()
            repo_key = "/".join(part for part in [repo_owner, repo_name] if part)
            if repo_key:
                reference.setdefault(repo_key, row)
        return reference

    def has_github_viral_repo_snapshot(self, *, repo_owner: str, repo_name: str) -> bool:
        rows = (
            self.client.table("github_viral_repo_snapshots")
            .select("id")
            .eq("repo_owner", repo_owner)
            .eq("repo_name", repo_name)
            .limit(1)
            .execute()
            .data
            or []
        )
        return len(rows) > 0

    def upsert_github_viral_repo_snapshot(
        self,
        *,
        repo_owner: str,
        repo_name: str,
        repo_description: str | None,
        repo_url: str | None,
        owner_display_name: str | None,
        owner_avatar_url: str | None,
        owner_profile_url: str | None,
        language: str | None,
        stars: int,
        forks: int,
        watchers: int,
        open_issues: int,
        star_delta_7d: int,
        star_delta_30d: int,
        pushed_at: str | None,
        snapshot_date: date,
    ) -> None:
        payload = {
            "repo_owner": repo_owner,
            "repo_name": repo_name,
            "repo_description": repo_description,
            "repo_url": repo_url,
            "owner_display_name": owner_display_name,
            "owner_avatar_url": owner_avatar_url,
            "owner_profile_url": owner_profile_url,
            "language": language,
            "stars": stars,
            "forks": forks,
            "watchers": watchers,
            "open_issues": open_issues,
            "star_delta_7d": star_delta_7d,
            "star_delta_30d": star_delta_30d,
            "pushed_at": pushed_at,
            "snapshot_date": snapshot_date.isoformat(),
        }
        existing = (
            self.client.table("github_viral_repo_snapshots")
            .select("id")
            .eq("repo_owner", repo_owner)
            .eq("repo_name", repo_name)
            .eq("snapshot_date", snapshot_date.isoformat())
            .maybe_single()
            .execute()
        )
        existing_row = self._safe_data(existing)
        if existing_row:
            payload["id"] = existing_row["id"]
        self.client.table("github_viral_repo_snapshots").upsert(payload).execute()

    def has_github_viral_repo_event(
        self,
        *,
        repo_owner: str,
        repo_name: str,
        event_type: str,
        event_date: date,
    ) -> bool:
        start_iso, end_iso = day_bounds(event_date)
        rows = (
            self.client.table("github_viral_repo_events")
            .select("id")
            .eq("repo_owner", repo_owner)
            .eq("repo_name", repo_name)
            .eq("event_type", event_type)
            .gte("detected_at", start_iso)
            .lte("detected_at", end_iso)
            .limit(1)
            .execute()
            .data
            or []
        )
        return len(rows) > 0

    def insert_github_viral_repo_event(
        self,
        *,
        repo_owner: str,
        repo_name: str,
        repo_description: str | None,
        repo_url: str | None,
        owner_display_name: str | None,
        owner_avatar_url: str | None,
        owner_profile_url: str | None,
        language: str | None,
        event_type: str,
        title: str,
        detail: dict[str, Any],
        stars: int,
        forks: int,
        watchers: int,
        open_issues: int,
        star_delta_7d: int,
        star_delta_30d: int,
        detected_at: datetime | None = None,
    ) -> None:
        self.client.table("github_viral_repo_events").insert(
            {
                "repo_owner": repo_owner,
                "repo_name": repo_name,
                "repo_description": repo_description,
                "repo_url": repo_url,
                "owner_display_name": owner_display_name,
                "owner_avatar_url": owner_avatar_url,
                "owner_profile_url": owner_profile_url,
                "language": language,
                "event_type": event_type,
                "title": title,
                "detail": detail,
                "stars": stars,
                "forks": forks,
                "watchers": watchers,
                "open_issues": open_issues,
                "star_delta_7d": star_delta_7d,
                "star_delta_30d": star_delta_30d,
                "detected_at": (detected_at or utc_now()).isoformat(),
            }
        ).execute()

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

    def clear_activity_tables(self) -> None:
        sentinel = "00000000-0000-0000-0000-000000000000"
        for table in [
            "news_feed",
            "linkedin_signals",
            "github_person_events",
            "github_viral_repo_events",
            "alerts",
            "scores",
        ]:
            self.client.table(table).delete().neq("id", sentinel).execute()

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

    def get_observed_github_map_by_twitter_handle(self) -> dict[str, dict[str, Any]]:
        return {
            normalize_handle(person["twitter_handle"]): person
            for person in self.list_github_observed_people()
            if normalize_handle(person.get("twitter_handle"))
        }

    def get_tracked_twitter_handles(self) -> set[str]:
        handles = set(self.get_candidate_map_by_twitter_handle().keys())
        handles.update(self.get_observed_github_map_by_twitter_handle().keys())
        return handles
