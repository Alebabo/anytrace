from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlsplit

import requests

from backend.config import Settings, get_settings
from backend.db import SupabaseDB, normalize_handle


def _utc_now_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def _text(value: Any) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def _first_text(payload: dict[str, Any], keys: list[str]) -> str | None:
    for key in keys:
        value = _text(payload.get(key))
        if value:
            return value
    return None


def _is_linkedin_url(value: str | None) -> bool:
    if not value:
        return False
    try:
        host = urlsplit(value).netloc.lower()
    except ValueError:
        return False
    return "linkedin.com" in host


def _is_x_url(value: str | None) -> bool:
    if not value:
        return False
    try:
        host = urlsplit(value).netloc.lower()
    except ValueError:
        return False
    return host in {"x.com", "twitter.com", "www.x.com", "www.twitter.com"}


def _handle_from_x_url(value: str | None) -> str | None:
    if not _is_x_url(value):
        return None
    path = urlsplit(value or "").path.strip("/")
    if not path:
        return None
    return normalize_handle(path.split("/")[0])


def _extract_profiles(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if not isinstance(payload, dict):
        return []
    for key in ("profiles", "results", "items", "data"):
        value = payload.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
    for key in ("profile", "person", "result", "item"):
        value = payload.get(key)
        if isinstance(value, dict):
            return [value]
    return [payload]


def _linkedin_url_from_profile(profile: dict[str, Any]) -> str | None:
    for key in (
        "linkedinUrl",
        "linkedInUrl",
        "linkedin_url",
        "profileUrl",
        "profile_url",
        "url",
        "publicProfileUrl",
    ):
        value = _text(profile.get(key))
        if _is_linkedin_url(value):
            return value
    return None


def _x_handle_from_profile(profile: dict[str, Any]) -> str | None:
    direct_handle = _first_text(profile, ["xHandle", "twitterHandle", "handle", "x_handle", "twitter_handle"])
    if direct_handle:
        return normalize_handle(direct_handle)
    for key in ("xProfileUrl", "twitterProfileUrl", "primaryProfileUrl", "sourceUrl"):
        handle = _handle_from_x_url(_text(profile.get(key)))
        if handle:
            return handle
    return None


def _resolve_discovered_person(db: SupabaseDB, profile: dict[str, Any]) -> dict[str, Any] | None:
    person_id = _first_text(profile, ["personId", "discoveredPersonId", "person_id", "discovered_person_id"])
    if person_id:
        person = db.get_discovered_person(person_id)
        if person:
            return person
    x_handle = _x_handle_from_profile(profile)
    if x_handle:
        return db.get_discovered_person_by_x_handle(x_handle)
    return None


def build_linkedin_make_batch(
    *,
    db: SupabaseDB,
    settings: Settings,
    limit: int | None = None,
    missing_only: bool = True,
) -> dict[str, Any]:
    batch_limit = max(1, int(limit or settings.make_linkedin_batch_limit or 25))
    latest_enrichment = db.list_latest_linkedin_enrichments_by_person()
    profiles: list[dict[str, Any]] = []

    for alert in db.list_seed_follow_alerts():
        person_id = alert["discovered_person_id"]
        latest = latest_enrichment.get(person_id) or {}
        known_linkedin_url = alert.get("linkedin_url") or latest.get("linkedin_url")
        if missing_only and known_linkedin_url:
            continue
        seed_followers = alert.get("seed_followers") or []
        triggering_seed_accounts = alert.get("triggering_seed_accounts") or []
        x_handle = normalize_handle(alert.get("x_handle"))
        profiles.append(
            {
                "personId": person_id,
                "alertId": alert["id"],
                "displayName": alert.get("display_name") or (f"@{x_handle}" if x_handle else "Discovered person"),
                "xHandle": x_handle,
                "xProfileUrl": alert.get("primary_profile_url") or (f"https://x.com/{x_handle}" if x_handle else None),
                "knownLinkedInUrl": known_linkedin_url,
                "triggeredAt": alert.get("triggered_at"),
                "currentSeedFollowerCount": alert.get("current_seed_follower_count"),
                "triggeringSeedAccounts": triggering_seed_accounts,
                "seedFollowers": seed_followers,
            }
        )
        if len(profiles) >= batch_limit:
            break

    callback_url = None
    if settings.public_api_base_url:
        callback_url = f"{settings.public_api_base_url}/linkedin-make/ingest"

    return {
        "source": "anytrace",
        "kind": "linkedin_enrichment_request",
        "sentAt": _utc_now_iso(),
        "callbackUrl": callback_url,
        "profiles": profiles,
    }


def trigger_linkedin_make(
    *,
    settings: Settings | None = None,
    db: SupabaseDB | None = None,
    limit: int | None = None,
    missing_only: bool = True,
) -> dict[str, Any]:
    resolved_settings = settings or get_settings()
    resolved_db = db or SupabaseDB.from_settings(resolved_settings)
    if not resolved_settings.make_linkedin_webhook_url:
        raise RuntimeError("MAKE_LINKEDIN_WEBHOOK_URL is not configured.")

    batch = build_linkedin_make_batch(
        db=resolved_db,
        settings=resolved_settings,
        limit=limit,
        missing_only=missing_only,
    )
    profiles = batch["profiles"]
    if not profiles:
        return {
            "ok": True,
            "sent": 0,
            "status": "no_targets",
            "message": "No alert-qualified profiles need LinkedIn enrichment.",
        }

    headers = {"Content-Type": "application/json"}
    if resolved_settings.make_linkedin_webhook_secret:
        headers["X-Anytrace-Secret"] = resolved_settings.make_linkedin_webhook_secret

    response = requests.post(
        resolved_settings.make_linkedin_webhook_url,
        json=batch,
        headers=headers,
        timeout=30,
    )
    try:
        webhook_response: Any = response.json()
    except ValueError:
        webhook_response = response.text[:1000]
    if not response.ok:
        raise RuntimeError(f"Make LinkedIn webhook returned {response.status_code}: {webhook_response}")

    return {
        "ok": True,
        "sent": len(profiles),
        "status": "sent",
        "webhookStatus": response.status_code,
        "webhookResponse": webhook_response,
        "profiles": profiles,
    }


def ingest_linkedin_make_payload(*, db: SupabaseDB, payload: Any) -> dict[str, Any]:
    profiles = _extract_profiles(payload)
    accepted: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []

    for profile in profiles:
        person = _resolve_discovered_person(db, profile)
        if not person:
            skipped.append(
                {
                    "reason": "unknown_person",
                    "personId": _first_text(profile, ["personId", "discoveredPersonId", "person_id"]),
                    "xHandle": _x_handle_from_profile(profile),
                }
            )
            continue

        linkedin_url = _linkedin_url_from_profile(profile)
        event = db.insert_linkedin_enrichment_event(
            discovered_person_id=person["id"],
            linkedin_url=linkedin_url,
            headline=_first_text(profile, ["headline", "linkedInHeadline", "linkedinHeadline", "description"]),
            role_title=_first_text(profile, ["roleTitle", "title", "currentTitle", "jobTitle"]),
            company=_first_text(profile, ["company", "currentCompany", "organization"]),
            location=_first_text(profile, ["location", "geo", "region"]),
            source=_first_text(profile, ["source"]) or "make",
            raw_payload=profile,
            observed_at=_first_text(profile, ["observedAt", "scrapedAt", "updatedAt", "timestamp"]),
        )
        accepted.append(
            {
                "personId": person["id"],
                "xHandle": person.get("x_handle"),
                "linkedinUrl": linkedin_url,
                "eventId": event.get("id"),
            }
        )

    return {
        "ok": True,
        "accepted": len(accepted),
        "skipped": len(skipped),
        "acceptedProfiles": accepted,
        "skippedProfiles": skipped,
    }
