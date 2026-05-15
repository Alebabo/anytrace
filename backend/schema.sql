create extension if not exists pgcrypto;

create table if not exists user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_sign_in_at timestamptz,
  is_active boolean default true
);

create or replace function sync_user_profile_from_auth()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.user_profiles (id, email, full_name, last_sign_in_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    now()
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.user_profiles.full_name),
    last_sign_in_at = now(),
    updated_at = now(),
    is_active = true;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_sync_profile on auth.users;
create trigger on_auth_user_created_sync_profile
after insert on auth.users
for each row execute procedure sync_user_profile_from_auth();

alter table user_profiles enable row level security;

create table if not exists candidates (
  id uuid primary key default gen_random_uuid(),
  name text,
  twitter_handle text unique,
  github_username text,
  linkedin_url text,
  added_at timestamptz default now(),
  is_active boolean default true
);

create table if not exists tracked_git_people (
  id uuid primary key default gen_random_uuid(),
  name text,
  github_username text unique,
  twitter_handle text,
  linkedin_url text,
  role_title text,
  company text,
  location text,
  summary text,
  added_at timestamptz default now(),
  is_active boolean default true
);

create table if not exists person_identities (
  id uuid primary key default gen_random_uuid(),
  tracked_person_id uuid references tracked_git_people(id) on delete cascade,
  candidate_id uuid references candidates(id) on delete cascade,
  platform text not null,
  handle text not null,
  profile_url text not null,
  is_primary boolean default false,
  match_confidence numeric(5,2) default 1.0,
  match_source text default 'manual',
  created_at timestamptz default now()
);

create unique index if not exists person_identities_unique_platform_handle
  on person_identities (platform, lower(handle));

create table if not exists identity_match_candidates (
  id uuid primary key default gen_random_uuid(),
  tracked_person_id uuid references tracked_git_people(id) on delete cascade,
  candidate_id uuid references candidates(id) on delete cascade,
  confidence numeric(5,2) not null,
  reasons jsonb default '[]'::jsonb,
  status text default 'suggested',
  created_at timestamptz default now(),
  unique (tracked_person_id, candidate_id)
);

create table if not exists vcs (
  id uuid primary key default gen_random_uuid(),
  name text,
  twitter_handle text unique,
  linkedin_url text,
  tier int,
  added_at timestamptz default now()
);

create table if not exists vc_clusters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

create table if not exists vc_cluster_members (
  id uuid primary key default gen_random_uuid(),
  cluster_id uuid not null references vc_clusters(id) on delete cascade,
  vc_id uuid not null references vcs(id) on delete cascade unique,
  account_type text not null default 'firm',
  is_primary boolean default false,
  confidence numeric(5,2) default 1.0,
  source text default 'manual',
  created_at timestamptz default now(),
  unique (cluster_id, vc_id)
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

create table if not exists tracked_person_twitter_cursors (
  id uuid primary key default gen_random_uuid(),
  tracked_person_id uuid references tracked_git_people(id) on delete cascade unique,
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

create table if not exists discovered_people (
  id text primary key,
  x_handle text not null unique,
  display_name text,
  primary_profile_url text not null,
  github_url text,
  linkedin_url text,
  first_seen_at timestamptz default now(),
  last_seen_at timestamptz default now(),
  created_at timestamptz default now()
);

create table if not exists seed_follow_observations (
  id uuid primary key default gen_random_uuid(),
  seed_vc_id uuid references vcs(id) on delete cascade,
  discovered_person_id text references discovered_people(id) on delete cascade,
  followed_handle text not null,
  first_seen_at timestamptz default now(),
  last_seen_at timestamptz default now(),
  created_at timestamptz default now(),
  unique(seed_vc_id, discovered_person_id)
);

create table if not exists seed_follow_alert_events (
  id text primary key,
  discovered_person_id text references discovered_people(id) on delete cascade unique,
  triggered_at timestamptz default now(),
  triggering_seed_accounts jsonb default '[]'::jsonb,
  trigger_threshold int default 3,
  status text default 'new',
  promoted_vc_id uuid references vcs(id) on delete set null,
  promoted_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists app_settings (
  key text primary key,
  value text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists linkedin_enrichment_events (
  id text primary key,
  discovered_person_id text references discovered_people(id) on delete cascade,
  linkedin_url text,
  headline text,
  role_title text,
  company text,
  location text,
  source text default 'linkedin_native_scraper',
  raw_payload jsonb default '{}'::jsonb,
  observed_at timestamptz default now(),
  created_at timestamptz default now()
);
create index if not exists linkedin_enrichment_person_idx on linkedin_enrichment_events(discovered_person_id, observed_at desc);

create table if not exists tracked_person_twitter_following_snapshots (
  id uuid primary key default gen_random_uuid(),
  tracked_person_id uuid references tracked_git_people(id) on delete cascade,
  followed_handle text,
  first_seen_at date,
  created_at timestamptz default now(),
  unique(tracked_person_id, followed_handle)
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

create table if not exists github_follow_relationships (
  id uuid primary key default gen_random_uuid(),
  follower_tracked_person_id uuid references tracked_git_people(id) on delete cascade,
  followed_tracked_person_id uuid references tracked_git_people(id) on delete cascade,
  first_seen_at timestamptz default now(),
  last_seen_at timestamptz default now(),
  created_at timestamptz default now(),
  source_url text,
  unique(follower_tracked_person_id, followed_tracked_person_id),
  check (follower_tracked_person_id is distinct from followed_tracked_person_id)
);

create table if not exists github_observed_people (
  id uuid primary key default gen_random_uuid(),
  source_tracked_person_id uuid references tracked_git_people(id) on delete cascade,
  relationship_type text not null,
  github_username text not null,
  name text,
  profile_url text,
  avatar_url text,
  bio text,
  company text,
  location text,
  blog_url text,
  twitter_handle text,
  followers_count int default 0,
  following_count int default 0,
  public_repos_count int default 0,
  indicator_count int default 0,
  indicators jsonb default '[]'::jsonb,
  can_add_to_watchlist boolean default false,
  added_to_watchlist boolean default false,
  first_seen_at timestamptz default now(),
  last_seen_at timestamptz default now(),
  created_at timestamptz default now()
);

create unique index if not exists github_observed_people_source_username_relationship_unique
  on github_observed_people (source_tracked_person_id, github_username, relationship_type);

create table if not exists github_viral_repo_snapshots (
  id uuid primary key default gen_random_uuid(),
  repo_owner text not null,
  repo_name text not null,
  repo_description text,
  repo_url text,
  owner_display_name text,
  owner_avatar_url text,
  owner_profile_url text,
  language text,
  stars int default 0,
  forks int default 0,
  watchers int default 0,
  open_issues int default 0,
  star_delta_7d int default 0,
  star_delta_30d int default 0,
  pushed_at timestamptz,
  snapshot_date date not null,
  created_at timestamptz default now(),
  unique(repo_owner, repo_name, snapshot_date)
);

create table if not exists github_viral_repo_events (
  id uuid primary key default gen_random_uuid(),
  repo_owner text not null,
  repo_name text not null,
  repo_description text,
  repo_url text,
  owner_display_name text,
  owner_avatar_url text,
  owner_profile_url text,
  language text,
  event_type text not null,
  title text,
  detail jsonb default '{}'::jsonb,
  stars int default 0,
  forks int default 0,
  watchers int default 0,
  open_issues int default 0,
  star_delta_7d int default 0,
  star_delta_30d int default 0,
  detected_at timestamptz default now(),
  created_at timestamptz default now()
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

create table if not exists triage_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null,
  threshold int not null default 3,
  provider text not null default 'featherless',
  model text,
  candidate_count int default 0,
  qualified_count int default 0,
  error text,
  payload jsonb default '{}'::jsonb,
  started_at timestamptz default now(),
  completed_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists triage_runs_created_at_idx on triage_runs(created_at desc);

drop policy if exists "users can read own profile" on user_profiles;
create policy "users can read own profile"
  on user_profiles
  for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "users can update own profile" on user_profiles;
create policy "users can update own profile"
  on user_profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);
