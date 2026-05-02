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
cp .env.example .env.local
```

3. Apply both Supabase migrations

- `supabase/migrations/20260502093000_anytrace_v1.sql`
- `supabase/migrations/20260502173000_anytrace_v11_watchlists_and_sync.sql`

4. Start the app

```bash
npm run dev
```

## Sync functions

Anytrace now includes two scheduled sync functions:

- `sync-x-follows`
- `sync-github-signals`

They expect these server-side env vars in Supabase:

- `X_BEARER_TOKEN`
- `GITHUB_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- optional `GITHUB_IMPORTANCE_THRESHOLD`
- optional `GITHUB_STAR_DELTA_THRESHOLD`

Recommended scheduling:

- `sync-x-follows`: every 30-60 minutes
- `sync-github-signals`: every 2-6 hours

## Notes

- The graph only shows signals from the VCs a user selected in Watchlist.
- Demo mode bypasses Magic Link locally and uses seeded Anytrace data.
- X v1 focuses on new follows from selected VC accounts.
- GitHub v1 focuses on repo traction plus important new followers.
- LinkedIn stays in the schema and UI links, but full ingest is deferred.
