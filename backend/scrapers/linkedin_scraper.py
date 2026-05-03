from __future__ import annotations

import logging
import random
import time
from dataclasses import dataclass
from datetime import date

from playwright.sync_api import Browser, BrowserContext, Page, sync_playwright

from backend.config import Settings, get_settings, validate_settings
from backend.db import SupabaseDB, normalize_linkedin_url

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class LinkedInRunResult:
    candidate_name: str
    headline_changed: bool
    interaction_count: int


class LinkedInScraper:
    login_url = "https://www.linkedin.com/login"

    def __init__(self, db: SupabaseDB | None = None, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        validate_settings(self.settings, "supabase", "linkedin")
        self.db = db or SupabaseDB.from_settings(self.settings)

    def _login(self, page: Page) -> None:
        page.goto(self.login_url, wait_until="domcontentloaded")
        page.locator("#username").fill(self.settings.li_username)
        page.locator("#password").fill(self.settings.li_password)
        page.locator("button[type='submit']").click()
        page.wait_for_load_state("networkidle")

    @staticmethod
    def _extract_headline(page: Page) -> str | None:
        selectors = [
            "div.text-body-medium.break-words",
            ".pv-text-details__left-panel div.text-body-medium",
            "main h1 + div",
        ]
        for selector in selectors:
            locator = page.locator(selector).first
            if locator.count() > 0:
                value = locator.inner_text().strip()
                if value:
                    return value
        return None

    @staticmethod
    def _extract_recent_posts(page: Page) -> list[dict[str, str]]:
        posts: list[dict[str, str]] = []
        cards = page.locator("div.feed-shared-update-v2, div.occludable-update").all()[:10]
        for card in cards:
            text = card.inner_text().strip()
            hrefs = card.locator("a[href*='linkedin.com/']").evaluate_all(
                "(els) => els.map((el) => el.href).filter(Boolean)"
            )
            posts.append(
                {
                    "text": text,
                    "hrefs": list(dict.fromkeys(hrefs)),
                }
            )
        return posts

    def _match_vc_interactions(self, posts: list[dict[str, str]]) -> list[tuple[str, str]]:
        vcs = self.db.list_vcs()
        vc_map = {
            normalize_linkedin_url(vc.get("linkedin_url")): vc
            for vc in vcs
            if normalize_linkedin_url(vc.get("linkedin_url"))
        }
        matches: list[tuple[str, str]] = []
        for post in posts:
            text = post["text"].lower()
            interaction_type = "comment" if "comment" in text else "like"
            for href in post["hrefs"]:
                vc = vc_map.get(normalize_linkedin_url(href))
                if vc:
                    matches.append((vc["id"], interaction_type))
        return list(dict.fromkeys(matches))

    def process_candidate(self, context: BrowserContext, candidate: dict) -> LinkedInRunResult:
        page = context.new_page()
        page.goto(candidate["linkedin_url"], wait_until="domcontentloaded")
        page.wait_for_load_state("networkidle")

        headline = self._extract_headline(page)
        latest_headline_signal = self.db.get_latest_headline_signal(candidate["id"])
        previous_headline = (
            latest_headline_signal.get("new_value")
            if latest_headline_signal and latest_headline_signal.get("new_value")
            else None
        )

        headline_changed = False
        if headline and previous_headline and headline != previous_headline:
            self.db.insert_linkedin_signal(
                candidate["id"],
                "headline_change",
                old_value=previous_headline,
                new_value=headline,
            )
            headline_changed = True
        elif headline and not previous_headline:
            self.db.insert_linkedin_signal(
                candidate["id"],
                "headline_change",
                old_value=None,
                new_value=headline,
            )

        posts = self._extract_recent_posts(page)
        interactions = self._match_vc_interactions(posts)
        for vc_id, interaction_type in interactions:
            self.db.insert_linkedin_signal(
                candidate["id"],
                "vc_interaction",
                old_value=None,
                new_value=candidate["linkedin_url"],
                vc_id=vc_id,
                interaction_type=interaction_type,
            )

        page.close()
        return LinkedInRunResult(
            candidate_name=candidate["name"],
            headline_changed=headline_changed,
            interaction_count=len(interactions),
        )

    def run_all(self) -> list[LinkedInRunResult]:
        candidates = self.db.list_candidates_scored_at_least(3, date.today())
        if not candidates:
            logger.info("No LinkedIn scrape candidates with score >= 3 for %s", date.today().isoformat())
            return []

        results: list[LinkedInRunResult] = []
        with sync_playwright() as p:
            browser: Browser = p.chromium.launch(headless=False)
            context = browser.new_context()
            page = context.new_page()
            self._login(page)
            page.close()

            for candidate in candidates:
                if not candidate.get("linkedin_url"):
                    continue
                try:
                    results.append(self.process_candidate(context, candidate))
                except Exception:
                    logger.exception("LinkedIn scrape failed for candidate %s", candidate["name"])
                delay = random.randint(
                    self.settings.linkedin_min_delay_seconds,
                    self.settings.linkedin_max_delay_seconds,
                )
                logger.info("Waiting %ss before next LinkedIn candidate", delay)
                time.sleep(delay)

            context.close()
            browser.close()

        return results
