from __future__ import annotations

import logging

from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger

from backend.alerts.email_alert import EmailAlertService
from backend.db import SupabaseDB
from backend.engine.news_engine import NewsEngine
from backend.engine.score_engine import ScoreEngine
from backend.scrapers.github_scraper import GithubScraper
from backend.scrapers.linkedin_scraper import LinkedInScraper
from backend.scrapers.twitter_scraper import TwitterFollowingScraper

logger = logging.getLogger(__name__)


def run_twitter_job() -> None:
    TwitterFollowingScraper().run_all()


def run_github_job() -> None:
    GithubScraper().run_all()


def run_score_job() -> None:
    db = SupabaseDB.from_settings()
    ScoreEngine(db).calculate_all_scores()


def run_linkedin_job() -> None:
    LinkedInScraper().run_all()


def run_news_and_alert_job() -> None:
    db = SupabaseDB.from_settings()
    NewsEngine(db).generate_all_news_events()
    EmailAlertService.build(db=db).send_all_due_alerts()


def build_scheduler() -> BlockingScheduler:
    scheduler = BlockingScheduler(timezone="UTC")
    scheduler.add_job(run_twitter_job, CronTrigger(hour=2, minute=0), id="twitter_scraper")
    scheduler.add_job(run_github_job, CronTrigger(hour=3, minute=0), id="github_scraper")
    scheduler.add_job(run_score_job, CronTrigger(hour=4, minute=0), id="score_engine")
    scheduler.add_job(run_linkedin_job, CronTrigger(hour=4, minute=30), id="linkedin_scraper")
    scheduler.add_job(run_news_and_alert_job, CronTrigger(hour=5, minute=0), id="news_alert_job")
    return scheduler


def start_scheduler() -> None:
    scheduler = build_scheduler()
    logger.info("Starting Anytrace backend scheduler.")
    scheduler.start()
