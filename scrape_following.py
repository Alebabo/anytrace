from __future__ import annotations

import csv
import os
import random
import time
from pathlib import Path

from playwright.sync_api import sync_playwright
from playwright.sync_api import Error as PlaywrightError

YOUR_USERNAME = os.getenv("TWITTER_USERNAME", "")
YOUR_PASSWORD = os.getenv("TWITTER_PASSWORD", "")
YOUR_VERIFICATION = os.getenv("TWITTER_VERIFICATION", "")
TARGET_ACCOUNT = os.getenv("TARGET_ACCOUNT", "")
OUTPUT_FILE = os.getenv("OUTPUT_FILE", "twitter_following.csv")
MAX_SCROLLS = int(os.getenv("TWITTER_MAX_SCROLLS", "60"))
USE_CHROME_SESSION = os.getenv("TWITTER_USE_CHROME_SESSION", "").strip().lower() in {"1", "true", "yes"}
CHROME_USER_DATA_DIR = os.getenv(
    "TWITTER_CHROME_USER_DATA_DIR",
    str(Path.home() / "AppData" / "Local" / "Google" / "Chrome" / "User Data"),
)
CHROME_PROFILE = os.getenv("TWITTER_CHROME_PROFILE", "Default")

DESKTOP_CHROME_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/136.0.0.0 Safari/537.36"
)

TYPE_DELAY_MS = (70, 145)
STEP_PAUSE_MS = (450, 1350)


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


def _write_debug_artifacts(page, name: str) -> None:
    debug_dir = Path("backend") / "outputs" / "debug"
    debug_dir.mkdir(parents=True, exist_ok=True)
    safe_name = "".join(ch if ch.isalnum() or ch in {"-", "_"} else "_" for ch in name)
    screenshot_path = debug_dir / f"{safe_name}.png"
    html_path = debug_dir / f"{safe_name}.html"
    try:
        page.screenshot(path=str(screenshot_path), full_page=True)
    except Exception:
        pass
    try:
        html_path.write_text(page.content(), encoding="utf-8")
    except Exception:
        pass


def _human_pause(page, min_ms: int | None = None, max_ms: int | None = None) -> None:
    lower = STEP_PAUSE_MS[0] if min_ms is None else min_ms
    upper = STEP_PAUSE_MS[1] if max_ms is None else max_ms
    page.wait_for_timeout(random.randint(lower, upper))


def _get_first_value(page, selectors: list[str]) -> str:
    for selector in selectors:
        locator = page.locator(selector).first
        if locator.count() == 0:
            continue
        try:
            return locator.input_value(timeout=500)
        except Exception:
            continue
    return ""


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


def _type_first(page, selectors: list[str], value: str) -> bool:
    for selector in selectors:
        locator = page.locator(selector).first
        if locator.count() == 0:
            continue
        try:
            locator.click(force=True)
            page.wait_for_timeout(random.randint(100, 280))
            locator.press("Control+A")
            locator.press("Backspace")
            locator.type(value, delay=random.randint(*TYPE_DELAY_MS))
            page.wait_for_timeout(random.randint(180, 420))

            typed_value = locator.input_value(timeout=500).strip()
            if typed_value == value.strip():
                return True

            locator.evaluate(
                """(el, nextValue) => {
                    el.focus();
                    el.value = nextValue;
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                }""",
                value,
            )
            page.wait_for_timeout(random.randint(180, 420))
            typed_value = locator.input_value(timeout=500).strip()
            if typed_value == value.strip():
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


def _click_first_force(page, selectors: list[str]) -> bool:
    for selector in selectors:
        locator = page.locator(selector).first
        if locator.count() == 0:
            continue
        try:
            locator.click(force=True)
            return True
        except Exception:
            continue
    return False


def _click_text_via_dom(page, texts: list[str]) -> bool:
    script = """
    (labels) => {
        const elements = Array.from(document.querySelectorAll("button, div[role='button'], a"));
        for (const label of labels) {
            const match = elements.find((el) => el.innerText && el.innerText.trim() === label);
            if (match) {
                match.click();
                return true;
            }
        }
        return false;
    }
    """
    try:
        return bool(page.evaluate(script, texts))
    except Exception:
        return False


def _wait_for_any(page, selectors: list[str], timeout_ms: int = 15000) -> bool:
    deadline = time.monotonic() + timeout_ms / 1000
    while time.monotonic() < deadline:
        for selector in selectors:
            locator = page.locator(selector).first
            try:
                if locator.count() > 0 and locator.is_visible(timeout=250):
                    return True
            except Exception:
                continue
        page.wait_for_timeout(250)
    return False


def _press_enter_first(page, selectors: list[str]) -> bool:
    for selector in selectors:
        locator = page.locator(selector).first
        try:
            if locator.count() == 0:
                continue
            locator.press("Enter")
            return True
        except Exception:
            continue
    return False


def _advance_username_step(page, username_selectors: list[str]) -> bool:
    next_selectors = [
        "button:has-text('Next')",
        "div[role='button']:has-text('Next')",
        "button:has-text('Weiter')",
        "div[role='button']:has-text('Weiter')",
        "div[role='button'][data-testid='LoginForm_Login_Button']",
    ]

    _human_pause(page)

    if not _get_first_value(page, username_selectors).strip():
        return False

    if _click_first(page, next_selectors):
        return True

    if _press_enter_first(page, username_selectors):
        return True

    try:
        page.keyboard.press("Tab")
        page.wait_for_timeout(250)
        page.keyboard.press("Enter")
        return True
    except Exception:
        pass

    return _click_first_force(page, next_selectors)


def _handle_cookie_banner(page) -> None:
    selectors = [
        "button:has-text('Refuse non-essential cookies')",
        "button:has-text('Accept all cookies')",
        "div[role='button']:has-text('Refuse non-essential cookies')",
        "div[role='button']:has-text('Accept all cookies')",
    ]
    _click_first_force(page, selectors)
    _click_text_via_dom(page, ["Refuse non-essential cookies", "Accept all cookies"])
    page.wait_for_timeout(800)
    try:
        page.wait_for_function(
            """() => !document.body.innerText.includes('Refuse non-essential cookies')
            && !document.body.innerText.includes('Accept all cookies')""",
            timeout=2500,
        )
    except Exception:
        pass


def _open_sign_in_from_home(page, username_selectors: list[str]) -> bool:
    sign_in_selectors = [
        "a[href='/i/flow/login']",
        "a:has-text('Sign in')",
        "a:has-text('Log in')",
        "button:has-text('Sign in')",
        "button:has-text('Log in')",
        "div[role='button']:has-text('Sign in')",
        "div[role='button']:has-text('Log in')",
    ]

    for _ in range(3):
        if _wait_for_any(page, username_selectors, timeout_ms=1500):
            return True
        _handle_cookie_banner(page)
        clicked = _click_first_force(page, sign_in_selectors)
        if not clicked:
            clicked = _click_text_via_dom(page, ["Sign in", "Log in"])
        page.wait_for_timeout(1800 if clicked else 800)
        if _wait_for_any(page, username_selectors, timeout_ms=2500):
            return True
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
    _type_first(
        page,
        [
            "input[data-testid='ocfEnterTextTextInput']",
            "input[name='text']",
            "input[inputmode='text']",
        ],
        verification,
    )
    _human_pause(page, 350, 900)
    _click_first(
        page,
        [
            "button:has-text('Next')",
            "button:has-text('Weiter')",
            "div[role='button']:has-text('Next')",
            "div[role='button']:has-text('Weiter')",
        ],
    )


def _handle_additional_text_challenge(page, verification: str) -> bool:
    if not verification:
        return False

    text_input_selectors = [
        "input[data-testid='ocfEnterTextTextInput']",
        "input[name='text']",
        "input[inputmode='text']",
        "input[autocomplete='on']",
    ]

    if not _wait_for_any(page, text_input_selectors, timeout_ms=2500):
        return False

    filled = _type_first(page, text_input_selectors, verification)
    if not filled:
        return False

    _human_pause(page, 350, 900)
    advanced = _click_first(
        page,
        [
            "button:has-text('Next')",
            "button:has-text('Weiter')",
            "div[role='button']:has-text('Next')",
            "div[role='button']:has-text('Weiter')",
        ],
    )
    if not advanced:
        advanced = _press_enter_first(page, text_input_selectors)
    if advanced:
        page.wait_for_timeout(1500)
    return advanced


def _is_logged_in(page) -> bool:
    return _wait_for_any(
        page,
        [
            "a[href='/home']",
            "a[data-testid='AppTabBar_Home_Link']",
            "a[href='/compose/post']",
            "button[data-testid='SideNav_AccountSwitcher_Button']",
            "[data-testid='SideNav_NewTweet_Button']",
        ],
        timeout_ms=2500,
    )


def _login(page, username: str, password: str, verification: str) -> None:
    username_selectors = [
        "input[autocomplete='username']",
        "input[autocomplete='email']",
        "input[name='text']",
        "input[inputmode='text']",
        "input[spellcheck='false']",
    ]

    page.goto("https://x.com/login", wait_until="domcontentloaded")
    page.wait_for_timeout(2500)
    _handle_cookie_banner(page)
    if _is_logged_in(page):
        return

    if not _wait_for_any(page, username_selectors, timeout_ms=8000):
        page.goto("https://x.com/", wait_until="domcontentloaded")
        page.wait_for_timeout(2000)
        _handle_cookie_banner(page)
        if _is_logged_in(page):
            return
        _open_sign_in_from_home(page, username_selectors)

    if not _wait_for_any(page, username_selectors, timeout_ms=4000):
        if _is_logged_in(page):
            return
        _open_sign_in_from_home(page, username_selectors)

    if not _wait_for_any(page, username_selectors, timeout_ms=10000):
        _write_debug_artifacts(page, "twitter_login_username_missing")
        raise RuntimeError(f"Could not find Twitter/X username input. Current URL: {page.url}")

    if not _type_first(page, username_selectors, username):
        raise RuntimeError("Could not find Twitter/X username input.")
    _human_pause(page, 300, 700)

    advanced = _advance_username_step(page, username_selectors)
    if not advanced:
        raise RuntimeError("Could not advance after Twitter/X username step.")
    page.wait_for_timeout(1200)

    password_selectors = [
        "input[name='password']",
        "input[autocomplete='current-password']",
        "input[type='password']",
    ]

    if not _wait_for_any(page, password_selectors, timeout_ms=4000):
        _handle_optional_verification(page, verification)
        page.wait_for_timeout(1500)

    if not _wait_for_any(page, password_selectors, timeout_ms=6000):
        _handle_additional_text_challenge(page, verification)
        page.wait_for_timeout(1500)

    if not _wait_for_any(page, password_selectors, timeout_ms=4000):
        _click_first(
            page,
            [
                "button:has-text('Next')",
                "div[role='button']:has-text('Next')",
                "button:has-text('Weiter')",
                "div[role='button']:has-text('Weiter')",
            ],
        )
        page.wait_for_timeout(1500)

    if not _wait_for_any(page, password_selectors, timeout_ms=10000):
        _write_debug_artifacts(page, "twitter_login_password_missing")
        raise RuntimeError(f"Could not find Twitter/X password input. Current URL: {page.url}")
    if not _type_first(page, password_selectors, password):
        raise RuntimeError("Could not find Twitter/X password input.")
    _human_pause(page, 800, 1800)
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
    use_chrome_session = USE_CHROME_SESSION

    if not use_chrome_session and (not login_username or not login_password):
        raise RuntimeError("Twitter/X credentials are required.")

    with sync_playwright() as playwright:
        browser = None
        if use_chrome_session:
            try:
                context = playwright.chromium.launch_persistent_context(
                    user_data_dir=CHROME_USER_DATA_DIR,
                    channel="chrome",
                    headless=False,
                    user_agent=DESKTOP_CHROME_UA,
                    viewport={"width": 1440, "height": 1024},
                    locale="en-US",
                    args=[f"--profile-directory={CHROME_PROFILE}"],
                )
            except PlaywrightError as exc:
                raise RuntimeError(
                    "Could not attach to the local Chrome session. Close all regular Chrome windows "
                    "or point TWITTER_CHROME_USER_DATA_DIR / TWITTER_CHROME_PROFILE at a separate profile."
                ) from exc
            page = context.pages[0] if context.pages else context.new_page()
        else:
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
            if browser is not None:
                browser.close()


if __name__ == "__main__":
    scrape_following()
