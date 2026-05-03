from __future__ import annotations

import csv
import os
from pathlib import Path

from playwright.sync_api import sync_playwright

YOUR_USERNAME = os.getenv("TWITTER_USERNAME", "")
YOUR_PASSWORD = os.getenv("TWITTER_PASSWORD", "")
YOUR_VERIFICATION = os.getenv("TWITTER_VERIFICATION", "")
TARGET_ACCOUNT = os.getenv("TARGET_ACCOUNT", "")
OUTPUT_FILE = os.getenv("OUTPUT_FILE", "twitter_following.csv")
MAX_SCROLLS = int(os.getenv("TWITTER_MAX_SCROLLS", "60"))

DESKTOP_CHROME_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/136.0.0.0 Safari/537.36"
)


def _write_csv(rows: list[dict[str, str]], output_file: str) -> None:
    output_path = Path(output_file)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=["username", "display_name", "bio", "profile_url"],
        )
        writer.writeheader()
        writer.writerows(rows)


def _fill_first(page, selectors: list[str], value: str) -> bool:
    for selector in selectors:
        locator = page.locator(selector).first
        if locator.count() == 0:
            continue
        try:
            locator.fill(value)
            return True
        except Exception:
            continue
    return False


def _click_first(page, selectors: list[str]) -> bool:
    for selector in selectors:
        locator = page.locator(selector).first
        if locator.count() == 0:
            continue
        try:
            locator.click()
            return True
        except Exception:
            continue
    return False


def _handle_optional_verification(page, verification: str) -> None:
    if not verification:
        return
    try:
        page.wait_for_timeout(1500)
        visible = (
            page.locator("input[data-testid='ocfEnterTextTextInput']")
            .first
            .is_visible(timeout=2000)
        )
    except Exception:
        visible = False
    if not visible:
        return
    _fill_first(
        page,
        [
            "input[data-testid='ocfEnterTextTextInput']",
            "input[name='text']",
            "input[inputmode='text']",
        ],
        verification,
    )
    _click_first(
        page,
        [
            "button:has-text('Next')",
            "button:has-text('Weiter')",
            "div[role='button']:has-text('Next')",
            "div[role='button']:has-text('Weiter')",
        ],
    )


def _login(page, username: str, password: str, verification: str) -> None:
    page.goto("https://x.com/i/flow/login", wait_until="domcontentloaded")
    page.wait_for_timeout(2500)

    if not _fill_first(page, ["input[autocomplete='username']", "input[name='text']"], username):
        raise RuntimeError("Could not find Twitter/X username input.")
    if not _click_first(
        page,
        [
            "button:has-text('Next')",
            "div[role='button']:has-text('Next')",
            "button:has-text('Weiter')",
            "div[role='button']:has-text('Weiter')",
        ],
    ):
        raise RuntimeError("Could not advance after Twitter/X username step.")

    _handle_optional_verification(page, verification)
    page.wait_for_timeout(1500)

    if not _fill_first(page, ["input[name='password']", "input[autocomplete='current-password']"], password):
        raise RuntimeError("Could not find Twitter/X password input.")
    if not _click_first(
        page,
        [
            "button:has-text('Log in')",
            "div[role='button']:has-text('Log in')",
            "button:has-text('Anmelden')",
            "div[role='button']:has-text('Anmelden')",
        ],
    ):
        raise RuntimeError("Could not submit Twitter/X login.")

    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2500)


def _extract_user_cells(page, seen: set[str]) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    cells = page.locator("[data-testid='UserCell']").all()
    for cell in cells:
        try:
            links = cell.locator("a[href^='/']").evaluate_all(
                """els => els
                .map(el => el.getAttribute('href'))
                .filter(Boolean)"""
            )
            username = ""
            profile_url = ""
            for href in links:
                parts = [part for part in str(href).split("/") if part]
                if not parts:
                    continue
                candidate = parts[0]
                if candidate.lower() in {"home", "i", "search", "settings"}:
                    continue
                username = candidate.lstrip("@")
                profile_url = f"https://x.com/{username}"
                break
            if not username or username.lower() in seen:
                continue

            display_name = ""
            bio = ""
            try:
                name_locator = cell.locator("[data-testid='UserName'] span").first
                if name_locator.count() > 0:
                    display_name = name_locator.inner_text().strip()
            except Exception:
                pass

            try:
                bio_locator = cell.locator("[data-testid='UserDescription']").first
                if bio_locator.count() > 0:
                    bio = bio_locator.inner_text().strip()
            except Exception:
                pass

            row = {
                "username": username,
                "display_name": display_name,
                "bio": bio,
                "profile_url": profile_url,
            }
            seen.add(username.lower())
            rows.append(row)
        except Exception:
            continue
    return rows


def _scrape(page, target_account: str, max_scrolls: int) -> list[dict[str, str]]:
    target = target_account.lstrip("@").strip()
    if not target:
        raise RuntimeError("TARGET_ACCOUNT is required.")

    page.goto(f"https://x.com/{target}/following", wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(3000)

    seen: set[str] = set()
    results: list[dict[str, str]] = []
    stale_scrolls = 0

    for _ in range(max_scrolls):
        before = len(results)
        results.extend(_extract_user_cells(page, seen))
        after = len(results)

        if after == before:
            stale_scrolls += 1
        else:
            stale_scrolls = 0

        if stale_scrolls >= 5:
            break

        page.keyboard.press("End")
        page.wait_for_timeout(2000)

    return results


def scrape_following(
    *,
    username: str | None = None,
    password: str | None = None,
    target_account: str | None = None,
    output_file: str | None = None,
    max_scrolls: int | None = None,
    verification: str | None = None,
) -> list[dict[str, str]]:
    login_username = username or YOUR_USERNAME
    login_password = password or YOUR_PASSWORD
    target = target_account or TARGET_ACCOUNT
    output = output_file or OUTPUT_FILE
    scroll_limit = max_scrolls if max_scrolls is not None else MAX_SCROLLS
    verify_value = verification if verification is not None else YOUR_VERIFICATION

    if not login_username or not login_password:
        raise RuntimeError("Twitter/X credentials are required.")

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=False)
        context = browser.new_context(
            user_agent=DESKTOP_CHROME_UA,
            viewport={"width": 1440, "height": 1024},
            locale="en-US",
        )
        page = context.new_page()
        try:
            _login(page, login_username, login_password, verify_value)
            rows = _scrape(page, target, scroll_limit)
            _write_csv(rows, output)
            return rows
        finally:
            context.close()
            browser.close()


if __name__ == "__main__":
    scrape_following()
