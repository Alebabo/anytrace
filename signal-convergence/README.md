# Anytrace v1

Anytrace is now a Supabase-backed frontend for VC/scout teams. The app keeps the existing Anytrace brand and graph feel, but the product surface is slimmer:

- `Main`: weekly top picks
- `Graph`: VC-to-person signal graph
- `Watchlist`: tracked people and identities
- `Settings`: magic-link auth, trial state, billing readiness

## Local development

1. Install dependencies:

```bash
npm install
```

2. Copy the env file and add your Supabase project values:

```bash
cp .env.example .env.local
```

3. Apply the Supabase migration and seed data from `supabase/migrations/20260502093000_anytrace_v1.sql`.

4. Start the app:

```bash
npm run dev
```

## Notes

- The old legacy API dependency has been removed from the active product flow.
- Stripe checkout is intentionally not live yet; the app already models trial/subscription state in Supabase and gates access after trial expiry.
- LinkedIn is present in the schema and UI profile links, but full ingestion is deferred.
