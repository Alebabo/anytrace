# traqr.ai Backend

Python backend for seed-source signal aggregation across Twitter/X, GitHub and LinkedIn, plus the traqr.ai Featherless triage agent.

## Setup

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r backend/requirements.txt
playwright install chromium
```

## Local storage

- Main backend database: `backend/local_data/traqr.db`
- Twitter snapshot state: `backend/local_data/twitter_state.db`
- Seed sources are imported automatically from `src/data/localSeedData.json`

## Commands

```bash
python -m backend.main run-twitter
python -m backend.main run-github
python -m backend.main run-scores
python -m backend.main run-linkedin-enrichment
python -m backend.main run-news
python -m backend.main run-triage
python -m backend.main run-alerts
python -m backend.main run-pipeline
python -m backend.main scheduler
python -m backend.main serve-api
```

## traqr.ai Featherless triage

The triage agent filters alert-qualified profiles at the 3+ source threshold, builds an evidence payload, calls Featherless through its OpenAI-compatible API, and stores the latest run in SQLite.

```bash
FEATHERLESS_API_KEY=
FEATHERLESS_BASE_URL=https://api.featherless.ai/v1
FEATHERLESS_TRIAGE_MODEL=meta-llama/Meta-Llama-3.1-8B-Instruct
FEATHERLESS_TRIAGE_MOCK=false
TRIAGE_CANDIDATE_LIMIT=25
SEED_FOLLOW_ALERT_THRESHOLD=3
SEED_SCAN_BATCH_LIMIT=8
GITHUB_TOKEN=
GITHUB_PUBLIC_LOOKUP=true
```

GitHub builder evidence is attached inside the triage run. Stored GitHub snapshots are used first; when `GITHUB_PUBLIC_LOOKUP=true`, the API may also resolve a candidate by exact GitHub username only if the public GitHub profile confirms the same X/Twitter handle. Stars are treated as builder evidence, not as a popularity score.

API endpoints:

- `GET /health` returns storage, threshold, and Featherless readiness.
- `GET /triage/latest` returns the latest persisted run.
- `POST /triage/run` starts a new run and returns the ranked founder shortlist.

Set `FEATHERLESS_TRIAGE_MOCK=true` only for deterministic local fallback when no Featherless key is available.

## Native LinkedIn enrichment

The active LinkedIn flow is now native Playwright scraping, not Make. It targets alert-qualified seed-follow profiles, writes to `linkedin_enrichment_events` with `source='linkedin_native_scraper'`, and returns an agent log for the UI.

```bash
LI_USERNAME=
LI_PASSWORD=
LINKEDIN_STORAGE_STATE_PATH=backend/local_data/linkedin_state.json
LINKEDIN_HEADLESS=true
LINKEDIN_PUBLIC_SCRAPE=true
LINKEDIN_SCRAPE_BATCH_LIMIT=10
LINKEDIN_MIN_DELAY_SECONDS=30
LINKEDIN_MAX_DELAY_SECONDS=90
```

API endpoint:

- `POST /run-linkedin-enrichment` starts the native scraper and returns `processed`, `enriched`, `skipped`, `errors`, and `agent_log`.

When `LI_USERNAME` / `LI_PASSWORD` are not configured, known LinkedIn URLs use a public profile metadata fallback so the Signal Inbox demo still produces enrichment.

## Notes

- Twitter/X scraping uses your own Playwright script in [scrape_following.py](../scrape_following.py).
- `TWEETAPI_KEY` is the only required X API key when you run the hosted API-based X flow.
- TweetAPI scans fetch at least `TWEETAPI_INCREMENTAL_MIN_PAGES` pages before stopping at the last known handle, and run a deeper `TWEETAPI_MAX_PAGES` pass every `TWEETAPI_DEEP_SCAN_INTERVAL_HOURS` hours.
- GitHub-to-X relationship verification reuses the same `TweetAPI` following endpoints instead of a second X provider.
- LinkedIn enrichment runs only for alert-qualified seed-follow profiles and skips unknown LinkedIn URLs instead of guessing.
- The first Twitter baseline run stores follow snapshots and writes VC-follow relations with a backdated `first_seen_at` so they do not immediately trigger week-based alerts.
