from __future__ import annotations

import json
import logging
import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import date, datetime, time, timezone
from pathlib import Path
from typing import Any, Iterator
from uuid import uuid4

from backend.config import Settings, get_settings

logger = logging.getLogger(__name__)
UTC = timezone.utc
DEFAULT_SEED_FOLLOW_ALERT_THRESHOLD = 3
MIN_SEED_FOLLOW_ALERT_THRESHOLD = 2
MAX_SEED_FOLLOW_ALERT_THRESHOLD = 10


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


def _now_iso() -> str:
    return utc_now().isoformat()


def _json_dump(value: Any) -> str:
    return json.dumps(value if value is not None else {}, ensure_ascii=True)


def _json_load(value: str | None, fallback: Any) -> Any:
    if not value:
      return fallback
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return fallback


def _bool_int(value: bool | None) -> int:
    return 1 if value else 0


def _tier_to_int(value: str | int | None) -> int | None:
    if value is None:
        return None
    if isinstance(value, int):
        return value
    normalized = value.strip().lower()
    if normalized in {"journalist", "media", "press", "reporter"}:
        return 4
    if normalized == "angel":
        return 3
    if normalized == "microvc":
        return 2
    if normalized == "vc":
        return 1
    try:
        return int(normalized)
    except ValueError:
        return None


def _date_from_storage(value: str | None) -> date:
    if not value:
        return utc_now().date()
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return utc_now().date()


def normalize_seed_follow_alert_threshold(value: Any) -> int:
    try:
        numeric = int(value)
    except (TypeError, ValueError):
        numeric = DEFAULT_SEED_FOLLOW_ALERT_THRESHOLD
    return max(MIN_SEED_FOLLOW_ALERT_THRESHOLD, min(MAX_SEED_FOLLOW_ALERT_THRESHOLD, numeric))


@dataclass(slots=True)
class SupabaseDB:
    path: Path

    @classmethod
    def from_settings(cls, settings: Settings | None = None) -> "SupabaseDB":
        cfg = settings or get_settings()
        return cls(Path(cfg.local_db_path))

    def __post_init__(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._ensure_schema()
        self._seed_vcs_from_frontend_seed()

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.path)
        connection.row_factory = sqlite3.Row
        try:
            yield connection
            connection.commit()
        finally:
            connection.close()

    def _fetchall(self, query: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(query, params).fetchall()
        return [dict(row) for row in rows]

    def _fetchone(self, query: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(query, params).fetchone()
        return dict(row) if row else None

    def _execute(self, query: str, params: tuple[Any, ...] = ()) -> None:
        with self._connect() as connection:
            connection.execute(query, params)

    def _ensure_schema(self) -> None:
        with self._connect() as connection:
            connection.executescript(
                """
                create table if not exists candidates (
                  id text primary key,
                  name text,
                  twitter_handle text unique,
                  github_username text,
                  linkedin_url text,
                  role_title text,
                  company text,
                  location text,
                  summary text,
                  bio text,
                  added_at text not null,
                  is_active integer default 1
                );

                create table if not exists tracked_git_people (
                  id text primary key,
                  name text,
                  github_username text unique,
                  twitter_handle text,
                  linkedin_url text,
                  role_title text,
                  company text,
                  location text,
                  summary text,
                  added_at text not null,
                  is_active integer default 1
                );

                create table if not exists person_identities (
                  id text primary key,
                  tracked_person_id text,
                  candidate_id text,
                  platform text not null,
                  handle text not null,
                  profile_url text not null,
                  is_primary integer default 0,
                  match_confidence real default 1.0,
                  match_source text default 'manual',
                  created_at text not null
                );
                create unique index if not exists person_identities_unique on person_identities (tracked_person_id, platform, handle);

                create table if not exists identity_match_candidates (
                  id text primary key,
                  tracked_person_id text not null,
                  candidate_id text not null,
                  confidence real not null,
                  reasons text not null,
                  status text not null,
                  created_at text not null
                );
                create unique index if not exists identity_match_unique on identity_match_candidates (tracked_person_id, candidate_id);

                create table if not exists vcs (
                  id text primary key,
                  name text,
                  twitter_handle text unique,
                  linkedin_url text,
                  tier integer,
                  added_at text not null,
                  cluster_name text,
                  account_type text,
                  is_primary_cluster_account integer default 1
                );

                create table if not exists vc_clusters (
                  id text primary key,
                  name text not null,
                  created_at text not null
                );

                create table if not exists vc_cluster_members (
                  id text primary key,
                  cluster_id text not null,
                  vc_id text not null unique,
                  account_type text not null,
                  is_primary integer default 0,
                  confidence real default 1.0,
                  source text default 'manual',
                  created_at text not null
                );

                create table if not exists twitter_following_snapshots (
                  id text primary key,
                  vc_id text not null,
                  followed_handle text not null,
                  first_seen_at text not null,
                  created_at text not null
                );
                create unique index if not exists twitter_following_unique on twitter_following_snapshots (vc_id, followed_handle);

                create table if not exists twitter_vc_cursors (
                  vc_id text primary key,
                  last_known_handle text,
                  last_run_at text not null
                );

                create table if not exists twitter_vc_follows (
                  id text primary key,
                  candidate_id text not null,
                  vc_id text not null,
                  first_seen_at text not null,
                  last_seen_at text not null
                );
                create unique index if not exists twitter_vc_follows_unique on twitter_vc_follows (candidate_id, vc_id);

                create table if not exists discovered_people (
                  id text primary key,
                  x_handle text not null unique,
                  display_name text,
                  primary_profile_url text not null,
                  github_url text,
                  linkedin_url text,
                  first_seen_at text not null,
                  last_seen_at text not null,
                  created_at text not null
                );

                create table if not exists seed_follow_observations (
                  id text primary key,
                  seed_vc_id text not null,
                  discovered_person_id text not null,
                  followed_handle text not null,
                  first_seen_at text not null,
                  last_seen_at text not null,
                  created_at text not null
                );
                create unique index if not exists seed_follow_observations_unique on seed_follow_observations (seed_vc_id, discovered_person_id);

                create table if not exists seed_follow_alert_events (
                  id text primary key,
                  discovered_person_id text not null unique,
                  triggered_at text not null,
                  triggering_seed_accounts text not null,
                  trigger_threshold integer default 2,
                  status text not null default 'new',
                  promoted_vc_id text,
                  promoted_at text,
                  created_at text not null
                );

                create table if not exists app_settings (
                  key text primary key,
                  value text not null,
                  created_at text not null,
                  updated_at text not null
                );

                create table if not exists linkedin_enrichment_events (
                  id text primary key,
                  discovered_person_id text not null,
                  linkedin_url text,
                  headline text,
                  role_title text,
                  company text,
                  location text,
                  source text not null default 'linkedin_native_scraper',
                  raw_payload text not null,
                  observed_at text not null,
                  created_at text not null
                );
                create index if not exists linkedin_enrichment_person_idx on linkedin_enrichment_events (discovered_person_id, observed_at desc);

                create table if not exists tracked_person_twitter_following_snapshots (
                  id text primary key,
                  tracked_person_id text not null,
                  followed_handle text not null,
                  first_seen_at text not null,
                  created_at text not null
                );
                create unique index if not exists tracked_person_twitter_following_unique on tracked_person_twitter_following_snapshots (tracked_person_id, followed_handle);

                create table if not exists tracked_person_twitter_cursors (
                  tracked_person_id text primary key,
                  last_known_handle text,
                  last_run_at text not null
                );

                create table if not exists github_repo_snapshots (
                  id text primary key,
                  tracked_person_id text not null,
                  repo_owner text,
                  repo_name text not null,
                  stars integer default 0,
                  forks integer default 0,
                  watchers integer default 0,
                  open_issues integer default 0,
                  star_delta_7d integer default 0,
                  star_delta_30d integer default 0,
                  snapshot_date text not null,
                  created_at text not null
                );
                create unique index if not exists github_repo_snapshots_unique on github_repo_snapshots (tracked_person_id, repo_owner, repo_name, snapshot_date);

                create table if not exists github_person_events (
                  id text primary key,
                  tracked_person_id text not null,
                  repo_owner text,
                  repo_name text,
                  event_type text not null,
                  title text not null,
                  detail text not null,
                  score_impact integer default 0,
                  occurred_at text not null,
                  created_at text not null,
                  source_url text
                );

                create table if not exists github_follow_relationships (
                  id text primary key,
                  follower_tracked_person_id text not null,
                  followed_tracked_person_id text not null,
                  first_seen_at text not null,
                  last_seen_at text not null,
                  created_at text not null,
                  source_url text
                );
                create unique index if not exists github_follow_relationship_unique on github_follow_relationships (follower_tracked_person_id, followed_tracked_person_id);

                create table if not exists github_observed_people (
                  id text primary key,
                  source_tracked_person_id text not null,
                  relationship_type text not null,
                  github_username text not null,
                  name text,
                  profile_url text,
                  avatar_url text,
                  bio text,
                  company text,
                  location text,
                  blog_url text,
                  twitter_handle text,
                  followers_count integer default 0,
                  following_count integer default 0,
                  public_repos_count integer default 0,
                  indicator_count integer default 0,
                  indicators text not null,
                  can_add_to_watchlist integer default 0,
                  added_to_watchlist integer default 0,
                  first_seen_at text not null,
                  last_seen_at text not null,
                  created_at text not null
                );
                create unique index if not exists github_observed_people_unique on github_observed_people (source_tracked_person_id, github_username, relationship_type);

                create table if not exists github_viral_repo_snapshots (
                  id text primary key,
                  repo_owner text not null,
                  repo_name text not null,
                  repo_description text,
                  repo_url text,
                  owner_display_name text,
                  owner_avatar_url text,
                  owner_profile_url text,
                  language text,
                  stars integer default 0,
                  forks integer default 0,
                  watchers integer default 0,
                  open_issues integer default 0,
                  star_delta_7d integer default 0,
                  star_delta_30d integer default 0,
                  pushed_at text,
                  snapshot_date text not null,
                  created_at text not null
                );
                create unique index if not exists github_viral_repo_snapshots_unique on github_viral_repo_snapshots (repo_owner, repo_name, snapshot_date);

                create table if not exists github_viral_repo_events (
                  id text primary key,
                  repo_owner text not null,
                  repo_name text not null,
                  repo_description text,
                  repo_url text,
                  owner_display_name text,
                  owner_avatar_url text,
                  owner_profile_url text,
                  language text,
                  event_type text not null,
                  title text not null,
                  detail text not null,
                  stars integer default 0,
                  forks integer default 0,
                  watchers integer default 0,
                  open_issues integer default 0,
                  star_delta_7d integer default 0,
                  star_delta_30d integer default 0,
                  detected_at text not null,
                  created_at text not null
                );

                create table if not exists linkedin_signals (
                  id text primary key,
                  candidate_id text not null,
                  signal_type text not null,
                  old_value text,
                  new_value text,
                  vc_id text,
                  interaction_type text,
                  detected_at text not null
                );

                create table if not exists scores (
                  id text primary key,
                  candidate_id text not null,
                  score_date text not null,
                  score_total integer default 0,
                  score_github integer default 0,
                  score_twitter integer default 0,
                  score_linkedin integer default 0,
                  breakdown text not null,
                  created_at text not null
                );
                create unique index if not exists scores_unique on scores (candidate_id, score_date);

                create table if not exists alerts (
                  id text primary key,
                  candidate_id text not null,
                  score_total integer default 0,
                  trigger_reason text,
                  sent_at text not null,
                  channel text
                );

                create table if not exists news_feed (
                  id text primary key,
                  candidate_id text not null,
                  event_type text not null,
                  title text not null,
                  detail text not null,
                  score_impact integer default 0,
                  created_at text not null
                );

                create table if not exists triage_runs (
                  id text primary key,
                  status text not null,
                  threshold integer not null,
                  provider text not null,
                  model text,
                  candidate_count integer default 0,
                  qualified_count integer default 0,
                  error text,
                  payload text not null,
                  started_at text not null,
                  completed_at text,
                  created_at text not null
                );
                create index if not exists triage_runs_created_at_idx on triage_runs (created_at desc);
                """
            )
            existing_alert_columns = {
                row["name"]
                for row in connection.execute("pragma table_info(seed_follow_alert_events)").fetchall()
            }
            if "trigger_threshold" not in existing_alert_columns:
                connection.execute(
                    "alter table seed_follow_alert_events add column trigger_threshold integer default 2"
                )
            if "promoted_vc_id" not in existing_alert_columns:
                connection.execute(
                    "alter table seed_follow_alert_events add column promoted_vc_id text"
                )
            if "promoted_at" not in existing_alert_columns:
                connection.execute(
                    "alter table seed_follow_alert_events add column promoted_at text"
                )

    def insert_triage_run(
        self,
        *,
        run_id: str,
        status: str,
        threshold: int,
        provider: str,
        model: str | None,
        candidate_count: int,
        qualified_count: int,
        payload: dict[str, Any],
        started_at: str,
        completed_at: str | None = None,
        error: str | None = None,
    ) -> dict[str, Any]:
        now = _now_iso()
        self._execute(
            """
            insert into triage_runs (
              id,
              status,
              threshold,
              provider,
              model,
              candidate_count,
              qualified_count,
              error,
              payload,
              started_at,
              completed_at,
              created_at
            )
            values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                run_id,
                status,
                threshold,
                provider,
                model,
                candidate_count,
                qualified_count,
                error,
                _json_dump(payload),
                started_at,
                completed_at,
                now,
            ),
        )
        return self.get_triage_run(run_id) or {
            "id": run_id,
            "status": status,
            "payload": payload,
        }

    def get_triage_run(self, run_id: str) -> dict[str, Any] | None:
        normalized_id = (run_id or "").strip()
        if not normalized_id:
            return None
        row = self._fetchone("select * from triage_runs where id = ? limit 1", (normalized_id,))
        if not row:
            return None
        row["payload"] = _json_load(row.get("payload"), {})
        return row

    def get_latest_triage_run(self) -> dict[str, Any] | None:
        row = self._fetchone("select * from triage_runs order by created_at desc limit 1")
        if not row:
            return None
        row["payload"] = _json_load(row.get("payload"), {})
        return row

    def _seed_vcs_from_frontend_seed(self) -> None:
        seed_path = Path(__file__).resolve().parents[1] / "src" / "data" / "localSeedData.json"
        if not seed_path.exists():
            return

        payload = json.loads(seed_path.read_text(encoding="utf-8"))
        vcs = payload.get("vcSources") or []
        now = _now_iso()
        existing_rows = self._fetchall("select id, twitter_handle from vcs")
        existing_ids = {row["id"] for row in existing_rows}
        used_handles = {
            normalize_handle(row.get("twitter_handle"))
            for row in existing_rows
            if normalize_handle(row.get("twitter_handle"))
        }

        with self._connect() as connection:
            for vc in vcs:
                if vc["id"] in existing_ids:
                    continue
                candidate_handle = normalize_handle(vc.get("xHandle"))
                twitter_handle = None if candidate_handle in used_handles else candidate_handle
                if twitter_handle:
                    used_handles.add(twitter_handle)
                connection.execute(
                    """
                    insert into vcs (id, name, twitter_handle, linkedin_url, tier, added_at, cluster_name, account_type, is_primary_cluster_account)
                    values (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        vc["id"],
                        vc.get("name"),
                        twitter_handle,
                        normalize_linkedin_url(vc.get("linkedinUrl")),
                        _tier_to_int(vc.get("tier")),
                        now,
                        vc.get("clusterName"),
                        vc.get("accountType") or "firm",
                        _bool_int(vc.get("isPrimaryClusterAccount", True)),
                    ),
                )
                cluster_id = vc.get("clusterId") or vc["id"]
                connection.execute(
                    """
                    insert or ignore into vc_clusters (id, name, created_at)
                    values (?, ?, ?)
                    """,
                    (cluster_id, vc.get("clusterName") or vc.get("name") or "VC Cluster", now),
                )
                connection.execute(
                    """
                    insert or ignore into vc_cluster_members (id, cluster_id, vc_id, account_type, is_primary, confidence, source, created_at)
                    values (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        str(uuid4()),
                        cluster_id,
                        vc["id"],
                        vc.get("accountType") or "firm",
                        _bool_int(vc.get("isPrimaryClusterAccount", True)),
                        1.0,
                        "seed_import",
                        now,
                    ),
                )

    def _resolve_candidate_to_tracked_person_ids(self, candidate_id: str) -> list[str]:
        rows = self._fetchall(
            "select distinct tracked_person_id from person_identities where candidate_id = ? and tracked_person_id is not null",
            (candidate_id,),
        )
        tracked_person_ids = [row["tracked_person_id"] for row in rows if row.get("tracked_person_id")]
        if tracked_person_ids:
            return tracked_person_ids

        candidate = self.get_candidate_by_id(candidate_id)
        if not candidate:
            return []

        tracked_person_ids = []
        if candidate.get("github_username"):
            row = self._fetchone(
                "select id from tracked_git_people where github_username = ? limit 1",
                (normalize_handle(candidate.get("github_username")),),
            )
            if row:
                tracked_person_ids.append(row["id"])
        if not tracked_person_ids and candidate.get("twitter_handle"):
            row = self._fetchone(
                "select id from tracked_git_people where twitter_handle = ? limit 1",
                (normalize_handle(candidate.get("twitter_handle")),),
            )
            if row:
                tracked_person_ids.append(row["id"])
        return tracked_person_ids

    def _safe_person_name(self, person: dict[str, Any]) -> str:
        return (person.get("name") or person.get("github_username") or person.get("twitter_handle") or "").strip()

    def _upsert_candidate_record(
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
        existing = None
        if normalized_github:
            existing = self._fetchone("select * from candidates where github_username = ? limit 1", (normalized_github,))
        if not existing and normalized_twitter:
            existing = self._fetchone("select * from candidates where twitter_handle = ? limit 1", (normalized_twitter,))
        if not existing and normalized_linkedin:
            existing = self._fetchone("select * from candidates where linkedin_url = ? limit 1", (normalized_linkedin,))
        if not existing:
            existing = self._fetchone("select * from candidates where lower(name) = ? limit 1", (normalized_name.lower(),))

        candidate_id = existing["id"] if existing else str(uuid4())
        added_at = existing.get("added_at") if existing else _now_iso()
        self._execute(
            """
            insert into candidates (id, name, twitter_handle, github_username, linkedin_url, role_title, company, location, summary, bio, added_at, is_active)
            values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            on conflict(id) do update set
              name = excluded.name,
              twitter_handle = excluded.twitter_handle,
              github_username = excluded.github_username,
              linkedin_url = excluded.linkedin_url,
              role_title = excluded.role_title,
              company = excluded.company,
              location = excluded.location,
              summary = excluded.summary,
              bio = excluded.bio,
              is_active = 1
            """,
            (
                candidate_id,
                normalized_name,
                normalized_twitter,
                normalized_github,
                normalized_linkedin,
                role_title,
                company,
                location,
                summary,
                summary,
                added_at,
            ),
        )
        return self._fetchone("select * from candidates where id = ?", (candidate_id,)) or {"id": candidate_id}

    def list_candidates(self, *, active_only: bool = True) -> list[dict[str, Any]]:
        query = "select * from candidates"
        params: list[Any] = []
        if active_only:
            query += " where is_active = 1"
        query += " order by added_at asc"
        return self._fetchall(query, tuple(params))

    def list_tracked_git_people(self, *, active_only: bool = True) -> list[dict[str, Any]]:
        query = "select * from tracked_git_people"
        if active_only:
            query += " where is_active = 1"
        query += " order by added_at asc"
        return self._fetchall(query)

    def list_vcs(self) -> list[dict[str, Any]]:
        return self._fetchall("select * from vcs order by coalesce(tier, 99), name asc")

    def _create_vc_cluster(self, *, name: str) -> dict[str, Any]:
        row = {
            "id": str(uuid4()),
            "name": name.strip(),
            "created_at": _now_iso(),
        }
        self._execute(
            "insert into vc_clusters (id, name, created_at) values (?, ?, ?)",
            (row["id"], row["name"], row["created_at"]),
        )
        return row

    def _get_vc_cluster_membership(self, vc_id: str) -> dict[str, Any] | None:
        return self._fetchone("select * from vc_cluster_members where vc_id = ? limit 1", (vc_id,))

    def _ensure_vc_cluster_membership(
        self,
        *,
        vc_id: str,
        vc_name: str,
        cluster_id: str | None,
        cluster_name: str | None,
        account_type: str,
        is_primary: bool,
        source: str,
    ) -> None:
        existing = self._get_vc_cluster_membership(vc_id)
        effective_cluster_id = cluster_id or (existing.get("cluster_id") if existing else None)
        if not effective_cluster_id:
            cluster = self._create_vc_cluster(name=cluster_name or vc_name)
            effective_cluster_id = cluster["id"]

        payload = {
            "id": existing["id"] if existing else str(uuid4()),
            "cluster_id": effective_cluster_id,
            "vc_id": vc_id,
            "account_type": (account_type or "firm").strip() or "firm",
            "is_primary": _bool_int(is_primary),
            "confidence": 1.0,
            "source": source.strip() or "manual",
            "created_at": existing.get("created_at") if existing else _now_iso(),
        }
        self._execute(
            """
            insert into vc_cluster_members (id, cluster_id, vc_id, account_type, is_primary, confidence, source, created_at)
            values (?, ?, ?, ?, ?, ?, ?, ?)
            on conflict(vc_id) do update set
              cluster_id = excluded.cluster_id,
              account_type = excluded.account_type,
              is_primary = excluded.is_primary,
              confidence = excluded.confidence,
              source = excluded.source
            """,
            (
                payload["id"],
                payload["cluster_id"],
                payload["vc_id"],
                payload["account_type"],
                payload["is_primary"],
                payload["confidence"],
                payload["source"],
                payload["created_at"],
            ),
        )

    def upsert_vc(
        self,
        *,
        name: str,
        twitter_handle: str | None,
        linkedin_url: str | None,
        tier: str | int | None = 2,
        cluster_id: str | None = None,
        cluster_name: str | None = None,
        account_type: str = "firm",
        is_primary_cluster_account: bool = True,
        cluster_source: str = "manual_watchlist_add",
    ) -> dict[str, Any]:
        normalized_name = name.strip()
        normalized_handle = normalize_handle(twitter_handle)
        normalized_linkedin = normalize_linkedin_url(linkedin_url)
        if not normalized_name:
            raise ValueError("Seed source name is required")
        tier_value = _tier_to_int(tier) or 2

        existing = None
        if normalized_handle:
            existing = self._fetchone("select * from vcs where twitter_handle = ? limit 1", (normalized_handle,))
        if not existing and normalized_linkedin:
            existing = self.get_vc_by_linkedin_url(normalized_linkedin)
        if not existing:
            existing = self._fetchone("select * from vcs where lower(name) = ? limit 1", (normalized_name.lower(),))

        vc_id = existing["id"] if existing else str(uuid4())
        added_at = existing.get("added_at") if existing else _now_iso()
        self._execute(
            """
            insert into vcs (id, name, twitter_handle, linkedin_url, tier, added_at, cluster_name, account_type, is_primary_cluster_account)
            values (?, ?, ?, ?, ?, ?, ?, ?, ?)
            on conflict(id) do update set
              name = excluded.name,
              twitter_handle = excluded.twitter_handle,
              linkedin_url = excluded.linkedin_url,
              tier = excluded.tier,
              cluster_name = excluded.cluster_name,
              account_type = excluded.account_type,
              is_primary_cluster_account = excluded.is_primary_cluster_account
            """,
            (
                vc_id,
                normalized_name,
                normalized_handle,
                normalized_linkedin,
                tier_value,
                added_at,
                cluster_name or normalized_name,
                account_type or "firm",
                _bool_int(is_primary_cluster_account),
            ),
        )
        self._ensure_vc_cluster_membership(
            vc_id=vc_id,
            vc_name=normalized_name,
            cluster_id=cluster_id,
            cluster_name=cluster_name,
            account_type=account_type,
            is_primary=is_primary_cluster_account,
            source=cluster_source,
        )
        return self._fetchone("select * from vcs where id = ?", (vc_id,)) or {"id": vc_id, "name": normalized_name}

    def get_candidate_by_id(self, candidate_id: str) -> dict[str, Any] | None:
        return self._fetchone("select * from candidates where id = ? limit 1", (candidate_id,))

    def find_candidate_by_twitter_handle(self, handle: str) -> dict[str, Any] | None:
        return self._fetchone(
            "select * from candidates where twitter_handle = ? limit 1",
            (normalize_handle(handle),),
        )

    def get_twitter_cursor(self, vc_id: str) -> dict[str, Any] | None:
        return self._fetchone("select * from twitter_vc_cursors where vc_id = ? limit 1", (vc_id,))

    def get_tracked_person_twitter_cursor(self, tracked_person_id: str) -> dict[str, Any] | None:
        return self._fetchone(
            "select * from tracked_person_twitter_cursors where tracked_person_id = ? limit 1",
            (tracked_person_id,),
        )

    def count_twitter_snapshots(self, vc_id: str) -> int:
        row = self._fetchone("select count(*) as count from twitter_following_snapshots where vc_id = ?", (vc_id,))
        return int(row["count"]) if row else 0

    def count_tracked_person_twitter_snapshots(self, tracked_person_id: str) -> int:
        row = self._fetchone(
            "select count(*) as count from tracked_person_twitter_following_snapshots where tracked_person_id = ?",
            (tracked_person_id,),
        )
        return int(row["count"]) if row else 0

    def count_all_twitter_snapshots(self) -> int:
        row = self._fetchone("select count(*) as count from twitter_following_snapshots")
        return int(row["count"]) if row else 0

    def count_all_tracked_person_twitter_snapshots(self) -> int:
        row = self._fetchone("select count(*) as count from tracked_person_twitter_following_snapshots")
        return int(row["count"]) if row else 0

    def list_twitter_snapshots(self) -> list[dict[str, Any]]:
        return self._fetchall(
            "select id, vc_id, followed_handle, first_seen_at, created_at from twitter_following_snapshots order by first_seen_at desc, created_at desc"
        )

    def list_tracked_person_twitter_snapshots(self) -> list[dict[str, Any]]:
        return self._fetchall(
            "select id, tracked_person_id, followed_handle, first_seen_at, created_at from tracked_person_twitter_following_snapshots order by first_seen_at desc, created_at desc"
        )

    def twitter_snapshot_exists(self, vc_id: str, followed_handle: str) -> bool:
        return bool(
            self._fetchone(
                "select id from twitter_following_snapshots where vc_id = ? and followed_handle = ? limit 1",
                (vc_id, normalize_handle(followed_handle)),
            )
        )

    def tracked_person_twitter_snapshot_exists(self, tracked_person_id: str, followed_handle: str) -> bool:
        return bool(
            self._fetchone(
                "select id from tracked_person_twitter_following_snapshots where tracked_person_id = ? and followed_handle = ? limit 1",
                (tracked_person_id, normalize_handle(followed_handle)),
            )
        )

    def upsert_twitter_snapshot(self, vc_id: str, followed_handle: str, first_seen_at: date) -> None:
        existing = self._fetchone(
            "select * from twitter_following_snapshots where vc_id = ? and followed_handle = ? limit 1",
            (vc_id, normalize_handle(followed_handle)),
        )
        if existing:
            self._execute(
                "update twitter_following_snapshots set first_seen_at = ? where id = ?",
                (min(existing["first_seen_at"], first_seen_at.isoformat()), existing["id"]),
            )
            return
        self._execute(
            """
            insert into twitter_following_snapshots (id, vc_id, followed_handle, first_seen_at, created_at)
            values (?, ?, ?, ?, ?)
            """,
            (str(uuid4()), vc_id, normalize_handle(followed_handle), first_seen_at.isoformat(), _now_iso()),
        )

    def upsert_tracked_person_twitter_snapshot(self, tracked_person_id: str, followed_handle: str, first_seen_at: date) -> None:
        existing = self._fetchone(
            "select * from tracked_person_twitter_following_snapshots where tracked_person_id = ? and followed_handle = ? limit 1",
            (tracked_person_id, normalize_handle(followed_handle)),
        )
        if existing:
            self._execute(
                "update tracked_person_twitter_following_snapshots set first_seen_at = ? where id = ?",
                (min(existing["first_seen_at"], first_seen_at.isoformat()), existing["id"]),
            )
            return
        self._execute(
            """
            insert into tracked_person_twitter_following_snapshots (id, tracked_person_id, followed_handle, first_seen_at, created_at)
            values (?, ?, ?, ?, ?)
            """,
            (str(uuid4()), tracked_person_id, normalize_handle(followed_handle), first_seen_at.isoformat(), _now_iso()),
        )

    def prune_twitter_snapshots(self, *, max_rows: int, protected_handles: set[str] | None = None) -> int:
        if max_rows <= 0:
            return 0
        protected = {normalize_handle(handle) for handle in (protected_handles or set()) if normalize_handle(handle)}
        rows = self._fetchall(
            "select id, followed_handle, first_seen_at, created_at from twitter_following_snapshots order by first_seen_at asc, created_at asc"
        )
        overflow = len(rows) - max_rows
        if overflow <= 0:
            return 0
        ordered = [row for row in rows if normalize_handle(row["followed_handle"]) not in protected] + [
            row for row in rows if normalize_handle(row["followed_handle"]) in protected
        ]
        ids_to_delete = [row["id"] for row in ordered[:overflow]]
        if not ids_to_delete:
            return 0
        placeholders = ",".join("?" for _ in ids_to_delete)
        self._execute(f"delete from twitter_following_snapshots where id in ({placeholders})", tuple(ids_to_delete))
        return len(ids_to_delete)

    def prune_tracked_person_twitter_snapshots(self, *, max_rows: int, protected_handles: set[str] | None = None) -> int:
        if max_rows <= 0:
            return 0
        protected = {normalize_handle(handle) for handle in (protected_handles or set()) if normalize_handle(handle)}
        rows = self._fetchall(
            "select id, followed_handle, first_seen_at, created_at from tracked_person_twitter_following_snapshots order by first_seen_at asc, created_at asc"
        )
        overflow = len(rows) - max_rows
        if overflow <= 0:
            return 0
        ordered = [row for row in rows if normalize_handle(row["followed_handle"]) not in protected] + [
            row for row in rows if normalize_handle(row["followed_handle"]) in protected
        ]
        ids_to_delete = [row["id"] for row in ordered[:overflow]]
        if not ids_to_delete:
            return 0
        placeholders = ",".join("?" for _ in ids_to_delete)
        self._execute(f"delete from tracked_person_twitter_following_snapshots where id in ({placeholders})", tuple(ids_to_delete))
        return len(ids_to_delete)

    def upsert_twitter_cursor(self, vc_id: str, last_known_handle: str, last_run_at: datetime | None = None) -> None:
        self._execute(
            """
            insert into twitter_vc_cursors (vc_id, last_known_handle, last_run_at)
            values (?, ?, ?)
            on conflict(vc_id) do update set last_known_handle = excluded.last_known_handle, last_run_at = excluded.last_run_at
            """,
            (vc_id, normalize_handle(last_known_handle), (last_run_at or utc_now()).isoformat()),
        )

    def upsert_tracked_person_twitter_cursor(self, tracked_person_id: str, last_known_handle: str, last_run_at: datetime | None = None) -> None:
        self._execute(
            """
            insert into tracked_person_twitter_cursors (tracked_person_id, last_known_handle, last_run_at)
            values (?, ?, ?)
            on conflict(tracked_person_id) do update set last_known_handle = excluded.last_known_handle, last_run_at = excluded.last_run_at
            """,
            (tracked_person_id, normalize_handle(last_known_handle), (last_run_at or utc_now()).isoformat()),
        )

    def upsert_twitter_vc_follow(self, candidate_id: str, vc_id: str, *, first_seen_at: date, last_seen_at: date) -> None:
        existing = self._fetchone(
            "select * from twitter_vc_follows where candidate_id = ? and vc_id = ? limit 1",
            (candidate_id, vc_id),
        )
        if existing:
            self._execute(
                "update twitter_vc_follows set first_seen_at = ?, last_seen_at = ? where id = ?",
                (
                    min(existing["first_seen_at"], first_seen_at.isoformat()),
                    max(existing["last_seen_at"], last_seen_at.isoformat()),
                    existing["id"],
                ),
            )
            return
        self._execute(
            """
            insert into twitter_vc_follows (id, candidate_id, vc_id, first_seen_at, last_seen_at)
            values (?, ?, ?, ?, ?)
            """,
            (str(uuid4()), candidate_id, vc_id, first_seen_at.isoformat(), last_seen_at.isoformat()),
        )

    def get_seed_twitter_handles(self) -> set[str]:
        return {
            normalize_handle(row.get("twitter_handle"))
            for row in self.list_vcs()
            if normalize_handle(row.get("twitter_handle"))
        }

    def get_app_setting(self, key: str) -> str | None:
        normalized_key = (key or "").strip()
        if not normalized_key:
            return None
        row = self._fetchone("select value from app_settings where key = ? limit 1", (normalized_key,))
        return str(row["value"]) if row and row.get("value") is not None else None

    def set_app_setting(self, key: str, value: str | int | bool) -> dict[str, Any]:
        normalized_key = (key or "").strip()
        if not normalized_key:
            raise ValueError("Setting key is required")
        now = _now_iso()
        existing = self._fetchone("select * from app_settings where key = ? limit 1", (normalized_key,))
        self._execute(
            """
            insert into app_settings (key, value, created_at, updated_at)
            values (?, ?, ?, ?)
            on conflict(key) do update set
              value = excluded.value,
              updated_at = excluded.updated_at
            """,
            (normalized_key, str(value), existing.get("created_at") if existing else now, now),
        )
        return self._fetchone("select * from app_settings where key = ? limit 1", (normalized_key,)) or {
            "key": normalized_key,
            "value": str(value),
        }

    def get_seed_follow_alert_threshold(self) -> int:
        stored = self.get_app_setting("seed_follow_alert_threshold")
        if stored is not None:
            return normalize_seed_follow_alert_threshold(stored)
        return normalize_seed_follow_alert_threshold(get_settings().seed_follow_alert_threshold)

    def set_seed_follow_alert_threshold(self, value: Any) -> int:
        threshold = normalize_seed_follow_alert_threshold(value)
        self.set_app_setting("seed_follow_alert_threshold", threshold)
        return threshold

    def upsert_discovered_person_from_x(
        self,
        *,
        x_handle: str,
        display_name: str | None,
        seen_at: date,
    ) -> dict[str, Any]:
        normalized_handle = normalize_handle(x_handle)
        if not normalized_handle:
            raise RuntimeError("Cannot persist discovered person without an X handle")

        person_id = f"x-{normalized_handle}"
        profile_url = f"https://x.com/{normalized_handle}"
        existing = self._fetchone("select * from discovered_people where x_handle = ? limit 1", (normalized_handle,))
        now = _now_iso()
        if existing:
            self._execute(
                """
                update discovered_people
                set display_name = coalesce(nullif(?, ''), display_name),
                    last_seen_at = ?
                where id = ?
                """,
                ((display_name or "").strip(), seen_at.isoformat(), existing["id"]),
            )
            return self._fetchone("select * from discovered_people where id = ?", (existing["id"],)) or existing

        self._execute(
            """
            insert into discovered_people (id, x_handle, display_name, primary_profile_url, github_url, linkedin_url, first_seen_at, last_seen_at, created_at)
            values (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                person_id,
                normalized_handle,
                (display_name or "").strip() or f"@{normalized_handle}",
                profile_url,
                None,
                None,
                seen_at.isoformat(),
                seen_at.isoformat(),
                now,
            ),
        )
        return self._fetchone("select * from discovered_people where id = ?", (person_id,)) or {"id": person_id}

    def upsert_seed_follow_observation(
        self,
        *,
        seed_vc_id: str,
        followed_handle: str,
        followed_name: str | None,
        first_seen_at: date,
        last_seen_at: date,
    ) -> dict[str, Any] | None:
        normalized_handle = normalize_handle(followed_handle)
        if not normalized_handle:
            return None

        person = self.upsert_discovered_person_from_x(
            x_handle=normalized_handle,
            display_name=followed_name,
            seen_at=first_seen_at,
        )
        discovered_person_id = person["id"]
        existing = self._fetchone(
            "select * from seed_follow_observations where seed_vc_id = ? and discovered_person_id = ? limit 1",
            (seed_vc_id, discovered_person_id),
        )
        now = _now_iso()
        if existing:
            self._execute(
                """
                update seed_follow_observations
                set first_seen_at = ?, last_seen_at = ?
                where id = ?
                """,
                (
                    min(existing["first_seen_at"], first_seen_at.isoformat()),
                    max(existing["last_seen_at"], last_seen_at.isoformat()),
                    existing["id"],
                ),
            )
        else:
            self._execute(
                """
                insert into seed_follow_observations (id, seed_vc_id, discovered_person_id, followed_handle, first_seen_at, last_seen_at, created_at)
                values (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    str(uuid4()),
                    seed_vc_id,
                    discovered_person_id,
                    normalized_handle,
                    first_seen_at.isoformat(),
                    last_seen_at.isoformat(),
                    now,
                ),
            )

        return self.ensure_seed_follow_alert(discovered_person_id)

    def backfill_seed_follow_alerts_from_snapshots(self) -> dict[str, int]:
        """Upgrade legacy X follow snapshots into the v1 alert-inbox model."""
        threshold = self.get_seed_follow_alert_threshold()
        seed_handles = self.get_seed_twitter_handles()
        before_observations = self._fetchone("select count(*) as count from seed_follow_observations") or {"count": 0}
        before_alerts = self._fetchone("select count(*) as count from seed_follow_alert_events") or {"count": 0}
        rows = self._fetchall(
            """
            select s.vc_id, s.followed_handle, s.first_seen_at, s.created_at
            from twitter_following_snapshots s
            left join discovered_people p on p.x_handle = s.followed_handle
            left join seed_follow_observations o on o.seed_vc_id = s.vc_id and o.discovered_person_id = p.id
            where o.id is null
            order by s.first_seen_at asc, s.created_at asc
            """
        )

        skipped_seed_accounts = 0
        processed_snapshots = 0
        for row in rows:
            followed_handle = normalize_handle(row.get("followed_handle"))
            if not followed_handle:
                continue
            if followed_handle in seed_handles:
                skipped_seed_accounts += 1
                continue

            first_seen_at = _date_from_storage(row.get("first_seen_at") or row.get("created_at"))
            self.upsert_seed_follow_observation(
                seed_vc_id=row["vc_id"],
                followed_handle=followed_handle,
                followed_name=f"@{followed_handle}",
                first_seen_at=first_seen_at,
                last_seen_at=first_seen_at,
            )
            processed_snapshots += 1

        alert_candidates = self._fetchall(
            """
            select discovered_person_id
            from seed_follow_observations
            group by discovered_person_id
            having count(distinct seed_vc_id) >= ?
            """,
            (threshold,),
        )
        existing_alert_person_ids = {
            row["discovered_person_id"]
            for row in self._fetchall("select discovered_person_id from seed_follow_alert_events")
        }
        for row in alert_candidates:
            person_id = row["discovered_person_id"]
            if person_id in existing_alert_person_ids:
                continue
            alert = self.ensure_seed_follow_alert(person_id, threshold=threshold)
            if alert:
                existing_alert_person_ids.add(person_id)

        after_observations = self._fetchone("select count(*) as count from seed_follow_observations") or {"count": 0}
        after_alerts = self._fetchone("select count(*) as count from seed_follow_alert_events") or {"count": 0}
        return {
            "processedSnapshots": processed_snapshots,
            "skippedSeedAccounts": skipped_seed_accounts,
            "observationsCreated": int(after_observations["count"]) - int(before_observations["count"]),
            "alertsCreated": int(after_alerts["count"]) - int(before_alerts["count"]),
            "threshold": threshold,
        }

    def ensure_seed_follow_alerts_for_threshold(self, threshold: Any | None = None) -> dict[str, int]:
        normalized_threshold = normalize_seed_follow_alert_threshold(
            threshold if threshold is not None else self.get_seed_follow_alert_threshold()
        )
        before_alerts = self._fetchone("select count(*) as count from seed_follow_alert_events") or {"count": 0}
        rows = self._fetchall(
            """
            select discovered_person_id
            from seed_follow_observations
            group by discovered_person_id
            having count(distinct seed_vc_id) >= ?
            """,
            (normalized_threshold,),
        )
        existing_alert_person_ids = {
            row["discovered_person_id"]
            for row in self._fetchall("select discovered_person_id from seed_follow_alert_events")
        }
        checked = 0
        for row in rows:
            person_id = row["discovered_person_id"]
            checked += 1
            if person_id in existing_alert_person_ids:
                continue
            alert = self.ensure_seed_follow_alert(person_id, threshold=normalized_threshold)
            if alert:
                existing_alert_person_ids.add(person_id)
        after_alerts = self._fetchone("select count(*) as count from seed_follow_alert_events") or {"count": 0}
        return {
            "checkedPeople": checked,
            "alertsCreated": int(after_alerts["count"]) - int(before_alerts["count"]),
            "threshold": normalized_threshold,
        }

    def ensure_seed_follow_alert(self, discovered_person_id: str, threshold: Any | None = None) -> dict[str, Any] | None:
        normalized_threshold = normalize_seed_follow_alert_threshold(
            threshold if threshold is not None else self.get_seed_follow_alert_threshold()
        )
        existing_alert = self._fetchone(
            "select * from seed_follow_alert_events where discovered_person_id = ? limit 1",
            (discovered_person_id,),
        )
        if existing_alert:
            existing_alert["triggering_seed_accounts"] = _json_load(existing_alert.get("triggering_seed_accounts"), [])
            existing_alert["trigger_threshold"] = normalize_seed_follow_alert_threshold(
                existing_alert.get("trigger_threshold") or DEFAULT_SEED_FOLLOW_ALERT_THRESHOLD
            )
            triggered_at = str(existing_alert.get("triggered_at") or "").strip()
            if len(triggered_at) <= 10 and existing_alert.get("created_at"):
                existing_alert["triggered_at"] = existing_alert["created_at"]
            return existing_alert

        trigger_rows = self._fetchall(
            """
            select o.seed_vc_id, o.first_seen_at, o.created_at, v.name, v.twitter_handle, v.account_type, v.tier
            from seed_follow_observations o
            join vcs v on v.id = o.seed_vc_id
            where o.discovered_person_id = ?
            order by o.first_seen_at asc, o.created_at asc
            limit ?
            """,
            (discovered_person_id, normalized_threshold),
        )
        if len(trigger_rows) < normalized_threshold:
            return None

        triggered_at = max(
            str(row.get("first_seen_at") or row.get("created_at") or _now_iso())
            for row in trigger_rows
        )
        triggering_seed_accounts = [
            {
                "id": row["seed_vc_id"],
                "name": row.get("name") or "Seed account",
                "xHandle": row.get("twitter_handle"),
                "accountType": row.get("account_type") or "firm",
                "tier": row.get("tier"),
                "profileUrl": f"https://x.com/{row['twitter_handle']}" if row.get("twitter_handle") else None,
            }
            for row in trigger_rows
        ]
        alert_id = f"seed-follow-threshold-{discovered_person_id}"
        now = _now_iso()
        self._execute(
            """
            insert into seed_follow_alert_events (id, discovered_person_id, triggered_at, triggering_seed_accounts, trigger_threshold, status, created_at)
            values (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                alert_id,
                discovered_person_id,
                triggered_at,
                _json_dump(triggering_seed_accounts),
                normalized_threshold,
                "new",
                now,
            ),
        )
        row = self._fetchone("select * from seed_follow_alert_events where id = ?", (alert_id,))
        if row:
            row["triggering_seed_accounts"] = triggering_seed_accounts
            row["trigger_threshold"] = normalized_threshold
        return row

    def promote_seed_follow_alert_to_vc(
        self,
        *,
        alert_id: str,
        name: str,
        x_handle: str | None = None,
        linkedin_url: str | None = None,
        cluster_name: str | None = None,
        account_type: str = "partner",
        tier: str | int | None = "microvc",
    ) -> dict[str, Any]:
        normalized_alert_id = (alert_id or "").strip()
        if not normalized_alert_id:
            raise ValueError("alertId is required")

        alert = self._fetchone(
            "select * from seed_follow_alert_events where id = ? limit 1",
            (normalized_alert_id,),
        )
        if not alert:
            raise ValueError("Seed follow alert not found")

        person = self.get_discovered_person(alert["discovered_person_id"])
        if not person:
            raise ValueError("Discovered person not found")

        normalized_handle = normalize_handle(x_handle) or normalize_handle(person.get("x_handle"))
        if not normalized_handle:
            raise ValueError("X handle is required")

        normalized_name = (name or "").strip() or (person.get("display_name") or "").strip() or f"@{normalized_handle}"
        normalized_linkedin_url = normalize_linkedin_url(linkedin_url) or normalize_linkedin_url(person.get("linkedin_url"))
        normalized_cluster_name = (cluster_name or "").strip() or normalized_name
        normalized_account_type = (account_type or "partner").strip() or "partner"
        tier_value = _tier_to_int(tier) or 2

        vc = self.upsert_vc(
            name=normalized_name,
            twitter_handle=normalized_handle,
            linkedin_url=normalized_linkedin_url,
            tier=tier_value,
            cluster_name=normalized_cluster_name,
            account_type=normalized_account_type,
            is_primary_cluster_account=False,
            cluster_source="seed_follow_alert_promotion",
        )

        now = _now_iso()
        self._execute(
            """
            update seed_follow_alert_events
            set status = ?,
                promoted_vc_id = ?,
                promoted_at = coalesce(promoted_at, ?)
            where id = ?
            """,
            ("promoted", vc["id"], now, normalized_alert_id),
        )

        promoted_alert = self._fetchone(
            "select * from seed_follow_alert_events where id = ? limit 1",
            (normalized_alert_id,),
        )
        return {
            "vc": vc,
            "alert": promoted_alert or {"id": normalized_alert_id, "status": "promoted", "promoted_vc_id": vc["id"]},
        }

    def update_seed_follow_alert_status(self, *, alert_id: str, status: str) -> dict[str, Any]:
        normalized_alert_id = (alert_id or "").strip()
        normalized_status = (status or "").strip().lower()
        if not normalized_alert_id:
            raise ValueError("alertId is required")
        if normalized_status not in {"new", "seen", "liked", "archived"}:
            raise ValueError("Unsupported alert status")

        alert = self._fetchone(
            "select * from seed_follow_alert_events where id = ? limit 1",
            (normalized_alert_id,),
        )
        if not alert:
            raise ValueError("Seed follow alert not found")
        if str(alert.get("status") or "").strip().lower() == "promoted":
            raise ValueError("Promoted seed follow alerts cannot be changed")

        self._execute(
            "update seed_follow_alert_events set status = ? where id = ?",
            (normalized_status, normalized_alert_id),
        )
        return self._fetchone(
            "select * from seed_follow_alert_events where id = ? limit 1",
            (normalized_alert_id,),
        ) or {"id": normalized_alert_id, "status": normalized_status}

    def list_seed_follow_alerts(self, *, include_promoted: bool = False, limit: int | None = None) -> list[dict[str, Any]]:
        promoted_filter = "" if include_promoted else "where coalesce(a.status, 'new') != 'promoted'"
        limit_clause = "limit ?" if limit is not None and limit > 0 else ""
        params: tuple[Any, ...] = (int(limit),) if limit_clause else ()
        rows = self._fetchall(
            f"""
            select
              a.id,
              a.discovered_person_id,
              a.triggered_at,
              a.triggering_seed_accounts,
              a.trigger_threshold,
              a.status,
              a.promoted_vc_id,
              a.promoted_at,
              a.created_at,
              p.x_handle,
              p.display_name,
              p.primary_profile_url,
              p.github_url,
              p.linkedin_url,
              p.first_seen_at,
              p.last_seen_at
            from seed_follow_alert_events a
            join discovered_people p on p.id = a.discovered_person_id
            {promoted_filter}
            order by a.triggered_at desc, a.created_at desc
            {limit_clause}
            """,
            params,
        )

        person_ids = [str(row["discovered_person_id"]) for row in rows if row.get("discovered_person_id")]
        followers_by_person_id: dict[str, list[dict[str, Any]]] = {person_id: [] for person_id in person_ids}
        chunk_size = 500
        for start in range(0, len(person_ids), chunk_size):
            chunk = person_ids[start : start + chunk_size]
            if not chunk:
                continue
            placeholders = ", ".join("?" for _ in chunk)
            follower_rows = self._fetchall(
                f"""
                select
                  o.discovered_person_id,
                  o.seed_vc_id,
                  o.first_seen_at,
                  o.last_seen_at,
                  o.created_at,
                  v.name,
                  v.twitter_handle,
                  v.account_type,
                  v.tier
                from seed_follow_observations o
                join vcs v on v.id = o.seed_vc_id
                where o.discovered_person_id in ({placeholders})
                order by o.discovered_person_id, o.first_seen_at asc, o.created_at asc
                """,
                tuple(chunk),
            )
            for follower in follower_rows:
                person_id = follower.get("discovered_person_id")
                if person_id in followers_by_person_id:
                    followers_by_person_id[person_id].append(follower)

        for row in rows:
            row["triggering_seed_accounts"] = _json_load(row.get("triggering_seed_accounts"), [])
            row["trigger_threshold"] = normalize_seed_follow_alert_threshold(
                row.get("trigger_threshold") or DEFAULT_SEED_FOLLOW_ALERT_THRESHOLD
            )
            triggered_at = str(row.get("triggered_at") or "").strip()
            if len(triggered_at) <= 10 and row.get("created_at"):
                row["triggered_at"] = row["created_at"]
            follower_rows = followers_by_person_id.get(str(row.get("discovered_person_id")), [])
            row["seed_followers"] = [
                {
                    "id": follower["seed_vc_id"],
                    "name": follower.get("name") or "Seed account",
                    "xHandle": follower.get("twitter_handle"),
                    "accountType": follower.get("account_type") or "firm",
                    "tier": follower.get("tier"),
                    "profileUrl": f"https://x.com/{follower['twitter_handle']}" if follower.get("twitter_handle") else None,
                    "firstSeenAt": follower.get("first_seen_at"),
                    "lastSeenAt": follower.get("last_seen_at"),
                }
                for follower in follower_rows
            ]
            row["current_seed_follower_count"] = len(follower_rows)
        return rows

    def get_discovered_person(self, person_id: str) -> dict[str, Any] | None:
        normalized_id = (person_id or "").strip()
        if not normalized_id:
            return None
        return self._fetchone("select * from discovered_people where id = ? limit 1", (normalized_id,))

    def get_discovered_person_by_x_handle(self, x_handle: str | None) -> dict[str, Any] | None:
        normalized_handle = normalize_handle(x_handle)
        if not normalized_handle:
            return None
        return self._fetchone("select * from discovered_people where x_handle = ? limit 1", (normalized_handle,))

    def insert_linkedin_enrichment_event(
        self,
        *,
        discovered_person_id: str,
        linkedin_url: str | None,
        headline: str | None,
        role_title: str | None,
        company: str | None,
        location: str | None,
        source: str = "linkedin_native_scraper",
        raw_payload: dict[str, Any] | list[Any] | None = None,
        observed_at: str | None = None,
    ) -> dict[str, Any]:
        person = self.get_discovered_person(discovered_person_id)
        if not person:
            raise RuntimeError(f"Discovered person not found: {discovered_person_id}")

        normalized_linkedin_url = normalize_linkedin_url(linkedin_url)
        now = _now_iso()
        event_id = str(uuid4())
        observed_at_value = (observed_at or now).strip() or now
        source_value = (source or "linkedin_native_scraper").strip() or "linkedin_native_scraper"
        self._execute(
            """
            insert into linkedin_enrichment_events (
              id,
              discovered_person_id,
              linkedin_url,
              headline,
              role_title,
              company,
              location,
              source,
              raw_payload,
              observed_at,
              created_at
            )
            values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event_id,
                discovered_person_id,
                normalized_linkedin_url,
                (headline or "").strip() or None,
                (role_title or "").strip() or None,
                (company or "").strip() or None,
                (location or "").strip() or None,
                source_value,
                _json_dump(raw_payload or {}),
                observed_at_value,
                now,
            ),
        )
        if normalized_linkedin_url:
            self._execute(
                """
                update discovered_people
                set linkedin_url = ?,
                    last_seen_at = max(last_seen_at, ?)
                where id = ?
                """,
                (normalized_linkedin_url, now, discovered_person_id),
            )

        row = self._fetchone("select * from linkedin_enrichment_events where id = ?", (event_id,))
        if row:
            row["raw_payload"] = _json_load(row.get("raw_payload"), {})
        return row or {"id": event_id, "discovered_person_id": discovered_person_id}

    def list_latest_linkedin_enrichments_by_person(self) -> dict[str, dict[str, Any]]:
        rows = self._fetchall(
            """
            select *
            from linkedin_enrichment_events
            order by observed_at desc, created_at desc
            """
        )
        latest_by_person: dict[str, dict[str, Any]] = {}
        for row in rows:
            person_id = row.get("discovered_person_id")
            if not person_id or person_id in latest_by_person:
                continue
            row["raw_payload"] = _json_load(row.get("raw_payload"), {})
            latest_by_person[person_id] = row
        return latest_by_person

    def list_candidates_with_github(self) -> list[dict[str, Any]]:
        return [candidate for candidate in self.list_candidates(active_only=True) if candidate.get("github_username")]

    def list_tracked_git_people_with_github(self) -> list[dict[str, Any]]:
        return [person for person in self.list_tracked_git_people(active_only=True) if person.get("github_username")]

    def list_tracked_git_people_with_twitter(self) -> list[dict[str, Any]]:
        return [person for person in self.list_tracked_git_people(active_only=True) if person.get("twitter_handle")]

    def list_github_observed_people(self) -> list[dict[str, Any]]:
        rows = self._fetchall(
            "select * from github_observed_people order by indicator_count desc, last_seen_at desc"
        )
        for row in rows:
            row["indicators"] = _json_load(row.get("indicators"), [])
        return rows

    def list_latest_github_repo_snapshots_by_tracked_person(self) -> dict[str, list[dict[str, Any]]]:
        rows = self._fetchall(
            """
            select *
            from github_repo_snapshots
            order by snapshot_date desc, star_delta_7d desc, stars desc
            """
        )
        latest_by_person: dict[str, list[dict[str, Any]]] = {}
        seen_repo_keys: set[tuple[str, str]] = set()
        for row in rows:
            person_id = str(row.get("tracked_person_id") or "").strip()
            repo_owner = str(row.get("repo_owner") or "").strip()
            repo_name = str(row.get("repo_name") or "").strip()
            if not person_id or not repo_name:
                continue
            repo_key = (person_id, f"{repo_owner}/{repo_name}" if repo_owner else repo_name)
            if repo_key in seen_repo_keys:
                continue
            seen_repo_keys.add(repo_key)
            latest_by_person.setdefault(person_id, []).append(row)
        for person_id, snapshots in latest_by_person.items():
            latest_by_person[person_id] = sorted(
                snapshots,
                key=lambda row: (
                    int(row.get("star_delta_7d") or 0),
                    int(row.get("stars") or 0),
                    str(row.get("snapshot_date") or ""),
                ),
                reverse=True,
            )
        return latest_by_person

    def list_recent_github_person_events_by_tracked_person(self, *, limit_per_person: int = 5) -> dict[str, list[dict[str, Any]]]:
        rows = self._fetchall(
            """
            select *
            from github_person_events
            order by occurred_at desc, created_at desc
            """
        )
        events_by_person: dict[str, list[dict[str, Any]]] = {}
        for row in rows:
            person_id = str(row.get("tracked_person_id") or "").strip()
            if not person_id:
                continue
            bucket = events_by_person.setdefault(person_id, [])
            if len(bucket) >= limit_per_person:
                continue
            row["detail"] = _json_load(row.get("detail"), {})
            bucket.append(row)
        return events_by_person

    def list_github_observed_usernames(self, *, source_tracked_person_id: str, relationship_type: str) -> set[str]:
        rows = self._fetchall(
            "select github_username from github_observed_people where source_tracked_person_id = ? and relationship_type = ?",
            (source_tracked_person_id, relationship_type),
        )
        return {normalize_handle(row["github_username"]) for row in rows if normalize_handle(row.get("github_username"))}

    def list_github_followed_tracked_person_ids(self, *, follower_tracked_person_id: str) -> set[str]:
        rows = self._fetchall(
            "select followed_tracked_person_id from github_follow_relationships where follower_tracked_person_id = ?",
            (follower_tracked_person_id,),
        )
        return {row["followed_tracked_person_id"] for row in rows if row.get("followed_tracked_person_id")}

    def list_person_identities(self) -> list[dict[str, Any]]:
        rows = self._fetchall("select * from person_identities")
        for row in rows:
            row["is_primary"] = bool(row.get("is_primary"))
        return rows

    def clear_identity_match_candidates(self) -> None:
        self._execute("delete from identity_match_candidates")

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
        existing = self._fetchone(
            "select * from person_identities where tracked_person_id = ? and platform = ? and handle = ? limit 1",
            (tracked_person_id, platform, normalized_handle),
        )
        identity_id = existing["id"] if existing else str(uuid4())
        created_at = existing.get("created_at") if existing else _now_iso()
        self._execute(
            """
            insert into person_identities (id, tracked_person_id, candidate_id, platform, handle, profile_url, is_primary, match_confidence, match_source, created_at)
            values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            on conflict(id) do update set
              candidate_id = excluded.candidate_id,
              profile_url = excluded.profile_url,
              is_primary = excluded.is_primary,
              match_confidence = excluded.match_confidence,
              match_source = excluded.match_source
            """,
            (
                identity_id,
                tracked_person_id,
                candidate_id,
                platform,
                normalized_handle,
                profile_url,
                _bool_int(is_primary),
                match_confidence,
                match_source,
                created_at,
            ),
        )

    def upsert_identity_match_candidate(
        self,
        *,
        tracked_person_id: str,
        candidate_id: str,
        confidence: float,
        reasons: list[dict[str, Any]],
        status: str,
    ) -> None:
        existing = self._fetchone(
            "select * from identity_match_candidates where tracked_person_id = ? and candidate_id = ? limit 1",
            (tracked_person_id, candidate_id),
        )
        row_id = existing["id"] if existing else str(uuid4())
        created_at = existing.get("created_at") if existing else _now_iso()
        self._execute(
            """
            insert into identity_match_candidates (id, tracked_person_id, candidate_id, confidence, reasons, status, created_at)
            values (?, ?, ?, ?, ?, ?, ?)
            on conflict(id) do update set
              confidence = excluded.confidence,
              reasons = excluded.reasons,
              status = excluded.status
            """,
            (row_id, tracked_person_id, candidate_id, confidence, _json_dump(reasons), status, created_at),
        )

    def upsert_github_follow_relationship(
        self,
        *,
        follower_tracked_person_id: str,
        followed_tracked_person_id: str,
        source_url: str | None,
    ) -> None:
        existing = self._fetchone(
            "select * from github_follow_relationships where follower_tracked_person_id = ? and followed_tracked_person_id = ? limit 1",
            (follower_tracked_person_id, followed_tracked_person_id),
        )
        now = _now_iso()
        if existing:
            self._execute(
                "update github_follow_relationships set last_seen_at = ?, source_url = ? where id = ?",
                (now, source_url, existing["id"]),
            )
            return
        self._execute(
            """
            insert into github_follow_relationships (id, follower_tracked_person_id, followed_tracked_person_id, first_seen_at, last_seen_at, created_at, source_url)
            values (?, ?, ?, ?, ?, ?, ?)
            """,
            (str(uuid4()), follower_tracked_person_id, followed_tracked_person_id, now, now, now, source_url),
        )

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
        normalized_username = normalize_handle(github_username) or ""
        existing = self._fetchone(
            "select * from github_observed_people where source_tracked_person_id = ? and github_username = ? and relationship_type = ? limit 1",
            (source_tracked_person_id, normalized_username, relationship_type),
        )
        now = _now_iso()
        row_id = existing["id"] if existing else str(uuid4())
        first_seen_at = existing.get("first_seen_at") if existing else now
        added_to_watchlist = existing.get("added_to_watchlist") if existing else 0
        self._execute(
            """
            insert into github_observed_people (
              id, source_tracked_person_id, relationship_type, github_username, name, profile_url, avatar_url, bio, company, location, blog_url,
              twitter_handle, followers_count, following_count, public_repos_count, indicator_count, indicators, can_add_to_watchlist, added_to_watchlist,
              first_seen_at, last_seen_at, created_at
            )
            values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            on conflict(id) do update set
              name = excluded.name,
              profile_url = excluded.profile_url,
              avatar_url = excluded.avatar_url,
              bio = excluded.bio,
              company = excluded.company,
              location = excluded.location,
              blog_url = excluded.blog_url,
              twitter_handle = excluded.twitter_handle,
              followers_count = excluded.followers_count,
              following_count = excluded.following_count,
              public_repos_count = excluded.public_repos_count,
              indicator_count = excluded.indicator_count,
              indicators = excluded.indicators,
              can_add_to_watchlist = excluded.can_add_to_watchlist,
              last_seen_at = excluded.last_seen_at
            """,
            (
                row_id,
                source_tracked_person_id,
                relationship_type,
                normalized_username,
                name,
                profile_url,
                avatar_url,
                bio,
                company,
                location,
                blog_url,
                normalize_handle(twitter_handle),
                followers_count,
                following_count,
                public_repos_count,
                indicator_count,
                _json_dump(indicators),
                _bool_int(can_add_to_watchlist),
                added_to_watchlist,
                first_seen_at,
                now,
                existing.get("created_at") if existing else now,
            ),
        )
        row = self.get_github_observed_person(row_id) or {}
        return row

    def get_github_observed_person(self, observed_person_id: str) -> dict[str, Any] | None:
        row = self._fetchone("select * from github_observed_people where id = ? limit 1", (observed_person_id,))
        if row:
            row["indicators"] = _json_load(row.get("indicators"), [])
        return row

    def mark_observed_person_added_to_watchlist(self, observed_person_id: str) -> None:
        self._execute(
            "update github_observed_people set added_to_watchlist = 1, last_seen_at = ? where id = ?",
            (_now_iso(), observed_person_id),
        )

    def insert_tracked_git_person_from_observed(self, observed: dict[str, Any]) -> dict[str, Any]:
        return self.upsert_tracked_git_person(
            name=observed.get("name") or observed.get("github_username") or "Observed GitHub person",
            github_username=observed.get("github_username"),
            twitter_handle=observed.get("twitter_handle"),
            linkedin_url=None,
            role_title="Observed GitHub person",
            company=observed.get("company"),
            location=observed.get("location"),
            summary=observed.get("bio") or "Observed from the GitHub network graph.",
        )

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
        if not normalized_name:
            raise ValueError("Tracked person name is required")
        normalized_github = normalize_handle(github_username)
        normalized_twitter = normalize_handle(twitter_handle)
        normalized_linkedin = normalize_linkedin_url(linkedin_url)
        existing = None
        if normalized_github:
            existing = self._fetchone("select * from tracked_git_people where github_username = ? limit 1", (normalized_github,))
        if not existing and normalized_twitter:
            existing = self._fetchone("select * from tracked_git_people where twitter_handle = ? limit 1", (normalized_twitter,))

        person_id = existing["id"] if existing else str(uuid4())
        added_at = existing.get("added_at") if existing else _now_iso()
        self._execute(
            """
            insert into tracked_git_people (id, name, github_username, twitter_handle, linkedin_url, role_title, company, location, summary, added_at, is_active)
            values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            on conflict(id) do update set
              name = excluded.name,
              github_username = excluded.github_username,
              twitter_handle = excluded.twitter_handle,
              linkedin_url = excluded.linkedin_url,
              role_title = excluded.role_title,
              company = excluded.company,
              location = excluded.location,
              summary = excluded.summary,
              is_active = 1
            """,
            (
                person_id,
                normalized_name,
                normalized_github,
                normalized_twitter,
                normalized_linkedin,
                (role_title or "").strip() or "Tracked builder",
                (company or "").strip() or None,
                (location or "").strip() or None,
                (summary or "").strip() or "Manually added to the local workspace.",
                added_at,
            ),
        )
        person = self._fetchone("select * from tracked_git_people where id = ?", (person_id,)) or {"id": person_id}
        candidate = self._upsert_candidate_record(
            name=normalized_name,
            github_username=normalized_github,
            twitter_handle=normalized_twitter,
            linkedin_url=normalized_linkedin,
            role_title=(role_title or "").strip() or "Tracked builder",
            company=(company or "").strip() or None,
            location=(location or "").strip() or None,
            summary=(summary or "").strip() or "Manually added to the local workspace.",
        )
        if normalized_github:
            self.upsert_person_identity(
                tracked_person_id=person_id,
                candidate_id=candidate["id"],
                platform="github",
                handle=normalized_github,
                profile_url=f"https://github.com/{normalized_github}",
                is_primary=True,
                match_confidence=1.0,
                match_source="local_auto_sync",
            )
        if normalized_twitter:
            self.upsert_person_identity(
                tracked_person_id=person_id,
                candidate_id=candidate["id"],
                platform="x",
                handle=normalized_twitter,
                profile_url=f"https://x.com/{normalized_twitter}",
                is_primary=not bool(normalized_github),
                match_confidence=1.0,
                match_source="local_auto_sync",
            )
        if normalized_linkedin:
            self.upsert_person_identity(
                tracked_person_id=person_id,
                candidate_id=candidate["id"],
                platform="linkedin",
                handle=normalized_linkedin,
                profile_url=normalized_linkedin,
                is_primary=not bool(normalized_github or normalized_twitter),
                match_confidence=1.0,
                match_source="local_auto_sync",
            )
        return person

    def upsert_github_repo_snapshot_for_person(
        self,
        tracked_person_id: str,
        *,
        repo_owner: str | None,
        repo_name: str,
        stars: int,
        forks: int,
        watchers: int,
        open_issues: int,
        star_delta_7d: int,
        star_delta_30d: int,
        snapshot_date: date,
    ) -> None:
        existing = self._fetchone(
            "select * from github_repo_snapshots where tracked_person_id = ? and coalesce(repo_owner, '') = ? and repo_name = ? and snapshot_date = ? limit 1",
            (tracked_person_id, repo_owner or "", repo_name, snapshot_date.isoformat()),
        )
        row_id = existing["id"] if existing else str(uuid4())
        created_at = existing.get("created_at") if existing else _now_iso()
        self._execute(
            """
            insert into github_repo_snapshots (id, tracked_person_id, repo_owner, repo_name, stars, forks, watchers, open_issues, star_delta_7d, star_delta_30d, snapshot_date, created_at)
            values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            on conflict(id) do update set
              stars = excluded.stars,
              forks = excluded.forks,
              watchers = excluded.watchers,
              open_issues = excluded.open_issues,
              star_delta_7d = excluded.star_delta_7d,
              star_delta_30d = excluded.star_delta_30d
            """,
            (
                row_id,
                tracked_person_id,
                repo_owner,
                repo_name,
                stars,
                forks,
                watchers,
                open_issues,
                star_delta_7d,
                star_delta_30d,
                snapshot_date.isoformat(),
                created_at,
            ),
        )

    def get_repo_reference_snapshot_map_for_person(self, tracked_person_id: str, before_or_on: date) -> dict[str, dict[str, Any]]:
        rows = self._fetchall(
            """
            select * from github_repo_snapshots
            where tracked_person_id = ? and snapshot_date <= ?
            order by snapshot_date desc
            """,
            (tracked_person_id, before_or_on.isoformat()),
        )
        reference: dict[str, dict[str, Any]] = {}
        for row in rows:
            repo_owner = (row.get("repo_owner") or "").strip()
            repo_name = (row.get("repo_name") or "").strip()
            repo_key = "/".join(part for part in [repo_owner, repo_name] if part)
            if repo_key:
                reference.setdefault(repo_key, row)
            if repo_name:
                reference.setdefault(repo_name, row)
        return reference

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
        self._execute(
            """
            insert into github_person_events (id, tracked_person_id, repo_owner, repo_name, event_type, title, detail, score_impact, occurred_at, created_at, source_url)
            values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(uuid4()),
                tracked_person_id,
                repo_owner,
                repo_name,
                event_type,
                title,
                _json_dump(detail),
                score_impact,
                (occurred_at or utc_now()).isoformat(),
                _now_iso(),
                source_url,
            ),
        )

    def get_latest_headline_signal(self, candidate_id: str) -> dict[str, Any] | None:
        return self._fetchone(
            """
            select * from linkedin_signals
            where candidate_id = ? and signal_type = 'headline_change'
            order by detected_at desc
            limit 1
            """,
            (candidate_id,),
        )

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
        self._execute(
            """
            insert into linkedin_signals (id, candidate_id, signal_type, old_value, new_value, vc_id, interaction_type, detected_at)
            values (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (str(uuid4()), candidate_id, signal_type, old_value, new_value, vc_id, interaction_type, (detected_at or utc_now()).isoformat()),
        )

    def get_recent_linkedin_signals(self, candidate_id: str, since: datetime) -> list[dict[str, Any]]:
        return self._fetchall(
            """
            select * from linkedin_signals
            where candidate_id = ? and detected_at >= ?
            order by detected_at desc
            """,
            (candidate_id, since.isoformat()),
        )

    def get_new_vc_follows_since(self, candidate_id: str, since: date) -> list[dict[str, Any]]:
        rows = self._fetchall(
            """
            select f.vc_id, f.first_seen_at, v.name as vc_name, v.tier
            from twitter_vc_follows f
            join vcs v on v.id = f.vc_id
            where f.candidate_id = ? and f.first_seen_at >= ?
            order by f.first_seen_at asc
            """,
            (candidate_id, since.isoformat()),
        )
        return rows

    def get_score(self, candidate_id: str, score_date: date) -> dict[str, Any] | None:
        row = self._fetchone("select * from scores where candidate_id = ? and score_date = ? limit 1", (candidate_id, score_date.isoformat()))
        if row:
            row["breakdown"] = _json_load(row.get("breakdown"), {})
        return row

    def get_github_snapshots_for_date(self, candidate_id: str, score_day: date) -> list[dict[str, Any]]:
        tracked_person_ids = self._resolve_candidate_to_tracked_person_ids(candidate_id)
        if not tracked_person_ids:
            return []
        placeholders = ",".join("?" for _ in tracked_person_ids)
        rows = self._fetchall(
            f"""
            select * from github_repo_snapshots
            where tracked_person_id in ({placeholders}) and snapshot_date = ?
            order by stars desc
            """,
            tuple(tracked_person_ids + [score_day.isoformat()]),
        )
        return rows

    def get_github_viral_repo_reference_snapshot_map(self, before_or_on: date) -> dict[str, dict[str, Any]]:
        rows = self._fetchall(
            "select * from github_viral_repo_snapshots where snapshot_date <= ? order by snapshot_date desc",
            (before_or_on.isoformat(),),
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
        return bool(
            self._fetchone(
                "select id from github_viral_repo_snapshots where repo_owner = ? and repo_name = ? limit 1",
                (repo_owner, repo_name),
            )
        )

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
        existing = self._fetchone(
            "select * from github_viral_repo_snapshots where repo_owner = ? and repo_name = ? and snapshot_date = ? limit 1",
            (repo_owner, repo_name, snapshot_date.isoformat()),
        )
        row_id = existing["id"] if existing else str(uuid4())
        created_at = existing.get("created_at") if existing else _now_iso()
        self._execute(
            """
            insert into github_viral_repo_snapshots (id, repo_owner, repo_name, repo_description, repo_url, owner_display_name, owner_avatar_url, owner_profile_url, language, stars, forks, watchers, open_issues, star_delta_7d, star_delta_30d, pushed_at, snapshot_date, created_at)
            values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            on conflict(id) do update set
              repo_description = excluded.repo_description,
              repo_url = excluded.repo_url,
              owner_display_name = excluded.owner_display_name,
              owner_avatar_url = excluded.owner_avatar_url,
              owner_profile_url = excluded.owner_profile_url,
              language = excluded.language,
              stars = excluded.stars,
              forks = excluded.forks,
              watchers = excluded.watchers,
              open_issues = excluded.open_issues,
              star_delta_7d = excluded.star_delta_7d,
              star_delta_30d = excluded.star_delta_30d,
              pushed_at = excluded.pushed_at
            """,
            (
                row_id,
                repo_owner,
                repo_name,
                repo_description,
                repo_url,
                owner_display_name,
                owner_avatar_url,
                owner_profile_url,
                language,
                stars,
                forks,
                watchers,
                open_issues,
                star_delta_7d,
                star_delta_30d,
                pushed_at,
                snapshot_date.isoformat(),
                created_at,
            ),
        )

    def has_github_viral_repo_event(self, *, repo_owner: str, repo_name: str, event_type: str, event_date: date) -> bool:
        start_iso, end_iso = day_bounds(event_date)
        return bool(
            self._fetchone(
                """
                select id from github_viral_repo_events
                where repo_owner = ? and repo_name = ? and event_type = ? and detected_at >= ? and detected_at <= ?
                limit 1
                """,
                (repo_owner, repo_name, event_type, start_iso, end_iso),
            )
        )

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
        self._execute(
            """
            insert into github_viral_repo_events (id, repo_owner, repo_name, repo_description, repo_url, owner_display_name, owner_avatar_url, owner_profile_url, language, event_type, title, detail, stars, forks, watchers, open_issues, star_delta_7d, star_delta_30d, detected_at, created_at)
            values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(uuid4()),
                repo_owner,
                repo_name,
                repo_description,
                repo_url,
                owner_display_name,
                owner_avatar_url,
                owner_profile_url,
                language,
                event_type,
                title,
                _json_dump(detail),
                stars,
                forks,
                watchers,
                open_issues,
                star_delta_7d,
                star_delta_30d,
                (detected_at or utc_now()).isoformat(),
                _now_iso(),
            ),
        )

    def list_scores_for_date(self, score_date: date) -> list[dict[str, Any]]:
        rows = self._fetchall("select * from scores where score_date = ? order by score_total desc", (score_date.isoformat(),))
        for row in rows:
            row["breakdown"] = _json_load(row.get("breakdown"), {})
        return rows

    def clear_activity_tables(self) -> None:
        for table in ["news_feed", "linkedin_signals", "github_person_events", "github_viral_repo_events", "alerts", "scores"]:
            self._execute(f"delete from {table}")

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
        existing = self._fetchone("select * from scores where candidate_id = ? and score_date = ? limit 1", (candidate_id, score_date.isoformat()))
        row_id = existing["id"] if existing else str(uuid4())
        created_at = existing.get("created_at") if existing else _now_iso()
        self._execute(
            """
            insert into scores (id, candidate_id, score_date, score_total, score_github, score_twitter, score_linkedin, breakdown, created_at)
            values (?, ?, ?, ?, ?, ?, ?, ?, ?)
            on conflict(id) do update set
              score_total = excluded.score_total,
              score_github = excluded.score_github,
              score_twitter = excluded.score_twitter,
              score_linkedin = excluded.score_linkedin,
              breakdown = excluded.breakdown
            """,
            (row_id, candidate_id, score_date.isoformat(), score_total, score_github, score_twitter, score_linkedin, _json_dump(breakdown), created_at),
        )

    def recent_alert_exists(self, candidate_id: str, since: datetime) -> bool:
        return bool(
            self._fetchone(
                "select id from alerts where candidate_id = ? and sent_at >= ? limit 1",
                (candidate_id, since.isoformat()),
            )
        )

    def insert_alert(
        self,
        candidate_id: str,
        *,
        score_total: int,
        trigger_reason: str,
        channel: str = "email",
        sent_at: datetime | None = None,
    ) -> None:
        self._execute(
            "insert into alerts (id, candidate_id, score_total, trigger_reason, sent_at, channel) values (?, ?, ?, ?, ?, ?)",
            (str(uuid4()), candidate_id, score_total, trigger_reason, (sent_at or utc_now()).isoformat(), channel),
        )

    def news_event_exists(self, candidate_id: str, event_type: str, title: str, day: date) -> bool:
        start, end = day_bounds(day)
        return bool(
            self._fetchone(
                "select id from news_feed where candidate_id = ? and event_type = ? and title = ? and created_at >= ? and created_at <= ? limit 1",
                (candidate_id, event_type, title, start, end),
            )
        )

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
        self._execute(
            "insert into news_feed (id, candidate_id, event_type, title, detail, score_impact, created_at) values (?, ?, ?, ?, ?, ?, ?)",
            (str(uuid4()), candidate_id, event_type, title, _json_dump(detail), score_impact, (created_at or utc_now()).isoformat()),
        )

    def list_recent_news(self, candidate_id: str, since: datetime) -> list[dict[str, Any]]:
        rows = self._fetchall(
            "select * from news_feed where candidate_id = ? and created_at >= ? order by created_at desc",
            (candidate_id, since.isoformat()),
        )
        for row in rows:
            row["detail"] = _json_load(row.get("detail"), {})
        return rows

    def get_vc_by_linkedin_url(self, linkedin_url: str) -> dict[str, Any] | None:
        normalized = normalize_linkedin_url(linkedin_url)
        if not normalized:
            return None
        return self._fetchone("select * from vcs where linkedin_url = ? limit 1", (normalized,))

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

    def list_candidates_scored_at_least(self, minimum_score: int, score_day: date) -> list[dict[str, Any]]:
        return self._fetchall(
            """
            select c.*
            from candidates c
            join scores s on s.candidate_id = c.id
            where s.score_date = ? and s.score_total >= ?
            order by s.score_total desc, c.name asc
            """,
            (score_day.isoformat(), minimum_score),
        )
