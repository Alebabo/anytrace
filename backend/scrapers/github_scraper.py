from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, timedelta

import requests

from backend.config import Settings, get_settings, validate_settings
from backend.db import SupabaseDB, normalize_handle

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class GithubRunResult:
    candidate_name: str
    repo_count: int
    top_repo: str | None
    max_star_delta_7d: int


@dataclass(slots=True)
class GithubViralRepoResult:
    repo_owner: str
    repo_name: str
    owner_name: str
    stars: int
    star_delta_7d: int
    event_type: str
    x_handle: str | None = None
    important_x_follower_count: int = 0


@dataclass(slots=True)
class GithubScanSummary:
    tracked_results: list[GithubRunResult]
    viral_results: list[GithubViralRepoResult]


class GithubScraper:
    base_url = "https://api.github.com"
    twitterapi_base_url = "https://api.twitterapi.io"

    def __init__(self, db: SupabaseDB | None = None, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        validate_settings(self.settings, "supabase", "github")
        self.db = db or SupabaseDB.from_settings(self.settings)
        self.session = requests.Session()
        self.session.headers.update(
            {
                "Accept": "application/vnd.github+json",
                "Authorization": f"Bearer {self.settings.github_token}",
                "X-GitHub-Api-Version": "2022-11-28",
            }
        )
        self.twitter_session = requests.Session()
        if self.settings.tweetapi_key:
            self.twitter_session.headers.update({"x-api-key": self.settings.tweetapi_key})
        self._x_follow_relationship_cache: dict[tuple[str, str], bool] = {}
        self._important_x_followers_cache: dict[str, list[dict]] = {}

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

    def _fetch_network(
        self,
        username: str,
        relationship: str,
        *,
        known_usernames: set[str],
    ) -> tuple[list[dict], bool]:
        results: list[dict] = []
        seen_usernames: set[str] = set()
        stopped_early = False

        for page in range(1, self.settings.github_network_max_pages + 1):
            response = self.session.get(
                f"{self.base_url}/users/{username}/{relationship}",
                params={
                    "per_page": self.settings.github_network_page_size,
                    "page": page,
                },
                timeout=30,
            )
            response.raise_for_status()
            batch = response.json()
            if not batch:
                break

            page_known_count = 0
            page_new_count = 0
            for item in batch:
                observed_username = normalize_handle(item.get("login"))
                if not observed_username or observed_username in seen_usernames:
                    continue
                seen_usernames.add(observed_username)
                results.append(item)
                if observed_username in known_usernames:
                    page_known_count += 1
                else:
                    page_new_count += 1

            if page_known_count > 0 and page_new_count == 0:
                stopped_early = True
                break

            if len(batch) < self.settings.github_network_page_size:
                break

        return results, stopped_early

    def _fetch_user(self, username: str) -> dict:
        response = self.session.get(f"{self.base_url}/users/{username}", timeout=30)
        response.raise_for_status()
        return response.json()

    def _check_x_follow_relationship(self, *, source_handle: str, target_handle: str) -> bool:
        if not self.settings.tweetapi_key:
            return False

        cache_key = (source_handle.lower(), target_handle.lower())
        cached = self._x_follow_relationship_cache.get(cache_key)
        if cached is not None:
            return cached

        response = self.twitter_session.get(
            f"{self.twitterapi_base_url}/twitter/user/check_follow_relationship",
            params={
                "source_user_name": source_handle,
                "target_user_name": target_handle,
            },
            timeout=self.settings.twitter_request_timeout_seconds,
        )
        response.raise_for_status()
        payload = response.json() or {}
        data = payload.get("data") or {}
        is_following = bool(data.get("following"))
        self._x_follow_relationship_cache[cache_key] = is_following
        return is_following

    def _find_important_x_followers(self, target_handle: str) -> list[dict]:
        normalized_target = normalize_handle(target_handle)
        if not normalized_target or not self.settings.tweetapi_key:
            return []

        cached = self._important_x_followers_cache.get(normalized_target)
        if cached is not None:
            return cached

        matches: list[dict] = []
        for vc in self.db.list_vcs():
            vc_handle = normalize_handle(vc.get("twitter_handle"))
            if not vc_handle or vc_handle == normalized_target:
                continue
            try:
                if self._check_x_follow_relationship(source_handle=vc_handle, target_handle=normalized_target):
                    matches.append(
                        {
                            "vcId": vc["id"],
                            "vcName": vc["name"],
                            "vcHandle": vc_handle,
                            "tier": vc.get("tier"),
                        }
                    )
            except requests.HTTPError:
                logger.exception(
                    "X relationship lookup failed for @%s -> @%s",
                    vc_handle,
                    normalized_target,
                )
            except ValueError:
                logger.exception(
                    "X relationship lookup returned invalid JSON for @%s -> @%s",
                    vc_handle,
                    normalized_target,
                )

        self._important_x_followers_cache[normalized_target] = matches
        return matches

    def _search_viral_repos(self) -> list[dict]:
        repos: list[dict] = []
        cutoff = (date.today() - timedelta(days=self.settings.github_viral_pushed_within_days)).isoformat()
        page = 1

        while len(repos) < self.settings.github_viral_repo_limit:
            response = self.session.get(
                f"{self.base_url}/search/repositories",
                params={
                    "q": " ".join(
                        [
                            "is:public",
                            "fork:false",
                            f"stars:>={self.settings.github_viral_min_stars}",
                            f"pushed:>={cutoff}",
                        ]
                    ),
                    "sort": "updated",
                    "order": "desc",
                    "per_page": min(100, self.settings.github_viral_repo_limit),
                    "page": page,
                },
                timeout=30,
            )
            response.raise_for_status()
            payload = response.json() or {}
            batch = payload.get("items") or []
            if not batch:
                break

            repos.extend(batch)
            if len(batch) < min(100, self.settings.github_viral_repo_limit):
                break
            page += 1

        return repos[: self.settings.github_viral_repo_limit]

    def _build_indicators(self, user: dict) -> list[dict]:
        indicators: list[dict] = []
        followers = int(user.get("followers", 0) or 0)
        repos = int(user.get("public_repos", 0) or 0)
        company = (user.get("company") or "").strip()
        bio = (user.get("bio") or "").strip()
        blog = (user.get("blog") or "").strip()
        twitter = (user.get("twitter_username") or "").strip()

        if followers >= 20:
            indicators.append({"kind": "github_followers", "value": followers})
        if repos >= 3:
            indicators.append({"kind": "public_repos", "value": repos})
        if company:
            indicators.append({"kind": "company", "value": company})
        if bio:
            indicators.append({"kind": "bio", "value": bio[:120]})
        if blog:
            indicators.append({"kind": "blog", "value": blog})
        if twitter:
            indicators.append({"kind": "twitter", "value": twitter})

        return indicators

    def _is_repo_activity_important(self, *, stars: int, star_delta_7d: int, star_delta_30d: int) -> bool:
        if stars < self.settings.github_min_total_stars_for_event:
            return False
        return (
            star_delta_7d >= self.settings.github_min_star_delta_7d_for_event
            or star_delta_30d >= self.settings.github_min_star_delta_7d_for_event * 2
        )

    def process_person(self, person: dict, tracked_by_github: dict[str, dict]) -> GithubRunResult:
        username = person["github_username"]
        logger.info("Fetching GitHub repos for %s (%s)", person["name"], username)
        repos = self._fetch_repos(username)
        repos = sorted(repos, key=lambda repo: repo.get("stargazers_count", 0), reverse=True)
        repos = repos[: self.settings.github_repo_limit]

        reference_map_7d = self.db.get_repo_reference_snapshot_map_for_person(
            person["id"],
            date.today() - timedelta(days=7),
        )
        reference_map_30d = self.db.get_repo_reference_snapshot_map_for_person(
            person["id"],
            date.today() - timedelta(days=30),
        )
        known_following_observed_usernames = self.db.list_github_observed_usernames(
            source_tracked_person_id=person["id"],
            relationship_type="following",
        )
        known_follower_observed_usernames = self.db.list_github_observed_usernames(
            source_tracked_person_id=person["id"],
            relationship_type="follower",
        )
        existing_followed_tracked_person_ids = self.db.list_github_followed_tracked_person_ids(
            follower_tracked_person_id=person["id"],
        )
        known_following_usernames = set(known_following_observed_usernames)
        known_following_usernames.update(
            tracked_person["github_username"].strip().lower()
            for tracked_person in tracked_by_github.values()
            if tracked_person["id"] in existing_followed_tracked_person_ids and tracked_person.get("github_username")
        )
        max_delta = 0

        for repo in repos:
            repo_name = repo["name"]
            repo_owner = (repo.get("owner") or {}).get("login") or username
            stars = int(repo.get("stargazers_count", 0))
            forks = int(repo.get("forks_count", 0))
            watchers = int(repo.get("subscribers_count", repo.get("watchers_count", 0)) or 0)
            open_issues = int(repo.get("open_issues_count", 0) or 0)
            repo_key = f"{repo_owner}/{repo_name}"
            prior_7d = reference_map_7d.get(repo_key) or reference_map_7d.get(repo_name)
            prior_30d = reference_map_30d.get(repo_key) or reference_map_30d.get(repo_name)
            prior_stars_7d = int(prior_7d["stars"]) if prior_7d else stars
            prior_stars_30d = int(prior_30d["stars"]) if prior_30d else stars
            star_delta_7d = max(0, stars - prior_stars_7d)
            star_delta_30d = max(0, stars - prior_stars_30d)
            max_delta = max(max_delta, star_delta_7d)
            self.db.upsert_github_repo_snapshot_for_person(
                person["id"],
                repo_owner=repo_owner,
                repo_name=repo_name,
                stars=stars,
                forks=forks,
                watchers=watchers,
                open_issues=open_issues,
                star_delta_7d=star_delta_7d,
                star_delta_30d=star_delta_30d,
                snapshot_date=date.today(),
            )

            if self._is_repo_activity_important(
                stars=stars,
                star_delta_7d=star_delta_7d,
                star_delta_30d=star_delta_30d,
            ):
                self.db.insert_github_person_event(
                    tracked_person_id=person["id"],
                    repo_owner=repo_owner,
                    repo_name=repo_name,
                    event_type="repo_traction",
                    title=f"{person['name']} gained {star_delta_7d} GitHub stars on {repo_owner}/{repo_name}",
                    detail={
                        "repoOwner": repo_owner,
                        "repoName": repo_name,
                        "repoLabel": repo_key,
                        "weekly_star_delta": star_delta_7d,
                        "stars": stars,
                        "watchers": watchers,
                    },
                    score_impact=min(40, max(8, star_delta_7d // 5)),
                    source_url=repo.get("html_url"),
                )

        try:
            following, following_stopped_early = self._fetch_network(
                username,
                "following",
                known_usernames=known_following_usernames,
            )
        except requests.HTTPError:
            logger.exception("GitHub following scrape failed for %s", person["name"])
            following = []
            following_stopped_early = False

        try:
            followers, followers_stopped_early = self._fetch_network(
                username,
                "followers",
                known_usernames=known_follower_observed_usernames,
            )
        except requests.HTTPError:
            logger.exception("GitHub followers scrape failed for %s", person["name"])
            followers = []
            followers_stopped_early = False

        if following_stopped_early or followers_stopped_early:
            logger.info(
                "GitHub network scrape for %s stopped early: following=%s, followers=%s",
                person["name"],
                following_stopped_early,
                followers_stopped_early,
            )

        for followed in following:
            followed_username = (followed.get("login") or "").strip().lower()
            tracked_target = tracked_by_github.get(followed_username)
            if not tracked_target or tracked_target["id"] == person["id"]:
                continue

            is_new_relationship = tracked_target["id"] not in existing_followed_tracked_person_ids
            self.db.upsert_github_follow_relationship(
                follower_tracked_person_id=person["id"],
                followed_tracked_person_id=tracked_target["id"],
                source_url=followed.get("html_url"),
            )
            existing_followed_tracked_person_ids.add(tracked_target["id"])

            if is_new_relationship:
                self.db.insert_github_person_event(
                    tracked_person_id=person["id"],
                    repo_owner=None,
                    repo_name=None,
                    event_type="github_network_follow",
                    title=f"{person['name']} follows {tracked_target['name']} on GitHub",
                    detail={
                        "actorLabel": person["name"],
                        "targetLabel": tracked_target["name"],
                        "followedGithubUsername": followed_username,
                    },
                    score_impact=8,
                    source_url=followed.get("html_url"),
                )

        observed_usernames = {
            ("following", (followed.get("login") or "").strip().lower())
            for followed in following
            if (followed.get("login") or "").strip()
        } | {
            ("follower", (follower.get("login") or "").strip().lower())
            for follower in followers
            if (follower.get("login") or "").strip()
        }

        for relationship_type, observed_username in observed_usernames:
            if not observed_username or observed_username == username.lower():
                continue
            if relationship_type == "following" and observed_username in known_following_observed_usernames:
                continue
            if relationship_type == "follower" and observed_username in known_follower_observed_usernames:
                continue
            try:
                observed_user = self._fetch_user(observed_username)
            except requests.HTTPError:
                logger.exception("GitHub user lookup failed for %s observed from %s", observed_username, person["name"])
                continue

            indicators = self._build_indicators(observed_user)
            is_signal_bearing = len(indicators) >= self.settings.github_min_indicator_count_for_event
            observed_row = self.db.upsert_github_observed_person(
                source_tracked_person_id=person["id"],
                relationship_type=relationship_type,
                github_username=observed_username,
                name=observed_user.get("name") or observed_username,
                profile_url=observed_user.get("html_url"),
                avatar_url=observed_user.get("avatar_url"),
                bio=observed_user.get("bio"),
                company=observed_user.get("company"),
                location=observed_user.get("location"),
                blog_url=observed_user.get("blog"),
                twitter_handle=observed_user.get("twitter_username"),
                followers_count=int(observed_user.get("followers", 0) or 0),
                following_count=int(observed_user.get("following", 0) or 0),
                public_repos_count=int(observed_user.get("public_repos", 0) or 0),
                indicator_count=len(indicators),
                indicators=indicators,
                can_add_to_watchlist=relationship_type == "following" and is_signal_bearing,
            )

            if relationship_type == "following":
                known_following_observed_usernames.add(observed_username)
            else:
                known_follower_observed_usernames.add(observed_username)

            if relationship_type == "follower" and is_signal_bearing:
                self.db.insert_github_person_event(
                    tracked_person_id=person["id"],
                    repo_owner=None,
                    repo_name=None,
                    event_type="important_github_follower",
                    title=f"{person['name']} gained a new GitHub follower: {observed_row.get('name') or observed_username}",
                    detail={
                        "actorLabel": observed_row.get("name") or observed_username,
                        "targetLabel": person["name"],
                        "relationshipKind": "github_follower",
                        "indicatorCount": len(indicators),
                    },
                    score_impact=min(12, 4 + len(indicators)),
                    source_url=observed_user.get("html_url"),
                )

        return GithubRunResult(
            candidate_name=person["name"],
            repo_count=len(repos),
            top_repo=f"{((repos[0].get('owner') or {}).get('login') or username)}/{repos[0]['name']}" if repos else None,
            max_star_delta_7d=max_delta,
        )

    def discover_viral_repos(self) -> list[GithubViralRepoResult]:
        results: list[GithubViralRepoResult] = []
        reference_map_7d = self.db.get_github_viral_repo_reference_snapshot_map(date.today() - timedelta(days=7))
        reference_map_30d = self.db.get_github_viral_repo_reference_snapshot_map(date.today() - timedelta(days=30))
        seen_repo_keys: set[str] = set()

        try:
            repos = self._search_viral_repos()
        except requests.HTTPError:
            logger.exception("GitHub viral repo discovery failed")
            return results

        for repo in repos:
            repo_owner = ((repo.get("owner") or {}).get("login") or "").strip()
            repo_name = (repo.get("name") or "").strip()
            if not repo_owner or not repo_name:
                continue

            repo_key = f"{repo_owner}/{repo_name}"
            if repo_key in seen_repo_keys:
                continue
            seen_repo_keys.add(repo_key)

            stars = int(repo.get("stargazers_count", 0) or 0)
            forks = int(repo.get("forks_count", 0) or 0)
            watchers = int(repo.get("watchers_count", 0) or 0)
            open_issues = int(repo.get("open_issues_count", 0) or 0)
            prior_7d = reference_map_7d.get(repo_key)
            prior_30d = reference_map_30d.get(repo_key)
            had_snapshot_before = self.db.has_github_viral_repo_snapshot(repo_owner=repo_owner, repo_name=repo_name)
            prior_stars_7d = int(prior_7d["stars"]) if prior_7d else stars
            prior_stars_30d = int(prior_30d["stars"]) if prior_30d else stars
            star_delta_7d = max(0, stars - prior_stars_7d)
            star_delta_30d = max(0, stars - prior_stars_30d)
            owner_name = ((repo.get("owner") or {}).get("login") or repo_owner).strip()
            description = (repo.get("description") or "").strip() or None
            repo_url = (repo.get("html_url") or "").strip() or None
            owner_avatar_url = ((repo.get("owner") or {}).get("avatar_url") or "").strip() or None
            owner_profile_url = ((repo.get("owner") or {}).get("html_url") or "").strip() or None
            language = (repo.get("language") or "").strip() or None
            pushed_at = (repo.get("pushed_at") or "").strip() or None
            owner_x_handle: str | None = None
            important_x_followers: list[dict] = []

            try:
                owner_user = self._fetch_user(repo_owner)
                owner_x_handle = normalize_handle(owner_user.get("twitter_username"))
            except requests.HTTPError:
                logger.exception("GitHub owner lookup failed for viral repo owner %s", repo_owner)

            if owner_x_handle:
                important_x_followers = self._find_important_x_followers(owner_x_handle)

            self.db.upsert_github_viral_repo_snapshot(
                repo_owner=repo_owner,
                repo_name=repo_name,
                repo_description=description,
                repo_url=repo_url,
                owner_display_name=owner_name,
                owner_avatar_url=owner_avatar_url,
                owner_profile_url=owner_profile_url,
                language=language,
                stars=stars,
                forks=forks,
                watchers=watchers,
                open_issues=open_issues,
                star_delta_7d=star_delta_7d,
                star_delta_30d=star_delta_30d,
                pushed_at=pushed_at,
                snapshot_date=date.today(),
            )

            event_type = ""
            title = ""
            detail = {
                "repoLabel": repo_key,
                "repoOwner": repo_owner,
                "repoName": repo_name,
                "weekly_star_delta": star_delta_7d,
                "monthly_star_delta": star_delta_30d,
                "language": language,
                "twitterHandle": owner_x_handle,
                "importantXFollowerCount": len(important_x_followers),
                "importantXFollowerNames": [entry["vcName"] for entry in important_x_followers],
                "importantXFollowerHandles": [entry["vcHandle"] for entry in important_x_followers],
                "importantXFollowerIds": [entry["vcId"] for entry in important_x_followers],
            }
            if star_delta_7d >= self.settings.github_viral_min_star_delta_7d:
                event_type = "viral_repo"
                title = f"{repo_key} is spiking on GitHub with +{star_delta_7d} stars in 7 days"
            elif not had_snapshot_before and stars >= self.settings.github_viral_min_stars:
                event_type = "viral_repo"
                title = f"{repo_key} entered the GitHub discovery feed with {stars} stars"

            if event_type and important_x_followers:
                title = (
                    f"{title} and already has X attention from {len(important_x_followers)} tracked VC"
                    f"{'' if len(important_x_followers) == 1 else 's'}"
                )

            if event_type and not self.db.has_github_viral_repo_event(
                repo_owner=repo_owner,
                repo_name=repo_name,
                event_type=event_type,
                event_date=date.today(),
            ):
                self.db.insert_github_viral_repo_event(
                    repo_owner=repo_owner,
                    repo_name=repo_name,
                    repo_description=description,
                    repo_url=repo_url,
                    owner_display_name=owner_name,
                    owner_avatar_url=owner_avatar_url,
                    owner_profile_url=owner_profile_url,
                    language=language,
                    event_type=event_type,
                    title=title,
                    detail=detail,
                    stars=stars,
                    forks=forks,
                    watchers=watchers,
                    open_issues=open_issues,
                    star_delta_7d=star_delta_7d,
                    star_delta_30d=star_delta_30d,
                )
                results.append(
                    GithubViralRepoResult(
                        repo_owner=repo_owner,
                        repo_name=repo_name,
                        owner_name=owner_name,
                        stars=stars,
                        star_delta_7d=star_delta_7d,
                        event_type=event_type,
                        x_handle=owner_x_handle,
                        important_x_follower_count=len(important_x_followers),
                    )
                )

        return results

    def run_all(self) -> GithubScanSummary:
        tracked_results: list[GithubRunResult] = []
        tracked_people = self.db.list_tracked_git_people_with_github()
        tracked_by_github = {
            person["github_username"].strip().lower(): person
            for person in tracked_people
            if person.get("github_username")
        }
        for person in tracked_people:
            try:
                tracked_results.append(self.process_person(person, tracked_by_github))
            except requests.HTTPError:
                logger.exception("GitHub scrape failed for tracked git person %s", person["name"])
        viral_results = self.discover_viral_repos()
        return GithubScanSummary(
            tracked_results=tracked_results,
            viral_results=viral_results,
        )
