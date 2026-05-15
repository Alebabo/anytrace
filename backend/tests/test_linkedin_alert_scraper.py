from __future__ import annotations

import json
import os
import tempfile
import unittest
from dataclasses import replace
from datetime import date
from pathlib import Path
from unittest.mock import patch

from backend.api_server import _run_linkedin_enrichment_payload
from backend.config import get_settings
from backend.db import SupabaseDB
from backend.scrapers.linkedin_alert_scraper import (
    NATIVE_LINKEDIN_SOURCE,
    LinkedInAlertScraper,
    LinkedInAlertTarget,
    LinkedInProfileFields,
    extract_profile_fields_from_html,
)


class FakeResponse:
    def __init__(self, text: str, status_code: int = 200) -> None:
        self.text = text
        self.status_code = status_code

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


class LinkedInAlertScraperTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "anytrace-test.db"
        self.db = SupabaseDB(self.db_path)
        self.db.set_seed_follow_alert_threshold(3)
        self.settings = replace(
            get_settings(),
            local_db_path=str(self.db_path),
            li_username="",
            li_password="",
            linkedin_min_delay_seconds=0,
            linkedin_max_delay_seconds=0,
            linkedin_scrape_batch_limit=10,
            linkedin_headless=True,
            linkedin_storage_state_path=str(Path(self.temp_dir.name) / "linkedin-state.json"),
            linkedin_public_scrape=True,
        )

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _seed_source(self, name: str, handle: str) -> dict:
        return self.db.upsert_vc(
            name=name,
            twitter_handle=handle,
            linkedin_url=None,
            tier=1,
            cluster_name=name,
            account_type="firm",
        )

    def _observe(self, target: str, seed_count: int) -> dict:
        first_seen = date(2026, 5, 14)
        alert = None
        for index in range(seed_count):
            seed = self._seed_source(f"Seed {index} {target}", f"seed_{index}_{target}")
            alert = self.db.upsert_seed_follow_observation(
                seed_vc_id=seed["id"],
                followed_handle=target,
                followed_name="Founder Target",
                first_seen_at=first_seen,
                last_seen_at=first_seen,
            )
        return alert or {}

    def _write_x_cache(self, handle: str, website: str) -> None:
        cache_path = self.db_path.parent / "x_profile_cache.json"
        cache_path.write_text(
            json.dumps({handle: {"username": handle, "website": website}}),
            encoding="utf-8",
        )

    def test_select_targets_filters_threshold_and_resolves_cache_url(self) -> None:
        self._observe("cache_founder", 3)
        self._observe("below_threshold", 2)
        self._write_x_cache("cache_founder", "https://www.linkedin.com/in/cache-founder/?trk=profile")

        targets = LinkedInAlertScraper(self.db, self.settings).select_targets()

        self.assertEqual(len(targets), 1)
        self.assertEqual(targets[0].x_handle, "cache_founder")
        self.assertEqual(targets[0].linkedin_url, "https://www.linkedin.com/in/cache-founder")
        self.assertEqual(targets[0].linkedin_url_source, "x_profile_cache")

    def test_missing_only_skips_profiles_with_existing_context(self) -> None:
        self._observe("already_enriched", 3)
        alert = next(row for row in self.db.list_seed_follow_alerts() if row["x_handle"] == "already_enriched")
        self.db.insert_linkedin_enrichment_event(
            discovered_person_id=alert["discovered_person_id"],
            linkedin_url="https://www.linkedin.com/in/already-enriched/",
            headline="Founder at Context AI",
            role_title="Founder",
            company="Context AI",
            location="Berlin",
            source=NATIVE_LINKEDIN_SOURCE,
        )

        scraper = LinkedInAlertScraper(self.db, self.settings)

        self.assertEqual(scraper.select_targets(missing_only=True), [])
        self.assertEqual(scraper.select_targets(missing_only=False)[0].linkedin_url, "https://www.linkedin.com/in/already-enriched")

    def test_persist_profile_writes_native_enrichment(self) -> None:
        self._observe("persist_target", 3)
        alert = next(row for row in self.db.list_seed_follow_alerts() if row["x_handle"] == "persist_target")
        target = LinkedInAlertTarget(
            person_id=alert["discovered_person_id"],
            alert_id=alert["id"],
            display_name="Persist Target",
            x_handle="persist_target",
            primary_profile_url="https://x.com/persist_target",
            linkedin_url="https://www.linkedin.com/in/persist-target",
            linkedin_url_source="test",
            current_seed_follower_count=3,
        )
        fields = LinkedInProfileFields(
            linkedin_url="https://www.linkedin.com/in/persist-target",
            name="Persist Target",
            headline="Founder at Persist AI",
            role_title="Founder",
            company="Persist AI",
            location="Paris",
            about="Building private market tools.",
        )

        event = LinkedInAlertScraper(self.db, self.settings).persist_profile(target, fields)
        latest = self.db.list_latest_linkedin_enrichments_by_person()[alert["discovered_person_id"]]

        self.assertEqual(event["source"], NATIVE_LINKEDIN_SOURCE)
        self.assertEqual(latest["headline"], "Founder at Persist AI")
        self.assertEqual(latest["raw_payload"]["profile"]["about"], "Building private market tools.")
        self.assertEqual(
            self.db.get_discovered_person(alert["discovered_person_id"])["linkedin_url"],
            "https://www.linkedin.com/in/persist-target",
        )

    def test_run_skips_missing_linkedin_url_without_credentials(self) -> None:
        self._observe("missing_linkedin", 3)

        result = LinkedInAlertScraper(self.db, self.settings).run()

        self.assertTrue(result["ok"])
        self.assertEqual(result["status"], "no_linkedin_urls")
        self.assertEqual(result["processed"], 1)
        self.assertEqual(result["skipped"], 1)
        self.assertEqual(result["skippedProfiles"][0]["reason"], "missing_linkedin_url")
        self.assertTrue(any(entry["stage"] == "missing_linkedin_url" for entry in result["agent_log"]))

    def test_run_public_scrape_enriches_known_url_without_credentials(self) -> None:
        self._observe("public_target", 3)
        self._write_x_cache("public_target", "https://www.linkedin.com/in/public-target/")

        with patch("backend.scrapers.linkedin_alert_scraper.requests.get") as get:
            get.return_value = FakeResponse(
                """
                <html>
                  <head>
                    <meta property="og:title" content="Public Target | LinkedIn">
                    <meta property="og:description" content="Founder at Public AI">
                  </head>
                  <body></body>
                </html>
                """
            )
            result = LinkedInAlertScraper(self.db, self.settings).run()

        self.assertTrue(result["ok"])
        self.assertEqual(result["enriched"], 1)
        self.assertEqual(result["enrichedProfiles"][0]["headline"], "Founder at Public AI")
        self.assertTrue(any(entry["stage"] == "public_scrape" for entry in result["agent_log"]))

    def test_extract_profile_fields_from_html(self) -> None:
        fields = extract_profile_fields_from_html(
            """
            <main>
              <h1>Alex Founder</h1>
              <div class="text-body-medium break-words">Founder at Signal Labs</div>
              <span class="text-body-small inline">Berlin, Germany</span>
              <section class="about">Building evidence-first sourcing tools.</section>
            </main>
            """
        )

        self.assertEqual(fields["name"], "Alex Founder")
        self.assertEqual(fields["headline"], "Founder at Signal Labs")
        self.assertEqual(fields["role_title"], "Founder")
        self.assertEqual(fields["company"], "Signal Labs")
        self.assertEqual(fields["location"], "Berlin, Germany")

    def test_api_payload_calls_native_scraper(self) -> None:
        with patch.dict(os.environ, {"ANYTRACE_LOCAL_DB_PATH": str(self.db_path)}):
            with patch("backend.scrapers.linkedin_alert_scraper.run_linkedin_alert_enrichment") as runner:
                runner.return_value = {
                    "ok": True,
                    "status": "completed",
                    "processed": 2,
                    "enriched": 1,
                    "skipped": 1,
                    "errors": [],
                    "agent_log": [],
                    "agentLog": [],
                }

                payload = _run_linkedin_enrichment_payload({"limit": 2, "missingOnly": False})

        self.assertEqual(payload["status"], "completed")
        self.assertEqual(runner.call_args.kwargs["limit"], 2)
        self.assertFalse(runner.call_args.kwargs["missing_only"])


if __name__ == "__main__":
    unittest.main()
