# Anytrace.ai

Anytrace.ai runs on the existing Anytrace local-first stack. The frontend loads investor seed data from a local file, the backend persists signal state in SQLite, and the Featherless triage agent turns 3+ source alerts into an evidence-first VC sourcing shortlist.

## Frontend env

Create a `.env` with:

```bash
VITE_SITE_URL=http://localhost:8080
VITE_ANYTRACE_BACKEND_URL=http://127.0.0.1:8767
ANYTRACE_LOCAL_DB_PATH=backend/local_data/anytrace.db
SEED_FOLLOW_ALERT_THRESHOLD=3
SEED_SCAN_BATCH_LIMIT=8
FEATHERLESS_API_KEY=
FEATHERLESS_BASE_URL=https://api.featherless.ai/v1
FEATHERLESS_TRIAGE_MODEL=meta-llama/Meta-Llama-3.1-8B-Instruct
FEATHERLESS_TRIAGE_MOCK=false
TRIAGE_CANDIDATE_LIMIT=25
LI_USERNAME=
LI_PASSWORD=
LINKEDIN_STORAGE_STATE_PATH=backend/local_data/linkedin_state.json
LINKEDIN_HEADLESS=true
LINKEDIN_PUBLIC_SCRAPE=true
LINKEDIN_SCRAPE_BATCH_LIMIT=10
LINKEDIN_MIN_DELAY_SECONDS=30
LINKEDIN_MAX_DELAY_SECONDS=90
```

Set `FEATHERLESS_TRIAGE_MOCK=true` only for local demo fallback without a Featherless key.

Do not commit real secrets in `.env`. Use Vultr environment variables or a local untracked env file for `FEATHERLESS_API_KEY`, `LI_USERNAME`, and `LI_PASSWORD`.

## Native LinkedIn enrichment

- The `/triage` button `Refresh LinkedIn Context` calls the native backend endpoint `POST /run-linkedin-enrichment`.
- The scraper enriches alert-qualified profiles that crossed the configured seed-source threshold.
- LinkedIn URLs are resolved from `discovered_people`, prior enrichment events, then `backend/local_data/x_profile_cache.json`.
- If `LI_USERNAME` / `LI_PASSWORD` are missing, known LinkedIn URLs still use a public profile metadata fallback for the demo.
- If no LinkedIn URL is known, the agent log records `missing_linkedin_url` and the scraper skips the profile instead of guessing.
- Playwright stores session cookies in `LINKEDIN_STORAGE_STATE_PATH` so the demo avoids repeated logins.

## Data source

- Seed investors are generated from `C:\Users\User\Downloads\investors_clean.csv` into `src/data/localSeedData.json`.
- Manual additions and removals are stored locally in browser storage.
- Backend scans and local API now persist into `backend/local_data/anytrace.db`.
- Resetting the local workspace deletes those local overlays and restores the seed file state.

## Local development

```bash
npm install
npm run dev
```

Start the backend API in another terminal:

```bash
python -m backend.main serve-api
```

Run the Anytrace.ai triage agent:

```bash
python -m backend.main run-triage
```

Or use the app route `/triage` and click `Re-rank Leads`.

Run native LinkedIn enrichment:

```bash
python -m backend.main run-linkedin-enrichment
```

## Vultr deployment checklist

- Provision a Vultr Ubuntu VM and open HTTP/HTTPS plus the backend port if you expose it directly.
- Install Node.js, Python, and a process manager such as systemd or Docker Compose.
- Set the environment variables above, especially `VITE_ANYTRACE_BACKEND_URL`, `ANYTRACE_LOCAL_DB_PATH`, `FEATHERLESS_API_KEY`, `LI_USERNAME`, and `LI_PASSWORD`.
- Build the frontend with `npm run build` and serve `dist/` with nginx.
- Run the backend with `python -m backend.main serve-api` and persist `backend/local_data/` on disk.
- Verify `GET /health`, run `POST /run-linkedin-enrichment`, then run one full `POST /triage/run` from the public URL.
