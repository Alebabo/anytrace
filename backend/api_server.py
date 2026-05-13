from __future__ import annotations

import json
import logging
import os
import re
import hmac
from dataclasses import asdict, is_dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Callable
from urllib.parse import parse_qs, quote, urlsplit

import requests

logger = logging.getLogger(__name__)
_AVATAR_CACHE: dict[str, str] = {}


def _to_jsonable(value: Any) -> Any:
    if is_dataclass(value):
        return asdict(value)
    if isinstance(value, list):
        return [_to_jsonable(item) for item in value]
    if isinstance(value, dict):
        return {key: _to_jsonable(item) for key, item in value.items()}
    return value


def _clean_x_image_url(value: str) -> str:
    return value.replace("\\u002F", "/").replace("\\/", "/").replace("\\u0026", "&")


def _resolve_x_avatar(handle: str) -> str | None:
    normalized = handle.strip().lstrip("@")
    if not normalized:
        return None

    cache_key = f"x:{normalized.lower()}"
    cached = _AVATAR_CACHE.get(cache_key)
    if cached:
        return cached

    response = requests.get(
        f"https://x.com/{quote(normalized)}",
        headers={"User-Agent": "Mozilla/5.0"},
        timeout=20,
    )
    response.raise_for_status()

    match = re.search(r'profile_image_url_https":"([^"]+)"', response.text)
    if not match:
        return None

    image_url = _clean_x_image_url(match.group(1)).replace("_normal", "_400x400")
    _AVATAR_CACHE[cache_key] = image_url
    return image_url


def _resolve_linkedin_avatar(profile_url: str) -> str | None:
    normalized = profile_url.strip()
    if not normalized:
        return None

    cache_key = f"linkedin:{normalized.lower()}"
    cached = _AVATAR_CACHE.get(cache_key)
    if cached:
        return cached

    response = requests.get(
        normalized,
        headers={"User-Agent": "Mozilla/5.0"},
        timeout=20,
    )
    response.raise_for_status()

    match = re.search(r'<meta property="og:image" content="([^"]+)"', response.text)
    if not match:
        return None

    image_url = match.group(1).strip()
    if "static.licdn.com" in image_url:
        return None

    _AVATAR_CACHE[cache_key] = image_url
    return image_url


def _resolve_github_avatar(username: str) -> str | None:
    normalized = username.strip().lstrip("@")
    if not normalized:
        return None
    return f"https://github.com/{quote(normalized)}.png?size=400"


def _resolve_avatar_proxy(query: dict[str, list[str]]) -> str | None:
    platform = (query.get("platform", [""])[0] or "").strip().lower()
    handle = (query.get("handle", [""])[0] or "").strip()
    profile_url = (query.get("profile_url", [""])[0] or "").strip()

    if platform == "x":
        return _resolve_x_avatar(handle)
    if platform == "linkedin":
        return _resolve_linkedin_avatar(profile_url)
    if platform == "github":
        return _resolve_github_avatar(handle)
    return None


def _slugify(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", value.strip().lower())
    return normalized.strip("-") or "entry"


def _tier_label(value: Any) -> str:
    normalized = str(value or "").strip().lower()
    if normalized in {"journalist", "media", "press", "reporter"}:
        return "journalist"
    if normalized in {"angel", "microvc", "vc"}:
        return normalized
    try:
        numeric = int(value)
    except (TypeError, ValueError):
        numeric = 2
    if numeric == 4:
        return "journalist"
    if numeric == 3:
        return "angel"
    if numeric == 2:
        return "microvc"
    return "vc"


def _source_title(account_type: Any, tier: Any) -> str:
    normalized_account_type = str(account_type or "").strip().lower()
    if normalized_account_type == "journalist" or _tier_label(tier) == "journalist":
        return "Journalist"
    return "Investor"


def _load_json_field(value: Any, fallback: Any) -> Any:
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return fallback
    if value is None:
        return fallback
    return value


def _body_bool(body: dict[str, Any], key: str, default: bool) -> bool:
    value = body.get(key, default)
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() not in {"0", "false", "no", "off"}
    return bool(value)


def _frontend_data_payload() -> dict[str, Any]:
    from datetime import date, datetime, timedelta, timezone

    from backend.db import SupabaseDB, normalize_handle

    utc = timezone.utc
    db = SupabaseDB.from_settings()
    alert_threshold = db.get_seed_follow_alert_threshold()
    try:
        backfill_stats = db.backfill_seed_follow_alerts_from_snapshots()
        if backfill_stats.get("observationsCreated") or backfill_stats.get("alertsCreated"):
            logger.info("Backfilled seed-follow alert history: %s", backfill_stats)
    except Exception:
        logger.exception("Failed to backfill seed-follow alert history from stored snapshots")
    today = date.today()
    recent_cutoff = (datetime.now(tz=utc) - timedelta(days=30)).isoformat()

    vcs = db.list_vcs()
    candidates = db.list_candidates(active_only=True)
    tracked_people = db.list_tracked_git_people(active_only=True)
    person_identities = db.list_person_identities()
    scores = db.list_scores_for_date(today)
    score_by_candidate_id = {row["candidate_id"]: row for row in scores}
    linkedin_enrichment_by_person_id = db.list_latest_linkedin_enrichments_by_person()

    candidate_by_github = {
        normalize_handle(candidate.get("github_username")): candidate
        for candidate in candidates
        if normalize_handle(candidate.get("github_username"))
    }
    candidate_by_twitter = {
        normalize_handle(candidate.get("twitter_handle")): candidate
        for candidate in candidates
        if normalize_handle(candidate.get("twitter_handle"))
    }
    candidate_by_linkedin = {
        (candidate.get("linkedin_url") or "").strip().lower(): candidate
        for candidate in candidates
        if (candidate.get("linkedin_url") or "").strip()
    }
    candidate_by_name = {(candidate.get("name") or "").strip().lower(): candidate for candidate in candidates}

    tracked_to_candidate_id: dict[str, str] = {}
    for tracked in tracked_people:
        candidate = None
        github_handle = normalize_handle(tracked.get("github_username"))
        twitter_handle = normalize_handle(tracked.get("twitter_handle"))
        linkedin_url = (tracked.get("linkedin_url") or "").strip().lower()
        name_key = (tracked.get("name") or "").strip().lower()

        if github_handle:
            candidate = candidate_by_github.get(github_handle)
        if candidate is None and twitter_handle:
            candidate = candidate_by_twitter.get(twitter_handle)
        if candidate is None and linkedin_url:
            candidate = candidate_by_linkedin.get(linkedin_url)
        if candidate is None and name_key:
            candidate = candidate_by_name.get(name_key)
        if candidate is not None:
            tracked_to_candidate_id[tracked["id"]] = candidate["id"]

    graph_people_by_id: dict[str, dict[str, Any]] = {}
    identities_by_key: dict[tuple[str, str, str], dict[str, Any]] = {}
    github_profiles_by_person_id: dict[str, dict[str, Any]] = {}
    activity_events: list[dict[str, Any]] = []
    graph_edges_by_key: dict[tuple[str, str], dict[str, Any]] = {}
    synthetic_vcs_by_id: dict[str, dict[str, Any]] = {}

    def ensure_person(
        *,
        person_id: str,
        full_name: str,
        role_title: str | None,
        company: str | None,
        location: str | None,
        summary: str | None,
        avatar_url: str | None = None,
        is_watchlist: bool = True,
    ) -> dict[str, Any]:
        person = graph_people_by_id.get(person_id)
        if person is not None:
            if not person.get("summary") and summary:
                person["summary"] = summary
            if not person.get("company") and company:
                person["company"] = company
            if not person.get("location") and location:
                person["location"] = location
            if not person.get("avatarUrl") and avatar_url:
                person["avatarUrl"] = avatar_url
            return person

        person = {
            "id": person_id,
            "slug": _slugify(full_name),
            "fullName": full_name,
            "roleTitle": (role_title or "").strip() or "Tracked builder",
            "company": (company or "").strip(),
            "location": (location or "").strip(),
            "summary": (summary or "").strip() or "Captured from the local backend pipeline.",
            "avatarUrl": avatar_url,
            "topPickNote": "",
            "isWatchlist": bool(is_watchlist),
        }
        graph_people_by_id[person_id] = person
        return person

    def add_identity(person_id: str, platform: str, handle: str | None, profile_url: str | None, *, is_primary: bool) -> None:
        normalized_handle = (handle or "").strip()
        normalized_profile_url = (profile_url or "").strip()
        if not normalized_handle or not normalized_profile_url:
            return
        key = (person_id, platform, normalized_handle.lower())
        if key in identities_by_key:
            return
        identities_by_key[key] = {
            "id": f"{person_id}-{platform}-{normalized_handle.lower()}",
            "personId": person_id,
            "platform": platform,
            "handle": normalized_handle.lstrip("@"),
            "profileUrl": normalized_profile_url,
            "isPrimary": bool(is_primary),
        }

    def ensure_edge(
        *,
        vc_id: str,
        person_id: str,
        platform: str,
        observed_at: str | None,
        graph_source: str,
        is_top_pick: bool = False,
        follower_count: int | None = None,
    ) -> None:
        key = (vc_id, person_id)
        edge = graph_edges_by_key.get(key)
        if edge is None:
            graph_edges_by_key[key] = {
                "id": f"edge-{vc_id}-{person_id}",
                "sourceId": vc_id,
                "targetId": person_id,
                "platform": platform,
                "eventCount": 1,
                "isTopPick": bool(is_top_pick),
                "graphSource": graph_source,
                "firstObservedAt": observed_at,
                "isRecent": bool(observed_at and observed_at >= recent_cutoff),
                "followerCount": follower_count,
            }
            return
        edge["eventCount"] += 1
        edge["isTopPick"] = bool(edge["isTopPick"] or is_top_pick)
        if observed_at and (not edge.get("firstObservedAt") or observed_at < edge["firstObservedAt"]):
            edge["firstObservedAt"] = observed_at
        if follower_count is not None:
            edge["followerCount"] = max(int(edge.get("followerCount") or 0), follower_count)
        if observed_at and observed_at >= recent_cutoff:
            edge["isRecent"] = True

    def ensure_synthetic_vc(vc_id: str, *, name: str, platform: str) -> None:
        if vc_id in synthetic_vcs_by_id:
            return
        synthetic_vcs_by_id[vc_id] = {
            "id": vc_id,
            "slug": _slugify(name),
            "name": name,
            "title": "Signal source",
            "firm": name,
            "sizeLabel": "Local",
            "sectorFocus": f"{platform.title()}-derived discovery feed",
            "tier": "vc",
            "region": "",
            "country": "",
            "city": "",
            "xHandle": None,
            "twitterUrl": None,
            "xUserId": None,
            "linkedinUrl": None,
            "githubUsername": None,
            "websiteUrl": None,
            "clusterId": None,
            "clusterName": name,
            "accountType": "other",
            "isPrimaryClusterAccount": True,
            "notes": f"Synthetic {platform} source node generated from local backend events.",
            "isSeeded": False,
            "createdByUserId": "local-backend",
            "syncStatus": "idle",
            "lastXSyncAt": None,
            "lastGithubSyncAt": None,
            "lastSyncError": None,
        }

    for candidate in candidates:
        person_id = candidate["id"]
        ensure_person(
            person_id=person_id,
            full_name=(candidate.get("name") or "Tracked person").strip(),
            role_title=candidate.get("role_title"),
            company=candidate.get("company"),
            location=candidate.get("location"),
            summary=candidate.get("summary") or candidate.get("bio"),
            is_watchlist=True,
        )
        github_handle = normalize_handle(candidate.get("github_username"))
        twitter_handle = normalize_handle(candidate.get("twitter_handle"))
        linkedin_url = (candidate.get("linkedin_url") or "").strip()
        add_identity(person_id, "github", github_handle, f"https://github.com/{github_handle}" if github_handle else None, is_primary=True)
        add_identity(person_id, "x", twitter_handle, f"https://x.com/{twitter_handle}" if twitter_handle else None, is_primary=not bool(github_handle))
        add_identity(person_id, "linkedin", linkedin_url, linkedin_url or None, is_primary=not bool(github_handle or twitter_handle))

    for tracked in tracked_people:
        person_id = tracked_to_candidate_id.get(tracked["id"], f"tracked-{tracked['id']}")
        ensure_person(
            person_id=person_id,
            full_name=(tracked.get("name") or "Tracked person").strip(),
            role_title=tracked.get("role_title"),
            company=tracked.get("company"),
            location=tracked.get("location"),
            summary=tracked.get("summary"),
            is_watchlist=True,
        )
        github_handle = normalize_handle(tracked.get("github_username"))
        twitter_handle = normalize_handle(tracked.get("twitter_handle"))
        linkedin_url = (tracked.get("linkedin_url") or "").strip()
        add_identity(person_id, "github", github_handle, f"https://github.com/{github_handle}" if github_handle else None, is_primary=True)
        add_identity(person_id, "x", twitter_handle, f"https://x.com/{twitter_handle}" if twitter_handle else None, is_primary=not bool(github_handle))
        add_identity(person_id, "linkedin", linkedin_url, linkedin_url or None, is_primary=not bool(github_handle or twitter_handle))

    for identity in person_identities:
        tracked_person_id = identity.get("tracked_person_id")
        if not tracked_person_id:
            continue
        person_id = tracked_to_candidate_id.get(tracked_person_id, f"tracked-{tracked_person_id}")
        add_identity(
            person_id,
            str(identity.get("platform") or "").strip(),
            identity.get("handle"),
            identity.get("profile_url"),
            is_primary=bool(identity.get("is_primary")),
        )

    tracked_snapshots = db._fetchall(
        """
        select s.*
        from github_repo_snapshots s
        join (
          select tracked_person_id, max(snapshot_date) as snapshot_date
          from github_repo_snapshots
          group by tracked_person_id
        ) latest
          on latest.tracked_person_id = s.tracked_person_id
         and latest.snapshot_date = s.snapshot_date
        order by s.stars desc, s.star_delta_7d desc
        """
    )
    tracked_event_counts = {
        row["tracked_person_id"]: int(row["event_count"] or 0)
        for row in db._fetchall(
            """
            select tracked_person_id, count(*) as event_count
            from github_person_events
            where occurred_at >= ?
            group by tracked_person_id
            """,
            (recent_cutoff,),
        )
    }
    for snapshot in tracked_snapshots:
        tracked_person_id = snapshot["tracked_person_id"]
        person_id = tracked_to_candidate_id.get(tracked_person_id, f"tracked-{tracked_person_id}")
        existing = github_profiles_by_person_id.get(person_id)
        current_score = int(snapshot.get("stars") or 0) + int(snapshot.get("star_delta_7d") or 0) * 3
        existing_score = 0
        if existing is not None:
            existing_score = int(existing.get("stars") or 0) + int(existing.get("starDelta7d") or 0) * 3
        if existing is not None and existing_score >= current_score:
            continue
        github_profiles_by_person_id[person_id] = {
            "personId": person_id,
            "primaryRepoLabel": f"{snapshot.get('repo_owner') or ''}/{snapshot.get('repo_name') or ''}".strip("/"),
            "stars": int(snapshot.get("stars") or 0),
            "forks": int(snapshot.get("forks") or 0),
            "watchers": int(snapshot.get("watchers") or 0),
            "openIssues": int(snapshot.get("open_issues") or 0),
            "starDelta7d": int(snapshot.get("star_delta_7d") or 0),
            "starDelta30d": int(snapshot.get("star_delta_30d") or 0),
            "snapshotDate": snapshot.get("snapshot_date"),
            "weeklyEventCount": tracked_event_counts.get(tracked_person_id, 0),
            "recentGithubEvents": tracked_event_counts.get(tracked_person_id, 0),
            "githubAttentionScore": int(snapshot.get("star_delta_7d") or 0) + tracked_event_counts.get(tracked_person_id, 0) * 4,
        }

    twitter_follow_rows = db._fetchall(
        """
        select id, candidate_id, vc_id, first_seen_at, last_seen_at
        from twitter_vc_follows
        order by first_seen_at desc
        """
    )
    for row in twitter_follow_rows:
        candidate_id = row["candidate_id"]
        person = graph_people_by_id.get(candidate_id)
        if person is None:
            continue
        vc = next((entry for entry in vcs if entry["id"] == row["vc_id"]), None)
        vc_name = vc["name"] if vc else "Tracked VC"
        activity_events.append(
            {
                "id": f"vc-follow-{row['id']}",
                "personId": candidate_id,
                "vcSourceId": row["vc_id"],
                "platform": "x",
                "eventType": "vc_follow",
                "headline": f"{vc_name} followed {person['fullName']} on X",
                "description": f"Fresh X follow signal from {vc_name}.",
                "sourceUrl": next(
                    (identity["profileUrl"] for identity in identities_by_key.values() if identity["personId"] == candidate_id and identity["platform"] == "x"),
                    "",
                ),
                "occurredAt": row["first_seen_at"],
                "metadata": {
                    "vcId": row["vc_id"],
                    "vcName": vc_name,
                    "targetLabel": person["fullName"],
                },
                "eventFingerprint": row["id"],
            }
        )
        ensure_edge(
            vc_id=row["vc_id"],
            person_id=candidate_id,
            platform="x",
            observed_at=row["first_seen_at"],
            graph_source="snapshot",
            follower_count=1,
        )

    news_rows = db._fetchall("select * from news_feed where created_at >= ? order by created_at desc", (recent_cutoff,))
    for row in news_rows:
        person_id = row["candidate_id"]
        person = graph_people_by_id.get(person_id)
        if person is None:
            continue
        detail = _load_json_field(row.get("detail"), {})
        event_type = str(row.get("event_type") or "").strip()
        mapped_event_type = "repo_traction" if event_type == "repo_spike" else ("linkedin_interaction" if event_type in {"headline_change", "vc_interaction"} else event_type)
        platform = "x" if event_type == "vc_follow" else ("linkedin" if event_type in {"headline_change", "vc_interaction"} else "github")
        activity_events.append(
            {
                "id": f"news-{row['id']}",
                "personId": person_id,
                "vcSourceId": detail.get("vc_id"),
                "platform": platform,
                "eventType": mapped_event_type,
                "headline": row.get("title") or "Signal detected",
                "description": row.get("title") or "Signal detected",
                "sourceUrl": str(detail.get("repo_url") or detail.get("profile_url") or ""),
                "occurredAt": row.get("created_at"),
                "metadata": detail if isinstance(detail, dict) else {},
                "eventFingerprint": row["id"],
            }
        )

    github_person_event_rows = db._fetchall(
        "select * from github_person_events where occurred_at >= ? order by occurred_at desc",
        (recent_cutoff,),
    )
    for row in github_person_event_rows:
        person_id = tracked_to_candidate_id.get(row["tracked_person_id"], f"tracked-{row['tracked_person_id']}")
        person = graph_people_by_id.get(person_id)
        if person is None:
            continue
        detail = _load_json_field(row.get("detail"), {})
        activity_events.append(
            {
                "id": f"github-person-{row['id']}",
                "personId": person_id,
                "vcSourceId": None,
                "platform": "github",
                "eventType": row.get("event_type") or "repo_traction",
                "headline": row.get("title") or "GitHub signal detected",
                "description": row.get("title") or "GitHub signal detected",
                "sourceUrl": row.get("source_url") or "",
                "occurredAt": row.get("occurred_at"),
                "metadata": detail if isinstance(detail, dict) else {},
                "eventFingerprint": row["id"],
            }
        )

    linkedin_rows = db._fetchall(
        "select * from linkedin_signals where detected_at >= ? order by detected_at desc",
        (recent_cutoff,),
    )
    for row in linkedin_rows:
        person_id = row["candidate_id"]
        person = graph_people_by_id.get(person_id)
        if person is None:
            continue
        signal_type = str(row.get("signal_type") or "").strip()
        headline = (
            f"LinkedIn headline change detected for {person['fullName']}"
            if signal_type == "headline_change"
            else f"LinkedIn interaction detected for {person['fullName']}"
        )
        metadata = {
            "oldValue": row.get("old_value"),
            "newValue": row.get("new_value"),
            "vcId": row.get("vc_id"),
            "interactionType": row.get("interaction_type"),
            "targetLabel": person["fullName"],
        }
        activity_events.append(
            {
                "id": f"linkedin-{row['id']}",
                "personId": person_id,
                "vcSourceId": row.get("vc_id"),
                "platform": "linkedin",
                "eventType": "linkedin_interaction",
                "headline": headline,
                "description": headline,
                "sourceUrl": next(
                    (identity["profileUrl"] for identity in identities_by_key.values() if identity["personId"] == person_id and identity["platform"] == "linkedin"),
                    "",
                ),
                "occurredAt": row.get("detected_at"),
                "metadata": metadata,
                "eventFingerprint": row["id"],
            }
        )

    viral_rows = db._fetchall(
        """
        select *
        from github_viral_repo_events
        where detected_at >= ?
        order by detected_at desc
        """,
        (recent_cutoff,),
    )
    latest_viral_snapshot_by_owner: dict[str, dict[str, Any]] = {}
    for row in db._fetchall(
        """
        select s.*
        from github_viral_repo_snapshots s
        join (
          select repo_owner, repo_name, max(snapshot_date) as snapshot_date
          from github_viral_repo_snapshots
          group by repo_owner, repo_name
        ) latest
          on latest.repo_owner = s.repo_owner
         and latest.repo_name = s.repo_name
         and latest.snapshot_date = s.snapshot_date
        order by s.star_delta_7d desc, s.stars desc
        """
    ):
        owner = normalize_handle(row.get("repo_owner")) or ""
        existing = latest_viral_snapshot_by_owner.get(owner)
        current_score = int(row.get("star_delta_7d") or 0) * 3 + int(row.get("stars") or 0)
        existing_score = -1
        if existing is not None:
            existing_score = int(existing.get("star_delta_7d") or 0) * 3 + int(existing.get("stars") or 0)
        if current_score > existing_score:
            latest_viral_snapshot_by_owner[owner] = row

    for row in viral_rows:
        detail = _load_json_field(row.get("detail"), {})
        owner_handle = normalize_handle(row.get("repo_owner"))
        owner_name = (row.get("owner_display_name") or row.get("repo_owner") or "GitHub owner").strip()
        candidate = candidate_by_github.get(owner_handle) if owner_handle else None
        person_id = candidate["id"] if candidate is not None else f"viral-owner-{owner_handle or _slugify(owner_name)}"
        ensure_person(
            person_id=person_id,
            full_name=owner_name,
            role_title="GitHub repo owner",
            company=None,
            location=None,
            summary=row.get("repo_description") or "Detected through a viral GitHub repository.",
            avatar_url=row.get("owner_avatar_url"),
            is_watchlist=False,
        )
        if owner_handle:
            add_identity(person_id, "github", owner_handle, row.get("owner_profile_url") or f"https://github.com/{owner_handle}", is_primary=True)
        twitter_handle = normalize_handle(detail.get("twitterHandle")) if isinstance(detail, dict) else None
        if twitter_handle:
            add_identity(person_id, "x", twitter_handle, f"https://x.com/{twitter_handle}", is_primary=not bool(owner_handle))

        activity_events.append(
            {
                "id": f"viral-{row['id']}",
                "personId": person_id,
                "vcSourceId": None,
                "platform": "github",
                "eventType": "viral_repo",
                "headline": row.get("title") or f"{row.get('repo_owner')}/{row.get('repo_name')} is trending",
                "description": row.get("repo_description") or row.get("title") or "Viral GitHub repository detected.",
                "sourceUrl": row.get("repo_url") or row.get("owner_profile_url") or "",
                "occurredAt": row.get("detected_at"),
                "metadata": detail if isinstance(detail, dict) else {},
                "eventFingerprint": row["id"],
            }
        )

        important_vc_ids = detail.get("importantXFollowerIds") if isinstance(detail, dict) else []
        important_vc_count = int(detail.get("importantXFollowerCount") or 0) if isinstance(detail, dict) else 0
        if isinstance(important_vc_ids, list):
            for vc_id in important_vc_ids:
                if not isinstance(vc_id, str) or not vc_id:
                    continue
                ensure_edge(
                    vc_id=vc_id,
                    person_id=person_id,
                    platform="x",
                    observed_at=row.get("detected_at"),
                    graph_source="event",
                    follower_count=important_vc_count or 1,
                )

    for owner_handle, snapshot in latest_viral_snapshot_by_owner.items():
        candidate = candidate_by_github.get(owner_handle) if owner_handle else None
        person_id = candidate["id"] if candidate is not None else f"viral-owner-{owner_handle}"
        existing = github_profiles_by_person_id.get(person_id)
        event_count = sum(1 for event in activity_events if event["personId"] == person_id and event["platform"] == "github")
        candidate_profile = {
            "personId": person_id,
            "primaryRepoLabel": f"{snapshot.get('repo_owner') or ''}/{snapshot.get('repo_name') or ''}".strip("/"),
            "stars": int(snapshot.get("stars") or 0),
            "forks": int(snapshot.get("forks") or 0),
            "watchers": int(snapshot.get("watchers") or 0),
            "openIssues": int(snapshot.get("open_issues") or 0),
            "starDelta7d": int(snapshot.get("star_delta_7d") or 0),
            "starDelta30d": int(snapshot.get("star_delta_30d") or 0),
            "snapshotDate": snapshot.get("snapshot_date"),
            "weeklyEventCount": event_count,
            "recentGithubEvents": event_count,
            "githubAttentionScore": int(snapshot.get("star_delta_7d") or 0) + event_count * 4,
        }
        if existing is None or int(candidate_profile["githubAttentionScore"]) >= int(existing.get("githubAttentionScore") or 0):
            github_profiles_by_person_id[person_id] = candidate_profile

    weekly_picks: list[dict[str, Any]] = []
    for rank, score in enumerate(sorted(scores, key=lambda row: int(row.get("score_total") or 0), reverse=True), start=1):
        person = graph_people_by_id.get(score["candidate_id"])
        if person is None:
            continue
        breakdown = score.get("breakdown") or {}
        if isinstance(breakdown, str):
            breakdown = _load_json_field(breakdown, {})
        reasons: list[dict[str, Any]] = []
        if int(((breakdown.get("twitter") or {}).get("new_vc_follow_count") or 0)) > 0:
            reasons.append(
                {
                    "id": f"{score['candidate_id']}-twitter-burst",
                    "reasonKind": "vc_follow_burst",
                    "title": "VC follow burst",
                    "detail": f"{(breakdown.get('twitter') or {}).get('new_vc_follow_count', 0)} recent VC follow signals on X.",
                    "metricValue": (breakdown.get("twitter") or {}).get("new_vc_follow_count"),
                    "displayOrder": len(reasons),
                    "sourceEventId": None,
                }
            )
        if int(((breakdown.get("github") or {}).get("score") or 0)) > 0:
            reasons.append(
                {
                    "id": f"{score['candidate_id']}-github-traction",
                    "reasonKind": "repo_traction",
                    "title": "GitHub traction",
                    "detail": "Repository momentum contributes to this score.",
                    "metricValue": (breakdown.get("github") or {}).get("score"),
                    "displayOrder": len(reasons),
                    "sourceEventId": None,
                }
            )
        if int(((breakdown.get("linkedin") or {}).get("score") or 0)) > 0:
            reasons.append(
                {
                    "id": f"{score['candidate_id']}-linkedin",
                    "reasonKind": "important_github_followers",
                    "title": "LinkedIn confirmation",
                    "detail": "LinkedIn corroboration lifted this profile.",
                    "metricValue": (breakdown.get("linkedin") or {}).get("score"),
                    "displayOrder": len(reasons),
                    "sourceEventId": None,
                }
            )

        weekly_picks.append(
            {
                "id": f"weekly-pick-{score['candidate_id']}-{score['score_date']}",
                "weekStart": score["score_date"],
                "rank": rank,
                "score": int(score.get("score_total") or 0),
                "primaryReason": reasons[0]["title"] if reasons else "Emerging signal",
                "summary": f"{person['fullName']} accumulated a score of {int(score.get('score_total') or 0)} in the latest local run.",
                "vcFollowCount": int(((breakdown.get("twitter") or {}).get("new_vc_follow_count") or 0)),
                "githubAttentionScore": int(((breakdown.get("github") or {}).get("score") or 0)),
                "bigTechExit": bool(((breakdown.get("linkedin") or {}).get("headline_change") or False)),
                "person": person,
                "reasons": reasons,
                "githubProfile": github_profiles_by_person_id.get(score["candidate_id"]),
            }
        )

    frontend_vcs = [
        {
            "id": vc["id"],
            "slug": _slugify(vc.get("name") or "vc"),
            "name": vc.get("name") or "VC",
            "title": _source_title(vc.get("account_type"), vc.get("tier")),
            "firm": vc.get("cluster_name") or vc.get("name") or "VC",
            "sizeLabel": "Local",
            "sectorFocus": "",
            "tier": _tier_label(vc.get("tier")),
            "region": "",
            "country": "",
            "city": "",
            "xHandle": vc.get("twitter_handle"),
            "twitterUrl": f"https://x.com/{vc['twitter_handle']}" if vc.get("twitter_handle") else None,
            "xUserId": None,
            "linkedinUrl": vc.get("linkedin_url"),
            "githubUsername": None,
            "websiteUrl": None,
            "clusterId": None,
            "clusterName": vc.get("cluster_name") or vc.get("name"),
            "accountType": vc.get("account_type") or "firm",
            "isPrimaryClusterAccount": bool(vc.get("is_primary_cluster_account")),
            "notes": "",
            "isSeeded": True,
            "createdByUserId": None,
            "syncStatus": "idle",
            "lastXSyncAt": None,
            "lastGithubSyncAt": None,
            "lastSyncError": None,
        }
        for vc in vcs
    ]
    seed_follow_alerts: list[dict[str, Any]] = []
    for alert in db.list_seed_follow_alerts():
        person_id = alert["discovered_person_id"]
        linkedin_enrichment = linkedin_enrichment_by_person_id.get(person_id) or {}
        x_handle = normalize_handle(alert.get("x_handle"))
        display_name = (alert.get("display_name") or (f"@{x_handle}" if x_handle else "Discovered person")).strip()
        follower_count = int(alert.get("current_seed_follower_count") or 0)
        primary_profile_url = alert.get("primary_profile_url") or (f"https://x.com/{x_handle}" if x_handle else "")
        linkedin_url = alert.get("linkedin_url") or linkedin_enrichment.get("linkedin_url")
        linkedin_headline = linkedin_enrichment.get("headline")
        linkedin_role_title = linkedin_enrichment.get("role_title")
        linkedin_company = linkedin_enrichment.get("company")
        linkedin_location = linkedin_enrichment.get("location")
        seed_followers = alert.get("seed_followers") or []
        triggering_seed_accounts = alert.get("triggering_seed_accounts") or []
        trigger_threshold = int(alert.get("trigger_threshold") or alert_threshold)

        ensure_person(
            person_id=person_id,
            full_name=display_name,
            role_title=linkedin_role_title or "New X profile",
            company=linkedin_company,
            location=linkedin_location,
            summary=linkedin_headline or f"Reached {follower_count} tracked seed-source follows on X.",
            is_watchlist=False,
        )
        add_identity(person_id, "x", x_handle, primary_profile_url, is_primary=True)
        add_identity(person_id, "linkedin", linkedin_url, linkedin_url, is_primary=False)

        for follower in seed_followers:
            vc_id = follower.get("id")
            if not isinstance(vc_id, str) or not vc_id:
                continue
            ensure_edge(
                vc_id=vc_id,
                person_id=person_id,
                platform="x",
                observed_at=follower.get("firstSeenAt"),
                graph_source="snapshot",
                is_top_pick=True,
                follower_count=follower_count,
            )

        activity_events.append(
            {
                "id": f"seed-alert-{alert['id']}",
                "personId": person_id,
                "vcSourceId": triggering_seed_accounts[0].get("id") if triggering_seed_accounts else None,
                "platform": "x",
                "eventType": "vc_follow",
                "headline": f"{display_name} reached {follower_count} tracked seed-source follows",
                "description": f"New person crossed the {trigger_threshold}-seed-account alert threshold.",
                "sourceUrl": primary_profile_url,
                "occurredAt": alert.get("triggered_at"),
                "metadata": {
                    "targetLabel": display_name,
                    "xHandle": x_handle,
                    "triggeringSeedAccounts": triggering_seed_accounts,
                    "currentSeedFollowerCount": follower_count,
                    "triggerThreshold": trigger_threshold,
                },
                "eventFingerprint": alert["id"],
            }
        )
        if linkedin_enrichment:
            activity_events.append(
                {
                    "id": f"linkedin-enrichment-{linkedin_enrichment['id']}",
                    "personId": person_id,
                    "vcSourceId": None,
                    "platform": "linkedin",
                    "eventType": "linkedin_interaction",
                    "headline": f"LinkedIn context added for {display_name}",
                    "description": linkedin_headline
                    or "Make returned LinkedIn enrichment for this alert-qualified person.",
                    "sourceUrl": linkedin_url or primary_profile_url,
                    "occurredAt": linkedin_enrichment.get("observed_at"),
                    "metadata": {
                        "targetLabel": display_name,
                        "xHandle": x_handle,
                        "linkedinUrl": linkedin_url,
                        "headline": linkedin_headline,
                        "roleTitle": linkedin_role_title,
                        "company": linkedin_company,
                        "location": linkedin_location,
                    },
                    "eventFingerprint": linkedin_enrichment["id"],
                }
            )

        seed_follow_alerts.append(
            {
                "id": alert["id"],
                "personId": person_id,
                "displayName": display_name,
                "xHandle": x_handle,
                "primaryProfileUrl": primary_profile_url,
                "githubUrl": alert.get("github_url"),
                "linkedinUrl": linkedin_url,
                "linkedinHeadline": linkedin_headline,
                "linkedinRoleTitle": linkedin_role_title,
                "linkedinCompany": linkedin_company,
                "linkedinLocation": linkedin_location,
                "linkedinEnrichedAt": linkedin_enrichment.get("observed_at"),
                "triggeredAt": alert.get("triggered_at"),
                "alertThreshold": trigger_threshold,
                "triggeringSeedAccounts": triggering_seed_accounts,
                "seedFollowers": seed_followers,
                "currentSeedFollowerCount": follower_count,
                "status": alert.get("status") or "new",
                "promotedVcId": alert.get("promoted_vc_id"),
                "promotedAt": alert.get("promoted_at"),
            }
        )

    deduped_events: list[dict[str, Any]] = []
    seen_event_ids: set[str] = set()
    for event in sorted(activity_events, key=lambda row: row.get("occurredAt") or "", reverse=True):
        if event["id"] in seen_event_ids:
            continue
        seen_event_ids.add(event["id"])
        deduped_events.append(event)

    people_with_edges = {edge["targetId"] for edge in graph_edges_by_key.values()}
    github_event_counts_by_person: dict[str, int] = {}
    linkedin_event_counts_by_person: dict[str, int] = {}
    x_event_counts_by_person: dict[str, int] = {}

    for event in deduped_events:
        person_id = event["personId"]
        if event["platform"] == "github":
            github_event_counts_by_person[person_id] = github_event_counts_by_person.get(person_id, 0) + 1
        elif event["platform"] == "linkedin":
            linkedin_event_counts_by_person[person_id] = linkedin_event_counts_by_person.get(person_id, 0) + 1
        elif event["platform"] == "x":
            x_event_counts_by_person[person_id] = x_event_counts_by_person.get(person_id, 0) + 1

    for person_id, count in github_event_counts_by_person.items():
        if person_id in people_with_edges or count <= 0:
            continue
        ensure_synthetic_vc("signal-github-radar", name="GitHub Radar", platform="github")
        latest_event = next((event for event in deduped_events if event["personId"] == person_id and event["platform"] == "github"), None)
        ensure_edge(
            vc_id="signal-github-radar",
            person_id=person_id,
            platform="github",
            observed_at=latest_event["occurredAt"] if latest_event else None,
            graph_source="event",
            follower_count=count,
        )

    for person_id, count in linkedin_event_counts_by_person.items():
        if person_id in people_with_edges or count <= 0:
            continue
        ensure_synthetic_vc("signal-linkedin-monitor", name="LinkedIn Monitor", platform="linkedin")
        latest_event = next((event for event in deduped_events if event["personId"] == person_id and event["platform"] == "linkedin"), None)
        ensure_edge(
            vc_id="signal-linkedin-monitor",
            person_id=person_id,
            platform="linkedin",
            observed_at=latest_event["occurredAt"] if latest_event else None,
            graph_source="event",
            follower_count=count,
        )

    for person_id, count in x_event_counts_by_person.items():
        if person_id in people_with_edges or count <= 0:
            continue
        ensure_synthetic_vc("signal-x-discovery", name="X Discovery", platform="x")
        latest_event = next((event for event in deduped_events if event["personId"] == person_id and event["platform"] == "x"), None)
        ensure_edge(
            vc_id="signal-x-discovery",
            person_id=person_id,
            platform="x",
            observed_at=latest_event["occurredAt"] if latest_event else None,
            graph_source="event",
            follower_count=count,
        )

    graph_edges = sorted(
        graph_edges_by_key.values(),
        key=lambda edge: edge.get("firstObservedAt") or "",
        reverse=True,
    )
    graph_source = "snapshot" if graph_edges else ("event" if deduped_events else "empty")

    return {
        "ok": True,
        "vcSources": frontend_vcs + list(synthetic_vcs_by_id.values()),
        "trackedPeople": sorted(graph_people_by_id.values(), key=lambda row: row["fullName"].lower()),
        "personIdentities": list(identities_by_key.values()),
        "activityEvents": deduped_events,
        "weeklyPicks": weekly_picks,
        "seedFollowAlerts": seed_follow_alerts,
        "githubSignalProfiles": list(github_profiles_by_person_id.values()),
        "graphEdges": graph_edges,
        "graphSource": graph_source,
        "appSettings": {
            "seedFollowAlertThreshold": alert_threshold,
        },
    }


def _twitter_payload() -> dict[str, Any]:
    from backend.main import run_twitter

    results = run_twitter()
    return {
        "ok": True,
        "count": len(results),
        "results": _to_jsonable(results),
    }


def _github_payload() -> dict[str, Any]:
    from backend.main import run_github

    summary = run_github()
    return {
        "ok": True,
        "count": len(summary.tracked_results) + len(summary.viral_results),
        "scanned_people": len(summary.tracked_results),
        "scanned_repos": sum(result.repo_count for result in summary.tracked_results),
        "viral_repo_count": len(summary.viral_results),
        "results": [
            {
                "person_name": result.candidate_name,
                "repo": result.top_repo,
                "status": "ok",
                "star_delta_7d": result.max_star_delta_7d,
            }
            for result in summary.tracked_results
        ]
        + [
            {
                "person_name": result.owner_name,
                "repo": f"{result.repo_owner}/{result.repo_name}",
                "status": result.event_type,
                "stars": result.stars,
                "star_delta_7d": result.star_delta_7d,
                "x_handle": result.x_handle,
                "important_x_follower_count": result.important_x_follower_count,
            }
            for result in summary.viral_results
        ],
    }


def _identity_payload() -> dict[str, Any]:
    from backend.main import run_identity_match

    results = run_identity_match()
    return {
        "ok": True,
        "count": len(results),
        "results": _to_jsonable(results),
    }


def _pipeline_payload() -> dict[str, Any]:
    from backend.main import run_pipeline

    run_pipeline()
    return {
        "ok": True,
        "status": "completed",
    }


def _run_linkedin_make_payload(body: dict[str, Any]) -> dict[str, Any]:
    from backend.config import get_settings
    from backend.db import SupabaseDB
    from backend.linkedin_make import trigger_linkedin_make

    settings = get_settings()
    db = SupabaseDB.from_settings(settings)
    limit_value = body.get("limit")
    limit = int(limit_value) if str(limit_value or "").strip() else None
    return trigger_linkedin_make(
        settings=settings,
        db=db,
        limit=limit,
        missing_only=_body_bool(body, "missingOnly", True),
    )


def _ingest_linkedin_make_payload(body: Any, provided_secret: str | None) -> dict[str, Any]:
    from backend.config import get_settings
    from backend.db import SupabaseDB
    from backend.linkedin_make import ingest_linkedin_make_payload

    settings = get_settings()
    expected_secret = settings.make_linkedin_webhook_secret
    if expected_secret and not (provided_secret and hmac.compare_digest(expected_secret, provided_secret)):
        raise PermissionError("Invalid Make webhook secret.")

    db = SupabaseDB.from_settings(settings)
    return ingest_linkedin_make_payload(db=db, payload=body)


def _update_app_settings_payload(body: dict[str, Any]) -> dict[str, Any]:
    from backend.config import get_settings
    from backend.db import SupabaseDB

    settings = get_settings()
    db = SupabaseDB.from_settings(settings)
    threshold_value = body.get("seedFollowAlertThreshold")
    if threshold_value is None:
        threshold_value = body.get("threshold")
    if threshold_value is None:
        raise RuntimeError("seedFollowAlertThreshold is required")

    threshold = db.set_seed_follow_alert_threshold(threshold_value)
    backfill_stats = db.ensure_seed_follow_alerts_for_threshold(threshold)
    return {
        "ok": True,
        "appSettings": {
            "seedFollowAlertThreshold": threshold,
        },
        "backfillStats": backfill_stats,
    }


def _twitter_state_payload() -> dict[str, Any]:
    from backend.config import get_settings
    from backend.db import SupabaseDB
    from backend.twitter_state import create_twitter_state_store

    settings = get_settings()
    db = SupabaseDB.from_settings(settings)
    state_store = create_twitter_state_store(settings, db)
    snapshots = state_store.list_twitter_snapshots()
    tracked_person_snapshots = db.list_tracked_person_twitter_snapshots()

    return {
        "ok": True,
        "backend": settings.twitter_state_backend,
        "snapshot_count": len(snapshots),
        "snapshots": snapshots,
        "tracked_person_snapshot_count": len(tracked_person_snapshots),
        "tracked_person_snapshots": tracked_person_snapshots,
    }


def _reset_activities_payload() -> dict[str, Any]:
    from backend.config import get_settings
    from backend.db import SupabaseDB

    settings = get_settings()
    db = SupabaseDB.from_settings(settings)

    db.clear_activity_tables()

    return {
        "ok": True,
        "message": "Activities were reset. Existing follow data was preserved.",
        "twitter_backend": settings.twitter_state_backend,
    }


def _add_observed_github_person_payload(body: dict[str, Any]) -> dict[str, Any]:
    from backend.db import SupabaseDB

    observed_person_id = str(body.get("observedPersonId") or "").strip()
    if not observed_person_id:
        raise RuntimeError("observedPersonId is required")

    db = SupabaseDB.from_settings()
    observed = db.get_github_observed_person(observed_person_id)
    if not observed:
        raise RuntimeError("Observed GitHub person not found")

    tracked_person = db.insert_tracked_git_person_from_observed(observed)
    github_username = tracked_person.get("github_username")
    twitter_handle = tracked_person.get("twitter_handle")

    if github_username:
        db.upsert_person_identity(
            tracked_person_id=tracked_person["id"],
            candidate_id=None,
            platform="github",
            handle=github_username,
            profile_url=observed.get("profile_url") or f"https://github.com/{github_username}",
            is_primary=True,
            match_confidence=1.0,
            match_source="observed_github_network",
        )
    if twitter_handle:
        db.upsert_person_identity(
            tracked_person_id=tracked_person["id"],
            candidate_id=None,
            platform="x",
            handle=twitter_handle,
            profile_url=f"https://x.com/{twitter_handle}",
            is_primary=not bool(github_username),
            match_confidence=0.92,
            match_source="observed_github_network",
        )

    db.mark_observed_person_added_to_watchlist(observed_person_id)

    return {
        "ok": True,
        "tracked_person_id": tracked_person["id"],
        "github_username": tracked_person.get("github_username"),
        "name": tracked_person.get("name"),
    }


def _add_vc_payload(body: dict[str, Any]) -> dict[str, Any]:
    from backend.db import SupabaseDB

    name = str(body.get("name") or "").strip()
    twitter_handle = str(body.get("xHandle") or body.get("twitterHandle") or "").strip() or None
    linkedin_url = str(body.get("linkedinUrl") or "").strip() or None
    tier = body.get("tier")
    cluster_id = str(body.get("clusterId") or "").strip() or None
    cluster_name = str(body.get("clusterName") or "").strip() or None
    account_type = str(body.get("accountType") or "firm").strip() or "firm"
    is_primary_cluster_account = body.get("isPrimaryClusterAccount")

    db = SupabaseDB.from_settings()
    vc = db.upsert_vc(
        name=name,
        twitter_handle=twitter_handle,
        linkedin_url=linkedin_url,
        tier=tier if str(tier or "").strip() else "microvc",
        cluster_id=cluster_id,
        cluster_name=cluster_name,
        account_type=account_type,
        is_primary_cluster_account=bool(is_primary_cluster_account)
        if is_primary_cluster_account is not None
        else not bool(cluster_id),
    )

    return {
        "ok": True,
        "vc": vc,
    }


def _promote_seed_follow_alert_payload(body: dict[str, Any]) -> dict[str, Any]:
    from backend.db import SupabaseDB

    alert_id = str(body.get("alertId") or "").strip()
    name = str(body.get("name") or "").strip()
    x_handle = str(body.get("xHandle") or body.get("twitterHandle") or "").strip() or None
    linkedin_url = str(body.get("linkedinUrl") or "").strip() or None
    cluster_name = str(body.get("clusterName") or body.get("linkedinCompany") or name).strip() or None
    account_type = str(body.get("accountType") or "partner").strip() or "partner"
    tier = body.get("tier") or "microvc"

    db = SupabaseDB.from_settings()
    result = db.promote_seed_follow_alert_to_vc(
        alert_id=alert_id,
        name=name,
        x_handle=x_handle,
        linkedin_url=linkedin_url,
        cluster_name=cluster_name,
        account_type=account_type,
        tier=tier,
    )

    return {
        "ok": True,
        "vc": result["vc"],
        "alert": result["alert"],
    }


def _update_seed_follow_alert_status_payload(body: dict[str, Any]) -> dict[str, Any]:
    from backend.db import SupabaseDB

    alert_id = str(body.get("alertId") or "").strip()
    status = str(body.get("status") or "").strip()
    db = SupabaseDB.from_settings()
    alert = db.update_seed_follow_alert_status(alert_id=alert_id, status=status)

    return {
        "ok": True,
        "alert": alert,
    }


def _add_tracked_person_payload(body: dict[str, Any]) -> dict[str, Any]:
    from backend.db import SupabaseDB

    full_name = str(body.get("fullName") or "").strip()
    github_handle = str(body.get("githubHandle") or "").strip() or None
    x_handle = str(body.get("xHandle") or "").strip() or None
    linkedin_url = str(body.get("linkedinUrl") or "").strip() or None
    role_title = str(body.get("roleTitle") or "").strip() or None
    company = str(body.get("company") or "").strip() or None
    location = str(body.get("location") or "").strip() or None
    summary = str(body.get("summary") or "").strip() or None

    db = SupabaseDB.from_settings()
    tracked_person = db.upsert_tracked_git_person(
        name=full_name,
        github_username=github_handle,
        twitter_handle=x_handle,
        linkedin_url=linkedin_url,
        role_title=role_title,
        company=company,
        location=location,
        summary=summary,
    )

    if github_handle:
        db.upsert_person_identity(
            tracked_person_id=tracked_person["id"],
            candidate_id=None,
            platform="github",
            handle=github_handle,
            profile_url=f"https://github.com/{github_handle.lstrip('@')}",
            is_primary=True,
            match_confidence=1.0,
            match_source="manual_watchlist_add",
        )

    if x_handle:
        db.upsert_person_identity(
            tracked_person_id=tracked_person["id"],
            candidate_id=None,
            platform="x",
            handle=x_handle,
            profile_url=f"https://x.com/{x_handle.lstrip('@')}",
            is_primary=not bool(github_handle),
            match_confidence=1.0,
            match_source="manual_watchlist_add",
        )

    if linkedin_url:
        db.upsert_person_identity(
            tracked_person_id=tracked_person["id"],
            candidate_id=None,
            platform="linkedin",
            handle=linkedin_url,
            profile_url=linkedin_url,
            is_primary=not bool(github_handle or x_handle),
            match_confidence=1.0,
            match_source="manual_watchlist_add",
        )

    return {
        "ok": True,
        "tracked_person": tracked_person,
    }


class AnytraceApiHandler(BaseHTTPRequestHandler):
    routes: dict[str, Callable[[], dict[str, Any]]] = {
        "/health": lambda: {"ok": True, "service": "anytrace-api"},
        "/frontend-data": _frontend_data_payload,
        "/run-twitter": _twitter_payload,
        "/run-github": _github_payload,
        "/twitter-state": _twitter_state_payload,
        "/reset-activities": _reset_activities_payload,
        "/run-identity-match": _identity_payload,
        "/run-pipeline": _pipeline_payload,
    }

    def _set_headers(self, status_code: int = 200) -> None:
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Anytrace-Secret, X-Make-Secret")
        self.end_headers()

    def _write_json(self, payload: dict[str, Any], status_code: int = 200) -> None:
        self._set_headers(status_code)
        self.wfile.write(json.dumps(payload, ensure_ascii=True).encode("utf-8"))

    def _redirect(self, location: str, status_code: int = 302) -> None:
        self.send_response(status_code)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "public, max-age=3600")
        self.send_header("Location", location)
        self.end_headers()

    def do_OPTIONS(self) -> None:  # noqa: N802
        self._set_headers(204)

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlsplit(self.path)
        path = parsed.path
        if path == "/avatar-proxy":
            try:
                avatar_url = _resolve_avatar_proxy(parse_qs(parsed.query))
            except Exception as exc:  # pragma: no cover - defensive for local ops
                logger.exception("Avatar proxy failed for %s", self.path)
                self._write_json({"ok": False, "error": str(exc)}, 500)
                return

            if not avatar_url:
                self._write_json({"ok": False, "error": "Avatar not found"}, 404)
                return

            self._redirect(avatar_url)
            return

        route = self.routes.get(path)
        if route is None or path not in {"/health", "/twitter-state", "/frontend-data"}:
            self._write_json({"ok": False, "error": "Not found"}, 404)
            return
        try:
            payload = route()
        except Exception as exc:  # pragma: no cover - defensive for local ops
            logger.exception("API route failed for %s", path)
            self._write_json({"ok": False, "error": str(exc)}, 500)
            return
        self._write_json(payload)

    def do_POST(self) -> None:  # noqa: N802
        path = urlsplit(self.path).path
        route = self.routes.get(path)
        content_length = int(self.headers.get("Content-Length", "0") or 0)
        body: Any = {}
        if content_length > 0:
            raw_body = self.rfile.read(content_length)
            if raw_body:
                body = json.loads(raw_body.decode("utf-8"))
        body_dict = body if isinstance(body, dict) else {}

        if path == "/run-linkedin-make":
            try:
                payload = _run_linkedin_make_payload(body_dict)
            except Exception as exc:  # pragma: no cover - defensive for local ops
                logger.exception("API route failed for %s", path)
                self._write_json({"ok": False, "error": str(exc)}, 500)
                return
            self._write_json(payload, 200)
            return

        if path in {"/linkedin-make/ingest", "/ingest-linkedin-make"}:
            provided_secret = (
                self.headers.get("X-Anytrace-Secret")
                or self.headers.get("X-Make-Secret")
                or str(body_dict.get("secret") or "").strip()
                or None
            )
            try:
                payload = _ingest_linkedin_make_payload(body, provided_secret)
            except PermissionError as exc:
                self._write_json({"ok": False, "error": str(exc)}, 401)
                return
            except Exception as exc:  # pragma: no cover - defensive for local ops
                logger.exception("API route failed for %s", path)
                self._write_json({"ok": False, "error": str(exc)}, 500)
                return
            self._write_json(payload, 200)
            return

        if path == "/settings":
            try:
                payload = _update_app_settings_payload(body_dict)
            except Exception as exc:  # pragma: no cover - defensive for local ops
                logger.exception("API route failed for %s", path)
                self._write_json({"ok": False, "error": str(exc)}, 500)
                return
            self._write_json(payload, 200)
            return

        if path == "/seed-follow-alerts/promote-to-seed":
            try:
                payload = _promote_seed_follow_alert_payload(body_dict)
            except Exception as exc:  # pragma: no cover - defensive for local ops
                logger.exception("API route failed for %s", path)
                self._write_json({"ok": False, "error": str(exc)}, 500)
                return
            self._write_json(payload, 200)
            return

        if path == "/seed-follow-alerts/status":
            try:
                payload = _update_seed_follow_alert_status_payload(body_dict)
            except Exception as exc:  # pragma: no cover - defensive for local ops
                logger.exception("API route failed for %s", path)
                self._write_json({"ok": False, "error": str(exc)}, 500)
                return
            self._write_json(payload, 200)
            return

        if path == "/watchlist/add-observed-github":
            try:
                payload = _add_observed_github_person_payload(body_dict)
            except Exception as exc:  # pragma: no cover - defensive for local ops
                logger.exception("API route failed for %s", path)
                self._write_json({"ok": False, "error": str(exc)}, 500)
                return
            self._write_json(payload, 200)
            return

        if path == "/watchlist/add-vc":
            try:
                payload = _add_vc_payload(body_dict)
            except Exception as exc:  # pragma: no cover - defensive for local ops
                logger.exception("API route failed for %s", path)
                self._write_json({"ok": False, "error": str(exc)}, 500)
                return
            self._write_json(payload, 200)
            return

        if path == "/watchlist/add-tracked-person":
            try:
                payload = _add_tracked_person_payload(body_dict)
            except Exception as exc:  # pragma: no cover - defensive for local ops
                logger.exception("API route failed for %s", path)
                self._write_json({"ok": False, "error": str(exc)}, 500)
                return
            self._write_json(payload, 200)
            return

        if route is None:
            self._write_json({"ok": False, "error": "Not found"}, 404)
            return

        try:
            payload = route()
        except Exception as exc:  # pragma: no cover - defensive for local ops
            logger.exception("API route failed for %s", path)
            self._write_json({"ok": False, "error": str(exc)}, 500)
            return

        self._write_json(payload, 200)

    def log_message(self, format: str, *args: Any) -> None:
        logger.info("%s - %s", self.address_string(), format % args)


def serve_api() -> None:
    host = os.getenv("ANYTRACE_API_HOST", "127.0.0.1")
    port = int(os.getenv("ANYTRACE_API_PORT", "8766"))
    server = ThreadingHTTPServer((host, port), AnytraceApiHandler)
    logger.info("Anytrace API listening on http://%s:%s", host, port)
    server.serve_forever()
