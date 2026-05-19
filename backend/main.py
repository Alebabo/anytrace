from __future__ import annotations

import argparse
import logging
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from backend.alerts.email_alert import EmailAlertService
from backend.api_server import serve_api
from backend.db import SupabaseDB
from backend.engine.identity_matcher import IdentityMatcher
from backend.engine.news_engine import NewsEngine
from backend.engine.score_engine import ScoreEngine
from backend.engine.triage_engine import TriageEngine
from backend.scheduler import start_scheduler
from backend.scrapers.github_scraper import GithubScraper
from backend.scrapers.linkedin_alert_scraper import run_linkedin_alert_enrichment
from backend.scrapers.twitter_scraper import TwitterFollowingScraper


def configure_logging() -> None:
    log_level = os.getenv("LOG_LEVEL", "INFO").upper()
    logging.basicConfig(
        level=getattr(logging, log_level, logging.INFO),
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )


def run_github():
    results = GithubScraper().run_all()
    logging.getLogger(__name__).info(
        "GitHub run completed for %s tracked people and %s viral repos",
        len(results.tracked_results),
        len(results.viral_results),
    )
    return results


def run_twitter(limit: int | None = None, progress_callback=None, include_tracked_people: bool = True):
    results = TwitterFollowingScraper().run_all(
        limit=limit,
        progress_callback=progress_callback,
        include_tracked_people=include_tracked_people,
    )
    logging.getLogger(__name__).info("Twitter run completed for %s seed sources", len(results))
    return results


def run_scores() -> None:
    db = SupabaseDB.from_settings()
    results = ScoreEngine(db).calculate_all_scores()
    logging.getLogger(__name__).info("Score run completed for %s candidates", len(results))


def run_linkedin() -> dict:
    result = run_linkedin_alert_enrichment()
    logging.getLogger(__name__).info(
        "Native LinkedIn enrichment completed with status=%s enriched=%s skipped=%s",
        result.get("status"),
        result.get("enriched", 0),
        result.get("skipped", 0),
    )
    return result


def run_news() -> None:
    db = SupabaseDB.from_settings()
    results = NewsEngine(db).generate_all_news_events()
    logging.getLogger(__name__).info("News run created events for %s candidates", len(results))


def run_identity_match():
    db = SupabaseDB.from_settings()
    results = IdentityMatcher(db).run()
    logging.getLogger(__name__).info("Identity matching completed for %s tracked people", len(results))
    return results


def run_triage() -> dict:
    result = TriageEngine.build().run()
    logging.getLogger(__name__).info(
        "traqr.ai triage completed with status=%s qualified=%s",
        result.get("status"),
        result.get("qualifiedCount"),
    )
    return result


def run_alerts() -> None:
    sent = EmailAlertService.build().send_all_due_alerts()
    logging.getLogger(__name__).info("Alert run sent %s emails", len(sent))


def run_pipeline() -> dict:
    github_summary = run_github()
    twitter_results = run_twitter()
    run_scores()
    linkedin_result = run_linkedin()
    run_news()
    triage_result = run_triage()
    run_alerts()
    return {
        "ok": True,
        "status": "completed",
        "github": {
            "trackedCount": len(github_summary.tracked_results),
            "viralRepoCount": len(github_summary.viral_results),
        },
        "twitter": {
            "processed": len(twitter_results),
        },
        "linkedin": linkedin_result,
        "triage": triage_result,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="traqr.ai seed-source signal backend")
    parser.add_argument(
        "command",
        choices=[
            "run-twitter",
            "run-github",
            "run-scores",
            "run-linkedin",
            "run-linkedin-enrichment",
            "run-news",
            "run-identity-match",
            "run-triage",
            "run-alerts",
            "run-pipeline",
            "scheduler",
            "serve-api",
        ],
    )
    return parser


def main() -> None:
    configure_logging()
    parser = build_parser()
    args = parser.parse_args()

    if args.command == "run-twitter":
        run_twitter()
    elif args.command == "run-github":
        run_github()
    elif args.command == "run-scores":
        run_scores()
    elif args.command == "run-linkedin":
        run_linkedin()
    elif args.command == "run-linkedin-enrichment":
        run_linkedin()
    elif args.command == "run-news":
        run_news()
    elif args.command == "run-identity-match":
        run_identity_match()
    elif args.command == "run-triage":
        run_triage()
    elif args.command == "run-alerts":
        run_alerts()
    elif args.command == "run-pipeline":
        run_pipeline()
    elif args.command == "scheduler":
        start_scheduler()
    elif args.command == "serve-api":
        serve_api()


if __name__ == "__main__":
    main()
