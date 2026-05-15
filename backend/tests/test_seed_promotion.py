from __future__ import annotations

import tempfile
import unittest
from datetime import date
from pathlib import Path

from backend.db import SupabaseDB


class SeedFollowAlertPromotionTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db = SupabaseDB(Path(self.temp_dir.name) / "anytrace-test.db")
        self.db.set_seed_follow_alert_threshold(2)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _create_alert(self, handle: str = "promoted_partner_test") -> dict:
        seed_one = self.db.upsert_vc(
            name=f"Seed One {handle}",
            twitter_handle=f"seed_one_{handle}",
            linkedin_url=None,
            tier=1,
            cluster_name=f"Seed One {handle}",
            account_type="firm",
        )
        seed_two = self.db.upsert_vc(
            name=f"Seed Two {handle}",
            twitter_handle=f"seed_two_{handle}",
            linkedin_url=None,
            tier=1,
            cluster_name=f"Seed Two {handle}",
            account_type="firm",
        )
        first_seen = date(2026, 5, 1)
        self.db.upsert_seed_follow_observation(
            seed_vc_id=seed_one["id"],
            followed_handle=handle,
            followed_name="Promoted Partner",
            first_seen_at=first_seen,
            last_seen_at=first_seen,
        )
        self.db.upsert_seed_follow_observation(
            seed_vc_id=seed_two["id"],
            followed_handle=handle,
            followed_name="Promoted Partner",
            first_seen_at=first_seen,
            last_seen_at=first_seen,
        )

        return next(alert for alert in self.db.list_seed_follow_alerts() if alert["x_handle"] == handle)

    def test_promote_alert_creates_seed_and_hides_default_alert(self) -> None:
        alert = self._create_alert()

        result = self.db.promote_seed_follow_alert_to_vc(
            alert_id=alert["id"],
            name="Promoted Partner",
            x_handle="@Promoted_Partner_Test",
            linkedin_url="https://www.linkedin.com/in/promoted-partner-test/",
            cluster_name="Promoted Capital",
            account_type="partner",
            tier="microvc",
        )

        self.assertEqual(result["vc"]["twitter_handle"], "promoted_partner_test")
        self.assertEqual(result["vc"]["linkedin_url"], "https://www.linkedin.com/in/promoted-partner-test")
        self.assertFalse(any(row["id"] == alert["id"] for row in self.db.list_seed_follow_alerts()))

        promoted = next(row for row in self.db.list_seed_follow_alerts(include_promoted=True) if row["id"] == alert["id"])
        self.assertEqual(promoted["status"], "promoted")
        self.assertEqual(promoted["promoted_vc_id"], result["vc"]["id"])
        self.assertTrue(promoted["promoted_at"])

    def test_promote_alert_is_idempotent_for_existing_handle(self) -> None:
        handle = "existing_partner_test"
        existing = self.db.upsert_vc(
            name="Existing Partner",
            twitter_handle=handle,
            linkedin_url=None,
            tier=2,
            cluster_name="Existing Capital",
            account_type="partner",
        )
        alert = self._create_alert(handle)

        first = self.db.promote_seed_follow_alert_to_vc(
            alert_id=alert["id"],
            name="Existing Partner Updated",
            x_handle=handle,
            linkedin_url=None,
            cluster_name="Existing Capital",
            account_type="partner",
            tier="microvc",
        )
        second = self.db.promote_seed_follow_alert_to_vc(
            alert_id=alert["id"],
            name="Existing Partner Updated Again",
            x_handle=handle,
            linkedin_url=None,
            cluster_name="Existing Capital",
            account_type="partner",
            tier="microvc",
        )

        rows = self.db._fetchall("select * from vcs where twitter_handle = ?", (handle,))
        self.assertEqual(first["vc"]["id"], existing["id"])
        self.assertEqual(second["vc"]["id"], existing["id"])
        self.assertEqual(len(rows), 1)

    def test_promote_alert_can_create_journalist_seed_source(self) -> None:
        alert = self._create_alert("journalist_source_test")

        result = self.db.promote_seed_follow_alert_to_vc(
            alert_id=alert["id"],
            name="Journalist Source",
            x_handle="journalist_source_test",
            linkedin_url=None,
            cluster_name="Tech News Outlet",
            account_type="journalist",
            tier="journalist",
        )

        self.assertEqual(result["vc"]["account_type"], "journalist")
        self.assertEqual(result["vc"]["tier"], 4)

    def test_seed_follow_alert_status_can_be_liked_archived_and_restored(self) -> None:
        alert = self._create_alert("dismissed_pick_test")

        liked = self.db.update_seed_follow_alert_status(alert_id=alert["id"], status="liked")
        archived = self.db.update_seed_follow_alert_status(alert_id=alert["id"], status="archived")
        restored = self.db.update_seed_follow_alert_status(alert_id=alert["id"], status="new")

        self.assertEqual(liked["status"], "liked")
        self.assertEqual(archived["status"], "archived")
        self.assertEqual(restored["status"], "new")

    def test_backfill_parses_snapshot_dates(self) -> None:
        seed_one = self.db.upsert_vc(
            name="Backfill Seed One",
            twitter_handle="backfill_seed_one",
            linkedin_url=None,
            tier=1,
            cluster_name="Backfill Seed One",
            account_type="firm",
        )
        seed_two = self.db.upsert_vc(
            name="Backfill Seed Two",
            twitter_handle="backfill_seed_two",
            linkedin_url=None,
            tier=1,
            cluster_name="Backfill Seed Two",
            account_type="firm",
        )
        for seed in (seed_one, seed_two):
            self.db.upsert_twitter_snapshot(seed["id"], "backfill_target", date(2026, 5, 2))

        result = self.db.backfill_seed_follow_alerts_from_snapshots()
        alert = next(row for row in self.db.list_seed_follow_alerts() if row["x_handle"] == "backfill_target")
        observations = self.db._fetchall(
            """
            select o.first_seen_at
            from seed_follow_observations o
            join discovered_people p on p.id = o.discovered_person_id
            where p.x_handle = ?
            """,
            ("backfill_target",),
        )

        self.assertEqual(result["observationsCreated"], 2)
        self.assertEqual(alert["current_seed_follower_count"], 2)
        self.assertEqual({row["first_seen_at"] for row in observations}, {"2026-05-02"})


if __name__ == "__main__":
    unittest.main()
