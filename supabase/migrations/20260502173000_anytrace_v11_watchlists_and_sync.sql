create table public.user_vc_watchlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  vc_source_id uuid not null references public.vc_sources(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, vc_source_id)
);

alter table public.vc_sources
  add column if not exists created_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists x_user_id text,
  add column if not exists sync_status text not null default 'idle',
  add column if not exists last_x_sync_at timestamptz,
  add column if not exists last_github_sync_at timestamptz,
  add column if not exists last_sync_error text;

alter table public.vc_sources
  drop constraint if exists vc_sources_sync_status_check;

alter table public.vc_sources
  add constraint vc_sources_sync_status_check
  check (sync_status in ('idle', 'pending', 'ok', 'error'));

create unique index if not exists idx_vc_sources_x_user_id
  on public.vc_sources (x_user_id)
  where x_user_id is not null;

alter table public.activity_events
  add column if not exists event_fingerprint text;

create unique index if not exists idx_activity_events_event_fingerprint
  on public.activity_events (event_fingerprint)
  where event_fingerprint is not null;

alter table public.activity_events
  drop constraint if exists activity_events_event_type_check;

alter table public.activity_events
  add constraint activity_events_event_type_check
  check (event_type in ('vc_follow', 'repo_traction', 'big_tech_exit', 'launch', 'mention', 'important_github_follower'));

alter table public.weekly_pick_reasons
  drop constraint if exists weekly_pick_reasons_reason_kind_check;

alter table public.weekly_pick_reasons
  add constraint weekly_pick_reasons_reason_kind_check
  check (reason_kind in ('vc_follow_burst', 'repo_traction', 'big_tech_exit', 'important_github_followers'));

create table public.vc_x_follow_observations (
  id uuid primary key default gen_random_uuid(),
  vc_source_id uuid not null references public.vc_sources(id) on delete cascade,
  followed_x_user_id text not null,
  followed_handle text not null,
  followed_name text not null,
  person_id uuid references public.tracked_people(id) on delete set null,
  first_seen_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now()),
  unique (vc_source_id, followed_x_user_id)
);

create table public.person_github_follower_observations (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.tracked_people(id) on delete cascade,
  follower_login text not null,
  follower_github_id bigint,
  importance_score integer not null default 0,
  first_seen_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now()),
  unique (person_id, follower_login)
);

create table public.github_repo_observations (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.tracked_people(id) on delete cascade,
  repo_full_name text not null,
  repo_name text not null,
  repo_url text not null,
  stargazer_count integer not null default 0,
  release_count integer not null default 0,
  observed_at timestamptz not null default timezone('utc', now()),
  unique (person_id, repo_full_name)
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1), 'Member')
  )
  on conflict (id) do update
    set email = excluded.email;

  insert into public.subscriptions (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.user_vc_watchlist_items (user_id, vc_source_id)
  select new.id, vc.id
  from public.vc_sources vc
  where vc.is_seeded = true
  on conflict (user_id, vc_source_id) do nothing;

  return new;
end;
$$;

alter table public.user_vc_watchlist_items enable row level security;

create policy "Users can read own vc watchlist"
on public.user_vc_watchlist_items
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert own vc watchlist"
on public.user_vc_watchlist_items
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can delete own vc watchlist"
on public.user_vc_watchlist_items
for delete
to authenticated
using (auth.uid() = user_id);

create policy "Users can create own vc sources"
on public.vc_sources
for insert
to authenticated
with check (auth.uid() = created_by_user_id);

create policy "Users can update own vc sources"
on public.vc_sources
for update
to authenticated
using (auth.uid() = created_by_user_id)
with check (auth.uid() = created_by_user_id);

insert into public.user_vc_watchlist_items (user_id, vc_source_id)
select u.id, vc.id
from auth.users u
cross join public.vc_sources vc
where vc.is_seeded = true
on conflict (user_id, vc_source_id) do nothing;
