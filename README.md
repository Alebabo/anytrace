# traqr.ai

traqr.ai is an evidence-first venture signal product for VC teams, angels, scouts, and founder-relations teams. It watches curated investor networks, detects when multiple trusted seed accounts converge on the same founder or builder, and turns those public signals into traceable alerts, graph context, dossiers, and AI-ranked sourcing shortlists.

The current MVP runs on a local-first stack: a React/Vite frontend loads curated investor seed data, a Python backend persists signal state in SQLite, and the Featherless triage agent ranks 3+ source alerts into an evidence-backed VC sourcing workflow.

## Tech stack

- Frontend: React, TypeScript, Vite, Tailwind CSS, Radix UI/shadcn-style components, React Router, TanStack Query, Recharts, and @xyflow/react for connection graphs.
- Backend: Python, SQLite, APScheduler, Playwright, requests, and a small HTTP API served by `backend.main`.
- AI and agent workflows: Featherless via an OpenAI-compatible API for founder triage, Google AI Studio/Gemini as part of the hackathon AI track and Agent Swarm demo narrative, and deterministic mock mode for reliable demos.
- Signal sources: X/Twitter follow data, GitHub builder evidence, LinkedIn enrichment, optional Crunchbase context, and curated local seed lists.
- Demo and integrations: Telegram Agent Swarm endpoints under `api/`, Vercel-compatible serverless handlers, and a static Traqr landing page.
- Deployment target: Vultr Ubuntu VM for the full frontend/backend stack, with local disk persistence for `backend/local_data/`.

## Frontend env

Create a `.env` with:

```bash
VITE_SITE_URL=http://localhost:8080
VITE_TRAQR_BACKEND_URL=http://127.0.0.1:8767
TRAQR_LOCAL_DB_PATH=backend/local_data/traqr.db
SEED_FOLLOW_ALERT_THRESHOLD=3
SEED_SCAN_BATCH_LIMIT=8
FEATHERLESS_API_KEY=
FEATHERLESS_BASE_URL=https://api.featherless.ai/v1
FEATHERLESS_TRIAGE_MODEL=meta-llama/Meta-Llama-3.1-8B-Instruct
FEATHERLESS_TRIAGE_MOCK=false
TRIAGE_CANDIDATE_LIMIT=25
GITHUB_TOKEN=
GITHUB_PUBLIC_LOOKUP=true
LI_USERNAME=
LI_PASSWORD=
LINKEDIN_STORAGE_STATE_PATH=backend/local_data/linkedin_state.json
LINKEDIN_HEADLESS=true
LINKEDIN_PUBLIC_SCRAPE=true
LINKEDIN_SCRAPE_BATCH_LIMIT=10
LINKEDIN_MIN_DELAY_SECONDS=30
LINKEDIN_MAX_DELAY_SECONDS=90
TWITTER_PROVIDER=auto
TWEETAPI_KEY=
TWEETAPI_PAGE_SIZE=100
TWEETAPI_MAX_PAGES=6
CRUNCHBASE_API_KEY=
TELEGRAM_BOT_TOKEN=
AGENT_SWARM_SEED_LIMIT=3
```

Set `FEATHERLESS_TRIAGE_MOCK=true` only for local demo fallback without a Featherless key.

Do not commit real secrets in `.env`. Use Vultr environment variables or a local untracked env file for `FEATHERLESS_API_KEY`, `TWEETAPI_KEY`, `GITHUB_TOKEN`, `LI_USERNAME`, `LI_PASSWORD`, `CRUNCHBASE_API_KEY`, and `TELEGRAM_BOT_TOKEN`.

## AI workflow

- Featherless receives the structured evidence payload for alert-qualified profiles and returns an explainable founder shortlist.
- The triage prompt emphasizes evidence, source traceability, founder relevance, GitHub builder proof, and why-now reasoning instead of black-box scoring.
- Google AI Studio/Gemini is represented in the Agent Swarm demo layer for the hackathon AI workflow and category alignment.
- Mock mode keeps the demo deterministic when model credentials are unavailable.

## Agent Swarm and Telegram demo

- The `/agent-swarm` route presents the end-to-end workflow: X seed-source scanning, LinkedIn enrichment, GitHub builder proof, Featherless ranking, and delivery.
- `api/agent-swarm-telegram.ts` sends selected founder top picks to Telegram.
- `api/agent-swarm-telegram-webhook.ts` supports a chat-triggered demo flow.
- Configure `TELEGRAM_BOT_TOKEN` and open the bot once so the endpoint can resolve a chat id.

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
- Backend scans and local API now persist into `backend/local_data/traqr.db`.
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

Run the traqr.ai triage agent:

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
- Install Node.js, Python, Playwright Chromium, and a process manager such as systemd or Docker Compose.
- Set the environment variables above, especially `VITE_TRAQR_BACKEND_URL`, `TRAQR_LOCAL_DB_PATH`, `FEATHERLESS_API_KEY`, `TWEETAPI_KEY`, `GITHUB_TOKEN`, `LI_USERNAME`, `LI_PASSWORD`, and `TELEGRAM_BOT_TOKEN`.
- Build the frontend with `npm run build` and serve `dist/` with nginx.
- Run the backend with `python -m backend.main serve-api` and persist `backend/local_data/` on disk.
- Verify `GET /health`, run `POST /run-linkedin-enrichment`, then run one full `POST /triage/run` from the public URL.
