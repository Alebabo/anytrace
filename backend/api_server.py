from __future__ import annotations

import json
import logging
import os
import re
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


def _twitter_state_payload() -> dict[str, Any]:
    from backend.config import get_settings
    from backend.db import SupabaseDB
    from backend.twitter_state import create_twitter_state_store

    settings = get_settings()
    db = SupabaseDB.from_settings(settings)
    state_store = create_twitter_state_store(settings, db)
    snapshots = state_store.list_twitter_snapshots()

    return {
        "ok": True,
        "backend": settings.twitter_state_backend,
        "snapshot_count": len(snapshots),
        "snapshots": snapshots,
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

    db = SupabaseDB.from_settings()
    vc = db.upsert_vc(
        name=name,
        twitter_handle=twitter_handle,
        linkedin_url=linkedin_url,
        tier=int(tier) if str(tier or "").strip() else 2,
    )

    return {
        "ok": True,
        "vc": vc,
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
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
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
        if route is None or path not in {"/health", "/twitter-state"}:
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
        body: dict[str, Any] = {}
        if content_length > 0:
            raw_body = self.rfile.read(content_length)
            if raw_body:
                body = json.loads(raw_body.decode("utf-8"))

        if path == "/watchlist/add-observed-github":
            try:
                payload = _add_observed_github_person_payload(body)
            except Exception as exc:  # pragma: no cover - defensive for local ops
                logger.exception("API route failed for %s", path)
                self._write_json({"ok": False, "error": str(exc)}, 500)
                return
            self._write_json(payload, 200)
            return

        if path == "/watchlist/add-vc":
            try:
                payload = _add_vc_payload(body)
            except Exception as exc:  # pragma: no cover - defensive for local ops
                logger.exception("API route failed for %s", path)
                self._write_json({"ok": False, "error": str(exc)}, 500)
                return
            self._write_json(payload, 200)
            return

        if path == "/watchlist/add-tracked-person":
            try:
                payload = _add_tracked_person_payload(body)
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
