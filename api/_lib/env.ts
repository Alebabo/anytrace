export const env = {
  supabaseUrl:
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.VITE_SUPABASE_URL ??
    process.env.SUPABASE_URL ??
    "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  twitterApiKey: process.env.TWITTERAPI_IO_KEY ?? "",
  githubToken: process.env.GITHUB_TOKEN ?? "",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  cronSecret: process.env.CRON_SECRET ?? "",
  siteUrl:
    process.env.VITE_SITE_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_VERCEL_URL ??
    "",
  xMinIntervalMs: Number(process.env.TWITTERAPI_IO_MIN_INTERVAL_MS ?? "5500"),
  xFollowingPageSize: Math.min(200, Math.max(20, Number(process.env.X_FOLLOWINGS_PAGE_SIZE ?? "100"))),
  xMaxPagesPerSync: Math.max(1, Number(process.env.X_MAX_FOLLOWING_PAGES_PER_SYNC ?? "3")),
  xMaxVcsPerSync: Math.max(1, Number(process.env.X_MAX_VCS_PER_SYNC ?? "25")),
  githubSearchResultLimit: Math.max(1, Number(process.env.GITHUB_SEARCH_RESULT_LIMIT ?? "30")),
  githubViralStarDeltaThreshold: Math.max(1, Number(process.env.GITHUB_VIRAL_STAR_DELTA_THRESHOLD ?? "100")),
  stripeProPriceUsd: Math.max(1, Number(process.env.STRIPE_PRO_PRICE_USD ?? "19")),
};

export function requireEnv(
  name:
    | "supabaseUrl"
    | "supabaseServiceRoleKey"
    | "twitterApiKey"
    | "githubToken"
    | "stripeSecretKey"
    | "stripeWebhookSecret",
) {
  const value = env[name];
  if (value === "" || value === null || value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
