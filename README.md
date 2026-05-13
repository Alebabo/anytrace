# Anytrace

Anytrace now runs in local-first mode. The frontend loads investor seed data from a local file and stores manual workspace changes locally in the browser on this machine.

## Frontend env

Create a `.env` with:

```bash
VITE_SITE_URL=http://localhost:8080
VITE_ANYTRACE_BACKEND_URL=http://127.0.0.1:8766
ANYTRACE_LOCAL_DB_PATH=backend/local_data/anytrace.db
MAKE_LINKEDIN_WEBHOOK_URL=
MAKE_LINKEDIN_WEBHOOK_SECRET=
MAKE_LINKEDIN_BATCH_LIMIT=25
ANYTRACE_PUBLIC_API_BASE_URL=
SEED_FOLLOW_ALERT_THRESHOLD=2
```

## LinkedIn enrichment via Make

- The Inbox button `Enrich LinkedIn` posts alert-qualified X profiles to `MAKE_LINKEDIN_WEBHOOK_URL`.
- Send the same secret back from Make as `X-Anytrace-Secret` if `MAKE_LINKEDIN_WEBHOOK_SECRET` is set.
- Make should post results to `/linkedin-make/ingest` with fields like `personId`, `xHandle`, `linkedinUrl`, `headline`, `roleTitle`, `company`, and `location`.
- If Make needs a public callback URL, set `ANYTRACE_PUBLIC_API_BASE_URL` to your tunnel/API base URL.

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
