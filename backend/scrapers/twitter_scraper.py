from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path

from backend.config import Settings, get_settings, validate_settings
from backend.db import SupabaseDB, normalize_handle, utc_now
from scrape_following import scrape_following

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class TwitterRunResult:
    vc_name: str
    baseline_run: bool
    new_snapshot_count: int
    matched_candidate_count: int
    stopped_early: bool
    output_file: str


class TwitterFollowingScraper:
    def __init__(self, db: SupabaseDB | None = None, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        validate_settings(self.settings, "supabase", "twitter")
        self.db = db or SupabaseDB.from_settings(self.settings)

    def _output_path_for_vc(self, vc: dict[str, str]) -> str:
        slug = normalize_handle(vc.get("twitter_handle")) or vc["id"]
        return str(Path("backend") / "outputs" / f"following_{slug}.csv")

    def process_vc(self, vc: dict) -> TwitterRunResult:
        vc_id = vc["id"]
        twitter_handle = normalize_handle(vc.get("twitter_handle"))
        if not twitter_handle:
            raise RuntimeError(f"VC '{vc['name']}' has no twitter_handle")

        cursor_row = self.db.get_twitter_cursor(vc_id)
        snapshot_count = self.db.count_twitter_snapshots(vc_id)
        last_known_handle = normalize_handle(cursor_row["last_known_handle"]) if cursor_row else None
        baseline_run = last_known_handle is None and snapshot_count == 0
        baseline_first_seen_at = date.today() - timedelta(days=8)
        output_file = self._output_path_for_vc(vc)

        logger.info("Scraping following list for VC %s (@%s), baseline=%s", vc["name"], twitter_handle, baseline_run)
        rows = scrape_following(
            username=self.settings.twitter_username,
            password=self.settings.twitter_password,
            verification=self.settings.twitter_verification or None,
            target_account=twitter_handle,
            output_file=output_file,
            max_scrolls=self.settings.twitter_max_scrolls,
        )

        new_handles: list[str] = []
        stopped_early = False
        page_one_first_handle = normalize_handle(rows[0]["username"]) if rows else None

        for row in rows:
            handle = normalize_handle(row.get("username"))
            if not handle:
                continue

            if last_known_handle and handle == last_known_handle:
                stopped_early = True
                break

            if not baseline_run and self.db.twitter_snapshot_exists(vc_id, handle):
                stopped_early = True
                break

            self.db.upsert_twitter_snapshot(vc_id, handle, date.today())
            new_handles.append(handle)

        if page_one_first_handle:
            self.db.upsert_twitter_cursor(vc_id, page_one_first_handle, utc_now())

        candidates_by_handle = self.db.get_candidate_map_by_twitter_handle()
        matched_candidate_count = 0
        for handle in new_handles:
            candidate = candidates_by_handle.get(handle)
            if not candidate:
                continue
            matched_candidate_count += 1
            self.db.upsert_twitter_vc_follow(
                candidate["id"],
                vc_id,
                first_seen_at=baseline_first_seen_at if baseline_run else date.today(),
                last_seen_at=date.today(),
            )

        return TwitterRunResult(
            vc_name=vc["name"],
            baseline_run=baseline_run,
            new_snapshot_count=len(new_handles),
            matched_candidate_count=matched_candidate_count,
            stopped_early=stopped_early,
            output_file=output_file,
        )

    def run_all(self) -> list[TwitterRunResult]:
        results: list[TwitterRunResult] = []
        for vc in self.db.list_vcs():
            twitter_handle = normalize_handle(vc.get("twitter_handle"))
            if not twitter_handle:
                logger.info("Skipping VC %s because twitter_handle is empty.", vc["name"])
                continue
            try:
                results.append(self.process_vc(vc))
            except Exception:
                logger.exception("Twitter scrape failed for VC %s", vc["name"])
        return results
