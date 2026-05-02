# Anytrace v1

Anytrace is now a Supabase-backed frontend for VC and scout teams. The app uses only the new Supabase data model and keeps the current Anytrace graph feel with a slimmer product surface:

- `Main`: weekly top picks
- `Graph`: VC-to-person signal graph
- `Watchlist`: tracked people and identities
- `Settings`: magic-link auth, demo mode, trial state, billing readiness

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

For magic-link auth, set `VITE_SITE_URL` to the exact URL Supabase should redirect back to.
Examples:

- local: `http://localhost:8080`
- Vercel: `https://your-app.vercel.app`

## Notes

- The app no longer uses the old external API flow or old Supabase functions.
- Demo mode can bypass Magic Link locally and uses seeded Anytrace data.
- Stripe checkout is intentionally not live yet; the app already models trial and subscription state in Supabase and gates access after trial expiry.
- LinkedIn is present in the schema and UI profile links, but full ingestion is deferred.
