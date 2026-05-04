# Anytrace

Anytrace is a Vite frontend plus a small Python backend for VC signal collection from Supabase, X/Twitter, GitHub, LinkedIn, and email alerts.

## Frontend env

Create a `.env` with:

```bash
VITE_SITE_URL=http://localhost:8080
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_TWITTER_SCRAPE_URL=...
VITE_GITHUB_SCAN_URL=...
```

## Backend env

The X/Twitter collector supports two providers:

- `tweetapi`: preferred API-based integration
- `scraper`: existing browser-based scraper kept as fallback

Recommended minimal backend config:

```bash
SUPABASE_URL=...
SUPABASE_KEY=...
TWITTER_PROVIDER=tweetapi
TWITTER_STATE_BACKEND=supabase
TWITTER_LOCAL_DB_PATH=backend/local_data/twitter_state.db
TWEETAPI_KEY=...
TWEETAPI_BASE_URL=https://api.tweetapi.com/tw-v2
TWEETAPI_PAGE_SIZE=100
TWEETAPI_MAX_PAGES=3
TWITTER_REQUEST_TIMEOUT_SECONDS=30
TWITTER_SNAPSHOT_MAX_ROWS=100
```

If your hosting or proxy already prefixes `/tw-v2`, set `TWEETAPI_BASE_URL=https://api.tweetapi.com` and the backend will normalize the final TweetAPI URL.
If you only want to keep a small X graph buffer in Supabase, lower `TWITTER_SNAPSHOT_MAX_ROWS`. Candidate-linked X follows are kept with priority when old snapshot rows are pruned. Set `TWITTER_SNAPSHOT_MAX_ROWS=0` for unlimited local snapshot storage.
For local Twitter/X testing, set `TWITTER_STATE_BACKEND=local`. That keeps `twitter_following_snapshots`, `twitter_vc_cursors`, and `twitter_vc_follows` in a local SQLite file under `TWITTER_LOCAL_DB_PATH` instead of writing them to Supabase.

Legacy scraper config remains available:

```bash
TWITTER_PROVIDER=scraper
TWITTER_USERNAME=...
TWITTER_PASSWORD=...
TWITTER_VERIFICATION=...
TWITTER_MAX_SCROLLS=60
```

## Local development

```bash
npm install
npm run dev
```

## Deployment shape

- Vercel deploys only the frontend.
- The X scan button calls an external backend URL from `VITE_TWITTER_SCRAPE_URL`.
- The GitHub scan button calls an external backend URL from `VITE_GITHUB_SCAN_URL`.
- Supabase is queried directly from the browser via the anon key.
- In `TWITTER_PROVIDER=auto`, the backend prefers TweetAPI when `TWEETAPI_KEY` is present and otherwise falls back to the legacy scraper.
