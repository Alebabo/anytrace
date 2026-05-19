from __future__ import annotations

import tempfile
import unittest
import json
from dataclasses import replace
from datetime import date
from pathlib import Path

from backend.config import get_settings
from backend.db import SupabaseDB
from backend.engine.triage_engine import TriageEngine, _extract_json_object


class TriageEngineTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db = SupabaseDB(Path(self.temp_dir.name) / "traqr-test.db")
        self.db.set_seed_follow_alert_threshold(3)
        self.settings = replace(
            get_settings(),
            local_db_path=str(Path(self.temp_dir.name) / "traqr-test.db"),
            featherless_triage_mock=True,
            featherless_api_key="",
            featherless_triage_model="test/mock-model",
            github_public_lookup=False,
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

    def _observe(self, target: str, seed_count: int, followed_name: str = "Founder Target") -> None:
        first_seen = date(2026, 5, 14)
        for index in range(seed_count):
            seed = self._seed_source(f"Seed {index}", f"seed_{index}_{target}")
            self.db.upsert_seed_follow_observation(
                seed_vc_id=seed["id"],
                followed_handle=target,
                followed_name=followed_name,
                first_seen_at=first_seen,
                last_seen_at=first_seen,
            )

    def _write_x_profile_cache(self, handle: str, *, bio: str, followers: int = 0) -> None:
        cache_path = Path(self.temp_dir.name) / "x_profile_cache.json"
        existing = {}
        if cache_path.exists():
            existing = json.loads(cache_path.read_text(encoding="utf-8"))
        existing[handle] = {"bio": bio, "followerCount": followers, "username": handle}
        cache_path.write_text(json.dumps(existing), encoding="utf-8")

    def test_mock_triage_filters_at_three_sources_and_persists_latest(self) -> None:
        self._observe("qualified_founder", 3)
        alert = next(row for row in self.db.list_seed_follow_alerts() if row["x_handle"] == "qualified_founder")
        self.db.insert_linkedin_enrichment_event(
            discovered_person_id=alert["discovered_person_id"],
            linkedin_url="https://www.linkedin.com/in/qualified-founder/",
            headline="Founder building AI tools for private market investors",
            role_title="Founder",
            company="Qualified AI",
            location="Berlin",
        )

        result = TriageEngine(self.db, self.settings).run()
        latest = self.db.get_latest_triage_run()

        self.assertTrue(result["ok"])
        self.assertEqual(result["threshold"], 3)
        self.assertEqual(result["qualifiedCount"], 1)
        self.assertEqual(result["results"][0]["decision"], "reach_out_now")
        self.assertEqual(result["results"][0]["category"], "company_no_raise_yet")
        self.assertIsNotNone(latest)
        self.assertEqual(latest["payload"]["runId"], result["runId"])

    def test_github_builder_evidence_attaches_to_triage_payload(self) -> None:
        self._observe("github_builder", 3, "GitHub Builder")
        self.db.upsert_github_observed_person(
            source_tracked_person_id="source-github-radar",
            relationship_type="follower",
            github_username="github-builder",
            name="GitHub Builder",
            profile_url="https://github.com/github-builder",
            avatar_url="https://github.com/github-builder.png",
            bio="Founder building open-source developer infrastructure.",
            company="Stealth Devtools",
            location="Berlin",
            blog_url="https://builder.dev",
            twitter_handle="github_builder",
            followers_count=48,
            following_count=12,
            public_repos_count=7,
            indicator_count=4,
            indicators=[{"kind": "bio", "value": "Founder building open-source developer infrastructure."}],
            can_add_to_watchlist=True,
        )

        result = TriageEngine(self.db, self.settings).run()
        candidate = next(row for row in result["rawCandidates"] if row["xHandle"] == "@github_builder")

        self.assertEqual(candidate["githubContext"]["handle"], "github-builder")
        self.assertEqual(candidate["githubUrl"], "https://github.com/github-builder")
        self.assertTrue(any(item["type"] == "github_builder_evidence" for item in candidate["evidence"]))
        self.assertEqual(result["results"][0]["githubContext"]["handle"], "github-builder")
        self.assertNotIn("GitHub context missing", result["results"][0]["missingContext"])
        self.assertTrue(any(row["stage"] == "github" for row in result["agentLog"]))

    def test_github_organization_accounts_are_filtered_from_top_picks(self) -> None:
        self._observe("product_account", 8, "Product Account")
        alert = next(row for row in self.db.list_seed_follow_alerts() if row["x_handle"] == "product_account")
        candidate = TriageEngine(self.db, self.settings)._candidate_from_alert(
            alert,
            None,
            None,
            {
                "handle": "product-account",
                "profileUrl": "https://github.com/product-account",
                "accountType": "Organization",
                "builderSignal": "Builder proof: product-account/product has 50000 GitHub stars.",
            },
        )

        reason = TriageEngine(self.db, self.settings)._exclusion_reason(candidate)

        self.assertIn("organization", reason or "")

    def test_no_qualified_candidates_is_successful_empty_run(self) -> None:
        self._observe("not_enough_signal", 2)

        result = TriageEngine(self.db, self.settings).run()

        self.assertTrue(result["ok"])
        self.assertEqual(result["qualifiedCount"], 0)
        self.assertEqual(result["results"], [])
        self.assertIn("No pre-seed founder-grade profiles", result["agentLog"][-1]["message"])

    def test_live_mode_without_key_returns_visible_error_payload(self) -> None:
        self._observe("missing_key_target", 3)
        live_settings = replace(self.settings, featherless_triage_mock=False, featherless_api_key="")

        result = TriageEngine(self.db, live_settings).run()

        self.assertFalse(result["ok"])
        self.assertEqual(result["status"], "error")
        self.assertIn("FEATHERLESS_API_KEY", result["error"])

    def test_mock_triage_excludes_established_ai_labs_from_top_picks(self) -> None:
        self._observe("openai", 8, "OpenAI")
        self._observe("stealth_founder", 4, "Stealth Founder")
        founder_alert = next(row for row in self.db.list_seed_follow_alerts() if row["x_handle"] == "stealth_founder")
        self.db.insert_linkedin_enrichment_event(
            discovered_person_id=founder_alert["discovered_person_id"],
            linkedin_url="https://www.linkedin.com/in/stealth-founder/",
            headline="Founder building in stealth for developer tools",
            role_title="Founder",
            company="Stealth Devtools",
            location="Berlin",
        )

        result = TriageEngine(self.db, self.settings).run()

        self.assertTrue(result["ok"])
        self.assertEqual([row["xHandle"] for row in result["results"]], ["@stealth_founder"])
        self.assertTrue(any("Excluding @openai" in row["message"] for row in result["agentLog"]))

    def test_mock_triage_excludes_big_vc_partners_from_top_picks(self) -> None:
        self._observe("vc_partner", 7, "VC Partner")
        self._observe("preseed_builder", 4, "Preseed Builder")
        alerts = {row["x_handle"]: row for row in self.db.list_seed_follow_alerts()}
        self.db.insert_linkedin_enrichment_event(
            discovered_person_id=alerts["vc_partner"]["discovered_person_id"],
            linkedin_url="https://www.linkedin.com/in/vc-partner/",
            headline="General Partner at Sequoia Capital",
            role_title="General Partner",
            company="Sequoia Capital",
            location="London",
        )
        self.db.insert_linkedin_enrichment_event(
            discovered_person_id=alerts["preseed_builder"]["discovered_person_id"],
            linkedin_url="https://www.linkedin.com/in/preseed-builder/",
            headline="Founder building an AI workflow startup in stealth",
            role_title="Founder",
            company="Stealth Workflow AI",
            location="London",
        )

        result = TriageEngine(self.db, self.settings).run()

        self.assertTrue(result["ok"])
        self.assertEqual([row["xHandle"] for row in result["results"]], ["@preseed_builder"])
        self.assertTrue(any("large VC partner" in row["message"] for row in result["agentLog"]))

    def test_mock_triage_uses_x_bio_to_exclude_vc_partner_profiles(self) -> None:
        self._observe("ethanchoi7", 8, "Ethan Choi")
        self._observe("preseed_builder", 4, "Preseed Builder")
        self._write_x_profile_cache(
            "ethanchoi7",
            bio="partner @Khoslaventures, prev @Accel, working with OpenAI and Ramp",
            followers=7861,
        )
        self._write_x_profile_cache(
            "preseed_builder",
            bio="Founder building a pre-seed AI workflow company in stealth",
            followers=1200,
        )

        result = TriageEngine(self.db, self.settings).run()

        self.assertTrue(result["ok"])
        self.assertEqual([row["xHandle"] for row in result["results"]], ["@preseed_builder"])
        self.assertTrue(any("VC" in row["message"] or "partner" in row["message"] for row in result["agentLog"]))

    def test_mock_triage_excludes_vc_principal_from_x_bio(self) -> None:
        self._observe("vc_principal", 8, "VC Principal")
        self._observe("preseed_builder", 4, "Preseed Builder")
        self._write_x_profile_cache(
            "vc_principal",
            bio="Principal at Accel investing in AI infrastructure.",
            followers=5300,
        )
        self._write_x_profile_cache(
            "preseed_builder",
            bio="Founder building a pre-seed AI workflow company in stealth",
            followers=1200,
        )

        result = TriageEngine(self.db, self.settings).run()

        self.assertTrue(result["ok"])
        self.assertEqual([row["xHandle"] for row in result["results"]], ["@preseed_builder"])
        self.assertTrue(any("large VC partner" in row["message"] for row in result["agentLog"]))

    def test_mock_triage_excludes_operator_role_without_founder_signal(self) -> None:
        self._observe("operator_profile", 8, "Operator Profile")
        self._observe("preseed_builder", 4, "Preseed Builder")
        self._write_x_profile_cache(
            "operator_profile",
            bio="principal ideas guy at eigen",
            followers=10220,
        )
        self._write_x_profile_cache(
            "preseed_builder",
            bio="Founder building a pre-seed AI workflow company in stealth",
            followers=1200,
        )

        result = TriageEngine(self.db, self.settings).run()

        self.assertTrue(result["ok"])
        self.assertEqual([row["xHandle"] for row in result["results"]], ["@preseed_builder"])
        self.assertTrue(any("operator or investor role" in row["message"] for row in result["agentLog"]))

    def test_mock_triage_excludes_high_audience_profiles_without_founder_context(self) -> None:
        self._observe("public_magnet", 9, "Public Magnet")
        self._observe("preseed_builder", 4, "Preseed Builder")
        self._write_x_profile_cache("public_magnet", bio="Writing about AI and markets.", followers=150000)
        self._write_x_profile_cache(
            "preseed_builder",
            bio="Founder building a pre-seed AI workflow company in stealth",
            followers=1200,
        )

        result = TriageEngine(self.db, self.settings).run()

        self.assertTrue(result["ok"])
        self.assertEqual([row["xHandle"] for row in result["results"]], ["@preseed_builder"])
        self.assertTrue(any("large public profile" in row["message"] for row in result["agentLog"]))

    def test_mock_triage_uses_x_bio_to_exclude_investor_profiles(self) -> None:
        self._observe("investment_generalist", 6, "Investment Generalist")
        self._observe("preseed_builder", 4, "Preseed Builder")
        self._write_x_profile_cache(
            "investment_generalist",
            bio="Investment generalist seeking elite asset managers. Views are my own.",
            followers=6900,
        )
        self._write_x_profile_cache(
            "preseed_builder",
            bio="Founder building a pre-seed AI workflow company in stealth",
            followers=1200,
        )

        result = TriageEngine(self.db, self.settings).run()

        self.assertTrue(result["ok"])
        self.assertEqual([row["xHandle"] for row in result["results"]], ["@preseed_builder"])
        self.assertTrue(any("investor profile" in row["message"] for row in result["agentLog"]))

    def test_model_discard_cannot_hide_non_obvious_signal_cluster(self) -> None:
        self._observe("unknown_builder", 20, "Unknown Builder")
        alert = next(row for row in self.db.list_seed_follow_alerts() if row["x_handle"] == "unknown_builder")
        candidate = TriageEngine(self.db, self.settings)._candidate_from_alert(alert, None)

        result = TriageEngine(self.db, self.settings)._normalize_results(
            [{"candidateId": candidate["id"], "decision": "discard", "score": 1}],
            [candidate],
        )[0]

        self.assertEqual(result["decision"], "watch")
        self.assertGreaterEqual(result["score"], 35)

    def test_model_cannot_claim_active_founder_without_supplied_founder_context(self) -> None:
        self._observe("unknown_cluster", 20, "Unknown Cluster")
        alert = next(row for row in self.db.list_seed_follow_alerts() if row["x_handle"] == "unknown_cluster")
        candidate = TriageEngine(self.db, self.settings)._candidate_from_alert(alert, None)

        result = TriageEngine(self.db, self.settings)._normalize_results(
            [{"candidateId": candidate["id"], "category": "active_founder", "decision": "research_more"}],
            [candidate],
        )[0]

        self.assertEqual(result["category"], "potential_founder")

    def test_research_more_next_action_does_not_tell_vc_to_reach_out(self) -> None:
        self._observe("founder_building", 20, "Founder building")
        alert = next(row for row in self.db.list_seed_follow_alerts() if row["x_handle"] == "founder_building")
        candidate = TriageEngine(self.db, self.settings)._candidate_from_alert(alert, None)

        result = TriageEngine(self.db, self.settings)._normalize_results(
            [
                {
                    "candidateId": candidate["id"],
                    "decision": "research_more",
                    "nextAction": "Reach out now to discuss pre-seed funding.",
                    "riskFlags": [
                        "low follower count compared to peers",
                        "low",
                        "established AI lab",
                        "VC/investor employees",
                        "VC partner at Creandum",
                    ],
                }
            ],
            [candidate],
        )[0]

        self.assertIn("Verify founder/company context", result["nextAction"])
        self.assertNotIn("Reach out", result["nextAction"])
        self.assertNotIn("low follower count compared to peers", result["riskFlags"])
        self.assertNotIn("low", result["riskFlags"])
        self.assertNotIn("established AI lab", result["riskFlags"])
        self.assertNotIn("VC/investor employees", result["riskFlags"])
        self.assertNotIn("VC partner at Creandum", result["riskFlags"])
        self.assertIn("LinkedIn/company context needs verification", result["riskFlags"])

    def test_why_now_guard_replaces_contradictory_model_copy(self) -> None:
        self._observe("founder_building", 20, "Founder building")
        alert = next(row for row in self.db.list_seed_follow_alerts() if row["x_handle"] == "founder_building")
        candidate = TriageEngine(self.db, self.settings)._candidate_from_alert(alert, None)

        result = TriageEngine(self.db, self.settings)._normalize_results(
            [
                {
                    "candidateId": candidate["id"],
                    "decision": "research_more",
                    "whyNow": "Established AI lab with 80k followers, not a top pick.",
                }
            ],
            [candidate],
        )[0]

        self.assertNotIn("not a top pick", result["whyNow"].lower())
        self.assertIn("curated signal sources", result["whyNow"])

    def test_confidence_guard_uses_evidence_floor_for_visible_results(self) -> None:
        self._observe("founder_building", 20, "Founder building")
        alert = next(row for row in self.db.list_seed_follow_alerts() if row["x_handle"] == "founder_building")
        candidate = TriageEngine(self.db, self.settings)._candidate_from_alert(alert, None)

        result = TriageEngine(self.db, self.settings)._normalize_results(
            [{"candidateId": candidate["id"], "decision": "research_more", "confidence": 0}],
            [candidate],
        )[0]

        self.assertGreaterEqual(result["confidence"], 40)

    def test_final_output_downgrades_active_founder_for_research_queue(self) -> None:
        self._observe("maybe_founder", 20, "Maybe Founder")
        alert = next(row for row in self.db.list_seed_follow_alerts() if row["x_handle"] == "maybe_founder")
        candidate = TriageEngine(self.db, self.settings)._candidate_from_alert(alert, None)
        engine = TriageEngine(self.db, self.settings)

        result = engine._finalize_result(
            {
                "candidateId": candidate["id"],
                "category": "active_founder",
                "decision": "research_more",
                "riskFlags": ["low follower count"],
                "nextAction": "Verify startup traction and founder background.",
            },
            {candidate["id"]: candidate},
        )

        self.assertEqual(result["category"], "potential_founder")
        self.assertIn("Verify founder/company context", result["nextAction"])
        self.assertNotIn("low follower count", result["riskFlags"])

    def test_triage_ranks_research_more_before_watch(self) -> None:
        self._observe("unknown_cluster", 20, "Unknown Cluster")
        self._observe("founder_building", 3, "Founder building")

        result = TriageEngine(self.db, self.settings).run()

        self.assertEqual(result["results"][0]["xHandle"], "@founder_building")
        self.assertEqual(result["results"][0]["decision"], "research_more")
        self.assertEqual(result["results"][1]["xHandle"], "@unknown_cluster")
        self.assertEqual(result["results"][1]["decision"], "watch")

    def test_extract_json_object_accepts_fenced_json(self) -> None:
        parsed = _extract_json_object('```json\n{"results":[{"candidateId":"a"}]}\n```')

        self.assertEqual(parsed["results"][0]["candidateId"], "a")

    def test_extract_json_object_repairs_missing_array_item_comma(self) -> None:
        parsed = _extract_json_object('{"results":[{"candidateId":"a"}{"candidateId":"b"}]}')

        self.assertEqual([row["candidateId"] for row in parsed["results"]], ["a", "b"])


if __name__ == "__main__":
    unittest.main()
