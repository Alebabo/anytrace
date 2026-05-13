from __future__ import annotations

import csv
import time
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import requests

from backend.config import Settings
from backend.db import SupabaseDB, normalize_handle


@dataclass(slots=True)
class TweetApiFetchResult:
    rows: list[dict[str, str]]
    stopped_early: bool
    output_file: str


class TweetApiError(RuntimeError):
    pass


class TweetApiRateLimitError(TweetApiError):
    pass


class TweetApiPrivateAccountError(TweetApiError):
    pass


class TweetApiFollowingProvider:
    DEFAULT_BASE_URL = "https://api.tweetapi.com/tw-v2"

    def __init__(self, settings: Settings, db: SupabaseDB) -> None:
        if not settings.tweetapi_key:
            raise RuntimeError("Missing required environment variable for TweetAPI: TWEETAPI_KEY")

        self.settings = settings
        self.db = db
        self.session = requests.Session()
        self.session.headers.update({"X-API-Key": settings.tweetapi_key})
        self.base_url = self._normalize_base_url(settings.tweetapi_base_url or self.DEFAULT_BASE_URL)
        self._user_id_cache: dict[str, str] = {}

    def fetch_following(
        self,
        *,
        vc_id: str,
        target_account: str,
        output_file: str,
        last_known_handle: str | None,
        baseline_run: bool,
    ) -> TweetApiFetchResult:
        rows: list[dict[str, str]] = []
        seen_handles: set[str] = set()
        cursor = ""
        stopped_early = False
        user_id = self._lookup_user_id(target_account)
        incremental_min_pages = max(1, self.settings.tweetapi_incremental_min_pages)

        for page_index in range(self.settings.tweetapi_max_pages):
            response = self._request(
                "GET",
                "/user/following-list",
                params={
                    "userId": user_id,
                    "cursor": cursor,
                    "count": self.settings.tweetapi_page_size,
                },
            )
            followings = self._extract_followings(response)
            if not isinstance(followings, list):
                raise RuntimeError("TweetAPI response did not contain a followings list")

            page_found_known_handle = False
            for item in followings:
                handle = self._extract_handle(item)
                if not handle or handle in seen_handles:
                    continue

                seen_handles.add(handle)
                is_known_handle = bool(last_known_handle and handle == last_known_handle)
                rows.append(
                    {
                        "username": handle,
                        "name": str(item.get("name") or item.get("displayName") or ""),
                    }
                )
                if is_known_handle:
                    page_found_known_handle = True
                    continue

            if (
                not baseline_run
                and last_known_handle
                and page_found_known_handle
                and page_index + 1 >= incremental_min_pages
            ):
                stopped_early = True
                break

            if not response.get("has_next_page"):
                break

            cursor = str(response.get("next_cursor") or "")
            if not cursor:
                break

            if page_index < self.settings.tweetapi_max_pages - 1:
                time.sleep(0.15)

        self._write_csv(output_file, rows)
        return TweetApiFetchResult(rows=rows, stopped_early=stopped_early, output_file=output_file)

    def is_following(self, *, source_account: str, target_account: str) -> bool:
        source_handle = normalize_handle(source_account)
        target_handle = normalize_handle(target_account)
        if not source_handle or not target_handle or source_handle == target_handle:
            return False

        cursor = ""
        user_id = self._lookup_user_id(source_handle)

        for page_index in range(self.settings.tweetapi_max_pages):
            response = self._request(
                "GET",
                "/user/following-list",
                params={
                    "userId": user_id,
                    "cursor": cursor,
                    "count": self.settings.tweetapi_page_size,
                },
            )
            followings = self._extract_followings(response)
            if not isinstance(followings, list):
                raise RuntimeError("TweetAPI response did not contain a followings list")

            for item in followings:
                handle = self._extract_handle(item)
                if handle == target_handle:
                    return True

            if not response.get("has_next_page"):
                break

            cursor = str(response.get("next_cursor") or "")
            if not cursor:
                break

            if page_index < self.settings.tweetapi_max_pages - 1:
                time.sleep(0.15)

        return False

    def _request(self, method: str, path: str, *, params: dict[str, str | int]) -> dict:
        last_error: Exception | None = None

        for attempt in range(3):
            response = self.session.request(
                method,
                self._build_url(path),
                params=params,
                timeout=self.settings.twitter_request_timeout_seconds,
            )

            if response.status_code in {429, 500, 502, 503, 504}:
                last_error = TweetApiRateLimitError(f"TweetAPI transient error {response.status_code} for {path}")
                time.sleep(2**attempt)
                continue

            try:
                payload = response.json()
            except ValueError as exc:
                raise RuntimeError(f"TweetAPI returned invalid JSON for {path}") from exc

            if not response.ok:
                detail = payload.get("detail") or payload.get("msg") or response.text
                detail_text = str(detail)
                if response.status_code == 400 and "private" in detail_text.lower():
                    raise TweetApiPrivateAccountError(f"TweetAPI request failed ({response.status_code}): {detail_text}")
                if response.status_code == 429:
                    raise TweetApiRateLimitError(f"TweetAPI request failed ({response.status_code}): {detail_text}")
                raise TweetApiError(f"TweetAPI request failed ({response.status_code}): {detail_text}")

            if payload.get("status") == "error":
                raise TweetApiError(f"TweetAPI semantic error: {payload.get('msg') or 'unknown error'}")

            return payload

        raise TweetApiRateLimitError(f"TweetAPI request failed after retries: {last_error}") from last_error

    @staticmethod
    def _normalize_base_url(base_url: str) -> str:
        split = urlsplit(base_url.strip())
        path = split.path.rstrip("/")
        if path.endswith("/tw-v2/tw-v2"):
            path = path[: -len("/tw-v2")]
        elif not path.endswith("/tw-v2"):
            path = f"{path}/tw-v2" if path else "/tw-v2"
        return urlunsplit((split.scheme, split.netloc, path, split.query, split.fragment))

    def _build_url(self, path: str) -> str:
        clean_path = path if path.startswith("/") else f"/{path}"
        return f"{self.base_url}{clean_path}"

    def _lookup_user_id(self, user_name: str) -> str:
        normalized_user_name = normalize_handle(user_name)
        if not normalized_user_name:
            raise TweetApiError("TweetAPI user lookup requires a valid username")

        cached_user_id = self._user_id_cache.get(normalized_user_name)
        if cached_user_id is not None:
            return cached_user_id

        response = self._request(
            "GET",
            "/user/by-username",
            params={"username": normalized_user_name},
        )
        user = response.get("data") or response.get("user") or response
        user_id = (
            user.get("id")
            or user.get("rest_id")
            or user.get("userId")
            or user.get("user_id")
        )
        if not user_id:
            raise TweetApiError(f"TweetAPI could not resolve user id for @{normalized_user_name}")
        resolved_user_id = str(user_id)
        self._user_id_cache[normalized_user_name] = resolved_user_id
        return resolved_user_id

    @staticmethod
    def _extract_handle(item: dict) -> str | None:
        return normalize_handle(
            item.get("userName")
            or item.get("screen_name")
            or item.get("screenName")
            or item.get("username")
            or item.get("user_name")
            or item.get("handle")
        )

    @staticmethod
    def _extract_followings(payload: dict) -> list[dict]:
        for key in ("followings", "users", "data"):
            value = payload.get(key)
            if isinstance(value, list):
                return value
        data = payload.get("data")
        if isinstance(data, dict):
            for key in ("followings", "users", "items"):
                value = data.get(key)
                if isinstance(value, list):
                    return value
        return []

    @staticmethod
    def _write_csv(output_file: str, rows: list[dict[str, str]]) -> None:
        path = Path(output_file)
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=["username", "name"])
            writer.writeheader()
            writer.writerows(rows)
