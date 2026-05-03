from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, timedelta

import requests

from backend.config import Settings, get_settings
from backend.db import SupabaseDB

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class GithubRunResult:
    candidate_name: str
    repo_count: int
    top_repo: str | None
    max_star_delta_7d: int


class GithubScraper:
    base_url = "https://api.github.com"

    def __init__(self, db: SupabaseDB | None = None, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self.db = db or SupabaseDB.from_settings(self.settings)
        self.session = requests.Session()
        self.session.headers.update(
            {
                "Accept": "application/vnd.github+json",
                "Authorization": f"Bearer {self.settings.github_token}",
                "X-GitHub-Api-Version": "2022-11-28",
            }
        )

    def _fetch_repos(self, username: str) -> list[dict]:
        repos: list[dict] = []
        page = 1
        while True:
            response = self.session.get(
                f"{self.base_url}/users/{username}/repos",
                params={
                    "per_page": 100,
                    "page": page,
                    "type": "owner",
                    "sort": "updated",
                    "direction": "desc",
                },
                timeout=30,
            )
            response.raise_for_status()
            batch = response.json()
            if not batch:
                break
            repos.extend(batch)
            if len(batch) < 100:
                break
            page += 1
        return repos

    def process_candidate(self, candidate: dict) -> GithubRunResult:
        username = candidate["github_username"]
        logger.info("Fetching GitHub repos for %s (%s)", candidate["name"], username)
        repos = self._fetch_repos(username)
        repos = sorted(repos, key=lambda repo: repo.get("stargazers_count", 0), reverse=True)
        repos = repos[: self.settings.github_repo_limit]

        reference_date = date.today() - timedelta(days=7)
        reference_map = self.db.get_repo_reference_snapshot_map(candidate["id"], reference_date)
        max_delta = 0

        for repo in repos:
            repo_name = repo["name"]
            stars = int(repo.get("stargazers_count", 0))
            forks = int(repo.get("forks_count", 0))
            prior = reference_map.get(repo_name)
            prior_stars = int(prior["stars"]) if prior else stars
            star_delta_7d = max(0, stars - prior_stars)
            max_delta = max(max_delta, star_delta_7d)
            self.db.upsert_github_repo_snapshot(
                candidate["id"],
                repo_name,
                stars=stars,
                forks=forks,
                star_delta_7d=star_delta_7d,
                snapshot_date=date.today(),
            )

        return GithubRunResult(
            candidate_name=candidate["name"],
            repo_count=len(repos),
            top_repo=repos[0]["name"] if repos else None,
            max_star_delta_7d=max_delta,
        )

    def run_all(self) -> list[GithubRunResult]:
        results: list[GithubRunResult] = []
        for candidate in self.db.list_candidates_with_github():
            try:
                results.append(self.process_candidate(candidate))
            except requests.HTTPError:
                logger.exception("GitHub scrape failed for candidate %s", candidate["name"])
        return results
