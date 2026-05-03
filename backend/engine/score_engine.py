from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any

from backend.db import SupabaseDB
from backend.engine.diff_engine import DiffEngine

logger = logging.getLogger(__name__)
UTC = timezone.utc


@dataclass(slots=True)
class ScoreEngine:
    db: SupabaseDB

    def __post_init__(self) -> None:
        self.diff_engine = DiffEngine(self.db)

    def calculate_score(self, candidate_id: str, score_date: date | None = None) -> dict[str, Any]:
        score_day = score_date or date.today()
        github_snapshots = self.db.get_github_snapshots_for_date(candidate_id, score_day)
        github_hits = [row for row in github_snapshots if int(row.get("star_delta_7d") or 0) > 200]
        score_github = 3 if github_hits else 0

        vc_follows = self.diff_engine.get_new_vc_follows_this_week(candidate_id)
        vc_follow_count = len(vc_follows)
        score_twitter = 0
        if vc_follow_count >= 3:
            score_twitter = 2 + max(0, vc_follow_count - 3)

        linkedin_since = datetime.now(tz=UTC) - timedelta(days=7)
        linkedin_signals = self.db.get_recent_linkedin_signals(candidate_id, linkedin_since)
        has_headline_change = any(signal["signal_type"] == "headline_change" for signal in linkedin_signals)
        has_vc_interaction = any(signal["signal_type"] == "vc_interaction" for signal in linkedin_signals)
        score_linkedin = (2 if has_headline_change else 0) + (1 if has_vc_interaction else 0)

        score_total = score_github + score_twitter + score_linkedin
        breakdown = {
            "github": {
                "score": score_github,
                "repo_spikes": [
                    {
                        "repo_name": row["repo_name"],
                        "star_delta_7d": row["star_delta_7d"],
                    }
                    for row in github_hits
                ],
            },
            "twitter": {
                "score": score_twitter,
                "new_vc_follow_count": vc_follow_count,
                "new_vc_follows": vc_follows,
            },
            "linkedin": {
                "score": score_linkedin,
                "headline_change": has_headline_change,
                "vc_interaction": has_vc_interaction,
                "signals": linkedin_signals,
            },
            "score_total": score_total,
        }

        self.db.upsert_score(
            candidate_id,
            score_day,
            score_total=score_total,
            score_github=score_github,
            score_twitter=score_twitter,
            score_linkedin=score_linkedin,
            breakdown=breakdown,
        )
        return breakdown

    def calculate_all_scores(self, score_date: date | None = None) -> list[dict[str, Any]]:
        results: list[dict[str, Any]] = []
        for candidate in self.db.list_candidates(active_only=True):
            breakdown = self.calculate_score(candidate["id"], score_date)
            results.append({"candidate_id": candidate["id"], "breakdown": breakdown})
            logger.info(
                "Calculated score for %s: %s",
                candidate["name"],
                breakdown["score_total"],
            )
        return results
