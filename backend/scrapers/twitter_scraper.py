from __future__ import annotations

import logging
import csv
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable

from backend.config import Settings, get_settings, validate_settings
from backend.db import SupabaseDB, normalize_handle, utc_now
from backend.scrapers.tweetapi_provider import TweetApiFetchResult, TweetApiFollowingProvider
from backend.twitter_state import create_twitter_state_store
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
        self._validate_twitter_provider_settings()
        self.db = db or SupabaseDB.from_settings(self.settings)
        self.state_store = create_twitter_state_store(self.settings, self.db)
        logger.info("Twitter state backend: %s", self.settings.twitter_state_backend)

    def _output_path_for_vc(self, vc: dict[str, str]) -> str:
        slug = normalize_handle(vc.get("twitter_handle")) or vc["id"]
        return str(Path("backend") / "outputs" / f"following_{slug}.csv")

    def _output_path_for_tracked_person(self, person: dict[str, str]) -> str:
        slug = normalize_handle(person.get("twitter_handle")) or person["id"]
        return str(Path("backend") / "outputs" / f"following_git_{slug}.csv")

    def _known_sequence_from_output(self, output_file: str) -> list[str]:
        path = Path(output_file)
        if not path.exists():
            return []

        handles: list[str] = []
        seen: set[str] = set()
        try:
            with path.open("r", encoding="utf-8", newline="") as handle:
                for row in csv.DictReader(handle):
                    normalized = normalize_handle(row.get("username"))
                    if not normalized or normalized in seen:
                        continue
                    seen.add(normalized)
                    handles.append(normalized)
        except OSError:
            logger.warning("Could not read previous following order from %s", output_file)
            return []
        return handles

    def _should_run_deep_scan(self, cursor_row: dict | None, baseline_run: bool) -> bool:
        if baseline_run or not cursor_row:
            return False

        interval_hours = max(self.settings.tweetapi_deep_scan_interval_hours, 0)
        if interval_hours == 0:
            return True

        raw_last_run = str(cursor_row.get("last_run_at") or "").strip()
        if not raw_last_run:
            return True

        try:
            last_run_at = datetime.fromisoformat(raw_last_run.replace("Z", "+00:00"))
        except ValueError:
            return True
        if last_run_at.tzinfo is None:
            last_run_at = last_run_at.replace(tzinfo=timezone.utc)

        return utc_now() - last_run_at >= timedelta(hours=interval_hours)

    def process_vc(self, vc: dict) -> TwitterRunResult:
        vc_id = vc["id"]
        twitter_handle = normalize_handle(vc.get("twitter_handle"))
        if not twitter_handle:
            raise RuntimeError(f"Seed source '{vc['name']}' has no twitter_handle")

        cursor_row = self.state_store.get_twitter_cursor(vc_id)
        snapshot_count = self.state_store.count_twitter_snapshots(vc_id)
        last_known_handle = normalize_handle(cursor_row["last_known_handle"]) if cursor_row else None
        baseline_run = last_known_handle is None and snapshot_count == 0
        deep_scan = self._should_run_deep_scan(cursor_row, baseline_run)
        baseline_first_seen_at = date.today() - timedelta(days=8)
        output_file = self._output_path_for_vc(vc)
        known_sequence = [] if baseline_run else self._known_sequence_from_output(output_file)

        logger.info(
            "Scraping following list for seed source %s (@%s), baseline=%s, deep_scan=%s",
            vc["name"],
            twitter_handle,
            baseline_run,
            deep_scan,
        )
        fetch_result = self._fetch_rows_for_vc(
            vc_id=vc_id,
            twitter_handle=twitter_handle,
            output_file=output_file,
            last_known_handle=None if deep_scan else last_known_handle,
            baseline_run=baseline_run,
            known_sequence=known_sequence,
        )
        rows = fetch_result.rows

        new_handles: list[str] = []
        stopped_early = fetch_result.stopped_early
        page_one_first_handle = normalize_handle(rows[0]["username"]) if rows else None
        candidates_by_handle = self.db.get_candidate_map_by_twitter_handle()
        observed_github_by_handle = self.db.get_observed_github_map_by_twitter_handle()
        tracked_handles = self.db.get_tracked_twitter_handles()
        seed_handles = self.db.get_seed_twitter_handles()
        protected_handles = set(tracked_handles)
        total_snapshot_count = self.state_store.count_all_twitter_snapshots()
        snapshot_max_rows = max(self.settings.twitter_snapshot_max_rows, 0)
        unlimited_snapshots = snapshot_max_rows == 0
        snapshot_first_seen_at = baseline_first_seen_at if baseline_run else date.today()
        matched_observed_github_count = 0

        for row in rows:
            handle = normalize_handle(row.get("username"))
            if not handle:
                continue

            candidate = candidates_by_handle.get(handle)
            observed_github_person = observed_github_by_handle.get(handle)
            snapshot_exists = self.state_store.twitter_snapshot_exists(vc_id, handle)
            should_store_snapshot = (
                unlimited_snapshots
                or snapshot_exists
                or candidate is not None
                or observed_github_person is not None
                or total_snapshot_count < snapshot_max_rows
            )
            if should_store_snapshot:
                self.state_store.upsert_twitter_snapshot(vc_id, handle, snapshot_first_seen_at)
                if not snapshot_exists:
                    total_snapshot_count += 1
            if handle not in seed_handles:
                self.db.upsert_seed_follow_observation(
                    seed_vc_id=vc_id,
                    followed_handle=handle,
                    followed_name=row.get("name"),
                    first_seen_at=snapshot_first_seen_at,
                    last_seen_at=date.today(),
                )
            new_handles.append(handle)
            if observed_github_person is not None:
                matched_observed_github_count += 1

        if page_one_first_handle:
            self.state_store.upsert_twitter_cursor(vc_id, page_one_first_handle, utc_now())

        matched_candidate_count = 0
        for handle in new_handles:
            candidate = candidates_by_handle.get(handle)
            if not candidate:
                continue
            matched_candidate_count += 1
            self.state_store.upsert_twitter_vc_follow(
                candidate["id"],
                vc_id,
                first_seen_at=baseline_first_seen_at if baseline_run else date.today(),
                last_seen_at=date.today(),
            )

        if matched_observed_github_count > 0:
            logger.info(
                "Captured %s X follows that map to observed GitHub people for seed source %s",
                matched_observed_github_count,
                vc["name"],
            )

        if not unlimited_snapshots:
            deleted_snapshot_count = self.state_store.prune_twitter_snapshots(
                max_rows=snapshot_max_rows,
                protected_handles=protected_handles,
            )
            if deleted_snapshot_count > 0:
                logger.info(
                    "Pruned %s twitter snapshot rows to stay within TWITTER_SNAPSHOT_MAX_ROWS=%s",
                    deleted_snapshot_count,
                    snapshot_max_rows,
                )

        return TwitterRunResult(
            vc_name=vc["name"],
            baseline_run=baseline_run,
            new_snapshot_count=len(new_handles),
            matched_candidate_count=matched_candidate_count,
            stopped_early=stopped_early,
            output_file=fetch_result.output_file,
        )

    def process_tracked_person(self, person: dict) -> TwitterRunResult:
        tracked_person_id = person["id"]
        twitter_handle = normalize_handle(person.get("twitter_handle"))
        if not twitter_handle:
            raise RuntimeError(f"Tracked git person '{person['name']}' has no twitter_handle")

        cursor_row = self.db.get_tracked_person_twitter_cursor(tracked_person_id)
        snapshot_count = self.db.count_tracked_person_twitter_snapshots(tracked_person_id)
        last_known_handle = normalize_handle(cursor_row["last_known_handle"]) if cursor_row else None
        baseline_run = last_known_handle is None and snapshot_count == 0
        deep_scan = self._should_run_deep_scan(cursor_row, baseline_run)
        baseline_first_seen_at = date.today() - timedelta(days=8)
        output_file = self._output_path_for_tracked_person(person)
        known_sequence = [] if baseline_run else self._known_sequence_from_output(output_file)

        logger.info(
            "Scraping following list for tracked git person %s (@%s), baseline=%s, deep_scan=%s",
            person["name"],
            twitter_handle,
            baseline_run,
            deep_scan,
        )
        fetch_result = self._fetch_rows_for_vc(
            vc_id=tracked_person_id,
            twitter_handle=twitter_handle,
            output_file=output_file,
            last_known_handle=None if deep_scan else last_known_handle,
            baseline_run=baseline_run,
            known_sequence=known_sequence,
        )
        rows = fetch_result.rows

        tracked_handles = self.db.get_tracked_twitter_handles()
        protected_handles = set(tracked_handles)
        total_snapshot_count = self.db.count_all_tracked_person_twitter_snapshots()
        snapshot_max_rows = max(self.settings.twitter_snapshot_max_rows, 0)
        unlimited_snapshots = snapshot_max_rows == 0
        snapshot_first_seen_at = baseline_first_seen_at if baseline_run else date.today()
        new_handles: list[str] = []
        stopped_early = fetch_result.stopped_early
        page_one_first_handle = normalize_handle(rows[0]["username"]) if rows else None

        for row in rows:
            handle = normalize_handle(row.get("username"))
            if not handle:
                continue

            snapshot_exists = self.db.tracked_person_twitter_snapshot_exists(tracked_person_id, handle)
            should_store_snapshot = (
                unlimited_snapshots
                or snapshot_exists
                or handle in tracked_handles
                or total_snapshot_count < snapshot_max_rows
            )
            if should_store_snapshot:
                self.db.upsert_tracked_person_twitter_snapshot(
                    tracked_person_id,
                    handle,
                    snapshot_first_seen_at,
                )
                if not snapshot_exists:
                    total_snapshot_count += 1
            new_handles.append(handle)

        if page_one_first_handle:
            self.db.upsert_tracked_person_twitter_cursor(tracked_person_id, page_one_first_handle, utc_now())

        if not unlimited_snapshots:
            deleted_snapshot_count = self.db.prune_tracked_person_twitter_snapshots(
                max_rows=snapshot_max_rows,
                protected_handles=protected_handles,
            )
            if deleted_snapshot_count > 0:
                logger.info(
                    "Pruned %s tracked git twitter snapshot rows to stay within TWITTER_SNAPSHOT_MAX_ROWS=%s",
                    deleted_snapshot_count,
                    snapshot_max_rows,
                )

        return TwitterRunResult(
            vc_name=person["name"],
            baseline_run=baseline_run,
            new_snapshot_count=len(new_handles),
            matched_candidate_count=0,
            stopped_early=stopped_early,
            output_file=fetch_result.output_file,
        )

    def run_all(
        self,
        limit: int | None = None,
        progress_callback: Callable[[dict[str, Any]], None] | None = None,
        include_tracked_people: bool = True,
    ) -> list[TwitterRunResult]:
        results: list[TwitterRunResult] = []
        skipped_no_handle = 0
        failed = 0
        seed_targets: list[dict] = []
        for vc in self.db.list_vcs():
            twitter_handle = normalize_handle(vc.get("twitter_handle"))
            if not twitter_handle:
                logger.info("Skipping seed source %s because twitter_handle is empty.", vc["name"])
                skipped_no_handle += 1
                continue
            seed_targets.append(vc)

        if limit is not None:
            seed_targets = seed_targets[:limit]
            logger.info("Stopping seed scan after SEED_SCAN_BATCH_LIMIT=%s handled sources.", limit)

        total_targets = len(seed_targets)
        if progress_callback:
            progress_callback(
                {
                    "event": "start",
                    "total": total_targets,
                    "count": 0,
                    "remaining": total_targets,
                    "skipped": skipped_no_handle,
                }
            )

        for index, vc in enumerate(seed_targets, start=1):
            twitter_handle = normalize_handle(vc.get("twitter_handle"))
            if progress_callback:
                progress_callback(
                    {
                        "event": "source_start",
                        "total": total_targets,
                        "count": len(results),
                        "remaining": max(0, total_targets - len(results)),
                        "currentAccount": vc["name"],
                        "currentHandle": f"@{twitter_handle}" if twitter_handle else None,
                    }
                )
            try:
                result = self.process_vc(vc)
                results.append(result)
                if progress_callback:
                    progress_callback(
                        {
                            "event": "source_complete",
                            "total": total_targets,
                            "count": len(results),
                            "remaining": max(0, total_targets - len(results)),
                            "currentAccount": None,
                            "currentHandle": None,
                            "lastCompletedAccount": result.vc_name,
                            "failed": failed,
                            "skipped": skipped_no_handle,
                        }
                    )
            except Exception:
                failed += 1
                logger.exception("Twitter scrape failed for seed source %s", vc["name"])
                if progress_callback:
                    progress_callback(
                        {
                            "event": "source_failed",
                            "total": total_targets,
                            "count": index,
                            "remaining": max(0, total_targets - index),
                            "currentAccount": None,
                            "currentHandle": None,
                            "lastCompletedAccount": vc["name"],
                            "failed": failed,
                            "skipped": skipped_no_handle,
                        }
                    )
        if limit is None and include_tracked_people:
            for person in self.db.list_tracked_git_people_with_twitter():
                twitter_handle = normalize_handle(person.get("twitter_handle"))
                if not twitter_handle:
                    logger.info("Skipping tracked git person %s because twitter_handle is empty.", person["name"])
                    skipped_no_handle += 1
                    continue
                try:
                    results.append(self.process_tracked_person(person))
                except Exception:
                    failed += 1
                    logger.exception("Twitter scrape failed for tracked git person %s", person["name"])
        logger.info(
            "Twitter scrape summary: %s succeeded, %s skipped without handle, %s failed.",
            len(results),
            skipped_no_handle,
            failed,
        )
        return results

    def _validate_twitter_provider_settings(self) -> None:
        provider = self._provider_name()
        if self.settings.twitter_state_backend not in {"local"}:
            raise RuntimeError(
                f"Unsupported TWITTER_STATE_BACKEND: {self.settings.twitter_state_backend}"
            )
        if provider == "tweetapi" and not self.settings.tweetapi_key:
            raise RuntimeError("TWITTER_PROVIDER=tweetapi requires TWEETAPI_KEY")
        if provider == "scraper" and (not self.settings.twitter_username or not self.settings.twitter_password):
            raise RuntimeError("TWITTER_PROVIDER=scraper requires TWITTER_USERNAME and TWITTER_PASSWORD")

    def _provider_name(self) -> str:
        provider = self.settings.twitter_provider
        if provider in {"", "auto"}:
            return "tweetapi" if self.settings.tweetapi_key else "scraper"
        if provider not in {"tweetapi", "scraper"}:
            raise RuntimeError(f"Unsupported TWITTER_PROVIDER: {provider}")
        return provider

    def _fetch_rows_for_vc(
        self,
        *,
        vc_id: str,
        twitter_handle: str,
        output_file: str,
        last_known_handle: str | None,
        baseline_run: bool,
        known_sequence: list[str] | None = None,
    ) -> TweetApiFetchResult:
        provider = self._provider_name()
        logger.info("Using twitter provider '%s' for @%s", provider, twitter_handle)

        if provider == "tweetapi":
            return TweetApiFollowingProvider(self.settings, self.db).fetch_following(
                vc_id=vc_id,
                target_account=twitter_handle,
                output_file=output_file,
                last_known_handle=last_known_handle,
                baseline_run=baseline_run,
                known_sequence=known_sequence,
            )

        rows = scrape_following(
            username=self.settings.twitter_username,
            password=self.settings.twitter_password,
            verification=self.settings.twitter_verification or None,
            target_account=twitter_handle,
            output_file=output_file,
            max_scrolls=self.settings.twitter_max_scrolls,
        )
        return TweetApiFetchResult(rows=rows, stopped_early=False, output_file=output_file)
