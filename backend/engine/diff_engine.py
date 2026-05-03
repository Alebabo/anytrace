from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from backend.db import SupabaseDB


@dataclass(slots=True)
class DiffEngine:
    db: SupabaseDB

    def get_new_vc_follows_this_week(self, candidate_id: str) -> list[dict]:
        since = date.today() - timedelta(days=7)
        return self.db.get_new_vc_follows_since(candidate_id, since)
