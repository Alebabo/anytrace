# Anytrace Backend

Python backend for seed-source signal aggregation across Twitter/X, GitHub and LinkedIn.

## Setup

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r backend/requirements.txt
playwright install chromium
```

## Local storage

- Main backend database: `backend/local_data/anytrace.db`
- Twitter snapshot state: `backend/local_data/twitter_state.db`
- Seed sources are imported automatically from `src/data/localSeedData.json`

## Commands

```bash
python -m backend.main run-twitter
python -m backend.main run-github
python -m backend.main run-scores
python -m backend.main run-linkedin
python -m backend.main run-news
python -m backend.main run-alerts
python -m backend.main run-pipeline
python -m backend.main scheduler
```

## Notes

- Twitter/X scraping uses your own Playwright script in [scrape_following.py](C:/Users/User/IdeaProjects/anytrace/scrape_following.py).
- `TWEETAPI_KEY` is the only required X API key when you run the hosted API-based X flow.
- TweetAPI scans fetch at least `TWEETAPI_INCREMENTAL_MIN_PAGES` pages before stopping at the last known handle, and run a deeper `TWEETAPI_MAX_PAGES` pass every `TWEETAPI_DEEP_SCAN_INTERVAL_HOURS` hours.
- GitHub-to-X relationship verification reuses the same `TweetAPI` following endpoints instead of a second X provider.
- LinkedIn scraping runs only for candidates scoring `>= 3` on the current day.
- The first Twitter baseline run stores follow snapshots and writes VC-follow relations with a backdated `first_seen_at` so they do not immediately trigger week-based alerts.
