# Anytrace v1.1

Anytrace is a Supabase-backed frontend for VC and scout teams.

- `Main`: weekly top picks
- `Graph`: signal graph scoped to the user's selected VCs
- `Watchlist`: personal VC selection plus tracked people
- `Settings`: magic-link auth, demo mode, trial state, billing readiness

## Local development

1. Install dependencies

```bash
npm install
```

2. Copy the env file and add your Supabase values

```bash
cp .env.example .env
```

3. Link the repo to your Anytrace Supabase project

```bash
supabase link --project-ref mfwqhsfmgwzvkodgkrgd
```

4. Apply all Supabase migrations

- `supabase/migrations/20260502093000_anytrace_v1.sql`
- `supabase/migrations/20260502173000_anytrace_v11_watchlists_and_sync.sql`
- `supabase/migrations/20260502190000_anytrace_default_vc_catalog.sql`

5. Start the app

```bash
npm run dev
```

## Serverless backend

The repo now includes Vercel API routes for ingest and billing:

- `POST /api/sync/x`
- `POST /api/sync/github`
- `POST /api/sync/media-backfill`
- `POST /api/stripe/checkout`
- `POST /api/stripe/webhook`

The sync routes accept either:

- a signed-in Supabase bearer token for manual runs
- Vercel Cron requests
- `x-cron-secret: $CRON_SECRET` for non-Cron manual automation

Required server-side env vars:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TWITTERAPI_IO_KEY`
- `GITHUB_TOKEN`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

Useful optional env vars:

- `TWITTERAPI_IO_MIN_INTERVAL_MS`
- `X_FOLLOWINGS_PAGE_SIZE`
- `X_MAX_FOLLOWING_PAGES_PER_SYNC`
- `X_MAX_VCS_PER_SYNC`
- `GITHUB_SEARCH_RESULT_LIMIT`
- `GITHUB_VIRAL_STAR_DELTA_THRESHOLD`
- `STRIPE_PRO_PRICE_USD`
- `CRON_SECRET`

`vercel.json` schedules the three sync routes daily by default.

## Notes

- The graph only shows signals from the VCs a user selected in Watchlist.
- Demo mode bypasses Magic Link locally and uses seeded Anytrace data.
- X sync now snapshots full following lists and stores only new-follow diffs as signals.
- GitHub sync now searches for viral repositories, stores star deltas, and marks cross-referenced people as high-confidence.
- LinkedIn stays in the schema and UI links, but full ingest is deferred.
