from __future__ import annotations

import logging
import smtplib
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from email.message import EmailMessage

from backend.config import Settings, get_settings, validate_settings
from backend.db import SupabaseDB

logger = logging.getLogger(__name__)
UTC = timezone.utc


@dataclass(slots=True)
class EmailAlertService:
    db: SupabaseDB
    settings: Settings

    @classmethod
    def build(cls, db: SupabaseDB | None = None, settings: Settings | None = None) -> "EmailAlertService":
        cfg = settings or get_settings()
        validate_settings(cfg, "smtp")
        return cls(db or SupabaseDB.from_settings(cfg), cfg)

    def _compose_email(self, candidate: dict, score: dict) -> EmailMessage:
        breakdown = score.get("breakdown") or {}
        msg = EmailMessage()
        msg["Subject"] = f"traqr.ai Alert: {candidate['name']} reached score {score['score_total']}"
        msg["From"] = self.settings.smtp_user
        msg["To"] = self.settings.alert_email

        twitter_url = (
            f"https://x.com/{candidate['twitter_handle']}"
            if candidate.get("twitter_handle")
            else "n/a"
        )
        github_url = (
            f"https://github.com/{candidate['github_username']}"
            if candidate.get("github_username")
            else "n/a"
        )
        frontend_url = f"{self.settings.frontend_base_url.rstrip('/')}/connections/{candidate['id']}"
        trigger_reasons = []
        if breakdown.get("github", {}).get("score"):
            trigger_reasons.append("GitHub repo spike")
        if breakdown.get("twitter", {}).get("score"):
            trigger_reasons.append("new VC follows")
        if breakdown.get("linkedin", {}).get("score"):
            trigger_reasons.append("LinkedIn signal")

        body = f"""
Candidate: {candidate['name']}
Score total: {score['score_total']}
Score GitHub: {score['score_github']}
Score Twitter: {score['score_twitter']}
Score LinkedIn: {score['score_linkedin']}

Trigger reasons: {", ".join(trigger_reasons) or "n/a"}

Twitter: {twitter_url}
GitHub: {github_url}
LinkedIn: {candidate.get('linkedin_url') or 'n/a'}
Frontend: {frontend_url}

Breakdown:
{breakdown}
        """.strip()
        msg.set_content(body)
        return msg

    def send_alert_if_needed(self, candidate_id: str, score_date: date | None = None) -> bool:
        day = score_date or date.today()
        candidate = self.db.get_candidate_by_id(candidate_id)
        score = self.db.get_score(candidate_id, day)
        if not candidate or not score:
            return False
        if int(score["score_total"]) < self.settings.alert_threshold:
            return False
        if self.db.recent_alert_exists(candidate_id, datetime.now(tz=UTC) - timedelta(days=7)):
            return False

        message = self._compose_email(candidate, score)
        with smtplib.SMTP(self.settings.smtp_host, self.settings.smtp_port, timeout=30) as smtp:
            smtp.starttls()
            smtp.login(self.settings.smtp_user, self.settings.smtp_pass)
            smtp.send_message(message)

        trigger_reason = f"score_total {score['score_total']} >= threshold {self.settings.alert_threshold}"
        self.db.insert_alert(
            candidate_id,
            score_total=int(score["score_total"]),
            trigger_reason=trigger_reason,
            channel="email",
        )
        logger.info("Sent alert email for %s", candidate["name"])
        return True

    def send_all_due_alerts(self, score_date: date | None = None) -> list[str]:
        day = score_date or date.today()
        sent: list[str] = []
        for score in self.db.list_scores_for_date(day):
            if self.send_alert_if_needed(score["candidate_id"], score_date=day):
                sent.append(score["candidate_id"])
        return sent
