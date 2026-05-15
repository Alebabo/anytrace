from __future__ import annotations

import html
import json
import logging
import random
import re
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

import requests
from playwright.sync_api import Browser, BrowserContext, Page, TimeoutError as PlaywrightTimeoutError, sync_playwright

from backend.config import Settings, get_settings, validate_settings
from backend.db import SupabaseDB, normalize_handle

logger = logging.getLogger(__name__)
NATIVE_LINKEDIN_SOURCE = "linkedin_native_scraper"


def _utc_now_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def _clean_text(value: Any) -> str | None:
    if value is None:
        return None
    normalized = " ".join(str(value).strip().split())
    return normalized or None


def _short_text(value: Any, *, max_length: int = 120) -> str | None:
    normalized = _clean_text(value)
    if not normalized:
        return None
    if len(normalized) <= max_length:
        return normalized
    return f"{normalized[: max_length - 1].rstrip()}..."


def _as_bool(value: Any, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    if isinstance(value, str):
        return value.strip().lower() not in {"0", "false", "no", "off"}
    return bool(value)


def _is_linkedin_url(value: str | None) -> bool:
    if not value:
        return False
    try:
        parsed = urlsplit(_with_scheme(value))
    except ValueError:
        return False
    host = parsed.netloc.lower()
    return host == "linkedin.com" or host.endswith(".linkedin.com")


def _is_linkedin_profile_url(value: str | None) -> bool:
    if not _is_linkedin_url(value):
        return False
    path = urlsplit(_with_scheme(value or "")).path.lower()
    return path.startswith("/in/")


def _with_scheme(value: str) -> str:
    stripped = value.strip()
    if not stripped:
        return stripped
    if stripped.startswith(("http://", "https://")):
        return stripped
    if stripped.startswith(("linkedin.com/", "www.linkedin.com/")):
        return f"https://{stripped}"
    return stripped


def clean_linkedin_url(value: str | None) -> str | None:
    if not _is_linkedin_url(value):
        return None
    parsed = urlsplit(_with_scheme(value or ""))
    path = parsed.path.rstrip("/")
    if not path:
        return None
    return f"https://{parsed.netloc.lower()}{path}"


def _has_profile_context(enrichment: dict[str, Any] | None) -> bool:
    if not enrichment:
        return False
    return any(
        _clean_text(enrichment.get(key))
        for key in ("headline", "role_title", "company", "location")
    )


def derive_role_company(headline: str | None) -> tuple[str | None, str | None]:
    normalized = _clean_text(headline)
    if not normalized:
        return None, None
    for separator in (" at ", " @ "):
        if separator in normalized:
            role, company = normalized.split(separator, 1)
            return _clean_text(role), _clean_text(company.split("|", 1)[0].split(" - ", 1)[0])
    return normalized, None


def _strip_tags(fragment: str) -> str | None:
    text = html.unescape(re.sub(r"<[^>]+>", " ", fragment))
    return _clean_text(text)


def _meta_content(document: str, *names: str) -> str | None:
    for name in names:
        pattern = re.compile(
            rf"<meta[^>]+(?:property|name)=['\"]{re.escape(name)}['\"][^>]+content=['\"]([^'\"]+)['\"]",
            re.IGNORECASE,
        )
        match = pattern.search(document)
        if match:
            value = _clean_text(html.unescape(match.group(1)))
            if value:
                return value
    return None


def _first_tag_text(document: str, tag: str, class_fragment: str | None = None) -> str | None:
    if class_fragment:
        pattern = re.compile(
            rf"<{tag}[^>]+class=['\"][^'\"]*{re.escape(class_fragment)}[^'\"]*['\"][^>]*>(.*?)</{tag}>",
            re.IGNORECASE | re.DOTALL,
        )
    else:
        pattern = re.compile(rf"<{tag}[^>]*>(.*?)</{tag}>", re.IGNORECASE | re.DOTALL)
    match = pattern.search(document)
    return _strip_tags(match.group(1)) if match else None


def extract_profile_fields_from_html(document: str) -> dict[str, str | None]:
    """Small fixture-friendly parser; runtime scraping uses Playwright selectors."""
    name = _first_tag_text(document, "h1") or _meta_content(document, "og:title")
    headline = (
        _first_tag_text(document, "div", "text-body-medium")
        or _meta_content(document, "og:description", "description")
    )
    location = _first_tag_text(document, "span", "text-body-small")
    about = _first_tag_text(document, "section", "about")
    role_title, company = derive_role_company(headline)
    return {
        "name": name,
        "headline": headline,
        "role_title": role_title,
        "company": company,
        "location": location,
        "about": about,
    }


@dataclass(slots=True)
class LinkedInAlertTarget:
    person_id: str
    alert_id: str
    display_name: str
    x_handle: str | None
    primary_profile_url: str | None
    linkedin_url: str | None
    linkedin_url_source: str | None
    current_seed_follower_count: int

    def to_payload(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class LinkedInProfileFields:
    linkedin_url: str
    name: str | None
    headline: str | None
    role_title: str | None
    company: str | None
    location: str | None
    about: str | None

    def to_payload(self) -> dict[str, Any]:
        return asdict(self)


def _field_presence(fields: LinkedInProfileFields) -> str:
    values = {
        "name": fields.name,
        "headline": fields.headline,
        "role": fields.role_title,
        "company": fields.company,
        "location": fields.location,
        "about": fields.about,
    }
    return ", ".join(f"{key}={'yes' if _clean_text(value) else 'no'}" for key, value in values.items())


def _target_label(target: LinkedInAlertTarget) -> str:
    handle = f" @{target.x_handle}" if target.x_handle else ""
    return f"{target.display_name}{handle}"


class LinkedInAlertScraper:
    login_url = "https://www.linkedin.com/login"
    feed_url = "https://www.linkedin.com/feed/"

    def __init__(self, db: SupabaseDB | None = None, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self.db = db or SupabaseDB.from_settings(self.settings)
        self.agent_log: list[dict[str, str]] = []

    def _log(self, stage: str, message: str) -> None:
        entry = {"stage": stage, "message": message, "timestamp": _utc_now_iso()}
        self.agent_log.append(entry)
        logger.info("%s: %s", stage, message)

    def _x_profile_cache_path(self) -> Path:
        return Path(self.settings.local_db_path).parent / "x_profile_cache.json"

    def load_x_profile_cache(self) -> dict[str, dict[str, Any]]:
        path = self._x_profile_cache_path()
        if not path.exists():
            self._log("x_profile_cache", f"No X profile cache found at {path}; LinkedIn URL fallback will use database records only.")
            return {}
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            logger.exception("Could not read X profile cache at %s", path)
            self._log("x_profile_cache", f"Could not read X profile cache at {path}; continuing without cache fallback.")
            return {}
        if not isinstance(payload, dict):
            self._log("x_profile_cache", f"X profile cache at {path} is not an object; continuing without cache fallback.")
            return {}
        cache = {
            normalize_handle(key) or key.lower(): value
            for key, value in payload.items()
            if isinstance(value, dict)
        }
        self._log("x_profile_cache", f"Loaded X profile cache from {path} with {len(cache)} handle(s).")
        return cache

    def _linkedin_url_from_cache_entry(self, entry: dict[str, Any] | None) -> str | None:
        if not entry:
            return None

        def scan(value: Any) -> str | None:
            if isinstance(value, str):
                if _is_linkedin_profile_url(value):
                    return clean_linkedin_url(value)
                return None
            if isinstance(value, dict):
                for child in value.values():
                    found = scan(child)
                    if found:
                        return found
            if isinstance(value, list):
                for child in value:
                    found = scan(child)
                    if found:
                        return found
            return None

        return scan(entry)

    def resolve_linkedin_url(
        self,
        alert: dict[str, Any],
        latest_enrichment: dict[str, Any] | None,
        x_profile_cache: dict[str, dict[str, Any]],
    ) -> tuple[str | None, str | None]:
        for source, value in (
            ("discovered_person", alert.get("linkedin_url")),
            ("latest_enrichment", (latest_enrichment or {}).get("linkedin_url")),
        ):
            cleaned = clean_linkedin_url(value)
            if cleaned:
                return cleaned, source

        x_handle = normalize_handle(alert.get("x_handle"))
        cached_url = self._linkedin_url_from_cache_entry(x_profile_cache.get(x_handle or ""))
        if cached_url:
            return cached_url, "x_profile_cache"
        return None, None

    def select_targets(self, *, limit: int | None = None, missing_only: bool = True) -> list[LinkedInAlertTarget]:
        batch_limit = max(1, int(limit or self.settings.linkedin_scrape_batch_limit))
        threshold = self.db.get_seed_follow_alert_threshold()
        latest_by_person = self.db.list_latest_linkedin_enrichments_by_person()
        x_profile_cache = self.load_x_profile_cache()
        alert_rows = self.db.list_seed_follow_alerts()
        known_url_targets: list[LinkedInAlertTarget] = []
        missing_url_targets: list[LinkedInAlertTarget] = []
        below_threshold_count = 0
        fresh_context_count = 0

        self._log(
            "candidate_pool",
            f"Loaded {len(alert_rows)} seed-follow alert row(s); threshold={threshold}, batch_limit={batch_limit}, missing_only={missing_only}.",
        )
        for alert in alert_rows:
            follower_count = int(alert.get("current_seed_follower_count") or 0)
            if follower_count < threshold:
                below_threshold_count += 1
                continue
            person_id = str(alert.get("discovered_person_id") or "").strip()
            latest = latest_by_person.get(person_id)
            if missing_only and _has_profile_context(latest):
                fresh_context_count += 1
                continue
            linkedin_url, url_source = self.resolve_linkedin_url(alert, latest, x_profile_cache)
            x_handle = normalize_handle(alert.get("x_handle"))
            display_name = _clean_text(alert.get("display_name")) or (f"@{x_handle}" if x_handle else "Discovered person")
            target = LinkedInAlertTarget(
                person_id=person_id,
                alert_id=str(alert.get("id") or ""),
                display_name=display_name,
                x_handle=x_handle,
                primary_profile_url=alert.get("primary_profile_url"),
                linkedin_url=linkedin_url,
                linkedin_url_source=url_source,
                current_seed_follower_count=follower_count,
            )
            if target.linkedin_url:
                known_url_targets.append(target)
            else:
                missing_url_targets.append(target)
            if len(known_url_targets) >= batch_limit:
                break

        selected = (known_url_targets + missing_url_targets)[:batch_limit]
        self._log(
            "candidate_filter",
            (
                f"Filtered candidates: below_threshold={below_threshold_count}, "
                f"already_fresh={fresh_context_count}, with_linkedin_url={len(known_url_targets)}, "
                f"missing_linkedin_url={len(missing_url_targets)}, selected={len(selected)}."
            ),
        )
        return selected

    def _storage_state_path(self) -> Path:
        path = Path(self.settings.linkedin_storage_state_path)
        if not path.is_absolute():
            path = Path.cwd() / path
        return path

    def _new_context(self, browser: Browser) -> BrowserContext:
        storage_path = self._storage_state_path()
        if storage_path.exists():
            self._log("browser_context", f"Loaded LinkedIn browser storage state from {storage_path}.")
            return browser.new_context(storage_state=str(storage_path))
        self._log("browser_context", f"No LinkedIn browser storage state at {storage_path}; starting clean context.")
        return browser.new_context()

    @staticmethod
    def _wait_for_network(page: Page) -> None:
        try:
            page.wait_for_load_state("networkidle", timeout=15_000)
        except PlaywrightTimeoutError:
            pass

    @staticmethod
    def _is_login_or_checkpoint(page: Page) -> bool:
        url = page.url.lower()
        if "linkedin.com/login" in url or "/checkpoint/" in url:
            return True
        try:
            return page.locator("#username").count() > 0
        except Exception:
            return False

    def _login(self, page: Page) -> None:
        self._log("login", "Authenticating LinkedIn browser session with LI_USERNAME.")
        page.goto(self.login_url, wait_until="domcontentloaded", timeout=45_000)
        self._log("login", "LinkedIn login page loaded; filling username/password fields from environment.")
        page.locator("#username").fill(self.settings.li_username)
        page.locator("#password").fill(self.settings.li_password)
        page.locator("button[type='submit']").click()
        self._wait_for_network(page)
        if "/checkpoint/" in page.url.lower():
            raise RuntimeError("LinkedIn login checkpoint is blocking the native scraper.")

    def _ensure_authenticated(self, context: BrowserContext) -> None:
        page = context.new_page()
        try:
            self._log("auth_check", "Opening LinkedIn feed to verify stored session.")
            page.goto(self.feed_url, wait_until="domcontentloaded", timeout=45_000)
            self._wait_for_network(page)
            if self._is_login_or_checkpoint(page):
                self._log("auth_check", "LinkedIn session requires login or checkpoint handling.")
                self._login(page)
            else:
                self._log("auth_check", "LinkedIn feed loaded without login redirect; session is usable.")
            storage_path = self._storage_state_path()
            storage_path.parent.mkdir(parents=True, exist_ok=True)
            context.storage_state(path=str(storage_path))
            self._log("login", f"LinkedIn session state persisted at {storage_path}.")
        finally:
            page.close()

    @staticmethod
    def _first_text(page: Page, selectors: list[str]) -> str | None:
        for selector in selectors:
            try:
                locator = page.locator(selector).first
                if locator.count() <= 0:
                    continue
                value = _clean_text(locator.inner_text(timeout=5_000))
                if value:
                    return value
            except Exception:
                continue
        return None

    def _extract_profile_fields(self, page: Page, linkedin_url: str) -> LinkedInProfileFields:
        name = self._first_text(
            page,
            [
                "main h1",
                ".pv-text-details__left-panel h1",
                "h1.text-heading-xlarge",
            ],
        )
        headline = self._first_text(
            page,
            [
                "div.text-body-medium.break-words",
                ".pv-text-details__left-panel div.text-body-medium",
                "main h1 + div",
            ],
        )
        location = self._first_text(
            page,
            [
                ".pv-text-details__left-panel span.text-body-small.inline",
                ".text-body-small.inline.t-black--light.break-words",
                "span.text-body-small",
            ],
        )
        about = self._first_text(
            page,
            [
                "section:has(#about) .inline-show-more-text span[aria-hidden='true']",
                "section:has(div#about) span[aria-hidden='true']",
            ],
        )
        role_title, company = derive_role_company(headline)
        return LinkedInProfileFields(
            linkedin_url=linkedin_url,
            name=name,
            headline=headline,
            role_title=role_title,
            company=company,
            location=location,
            about=about,
        )

    def persist_profile(self, target: LinkedInAlertTarget, fields: LinkedInProfileFields) -> dict[str, Any]:
        payload = {
            "target": target.to_payload(),
            "profile": fields.to_payload(),
            "scrapedAt": _utc_now_iso(),
            "source": NATIVE_LINKEDIN_SOURCE,
        }
        return self.db.insert_linkedin_enrichment_event(
            discovered_person_id=target.person_id,
            linkedin_url=fields.linkedin_url,
            headline=fields.headline,
            role_title=fields.role_title,
            company=fields.company,
            location=fields.location,
            source=NATIVE_LINKEDIN_SOURCE,
            raw_payload=payload,
            observed_at=payload["scrapedAt"],
        )

    def _process_target(self, context: BrowserContext, target: LinkedInAlertTarget) -> dict[str, Any]:
        if not target.linkedin_url:
            raise RuntimeError("LinkedIn URL missing.")
        page = context.new_page()
        try:
            label = _target_label(target)
            self._log("open_profile", f"{label}: opening LinkedIn profile {target.linkedin_url}.")
            page.goto(target.linkedin_url, wait_until="domcontentloaded", timeout=45_000)
            self._wait_for_network(page)
            if self._is_login_or_checkpoint(page):
                raise RuntimeError("LinkedIn redirected to login/checkpoint while opening profile.")
            self._log("profile_loaded", f"{label}: profile DOM loaded at {page.url}.")
            fields = self._extract_profile_fields(page, target.linkedin_url)
            self._log("extract_profile", f"{label}: extracted fields ({_field_presence(fields)}).")
            event = self.persist_profile(target, fields)
            self._log(
                "persist_enrichment",
                f"{label}: wrote linkedin_enrichment_events id={event.get('id')} headline={_short_text(fields.headline) or 'empty'}.",
            )
            return {
                "personId": target.person_id,
                "xHandle": target.x_handle,
                "linkedinUrl": target.linkedin_url,
                "eventId": event.get("id"),
                "headline": fields.headline,
                "roleTitle": fields.role_title,
                "company": fields.company,
                "location": fields.location,
            }
        finally:
            page.close()

    def _process_target_public(self, target: LinkedInAlertTarget) -> dict[str, Any]:
        if not target.linkedin_url:
            raise RuntimeError("LinkedIn URL missing.")
        label = _target_label(target)
        self._log("open_profile", f"{label}: HTTP GET public LinkedIn profile {target.linkedin_url}.")
        response = requests.get(
            target.linkedin_url,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
                ),
                "Accept-Language": "en-US,en;q=0.9",
            },
            timeout=20,
        )
        self._log("profile_loaded", f"{label}: LinkedIn public response status={response.status_code}, bytes={len(response.text)}.")
        response.raise_for_status()
        parsed = extract_profile_fields_from_html(response.text)
        fields = LinkedInProfileFields(
            linkedin_url=target.linkedin_url,
            name=parsed.get("name"),
            headline=parsed.get("headline"),
            role_title=parsed.get("role_title"),
            company=parsed.get("company"),
            location=parsed.get("location"),
            about=parsed.get("about"),
        )
        self._log("extract_profile", f"{label}: parsed public metadata ({_field_presence(fields)}).")
        event = self.persist_profile(target, fields)
        self._log(
            "persist_enrichment",
            f"{label}: wrote linkedin_enrichment_events id={event.get('id')} headline={_short_text(fields.headline) or 'empty'}.",
        )
        return {
            "personId": target.person_id,
            "xHandle": target.x_handle,
            "linkedinUrl": target.linkedin_url,
            "eventId": event.get("id"),
            "headline": fields.headline,
            "roleTitle": fields.role_title,
            "company": fields.company,
            "location": fields.location,
        }

    def _delay_between_targets(self) -> None:
        minimum = max(0, int(self.settings.linkedin_min_delay_seconds))
        maximum = max(minimum, int(self.settings.linkedin_max_delay_seconds))
        delay = random.randint(minimum, maximum)
        if delay > 0:
            self._log("rate_limit", f"Waiting {delay}s before the next LinkedIn profile.")
            time.sleep(delay)

    def run(self, *, limit: int | None = None, missing_only: bool = True) -> dict[str, Any]:
        self.agent_log = []
        requested_limit = max(1, int(limit or self.settings.linkedin_scrape_batch_limit))
        threshold = self.db.get_seed_follow_alert_threshold()
        has_linkedin_credentials = bool(self.settings.li_username and self.settings.li_password)
        self._log(
            "run_start",
            (
                "Native LinkedIn enrichment started; "
                f"limit={requested_limit}, missing_only={missing_only}, threshold={threshold}, "
                f"credentials={'present' if has_linkedin_credentials else 'missing'}, "
                f"public_fallback={'on' if self.settings.linkedin_public_scrape else 'off'}."
            ),
        )
        targets = self.select_targets(limit=requested_limit, missing_only=missing_only)
        self._log(
            "target_selection",
            f"Selected {len(targets)} alert-qualified LinkedIn enrichment target(s) from the {threshold}+ source inbox.",
        )
        for index, target in enumerate(targets, start=1):
            if target.linkedin_url:
                self._log(
                    "url_resolved",
                    (
                        f"{index}/{len(targets)} {_target_label(target)}: passed with "
                        f"{target.current_seed_follower_count} source(s); LinkedIn URL source={target.linkedin_url_source}; "
                        f"url={target.linkedin_url}."
                    ),
                )
            else:
                self._log(
                    "url_resolution_failed",
                    (
                        f"{index}/{len(targets)} {_target_label(target)}: passed with "
                        f"{target.current_seed_follower_count} source(s), but no LinkedIn URL was found."
                    ),
                )

        enriched_profiles: list[dict[str, Any]] = []
        skipped_profiles: list[dict[str, Any]] = []
        errors: list[dict[str, Any]] = []
        scrape_targets: list[LinkedInAlertTarget] = []

        for target in targets:
            if target.linkedin_url:
                scrape_targets.append(target)
                continue
            skipped_profiles.append(
                {
                    "personId": target.person_id,
                    "xHandle": target.x_handle,
                    "reason": "missing_linkedin_url",
                }
            )
            self._log(
                "missing_linkedin_url",
                f"No LinkedIn URL found for {target.display_name}; skipping instead of guessing.",
            )

        if not targets:
            return self._payload(
                status="no_targets",
                processed=0,
                enriched_profiles=enriched_profiles,
                skipped_profiles=skipped_profiles,
                errors=errors,
                message="No alert-qualified profiles need LinkedIn enrichment.",
            )

        if not scrape_targets:
            return self._payload(
                status="no_linkedin_urls",
                processed=len(targets),
                enriched_profiles=enriched_profiles,
                skipped_profiles=skipped_profiles,
                errors=errors,
                message="No selected profiles had known LinkedIn URLs.",
            )

        use_public_scrape = bool(self.settings.linkedin_public_scrape and not has_linkedin_credentials)

        try:
            if use_public_scrape:
                self._log(
                    "public_scrape",
                    "LI_USERNAME/LI_PASSWORD are not configured; using public LinkedIn profile metadata fallback.",
                )
                for target in scrape_targets:
                    try:
                        enriched_profiles.append(self._process_target_public(target))
                    except Exception as exc:
                        logger.exception("Public LinkedIn enrichment failed for %s", target.display_name)
                        errors.append(
                            {
                                "personId": target.person_id,
                                "xHandle": target.x_handle,
                                "linkedinUrl": target.linkedin_url,
                                "error": str(exc),
                            }
                        )
                        self._log("profile_error", f"Public LinkedIn enrichment failed for {target.display_name}: {exc}")
            else:
                validate_settings(self.settings, "linkedin")
                with sync_playwright() as p:
                    self._log("browser_launch", f"Launching Chromium for LinkedIn scrape; headless={self.settings.linkedin_headless}.")
                    browser: Browser = p.chromium.launch(headless=self.settings.linkedin_headless)
                    context = self._new_context(browser)
                    try:
                        self._ensure_authenticated(context)
                        for index, target in enumerate(scrape_targets):
                            try:
                                enriched_profiles.append(self._process_target(context, target))
                            except Exception as exc:
                                logger.exception("Native LinkedIn enrichment failed for %s", target.display_name)
                                errors.append(
                                    {
                                        "personId": target.person_id,
                                        "xHandle": target.x_handle,
                                        "linkedinUrl": target.linkedin_url,
                                        "error": str(exc),
                                    }
                                )
                                self._log("profile_error", f"LinkedIn enrichment failed for {target.display_name}: {exc}")
                            if index < len(scrape_targets) - 1:
                                self._delay_between_targets()
                        self._storage_state_path().parent.mkdir(parents=True, exist_ok=True)
                        context.storage_state(path=str(self._storage_state_path()))
                    finally:
                        context.close()
                        browser.close()
        except Exception as exc:
            logger.exception("Native LinkedIn enrichment run failed")
            errors.append({"error": str(exc), "reason": "run_failed"})
            self._log("run_error", f"Native LinkedIn enrichment failed: {exc}")
            return self._payload(
                status="error",
                processed=len(targets),
                enriched_profiles=enriched_profiles,
                skipped_profiles=skipped_profiles,
                errors=errors,
                message=str(exc),
                ok=False,
            )

        status = "completed_with_errors" if errors else "completed"
        message = (
            f"Native LinkedIn scraper enriched {len(enriched_profiles)} profile(s)."
            if enriched_profiles
            else "Native LinkedIn scraper completed without new profile context."
        )
        return self._payload(
            status=status,
            processed=len(targets),
            enriched_profiles=enriched_profiles,
            skipped_profiles=skipped_profiles,
            errors=errors,
            message=message,
        )

    def _payload(
        self,
        *,
        status: str,
        processed: int,
        enriched_profiles: list[dict[str, Any]],
        skipped_profiles: list[dict[str, Any]],
        errors: list[dict[str, Any]],
        message: str,
        ok: bool = True,
    ) -> dict[str, Any]:
        return {
            "ok": ok,
            "status": status,
            "processed": processed,
            "enriched": len(enriched_profiles),
            "skipped": len(skipped_profiles),
            "errors": errors,
            "message": message,
            "enrichedProfiles": enriched_profiles,
            "skippedProfiles": skipped_profiles,
            "agent_log": self.agent_log,
            "agentLog": self.agent_log,
        }


def run_linkedin_alert_enrichment(
    *,
    db: SupabaseDB | None = None,
    settings: Settings | None = None,
    limit: int | None = None,
    missing_only: bool = True,
) -> dict[str, Any]:
    scraper = LinkedInAlertScraper(db=db, settings=settings)
    return scraper.run(limit=limit, missing_only=missing_only)
