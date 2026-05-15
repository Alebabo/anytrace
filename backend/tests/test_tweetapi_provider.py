from __future__ import annotations

import tempfile
import unittest
from dataclasses import replace
from pathlib import Path

from backend.config import get_settings
from backend.scrapers.tweetapi_provider import TweetApiFollowingProvider


class FakeTweetApiFollowingProvider(TweetApiFollowingProvider):
    def __init__(self, settings, pages: list[dict]) -> None:
        super().__init__(settings, db=None)
        self.pages = pages
        self.requests = 0

    def _lookup_user_id(self, user_name: str) -> str:
        return "user-1"

    def _request(self, method: str, path: str, *, params: dict[str, str | int]) -> dict:
        if self.requests >= len(self.pages):
            raise AssertionError("TweetAPI requested more pages than the fixture provides")
        page = self.pages[self.requests]
        self.requests += 1
        return page


class TweetApiProviderSequenceStopTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _settings(self, *, min_pages: int = 1, stop_count: int = 3):
        return replace(
            get_settings(),
            tweetapi_key="test-key",
            tweetapi_page_size=100,
            tweetapi_max_pages=5,
            tweetapi_incremental_min_pages=min_pages,
            tweetapi_known_sequence_stop_count=stop_count,
            twitter_request_timeout_seconds=1,
        )

    def _output_path(self, name: str) -> str:
        return str(Path(self.temp_dir.name) / name)

    def test_stops_after_known_following_sequence_in_same_order(self) -> None:
        provider = FakeTweetApiFollowingProvider(
            self._settings(stop_count=3),
            [
                {
                    "followings": [
                        {"userName": "newbuilder"},
                        {"userName": "old_2"},
                        {"userName": "old_3"},
                        {"userName": "old_4"},
                        {"userName": "would_not_process"},
                    ],
                    "has_next_page": True,
                    "next_cursor": "next",
                },
                {"followings": [{"userName": "second_page"}], "has_next_page": False},
            ],
        )

        result = provider.fetch_following(
            vc_id="seed-1",
            target_account="seed",
            output_file=self._output_path("following.csv"),
            last_known_handle=None,
            baseline_run=False,
            known_sequence=["old_1", "old_2", "old_3", "old_4", "old_5"],
        )

        self.assertTrue(result.stopped_early)
        self.assertEqual(provider.requests, 1)
        self.assertEqual(
            [row["username"] for row in result.rows],
            ["newbuilder", "old_2", "old_3", "old_4"],
        )

    def test_does_not_stop_when_known_handles_are_out_of_order(self) -> None:
        provider = FakeTweetApiFollowingProvider(
            self._settings(stop_count=3),
            [
                {
                    "followings": [
                        {"userName": "old_2"},
                        {"userName": "old_4"},
                        {"userName": "old_3"},
                    ],
                    "has_next_page": False,
                }
            ],
        )

        result = provider.fetch_following(
            vc_id="seed-1",
            target_account="seed",
            output_file=self._output_path("following.csv"),
            last_known_handle=None,
            baseline_run=False,
            known_sequence=["old_1", "old_2", "old_3", "old_4", "old_5"],
        )

        self.assertFalse(result.stopped_early)
        self.assertEqual(provider.requests, 1)
        self.assertEqual([row["username"] for row in result.rows], ["old_2", "old_4", "old_3"])

    def test_sequence_stop_respects_incremental_min_pages(self) -> None:
        provider = FakeTweetApiFollowingProvider(
            self._settings(min_pages=2, stop_count=3),
            [
                {
                    "followings": [
                        {"userName": "old_1"},
                        {"userName": "old_2"},
                        {"userName": "old_3"},
                        {"userName": "would_not_process"},
                    ],
                    "has_next_page": True,
                    "next_cursor": "next",
                },
                {
                    "followings": [{"userName": "fresh_next_page"}],
                    "has_next_page": True,
                    "next_cursor": "third",
                },
                {"followings": [{"userName": "third_page"}], "has_next_page": False},
            ],
        )

        result = provider.fetch_following(
            vc_id="seed-1",
            target_account="seed",
            output_file=self._output_path("following.csv"),
            last_known_handle=None,
            baseline_run=False,
            known_sequence=["old_1", "old_2", "old_3", "old_4"],
        )

        self.assertTrue(result.stopped_early)
        self.assertEqual(provider.requests, 2)
        self.assertEqual(
            [row["username"] for row in result.rows],
            ["old_1", "old_2", "old_3", "fresh_next_page"],
        )


if __name__ == "__main__":
    unittest.main()
