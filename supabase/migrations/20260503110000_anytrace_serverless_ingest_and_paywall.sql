alter table public.profiles
  add column if not exists is_pro boolean not null default false;

create table if not exists public.x_snapshots (
  id uuid primary key default gen_random_uuid(),
  vc_source_id uuid references public.vc_sources(id) on delete cascade,
  vc_handle text not null,
  twitter_id text,
  following_ids jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default timezone('utc', now()),
  is_seed boolean not null default false
);

create index if not exists idx_x_snapshots_vc_source_id_fetched_at
  on public.x_snapshots (vc_source_id, fetched_at desc);

create table if not exists public.signals (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.tracked_people(id) on delete cascade,
  vc_id uuid references public.vc_sources(id) on delete set null,
  signal_type text not null check (signal_type in ('x_new_follow', 'github_viral_repo', 'linkedin_mention', 'high_confidence_crossref')),
  detected_at timestamptz not null default timezone('utc', now()),
  metadata jsonb not null default '{}'::jsonb,
  source_key text,
  is_seed boolean not null default false,
  unique (source_key)
);

create index if not exists idx_signals_person_detected_at
  on public.signals (person_id, detected_at desc);

create table if not exists public.github_repo_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_login text not null,
  repo_name text not null,
  repo_full_name text not null,
  repo_url text not null,
  stargazer_count integer not null default 0,
  observed_at timestamptz not null default timezone('utc', now()),
  is_seed boolean not null default false
);

create index if not exists idx_github_repo_snapshots_repo_time
  on public.github_repo_snapshots (repo_full_name, observed_at desc);

create table if not exists public.github_signals (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.tracked_people(id) on delete cascade,
  repo_url text not null,
  repo_full_name text not null,
  owner_login text not null,
  stars_count integer not null default 0,
  stars_delta integer not null default 0,
  detected_at timestamptz not null default timezone('utc', now()),
  metadata jsonb not null default '{}'::jsonb,
  source_key text,
  is_seed boolean not null default false,
  unique (source_key)
);

create index if not exists idx_github_signals_person_detected_at
  on public.github_signals (person_id, detected_at desc);

create table if not exists public.top_picks (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.tracked_people(id) on delete cascade,
  week_start date not null,
  rank integer not null,
  score integer not null,
  vc_follow_count integer not null default 0,
  has_viral_repo boolean not null default false,
  linkedin_mention_count integer not null default 0,
  evidence jsonb not null default '{}'::jsonb,
  is_seed boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (week_start, person_id),
  unique (week_start, rank)
);

create index if not exists idx_top_picks_week_rank
  on public.top_picks (week_start desc, rank asc);

drop trigger if exists top_picks_set_updated_at on public.top_picks;
create trigger top_picks_set_updated_at
before update on public.top_picks
for each row execute function public.set_updated_at();

create table if not exists public.person_media_backfill_jobs (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.tracked_people(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'failed')),
  attempts integer not null default 0,
  last_error text,
  requested_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (person_id, status)
);

create index if not exists idx_person_media_backfill_jobs_status_requested
  on public.person_media_backfill_jobs (status, requested_at asc);

drop trigger if exists person_media_backfill_jobs_set_updated_at on public.person_media_backfill_jobs;
create trigger person_media_backfill_jobs_set_updated_at
before update on public.person_media_backfill_jobs
for each row execute function public.set_updated_at();

alter table public.x_snapshots enable row level security;
alter table public.signals enable row level security;
alter table public.github_repo_snapshots enable row level security;
alter table public.github_signals enable row level security;
alter table public.top_picks enable row level security;
alter table public.person_media_backfill_jobs enable row level security;

create policy "Authenticated users can read x snapshots"
on public.x_snapshots
for select
to authenticated
using (true);

create policy "Authenticated users can read signals"
on public.signals
for select
to authenticated
using (true);

create policy "Authenticated users can read github signals"
on public.github_signals
for select
to authenticated
using (true);

create policy "Authenticated users can read github repo snapshots"
on public.github_repo_snapshots
for select
to authenticated
using (true);

create policy "Authenticated users can read top picks"
on public.top_picks
for select
to authenticated
using (true);
