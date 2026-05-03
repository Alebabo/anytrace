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
    twitter_username: str
    twitter_password: str
    twitter_verification: str
    twitter_max_scrolls: int
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
    linkedin_min_delay_seconds: int
    linkedin_max_delay_seconds: int


def validate_settings(settings: Settings, *scopes: str) -> None:
    required_by_scope = {
        "supabase": {
            "SUPABASE_URL": settings.supabase_url,
            "SUPABASE_KEY": settings.supabase_key,
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
        twitter_username=_env("TWITTER_USERNAME", ""),
        twitter_password=_env("TWITTER_PASSWORD", ""),
        twitter_verification=_env("TWITTER_VERIFICATION", ""),
        twitter_max_scrolls=int(_env("TWITTER_MAX_SCROLLS", "60")),
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
        linkedin_min_delay_seconds=int(_env("LINKEDIN_MIN_DELAY_SECONDS", "30")),
        linkedin_max_delay_seconds=int(_env("LINKEDIN_MAX_DELAY_SECONDS", "90")),
    )
