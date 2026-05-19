from __future__ import annotations

import unittest
from dataclasses import replace
from unittest.mock import patch

from backend.api_server import (
    _agent_swarm_run_crunchbase_payload,
    _agent_swarm_top_picks,
    _positive_int_from_body,
)
from backend.config import get_settings


class AgentSwarmApiTest(unittest.TestCase):
    def test_positive_int_from_body_uses_safe_defaults(self) -> None:
        self.assertEqual(_positive_int_from_body({}, "limit", 3), 3)
        self.assertEqual(_positive_int_from_body({"limit": "7"}, "limit", 3), 7)
        self.assertEqual(_positive_int_from_body({"limit": "0"}, "limit", 3), 1)
        self.assertEqual(_positive_int_from_body({"limit": "nope"}, "limit", 3), 3)

    def test_crunchbase_missing_key_returns_configuration_error_without_mock_data(self) -> None:
        settings = replace(get_settings(), crunchbase_api_key="")

        with patch("backend.config.get_settings", return_value=settings):
            payload = _agent_swarm_run_crunchbase_payload({})

        self.assertFalse(payload["ok"])
        self.assertEqual(payload["status"], "configuration_error")
        self.assertEqual(payload["provider"], "crunchbase")
        self.assertEqual(payload["enriched"], 0)
        self.assertIn("CRUNCHBASE_API_KEY", payload["error"])

    def test_agent_swarm_top_picks_keeps_only_actionable_founder_results(self) -> None:
        payload = {
            "results": [
                {"candidateId": "one", "category": "potential_founder", "decision": "reach_out_now"},
                {"candidateId": "two", "category": "active_founder", "decision": "watch"},
                {"candidateId": "three", "category": "company_no_raise_yet", "decision": "research_more"},
                {"candidateId": "four", "category": "media", "decision": "reach_out_now"},
            ]
        }

        picks = _agent_swarm_top_picks(payload)

        self.assertEqual([row["candidateId"] for row in picks], ["one", "three"])


if __name__ == "__main__":
    unittest.main()
