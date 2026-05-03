create extension if not exists pgcrypto;

create table if not exists candidates (
  id uuid primary key default gen_random_uuid(),
  name text,
  twitter_handle text unique,
  github_username text,
  linkedin_url text,
  added_at timestamptz default now(),
  is_active boolean default true
);

create table if not exists vcs (
  id uuid primary key default gen_random_uuid(),
  name text,
  twitter_handle text unique,
  linkedin_url text,
  tier int,
  added_at timestamptz default now()
);

create table if not exists twitter_following_snapshots (
  id uuid primary key default gen_random_uuid(),
  vc_id uuid references vcs(id) on delete cascade,
  followed_handle text,
  first_seen_at date,
  created_at timestamptz default now(),
  unique(vc_id, followed_handle)
);

create table if not exists twitter_vc_cursors (
  id uuid primary key default gen_random_uuid(),
  vc_id uuid references vcs(id) on delete cascade unique,
  last_known_handle text,
  last_run_at timestamptz default now()
);

create table if not exists twitter_vc_follows (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid references candidates(id) on delete cascade,
  vc_id uuid references vcs(id) on delete cascade,
  first_seen_at date,
  last_seen_at date,
  unique(candidate_id, vc_id)
);

create table if not exists github_repo_snapshots (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid references candidates(id) on delete cascade,
  repo_name text,
  stars int,
  forks int,
  star_delta_7d int,
  snapshot_date date,
  created_at timestamptz default now(),
  unique(candidate_id, repo_name, snapshot_date)
);

create table if not exists linkedin_signals (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid references candidates(id) on delete cascade,
  signal_type text,
  old_value text,
  new_value text,
  vc_id uuid references vcs(id) on delete set null,
  interaction_type text,
  detected_at timestamptz default now()
);

create table if not exists scores (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid references candidates(id) on delete cascade,
  score_date date,
  score_total int,
  score_github int,
  score_twitter int,
  score_linkedin int,
  breakdown jsonb,
  created_at timestamptz default now(),
  unique(candidate_id, score_date)
);

create table if not exists alerts (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid references candidates(id) on delete cascade,
  score_total int,
  trigger_reason text,
  sent_at timestamptz default now(),
  channel text
);

create table if not exists news_feed (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid references candidates(id) on delete cascade,
  event_type text,
  title text,
  detail jsonb,
  score_impact int,
  created_at timestamptz default now()
);
