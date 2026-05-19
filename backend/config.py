from __future__ import annotations

import os
from dataclasses import dataclass


def _env(name: str, default: str | None = None, *, required: bool = False) -> str:
    value = os.getenv(name, default)
    if required and (value is None or value == ""):
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value or ""


@dataclass(frozen=True)
class Settings:
    supabase_url: str
    supabase_key: str
    local_db_path: str
    twitter_provider: str
    twitter_state_backend: str
    twitter_local_db_path: str
    twitter_username: str
    twitter_password: str
    twitter_verification: str
    twitter_max_scrolls: int
    twitter_snapshot_max_rows: int
    tweetapi_key: str
    tweetapi_base_url: str
    tweetapi_page_size: int
    tweetapi_max_pages: int
    tweetapi_incremental_min_pages: int
    tweetapi_known_sequence_stop_count: int
    tweetapi_deep_scan_interval_hours: int
    twitter_request_timeout_seconds: int
    github_token: str
    li_username: str
    li_password: str
    smtp_host: str
    smtp_port: int
    smtp_user: str
    smtp_pass: str
    alert_email: str
    alert_threshold: int
    frontend_base_url: str
    log_level: str
    github_repo_limit: int
    github_network_page_size: int
    github_network_max_pages: int
    github_min_star_delta_7d_for_event: int
    github_min_total_stars_for_event: int
    github_min_indicator_count_for_event: int
    github_public_lookup: bool
    github_viral_repo_limit: int
    github_viral_min_stars: int
    github_viral_min_star_delta_7d: int
    github_viral_pushed_within_days: int
    make_linkedin_webhook_url: str
    make_linkedin_webhook_secret: str
    make_linkedin_batch_limit: int
    public_api_base_url: str
    seed_follow_alert_threshold: int
    featherless_api_key: str
    featherless_base_url: str
    featherless_triage_model: str
    featherless_triage_mock: bool
    triage_candidate_limit: int
    linkedin_min_delay_seconds: int
    linkedin_max_delay_seconds: int
    linkedin_storage_state_path: str
    linkedin_headless: bool
    linkedin_scrape_batch_limit: int
    linkedin_public_scrape: bool
    crunchbase_api_key: str
    agent_swarm_seed_limit: int
    agent_swarm_tweetapi_page_size: int
    agent_swarm_tweetapi_max_pages: int


def validate_settings(settings: Settings, *scopes: str) -> None:
    required_by_scope = {
        "supabase": {
            "TRAQR_LOCAL_DB_PATH": settings.local_db_path,
        },
        "twitter": {
            "TWITTER_USERNAME": settings.twitter_username,
            "TWITTER_PASSWORD": settings.twitter_password,
        },
        "github": {
            "GITHUB_TOKEN": settings.github_token,
        },
        "linkedin": {
            "LI_USERNAME": settings.li_username,
            "LI_PASSWORD": settings.li_password,
        },
        "smtp": {
            "SMTP_HOST": settings.smtp_host,
            "SMTP_USER": settings.smtp_user,
            "SMTP_PASS": settings.smtp_pass,
            "ALERT_EMAIL": settings.alert_email,
        },
    }

    missing: list[str] = []
    for scope in scopes:
        for env_name, value in required_by_scope.get(scope, {}).items():
            if not value:
                missing.append(env_name)

    if missing:
        joined = ", ".join(sorted(set(missing)))
        raise RuntimeError(f"Missing required environment variables for {', '.join(scopes)}: {joined}")


def get_settings() -> Settings:
    return Settings(
        supabase_url=_env("SUPABASE_URL", ""),
        supabase_key=_env("SUPABASE_KEY", ""),
        local_db_path=_env("TRAQR_LOCAL_DB_PATH", "backend/local_data/traqr.db").strip(),
        twitter_provider=_env("TWITTER_PROVIDER", "auto").strip().lower(),
        twitter_state_backend=_env("TWITTER_STATE_BACKEND", "local").strip().lower(),
        twitter_local_db_path=_env("TWITTER_LOCAL_DB_PATH", "backend/local_data/twitter_state.db").strip(),
        twitter_username=_env("TWITTER_USERNAME", ""),
        twitter_password=_env("TWITTER_PASSWORD", ""),
        twitter_verification=_env("TWITTER_VERIFICATION", ""),
        twitter_max_scrolls=int(_env("TWITTER_MAX_SCROLLS", "60")),
        twitter_snapshot_max_rows=int(_env("TWITTER_SNAPSHOT_MAX_ROWS", "100")),
        tweetapi_key=_env("TWEETAPI_KEY", ""),
        tweetapi_base_url=_env("TWEETAPI_BASE_URL", "https://api.tweetapi.com/tw-v2").strip(),
        tweetapi_page_size=int(_env("TWEETAPI_PAGE_SIZE", "100")),
        tweetapi_max_pages=int(_env("TWEETAPI_MAX_PAGES", "6")),
        tweetapi_incremental_min_pages=int(_env("TWEETAPI_INCREMENTAL_MIN_PAGES", "2")),
        tweetapi_known_sequence_stop_count=max(0, int(_env("TWEETAPI_KNOWN_SEQUENCE_STOP_COUNT", "8"))),
        tweetapi_deep_scan_interval_hours=int(_env("TWEETAPI_DEEP_SCAN_INTERVAL_HOURS", "20")),
        twitter_request_timeout_seconds=int(_env("TWITTER_REQUEST_TIMEOUT_SECONDS", "30")),
        github_token=_env("GITHUB_TOKEN", ""),
        li_username=_env("LI_USERNAME", ""),
        li_password=_env("LI_PASSWORD", ""),
        smtp_host=_env("SMTP_HOST", ""),
        smtp_port=int(_env("SMTP_PORT", "587")),
        smtp_user=_env("SMTP_USER", ""),
        smtp_pass=_env("SMTP_PASS", ""),
        alert_email=_env("ALERT_EMAIL", ""),
        alert_threshold=int(_env("ALERT_THRESHOLD", "5")),
        frontend_base_url=_env("FRONTEND_BASE_URL", _env("VITE_SITE_URL", "http://localhost:8080")),
        log_level=_env("LOG_LEVEL", "INFO"),
        github_repo_limit=int(_env("GITHUB_REPO_LIMIT", "25")),
        github_network_page_size=int(_env("GITHUB_NETWORK_PAGE_SIZE", "100")),
        github_network_max_pages=int(_env("GITHUB_NETWORK_MAX_PAGES", "3")),
        github_min_star_delta_7d_for_event=int(_env("GITHUB_MIN_STAR_DELTA_7D_FOR_EVENT", "40")),
        github_min_total_stars_for_event=int(_env("GITHUB_MIN_TOTAL_STARS_FOR_EVENT", "100")),
        github_min_indicator_count_for_event=int(_env("GITHUB_MIN_INDICATOR_COUNT_FOR_EVENT", "2")),
        github_public_lookup=_env("GITHUB_PUBLIC_LOOKUP", "true").strip().lower() in {"1", "true", "yes", "on"},
        github_viral_repo_limit=int(_env("GITHUB_VIRAL_REPO_LIMIT", "20")),
        github_viral_min_stars=int(_env("GITHUB_VIRAL_MIN_STARS", "150")),
        github_viral_min_star_delta_7d=int(_env("GITHUB_VIRAL_MIN_STAR_DELTA_7D", "25")),
        github_viral_pushed_within_days=int(_env("GITHUB_VIRAL_PUSHED_WITHIN_DAYS", "10")),
        make_linkedin_webhook_url=_env("MAKE_LINKEDIN_WEBHOOK_URL", "").strip(),
        make_linkedin_webhook_secret=_env("MAKE_LINKEDIN_WEBHOOK_SECRET", _env("LINKEDIN_MAKE_WEBHOOK_SECRET", "")).strip(),
        make_linkedin_batch_limit=int(_env("MAKE_LINKEDIN_BATCH_LIMIT", "25")),
        public_api_base_url=_env("TRAQR_PUBLIC_API_BASE_URL", "").strip().rstrip("/"),
        seed_follow_alert_threshold=int(_env("SEED_FOLLOW_ALERT_THRESHOLD", "3")),
        featherless_api_key=_env("FEATHERLESS_API_KEY", "").strip(),
        featherless_base_url=_env("FEATHERLESS_BASE_URL", "https://api.featherless.ai/v1").strip().rstrip("/"),
        featherless_triage_model=_env("FEATHERLESS_TRIAGE_MODEL", "meta-llama/Meta-Llama-3.1-8B-Instruct").strip(),
        featherless_triage_mock=_env("FEATHERLESS_TRIAGE_MOCK", "false").strip().lower() in {"1", "true", "yes", "on"},
        triage_candidate_limit=max(1, int(_env("TRIAGE_CANDIDATE_LIMIT", "25"))),
        linkedin_min_delay_seconds=int(_env("LINKEDIN_MIN_DELAY_SECONDS", "30")),
        linkedin_max_delay_seconds=int(_env("LINKEDIN_MAX_DELAY_SECONDS", "90")),
        linkedin_storage_state_path=_env("LINKEDIN_STORAGE_STATE_PATH", "backend/local_data/linkedin_state.json").strip(),
        linkedin_headless=_env("LINKEDIN_HEADLESS", "true").strip().lower() in {"1", "true", "yes", "on"},
        linkedin_scrape_batch_limit=max(1, int(_env("LINKEDIN_SCRAPE_BATCH_LIMIT", "10"))),
        linkedin_public_scrape=_env("LINKEDIN_PUBLIC_SCRAPE", "true").strip().lower() in {"1", "true", "yes", "on"},
        crunchbase_api_key=_env("CRUNCHBASE_API_KEY", "").strip(),
        agent_swarm_seed_limit=max(1, int(_env("AGENT_SWARM_SEED_LIMIT", "3"))),
        agent_swarm_tweetapi_page_size=max(1, int(_env("AGENT_SWARM_TWEETAPI_PAGE_SIZE", "25"))),
        agent_swarm_tweetapi_max_pages=max(1, int(_env("AGENT_SWARM_TWEETAPI_MAX_PAGES", "1"))),
    )
