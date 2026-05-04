from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone

from backend.db import SupabaseDB
from backend.engine.diff_engine import DiffEngine

UTC = timezone.utc


@dataclass(slots=True)
class NewsEngine:
    db: SupabaseDB
    diff_engine: DiffEngine = field(init=False)

    def __post_init__(self) -> None:
        self.diff_engine = DiffEngine(self.db)

    def generate_news_events(self, candidate_id: str, today: date | None = None) -> list[dict]:
        day = today or date.today()
        candidate = self.db.get_candidate_by_id(candidate_id)
        if not candidate:
            return []

        created_events: list[dict] = []
        vc_follows = self.diff_engine.get_new_vc_follows_this_week(candidate_id)
        for follow in vc_follows:
            title = f"{follow['vc_name']} folgt @{candidate['twitter_handle']}"
            if self.db.news_event_exists(candidate_id, "vc_follow", title, day):
                continue
            detail = {
                "vc_id": follow["vc_id"],
                "vc_name": follow["vc_name"],
                "tier": follow["tier"],
                "first_seen_at": follow["first_seen_at"],
            }
            self.db.insert_news_feed(
                candidate_id,
                event_type="vc_follow",
                title=title,
                detail=detail,
                score_impact=1,
            )
            created_events.append({"event_type": "vc_follow", "title": title})

        snapshots = self.db.get_github_snapshots_for_date(candidate_id, day)
        for snapshot in snapshots:
            if int(snapshot.get("star_delta_7d") or 0) <= 200:
                continue
            title = f"{candidate['github_username']}/{snapshot['repo_name']} +{snapshot['star_delta_7d']} Stars diese Woche"
            if self.db.news_event_exists(candidate_id, "repo_spike", title, day):
                continue
            self.db.insert_news_feed(
                candidate_id,
                event_type="repo_spike",
                title=title,
                detail=snapshot,
                score_impact=3,
            )
            created_events.append({"event_type": "repo_spike", "title": title})

        linkedin_since = datetime.now(tz=UTC) - timedelta(days=7)
        linkedin_signals = self.db.get_recent_linkedin_signals(candidate_id, linkedin_since)
        for signal in linkedin_signals:
            if signal["signal_type"] == "headline_change":
                title = f"Job-Änderung detected bei {candidate['name']}"
                event_type = "headline_change"
                score_impact = 2
            elif signal["signal_type"] == "vc_interaction":
                title = f"VC-Interaktion erkannt bei {candidate['name']}"
                event_type = "vc_interaction"
                score_impact = 1
            else:
                continue

            if self.db.news_event_exists(candidate_id, event_type, title, day):
                continue

            self.db.insert_news_feed(
                candidate_id,
                event_type=event_type,
                title=title,
                detail=signal,
                score_impact=score_impact,
            )
            created_events.append({"event_type": event_type, "title": title})

        return created_events

    def generate_all_news_events(self, today: date | None = None) -> list[dict]:
        events: list[dict] = []
        for candidate in self.db.list_candidates(active_only=True):
            created = self.generate_news_events(candidate["id"], today=today)
            if created:
                events.append({"candidate_id": candidate["id"], "events": created})
        return events
