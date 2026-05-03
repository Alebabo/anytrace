# Anytrace

Anytrace is a Vite frontend that reads VC data from Supabase and can trigger an external X scraper endpoint.

## Frontend env

Create a `.env` with:

```bash
VITE_SITE_URL=http://localhost:8080
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_TWITTER_SCRAPE_URL=...
```

## Local development

```bash
npm install
npm run dev
```

## Deployment shape

- Vercel deploys only the frontend.
- The X scrape button calls an external backend URL from `VITE_TWITTER_SCRAPE_URL`.
- Supabase is queried directly from the browser via the anon key.
