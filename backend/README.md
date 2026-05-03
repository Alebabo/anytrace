# Anytrace Backend

Python backend for VC-signal aggregation across Twitter/X, GitHub and LinkedIn.

## Setup

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r backend/requirements.txt
playwright install chromium
```

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
- LinkedIn scraping runs only for candidates scoring `>= 3` on the current day.
- The first Twitter baseline run stores follow snapshots and writes VC-follow relations with a backdated `first_seen_at` so they do not immediately trigger week-based alerts.
